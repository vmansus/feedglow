/**
 * Feed Sources API Routes
 * Manage external feed recommendation sources
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import {
  getFeedSources,
  addFeedSource,
  updateFeedSource,
  deleteFeedSource,
  getAggregatedFeeds,
  refreshFeedSources,
  checkSourcesHealth,
  getFeedsBySource,
  getFeedsFromSource,
  BUILTIN_SOURCES,
} from '../services/feed-sources.js';

const feedSources = new Hono();

// Auth middleware for all routes
feedSources.use('/*', authMiddleware);

// Get all feed sources (builtin + custom)
feedSources.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const sources = await getFeedSources(user.userId);
  return c.json({ sources });
});

// Get builtin sources (for reference)
feedSources.get('/builtin', async (c) => {
  return c.json({ sources: BUILTIN_SOURCES });
});

// Add a custom feed source
feedSources.post(
  '/',
  zValidator('json', z.object({
    name: z.string().min(1).max(255),
    url: z.string().url(),
    format: z.enum(['opml', 'csv', 'json', 'auto']).optional(),
  })),
  async (c) => {
    const user = c.get('user') as JWTPayload;
    const body = c.req.valid('json');
    
    const source = await addFeedSource(user.userId, body);
    return c.json({ source }, 201);
  }
);

// Update a feed source (enable/disable, edit custom)
feedSources.patch(
  '/:id',
  zValidator('json', z.object({
    enabled: z.boolean().optional(),
    name: z.string().min(1).max(255).optional(),
    url: z.string().url().optional(),
  })),
  async (c) => {
    const user = c.get('user') as JWTPayload;
    const sourceId = c.req.param('id');
    const body = c.req.valid('json');
    
    await updateFeedSource(user.userId, sourceId, body);
    return c.json({ success: true });
  }
);

// Delete a custom feed source
feedSources.delete('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const sourceId = c.req.param('id');
  
  await deleteFeedSource(user.userId, sourceId);
  return c.json({ success: true });
});

// Known popular domains with reputation scores
const DOMAIN_SCORES: Record<string, number> = {
  // Tech giants
  'techcrunch.com': 95, 'theverge.com': 95, 'wired.com': 90, 'arstechnica.com': 90,
  'engadget.com': 85, 'mashable.com': 80, 'gizmodo.com': 80, 'cnet.com': 85,
  // Dev/Tech
  'github.blog': 90, 'blog.google': 90, 'engineering.fb.com': 85, 'netflixtechblog.com': 85,
  'aws.amazon.com': 85, 'cloud.google.com': 85, 'azure.microsoft.com': 80,
  'medium.com': 70, 'dev.to': 75, 'hackernews': 85, 'lobste.rs': 80,
  // Chinese
  'sspai.com': 90, '36kr.com': 85, 'ifanr.com': 85, 'geekpark.net': 80,
  'oschina.net': 75, 'infoq.cn': 80, 'juejin.cn': 75,
  // News
  'bbc.com': 90, 'nytimes.com': 90, 'theguardian.com': 85, 'reuters.com': 90,
  'wsj.com': 85, 'economist.com': 85, 'ft.com': 80,
  // Design
  'dribbble.com': 80, 'behance.net': 80, 'designernews.co': 75,
  // YouTube channels (via feedUrl)
  'youtube.com': 70,
};

function getPopularityScore(feed: { title: string; feedUrl: string; siteUrl?: string }): number {
  const url = feed.siteUrl || feed.feedUrl;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    // Check exact match
    if (DOMAIN_SCORES[hostname]) return DOMAIN_SCORES[hostname];
    // Check partial match (e.g., blog.google.com matches google)
    for (const [domain, score] of Object.entries(DOMAIN_SCORES)) {
      if (hostname.includes(domain.split('.')[0])) return score - 10;
    }
  } catch {}
  // Default score based on title keywords
  const title = feed.title.toLowerCase();
  if (title.includes('official') || title.includes('官方')) return 65;
  if (title.includes('blog') || title.includes('博客')) return 55;
  return 50; // Unknown sources get base score
}

// Get aggregated feeds from all enabled sources
feedSources.get('/feeds', async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const category = c.req.query('category');
  const sort = c.req.query('sort') || 'popular'; // popular, shuffle, name
  
  const result = await getAggregatedFeeds(user.userId);
  
  // Filter by category if specified
  let feeds = [...result.feeds]; // Clone to avoid mutating cache
  if (category) {
    feeds = feeds.filter(f => 
      f.category?.toLowerCase().includes(category.toLowerCase()) ||
      f.tags?.some(t => t.toLowerCase().includes(category.toLowerCase()))
    );
  }
  
  // Sort feeds
  if (sort === 'popular') {
    // Sort by popularity score (descending), with slight randomization for variety
    feeds.sort((a, b) => {
      const scoreA = getPopularityScore(a) + Math.random() * 5;
      const scoreB = getPopularityScore(b) + Math.random() * 5;
      return scoreB - scoreA;
    });
  } else if (sort === 'shuffle') {
    for (let i = feeds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [feeds[i], feeds[j]] = [feeds[j], feeds[i]];
    }
  } else if (sort === 'name') {
    feeds.sort((a, b) => a.title.localeCompare(b.title));
  }
  
  // Paginate
  const total = feeds.length;
  const paged = feeds.slice(offset, offset + limit);
  
  return c.json({
    feeds: paged,
    total,
    sources: result.sources,
    fetchedAt: result.fetchedAt,
    hasMore: offset + limit < total,
  });
});

// Force refresh sources
feedSources.post('/refresh', async (c) => {
  const user = c.get('user') as JWTPayload;
  await refreshFeedSources(user.userId);
  return c.json({ success: true });
});

// Health check for all sources
feedSources.get('/health', async (c) => {
  const user = c.get('user') as JWTPayload;
  const health = await checkSourcesHealth(user.userId);
  return c.json(health);
});

// Get categories (sources grouped)
feedSources.get('/categories', async (c) => {
  const user = c.get('user') as JWTPayload;
  const result = await getFeedsBySource(user.userId);
  return c.json(result);
});

// Get feeds from a specific category/source
feedSources.get('/category/:sourceId', async (c) => {
  const user = c.get('user') as JWTPayload;
  const sourceId = c.req.param('sourceId');
  const result = await getFeedsFromSource(user.userId, sourceId);
  return c.json(result);
});

export default feedSources;
