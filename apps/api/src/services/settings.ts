/**
 * User Settings Service
 * Stores per-user AI configuration with encrypted API keys (PostgreSQL)
 */

import { query } from '../lib/db.js';
import { encrypt, decrypt, maskApiKey } from '../lib/crypto.js';

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
  apiKeyMasked?: string;
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

/**
 * Get AI settings for a user
 */
export async function getAISettings(userId: number): Promise<AISettings> {
  const result = await query(
    'SELECT * FROM fg_user_settings WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return { ...DEFAULT_SETTINGS };
  }

  const row = result.rows[0];
  return {
    provider: row.provider,
    apiKey: row.api_key_encrypted || undefined,
    baseUrl: row.base_url || undefined,
    model: row.model || undefined,
    enableSummary: true,
    enableTranslation: true,
    updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
  };
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
  const current = await getAISettings(userId);

  // Encrypt API key if provided
  let encryptedApiKey = current.apiKey;
  if (updates.apiKey !== undefined) {
    encryptedApiKey = updates.apiKey ? encrypt(updates.apiKey) : undefined;
  }

  const provider = updates.provider || current.provider;
  const baseUrl = updates.baseUrl !== undefined ? updates.baseUrl : current.baseUrl;
  const model = updates.model !== undefined ? updates.model : current.model;

  await query(
    `INSERT INTO fg_user_settings (user_id, provider, api_key_encrypted, base_url, model, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       provider = $2, api_key_encrypted = $3, base_url = $4, model = $5, updated_at = NOW()`,
    [userId, provider, encryptedApiKey || null, baseUrl || null, model || null]
  );

  return {
    ...current,
    ...updates,
    apiKey: encryptedApiKey,
    updatedAt: new Date().toISOString(),
  };
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
    const { generateText } = await import('ai');
    const { createOpenAI } = await import('@ai-sdk/openai');

    const effectiveBaseUrl = baseUrl || DEFAULT_BASE_URLS[provider];
    const effectiveModel = model || DEFAULT_MODELS[provider];

    let aiModel;

    if (provider === 'anthropic') {
      const { anthropic } = await import('@ai-sdk/anthropic');
      const originalKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) process.env.ANTHROPIC_API_KEY = apiKey;
      aiModel = anthropic(effectiveModel);
      if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
      else delete process.env.ANTHROPIC_API_KEY;
    } else {
      const openai = createOpenAI({
        baseURL: effectiveBaseUrl,
        apiKey: apiKey || 'ollama',
      });
      aiModel = openai(effectiveModel);
    }

    await generateText({
      model: aiModel,
      prompt: 'Say "OK" in one word.',
      maxTokens: 5,
      abortSignal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      message: `Connected successfully (${latencyMs}ms)`,
      latencyMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

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
