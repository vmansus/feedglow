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
  translateParagraphs,
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
import { getReadingProgress, saveReadingProgress, getReadingHistory } from '../services/reading.js';

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

// Parse AI errors into user-friendly messages
function parseAIError(err: unknown): { message: string; code: string; status: number } {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('Incorrect API key') || msg.includes('invalid_api_key')) {
    return { message: 'API Key 无效，请在设置中检查你的 AI API Key', code: 'INVALID_API_KEY', status: 401 };
  }
  if (msg.includes('insufficient_quota') || msg.includes('exceeded your current quota')) {
    return { message: 'API 额度已用完，请充值或更换 API Key', code: 'QUOTA_EXCEEDED', status: 402 };
  }
  if (msg.includes('model_not_found') || msg.includes('does not exist')) {
    return { message: '模型不存在，请在设置中检查模型名称', code: 'MODEL_NOT_FOUND', status: 400 };
  }
  if (msg.includes('rate_limit') || msg.includes('Rate limit')) {
    return { message: 'AI 请求太频繁，请稍后再试', code: 'RATE_LIMITED', status: 429 };
  }
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED')) {
    return { message: 'AI 服务连接超时，请检查 API Base URL 是否正确', code: 'CONNECTION_ERROR', status: 504 };
  }
  if (msg.includes('No AI provider configured') || msg.includes('apiKey')) {
    return { message: '尚未配置 AI，请先在设置中填写 API Key', code: 'NOT_CONFIGURED', status: 400 };
  }

  return { message: `AI 服务异常: ${msg}`, code: 'AI_ERROR', status: 500 };
}

// Generate AI summary for entry
entries.post('/:id/summarize', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = c.get('user') as JWTPayload;
  const client = getClient(c);
  const entry = await client.getEntry(id);

  try {
    const config = await getAIConfigForUser(user.userId);
    const summary = await summarizeArticle(entry, config);

    return c.json({
      entryId: id,
      ...summary,
    });
  } catch (err) {
    const { message, code, status } = parseAIError(err);
    return c.json({ error: message, code }, status);
  }
});

// Translate paragraphs (simplified batch API)
const translateSchema = z.object({
  paragraphs: z.array(z.string()),
  language: z.string().default('zh-CN'),
});

entries.post(
  '/translate',
  zValidator('json', translateSchema),
  async (c) => {
    const { paragraphs, language } = c.req.valid('json');
    const user = c.get('user') as JWTPayload;

    if (paragraphs.length === 0) {
      return c.json({ translations: [] });
    }

    if (paragraphs.length > 10) {
      return c.json({ error: 'Too many paragraphs, max 10 per request' }, 400);
    }

    try {
      const config = await getAIConfigForUser(user.userId);
      const translations = await translateParagraphs(paragraphs, language, config);

      return c.json({ translations });
    } catch (err) {
      const { message, code, status } = parseAIError(err);
      return c.json({ error: message, code }, status);
    }
  }
);

// Generate tags for entry
entries.post('/:id/tags', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = c.get('user') as JWTPayload;
  const client = getClient(c);
  const entry = await client.getEntry(id);

  try {
    const config = await getAIConfigForUser(user.userId);
    const tags = await generateTags(entry, config);

    return c.json({
      entryId: id,
      tags,
    });
  } catch (err) {
    const { message, code, status } = parseAIError(err);
    return c.json({ error: message, code }, status);
  }
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

    try {
      const result = await chatWithArticle(entry, message, user.userId, history);

      return c.json({
        entryId: id,
        ...result,
      });
    } catch (err) {
      const { message: errMsg, code, status } = parseAIError(err);
      return c.json({ error: errMsg, code }, status);
    }
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

// ============ Reading Progress ============

// Get reading progress for an entry
entries.get('/:id/progress', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = c.get('user') as JWTPayload;

  const progress = await getReadingProgress(user.userId, id);

  if (!progress) {
    return c.json({ entryId: id, progress: null });
  }

  return c.json({ entryId: id, progress });
});

// Save reading progress
const progressSchema = z.object({
  scrollPosition: z.number().min(0).max(100),
  completed: z.boolean().default(false),
});

entries.post(
  '/:id/progress',
  zValidator('json', progressSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const { scrollPosition, completed } = c.req.valid('json');
    const user = c.get('user') as JWTPayload;

    const progress = await saveReadingProgress(user.userId, {
      entryId: id,
      scrollPosition,
      completed,
    });

    return c.json({ success: true, progress });
  }
);

// Get reading history
entries.get('/history', async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '20');

  const history = await getReadingHistory(user.userId, limit);

  return c.json({ history });
});

export default entries;
