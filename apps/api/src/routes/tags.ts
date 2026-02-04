/**
 * Tags API Routes (P0)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import {
  getUserTags,
  createTag,
  updateTag,
  deleteTag,
  addTagToEntry,
  removeTagFromEntry,
  getEntryTags,
  getEntriesByTag,
} from '../services/tags.js';
import { createMinifluxClient } from '../lib/miniflux.js';

const tags = new Hono();

tags.use('*', authMiddleware);

// List all tags with article counts
tags.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const tagList = await getUserTags(user.userId);
  return c.json({ tags: tagList });
});

// Create tag
const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

tags.post('/', zValidator('json', createTagSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const { name, color } = c.req.valid('json');
  const tag = await createTag(user.userId, name, color);
  return c.json(tag, 201);
});

// Update tag
const updateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

tags.put('/:id', zValidator('json', updateTagSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const tagId = parseInt(c.req.param('id'));
  const updates = c.req.valid('json');
  const tag = await updateTag(user.userId, tagId, updates);
  if (!tag) {
    return c.json({ error: 'Tag not found' }, 404);
  }
  return c.json(tag);
});

// Delete tag
tags.delete('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const tagId = parseInt(c.req.param('id'));
  const deleted = await deleteTag(user.userId, tagId);
  if (!deleted) {
    return c.json({ error: 'Tag not found' }, 404);
  }
  return c.json({ success: true });
});

// Get tags for a specific entry
tags.get('/entry/:entryId', async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = parseInt(c.req.param('entryId'));
  const entryTags = await getEntryTags(user.userId, entryId);
  return c.json({ entryId, tags: entryTags });
});

// Add tag to entry
const addTagSchema = z.object({
  tagId: z.number(),
});

tags.post('/entry/:entryId', zValidator('json', addTagSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = parseInt(c.req.param('entryId'));
  const { tagId } = c.req.valid('json');
  await addTagToEntry(user.userId, entryId, tagId);
  return c.json({ success: true });
});

// Remove tag from entry
tags.delete('/entry/:entryId/:tagId', async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = parseInt(c.req.param('entryId'));
  const tagId = parseInt(c.req.param('tagId'));
  const removed = await removeTagFromEntry(user.userId, entryId, tagId);
  if (!removed) {
    return c.json({ error: 'Tag not found on entry' }, 404);
  }
  return c.json({ success: true });
});

// Get entries by tag name
tags.get('/entries/:tagName', async (c) => {
  const user = c.get('user') as JWTPayload;
  const tagName = decodeURIComponent(c.req.param('tagName'));
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const { entryIds, total } = await getEntriesByTag(user.userId, tagName, limit, offset);

  if (entryIds.length === 0) {
    return c.json({ tag: tagName, total: 0, entries: [] });
  }

  // Fetch actual entries from Miniflux
  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  const client = createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });

  const entries = await Promise.all(
    entryIds.map(async (id) => {
      try {
        return await client.getEntry(id);
      } catch {
        return null; // Entry may have been deleted from Miniflux
      }
    })
  );

  return c.json({
    tag: tagName,
    total,
    entries: entries.filter(Boolean),
  });
});

export default tags;
