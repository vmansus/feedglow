/**
 * User Settings Service
 * Stores per-user AI configuration with encrypted API keys
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { encrypt, decrypt, maskApiKey } from '../lib/crypto.js';

// Settings directory (configurable via env)
const SETTINGS_DIR = process.env.SETTINGS_DIR || join(process.cwd(), 'data', 'settings');

export type AIProvider = 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'custom';

export interface AISettings {
  provider: AIProvider;
  apiKey?: string;        // Encrypted when stored
  baseUrl?: string;
  model?: string;
  enableSummary: boolean;
  enableTranslation: boolean;
  updatedAt: string;
}

export interface AISettingsResponse {
  provider: AIProvider;
  apiKeyMasked?: string;  // Masked for display
  hasApiKey: boolean;
  baseUrl?: string;
  model?: string;
  enableSummary: boolean;
  enableTranslation: boolean;
  updatedAt: string;
}

// Default settings
const DEFAULT_SETTINGS: AISettings = {
  provider: 'openai',
  enableSummary: true,
  enableTranslation: true,
  updatedAt: new Date().toISOString(),
};

// Default models per provider
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  deepseek: 'deepseek-chat',
  ollama: 'llama3.2',
  custom: 'gpt-4o-mini',
};

// Default base URLs
export const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
  custom: '',
};

function getSettingsPath(userId: number): string {
  return join(SETTINGS_DIR, `${userId}.json`);
}

/**
 * Ensure settings directory exists
 */
async function ensureSettingsDir(): Promise<void> {
  if (!existsSync(SETTINGS_DIR)) {
    await mkdir(SETTINGS_DIR, { recursive: true });
  }
}

/**
 * Get AI settings for a user
 */
export async function getAISettings(userId: number): Promise<AISettings> {
  await ensureSettingsDir();
  const path = getSettingsPath(userId);
  
  try {
    const data = await readFile(path, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Return defaults if file doesn't exist
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Get AI settings for response (with masked API key)
 */
export async function getAISettingsForResponse(userId: number): Promise<AISettingsResponse> {
  const settings = await getAISettings(userId);
  
  let apiKeyMasked: string | undefined;
  if (settings.apiKey) {
    try {
      const decrypted = decrypt(settings.apiKey);
      apiKeyMasked = maskApiKey(decrypted);
    } catch {
      apiKeyMasked = '••••••••';
    }
  }
  
  return {
    provider: settings.provider,
    apiKeyMasked,
    hasApiKey: !!settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    enableSummary: settings.enableSummary,
    enableTranslation: settings.enableTranslation,
    updatedAt: settings.updatedAt,
  };
}

/**
 * Update AI settings for a user
 */
export async function updateAISettings(
  userId: number,
  updates: Partial<Omit<AISettings, 'updatedAt'>>
): Promise<AISettings> {
  await ensureSettingsDir();
  
  const current = await getAISettings(userId);
  
  // Encrypt API key if provided
  let encryptedApiKey = current.apiKey;
  if (updates.apiKey !== undefined) {
    encryptedApiKey = updates.apiKey ? encrypt(updates.apiKey) : undefined;
  }
  
  const newSettings: AISettings = {
    ...current,
    ...updates,
    apiKey: encryptedApiKey,
    updatedAt: new Date().toISOString(),
  };
  
  const path = getSettingsPath(userId);
  await writeFile(path, JSON.stringify(newSettings, null, 2));
  
  return newSettings;
}

/**
 * Get decrypted API key for a user (for actual API calls)
 */
export async function getDecryptedApiKey(userId: number): Promise<string | undefined> {
  const settings = await getAISettings(userId);
  
  if (!settings.apiKey) {
    return undefined;
  }
  
  try {
    return decrypt(settings.apiKey);
  } catch {
    return undefined;
  }
}

/**
 * Test AI connection with current settings
 */
export async function testAIConnection(
  provider: AIProvider,
  apiKey?: string,
  baseUrl?: string,
  model?: string
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const startTime = Date.now();
  
  try {
    // Import AI SDK dynamically
    const { generateText } = await import('ai');
    const { createOpenAI } = await import('@ai-sdk/openai');
    
    // Determine base URL
    const effectiveBaseUrl = baseUrl || DEFAULT_BASE_URLS[provider];
    const effectiveModel = model || DEFAULT_MODELS[provider];
    
    // Create provider instance
    let aiModel;
    
    if (provider === 'anthropic') {
      // For Anthropic, use the anthropic SDK
      const { anthropic } = await import('@ai-sdk/anthropic');
      // Set API key via env temporarily
      const originalKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) process.env.ANTHROPIC_API_KEY = apiKey;
      aiModel = anthropic(effectiveModel);
      // Restore
      if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
      else delete process.env.ANTHROPIC_API_KEY;
    } else {
      // For OpenAI-compatible APIs (OpenAI, DeepSeek, Ollama, Custom)
      const openai = createOpenAI({
        baseURL: effectiveBaseUrl,
        apiKey: apiKey || 'ollama', // Ollama doesn't need real key
      });
      aiModel = openai(effectiveModel);
    }
    
    // Simple test request
    await generateText({
      model: aiModel,
      prompt: 'Say "OK" in one word.',
      maxTokens: 5,
      abortSignal: AbortSignal.timeout(10000), // 10s timeout
    });
    
    const latencyMs = Date.now() - startTime;
    
    return {
      success: true,
      message: `Connected successfully (${latencyMs}ms)`,
      latencyMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Parse common errors
    if (message.includes('401') || message.includes('Unauthorized')) {
      return { success: false, message: 'Invalid API key' };
    }
    if (message.includes('404')) {
      return { success: false, message: 'Model not found or invalid base URL' };
    }
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return { success: false, message: 'Connection timeout - check base URL' };
    }
    if (message.includes('ECONNREFUSED')) {
      return { success: false, message: 'Connection refused - is the server running?' };
    }
    
    return { success: false, message };
  }
}
