/**
 * Telegram Bot Routes
 * Webhook callback + user binding management
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import {
  handleTelegramWebhook,
  generateBindCode,
  getTelegramStatus,
  unbindTelegram,
  saveBotConfig,
  getBotConfigForDisplay,
  removeBotConfig,
} from '../services/telegram.js';
import { query } from '../lib/db.js';

const telegram = new Hono();

// POST /api/telegram/webhook — Telegram webhook callback (NO auth)
telegram.post('/webhook', async (c) => {
  try {
    const update = await c.req.json();
    await handleTelegramWebhook(update);
    return c.json({ ok: true });
  } catch (err) {
    console.error('[Telegram] Webhook error:', err instanceof Error ? err.message : err);
    // Always return 200 to Telegram to avoid retries
    return c.json({ ok: true });
  }
});

// All routes below require auth
telegram.use('/bot-config', authMiddleware);
telegram.use('/bind', authMiddleware);
telegram.use('/status', authMiddleware);
telegram.use('/unbind', authMiddleware);
telegram.use('/toggle', authMiddleware);

// PUT /api/telegram/bot-config — Save bot token & username
telegram.put('/bot-config', async (c) => {
  const user = c.get('user') as JWTPayload;
  const { botToken, botUsername } = await c.req.json<{ botToken: string; botUsername?: string }>();

  if (!botToken?.trim()) {
    return c.json({ success: false, error: '请输入 Bot Token' }, 400);
  }

  const result = await saveBotConfig(user.userId, botToken.trim(), botUsername?.trim() || '');
  if (!result.success) {
    return c.json(result, 400);
  }

  // Auto-set webhook
  try {
    const host = c.req.header('host') || 'localhost:3001';
    const protocol = c.req.header('x-forwarded-proto') || 'https';
    const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;
    await fetch(`https://api.telegram.org/bot${botToken.trim()}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });
    console.log(`[Telegram] Webhook set to ${webhookUrl}`);
  } catch (err) {
    console.warn('[Telegram] Failed to set webhook:', err instanceof Error ? err.message : err);
  }

  return c.json({ success: true });
});

// GET /api/telegram/bot-config — Get bot config (masked)
telegram.get('/bot-config', async (c) => {
  const user = c.get('user') as JWTPayload;
  const config = await getBotConfigForDisplay(user.userId);
  return c.json(config);
});

// DELETE /api/telegram/bot-config — Remove bot config
telegram.delete('/bot-config', async (c) => {
  const user = c.get('user') as JWTPayload;
  await removeBotConfig(user.userId);
  return c.json({ success: true });
});

// POST /api/telegram/bind — Generate bind code and deep link
telegram.post('/bind', async (c) => {
  const user = c.get('user') as JWTPayload;
  const { bindCode, deepLink } = await generateBindCode(user.userId);
  return c.json({ bindCode, deepLink });
});

// GET /api/telegram/status — Check binding status
telegram.get('/status', async (c) => {
  const user = c.get('user') as JWTPayload;
  const status = await getTelegramStatus(user.userId);
  return c.json(status);
});

// DELETE /api/telegram/unbind — Remove telegram binding
telegram.delete('/unbind', async (c) => {
  const user = c.get('user') as JWTPayload;
  await unbindTelegram(user.userId);
  return c.json({ success: true });
});

// POST /api/telegram/toggle — Toggle global telegram notifications
telegram.post('/toggle', async (c) => {
  const user = c.get('user') as JWTPayload;
  const { enabled } = await c.req.json<{ enabled: boolean }>();

  await query(
    `UPDATE fg_user_settings SET telegram_notifications = $1 WHERE user_id = $2`,
    [enabled, user.userId]
  );

  return c.json({ success: true, enabled });
});

export default telegram;
