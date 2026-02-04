/**
 * Reading Preferences & Progress Service (PostgreSQL)
 */

import { query } from '../lib/db.js';

// Reading preferences
export interface ReadingPreferences {
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  fontFamily: 'system' | 'serif' | 'sans-serif' | 'mono';
  lineHeight: number;
  contentWidth: 'narrow' | 'medium' | 'wide' | 'full';
  theme: 'light' | 'dark' | 'sepia' | 'system';
  autoMarkRead: boolean;
  autoMarkReadDelay: number;
  showImages: boolean;
}

// Reading progress
export interface ReadingProgress {
  entryId: number;
  progress: number;       // 0-1
  scrollPosition: number; // pixels
  timeSpent: number;      // seconds
  finished: boolean;
  lastReadAt: number;     // timestamp
}

const DEFAULT_PREFERENCES: ReadingPreferences = {
  fontSize: 'medium',
  fontFamily: 'system',
  lineHeight: 1.6,
  contentWidth: 'medium',
  theme: 'system',
  autoMarkRead: true,
  autoMarkReadDelay: 3,
  showImages: true,
};

/**
 * Get reading preferences for a user
 */
export async function getReadingPreferences(userId: number): Promise<ReadingPreferences> {
  const result = await query(
    'SELECT * FROM fg_reading_preferences WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return { ...DEFAULT_PREFERENCES };
  }

  const row = result.rows[0];
  return {
    fontSize: row.font_size,
    fontFamily: row.font_family,
    lineHeight: parseFloat(row.line_height),
    contentWidth: row.content_width,
    theme: row.theme,
    autoMarkRead: row.auto_mark_read,
    autoMarkReadDelay: row.auto_mark_read_delay,
    showImages: row.show_images,
  };
}

/**
 * Update reading preferences for a user
 */
export async function updateReadingPreferences(
  userId: number,
  updates: Partial<ReadingPreferences>
): Promise<ReadingPreferences> {
  const current = await getReadingPreferences(userId);
  const merged = { ...current, ...updates };

  await query(
    `INSERT INTO fg_reading_preferences 
       (user_id, font_size, font_family, line_height, content_width, theme, auto_mark_read, auto_mark_read_delay, show_images, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       font_size = $2, font_family = $3, line_height = $4, content_width = $5, theme = $6,
       auto_mark_read = $7, auto_mark_read_delay = $8, show_images = $9, updated_at = NOW()`,
    [userId, merged.fontSize, merged.fontFamily, merged.lineHeight, merged.contentWidth,
     merged.theme, merged.autoMarkRead, merged.autoMarkReadDelay, merged.showImages]
  );

  return merged;
}

/**
 * Get reading progress for an entry
 */
export async function getReadingProgress(userId: number, entryId: number): Promise<ReadingProgress | null> {
  const result = await query(
    'SELECT * FROM fg_reading_progress WHERE user_id = $1 AND entry_id = $2',
    [userId, entryId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    entryId: row.entry_id,
    progress: parseFloat(row.progress),
    scrollPosition: row.scroll_position,
    timeSpent: row.time_spent,
    finished: row.finished,
    lastReadAt: parseInt(row.last_read_at),
  };
}

/**
 * Save reading progress
 */
export async function saveReadingProgress(
  userId: number,
  entryId: number,
  progress: Partial<ReadingProgress>
): Promise<ReadingProgress> {
  const current = await getReadingProgress(userId, entryId);

  const merged = {
    progress: progress.progress ?? current?.progress ?? 0,
    scrollPosition: progress.scrollPosition ?? current?.scrollPosition ?? 0,
    timeSpent: (current?.timeSpent ?? 0) + (progress.timeSpent ?? 0),
    finished: progress.finished ?? current?.finished ?? false,
    lastReadAt: Date.now(),
  };

  await query(
    `INSERT INTO fg_reading_progress (user_id, entry_id, progress, scroll_position, time_spent, finished, last_read_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id, entry_id) DO UPDATE SET
       progress = $3, scroll_position = $4, time_spent = $5, finished = $6, last_read_at = $7, updated_at = NOW()`,
    [userId, entryId, merged.progress, merged.scrollPosition, merged.timeSpent, merged.finished, merged.lastReadAt]
  );

  return { entryId, ...merged };
}

/**
 * Get reading history (recent entries with progress)
 */
export async function getReadingHistory(
  userId: number,
  limit: number = 50
): Promise<ReadingProgress[]> {
  const result = await query(
    `SELECT * FROM fg_reading_progress WHERE user_id = $1 ORDER BY last_read_at DESC LIMIT $2`,
    [userId, limit]
  );

  return result.rows.map(row => ({
    entryId: row.entry_id,
    progress: parseFloat(row.progress),
    scrollPosition: row.scroll_position,
    timeSpent: row.time_spent,
    finished: row.finished,
    lastReadAt: parseInt(row.last_read_at),
  }));
}
