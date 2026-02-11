/**
 * Backfill Routes
 * 
 * Fetch historical articles from site sitemaps and store locally.
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
import {
  backfillFeed,
  getBackfilledEntries,
  discoverSitemapUrls,
} from '../services/backfill.js';

const backfill = new Hono();
backfill.use('*', authMiddleware);

/**
 * POST /api/backfill/:feedId
 * Start backfilling historical articles for a feed
 */
backfill.post('/:feedId', async (c) => {
  const feedId = parseInt(c.req.param('feedId'));
  const client = getDataClient(c) as any;

  const body = await c.req.json().catch(() => ({}));
  const maxArticles = body.maxArticles || 50;

  const result = await backfillFeed(client, feedId, { maxArticles });
  return c.json(result);
});

/**
 * POST /api/backfill/all
 * Backfill all existing feeds (async, returns immediately)
 */
backfill.post('/all', async (c) => {
  const client = getDataClient(c) as any;

  const body = await c.req.json().catch(() => ({}));
  const maxArticles = body.maxArticles || 50;

  const feeds = await client.getFeeds();

  // Run backfill for all feeds in background
  const backfillAll = async () => {
    const results: any[] = [];
    for (const feed of feeds) {
      try {
        const result = await backfillFeed(client, feed.id, { maxArticles });
        results.push({ feedId: feed.id, title: feed.title, ...result });
        console.log(`[backfill] ${feed.title}: discovered=${result.discovered} imported=${result.imported}`);
      } catch (err: any) {
        console.warn(`[backfill] Failed for ${feed.title}:`, err.message);
      }
      // Delay between feeds to be nice
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`[backfill] Batch complete. Processed ${results.length}/${feeds.length} feeds.`);
  };

  // Fire and forget
  backfillAll().catch(err => console.error('[backfill] Batch error:', err));

  return c.json({
    message: `Backfill started for ${feeds.length} feeds`,
    feedCount: feeds.length,
  });
});

/**
 * GET /api/backfill/:feedId/entries
 * Get backfilled entries for a feed
 */
backfill.get('/:feedId/entries', async (c) => {
  const feedId = parseInt(c.req.param('feedId'));
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const status = c.req.query('status');

  const result = await getBackfilledEntries(feedId, { limit, offset, status });
  return c.json(result);
});

/**
 * GET /api/backfill/:feedId/preview
 * Preview what URLs would be discovered from sitemap (without fetching)
 */
backfill.get('/:feedId/preview', async (c) => {
  const feedId = parseInt(c.req.param('feedId'));
  const client = getDataClient(c);

  const feed = await client.getFeed(feedId);
  const siteUrl = feed.site_url || new URL(feed.feed_url).origin;
  const urls = await discoverSitemapUrls(siteUrl);

  return c.json({
    feedId,
    siteUrl,
    discovered: urls.length,
    urls: urls.slice(0, 20), // Preview first 20
  });
});

export default backfill;
