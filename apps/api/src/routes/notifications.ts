/**
 * Notifications Routes — CRUD for fg_notifications + notification rules
 */

import { Hono } from 'hono';
import { verifyToken } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { sendTelegramMessage, getTelegramStatus } from '../services/telegram.js';

const app = new Hono();

// Auth middleware
app.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization required' }, 401);
  }
  try {
    const payload = await verifyToken(auth.slice(7));
    c.set('userId' as any, payload.userId);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// ============ Named routes FIRST (before /:id) ============

// GET /api/notifications/count — unread count (for badge polling)
app.get('/count', async (c) => {
  const userId = c.get('userId' as any);
  const r = await query(
    'SELECT COUNT(*)::int as count FROM fg_notifications WHERE user_id = $1 AND read = FALSE',
    [userId]
  );
  return c.json({ unread: r.rows[0]?.count || 0 });
});

// PATCH /api/notifications/read-all — mark all as read
app.patch('/read-all', async (c) => {
  const userId = c.get('userId' as any);
  const r = await query(
    'UPDATE fg_notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
    [userId]
  );
  return c.json({ updated: r.rowCount || 0 });
});

// POST /api/notifications/test — send test notifications to all configured channels
app.post('/test', async (c) => {
  const userId = c.get('userId' as any);
  const results: string[] = [];
  let anySuccess = false;

  // Test Telegram
  const status = await getTelegramStatus(userId);
  if (status.bound && status.chatId && status.notificationsEnabled) {
    const ok = await sendTelegramMessage(
      status.chatId,
      '🔔 <b>FeedGlow 测试通知</b>\n\n这是一条测试消息，说明你的 Telegram 通知已正确配置！'
    );
    if (ok) { results.push('Telegram ✓'); anySuccess = true; }
    else results.push('Telegram ✗');
  }

  // Test Discord — find any rule with discord webhook URL
  const rulesResult = await query(
    `SELECT channels FROM fg_notification_rules WHERE user_id = $1 AND enabled = true`,
    [userId]
  );
  const discordUrls = new Set<string>();
  for (const row of rulesResult.rows) {
    const channels = typeof row.channels === 'string' ? JSON.parse(row.channels) : row.channels;
    if (channels?.discord) discordUrls.add(channels.discord);
  }
  for (const url of discordUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '🔔 FeedGlow 测试通知',
            description: '这是一条测试消息，说明你的 Discord 通知已正确配置！',
            color: 0xf97316,
            timestamp: new Date().toISOString(),
          }],
        }),
      });
      if (res.ok) { results.push('Discord ✓'); anySuccess = true; }
      else results.push('Discord ✗');
    } catch {
      results.push('Discord ✗');
    }
  }

  if (results.length === 0) {
    return c.json({ success: false, message: '未配置任何通知渠道（请先绑定 Telegram 或在规则中添加 Discord Webhook）' });
  }

  return c.json({
    success: anySuccess,
    message: results.join('  '),
  });
});

// ============ Notification Rules CRUD ============

// GET /api/notifications/rules — list rules
app.get('/rules', async (c) => {
  const userId = c.get('userId' as any);
  const r = await query(
    `SELECT * FROM fg_notification_rules WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return c.json({ rules: r.rows.map(mapRule) });
});

// POST /api/notifications/rules — create rule
app.post('/rules', async (c) => {
  const userId = c.get('userId' as any);
  const body = await c.req.json();
  const { name, enabled = true, triggers, channels, schedule } = body;

  if (!name) return c.json({ error: 'Name is required' }, 400);

  const r = await query(
    `INSERT INTO fg_notification_rules (user_id, name, enabled, triggers, channels, schedule)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, name, enabled, JSON.stringify(triggers), JSON.stringify(channels), JSON.stringify(schedule || { type: 'immediate' })]
  );

  return c.json(mapRule(r.rows[0]), 201);
});

// PUT /api/notifications/rules/:id — update rule
app.put('/rules/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json();
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (body.name !== undefined) { sets.push(`name = $${idx++}`); params.push(body.name); }
  if (body.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(body.enabled); }
  if (body.triggers !== undefined) { sets.push(`triggers = $${idx++}`); params.push(JSON.stringify(body.triggers)); }
  if (body.channels !== undefined) { sets.push(`channels = $${idx++}`); params.push(JSON.stringify(body.channels)); }
  if (body.schedule !== undefined) { sets.push(`schedule = $${idx++}`); params.push(JSON.stringify(body.schedule)); }

  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  sets.push(`updated_at = NOW()`);
  params.push(id, userId);

  const r = await query(
    `UPDATE fg_notification_rules SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    params
  );

  if (!r.rows[0]) return c.json({ error: 'Rule not found' }, 404);
  return c.json(mapRule(r.rows[0]));
});

// DELETE /api/notifications/rules/:id — delete rule
app.delete('/rules/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const r = await query(
    'DELETE FROM fg_notification_rules WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if ((r.rowCount ?? 0) === 0) return c.json({ error: 'Rule not found' }, 404);
  return c.json({ success: true });
});

// ============ Parameterized routes LAST ============

// GET /api/notifications — list notifications
app.get('/', async (c) => {
  const userId = c.get('userId' as any);
  const unreadOnly = c.req.query('unread') === 'true';
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  const conditions = ['user_id = $1'];
  const params: any[] = [userId];
  let idx = 2;

  if (unreadOnly) {
    conditions.push('read = FALSE');
  }

  const r = await query(
    `SELECT * FROM fg_notifications
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );

  return c.json({
    notifications: r.rows.map(mapNotification),
    total: r.rowCount,
  });
});

// GET /api/notifications/:id — single notification
app.get('/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const r = await query(
    'SELECT * FROM fg_notifications WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!r.rows[0]) return c.json({ error: 'Notification not found' }, 404);
  return c.json({ notification: mapNotification(r.rows[0]) });
});

// PATCH /api/notifications/:id/read — mark single as read
app.patch('/:id/read', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const r = await query(
    'UPDATE fg_notifications SET read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  if (!r.rows[0]) return c.json({ error: 'Notification not found' }, 404);
  return c.json({ notification: mapNotification(r.rows[0]) });
});

// DELETE /api/notifications/:id — delete single
app.delete('/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const r = await query(
    'DELETE FROM fg_notifications WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if ((r.rowCount ?? 0) === 0) return c.json({ error: 'Notification not found' }, 404);
  return c.json({ success: true });
});

// DELETE /api/notifications — clear all read notifications
app.delete('/', async (c) => {
  const userId = c.get('userId' as any);
  const r = await query(
    'DELETE FROM fg_notifications WHERE user_id = $1 AND read = TRUE',
    [userId]
  );
  return c.json({ deleted: r.rowCount || 0 });
});

// ============ Helpers ============

function mapRule(row: any) {
  return {
    id: String(row.id),
    name: row.name,
    enabled: row.enabled,
    triggers: typeof row.triggers === 'string' ? JSON.parse(row.triggers) : row.triggers,
    channels: typeof row.channels === 'string' ? JSON.parse(row.channels) : row.channels,
    schedule: typeof row.schedule === 'string' ? JSON.parse(row.schedule) : row.schedule,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNotification(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    entryId: row.entry_id,
    read: row.read,
    createdAt: row.created_at,
  };
}

export default app;
