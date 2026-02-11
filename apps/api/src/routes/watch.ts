/**
 * Page Watch API Routes
 * Track changes on web pages
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { checkPage } from '../services/page-watcher.js';

const watch = new Hono();

// Auth required for all routes
watch.use('/*', authMiddleware);

// ============ Schemas ============

const createWatchSchema = z.object({
  url: z.string().url().min(1),
  title: z.string().max(500).optional(),
  cssSelector: z.string().max(1000).optional(),
  checkIntervalMinutes: z.number().int().min(5).max(1440).default(60),
});

const updateWatchSchema = z.object({
  title: z.string().max(500).optional(),
  cssSelector: z.string().max(1000).nullable().optional(),
  checkIntervalMinutes: z.number().int().min(5).max(1440).optional(),
  isActive: z.boolean().optional(),
});

// ============ Routes ============

// Create a new watched page
watch.post('/', async (c) => {
  const user = c.get('user') as JWTPayload;

  try {
    const body = await c.req.json();
    // Accept both camelCase and snake_case keys from frontend
    const normalized = {
      ...body,
      cssSelector: body.cssSelector ?? body.css_selector,
      checkIntervalMinutes: body.checkIntervalMinutes ?? body.check_interval_minutes,
      isActive: body.isActive ?? body.is_active,
    };
    const input = createWatchSchema.parse(normalized);

    const { rows } = await query(
      `INSERT INTO fg_watched_pages (user_id, url, title, css_selector, check_interval_minutes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user.userId, input.url, input.title || null, input.cssSelector || null, input.checkIntervalMinutes]
    );

    return c.json(rows[0], 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: err.errors }, 400);
    }
    throw err;
  }
});

// List user's watched pages
watch.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;

  const { rows } = await query(
    `SELECT wp.*, 
       (SELECT COUNT(*) FROM fg_page_changes pc WHERE pc.watched_page_id = wp.id) as change_count
     FROM fg_watched_pages wp
     WHERE wp.user_id = $1 AND wp.is_active = true
     ORDER BY wp.created_at DESC`,
    [user.userId]
  );

  return c.json({ items: rows, total: rows.length });
});

// Update watched page settings
watch.put('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const body = await c.req.json();
    const normalized = {
      ...body,
      cssSelector: body.cssSelector ?? body.css_selector,
      checkIntervalMinutes: body.checkIntervalMinutes ?? body.check_interval_minutes,
      isActive: body.isActive ?? body.is_active,
    };
    const input = updateWatchSchema.parse(normalized);

    // Build dynamic SET clause
    const sets: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (input.title !== undefined) {
      sets.push(`title = $${paramIdx++}`);
      params.push(input.title);
    }
    if (input.cssSelector !== undefined) {
      sets.push(`css_selector = $${paramIdx++}`);
      params.push(input.cssSelector);
    }
    if (input.checkIntervalMinutes !== undefined) {
      sets.push(`check_interval_minutes = $${paramIdx++}`);
      params.push(input.checkIntervalMinutes);
    }
    if (input.isActive !== undefined) {
      sets.push(`is_active = $${paramIdx++}`);
      params.push(input.isActive);
    }

    if (sets.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    params.push(id, user.userId);
    const { rows } = await query(
      `UPDATE fg_watched_pages SET ${sets.join(', ')}
       WHERE id = $${paramIdx++} AND user_id = $${paramIdx}
       RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return c.json({ error: 'Watched page not found' }, 404);
    }

    return c.json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: err.errors }, 400);
    }
    throw err;
  }
});

// Deactivate (soft delete) watched page
watch.delete('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  const { rowCount } = await query(
    `UPDATE fg_watched_pages SET is_active = false WHERE id = $1 AND user_id = $2`,
    [id, user.userId]
  );

  if (!rowCount) {
    return c.json({ error: 'Watched page not found' }, 404);
  }

  return c.json({ success: true });
});

// Get change history for a watched page
watch.get('/:id/changes', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  // Verify ownership
  const { rows: pages } = await query(
    'SELECT id FROM fg_watched_pages WHERE id = $1 AND user_id = $2',
    [id, user.userId]
  );

  if (pages.length === 0) {
    return c.json({ error: 'Watched page not found' }, 404);
  }

  const { rows } = await query(
    `SELECT id, watched_page_id, diff_html, detected_at
     FROM fg_page_changes
     WHERE watched_page_id = $1
     ORDER BY detected_at DESC
     LIMIT $2 OFFSET $3`,
    [id, limit, offset]
  );

  const { rows: countRows } = await query(
    'SELECT COUNT(*) as total FROM fg_page_changes WHERE watched_page_id = $1',
    [id]
  );

  return c.json({
    items: rows,
    total: parseInt(countRows[0].total),
  });
});

// Get single change detail (with old_content and new_content)
watch.get('/:id/changes/:changeId', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  const changeId = parseInt(c.req.param('changeId'));

  if (isNaN(id) || isNaN(changeId)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  // Verify ownership
  const { rows: pages } = await query(
    'SELECT id FROM fg_watched_pages WHERE id = $1 AND user_id = $2',
    [id, user.userId]
  );

  if (pages.length === 0) {
    return c.json({ error: 'Watched page not found' }, 404);
  }

  const { rows } = await query(
    `SELECT * FROM fg_page_changes WHERE id = $1 AND watched_page_id = $2`,
    [changeId, id]
  );

  if (rows.length === 0) {
    return c.json({ error: 'Change not found' }, 404);
  }

  return c.json(rows[0]);
});

// Manually trigger a check
watch.post('/:id/check', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  // Verify ownership
  const { rows: pages } = await query(
    'SELECT id FROM fg_watched_pages WHERE id = $1 AND user_id = $2',
    [id, user.userId]
  );

  if (pages.length === 0) {
    return c.json({ error: 'Watched page not found' }, 404);
  }

  const result = await checkPage(id);
  return c.json(result);
});

export default watch;
