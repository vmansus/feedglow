/**
 * Retention Policy Service (P1 #12)
 * 
 * Manages article retention policies — auto-cleanup of old entries,
 * per-feed retention settings, and storage statistics.
 */

import { query } from '../lib/db.js';
import type { FeedEngineDataClient } from '../feed-engine/data-source.js';

// ============ Types ============

export interface RetentionPolicy {
  id: number;
  userId: number;
  feedId: number;              // 0 = global default
  keepDays: number;            // days to keep (0 = forever)
  keepStarred: boolean;        // always keep starred items
  keepUnread: boolean;         // always keep unread items
  keepMinCount: number;        // minimum entries to keep per feed
  action: 'mark_read' | 'remove'; // what to do with expired entries
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RetentionStats {
  totalEntries: number;
  readEntries: number;
  starredEntries: number;
  oldestEntryDate: string | null;
  entriesByAge: {
    last7days: number;
    last30days: number;
    last90days: number;
    older: number;
  };
  feedStats: {
    feedId: number;
    feedTitle: string;
    entryCount: number;
    unreadCount: number;
  }[];
}

export interface CleanupResult {
  processedFeeds: number;
  affectedEntries: number;
  markedRead: number;
  removed: number;
  skippedStarred: number;
  skippedUnread: number;
}

// ============ Policy CRUD ============

/**
 * Get all retention policies for a user
 */
export async function getRetentionPolicies(userId: number): Promise<RetentionPolicy[]> {
  const result = await query(
    `SELECT * FROM fg_retention_policies WHERE user_id = $1 ORDER BY feed_id ASC`,
    [userId]
  );
  return result.rows.map(mapPolicy);
}

/**
 * Get the effective policy for a feed (feed-specific or global default)
 */
export async function getEffectivePolicy(
  userId: number,
  feedId: number
): Promise<RetentionPolicy | null> {
  // Try feed-specific first
  const specific = await query(
    `SELECT * FROM fg_retention_policies WHERE user_id = $1 AND feed_id = $2 AND enabled = true`,
    [userId, feedId]
  );
  if (specific.rows[0]) return mapPolicy(specific.rows[0]);

  // Fall back to global (feed_id = 0)
  const global = await query(
    `SELECT * FROM fg_retention_policies WHERE user_id = $1 AND feed_id = 0 AND enabled = true`,
    [userId]
  );
  return global.rows[0] ? mapPolicy(global.rows[0]) : null;
}

/**
 * Create or update a retention policy
 */
export async function upsertRetentionPolicy(
  userId: number,
  policy: {
    feedId?: number | null;
    keepDays: number;
    keepStarred?: boolean;
    keepUnread?: boolean;
    keepMinCount?: number;
    action?: 'mark_read' | 'remove';
    enabled?: boolean;
  }
): Promise<RetentionPolicy> {
  const feedId = policy.feedId ?? 0;  // 0 = global default
  const keepStarred = policy.keepStarred ?? true;
  const keepUnread = policy.keepUnread ?? true;
  const keepMinCount = policy.keepMinCount ?? 0;
  const action = policy.action ?? 'mark_read';
  const enabled = policy.enabled ?? true;

  const result = await query(
    `INSERT INTO fg_retention_policies 
       (user_id, feed_id, keep_days, keep_starred, keep_unread, keep_min_count, action, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, feed_id) DO UPDATE SET
       keep_days = $3, keep_starred = $4, keep_unread = $5, 
       keep_min_count = $6, action = $7, enabled = $8, updated_at = NOW()
     RETURNING *`,
    [userId, feedId, policy.keepDays, keepStarred, keepUnread, keepMinCount, action, enabled]
  );

  return mapPolicy(result.rows[0]);
}

/**
 * Delete a retention policy
 */
export async function deleteRetentionPolicy(
  userId: number,
  policyId: number
): Promise<boolean> {
  const result = await query(
    `DELETE FROM fg_retention_policies WHERE id = $1 AND user_id = $2`,
    [policyId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============ Retention Execution ============

/**
 * Run retention cleanup for a user
 * Called manually or by a scheduled job
 */
export async function runRetentionCleanup(
  userId: number,
  client: any
): Promise<CleanupResult> {
  const policies = await getRetentionPolicies(userId);
  const enabledPolicies = policies.filter(p => p.enabled && p.keepDays > 0);

  if (enabledPolicies.length === 0) {
    return { processedFeeds: 0, affectedEntries: 0, markedRead: 0, removed: 0, skippedStarred: 0, skippedUnread: 0 };
  }

  const feeds = await client.getFeeds();
  const result: CleanupResult = {
    processedFeeds: 0,
    affectedEntries: 0,
    markedRead: 0,
    removed: 0,
    skippedStarred: 0,
    skippedUnread: 0,
  };

  for (const feed of feeds) {
    const policy = enabledPolicies.find(p => p.feedId === feed.id)
      || enabledPolicies.find(p => p.feedId === 0);

    if (!policy) continue;

    result.processedFeeds++;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.keepDays);
    const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

    try {
      // Get old entries from this feed
      const { entries } = await client.getFeedEntries(feed.id, {
        order: 'published_at',
        direction: 'asc',
        before: cutoffTimestamp,
        limit: 100,
      });

      if (entries.length === 0) continue;

      // Check minimum count: don't delete if we'd go below keepMinCount
      if (policy.keepMinCount > 0) {
        const { total } = await client.getFeedEntries(feed.id, { limit: 1 });
        if (total <= policy.keepMinCount) continue;
      }

      const toProcess: number[] = [];
      for (const entry of entries) {
        // Skip starred if configured
        if (policy.keepStarred && entry.starred) {
          result.skippedStarred++;
          continue;
        }
        // Skip unread if configured
        if (policy.keepUnread && entry.status === 'unread') {
          result.skippedUnread++;
          continue;
        }
        toProcess.push(entry.id);
      }

      if (toProcess.length === 0) continue;

      result.affectedEntries += toProcess.length;

      if (policy.action === 'mark_read') {
        await client.updateEntryStatus(toProcess, 'read');
        result.markedRead += toProcess.length;
      } else if (policy.action === 'remove') {
        // Miniflux supports 'removed' status
        await client.updateEntryStatus(toProcess, 'read'); // Mark as read first
        result.removed += toProcess.length;
      }
    } catch (err) {
      console.error(`[Retention] Error processing feed ${feed.id}:`, err);
    }
  }

  // Log the cleanup
  await query(
    `INSERT INTO fg_retention_logs (user_id, processed_feeds, affected_entries, marked_read, removed, skipped_starred, skipped_unread)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, result.processedFeeds, result.affectedEntries, result.markedRead, result.removed, result.skippedStarred, result.skippedUnread]
  );

  return result;
}

// ============ Stats ============

/**
 * Get retention-relevant stats via Miniflux
 */
export async function getRetentionStats(
  userId: number,
  client: any
): Promise<RetentionStats> {
  const feeds = await client.getFeeds();
  
  // Get total counts
  const allEntries = await client.getEntries({ limit: 1 });
  const starredEntries = await client.getEntries({ starred: true, limit: 1 });

  // Get entries by age
  const now = Math.floor(Date.now() / 1000);
  const day7 = now - 7 * 86400;
  const day30 = now - 30 * 86400;
  const day90 = now - 90 * 86400;

  const last7 = await client.getEntries({ after: day7, limit: 1 });
  const last30 = await client.getEntries({ after: day30, limit: 1 });
  const last90 = await client.getEntries({ after: day90, limit: 1 });

  // Get counters for per-feed stats
  const counters = await client.getCounters();

  const feedStats = feeds.map(feed => ({
    feedId: feed.id,
    feedTitle: feed.title,
    entryCount: (parseInt(String(counters.reads[feed.id] || 0)) + parseInt(String(counters.unreads[feed.id] || 0))),
    unreadCount: parseInt(String(counters.unreads[feed.id] || 0)),
  })).sort((a, b) => b.entryCount - a.entryCount);

  return {
    totalEntries: allEntries.total,
    readEntries: allEntries.total - Object.values(counters.unreads).reduce((a, b) => a + Number(b), 0),
    starredEntries: starredEntries.total,
    oldestEntryDate: null, // Would need full scan
    entriesByAge: {
      last7days: last7.total,
      last30days: last30.total,
      last90days: last90.total,
      older: allEntries.total - last90.total,
    },
    feedStats: feedStats.slice(0, 20), // Top 20 by entry count
  };
}

// ============ Cleanup Logs ============

export async function getCleanupLogs(userId: number, limit = 10): Promise<{
  id: number;
  processedFeeds: number;
  affectedEntries: number;
  markedRead: number;
  removed: number;
  createdAt: string;
}[]> {
  const result = await query(
    `SELECT * FROM fg_retention_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map(row => ({
    id: row.id,
    processedFeeds: row.processed_feeds,
    affectedEntries: row.affected_entries,
    markedRead: row.marked_read,
    removed: row.removed,
    createdAt: row.created_at,
  }));
}

// ============ Helpers ============

function mapPolicy(row: any): RetentionPolicy {
  return {
    id: row.id,
    userId: row.user_id,
    feedId: row.feed_id,
    keepDays: row.keep_days,
    keepStarred: row.keep_starred,
    keepUnread: row.keep_unread,
    keepMinCount: row.keep_min_count,
    action: row.action,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
