/**
 * Feed Analytics Service (P2 #23)
 */

import { query } from '../lib/db.js';
import type { MinifluxClient, Feed } from '../lib/miniflux.js';

export interface FeedStats {
  feedId: number;
  title: string;
  siteUrl: string;
  totalEntries: number;
  unreadEntries: number;
  readRate: number;
  starredCount: number;
  avgReadingTime: number;
  lastPublishedAt: string | null;
  updatesPerWeek: number;
  parsing_error_count: number;
}

export interface FeedAnalytics {
  totalFeeds: number;
  totalEntries: number;
  mostActive: FeedStats[];
  leastActive: FeedStats[];
  mostRead: FeedStats[];
  neverRead: FeedStats[];
  unhealthy: FeedStats[];
}

/**
 * Get detailed stats for a single feed
 */
export async function getFeedStats(
  client: MinifluxClient,
  feed: Feed,
  userId: number
): Promise<FeedStats> {
  // Get feed entries stats
  const allEntries = await client.getFeedEntries(feed.id, { limit: 1, order: 'published_at', direction: 'desc' });
  const unreadEntries = await client.getFeedEntries(feed.id, { status: 'unread', limit: 1 });

  // Get reading stats from our DB
  const readStats = await query(
    `SELECT COUNT(*)::int AS read_count, AVG(time_spent)::int AS avg_time
     FROM fg_reading_progress
     WHERE user_id = $1 AND entry_id IN (
       SELECT DISTINCT entry_id FROM fg_user_events WHERE user_id = $1 AND feed_id = $2
     )`,
    [userId, feed.id]
  );

  const starredCount = await query(
    `SELECT COUNT(*)::int AS count FROM fg_user_events
     WHERE user_id = $1 AND feed_id = $2 AND action = 'bookmark'`,
    [userId, feed.id]
  );

  // Estimate updates per week based on total and feed age
  const totalEntries = allEntries.total;
  const checkedAt = new Date(feed.checked_at);
  const now = new Date();
  const weeksActive = Math.max(1, (now.getTime() - checkedAt.getTime()) / (7 * 86400000));

  return {
    feedId: feed.id,
    title: feed.title,
    siteUrl: feed.site_url,
    totalEntries,
    unreadEntries: unreadEntries.total,
    readRate: totalEntries > 0 ? Math.round(((totalEntries - unreadEntries.total) / totalEntries) * 100) : 0,
    starredCount: starredCount.rows[0]?.count || 0,
    avgReadingTime: readStats.rows[0]?.avg_time || 0,
    lastPublishedAt: allEntries.entries[0]?.published_at || null,
    updatesPerWeek: Math.round((totalEntries / weeksActive) * 10) / 10,
    parsing_error_count: feed.parsing_error_count,
  };
}

/**
 * Get analytics overview for all feeds
 */
export async function getFeedAnalytics(
  client: MinifluxClient,
  userId: number
): Promise<FeedAnalytics> {
  const feeds = await client.getFeeds();
  const counters = await client.getCounters();

  // Build quick stats from counters without hitting each feed individually
  const feedStats: FeedStats[] = feeds.map(feed => {
    const unreads = counters.unreads[String(feed.id)] || 0;
    const reads = counters.reads[String(feed.id)] || 0;
    const total = reads + unreads;

    return {
      feedId: feed.id,
      title: feed.title,
      siteUrl: feed.site_url,
      totalEntries: total,
      unreadEntries: unreads,
      readRate: total > 0 ? Math.round((reads / total) * 100) : 0,
      starredCount: 0,
      avgReadingTime: 0,
      lastPublishedAt: feed.checked_at,
      updatesPerWeek: 0,
      parsing_error_count: feed.parsing_error_count,
    };
  });

  // Sort for different views
  const byTotal = [...feedStats].sort((a, b) => b.totalEntries - a.totalEntries);
  const byReadRate = [...feedStats].sort((a, b) => b.readRate - a.readRate);
  const neverRead = feedStats.filter(f => f.readRate === 0 && f.totalEntries > 0);
  const unhealthy = feedStats.filter(f => f.parsing_error_count > 0);

  return {
    totalFeeds: feeds.length,
    totalEntries: feedStats.reduce((sum, f) => sum + f.totalEntries, 0),
    mostActive: byTotal.slice(0, 10),
    leastActive: byTotal.filter(f => f.totalEntries > 0).reverse().slice(0, 10),
    mostRead: byReadRate.filter(f => f.totalEntries > 5).slice(0, 10),
    neverRead: neverRead.slice(0, 20),
    unhealthy,
  };
}
