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

const events = new Hono();

// Apply auth middleware
events.use('/*', authMiddleware);

// Record read event
const readEventSchema = z.object({
  entryId: z.number(),
  feedId: z.number(),
  duration: z.number().min(0),           // seconds
  scrollDepth: z.number().min(0).max(100), // percentage
  completed: z.boolean().default(false),
});

events.post('/read', zValidator('json', readEventSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const event = c.req.valid('json');

  await recordReadEvent(user.userId, event);

  return c.json({ success: true });
});

// Record action event
const actionEventSchema = z.object({
  action: z.enum(['star', 'share', 'summarize', 'translate', 'click_link']),
  entryId: z.number(),
  feedId: z.number(),
});

events.post('/action', zValidator('json', actionEventSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const event = c.req.valid('json');

  await recordActionEvent(user.userId, event);

  return c.json({ success: true });
});

// Get user stats
events.get('/stats', async (c) => {
  const user = c.get('user') as JWTPayload;
  const stats = await getUserStats(user.userId);

  return c.json(stats);
});

export default events;
