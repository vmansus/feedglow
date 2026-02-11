/**
 * Reading Statistics API Routes
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
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

// Get stats summary (mapped to shared StatsSummary format)
stats.get('/summary', async (c) => {
  const user = c.get('user') as JWTPayload;
  const summary = await getStatsSummary(user.userId);
  const streak = await getStreakInfo(user.userId);

  // Map to shared flat format
  return c.json({
    totalRead: summary.allTime.articlesRead,
    totalTime: summary.allTime.timeSpent,
    currentStreak: streak.current,
    longestStreak: streak.longest,
    articlesThisWeek: summary.thisWeek.articlesRead,
    articlesLastWeek: 0, // TODO: calculate from trends
    averagePerDay: summary.thisWeek.avgPerDay,
  });
});

// Get topic distribution
stats.get('/topics', async (c) => {
  const user = c.get('user') as JWTPayload;

  // Get feed categories
  const client = getDataClient(c);
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
