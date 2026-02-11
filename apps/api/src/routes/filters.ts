/**
 * Filter Rules API Routes
 * Keyword/regex-based article filtering
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { invalidateFilterCache } from '../feed-engine/store.js';

const filters = new Hono();
filters.use('*', authMiddleware);

const filterSchema = z.object({
  name: z.string().max(200).optional(),
  matchTarget: z.enum(['title', 'content', 'author', 'all']).default('title'),
  matchType: z.enum(['contains', 'regex']).default('contains'),
  pattern: z.string().min(1),
  action: z.enum(['mark_read', 'hide', 'tag']).default('mark_read'),
  actionValue: z.string().optional(),
  scope: z.enum(['global', 'feed', 'category']).default('global'),
  scopeId: z.number().optional(),
  enabled: z.boolean().default(true),
});

// List user's filter rules
filters.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const result = await query(
    'SELECT * FROM fg_filter_rules WHERE user_id = $1 ORDER BY created_at DESC',
    [user.userId]
  );
  return c.json({ filters: result.rows });
});

// Create filter rule
filters.post('/', zValidator('json', filterSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const data = c.req.valid('json');

  // Validate regex
  if (data.matchType === 'regex') {
    try { new RegExp(data.pattern); } catch { return c.json({ error: 'Invalid regex pattern' }, 400); }
  }

  const result = await query(
    `INSERT INTO fg_filter_rules (user_id, name, match_target, match_type, pattern, action, action_value, scope, scope_id, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [user.userId, data.name || null, data.matchTarget, data.matchType, data.pattern,
     data.action, data.actionValue || null, data.scope, data.scopeId || null, data.enabled]
  );

  invalidateFilterCache(user.userId);
  return c.json(result.rows[0], 201);
});

// Update filter rule
filters.put('/:id', zValidator('json', filterSchema.partial()), async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  if (data.matchType === 'regex' && data.pattern) {
    try { new RegExp(data.pattern); } catch { return c.json({ error: 'Invalid regex pattern' }, 400); }
  }

  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const fieldMap: Record<string, string> = {
    name: 'name', matchTarget: 'match_target', matchType: 'match_type',
    pattern: 'pattern', action: 'action', actionValue: 'action_value',
    scope: 'scope', scopeId: 'scope_id', enabled: 'enabled',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if ((data as any)[key] !== undefined) {
      fields.push(`${col} = $${idx++}`);
      values.push((data as any)[key]);
    }
  }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);

  fields.push(`updated_at = NOW()`);
  values.push(id, user.userId);

  const result = await query(
    `UPDATE fg_filter_rules SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);

  invalidateFilterCache(user.userId);
  return c.json(result.rows[0]);
});

// Delete filter rule
filters.delete('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));

  const result = await query(
    'DELETE FROM fg_filter_rules WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, user.userId]
  );

  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);

  invalidateFilterCache(user.userId);
  return c.json({ success: true });
});

export default filters;
