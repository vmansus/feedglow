/**
 * Entries API Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { EntriesFilter } from '../lib/types.js';
import { getDataClient } from '../feed-engine/data-source.js';
import { authMiddleware } from '../lib/auth.js';
import {
  summarizeArticle,
  translateParagraphs,
  generateTags,
  getAIConfigForUser,
} from '../services/ai.js';
import type { JWTPayload } from '../lib/auth.js';
import { getAISettings } from '../services/settings.js';
import {
  extractContent,
  ContentExtractionError,
} from '../services/readability.js';
import { extractThumbnail, extractAllImages } from '../services/thumbnail.js';
import { getFeedScores, type FeedScore } from '../services/user-events.js';
import { chatWithArticle, indexEntry, semanticSearch } from '../services/chat.js';
import { getReadingProgress, saveReadingProgress, getReadingHistory } from '../services/reading.js';
import { estimateReadingTime } from '../services/reading-time.js';
import { sanitizeContent, sanitizeUrl } from '../services/privacy.js';
import { backfillFeed } from '../services/backfill.js';
import { query } from '../lib/db.js';
import { addToGraph, extractTopics, addEntryTopics } from '../services/knowledge.js';
import {
  getDuplicatesForEntry,
  batchCheckDuplicates,
  getDedupSettings,
  updateDedupSettings,
} from '../services/dedup.js';
// createClient removed — using getDataClient instead

// Helper to resolve entry ID (UUID string) to numeric ID
// Returns { numericId, uuid, isBackfill } or null if not found
async function resolveEntryId(idParam: string, userId: number): Promise<{ numericId: number; uuid: string; url: string } | null> {
  // Check if it's a UUID (contains dashes)
  const isUuid = idParam.includes('-') && !idParam.startsWith('bf-');
  
  if (isUuid) {
    const result = await query(
      'SELECT id, uuid, url FROM fg_entries WHERE uuid = $1 AND user_id = $2',
      [idParam, userId]
    );
    if (result.rows[0]) {
      return { numericId: result.rows[0].id, uuid: result.rows[0].uuid, url: result.rows[0].url };
    }
    return null;
  }
  
  // Legacy numeric ID support
  const numericId = parseInt(idParam);
  if (!isNaN(numericId)) {
    const result = await query(
      'SELECT id, uuid, url FROM fg_entries WHERE id = $1 AND user_id = $2',
      [numericId, userId]
    );
    if (result.rows[0]) {
      return { numericId: result.rows[0].id, uuid: result.rows[0].uuid, url: result.rows[0].url };
    }
  }
  
  return null;
}

const entries = new Hono();

// Track backfill status per feed to avoid duplicate triggers
const backfillStatus = new Map<number, { startedAt: number; done: boolean; imported: number }>(); 
const BACKFILL_COOLDOWN = 30 * 60 * 1000; // 30 minutes cooldown

function shouldAutoBackfill(feedId: number): boolean {
  const status = backfillStatus.get(feedId);
  if (!status) return true;
  // Don't re-trigger if last run found nothing
  if (status.done && status.imported === 0) return false;
  // Don't re-trigger if still in progress
  if (!status.done) return false;
  // Allow re-trigger after cooldown if previous run found articles
  return Date.now() - status.startedAt > BACKFILL_COOLDOWN;
}

function isBackfilling(feedId: number): boolean {
  const status = backfillStatus.get(feedId);
  return !!status && !status.done;
}

// Apply auth middleware to all entries routes
entries.use('*', authMiddleware);

// Helper to get data client (works with both Miniflux and Feed Engine)
function getClient(c: any) {
  return getDataClient(c);
}

// Safe userId extraction - always returns a valid number
function getUserId(c: any): number {
  const user = c.get('user') as JWTPayload | undefined;
  const raw = user?.userId ?? c.get('userId');
  const id = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!id || isNaN(id)) throw new Error('Invalid userId');
  return id;
}

// ============ Search (must be before /:id) ============

// Full-text keyword search
entries.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const status = c.req.query('status') as EntriesFilter['status'];
  const starred = c.req.query('starred') === 'true' || undefined;
  const categoryId = c.req.query('categoryId') ? parseInt(c.req.query('categoryId')!) : undefined;
  const feedId = c.req.query('feedId') ? parseInt(c.req.query('feedId')!) : undefined;

  const client = getClient(c);

  // Use Miniflux's built-in PG full-text search
  const filter: EntriesFilter = {
    search: q,
    limit,
    offset,
    status,
    starred,
    category_id: categoryId,
    order: 'published_at',
    direction: 'desc',
  };

  let result;
  if (feedId) {
    result = await client.getFeedEntries(feedId, filter);
  } else {
    result = await client.getEntries(filter);
  }

  return c.json({
    query: q,
    ...result,
  });
});

// ============ Batch Operations (must be before /:id) ============

// Mark all entries as read
entries.post('/mark-all-read', async (c) => {
  const client = getClient(c);
  await client.markAllEntriesAsRead();
  return c.json({ success: true });
});

// Batch mark entries as read (accepts numeric IDs or UUID strings)
const batchMarkReadSchema = z.object({
  entryIds: z.array(z.union([z.number(), z.string()])).min(1).max(1000),
});

entries.post('/mark-read', zValidator('json', batchMarkReadSchema), async (c) => {
  const { entryIds } = c.req.valid('json');
  const client = getClient(c);
  const user = c.get('user') as any;
  const userId = user?.userId || user?.id;

  const { updateEntryStatus, updateEntryStatusByUuid } = await import('../feed-engine/store.js');

  for (const id of entryIds) {
    if (typeof id === 'string') {
      // Check if it's a numeric string (from dataset attributes) or a real UUID
      const numericId = parseInt(id, 10);
      if (!isNaN(numericId) && String(numericId) === id) {
        // Numeric ID passed as string (e.g. from el.dataset.entryId)
        await updateEntryStatus(numericId, userId, 'read');
      } else {
        // UUID string
        await updateEntryStatusByUuid(id, userId, 'read');
      }
    } else {
      // Numeric ID
      await updateEntryStatus(id, userId, 'read');
    }
  }
  return c.json({ success: true, count: entryIds.length });
});

// List entries with filters (enhanced)
entries.get('/', async (c) => {
  const status = c.req.query('status') as EntriesFilter['status'];
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const starred = c.req.query('starred') === 'true';
  const search = c.req.query('search');
  const order = (c.req.query('order') || 'published_at') as EntriesFilter['order'];
  const direction = (c.req.query('direction') || 'desc') as EntriesFilter['direction'];
  const before = c.req.query('before') ? parseInt(c.req.query('before')!) : undefined;
  const after = c.req.query('after') ? parseInt(c.req.query('after')!) : undefined;
  const categoryId = c.req.query('categoryId')
    ? parseInt(c.req.query('categoryId')!)
    : undefined;
  const feedId = c.req.query('feedId')
    ? parseInt(c.req.query('feedId')!)
    : undefined;
  const feedType = c.req.query('feedType') || c.req.query('feed_type') || undefined;

  const client = getClient(c);

  const filter: EntriesFilter = {
    status,
    limit,
    offset,
    starred: starred || undefined,
    search,
    category_id: categoryId,
    order,
    direction,
    before,
    after,
    feedType: feedType as any,
  };
  
  // If feedId is specified, get entries for that specific feed
  if (feedId) {
    const result = await client.getFeedEntries(feedId, filter);

    // Auto-trigger backfill when user is near the end of available entries
    if (offset + limit >= result.total && shouldAutoBackfill(feedId)) {
      backfillStatus.set(feedId, { startedAt: Date.now(), done: false, imported: 0 });
      const bgClient = getDataClient(c);
      backfillFeed(bgClient as any, feedId, { maxArticles: 200 }).then((res) => {
        backfillStatus.set(feedId, { startedAt: Date.now(), done: true, imported: res.imported });
        console.log(`[backfill] Auto-backfill for feed ${feedId}: discovered=${res.discovered} imported=${res.imported}`);
      }).catch((err) => {
        backfillStatus.set(feedId, { startedAt: Date.now(), done: true, imported: 0 });
        console.warn(`[backfill] Auto-backfill failed for feed ${feedId}:`, err.message);
      });
    }

    return c.json({
      ...result,
      backfilling: isBackfilling(feedId),
    });
  }

  // Otherwise get all entries with filters
  const result = await client.getEntries(filter);

  // Annotate entries with duplicate status
  if (result.entries.length > 0) {
    const entryNumericIds = result.entries.map((e: any) => e._numericId || e.id).filter((id: any) => typeof id === 'number');
    if (entryNumericIds.length > 0) {
      try {
        const dupeResult = await query(
          `SELECT DISTINCT entry_id FROM fg_entry_duplicates WHERE entry_id = ANY($1::int[])`,
          [entryNumericIds]
        );
        const dupeSet = new Set(dupeResult.rows.map((r: any) => r.entry_id));
        for (const entry of result.entries) {
          const numId = (entry as any)._numericId || entry.id;
          if (dupeSet.has(numId)) {
            (entry as any).isDuplicate = true;
          }
        }
      } catch { /* dedup annotation error shouldn't break listing */ }
    }
  }

  return c.json(result);
});

