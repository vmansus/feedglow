/**
 * Settings routes
 * User preferences and AI configuration
 */

import { Hono } from 'hono';
import { authMiddleware } from '../lib/auth.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const settings = new Hono();

// Settings are stored per-user in a JSON file
const DATA_DIR = process.env.DATA_DIR || './data';
const SETTINGS_DIR = join(DATA_DIR, 'settings');

// Ensure settings directory exists
if (!existsSync(SETTINGS_DIR)) {
  mkdirSync(SETTINGS_DIR, { recursive: true });
}

interface UserSettings {
  // AI settings
  ai: {
    provider: 'openai' | 'anthropic' | 'ollama' | 'deepseek';
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    summarizePrompt?: string;
    translateLanguage?: string;
  };
  // Display settings
  display: {
    theme: 'light' | 'dark' | 'system';
    fontSize: 'small' | 'medium' | 'large';
    showImages: boolean;
    compactList: boolean;
  };
  // Reading settings
  reading: {
    markAsReadOnScroll: boolean;
    openLinksInNewTab: boolean;
    autoRefreshInterval?: number; // minutes, 0 = disabled
  };
}

const defaultSettings: UserSettings = {
  ai: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    translateLanguage: 'zh-CN',
  },
  display: {
    theme: 'system',
    fontSize: 'medium',
    showImages: true,
    compactList: false,
  },
  reading: {
    markAsReadOnScroll: true,
    openLinksInNewTab: true,
    autoRefreshInterval: 0,
  },
};

function getSettingsPath(userId: number): string {
  return join(SETTINGS_DIR, `user_${userId}.json`);
}

function loadSettings(userId: number): UserSettings {
  const path = getSettingsPath(userId);
  try {
    if (existsSync(path)) {
      const data = readFileSync(path, 'utf8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error(`Failed to load settings for user ${userId}:`, err);
  }
  return { ...defaultSettings };
}

function saveSettings(userId: number, settings: UserSettings): void {
  const path = getSettingsPath(userId);
  writeFileSync(path, JSON.stringify(settings, null, 2));
}

/**
 * GET /settings
 * Get current user settings
 */
settings.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const userSettings = loadSettings(user.userId);
  
  // Don't expose sensitive API keys
  const safeSettings = {
    ...userSettings,
    ai: {
      ...userSettings.ai,
      apiKey: userSettings.ai.apiKey ? '********' : undefined,
    },
  };

  return c.json(safeSettings);
});

/**
 * PUT /settings
 * Update user settings
 */
settings.put('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const updates = await c.req.json<Partial<UserSettings>>();
  
  const currentSettings = loadSettings(user.userId);
  
  // Deep merge settings
  const newSettings: UserSettings = {
    ai: { ...currentSettings.ai, ...updates.ai },
    display: { ...currentSettings.display, ...updates.display },
    reading: { ...currentSettings.reading, ...updates.reading },
  };

  saveSettings(user.userId, newSettings);

  // Don't expose sensitive API keys
  const safeSettings = {
    ...newSettings,
    ai: {
      ...newSettings.ai,
      apiKey: newSettings.ai.apiKey ? '********' : undefined,
    },
  };

  return c.json(safeSettings);
});

/**
 * PATCH /settings/:section
 * Update a specific settings section
 */
settings.patch('/:section', authMiddleware, async (c) => {
  const user = c.get('user');
  const section = c.req.param('section') as keyof UserSettings;
  const updates = await c.req.json();

  if (!['ai', 'display', 'reading'].includes(section)) {
    return c.json({ error: 'Invalid settings section' }, 400);
  }

  const currentSettings = loadSettings(user.userId);
  currentSettings[section] = { ...currentSettings[section], ...updates };
  
  saveSettings(user.userId, currentSettings);

  return c.json({ success: true, [section]: currentSettings[section] });
});

/**
 * DELETE /settings
 * Reset settings to defaults
 */
settings.delete('/', authMiddleware, async (c) => {
  const user = c.get('user');
  saveSettings(user.userId, { ...defaultSettings });
  return c.json({ success: true, message: 'Settings reset to defaults' });
});

export default settings;
