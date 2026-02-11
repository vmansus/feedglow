/**
 * Feeds API Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDataClient } from '../feed-engine/data-source.js';
import { authMiddleware } from '../lib/auth.js';
import { backfillFeed } from '../services/backfill.js';
import { query } from '../lib/db.js';

const feeds = new Hono();

// Apply auth middleware to all feeds routes
feeds.use('*', authMiddleware);

// Helper to get data client (works with both Miniflux and Feed Engine)
function getClient(c: any) {
  return getDataClient(c);
}

// ============ Counters (must be before /:id routes) ============

// Get unread/read counters per feed
feeds.get('/counters', async (c) => {
  const client = getClient(c);
  const counters = await client.getCounters();
  return c.json(counters);
});

// Get unread counts by feed type
feeds.get('/type-counts', async (c) => {
  const { getUnreadCountsByType } = await import('../feed-engine/store.js');
  const user = c.get('user') as any;
  const counts = await getUnreadCountsByType(user.userId);
  return c.json(counts);
});

// Get feeds with health issues
feeds.get('/health', async (c) => {
  const client = getClient(c);
  const feedList = await client.getFeeds();
  const unhealthy = feedList.filter(f => f.parsing_error_count > 0 || f.disabled);
  return c.json({
    total: unhealthy.length,
    feeds: unhealthy.map(f => ({
      id: f.id,
      title: f.title,
      site_url: f.site_url,
      feed_url: f.feed_url,
      parsing_error_count: f.parsing_error_count,
      parsing_error_message: f.parsing_error_message,
      checked_at: f.checked_at,
      disabled: f.disabled,
    })),
  });
});

// List all feeds
feeds.get('/', async (c) => {
  const client = getClient(c);
  const feedList = await client.getFeeds();
  return c.json(feedList);
});

// Search feeds by name/URL
feeds.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json([]);
  const client = getClient(c);
  const feedList = await client.getFeeds();
  const term = q.toLowerCase();
  const matched = feedList.filter(f => 
    f.title?.toLowerCase().includes(term) || 
    f.feed_url?.toLowerCase().includes(term) ||
    f.site_url?.toLowerCase().includes(term) ||
    f.category?.title?.toLowerCase().includes(term)
  );
  return c.json(matched.slice(0, 10));
});

// ============ Feed Analytics (P2 #23) ============
// Must be before /:id to avoid being caught by parameter route

feeds.get('/analytics', async (c) => {
  const { getFeedAnalytics } = await import('../services/feed-analytics.js');
  const user = c.get('user') as any;
  const client = getClient(c);
  const analytics = await getFeedAnalytics(client, user.userId);
  return c.json(analytics);
});

// Get single feed
feeds.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid feed ID' }, 400);
  try {
    const client = getClient(c);
    const feed = await client.getFeed(id);
    if (!feed) return c.json({ error: 'Feed not found' }, 404);
    return c.json(feed);
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('not found') || msg.includes('404')) {
      return c.json({ error: 'Feed not found' }, 404);
    }
    throw err;
  }
});

// Create feed (subscribe) — accept both "url" and "feedUrl" for compat
// Accept any non-empty string (not just strict URLs) to support platform URLs like "youtube.com/@handle"
const createFeedSchema = z.object({
  url: z.string().min(1).optional(),
  feedUrl: z.string().min(1).optional(),
  feed_url: z.string().min(1).optional(),
  categoryId: z.number().optional().default(0),
  category_id: z.number().optional(),
}).transform(data => {
  let url = data.url || data.feedUrl || data.feed_url || '';
  // Auto-prepend https:// if missing protocol
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return { url, categoryId: data.categoryId || data.category_id || 0 };
}).refine(data => data.url.length > 0, { message: 'url or feedUrl is required' });

feeds.post(
  '/',
  zValidator('json', createFeedSchema),
  async (c) => {
    const { url, categoryId } = c.req.valid('json');
    const client = getClient(c);
    try {
      const feed = await client.createFeed(url, categoryId);

      // Auto-backfill historical articles (async, don't block response)
      backfillFeed(client, feed.id, { maxArticles: 200 }).catch((err) => {
        console.warn(`[backfill] Auto-backfill failed for feed ${feed.id}:`, err.message);
      });

      return c.json(feed, 201);
    } catch (err: any) {
      const msg = err?.message || String(err);
      // Parse common Miniflux errors into friendly messages
      if (msg.includes('401') || msg.includes('unauthorized')) {
        return c.json({ error: '订阅源需要认证，请在 Feed 设置中配置用户名和密码', details: msg }, 403);
      }
      if (msg.includes('404') || msg.includes('not found')) {
        return c.json({ error: '未找到有效的 RSS/Atom 订阅源', details: msg }, 404);
      }
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        return c.json({ error: '该订阅源已存在', details: msg }, 409);
      }
      if (msg.includes('invalid') || msg.includes('parse')) {
        return c.json({ error: '无法解析该 URL 的内容为订阅源', details: msg }, 422);
      }
      return c.json({ error: '添加订阅源失败', details: msg }, 500);
    }
  }
);

// Update feed (with advanced settings — P1 #9)
const updateFeedSchema = z.object({
  title: z.string().optional(),
  categoryId: z.number().optional(),
  disabled: z.boolean().optional(),
  crawler: z.boolean().optional(),
  feed_type: z.enum(['article', 'social', 'notification', 'picture', 'video']).optional(),
  hide_globally: z.boolean().optional(),
  user_agent: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  scraper_rules: z.string().optional(),
  rewrite_rules: z.string().optional(),
  blocklist_rules: z.string().optional(),
  keeplist_rules: z.string().optional(),
  ignore_http_cache: z.boolean().optional(),
  fetch_via_proxy: z.boolean().optional(),
  no_media_player: z.boolean().optional(),
  polling_frequency: z.number().min(5).max(1440).optional(),
  notify_on_update: z.boolean().optional(),
});

// Support both PUT and PATCH for feed updates
const updateFeedHandler = async (c: any) => {
    const id = parseInt(c.req.param('id'));
    const updates = c.req.valid('json');
    const client = getClient(c);

    // Map frontend field names to API field names
    const feedUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) feedUpdates.title = updates.title;
    if (updates.categoryId !== undefined) feedUpdates.category_id = updates.categoryId;
    if (updates.disabled !== undefined) feedUpdates.disabled = updates.disabled;
    if (updates.crawler !== undefined) feedUpdates.crawler = updates.crawler;
    if (updates.feed_type !== undefined) feedUpdates.feed_type = updates.feed_type;
    if (updates.user_agent !== undefined) feedUpdates.user_agent = updates.user_agent;
    if (updates.username !== undefined) feedUpdates.username = updates.username;
    if (updates.password !== undefined) feedUpdates.password = updates.password;
    if (updates.scraper_rules !== undefined) feedUpdates.scraper_rules = updates.scraper_rules;
    if (updates.rewrite_rules !== undefined) feedUpdates.rewrite_rules = updates.rewrite_rules;
    if (updates.blocklist_rules !== undefined) feedUpdates.blocklist_rules = updates.blocklist_rules;
    if (updates.keeplist_rules !== undefined) feedUpdates.keeplist_rules = updates.keeplist_rules;
    if (updates.ignore_http_cache !== undefined) feedUpdates.ignore_http_cache = updates.ignore_http_cache;
    if (updates.fetch_via_proxy !== undefined) feedUpdates.fetch_via_proxy = updates.fetch_via_proxy;
    if (updates.no_media_player !== undefined) feedUpdates.no_media_player = updates.no_media_player;
    if (updates.hide_globally !== undefined) feedUpdates.hide_globally = updates.hide_globally;
    if (updates.polling_frequency !== undefined) feedUpdates.pollingFrequency = updates.polling_frequency;
    if (updates.notify_on_update !== undefined) feedUpdates.notify_on_update = updates.notify_on_update;

    const feed = await client.updateFeed(id, feedUpdates as any);
    return c.json(feed);
};

feeds.patch('/:id', zValidator('json', updateFeedSchema), updateFeedHandler);
feeds.put('/:id', zValidator('json', updateFeedSchema), updateFeedHandler);

// Delete feed (unsubscribe)
feeds.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.deleteFeed(id);
  return c.json({ success: true });
});

// Reorder feeds and move between categories
feeds.post('/reorder', async (c) => {
  const user = c.get('user') as any;
  const body = await c.req.json();
  const { feedId, categoryId, position } = body as { feedId: number; categoryId?: number; position?: number };

  if (!feedId) return c.json({ error: 'feedId is required' }, 400);

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (categoryId !== undefined) {
    updates.push(`category_id = $${idx++}`);
    values.push(categoryId || null);
  }
  if (position !== undefined) {
    updates.push(`position = $${idx++}`);
    values.push(position);
  }

  if (updates.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  values.push(feedId, user.userId);
  await query(
    `UPDATE fg_feeds SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx++}`,
    values
  );

  return c.json({ success: true });
});

// Batch reorder (multiple feeds at once)
feeds.post('/reorder/batch', async (c) => {
  const user = c.get('user') as any;
  const body = await c.req.json();
  const { items } = body as { items: { feedId: number; categoryId?: number; position: number }[] };

  if (!items?.length) return c.json({ error: 'items required' }, 400);

  for (const item of items) {
    if (item.categoryId !== undefined) {
      await query(
        `UPDATE fg_feeds SET category_id = $1, position = $2 WHERE id = $3 AND user_id = $4`,
        [item.categoryId || null, item.position, item.feedId, user.userId]
      );
    } else {
      await query(
        `UPDATE fg_feeds SET position = $1 WHERE id = $2 AND user_id = $3`,
        [item.position, item.feedId, user.userId]
      );
    }
  }

  return c.json({ success: true });
});

// Reorder categories
feeds.post('/categories/reorder', async (c) => {
  const user = c.get('user') as any;
  const body = await c.req.json();
  const { items } = body as { items: { categoryId: number; position: number; parentId?: number | null }[] };

  if (!items?.length) return c.json({ error: 'items required' }, 400);

  for (const item of items) {
    if (item.parentId !== undefined) {
      await query(
        `UPDATE fg_categories SET position = $1, parent_id = $2 WHERE id = $3 AND user_id = $4`,
        [item.position, item.parentId, item.categoryId, user.userId]
      );
    } else {
      await query(
        `UPDATE fg_categories SET position = $1 WHERE id = $2 AND user_id = $3`,
        [item.position, item.categoryId, user.userId]
      );
    }
  }

  return c.json({ success: true });
});

// Refresh feed
feeds.post('/:id/refresh', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.refreshFeed(id);
  return c.json({ success: true });
});

// Refresh all feeds
feeds.post('/refresh', async (c) => {
  const client = getClient(c);
  await client.refreshAllFeeds();
  return c.json({ success: true });
});

// Discover feeds from URL
const discoverSchema = z.object({
  url: z.string().url(),
});

feeds.post(
  '/discover',
  zValidator('json', discoverSchema),
  async (c) => {
    const { url } = c.req.valid('json');
    const client = getClient(c);
    const feeds = await client.discoverFeeds(url);
    return c.json({ feeds });
  }
);

// Get feed icon
feeds.get('/:id/icon', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  const icon = await client.getFeedIcon(id);
  
  if (!icon) {
    return c.json({ error: 'No icon found' }, 404);
  }
  
  // Return as data URL for easy frontend use
  // Miniflux icon.data may already contain "mime;base64," prefix — avoid duplicating
  const data = icon.data || '';
  const dataUrl = data.startsWith('data:')
    ? data
    : data.includes(';base64,')
      ? `data:${data}`
      : `data:${icon.mime_type};base64,${data}`;

  return c.json({
    feedId: id,
    iconId: icon.id,
    mimeType: icon.mime_type,
    dataUrl,
  });
});

// Mark all feed entries as read
feeds.post('/:id/mark-read', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.markFeedEntriesAsRead(id);
  return c.json({ success: true });
});

// Get feed entries
feeds.get('/:id/entries', async (c) => {
  const id = parseInt(c.req.param('id'));
  const status = c.req.query('status') as 'unread' | 'read' | undefined;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const client = getClient(c);
  const entries = await client.getFeedEntries(id, {
    status,
    limit,
    offset,
    order: 'published_at',
    direction: 'desc',
  });

  return c.json(entries);
});

// ============ Subscribe from URL (P2 #22 - browser extension) ============

const subscribeSchema = z.object({
  url: z.string().url(),
  categoryId: z.number().optional(),
});

feeds.post(
  '/subscribe',
  zValidator('json', subscribeSchema),
  async (c) => {
    const { url, categoryId } = c.req.valid('json');
    const client = getClient(c);

    // Auto-discover RSS from any URL
    try {
      const discovered = await client.discoverFeeds(url);
      if (discovered.length === 0) {
        return c.json({ error: 'No RSS feed found at this URL' }, 404);
      }

      if (discovered.length === 1) {
        // Auto-subscribe to the single discovered feed
        const feed = await client.createFeed(discovered[0].url, categoryId || 0);

        // Auto-backfill historical articles (async, don't block response)
        backfillFeed(client, feed.id, { maxArticles: 200 }).catch((err) => {
          console.warn(`[backfill] Auto-backfill failed for feed ${feed.id}:`, err.message);
        });

        return c.json({ subscribed: true, feed, discovered: discovered });
      }

      // Multiple feeds found, return choices
      return c.json({ subscribed: false, discovered, message: 'Multiple feeds found. Choose one to subscribe.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to discover feed: ${msg}` }, 400);
    }
  }
);

// ============ Manual Backfill from Feed Page ============

feeds.post('/:id/backfill', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  const body = await c.req.json().catch(() => ({}));
  const maxArticles = body.maxArticles || 50;

  const result = await backfillFeed(client, id, { maxArticles });
  return c.json(result);
});

// Get stats for single feed
feeds.get('/:id/stats', async (c) => {
  const { getFeedStats } = await import('../services/feed-analytics.js');
  const id = parseInt(c.req.param('id'));
  const user = c.get('user') as any;
  const client = getClient(c);
  const feed = await client.getFeed(id);
  const stats = await getFeedStats(client, feed, user.userId);
  return c.json(stats);
});

export default feeds;
