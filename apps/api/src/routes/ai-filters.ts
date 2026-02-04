/**
 * AI Filters Routes (P2 #18)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { createMinifluxClient } from '../lib/miniflux.js';
import {
  getAIFilters,
  createAIFilter,
  updateAIFilter,
  deleteAIFilter,
  scoreEntry,
} from '../services/ai-filter.js';

const aiFilters = new Hono();

aiFilters.use('*', authMiddleware);

// List AI filters
aiFilters.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const filters = await getAIFilters(user.userId);
  return c.json({ filters });
});

// Create AI filter
const createFilterSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  action: z.enum(['highlight', 'mute', 'tag']),
  tagName: z.string().optional(),
});

aiFilters.post('/', zValidator('json', createFilterSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const data = c.req.valid('json');
  const filter = await createAIFilter(user.userId, data);
  return c.json(filter, 201);
});

// Update AI filter
const updateFilterSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(1000).optional(),
  action: z.enum(['highlight', 'mute', 'tag']).optional(),
  tagName: z.string().optional(),
  enabled: z.boolean().optional(),
});

aiFilters.put('/:id', zValidator('json', updateFilterSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  const updates = c.req.valid('json');
  const filter = await updateAIFilter(user.userId, id, updates);
  if (!filter) return c.json({ error: 'Filter not found' }, 404);
  return c.json(filter);
});

// Delete AI filter
aiFilters.delete('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  const deleted = await deleteAIFilter(user.userId, id);
  if (!deleted) return c.json({ error: 'Filter not found' }, 404);
  return c.json({ success: true });
});

// Score a specific entry
aiFilters.post('/score/:entryId', async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = parseInt(c.req.param('entryId'));

  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  const client = createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });
  const entry = await client.getEntry(entryId);

  const result = await scoreEntry(user.userId, entry);
  return c.json({ entryId, ...result });
});

export default aiFilters;
