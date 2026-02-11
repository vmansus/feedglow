/**
 * Podcast / Enclosure Service (P1 #10)
 * 
 * Handles podcast detection, audio/video enclosure management,
 * and media playback progress tracking.
 */

import { type Entry, type Enclosure } from '../lib/types.js';
import { query } from '../lib/db.js';

// ============ Types ============

export interface PodcastEpisode {
  entryId: number;
  feedId: number;
  title: string;
  url: string;
  published: string;
  audioUrl: string | null;
  videoUrl: string | null;
  mimeType: string;
  duration: number | null;  // seconds, from enclosure or itunes:duration
  size: number;             // bytes
  imageUrl: string | null;
  chapters: PodcastChapter[];
  progress: number;         // seconds played
}

export interface PodcastChapter {
  start: number;  // seconds
  title: string;
}

export interface MediaProgress {
  entryId: number;
  position: number;    // seconds
  duration: number;    // total seconds
  completed: boolean;
  updatedAt: string;
}

// ============ Media Type Detection ============

const AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac',
  'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-m4a',
  'audio/x-wav', 'audio/flac', 'audio/webm',
];

const VIDEO_TYPES = [
  'video/mp4', 'video/webm', 'video/ogg', 'video/x-matroska',
  'video/quicktime', 'video/x-m4v',
];

export function isAudioEnclosure(enc: Enclosure): boolean {
  if (!enc.mime_type) return false;
  return AUDIO_TYPES.some(t => enc.mime_type.startsWith(t));
}

export function isVideoEnclosure(enc: Enclosure): boolean {
  if (!enc.mime_type) return false;
  return VIDEO_TYPES.some(t => enc.mime_type.startsWith(t));
}

export function isMediaEnclosure(enc: Enclosure): boolean {
  return isAudioEnclosure(enc) || isVideoEnclosure(enc);
}

// ============ Feed Detection ============

/**
 * Detect if a feed is a podcast based on its entries' enclosures
 */
export function isPodcastFeed(entries: Entry[]): boolean {
  if (!entries || entries.length === 0) return false;
  const withAudio = entries.filter(e => 
    e.enclosures?.some(enc => isAudioEnclosure(enc))
  );
  // If >30% of entries have audio enclosures, it's a podcast
  return withAudio.length / entries.length > 0.3;
}

// ============ Episode Extraction ============

/**
 * Extract podcast episode info from an entry
 */
export function extractEpisode(entry: Entry): PodcastEpisode | null {
  if (!entry.enclosures || entry.enclosures.length === 0) return null;

  const audioEnc = entry.enclosures.find(e => isAudioEnclosure(e));
  const videoEnc = entry.enclosures.find(e => isVideoEnclosure(e));

  if (!audioEnc && !videoEnc) return null;

  const primaryEnc = audioEnc || videoEnc!;

  // Extract image from enclosures (some podcasts include artwork as enclosure)
  const imageEnc = entry.enclosures.find(e => 
    e.mime_type?.startsWith('image/')
  );

  return {
    entryId: entry.id,
    feedId: entry.feed_id,
    title: entry.title,
    url: entry.url,
    published: entry.published_at,
    audioUrl: audioEnc?.url || null,
    videoUrl: videoEnc?.url || null,
    mimeType: primaryEnc.mime_type,
    duration: null,  // Duration comes from media_progression or podcast metadata
    size: primaryEnc.size,
    imageUrl: imageEnc?.url || null,
    chapters: [],
    progress: primaryEnc.media_progression || 0,
  };
}

/**
 * Get all media enclosures for an entry (audio, video, images)
 */
export function getEntryMedia(entry: Entry): {
  audio: Enclosure[];
  video: Enclosure[];
  images: Enclosure[];
  other: Enclosure[];
} {
  const enclosures = entry.enclosures || [];
  return {
    audio: enclosures.filter(e => isAudioEnclosure(e)),
    video: enclosures.filter(e => isVideoEnclosure(e)),
    images: enclosures.filter(e => e.mime_type?.startsWith('image/')),
    other: enclosures.filter(e => 
      !isAudioEnclosure(e) && !isVideoEnclosure(e) && !e.mime_type?.startsWith('image/')
    ),
  };
}

// ============ Playback Progress (PostgreSQL) ============

/**
 * Save media playback progress
 */
export async function saveMediaProgress(
  userId: number,
  entryId: number,
  position: number,
  duration: number
): Promise<MediaProgress> {
  const completed = duration > 0 && position / duration >= 0.95;
  
  const result = await query(
    `INSERT INTO fg_media_progress (user_id, entry_id, position, duration, completed)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, entry_id) DO UPDATE SET
       position = $3, duration = $4, completed = $5, updated_at = NOW()
     RETURNING *`,
    [userId, entryId, position, duration, completed]
  );

  const row = result.rows[0];
  return {
    entryId: row.entry_id,
    position: row.position,
    duration: row.duration,
    completed: row.completed,
    updatedAt: row.updated_at,
  };
}

/**
 * Get media playback progress for an entry
 */
export async function getMediaProgress(
  userId: number,
  entryId: number
): Promise<MediaProgress | null> {
  const result = await query(
    `SELECT * FROM fg_media_progress WHERE user_id = $1 AND entry_id = $2`,
    [userId, entryId]
  );

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  return {
    entryId: row.entry_id,
    position: row.position,
    duration: row.duration,
    completed: row.completed,
    updatedAt: row.updated_at,
  };
}

/**
 * Get all in-progress media (not completed) for a user
 */
export async function getInProgressMedia(
  userId: number
): Promise<MediaProgress[]> {
  const result = await query(
    `SELECT * FROM fg_media_progress 
     WHERE user_id = $1 AND completed = false AND position > 0
     ORDER BY updated_at DESC
     LIMIT 50`,
    [userId]
  );

  return result.rows.map(row => ({
    entryId: row.entry_id,
    position: row.position,
    duration: row.duration,
    completed: row.completed,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get playback stats for a user
 */
export async function getMediaStats(userId: number): Promise<{
  totalListened: number;
  completedEpisodes: number;
  inProgress: number;
  totalDuration: number;
}> {
  const result = await query(
    `SELECT 
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE completed = true) as completed,
       COUNT(*) FILTER (WHERE completed = false AND position > 0) as in_progress,
       COALESCE(SUM(position), 0) as total_listened,
       COALESCE(SUM(duration), 0) as total_duration
     FROM fg_media_progress WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    totalListened: parseInt(row.total_listened) || 0,
    completedEpisodes: parseInt(row.completed) || 0,
    inProgress: parseInt(row.in_progress) || 0,
    totalDuration: parseInt(row.total_duration) || 0,
  };
}

/**
 * Format seconds to human-readable duration
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
