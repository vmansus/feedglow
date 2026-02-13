/**
 * Podcast / Media Routes (P1 #10)
 * 
 * Endpoints for podcast episode listing, media playback progress,
 * and feed podcast detection.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, verifyToken, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
import { FeedEngineDataClient } from '../feed-engine/data-source.js';
import {
  extractEpisode,
  getEntryMedia,
  isPodcastFeed,
  saveMediaProgress,
  getMediaProgress,
  getInProgressMedia,
  getMediaStats,
} from '../services/podcast.js';
import { getTranscriptForEntry } from '../services/transcript.js';

const podcast = new Hono();

// Auth middleware for all routes EXCEPT /stream/* which handles its own auth
// (HTML5 Audio element cannot set custom headers, so stream accepts ?token= query param)
podcast.use('*', async (c, next) => {
  if (c.req.path.match(/\/stream\//)) {
    return next();
  }
  return authMiddleware(c, next);
});

// ============ Audio Streaming Proxy ============

/**
 * GET /api/podcast/stream/:entryId
 * Proxy audio stream with proper Range request support.
 * This ensures seeking always works regardless of the origin server's capabilities.
 * 
 * Accepts auth via:
 *   - Authorization: Bearer <token> header (standard)
 *   - ?token=<jwt> query parameter (for HTML5 Audio element which can't set headers)
 */
podcast.get('/stream/:entryId', async (c) => {
  // Try Authorization header first, then query param
  let user: JWTPayload | null = null;

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    user = await verifyToken(authHeader.slice(7));
  }

  if (!user) {
    const tokenParam = c.req.query('token');
    if (tokenParam) {
      user = await verifyToken(tokenParam);
    }
  }

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const client = new FeedEngineDataClient(user.userId);
  const entry = await client.getEntry(c.req.param('entryId'));

  // Find audio URL from enclosures
  const audioEnc = entry.enclosures?.find(
    (enc: { mime_type: string }) => enc.mime_type?.startsWith('audio/')
  );
  if (!audioEnc) {
    return c.json({ error: 'No audio found for this entry' }, 404);
  }

  const audioUrl = audioEnc.url;
  const rangeHeader = c.req.header('range');

  // Build headers for the upstream fetch
  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'FeedGlow/1.0',
  };
  if (rangeHeader) {
    upstreamHeaders['Range'] = rangeHeader;
  }

  try {
    const upstream = await fetch(audioUrl, {
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206) {
      return c.json({ error: 'Failed to fetch audio from origin' }, 502);
    }

    // Build response headers
    const responseHeaders = new Headers();

    const contentType = upstream.headers.get('content-type') || audioEnc.mime_type || 'audio/mpeg';
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=86400');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    // If upstream returned 206, pass it through; otherwise use its status
    const status = upstream.status === 206 ? 206 : 200;

    // Stream the body through without buffering
    return new Response(upstream.body, {
      status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('Audio proxy error:', err);
    return c.json({ error: 'Audio proxy failed' }, 502);
  }
});

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

// ============ Transcript ============

/**
 * GET /api/podcast/transcript/:entryId
 * Extract and return transcript for a podcast episode.
 * Looks for transcript URLs in the entry content and parses them.
 * Results are cached in fg_transcripts table.
 */
podcast.get('/transcript/:entryId', async (c) => {
  const user = c.get('user') as JWTPayload;
  const client = new FeedEngineDataClient(user.userId);
  
  try {
    const entry = await client.getEntry(c.req.param('entryId'));
    const numericId = (entry as any)._numericId;
    
    const transcript = await getTranscriptForEntry(numericId, entry.content || '');
    
    if (!transcript) {
      return c.json({ error: 'No transcript found', segments: [], source: null, url: null }, 404);
    }
    
    return c.json(transcript);
  } catch (err: any) {
    if (err.status === 404) {
      return c.json({ error: 'Entry not found' }, 404);
    }
    console.error('[Transcript] Error:', err);
    return c.json({ error: 'Failed to fetch transcript' }, 500);
  }
});

export default podcast;
