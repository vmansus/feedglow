/**
 * User Events API Routes
 * Tracks reading behavior for smart ranking
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import {
  recordReadEvent,
  recordActionEvent,
  getUserStats,
} from '../services/user-events.js';
import { query } from '../lib/db.js';

const events = new Hono();

// Apply auth middleware
events.use('/*', authMiddleware);

// Record read event
const readEventSchema = z.object({
  entryId: z.union([z.number(), z.string()]),
  feedId: z.number(),
  duration: z.number().min(0),           // seconds
  scrollDepth: z.number().min(0).max(100), // percentage
  completed: z.boolean().default(false),
});

events.post('/read', zValidator('json', readEventSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const event = c.req.valid('json');

  // Resolve UUID string to numeric ID if needed
  let numericEntryId = typeof event.entryId === 'number' ? event.entryId : 0;
  if (typeof event.entryId === 'string') {
    const res = await query('SELECT id FROM fg_entries WHERE uuid = $1', [event.entryId]);
    if (res.rows.length > 0) {
      numericEntryId = res.rows[0].id;
    } else {
      return c.json({ success: false, error: 'Entry not found' }, 404);
    }
  }

  await recordReadEvent(user.userId, { ...event, entryId: numericEntryId });

  return c.json({ success: true });
});

// Record action event
const actionEventSchema = z.object({
  action: z.enum(['star', 'share', 'summarize', 'translate', 'click_link']),
  entryId: z.union([z.number(), z.string()]),
  feedId: z.number(),
});

events.post('/action', zValidator('json', actionEventSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const event = c.req.valid('json');

  // Resolve UUID string to numeric ID if needed
  let numericEntryId = typeof event.entryId === 'number' ? event.entryId : 0;
  if (typeof event.entryId === 'string') {
    const res = await query('SELECT id FROM fg_entries WHERE uuid = $1', [event.entryId]);
    if (res.rows.length > 0) {
      numericEntryId = res.rows[0].id;
    } else {
      return c.json({ success: false, error: 'Entry not found' }, 404);
    }
  }

  await recordActionEvent(user.userId, { ...event, entryId: numericEntryId });

  return c.json({ success: true });
});

// Get user stats
events.get('/stats', async (c) => {
  const user = c.get('user') as JWTPayload;
  const stats = await getUserStats(user.userId);

  return c.json(stats);
});

export default events;
