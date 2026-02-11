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
import { getDataClient } from '../feed-engine/data-source.js';

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
  if (isNaN(user.userId)) return c.json({ error: 'Invalid user ID' }, 401);
  const client = getDataClient(c);
  const entry = await client.getEntry(c.req.param('entryId'));
  const numericId = (entry as any)._numericId;
  const entryTags = await getEntryTags(user.userId, numericId);
  return c.json({ entryId: entry.id, tags: entryTags });
});

// Add tag to entry (by tagId or by name — name auto-creates if needed)
const addTagSchema = z.object({
  tagId: z.number().optional(),
  name: z.string().min(1).max(100).optional(),
}).refine(data => data.tagId !== undefined || data.name !== undefined, {
  message: 'Either tagId or name is required',
});

tags.post('/entry/:entryId', zValidator('json', addTagSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  if (isNaN(user.userId)) return c.json({ error: 'Invalid user ID' }, 401);
  const client = getDataClient(c);
  const entry = await client.getEntry(c.req.param('entryId'));
  const entryId = (entry as any)._numericId;
  const { tagId, name } = c.req.valid('json');

  let resolvedTagId = tagId;
  if (!resolvedTagId && name) {
    // Find or create tag by name
    const existing = await getUserTags(user.userId);
    const found = existing.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (found) {
      resolvedTagId = found.id;
    } else {
      const newTag = await createTag(user.userId, name);
      resolvedTagId = newTag.id;
    }
  }

  try {
    await addTagToEntry(user.userId, entryId, resolvedTagId!);
    return c.json({ success: true, tagId: resolvedTagId });
  } catch (err: any) {
    if (err?.status === 404) return c.json({ error: err.message }, 404);
    throw err;
  }
});

// Remove tag from entry (by tagId or tag name)
tags.delete('/entry/:entryId/:tagIdOrName', async (c) => {
  const user = c.get('user') as JWTPayload;
  if (isNaN(user.userId)) return c.json({ error: 'Invalid user ID' }, 401);
  const client = getDataClient(c);
  const entryObj = await client.getEntry(c.req.param('entryId'));
  const entryId = (entryObj as any)._numericId;
  const param = decodeURIComponent(c.req.param('tagIdOrName'));
  let tagId = parseInt(param);

  // If not a number, resolve by name
  if (isNaN(tagId)) {
    const existing = await getUserTags(user.userId);
    const found = existing.find(t => t.name.toLowerCase() === param.toLowerCase());
    if (!found) return c.json({ error: 'Tag not found' }, 404);
    tagId = found.id;
  }

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

  // Fetch actual entries
  const client = getDataClient(c);

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
