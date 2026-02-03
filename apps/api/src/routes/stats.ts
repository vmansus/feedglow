/**
 * Reading Statistics API Routes
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { createMinifluxClient } from '../lib/miniflux.js';
import {
  getStatsSummary,
  getTopicStats,
  getTrends,
  getStreakInfo,
  getAchievements,
  getAllAchievements,
} from '../services/stats.js';

const stats = new Hono();

// Apply auth middleware
stats.use('/*', authMiddleware);

// Helper to get client from context
function getClient(c: any) {
  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  return createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });
}

// Get stats summary
stats.get('/summary', async (c) => {
  const user = c.get('user') as JWTPayload;
  const summary = await getStatsSummary(user.userId);

  return c.json(summary);
});

// Get topic distribution
stats.get('/topics', async (c) => {
  const user = c.get('user') as JWTPayload;

  // Get feed categories from Miniflux
  const client = getClient(c);
  const feeds = await client.getFeeds();

  const feedCategories: Record<number, string> = {};
  for (const feed of feeds) {
    feedCategories[feed.id] = feed.category?.title || 'Uncategorized';
  }

  const topics = await getTopicStats(user.userId, feedCategories);

  return c.json({ topics });
});

// Get reading trends
stats.get('/trends', async (c) => {
  const user = c.get('user') as JWTPayload;
  const days = parseInt(c.req.query('days') || '30');

  const trends = await getTrends(user.userId, Math.min(days, 90));

  return c.json({ trends });
});

// Get streak info
stats.get('/streaks', async (c) => {
  const user = c.get('user') as JWTPayload;
  const streak = await getStreakInfo(user.userId);

  return c.json(streak);
});

// Get unlocked achievements
stats.get('/achievements', async (c) => {
  const user = c.get('user') as JWTPayload;
  const achievements = await getAchievements(user.userId);

  return c.json({ achievements });
});

// Get all achievements with status
stats.get('/achievements/all', async (c) => {
  const user = c.get('user') as JWTPayload;
  const achievements = await getAllAchievements(user.userId);

  return c.json({ achievements });
});

export default stats;
