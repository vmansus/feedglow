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

// Update feed
const updateFeedSchema = z.object({
  title: z.string().optional(),
  categoryId: z.number().optional(),
  disabled: z.boolean().optional(),
  crawler: z.boolean().optional(),
});

feeds.patch(
  '/:id',
  zValidator('json', updateFeedSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const updates = c.req.valid('json');
    const client = getClient(c);
    const feed = await client.updateFeed(id, {
      title: updates.title,
      category_id: updates.categoryId,
      disabled: updates.disabled,
      crawler: updates.crawler,
    } as any);
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

export default feeds;
