/**
 * Feed Discovery API Routes
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
import {
  getRecommendedFeeds,
  getTrendingFeeds,
  getCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  addFeedToCollection,
  removeFeedFromCollection,
  searchFeeds,
  recordSubscription,
  searchRSSHub,
  searchRSSHubEnhanced,
  getRSSHubCategoryList,
  getRSSHubCategoryDetail,
  getRSSHubPopularRoutes,
  refreshNamespaceCache,
} from '../services/discover.js';
import { syncAllCollections, syncAwesomeRSSFeeds, syncRSSHubCollections } from '../services/collections-sync.js';
import { previewFeed, previewFeedFull, clearPreviewCache } from '../services/feed-preview.js';

const discover = new Hono();

// ============ Public Routes (No Auth Required) ============

// Preview a feed (hover tooltip - lightweight, cached)
discover.get('/preview', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'Query parameter url is required' }, 400);

  const limit = Math.min(parseInt(c.req.query('limit') || '5'), 10);

  try {
    const result = await previewFeed(url, { limit });
    // Set cache headers so browser caches too
    c.header('Cache-Control', 'public, max-age=600'); // 10 min
    return c.json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    // Check if it's an rsshub.app rate limit issue
    const isRsshubRateLimit = url.includes('rsshub.app') && (
      errorMsg.includes('rate') || 
      errorMsg.includes('cost') || 
      errorMsg.includes('testing')
    );
    
    // Return 200 with error info so Cloudflare doesn't replace response
    return c.json({
      error: 'Failed to preview feed',
      details: isRsshubRateLimit 
        ? 'rsshub.app 公共实例限流中，订阅后可正常查看' 
        : errorMsg,
      feedUrl: url,
      hint: isRsshubRateLimit ? 'Consider self-hosting RSSHub' : undefined,
      items: [], // Empty items for compatibility
    });
  }
});

// Full feed preview page (click into feed homepage)
discover.get('/preview/full', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'Query parameter url is required' }, 400);

  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    const result = await previewFeedFull(url, { limit, offset });
    return c.json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    const isRsshubRateLimit = url.includes('rsshub.app') && (
      errorMsg.includes('rate') || 
      errorMsg.includes('cost') || 
      errorMsg.includes('testing')
    );
    
    // Return 200 with error info so Cloudflare doesn't replace response
    return c.json({
      error: 'Failed to preview feed',
      details: isRsshubRateLimit 
        ? 'rsshub.app 公共实例限流中，订阅后可正常查看' 
        : errorMsg,
      feedUrl: url,
      hint: isRsshubRateLimit ? 'Consider self-hosting RSSHub' : undefined,
      items: [],
      total: 0,
    });
  }
});

// RSSHub: get all categories with counts (public)
discover.get('/rsshub/categories', async (c) => {
  try {
    const categories = await getRSSHubCategoryList();
    return c.json(categories);
  } catch (err) {
    return c.json({ error: 'Failed to load RSSHub categories', details: err instanceof Error ? err.message : '' }, 502);
  }
});

// RSSHub: get namespaces/routes for a category (public)
discover.get('/rsshub/category/:id', async (c) => {
  const categoryId = c.req.param('id');
  const lang = c.req.query('lang') || 'all';
  const sort = c.req.query('sort') || 'popular';
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    const result = await getRSSHubCategoryDetail(categoryId, { lang, sort, limit, offset });
    return c.json(result);
  } catch (err) {
    return c.json({ error: 'Failed to load category', details: err instanceof Error ? err.message : '' }, 502);
  }
});

// RSSHub: popular routes by view count (public)
discover.get('/rsshub/popular', async (c) => {
  const lang = c.req.query('lang') || 'all';
  const limit = parseInt(c.req.query('limit') || '30');
  const category = c.req.query('category') || undefined;

  try {
    const routes = await getRSSHubPopularRoutes({ lang, limit, category });
    return c.json({ routes, total: routes.length });
  } catch (err) {
    return c.json({ error: 'Failed to load popular routes', routes: [], total: 0 }, 502);
  }
});

// RSSHub: enhanced search (public)
discover.get('/rsshub/search', async (c) => {
  const keyword = c.req.query('q');
  if (!keyword) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  const lang = c.req.query('lang') || 'all';
  const category = c.req.query('category') || undefined;
  const limit = parseInt(c.req.query('limit') || '20');

  try {
    const routes = await searchRSSHubEnhanced(keyword, { lang, category, limit });
    return c.json({ query: keyword, routes, count: routes.length });
  } catch (err) {
    // Fallback to legacy domain-based search
    try {
      const legacyRoutes = await searchRSSHub(keyword);
      return c.json({ query: keyword, routes: legacyRoutes, count: legacyRoutes.length, fallback: true });
    } catch {
      return c.json({ error: 'RSSHub search failed', routes: [], count: 0 }, 502);
    }
  }
});

// ============ Public Routes: Trending & Collections ============

// Get trending feeds (public)
discover.get('/trending', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');

  const trending = await getTrendingFeeds(limit);

  return c.json({ trending });
});

// Get all collections (public)
discover.get('/collections', async (c) => {
  // Collections are public - use userId 0 for public collections
  const collections = await getCollections(0);

  return c.json({
    collections: collections.map(col => ({
      id: col.id,
      name: col.name,
      description: col.description,
      iconEmoji: col.iconEmoji,
      feedCount: col.feeds.length,
      feeds: col.feeds.map(f => ({
        id: f.feedUrl,
        title: f.title,
        url: f.feedUrl,
        siteUrl: f.siteUrl,
        description: f.description || '',
        category: f.category,
        language: f.language,
      })),
    })),
  });
});

// ============ Authenticated Routes ============

// Note: Auth middleware is applied per-route to avoid affecting public routes above

// Get recommended feeds based on user's subscriptions
discover.get('/recommended', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '10');

  const client = getDataClient(c);
  const userFeeds = await client.getFeeds();

  const recommendations = await getRecommendedFeeds(userFeeds, limit);

  return c.json({
    recommendations,
    basedOn: userFeeds.length,
  });
});

// Create collection
discover.post('/collections', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const body = await c.req.json();
  const col = await createCollection(user.userId, {
    title: body.title || body.name,
    description: body.description,
    iconEmoji: body.iconEmoji,
    isPublic: body.isPublic,
  });
  return c.json(col, 201);
});

// Get a specific collection
discover.get('/collections/:id', async (c) => {
  const id = c.req.param('id');
  const collection = await getCollection(id);
  if (!collection) return c.json({ error: 'Collection not found' }, 404);
  return c.json(collection);
});

// Update collection
discover.put('/collections/:id', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  const body = await c.req.json();
  const col = await updateCollection(id, user.userId, {
    title: body.title || body.name,
    description: body.description,
    iconEmoji: body.iconEmoji,
    isPublic: body.isPublic,
  });
  if (!col) return c.json({ error: 'Collection not found' }, 404);
  return c.json(col);
});

// Delete collection
discover.delete('/collections/:id', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  const ok = await deleteCollection(id, user.userId);
  if (!ok) return c.json({ error: 'Collection not found or not owned' }, 404);
  return c.json({ success: true });
});

// Add feed to collection
discover.post('/collections/:id/feeds', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  const body = await c.req.json();
  await addFeedToCollection(id, {
    feedUrl: body.feedUrl || body.url,
    title: body.title,
    siteUrl: body.siteUrl,
    description: body.description,
    category: body.category,
    language: body.language,
  });
  return c.json({ success: true });
});

// Remove feed from collection
discover.delete('/collections/:id/feeds', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  const body = await c.req.json();
  const ok = await removeFeedFromCollection(id, body.feedUrl || body.url);
  if (!ok) return c.json({ error: 'Feed not found in collection' }, 404);
  return c.json({ success: true });
});

// Import all feeds from a collection
discover.post('/collections/:id/import', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const collection = await getCollection(id);
  if (!collection) return c.json({ error: 'Collection not found' }, 404);

  const client = getDataClient(c);
  const existingFeeds = await client.getFeeds();
  const existingUrls = new Set(existingFeeds.map(f => f.feed_url));

  const categories = await client.getCategories();
  let category = categories.find(cat => cat.title.toLowerCase() === collection.name.toLowerCase());
  if (!category) category = await client.createCategory(collection.name);

  const results = { imported: [] as string[], skipped: [] as string[], failed: [] as string[] };

  for (const feed of collection.feeds) {
    if (existingUrls.has(feed.feedUrl)) { results.skipped.push(feed.title); continue; }
    try {
      const newFeed = await client.createFeed(feed.feedUrl, category.id);
      results.imported.push(feed.title);
      await recordSubscription(newFeed);
    } catch { results.failed.push(feed.title); }
  }

  return c.json({ success: true, ...results });
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

// Sync collections from external sources
discover.post('/collections/sync', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const body = await c.req.json().catch(() => ({}));
  const source = (body as any).source; // 'awesome' | 'rsshub' | undefined (all)

  try {
    if (source === 'awesome') {
      const result = await syncAwesomeRSSFeeds(user.userId);
      return c.json({ success: true, source: 'awesome-rss-feeds', ...result });
    } else if (source === 'rsshub') {
      const result = await syncRSSHubCollections(user.userId);
      return c.json({ success: true, source: 'rsshub', ...result });
    } else {
      const result = await syncAllCollections(user.userId);
      return c.json({ success: true, ...result });
    }
  } catch (err) {
    return c.json({ error: 'Sync failed', details: err instanceof Error ? err.message : '' }, 502);
  }
});

// ============ Admin/Protected Routes ============

// Clear preview cache (admin)
discover.post('/preview/clear-cache', authMiddleware, async (c) => {
  const result = clearPreviewCache();
  return c.json({ success: true, ...result });
});

// RSSHub: refresh namespace cache
discover.post('/rsshub/refresh-cache', authMiddleware, async (c) => {
  try {
    const stats = await refreshNamespaceCache();
    return c.json({ success: true, ...stats });
  } catch (err) {
    return c.json({ error: 'Failed to refresh cache', details: err instanceof Error ? err.message : '' }, 502);
  }
});

export default discover;
