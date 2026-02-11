/**
 * Settings API Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import {
  getAISettingsForResponse,
  updateAISettings,
  testAIConnection,
  DEFAULT_MODELS,
  DEFAULT_BASE_URLS,
  type AIProvider,
} from '../services/settings.js';
import {
  getReadingPreferences,
  updateReadingPreferences,
} from '../services/reading.js';
import {
  getPlatformCredentialsForResponse,
  savePlatformCredentials,
  restartRSSHub,
  testPlatformConnection,
} from '../services/platform-credentials.js';
import {
  checkTwitterTokenHealth,
  refreshTwitterToken,
  getRefreshHistory,
  generateTOTP,
} from '../services/twitter-token-refresh.js';

const settings = new Hono();

// Apply auth middleware to all settings routes
settings.use('/*', authMiddleware);

// Get all settings (combined AI + reading)
settings.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const userId = user.userId;
  
  const aiSettings = await getAISettingsForResponse(userId);
  const readingPrefs = await getReadingPreferences(userId);
  
  return c.json({
    ai: {
      ...aiSettings,
      availableProviders: [
        { id: 'openai', name: 'OpenAI', needsApiKey: true, needsBaseUrl: false },
        { id: 'anthropic', name: 'Anthropic Claude', needsApiKey: true, needsBaseUrl: false },
        { id: 'deepseek', name: 'DeepSeek', needsApiKey: true, needsBaseUrl: false },
        { id: 'ollama', name: 'Ollama (Local)', needsApiKey: false, needsBaseUrl: true },
        { id: 'custom', name: 'Custom (OpenAI Compatible)', needsApiKey: true, needsBaseUrl: true },
      ],
      defaultModels: DEFAULT_MODELS,
      defaultBaseUrls: DEFAULT_BASE_URLS,
    },
    reading: readingPrefs,
  });
});

// Get AI settings
settings.get('/ai', async (c) => {
  // Get user from JWT (set by auth middleware)
  const user = c.get('user') as JWTPayload;
  const userId = user.userId;
  
  const aiSettings = await getAISettingsForResponse(userId);
  
  return c.json({
    ...aiSettings,
    availableProviders: [
      { id: 'openai', name: 'OpenAI', needsApiKey: true, needsBaseUrl: false },
      { id: 'anthropic', name: 'Anthropic Claude', needsApiKey: true, needsBaseUrl: false },
      { id: 'deepseek', name: 'DeepSeek', needsApiKey: true, needsBaseUrl: false },
      { id: 'ollama', name: 'Ollama (Local)', needsApiKey: false, needsBaseUrl: true },
      { id: 'custom', name: 'Custom (OpenAI Compatible)', needsApiKey: true, needsBaseUrl: true },
    ],
    defaultModels: DEFAULT_MODELS,
    defaultBaseUrls: DEFAULT_BASE_URLS,
  });
});

// Update AI settings
const updateAISchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'deepseek', 'ollama', 'custom']).optional(),
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional(), // Set to true to remove API key
  baseUrl: z.string().url().optional().or(z.literal('')),
  model: z.string().optional(),
  enableSummary: z.boolean().optional(),
  enableTranslation: z.boolean().optional(),
});

settings.put('/ai', zValidator('json', updateAISchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const userId = user.userId;
  
  const body = c.req.valid('json');
  
  // Handle clear API key
  const updates: Record<string, unknown> = { ...body };
  if (body.clearApiKey) {
    updates.apiKey = undefined;
    delete updates.clearApiKey;
  }
  
  // Clean up empty strings
  if (updates.baseUrl === '') {
    updates.baseUrl = undefined;
  }
  if (updates.model === '') {
    updates.model = undefined;
  }
  
  await updateAISettings(userId, updates as Parameters<typeof updateAISettings>[1]);
  
  // Return updated settings (masked) with all metadata
  const aiSettings = await getAISettingsForResponse(userId);
  
  return c.json({
    success: true,
    settings: {
      ...aiSettings,
      availableProviders: [
        { id: 'openai', name: 'OpenAI', needsApiKey: true, needsBaseUrl: false },
        { id: 'anthropic', name: 'Anthropic Claude', needsApiKey: true, needsBaseUrl: false },
        { id: 'deepseek', name: 'DeepSeek', needsApiKey: true, needsBaseUrl: false },
        { id: 'ollama', name: 'Ollama (Local)', needsApiKey: false, needsBaseUrl: true },
        { id: 'custom', name: 'Custom (OpenAI Compatible)', needsApiKey: true, needsBaseUrl: true },
      ],
      defaultModels: DEFAULT_MODELS,
      defaultBaseUrls: DEFAULT_BASE_URLS,
    },
  });
});

// Test AI connection
const testAISchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'deepseek', 'ollama', 'custom']),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
});

settings.post('/ai/test', zValidator('json', testAISchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const { provider, apiKey, baseUrl, model } = c.req.valid('json');
  
  // If no API key provided, try to get the stored one for this provider
  let effectiveApiKey = apiKey;
  if (!effectiveApiKey && provider !== 'ollama') {
    const { getDecryptedApiKeyForProvider } = await import('../services/settings.js');
    effectiveApiKey = await getDecryptedApiKeyForProvider(user.userId, provider as AIProvider);
  }
  
  const result = await testAIConnection(
    provider as AIProvider,
    effectiveApiKey,
    baseUrl,
    model
  );
  
  return c.json(result);
});

// ============ Reading Preferences ============

// Get reading preferences
settings.get('/reading', async (c) => {
  const user = c.get('user') as JWTPayload;
  const preferences = await getReadingPreferences(user.userId);
  return c.json(preferences);
});

// Update reading preferences
const readingPrefsSchema = z.object({
  fontSize: z.number().min(14).max(24).optional(),
  fontFamily: z.enum(['sans', 'serif', 'mono']).optional(),
  lineHeight: z.number().min(1.4).max(2.0).optional(),
  contentWidth: z.enum(['narrow', 'medium', 'wide']).optional(),
  theme: z.enum(['light', 'dark', 'sepia', 'system']).optional(),
  autoMarkRead: z.boolean().optional(),
  showImages: z.boolean().optional(),
  showReadingTime: z.boolean().optional(),
});

settings.put('/reading', zValidator('json', readingPrefsSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const updates = c.req.valid('json');
  
  const preferences = await updateReadingPreferences(user.userId, updates);
  
  return c.json({
    success: true,
    preferences,
  });
});

// ============ Polling Defaults ============

// Get polling defaults by feed type
settings.get('/polling', async (c) => {
  const user = c.get('user') as JWTPayload;
  const result = await import('../lib/db.js').then(m => m.query(
    'SELECT polling_defaults FROM fg_user_settings WHERE user_id = $1',
    [user.userId]
  ));
  const defaults = result.rows[0]?.polling_defaults || {
    article: 60, social: 10, picture: 60, video: 120, notification: 30
  };
  return c.json(defaults);
});

// Update polling defaults
const pollingDefaultsSchema = z.object({
  article: z.number().min(5).max(1440).optional(),
  social: z.number().min(5).max(1440).optional(),
  picture: z.number().min(5).max(1440).optional(),
  video: z.number().min(5).max(1440).optional(),
  notification: z.number().min(5).max(1440).optional(),
});

settings.put('/polling', zValidator('json', pollingDefaultsSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const updates = c.req.valid('json');
  
  const { query: dbQuery } = await import('../lib/db.js');
  
  // Merge with existing defaults
  const existing = await dbQuery(
    'SELECT polling_defaults FROM fg_user_settings WHERE user_id = $1',
    [user.userId]
  );
  const current = existing.rows[0]?.polling_defaults || {
    article: 60, social: 10, picture: 60, video: 120, notification: 30
  };
  const merged = { ...current, ...updates };
  
  await dbQuery(
    'UPDATE fg_user_settings SET polling_defaults = $1, updated_at = NOW() WHERE user_id = $2',
    [JSON.stringify(merged), user.userId]
  );
  
  // Apply to all feeds that haven't been individually customized
  // (feeds still at old default get updated to new default)
  for (const [type, freq] of Object.entries(updates)) {
    const oldDefault = current[type] || 60;
    await dbQuery(
      `UPDATE fg_feeds SET polling_frequency = $1 
       WHERE user_id = $2 AND feed_type = $3 AND polling_frequency = $4`,
      [freq, user.userId, type, oldDefault]
    );
  }
  
  return c.json({ success: true, defaults: merged });
});

// ============ Platform Credentials ============

// Get platform credentials (masked)
settings.get('/platform', async (c) => {
  const user = c.get('user') as JWTPayload;
  const credentials = await getPlatformCredentialsForResponse(user.userId);
  return c.json(credentials);
});

// Update platform credentials
const platformCredentialsSchema = z.object({
  twitter: z.object({
    authToken: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    authSecret: z.string().optional(),
    phoneOrEmail: z.string().optional(),
    proxy: z.string().optional(),
  }).optional(),
});

settings.put('/platform', zValidator('json', platformCredentialsSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const body = c.req.valid('json');

  // Save credentials
  await savePlatformCredentials(user.userId, body);

  // If we have username+password+2FA but no fresh authToken in this request,
  // use Playwright to login and get a fresh authToken automatically
  let playwrightResult: { success: boolean; message: string } | null = null;
  const hasLoginCreds = body.twitter?.username || body.twitter?.password;
  const hasDirectToken = body.twitter?.authToken;
  
  if (hasLoginCreds && !hasDirectToken) {
    try {
      const refreshResult = await refreshTwitterToken(user.userId);
      playwrightResult = { success: refreshResult.success, message: refreshResult.message };
      
      if (refreshResult.success) {
        // Token was saved and RSSHub restarted by refreshTwitterToken
        // Wait for RSSHub to be ready then test
        await new Promise(resolve => setTimeout(resolve, 8000));
        const testResult = await testPlatformConnection('twitter', user.userId);
        const credentials = await getPlatformCredentialsForResponse(user.userId);
        
        return c.json({
          success: true,
          credentials,
          rsshub: { success: true, message: 'Playwright 自动登录成功，RSSHub 已重启' },
          test: testResult,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      playwrightResult = { success: false, message: `自动登录失败: ${msg}` };
    }
  }

  // Fallback: restart RSSHub with whatever credentials we have
  const restartResult = await restartRSSHub(user.userId);

  // Auto-test after restart (wait for RSSHub to be ready)
  let testResult: { success: boolean; message: string } | null = null;
  if (restartResult.success) {
    // Wait for RSSHub to start
    await new Promise(resolve => setTimeout(resolve, 8000));
    testResult = await testPlatformConnection('twitter', user.userId);
  }

  // If Playwright failed, append that info to the test result
  if (playwrightResult && !playwrightResult.success && testResult) {
    testResult.message = `${testResult.message}\n⚠️ 自动登录: ${playwrightResult.message}`;
  }

  // Return updated credentials (masked) with restart + test status
  const credentials = await getPlatformCredentialsForResponse(user.userId);

  return c.json({
    success: true,
    credentials,
    rsshub: restartResult,
    test: testResult,
  });
});

// Test platform connection
const testPlatformSchema = z.object({
  platform: z.string(),
});

settings.post('/platform/test', zValidator('json', testPlatformSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const { platform } = c.req.valid('json');

  const result = await testPlatformConnection(platform, user.userId);
  return c.json(result);
});

// ============ Twitter Token Auto-Refresh ============

// Check Twitter token health
settings.get('/platform/twitter/health', async (c) => {
  const health = await checkTwitterTokenHealth();
  return c.json(health);
});

// Manually trigger token refresh
settings.post('/platform/twitter/refresh', async (c) => {
  const user = c.get('user') as JWTPayload;
  const result = await refreshTwitterToken(user.userId);
  return c.json(result);
});

// Get refresh history
settings.get('/platform/twitter/refresh-history', async (c) => {
  const user = c.get('user') as JWTPayload;
  const history = await getRefreshHistory(user.userId);
  return c.json({ history });
});

// Verify TOTP secret is valid (generate a test code)
settings.post('/platform/twitter/verify-totp', async (c) => {
  const user = c.get('user') as JWTPayload;
  const body = await c.req.json();
  const { secret } = body;
  
  if (!secret) {
    return c.json({ success: false, message: '请提供 TOTP Secret' }, 400);
  }
  
  try {
    const code = generateTOTP(secret);
    return c.json({ 
      success: true, 
      message: `✅ TOTP 密钥有效，当前验证码: ${code}`,
      code 
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, message: `❌ TOTP 密钥无效: ${msg}` }, 400);
  }
});

// ============ Custom CSS ============

// Get custom CSS
settings.get('/custom-css', async (c) => {
  const user = c.get('user') as JWTPayload;
  const { query: dbQuery } = await import('../lib/db.js');
  
  // Ensure column exists
  await dbQuery(`ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS custom_css TEXT DEFAULT ''`);
  
  const result = await dbQuery(
    'SELECT custom_css FROM fg_user_settings WHERE user_id = $1',
    [user.userId]
  );
  
  return c.json({ css: result.rows[0]?.custom_css || '' });
});

// Update custom CSS
const customCssSchema = z.object({
  css: z.string().max(50000),
});

settings.put('/custom-css', zValidator('json', customCssSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const { css } = c.req.valid('json');
  const { query: dbQuery } = await import('../lib/db.js');
  
  // Ensure column exists
  await dbQuery(`ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS custom_css TEXT DEFAULT ''`);
  
  await dbQuery(
    'UPDATE fg_user_settings SET custom_css = $1, updated_at = NOW() WHERE user_id = $2',
    [css, user.userId]
  );
  
  return c.json({ success: true, css });
});

export default settings;