// ============ Dedup (must be before /:id) ============

// Manually trigger batch dedup check
entries.post('/check-duplicates', async (c) => {
  const userId = getUserId(c);
  const result = await batchCheckDuplicates(userId);
  return c.json(result);
});

// Get dedup settings
entries.get('/dedup-settings', async (c) => {
  const userId = getUserId(c);
  const settings = await getDedupSettings(userId);
  return c.json(settings);
});

// Update dedup settings
entries.put('/dedup-settings', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const settings = await updateDedupSettings(userId, body);
  return c.json({ success: true, settings });
});

// ============ Semantic Search (must be before /:id) ============

entries.get('/search/semantic', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '10');
  const user = c.get('user') as JWTPayload;

  if (!query) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  const results = await semanticSearch(query, getUserId(c), limit);

  return c.json({
    query,
    results,
  });
});

// ============ Smart Ranking (must be before /:id) ============

function scoreEntry(
  entry: { feed_id: number; published_at: string; reading_time: number },
  feedScores: FeedScore[]
): number {
  const feedScore = feedScores.find(s => s.feedId === entry.feed_id);
  let score = feedScore ? feedScore.score : 0;
  const ageHours = (Date.now() - new Date(entry.published_at).getTime()) / (1000 * 60 * 60);
  if (isNaN(ageHours)) return 0;
  score += Math.max(0, 100 - ageHours * 2);
  const rt = entry.reading_time || 0;
  if (rt >= 3 && rt <= 15) score += 10;
  return Math.round(score * 100) / 100;
}

