/**
 * Notification Channels CRUD Routes
 * Manages fg_notification_channels (telegram/discord)
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import crypto from 'crypto';

const app = new Hono();
app.use('*', authMiddleware);

const TELEGRAM_API = 'https://api.telegram.org/bot';

function maskToken(token: string): string {
  return token.length > 10 ? token.slice(0, 6) + '••••••' + token.slice(-4) : '••••••••';
}

function maskWebhookUrl(url: string): string {
  return '••••' + url.slice(-20);
}

function sanitizeConfig(type: string, config: any): any {
  if (!config) return {};
  if (type === 'telegram') {
    return {
      bot_username: config.bot_username,
      chat_id: config.chat_id,
      bound: config.bound,
      bot_token: config.bot_token ? maskToken(config.bot_token) : undefined,
    };
  }
  if (type === 'discord') {
    return {
      webhook_url: config.webhook_url ? maskWebhookUrl(config.webhook_url) : undefined,
    };
  }
  return {};
}

function decryptConfig(type: string, config: any): any {
  if (!config) return {};
  const result = { ...config };
  if (type === 'telegram' && result.bot_token) {
    try { result.bot_token = decrypt(result.bot_token); } catch { /* already plain */ }
  }
  return result;
}

// GET / — list all channels
app.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const r = await query(
    `SELECT id, user_id, type, name, config, enabled, created_at, updated_at, bind_code, bind_expires_at
     FROM fg_notification_channels WHERE user_id = $1 ORDER BY created_at`,
    [user.userId]
  );
  const channels = r.rows.map(row => {
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    const decrypted = decryptConfig(row.type, config);
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      config: sanitizeConfig(row.type, decrypted),
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
  return c.json({ channels });
});

// POST / — create channel
app.post('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const { type, name, config } = await c.req.json<{ type: string; name: string; config: any }>();

  if (!type || !name) return c.json({ error: '类型和名称不能为空' }, 400);
  if (!['telegram', 'discord'].includes(type)) return c.json({ error: '不支持的渠道类型' }, 400);

  let finalConfig: any = {};

  if (type === 'telegram') {
    if (!config?.bot_token) return c.json({ error: '请输入 Bot Token' }, 400);
    // Validate token
    try {
      const res = await fetch(`${TELEGRAM_API}${config.bot_token}/getMe`);
      if (!res.ok) return c.json({ error: 'Bot Token 无效' }, 400);
      const data = await res.json();
      finalConfig = {
        bot_token: encrypt(config.bot_token),
        bot_username: data.result?.username || '',
        chat_id: null,
        bound: false,
      };
    } catch {
      return c.json({ error: '验证 Bot Token 失败' }, 400);
    }

    // Auto-set webhook
    try {
      const apiBase = process.env.API_PUBLIC_URL || `https://${c.req.header('host') || 'localhost:3001'}`;
      const webhookUrl = `${apiBase}/api/telegram/webhook`;
      await fetch(`${TELEGRAM_API}${config.bot_token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });
    } catch { /* ignore */ }
  }

  if (type === 'discord') {
    if (!config?.webhook_url) return c.json({ error: '请输入 Webhook URL' }, 400);
    if (!config.webhook_url.startsWith('https://discord.com/api/webhooks/') &&
        !config.webhook_url.startsWith('https://discordapp.com/api/webhooks/')) {
      return c.json({ error: '请输入有效的 Discord Webhook URL' }, 400);
    }
    finalConfig = { webhook_url: config.webhook_url };
  }

  const r = await query(
    `INSERT INTO fg_notification_channels (user_id, type, name, config, enabled)
     VALUES ($1, $2, $3, $4, true) RETURNING *`,
    [user.userId, type, name, JSON.stringify(finalConfig)]
  );

  const row = r.rows[0];
  const decrypted = decryptConfig(type, finalConfig);
  return c.json({
    id: row.id,
    type: row.type,
    name: row.name,
    config: sanitizeConfig(type, decrypted),
    enabled: row.enabled,
    createdAt: row.created_at,
  }, 201);
});

// PATCH /:id — update channel
app.patch('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json();
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (body.name !== undefined) { sets.push(`name = $${idx++}`); params.push(body.name); }
  if (body.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(body.enabled); }
  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  sets.push(`updated_at = NOW()`);
  params.push(id, user.userId);

  const r = await query(
    `UPDATE fg_notification_channels SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    params
  );
  if (!r.rows[0]) return c.json({ error: 'Channel not found' }, 404);
  return c.json({ success: true });
});

// DELETE /:id — delete channel
app.delete('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const r = await query(
    'DELETE FROM fg_notification_channels WHERE id = $1 AND user_id = $2',
    [id, user.userId]
  );
  if ((r.rowCount ?? 0) === 0) return c.json({ error: 'Channel not found' }, 404);
  return c.json({ success: true });
});

// POST /:id/bind — Telegram bind: generate bind_code + deep link
app.post('/:id/bind', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const r = await query(
    `SELECT * FROM fg_notification_channels WHERE id = $1 AND user_id = $2 AND type = 'telegram'`,
    [id, user.userId]
  );
  if (!r.rows[0]) return c.json({ error: 'Telegram channel not found' }, 404);

  const config = typeof r.rows[0].config === 'string' ? JSON.parse(r.rows[0].config) : r.rows[0].config;
  const botUsername = config.bot_username;

  const bindCode = 'fg_' + crypto.randomBytes(8).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await query(
    `UPDATE fg_notification_channels SET bind_code = $1, bind_expires_at = $2 WHERE id = $3`,
    [bindCode, expiresAt, id]
  );

  const deepLink = botUsername
    ? `https://t.me/${botUsername}?start=${bindCode}`
    : `(bot username not configured) code: ${bindCode}`;

  return c.json({ bindCode, deepLink });
});

// GET /:id/status — Telegram bind status
app.get('/:id/status', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const r = await query(
    `SELECT config FROM fg_notification_channels WHERE id = $1 AND user_id = $2 AND type = 'telegram'`,
    [id, user.userId]
  );
  if (!r.rows[0]) return c.json({ error: 'Channel not found' }, 404);

  const config = typeof r.rows[0].config === 'string' ? JSON.parse(r.rows[0].config) : r.rows[0].config;
  return c.json({
    bound: !!config.bound,
    chatId: config.chat_id || null,
  });
});

// POST /:id/unbind — Telegram unbind
app.post('/:id/unbind', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const r = await query(
    `SELECT config FROM fg_notification_channels WHERE id = $1 AND user_id = $2 AND type = 'telegram'`,
    [id, user.userId]
  );
  if (!r.rows[0]) return c.json({ error: 'Channel not found' }, 404);

  const config = typeof r.rows[0].config === 'string' ? JSON.parse(r.rows[0].config) : r.rows[0].config;
  config.chat_id = null;
  config.bound = false;

  await query(
    `UPDATE fg_notification_channels SET config = $1 WHERE id = $2`,
    [JSON.stringify(config), id]
  );

  return c.json({ success: true });
});

export default app;
