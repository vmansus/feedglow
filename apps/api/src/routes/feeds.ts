/**
 * Feeds API Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getMinifluxClient } from '../lib/miniflux.js';

const feeds = new Hono();

// List all feeds
feeds.get('/', async (c) => {
  const client = getMinifluxClient();
  const feedList = await client.getFeeds();
  return c.json({ feeds: feedList });
});

// Get single feed
feeds.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getMinifluxClient();
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
    const client = getMinifluxClient();
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
    const client = getMinifluxClient();
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
  const client = getMinifluxClient();
  await client.deleteFeed(id);
  return c.json({ success: true });
});

// Refresh feed
feeds.post('/:id/refresh', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getMinifluxClient();
  await client.refreshFeed(id);
  return c.json({ success: true });
});

// Refresh all feeds
feeds.post('/refresh', async (c) => {
  const client = getMinifluxClient();
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
    const client = getMinifluxClient();
    const feeds = await client.discoverFeeds(url);
    return c.json({ feeds });
  }
);

// Get feed entries
feeds.get('/:id/entries', async (c) => {
  const id = parseInt(c.req.param('id'));
  const status = c.req.query('status') as 'unread' | 'read' | undefined;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const client = getMinifluxClient();
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