entries.get('/ranked', async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const client = getClient(c);

  const result = await client.getEntries({
    status: 'unread',
    limit: Math.min(limit * 3, 200),
    offset: 0,
    order: 'published_at',
    direction: 'desc',
  });

  const feedScores = await getFeedScores(getUserId(c));
  const rankedEntries = result.entries
    .map((entry) => ({ ...entry, _score: scoreEntry(entry, feedScores) }))
    .sort((a, b) => b._score - a._score)
    .slice(offset, offset + limit);

  return c.json({ total: result.total, entries: rankedEntries });
});

// ============ Sync & Offline (must be before /:id) ============

entries.get('/offline-pack', async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '20');
  const client = getClient(c);

  const result = await client.getEntries({
    status: 'unread',
    limit: Math.min(limit, 50),
    order: 'published_at',
    direction: 'desc',
  });

  return c.json({
    generated_at: new Date().toISOString(),
    count: result.entries.length,
    entries: result.entries.map(e => ({
      id: e.id, title: e.title, url: e.url, author: e.author,
      content: e.content, published_at: e.published_at,
      feed_id: e.feed_id, feed_title: e.feed?.title,
      reading_time: e.reading_time, starred: e.starred, enclosures: e.enclosures,
    })),
  });
});

entries.get('/sync', async (c) => {
  const since = c.req.query('since');
  if (!since) return c.json({ error: 'Parameter "since" (unix timestamp) is required' }, 400);
  const sinceTs = parseInt(since);
  const client = getClient(c);
  const result = await client.getEntries({ after: sinceTs, limit: 200, order: 'published_at', direction: 'desc' });
  return c.json({ since: sinceTs, sync_at: Math.floor(Date.now() / 1000), count: result.entries.length, total: result.total, entries: result.entries });
});

