/**
 * Feed Discovery API Routes
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { createMinifluxClient } from '../lib/miniflux.js';
import {
  getRecommendedFeeds,
  getTrendingFeeds,
  getCollections,
  getCollection,
  searchFeeds,
  recordSubscription,
} from '../services/discover.js';

const discover = new Hono();

// Apply auth middleware
discover.use('/*', authMiddleware);

// Helper to get client from context
function getClient(c: any) {
  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  return createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });
}

// Get recommended feeds based on user's subscriptions
discover.get('/recommended', async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '10');

  const client = getClient(c);
  const userFeeds = await client.getFeeds();

  const recommendations = await getRecommendedFeeds(userFeeds, limit);

  return c.json({
    recommendations,
    basedOn: userFeeds.length,
  });
});

// Get trending feeds
discover.get('/trending', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');

  const trending = await getTrendingFeeds(limit);

  return c.json({ trending });
});

// Get curated collections
discover.get('/collections', async (c) => {
  const collections = getCollections();

  return c.json({
    collections: collections.map(col => ({
      id: col.id,
      name: col.name,
      description: col.description,
      feedCount: col.feeds.length,
    })),
  });
});

// Get a specific collection
discover.get('/collections/:id', async (c) => {
  const id = c.req.param('id');
  const collection = getCollection(id);

  if (!collection) {
    return c.json({ error: 'Collection not found' }, 404);
  }

  return c.json(collection);
});

// Import all feeds from a collection
discover.post('/collections/:id/import', async (c) => {
  const id = c.req.param('id');
  const collection = getCollection(id);

  if (!collection) {
    return c.json({ error: 'Collection not found' }, 404);
  }

  const client = getClient(c);

  // Get existing feeds to avoid duplicates
  const existingFeeds = await client.getFeeds();
  const existingUrls = new Set(existingFeeds.map(f => f.feed_url));

  // Get or create category
  const categories = await client.getCategories();
  let category = categories.find(cat => cat.title.toLowerCase() === collection.name.toLowerCase());

  if (!category) {
    category = await client.createCategory(collection.name);
  }

  // Subscribe to feeds
  const results = {
    imported: [] as string[],
    skipped: [] as string[],
    failed: [] as string[],
  };

  for (const feed of collection.feeds) {
    if (existingUrls.has(feed.feedUrl)) {
      results.skipped.push(feed.title);
      continue;
    }

    try {
      const newFeed = await client.createFeed(feed.feedUrl, category.id);
      results.imported.push(feed.title);

      // Record for trending stats
      await recordSubscription(newFeed);
    } catch (error) {
      results.failed.push(feed.title);
    }
  }

  return c.json({
    success: true,
    ...results,
  });
});

// Search feeds
discover.get('/search', async (c) => {
  const query = c.req.query('q');

  if (!query) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  const results = searchFeeds(query);

  return c.json({
    query,
    results,
  });
});

export default discover;
