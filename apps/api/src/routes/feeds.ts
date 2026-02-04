/**
 * Feeds API Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createMinifluxClient } from '../lib/miniflux.js';
import { authMiddleware } from '../lib/auth.js';

const feeds = new Hono();

// Apply auth middleware to all feeds routes
feeds.use('*', authMiddleware);

// Helper to get client from context
function getClient(c: any) {
  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  return createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });
}

// ============ Counters (must be before /:id routes) ============

// Get unread/read counters per feed
feeds.get('/counters', async (c) => {
  const client = getClient(c);
  const counters = await client.getCounters();
  return c.json(counters);
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

// Get single feed
feeds.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  const feed = await client.getFeed(id);
  return c.json(feed);
});

// Create feed (subscribe)
const createFeedSchema = z.object({
  url: z.string().url(),
  categoryId: z.number().optional().default(0),
});

feeds.post(
  '/',
  zValidator('json', createFeedSchema),
  async (c) => {
    const { url, categoryId } = c.req.valid('json');
    const client = getClient(c);
    const feed = await client.createFeed(url, categoryId);
    return c.json(feed, 201);
  }
);

// Update feed (with advanced settings — P1 #9)
const updateFeedSchema = z.object({
  title: z.string().optional(),
  categoryId: z.number().optional(),
  disabled: z.boolean().optional(),
  crawler: z.boolean().optional(),
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
  hide_globally: z.boolean().optional(),
});

feeds.patch(
  '/:id',
  zValidator('json', updateFeedSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const updates = c.req.valid('json');
    const client = getClient(c);

    // Map our field names to Miniflux field names
    const minifluxUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) minifluxUpdates.title = updates.title;
    if (updates.categoryId !== undefined) minifluxUpdates.category_id = updates.categoryId;
    if (updates.disabled !== undefined) minifluxUpdates.disabled = updates.disabled;
    if (updates.crawler !== undefined) minifluxUpdates.crawler = updates.crawler;
    if (updates.user_agent !== undefined) minifluxUpdates.user_agent = updates.user_agent;
    if (updates.username !== undefined) minifluxUpdates.username = updates.username;
    if (updates.password !== undefined) minifluxUpdates.password = updates.password;
    if (updates.scraper_rules !== undefined) minifluxUpdates.scraper_rules = updates.scraper_rules;
    if (updates.rewrite_rules !== undefined) minifluxUpdates.rewrite_rules = updates.rewrite_rules;
    if (updates.blocklist_rules !== undefined) minifluxUpdates.blocklist_rules = updates.blocklist_rules;
    if (updates.keeplist_rules !== undefined) minifluxUpdates.keeplist_rules = updates.keeplist_rules;
    if (updates.ignore_http_cache !== undefined) minifluxUpdates.ignore_http_cache = updates.ignore_http_cache;
    if (updates.fetch_via_proxy !== undefined) minifluxUpdates.fetch_via_proxy = updates.fetch_via_proxy;
    if (updates.no_media_player !== undefined) minifluxUpdates.no_media_player = updates.no_media_player;
    if (updates.hide_globally !== undefined) minifluxUpdates.hide_globally = updates.hide_globally;

    const feed = await client.updateFeed(id, minifluxUpdates as any);
    return c.json(feed);
  }
);

// Delete feed (unsubscribe)
feeds.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.deleteFeed(id);
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
  return c.json({
    feedId: id,
    iconId: icon.id,
    mimeType: icon.mime_type,
    dataUrl: `data:${icon.mime_type};base64,${icon.data}`,
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

// ============ Feed Analytics (P2 #23) ============

feeds.get('/analytics', async (c) => {
  const { getFeedAnalytics } = await import('../services/feed-analytics.js');
  const user = c.get('user') as any;
  const client = getClient(c);
  const analytics = await getFeedAnalytics(client, user.userId);
  return c.json(analytics);
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