entries.get('/history', async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '20');
  const history = await getReadingHistory(getUserId(c), limit);
  return c.json({ history });
});

// Batch get reading progress for multiple entries
entries.get('/progress/batch', async (c) => {
  const user = c.get('user') as JWTPayload;
  const userId = getUserId(c);
  const idsParam = c.req.query('ids');
  if (!idsParam) return c.json({ progress: {} });

  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 200) return c.json({ progress: {} });

  // Resolve UUIDs to numeric IDs
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
  const isUuid = ids[0]?.includes('-');

  let result;
  if (isUuid) {
    result = await query(
      `SELECT e.uuid, rp.progress, rp.finished
       FROM fg_reading_progress rp
       JOIN fg_entries e ON e.id = rp.entry_id AND e.user_id = rp.user_id
       WHERE rp.user_id = $1 AND e.uuid IN (${placeholders})`,
      [userId, ...ids]
    );
  } else {
    const numericIds = ids.map(Number).filter(n => !isNaN(n));
    const numPlaceholders = numericIds.map((_, i) => `$${i + 2}`).join(',');
    result = await query(
      `SELECT rp.entry_id, rp.progress, rp.finished
       FROM fg_reading_progress rp
       WHERE rp.user_id = $1 AND rp.entry_id IN (${numPlaceholders})`,
      [userId, ...numericIds]
    );
  }

  const progress: Record<string, { progress: number; finished: boolean }> = {};
  for (const row of result.rows) {
    const key = row.uuid || String(row.entry_id);
    progress[key] = {
      progress: parseFloat(row.progress),
      finished: row.finished,
    };
  }

  return c.json({ progress });
});

// ============ Single Entry ============

