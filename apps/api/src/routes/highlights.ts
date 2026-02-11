/**
 * Highlights API Routes
 * Article text highlighting and annotation
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { query } from '../lib/db.js';

const highlights = new Hono();
highlights.use('*', authMiddleware);

const createSchema = z.object({
  entryId: z.union([z.number(), z.string()]),
  text: z.string().min(1),
  note: z.string().optional(),
  color: z.enum(['yellow', 'green', 'blue', 'red']).default('yellow'),
  positionStart: z.number().optional(),
  positionEnd: z.number().optional(),
  xpath: z.string().optional(),
});

const updateSchema = z.object({
  note: z.string().optional(),
  color: z.enum(['yellow', 'green', 'blue', 'red']).optional(),
});

// List user's highlights (optional ?entryId= filter)
highlights.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = c.req.query('entryId');

  let sql = `
    SELECT h.*, e.title as entry_title, e.url as entry_url, e.uuid as entry_uuid, f.title as feed_title
    FROM fg_highlights h
    LEFT JOIN fg_entries e ON e.id = h.entry_id
    LEFT JOIN fg_feeds f ON f.id = e.feed_id
    WHERE h.user_id = $1
  `;
  const params: any[] = [user.userId];

  if (entryId) {
    // entryId could be UUID or numeric
    const parsed = parseInt(entryId, 10);
    if (!isNaN(parsed)) {
      sql += ` AND h.entry_id = $2`;
      params.push(parsed);
    } else {
      // UUID — resolve via subquery
      sql += ` AND h.entry_id = (SELECT id FROM fg_entries WHERE uuid = $2 LIMIT 1)`;
      params.push(entryId);
    }
  }

  sql += ` ORDER BY h.created_at DESC`;

  const result = await query(sql, params);
  return c.json({ highlights: result.rows });
});

// Export all highlights as Markdown
highlights.get('/export', async (c) => {
  const user = c.get('user') as JWTPayload;

  const result = await query(
    `SELECT h.*, e.title as entry_title, e.url as entry_url, e.uuid as entry_uuid, f.title as feed_title
     FROM fg_highlights h
     LEFT JOIN fg_entries e ON e.id = h.entry_id
     LEFT JOIN fg_feeds f ON f.id = e.feed_id
     WHERE h.user_id = $1
     ORDER BY e.title, h.created_at`,
    [user.userId]
  );

  // Group by article
  const grouped = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const key = row.entry_title || 'Untitled';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  let markdown = `# 我的高亮笔记\n\n导出时间: ${new Date().toISOString()}\n\n`;

  for (const [title, rows] of grouped) {
    markdown += `## ${title}\n\n`;
    if (rows[0].entry_url) {
      markdown += `> 原文链接: ${rows[0].entry_url}\n\n`;
    }
    if (rows[0].feed_title) {
      markdown += `> 来源: ${rows[0].feed_title}\n\n`;
    }
    for (const h of rows) {
      const colorEmoji: Record<string, string> = { yellow: '🟡', green: '🟢', blue: '🔵', red: '🔴' };
      markdown += `${colorEmoji[h.color] || '🟡'} > ${h.text}\n\n`;
      if (h.note) {
        markdown += `📝 ${h.note}\n\n`;
      }
    }
    markdown += `---\n\n`;
  }

  c.header('Content-Type', 'text/markdown; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="highlights.md"');
  return c.text(markdown);
});

// Create highlight
highlights.post('/', async (c) => {
  const user = c.get('user') as JWTPayload;

  let data;
  try {
    const body = await c.req.json();
    data = createSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: err.errors }, 400);
    }
    throw err;
  }

  // Resolve entry ID (frontend sends UUID, DB uses numeric ID)
  let numericEntryId: number;
  const raw = data.entryId;
  if (typeof raw === 'number') {
    numericEntryId = raw;
  } else {
    // Try UUID lookup first, then numeric string
    const uuidCheck = await query(
      'SELECT id FROM fg_entries WHERE uuid = $1 AND user_id = $2',
      [raw, user.userId]
    );
    if (uuidCheck.rows.length > 0) {
      numericEntryId = uuidCheck.rows[0].id;
    } else {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) {
        numericEntryId = parsed;
      } else {
        return c.json({ error: 'Entry not found' }, 404);
      }
    }
  }

  // Verify entry exists
  const entryCheck = await query('SELECT id FROM fg_entries WHERE id = $1 AND user_id = $2', [numericEntryId, user.userId]);
  if (entryCheck.rows.length === 0) {
    return c.json({ error: 'Entry not found' }, 404);
  }

  const result = await query(
    `INSERT INTO fg_highlights (user_id, entry_id, text, note, color, position_start, position_end, xpath)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      user.userId,
      numericEntryId,
      data.text,
      data.note || null,
      data.color,
      data.positionStart ?? null,
      data.positionEnd ?? null,
      data.xpath || null,
    ]
  );

  return c.json(result.rows[0], 201);
});

// Update highlight (note, color)
highlights.put('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  let data;
  try {
    const body = await c.req.json();
    data = updateSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: err.errors }, 400);
    }
    throw err;
  }

  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.note !== undefined) {
    fields.push(`note = $${idx++}`);
    values.push(data.note);
  }
  if (data.color !== undefined) {
    fields.push(`color = $${idx++}`);
    values.push(data.color);
  }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);

  fields.push(`updated_at = NOW()`);
  values.push(id, user.userId);

  const result = await query(
    `UPDATE fg_highlights SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json(result.rows[0]);
});

// Delete highlight
highlights.delete('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const result = await query(
    'DELETE FROM fg_highlights WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, user.userId]
  );

  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

export default highlights;
