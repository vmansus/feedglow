/**
 * Notification Rules Routes (P1 #14)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { query } from '../lib/db.js';

const notifications = new Hono();

notifications.use('*', authMiddleware);

// List notification rules
notifications.get('/rules', async (c) => {
  const user = c.get('user') as JWTPayload;
  const result = await query(
    `SELECT * FROM fg_notification_rules WHERE user_id = $1 ORDER BY created_at DESC`,
    [user.userId]
  );
  return c.json({ rules: result.rows });
});

// Create notification rule
const createRuleSchema = z.object({
  name: z.string().max(200).optional(),
  feedId: z.number().nullable().optional(),
  keyword: z.string().max(500).optional(),
  channel: z.enum(['webhook', 'telegram', 'discord']),
  webhookUrl: z.string().url().optional(),
  telegramChatId: z.string().optional(),
  discordWebhookUrl: z.string().url().optional(),
  enabled: z.boolean().optional().default(true),
});

notifications.post('/rules', zValidator('json', createRuleSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const data = c.req.valid('json');

  const result = await query(
    `INSERT INTO fg_notification_rules (user_id, name, feed_id, keyword, channel, webhook_url, telegram_chat_id, discord_webhook_url, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [user.userId, data.name, data.feedId, data.keyword, data.channel,
     data.webhookUrl, data.telegramChatId, data.discordWebhookUrl, data.enabled]
  );

  return c.json(result.rows[0], 201);
});

// Update notification rule
const updateRuleSchema = z.object({
  name: z.string().max(200).optional(),
  feedId: z.number().nullable().optional(),
  keyword: z.string().max(500).optional(),
  channel: z.enum(['webhook', 'telegram', 'discord']).optional(),
  webhookUrl: z.string().url().optional(),
  telegramChatId: z.string().optional(),
  discordWebhookUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
});

notifications.put('/rules/:id', zValidator('json', updateRuleSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const ruleId = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const fieldMap: Record<string, string> = {
    name: 'name', feedId: 'feed_id', keyword: 'keyword', channel: 'channel',
    webhookUrl: 'webhook_url', telegramChatId: 'telegram_chat_id',
    discordWebhookUrl: 'discord_webhook_url', enabled: 'enabled',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if ((data as any)[key] !== undefined) {
      fields.push(`${col} = $${idx++}`);
      values.push((data as any)[key]);
    }
  }

  if (fields.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  fields.push(`updated_at = NOW()`);
  values.push(ruleId, user.userId);

  const result = await query(
    `UPDATE fg_notification_rules SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  return c.json(result.rows[0]);
});

// Delete notification rule
notifications.delete('/rules/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const ruleId = parseInt(c.req.param('id'));

  const result = await query(
    `DELETE FROM fg_notification_rules WHERE id = $1 AND user_id = $2`,
    [ruleId, user.userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  return c.json({ success: true });
});

// Test notification
notifications.post('/test', async (c) => {
  const user = c.get('user') as JWTPayload;
  const { channel, webhookUrl, telegramChatId, discordWebhookUrl } = await c.req.json();

  const testMessage = `🔔 FeedGlow notification test — ${new Date().toISOString()}`;

  try {
    if (channel === 'webhook' && webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testMessage, source: 'feedglow' }),
      });
    } else if (channel === 'discord' && discordWebhookUrl) {
      await fetch(discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: testMessage }),
      });
    } else if (channel === 'telegram' && telegramChatId) {
      // Telegram requires a bot token — stored in user settings
      return c.json({ error: 'Telegram bot token required in settings' }, 400);
    } else {
      return c.json({ error: 'Missing channel configuration' }, 400);
    }

    return c.json({ success: true, message: 'Test notification sent' });
  } catch (err) {
    return c.json({ error: `Failed to send: ${err instanceof Error ? err.message : err}` }, 500);
  }
});

export default notifications;