// Get single entry (enhanced with reading time + sanitized content)
entries.get('/:id', async (c) => {
  const idParam = c.req.param('id');
  const user = c.get('user') as JWTPayload;
  
  // Resolve UUID or numeric ID
  const resolved = await resolveEntryId(idParam, getUserId(c));
  if (!resolved) {
    return c.json({ error: 'Entry not found' }, 404);
  }
  
  const client = getClient(c);
  const entry = await client.getEntry(resolved.numericId);

  // Enhance with reading time estimate
  const readingTimeMinutes = entry.content ? estimateReadingTime(entry.content) : (entry.reading_time || 0);

  // Sanitize content and URL
  const sanitizedContent = entry.content ? sanitizeContent(entry.content) : entry.content;
  const sanitizedUrl = entry.url ? sanitizeUrl(entry.url) : entry.url;

  return c.json({
    ...entry,
    reading_time_minutes: readingTimeMinutes,
    sanitized_content: sanitizedContent,
    sanitized_url: sanitizedUrl,
  });
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

// Mark single entry as read (+ auto knowledge graph indexing)
entries.post('/:id/read', async (c) => {
  const idParam = c.req.param('id');
  const user = c.get('user') as JWTPayload;
  const userId = getUserId(c);
  
  const resolved = await resolveEntryId(idParam, userId);
  if (!resolved) {
    return c.json({ error: 'Entry not found' }, 404);
  }
  
  const client = getClient(c);
  await client.updateEntryStatus([resolved.numericId], 'read');

  // Auto-index to knowledge graph in background (don't block response)
  const entryId = resolved.numericId;
  (async () => {
    try {
      // Check if already in knowledge graph
      const existing = await query(
        'SELECT 1 FROM fg_knowledge_nodes WHERE user_id = $1 AND entry_id = $2',
        [userId, entryId]
      );
      if (existing.rows.length > 0) return; // Already indexed

      const entry = await client.getEntry(entryId);
      const feed = await client.getFeed(entry.feed_id);
      const entryWithIntId = { ...entry, id: entryId };

      // Add to graph (similarity edges, same-feed edges)
      await addToGraph(userId, entryWithIntId, feed.title);

      // Extract and add topics via AI
      const topics = await extractTopics(userId, entryWithIntId);
      if (topics.length > 0) {
        await addEntryTopics(userId, entryId, topics);
      }

      console.log(`[Knowledge] Auto-indexed entry ${entryId}: ${topics.length} topics`);
    } catch (err) {
      console.error(`[Knowledge] Auto-index failed for entry ${entryId}:`, err);
    }
  })();

  return c.json({ success: true });
});

// Mark single entry as unread
entries.post('/:id/unread', async (c) => {
  const idParam = c.req.param('id');
  const user = c.get('user') as JWTPayload;
  
  const resolved = await resolveEntryId(idParam, getUserId(c));
  if (!resolved) {
    return c.json({ error: 'Entry not found' }, 404);
  }
  
  const client = getClient(c);
  await client.updateEntryStatus([resolved.numericId], 'unread');
  return c.json({ success: true });
});

// Toggle bookmark
entries.post('/:id/bookmark', async (c) => {
  const idParam = c.req.param('id');
  const user = c.get('user') as JWTPayload;
  
  const resolved = await resolveEntryId(idParam, getUserId(c));
  if (!resolved) {
    return c.json({ error: 'Entry not found' }, 404);
  }
  
  const client = getClient(c);
  await client.toggleEntryBookmark(resolved.numericId);

  // Auto-fetch full content in background when bookmarking
  // (check if entry is now starred — toggle means it was just starred)
  if (resolved.url) {
    const entry = await client.getEntry(resolved.numericId);
    if (entry.starred) {
      extractContent(resolved.url).then(async (extracted) => {
        if (extracted.content && extracted.content.length > 200) {
          await query(
            'UPDATE fg_entries SET content = $1 WHERE id = $2 AND user_id = $3',
            [extracted.content, resolved.numericId, getUserId(c)]
          );
          console.log(`[bookmark] Auto-fetched full content for entry ${resolved.numericId} (${extracted.content.length} chars)`);
        }
      }).catch((err) => {
        console.warn(`[bookmark] Auto-fetch failed for ${resolved.url}:`, err.message);
      });
    }
  }

  return c.json({ success: true });
});

// ============ Duplicates ============

// Get duplicates for an entry
entries.get('/:id/duplicates', async (c) => {
  const idParam = c.req.param('id');
  const userId = getUserId(c);

  const resolved = await resolveEntryId(idParam, userId);
  if (!resolved) {
    return c.json({ error: 'Entry not found' }, 404);
  }

  const duplicates = await getDuplicatesForEntry(resolved.numericId);
  return c.json({ entryId: resolved.numericId, duplicates });
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
  const user = c.get('user') as JWTPayload;
  const client = getClient(c);
  const entry = await client.getEntry(c.req.param('id'));

  try {
    // Check if summary is enabled
    const aiSettings = await getAISettings(getUserId(c));
    if (!aiSettings.enableSummary) {
      return c.json({ error: 'AI summaries are disabled. Enable them in Settings → AI.', code: 'FEATURE_DISABLED' }, 403);
    }

    const config = await getAIConfigForUser(getUserId(c));
    const summary = await summarizeArticle(entry, config);

    return c.json({
      entryId: entry.id,
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
      // Check if translation is enabled
      const aiSettings = await getAISettings(getUserId(c));
      if (!aiSettings.enableTranslation) {
        return c.json({ error: 'AI translation is disabled. Enable it in Settings → AI.', code: 'FEATURE_DISABLED' }, 403);
      }

      const config = await getAIConfigForUser(getUserId(c));
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
  const user = c.get('user') as JWTPayload;
  const client = getClient(c);
  const entry = await client.getEntry(c.req.param('id'));

  try {
    const config = await getAIConfigForUser(getUserId(c));
    const tags = await generateTags(entry, config);

    return c.json({
      entryId: entry.id,
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
  const idParam = c.req.param('id');
  const user = c.get('user') as JWTPayload;
  
  const resolved = await resolveEntryId(idParam, getUserId(c));
  if (!resolved) {
    return c.json({ error: 'Entry not found' }, 404);
  }
  
  if (!resolved.url) {
    return c.json({ error: 'Entry has no URL' }, 400);
  }
  
  const entryUrl = resolved.url;

  try {
    // Check if full content was already fetched and saved
    const existing = await query(
      'SELECT content, content_hash FROM fg_entries WHERE id = $1',
      [resolved.numericId]
    );
    const existingContent = existing.rows[0]?.content || '';
    const alreadyFetched = existing.rows[0]?.content_hash === 'full';

    if (alreadyFetched && existingContent.length > 500) {
      // Already have full content saved, return it directly
      return c.json({
        entryId: resolved.uuid,
        originalUrl: entryUrl,
        content: existingContent,
        title: null,
      });
    }

    const content = await extractContent(entryUrl);

    // Persist to DB if fetched content is substantially longer
    if (content.content && content.content.length > existingContent.length * 1.5) {
      await query(
        'UPDATE fg_entries SET content = $1, content_hash = $2 WHERE id = $3',
        [content.content, 'full', resolved.numericId]
      );
    }

    return c.json({
      entryId: resolved.uuid,
      originalUrl: entryUrl,
      ...content,
    });
  } catch (error) {
    if (error instanceof ContentExtractionError) {
      // Provide user-friendly error messages
      let userMessage = error.message;
      if (error.statusCode === 403) {
        userMessage = '该网站拒绝了访问请求（反爬虫保护），请直接访问原文链接';
      } else if (error.statusCode === 404) {
        userMessage = '文章页面不存在或已被删除';
      } else if (error.statusCode === 408) {
        userMessage = '请求超时，网站响应太慢';
      } else if (error.statusCode === 451) {
        userMessage = '该内容在当前地区不可用';
      }
      return c.json(
        { error: userMessage },
        (error.statusCode as 400) || 500
      );
    }
    throw error;
  }
});

// ============ Thumbnail Extraction ============

// Get entry thumbnail
entries.get('/:id/thumbnail', async (c) => {
  const client = getClient(c);
  const entry = await client.getEntry(c.req.param('id'));

  const thumbnail = extractThumbnail(entry);
  
  if (!thumbnail) {
    return c.json({ error: 'No thumbnail found' }, 404);
  }

  return c.json({
    entryId: entry.id,
    ...thumbnail,
  });
});

// Get all images from entry
entries.get('/:id/images', async (c) => {
  const client = getClient(c);
  const entry = await client.getEntry(c.req.param('id'));

  const images = extractAllImages(entry);

  return c.json({
    entryId: entry.id,
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
    const { message, history } = c.req.valid('json');
    const user = c.get('user') as JWTPayload;

    const client = getClient(c);
    const entry = await client.getEntry(c.req.param('id'));

    // Index entry for future searches
    await indexEntry(entry, getUserId(c));

    try {
      const result = await chatWithArticle(entry, message, getUserId(c), history);

      return c.json({
        entryId: entry.id,
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
  const user = c.get('user') as JWTPayload;

  const client = getClient(c);
  const entry = await client.getEntry(c.req.param('id'));

  await indexEntry(entry, getUserId(c));

  return c.json({ success: true, entryId: entry.id });
});

// ============ Semantic Search ============

// ============ Reading Progress ============

// Get reading progress for an entry
entries.get('/:id/progress', async (c) => {
  const user = c.get('user') as JWTPayload;
  const userId = getUserId(c);
  const idParam = c.req.param('id');
  
  const resolved = await resolveEntryId(idParam, userId);
  if (!resolved) {
    return c.json({ entryId: idParam, progress: null });
  }

  const progress = await getReadingProgress(userId, resolved.numericId);

  if (!progress) {
    return c.json({ entryId: resolved.uuid, progress: null });
  }

  return c.json({ entryId: resolved.uuid, progress });
});

// Save reading progress
const progressSchema = z.object({
  progress: z.number().min(0).max(1),
  scrollPosition: z.number().min(0),
  timeSpent: z.number().min(0).default(0),
  finished: z.boolean().default(false),
});

entries.put(
  '/:id/progress',
  zValidator('json', progressSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user') as JWTPayload;
    const userId = getUserId(c);
    const idParam = c.req.param('id');
    
    const resolved = await resolveEntryId(idParam, userId);
    if (!resolved) {
      return c.json({ error: 'Entry not found' }, 404);
    }

    const result = await saveReadingProgress(userId, resolved.numericId, {
      progress: data.progress,
      scrollPosition: data.scrollPosition,
      timeSpent: data.timeSpent,
      finished: data.finished,
    });

    return c.json({ success: true, progress: result });
  }
);

export default entries;
