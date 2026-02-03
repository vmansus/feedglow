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
  getAIConfigForUser,
} from '../services/ai.js';
import type { JWTPayload } from '../lib/auth.js';
import {
  extractContent,
  ContentExtractionError,
} from '../services/readability.js';
import { extractThumbnail, extractAllImages } from '../services/thumbnail.js';
import { getFeedScores, calculateEntryScore } from '../services/user-events.js';
import { chatWithArticle, indexEntry, semanticSearch } from '../services/chat.js';

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
  const user = c.get('user') as JWTPayload;
  const client = getClient(c);
  const entry = await client.getEntry(id);

  const config = await getAIConfigForUser(user.userId);
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
    const user = c.get('user') as JWTPayload;

    const client = getClient(c);
    const entry = await client.getEntry(id);

    const config = await getAIConfigForUser(user.userId);
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
  const user = c.get('user') as JWTPayload;
  const client = getClient(c);
  const entry = await client.getEntry(id);

  const config = await getAIConfigForUser(user.userId);
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
  const client = getClient(c);
  
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

// ============ Thumbnail Extraction ============

// Get entry thumbnail
entries.get('/:id/thumbnail', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  const entry = await client.getEntry(id);

  const thumbnail = extractThumbnail(entry);
  
  if (!thumbnail) {
    return c.json({ error: 'No thumbnail found' }, 404);
  }

  return c.json({
    entryId: id,
    ...thumbnail,
  });
});

// Get all images from entry
entries.get('/:id/images', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  const entry = await client.getEntry(id);

  const images = extractAllImages(entry);

  return c.json({
    entryId: id,
    images,
    count: images.length,
  });
});

// ============ AI Chat ============

// Chat with an article
const chatSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
});

entries.post(
  '/:id/chat',
  zValidator('json', chatSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const { message, history } = c.req.valid('json');
    const user = c.get('user') as JWTPayload;

    const client = getClient(c);
    const entry = await client.getEntry(id);

    // Index entry for future searches
    await indexEntry(entry, user.userId);

    const result = await chatWithArticle(entry, message, user.userId, history);

    return c.json({
      entryId: id,
      ...result,
    });
  }
);

// Index an entry for semantic search
entries.post('/:id/index', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = c.get('user') as JWTPayload;

  const client = getClient(c);
  const entry = await client.getEntry(id);

  await indexEntry(entry, user.userId);

  return c.json({ success: true, entryId: id });
});

// ============ Semantic Search ============

// Search entries semantically
entries.get('/search/semantic', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '10');
  const user = c.get('user') as JWTPayload;

  if (!query) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  const results = await semanticSearch(query, user.userId, limit);

  return c.json({
    query,
    results,
  });
});

// ============ Smart Ranking ============

// Get ranked entries (For You feed)
entries.get('/ranked', async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const client = getClient(c);

  // Get unread entries
  const result = await client.getEntries({
    status: 'unread',
    limit: Math.min(limit * 3, 200), // Fetch more to rank
    offset: 0,
    order: 'published_at',
    direction: 'desc',
  });

  // Get user's feed engagement scores
  const feedScores = await getFeedScores(user.userId);

  // Calculate scores and sort
  const rankedEntries = result.entries
    .map((entry) => ({
      ...entry,
      _score: calculateEntryScore(
        {
          id: entry.id,
          feedId: entry.feed_id,
          publishedAt: entry.published_at,
          readingTime: entry.reading_time,
        },
        feedScores
      ),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(offset, offset + limit);

  return c.json({
    total: result.total,
    entries: rankedEntries,
  });
});

export default entries;
