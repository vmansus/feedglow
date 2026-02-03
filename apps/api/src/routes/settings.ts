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

const settings = new Hono();

// Apply auth middleware to all settings routes
settings.use('/*', authMiddleware);

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
  
  // Return updated settings (masked)
  const aiSettings = await getAISettingsForResponse(userId);
  
  return c.json({
    success: true,
    settings: aiSettings,
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
  const { provider, apiKey, baseUrl, model } = c.req.valid('json');
  
  const result = await testAIConnection(
    provider as AIProvider,
    apiKey,
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

export default settings;
