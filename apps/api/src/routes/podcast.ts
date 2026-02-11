/**
 * Podcast / Media Routes (P1 #10)
 * 
 * Endpoints for podcast episode listing, media playback progress,
 * and feed podcast detection.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
import {
  extractEpisode,
  getEntryMedia,
  isPodcastFeed,
  saveMediaProgress,
  getMediaProgress,
  getInProgressMedia,
  getMediaStats,
} from '../services/podcast.js';

const podcast = new Hono();
podcast.use('*', authMiddleware);

// ============ Feed Podcast Detection ============

/**
 * GET /api/podcast/feeds
 * List all feeds that are detected as podcasts
 */
podcast.get('/feeds', async (c) => {
  const user = c.get('user') as JWTPayload;
  const { getPool } = await import('../feed-engine/store.js');
  const pool = getPool();

  // Single query: find feeds where >30% of entries have audio enclosures
  const result = await pool.query(`
    WITH feed_audio AS (
      SELECT 
        e.feed_id,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE e.enclosure_type LIKE 'audio/%') AS audio_count
      FROM fg_entries e
      JOIN fg_feeds f ON f.id = e.feed_id AND f.user_id = $1
      GROUP BY e.feed_id
      HAVING COUNT(*) > 0
    )
    SELECT 
      f.id, f.title, f.site_url, f.feed_url,
      f.category_id, c.title AS category_title,
      fa.audio_count AS episode_count
    FROM fg_feeds f
    JOIN feed_audio fa ON fa.feed_id = f.id
    LEFT JOIN fg_categories c ON c.id = f.category_id
    WHERE f.user_id = $1 AND fa.audio_count::float / fa.total > 0.3
    ORDER BY f.title
  `, [user.userId]);

  const podcastFeeds = result.rows.map(r => ({
    id: r.id,
    title: r.title,
    siteUrl: r.site_url,
    feedUrl: r.feed_url,
    categoryId: r.category_id,
    categoryTitle: r.category_title,
    episodeCount: parseInt(r.episode_count),
  }));

  return c.json(podcastFeeds);
});

/**
 * GET /api/podcast/feeds/:feedId/episodes
 * List podcast episodes for a feed
 */
podcast.get('/feeds/:feedId/episodes', async (c) => {
  const feedId = parseInt(c.req.param('feedId'));
  const client = getDataClient(c);

  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const status = c.req.query('status') as 'read' | 'unread' | undefined;

  const { entries, total } = await client.getFeedEntries(feedId, {
    limit,
    offset,
    status,
    order: 'published_at',
    direction: 'desc',
  });

  const episodes = entries
    .map(entry => extractEpisode(entry))
    .filter(ep => ep !== null);

  return c.json({ episodes, total });
});

// ============ Entry Media ============

/**
 * GET /api/podcast/entries/:entryId/media
 * Get all media attachments for an entry (audio, video, images)
 */
podcast.get('/entries/:entryId/media', async (c) => {
  const client = getDataClient(c);

  const entry = await client.getEntry(c.req.param('entryId'));
  const media = getEntryMedia(entry);
  const episode = extractEpisode(entry);

  return c.json({
    entryId: entry.id,
    title: entry.title,
    isPodcast: episode !== null,
    episode,
    media,
  });
});

// ============ Playback Progress ============

const progressSchema = z.object({
  position: z.number().min(0),
  duration: z.number().min(0),
});

/**
 * POST /api/podcast/progress/:entryId
 * Save playback progress for a media entry
 */
podcast.post('/progress/:entryId', zValidator('json', progressSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const client = getDataClient(c);
  const entry = await client.getEntry(c.req.param('entryId'));
  const numericId = (entry as any)._numericId;
  const { position, duration } = c.req.valid('json');

  const progress = await saveMediaProgress(user.userId, numericId, position, duration);
  return c.json(progress);
});

/**
 * GET /api/podcast/progress/:entryId
 * Get playback progress for a media entry
 */
podcast.get('/progress/:entryId', async (c) => {
  const user = c.get('user') as JWTPayload;
  const client = getDataClient(c);
  const entry = await client.getEntry(c.req.param('entryId'));
  const numericId = (entry as any)._numericId;

  const progress = await getMediaProgress(user.userId, numericId);
  return c.json(progress || { entryId: entry.id, position: 0, duration: 0, completed: false });
});

/**
 * GET /api/podcast/in-progress
 * Get all media items currently in progress (not completed)
 */
podcast.get('/in-progress', async (c) => {
  const user = c.get('user') as JWTPayload;
  const items = await getInProgressMedia(user.userId);
  return c.json(items);
});

/**
 * GET /api/podcast/stats
 * Get media listening stats
 */
podcast.get('/stats', async (c) => {
  const user = c.get('user') as JWTPayload;
  const stats = await getMediaStats(user.userId);
  return c.json(stats);
});

export default podcast;
