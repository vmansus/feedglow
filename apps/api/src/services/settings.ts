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

// Per-provider API keys stored as JSON: { openai: "encrypted...", deepseek: "encrypted...", ... }
type ApiKeysJson = Partial<Record<AIProvider, string>>;

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
  const provider = row.provider as AIProvider;
  
  // Get API key for current provider from JSON, fallback to legacy field
  const apiKeysJson: ApiKeysJson = row.api_keys_json || {};
  const apiKey = apiKeysJson[provider] || row.api_key_encrypted || undefined;
  
  return {
    provider,
    apiKey,
    baseUrl: row.base_url || undefined,
    model: row.model || undefined,
    enableSummary: row.enable_summary ?? true,
    enableTranslation: row.enable_translation ?? true,
    updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Get API keys JSON for a user (internal)
 */
async function getApiKeysJson(userId: number): Promise<ApiKeysJson> {
  const result = await query(
    'SELECT api_keys_json, api_key_encrypted, provider FROM fg_user_settings WHERE user_id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) return {};
  
  const row = result.rows[0];
  const apiKeysJson: ApiKeysJson = row.api_keys_json || {};
  
  // Migrate legacy api_key_encrypted to the JSON field for current provider
  if (row.api_key_encrypted && !apiKeysJson[row.provider as AIProvider]) {
    apiKeysJson[row.provider as AIProvider] = row.api_key_encrypted;
  }
  
  return apiKeysJson;
}

/**
 * Get AI settings for response (with masked API key for current provider)
 */
export async function getAISettingsForResponse(userId: number): Promise<AISettingsResponse> {
  const result = await query(
    'SELECT * FROM fg_user_settings WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return {
      provider: DEFAULT_SETTINGS.provider,
      hasApiKey: false,
      enableSummary: DEFAULT_SETTINGS.enableSummary,
      enableTranslation: DEFAULT_SETTINGS.enableTranslation,
      updatedAt: new Date().toISOString(),
    };
  }

  const row = result.rows[0];
  const provider = row.provider as AIProvider;
  const apiKeysJson: ApiKeysJson = row.api_keys_json || {};
  
  // Get API key for CURRENT provider only
  const encryptedKey = apiKeysJson[provider];
  
  let apiKeyMasked: string | undefined;
  let hasApiKey = false;
  
  if (encryptedKey) {
    hasApiKey = true;
    try {
      const decrypted = decrypt(encryptedKey);
      apiKeyMasked = maskApiKey(decrypted);
    } catch {
      apiKeyMasked = '••••••••';
    }
  }

  return {
    provider,
    apiKeyMasked,
    hasApiKey,
    baseUrl: row.base_url || undefined,
    model: row.model || undefined,
    enableSummary: row.enable_summary ?? true,
    enableTranslation: row.enable_translation ?? true,
    updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Update AI settings for a user
 */
export async function updateAISettings(
  userId: number,
  updates: Partial<Omit<AISettings, 'updatedAt'>> & { clearApiKey?: boolean }
): Promise<AISettings> {
  const current = await getAISettings(userId);
  const apiKeysJson = await getApiKeysJson(userId);
  
  const provider = updates.provider || current.provider;
  const baseUrl = updates.baseUrl !== undefined ? updates.baseUrl : current.baseUrl;
  const model = updates.model !== undefined ? updates.model : current.model;
  const enableSummary = updates.enableSummary !== undefined ? updates.enableSummary : current.enableSummary;
  const enableTranslation = updates.enableTranslation !== undefined ? updates.enableTranslation : current.enableTranslation;

  // Handle API key update for current provider
  if (updates.clearApiKey) {
    delete apiKeysJson[provider];
  } else if (updates.apiKey !== undefined && updates.apiKey) {
    apiKeysJson[provider] = encrypt(updates.apiKey);
  }

  await query(
    `INSERT INTO fg_user_settings (user_id, provider, api_keys_json, base_url, model, enable_summary, enable_translation, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       provider = $2, api_keys_json = $3, base_url = $4, model = $5, enable_summary = $6, enable_translation = $7, updated_at = NOW()`,
    [userId, provider, JSON.stringify(apiKeysJson), baseUrl || null, model || null, enableSummary, enableTranslation]
  );

  return {
    provider,
    apiKey: apiKeysJson[provider],
    baseUrl,
    model,
    enableSummary,
    enableTranslation,
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
 * Get decrypted API key for a specific provider
 */
export async function getDecryptedApiKeyForProvider(userId: number, provider: AIProvider): Promise<string | undefined> {
  const apiKeysJson = await getApiKeysJson(userId);
  const encryptedKey = apiKeysJson[provider];
  
  if (!encryptedKey) {
    return undefined;
  }
  
  try {
    return decrypt(encryptedKey);
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
      // For Ollama, use dummy key; for others, require real key
      const effectiveApiKey = provider === 'ollama' ? 'ollama' : apiKey;
      if (!effectiveApiKey && provider !== 'ollama') {
        return { success: false, message: 'API key is required for this provider' };
      }
      const openai = createOpenAI({
        baseURL: effectiveBaseUrl,
        apiKey: effectiveApiKey || 'ollama',
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
