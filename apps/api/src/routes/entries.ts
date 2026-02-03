/**
 * Entries API Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createMinifluxClient, type EntriesFilter } from '../lib/miniflux.js';
import { authMiddleware } from '../lib/auth.js';
import {
  summarizeArticle,
  translateArticle,
  generateTags,
  getDefaultAIConfig,
} from '../services/ai.js';
import {
  extractContent,
  ContentExtractionError,
} from '../services/readability.js';

const entries = new Hono();

// Apply auth middleware to all entries routes
entries.use('*', authMiddleware);

// Helper to get client from context
function getClient(c: any) {
  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  return createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });
}

// List entries with filters
entries.get('/', async (c) => {
  const status = c.req.query('status') as EntriesFilter['status'];
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const starred = c.req.query('starred') === 'true';
  const search = c.req.query('search');
  const categoryId = c.req.query('categoryId')
    ? parseInt(c.req.query('categoryId')!)
    : undefined;
  const feedId = c.req.query('feedId')
    ? parseInt(c.req.query('feedId')!)
    : undefined;

  const client = getClient(c);
  
  // If feedId is specified, get entries for that specific feed
  if (feedId) {
    const result = await client.getFeedEntries(feedId, {
      status,
      limit,
      offset,
      order: 'published_at',
      direction: 'desc',
    });
    return c.json(result);
  }

  // Otherwise get all entries with filters
  const result = await client.getEntries({
    status,
    limit,
    offset,
    starred: starred || undefined,
    search,
    category_id: categoryId,
    order: 'published_at',
    direction: 'desc',
  });

  return c.json(result);
});

// Get single entry
entries.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  const entry = await client.getEntry(id);
  return c.json(entry);
});

// Update entry status
const updateStatusSchema = z.object({
  entryIds: z.array(z.number()),
  status: z.enum(['read', 'unread']),
});

entries.put(
  '/status',
  zValidator('json', updateStatusSchema),
  async (c) => {
    const { entryIds, status } = c.req.valid('json');
    const client = getClient(c);
    await client.updateEntryStatus(entryIds, status);
    return c.json({ success: true });
  }
);

// Mark single entry as read
entries.post('/:id/read', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.updateEntryStatus([id], 'read');
  return c.json({ success: true });
});

// Mark single entry as unread
entries.post('/:id/unread', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.updateEntryStatus([id], 'unread');
  return c.json({ success: true });
});

// Toggle bookmark
entries.post('/:id/bookmark', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.toggleEntryBookmark(id);
  return c.json({ success: true });
});

// ============ AI Features ============

// Generate AI summary for entry
entries.post('/:id/summarize', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  const entry = await client.getEntry(id);

  const config = getDefaultAIConfig();
  const summary = await summarizeArticle(entry, config);

  return c.json({
    entryId: id,
    ...summary,
  });
});

// Translate entry
const translateSchema = z.object({
  language: z.string().default('zh-CN'),
});

entries.post(
  '/:id/translate',
  zValidator('json', translateSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const { language } = c.req.valid('json');

    const client = getClient(c);
    const entry = await client.getEntry(id);

    const config = getDefaultAIConfig();
    const translation = await translateArticle(entry, language, config);

    return c.json({
      entryId: id,
      originalTitle: entry.title,
      ...translation,
    });
  }
);

// Generate tags for entry
entries.post('/:id/tags', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  const entry = await client.getEntry(id);

  const config = getDefaultAIConfig();
  const tags = await generateTags(entry, config);

  return c.json({
    entryId: id,
    tags,
  });
});

// ============ Full-text Extraction ============

// Fetch full article content from original URL
entries.get('/:id/content', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getMinifluxClient();
  
  // Get the entry to get its URL
  const entry = await client.getEntry(id);
  
  if (!entry.url) {
    return c.json({ error: 'Entry has no URL' }, 400);
  }

  try {
    const content = await extractContent(entry.url);
    return c.json({
      entryId: id,
      originalUrl: entry.url,
      ...content,
    });
  } catch (error) {
    if (error instanceof ContentExtractionError) {
      return c.json(
        { error: error.message },
        (error.statusCode as 400) || 500
      );
    }
    throw error;
  }
});

export default entries;
