/**
 * User Events Service (PostgreSQL)
 * Tracks reading behavior for smart ranking
 */

import { query } from '../lib/db.js';

export interface ReadEvent {
  type: 'read';
  entryId: number;
  feedId: number;
  timestamp: number;
  duration: number;    // seconds
  scrollDepth: number; // 0-1
}

export interface ActionEvent {
  type: 'action';
  entryId: number;
  feedId: number;
  timestamp: number;
  action: 'star' | 'share' | 'save' | 'click_link';
  duration: number;
}

export type UserEvent = ReadEvent | ActionEvent;

// Feed scores (from aggregation)
export interface FeedScore {
  feedId: number;
  score: number;
  readCount: number;
  avgDuration: number;
  actionCount: number;
}

/**
 * Record a read event
 */
export async function recordReadEvent(
  userId: number,
  event: Omit<ReadEvent, 'type'>
): Promise<void> {
  await query(
    `INSERT INTO fg_user_events (user_id, type, entry_id, feed_id, timestamp, duration, scroll_depth)
     VALUES ($1, 'read', $2, $3, $4, $5, $6)`,
    [userId, event.entryId, event.feedId, event.timestamp, event.duration, event.scrollDepth]
  );
}

/**
 * Record an action event
 */
export async function recordActionEvent(
  userId: number,
  event: Omit<ActionEvent, 'type' | 'duration'>
): Promise<void> {
  await query(
    `INSERT INTO fg_user_events (user_id, type, entry_id, feed_id, timestamp, action)
     VALUES ($1, 'action', $2, $3, $4, $5)`,
    [userId, event.entryId, event.feedId, event.timestamp, event.action]
  );
}

/**
 * Get feed scores based on user behavior
 */
export async function getFeedScores(userId: number): Promise<FeedScore[]> {
  const result = await query(
    `SELECT 
       feed_id,
       COUNT(*) FILTER (WHERE type = 'read') as read_count,
       COALESCE(AVG(duration) FILTER (WHERE type = 'read'), 0) as avg_duration,
       COUNT(*) FILTER (WHERE type = 'action') as action_count
     FROM fg_user_events
     WHERE user_id = $1
     GROUP BY feed_id`,
    [userId]
  );

  return result.rows.map(row => {
    const readCount = parseInt(row.read_count) || 0;
    const avgDuration = parseFloat(row.avg_duration) || 0;
    const actionCount = parseInt(row.action_count) || 0;

    // Score: weighted combination
    const score = (readCount * 1.0) + (avgDuration * 0.1) + (actionCount * 3.0);

    return {
      feedId: row.feed_id,
      score,
      readCount,
      avgDuration: Math.round(avgDuration),
      actionCount,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Calculate entry score based on user preferences
 */
export async function calculateEntryScore(
  userId: number,
  entryId: number,
  feedId: number,
  publishedAt: string
): Promise<number> {
  const scores = await getFeedScores(userId);
  const feedScore = scores.find(s => s.feedId === feedId);

  // Base score from feed preference
  let score = feedScore ? feedScore.score : 0;

  // Recency boost (newer = higher)
  const ageHours = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
  const recencyBoost = Math.max(0, 100 - ageHours * 2);
  score += recencyBoost;

  return Math.round(score * 100) / 100;
}

/**
 * Load user profile (for stats service compatibility)
 */
export async function loadUserProfile(userId: number): Promise<{ events: UserEvent[] }> {
  const result = await query(
    `SELECT * FROM fg_user_events WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 10000`,
    [userId]
  );

  const events: UserEvent[] = result.rows.map(row => {
    if (row.type === 'read') {
      return {
        type: 'read' as const,
        entryId: row.entry_id,
        feedId: row.feed_id,
        timestamp: parseInt(row.timestamp),
        duration: row.duration || 0,
        scrollDepth: row.scroll_depth || 0,
      };
    } else {
      return {
        type: 'action' as const,
        entryId: row.entry_id,
        feedId: row.feed_id,
        timestamp: parseInt(row.timestamp),
        action: row.action,
        duration: 0,
      };
    }
  });

  return { events };
}

/**
 * Get user stats summary
 */
export async function getUserStats(userId: number): Promise<{
  totalReads: number;
  totalActions: number;
  feedScores: FeedScore[];
}> {
  const countResult = await query(
    `SELECT 
       COUNT(*) FILTER (WHERE type = 'read') as total_reads,
       COUNT(*) FILTER (WHERE type = 'action') as total_actions
     FROM fg_user_events WHERE user_id = $1`,
    [userId]
  );

  const row = countResult.rows[0];
  const feedScores = await getFeedScores(userId);

  return {
    totalReads: parseInt(row.total_reads) || 0,
    totalActions: parseInt(row.total_actions) || 0,
    feedScores,
  };
}
