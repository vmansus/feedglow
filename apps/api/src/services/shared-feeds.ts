/**
 * Shared Feeds Service — Curated public feed collections
 * 
 * Users manually add articles to shared feed collections.
 * Each collection has a public JSON Feed URL.
 */

import { randomBytes } from 'crypto';
import { query } from '../lib/db.js';

export interface SharedFeed {
  id: number;
  user_id: number;
  share_code: string;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed
  item_count?: number;
}

export interface SharedFeedItem {
  id: number;
  shared_feed_id: number;
  entry_id: number;
  note: string | null;
  added_at: string;
  // Joined
  title?: string;
  url?: string;
  content?: string;
  author?: string;
  published_at?: string;
  feed_title?: string;
}

/**
 * Ensure tables exist (inline migration)
 */
export async function ensureSharedFeedsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS fg_shared_feeds (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES fg_users(id),
      share_code VARCHAR(32) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      scope_type VARCHAR(20),
      scope_id INTEGER,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_shared_feeds_user ON fg_shared_feeds(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_shared_feeds_code ON fg_shared_feeds(share_code)`);

  // Items table for curated articles
  await query(`
    CREATE TABLE IF NOT EXISTS fg_shared_feed_items (
      id SERIAL PRIMARY KEY,
      shared_feed_id INTEGER NOT NULL REFERENCES fg_shared_feeds(id) ON DELETE CASCADE,
      entry_id INTEGER NOT NULL REFERENCES fg_entries(id),
      note TEXT,
      added_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(shared_feed_id, entry_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_shared_feed_items_feed ON fg_shared_feed_items(shared_feed_id)`);
}

/**
 * Create a new shared feed collection
 */
export async function createSharedFeed(
  userId: number,
  title: string,
  description?: string
): Promise<SharedFeed> {
  const shareCode = randomBytes(6).toString('hex');

  const result = await query<SharedFeed>(
    `INSERT INTO fg_shared_feeds (user_id, share_code, title, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, shareCode, title, description || null]
  );

  return result.rows[0];
}

/**
 * List user's shared feeds with item counts
 */
export async function getUserSharedFeeds(userId: number): Promise<SharedFeed[]> {
  const result = await query<SharedFeed>(
    `SELECT sf.*,
       (SELECT COUNT(*) FROM fg_shared_feed_items sfi WHERE sfi.shared_feed_id = sf.id)::int AS item_count
     FROM fg_shared_feeds sf
     WHERE sf.user_id = $1 AND sf.is_active = true
     ORDER BY sf.created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get shared feed by share code (public, no auth)
 */
export async function getSharedFeedByCode(code: string): Promise<SharedFeed | null> {
  const result = await query<SharedFeed>(
    `SELECT sf.*
     FROM fg_shared_feeds sf
     WHERE sf.share_code = $1 AND sf.is_active = true`,
    [code]
  );
  return result.rows[0] || null;
}

/**
 * Deactivate (soft delete) a shared feed
 */
export async function deactivateSharedFeed(userId: number, id: number): Promise<boolean> {
  const result = await query(
    `UPDATE fg_shared_feeds SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Add an article to a shared feed
 */
export async function addItemToSharedFeed(
  userId: number,
  sharedFeedId: number,
  entryId: number,
  note?: string
): Promise<SharedFeedItem | null> {
  // Verify ownership
  const ownership = await query(
    `SELECT id FROM fg_shared_feeds WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [sharedFeedId, userId]
  );
  if (ownership.rows.length === 0) return null;

  const result = await query<SharedFeedItem>(
    `INSERT INTO fg_shared_feed_items (shared_feed_id, entry_id, note)
     VALUES ($1, $2, $3)
     ON CONFLICT (shared_feed_id, entry_id) DO UPDATE SET note = EXCLUDED.note
     RETURNING *`,
    [sharedFeedId, entryId, note || null]
  );
  return result.rows[0];
}

/**
 * Remove an article from a shared feed
 */
export async function removeItemFromSharedFeed(
  userId: number,
  sharedFeedId: number,
  entryId: number
): Promise<boolean> {
  const result = await query(
    `DELETE FROM fg_shared_feed_items sfi
     USING fg_shared_feeds sf
     WHERE sfi.shared_feed_id = sf.id
       AND sf.id = $1 AND sf.user_id = $2 AND sf.is_active = true
       AND sfi.entry_id = $3`,
    [sharedFeedId, userId, entryId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * List items in a shared feed (for management UI)
 */
export async function getSharedFeedItems(
  userId: number,
  sharedFeedId: number
): Promise<SharedFeedItem[]> {
  const result = await query<SharedFeedItem>(
    `SELECT sfi.*, e.title, e.url, e.author, e.published_at, f.title AS feed_title
     FROM fg_shared_feed_items sfi
     JOIN fg_entries e ON e.id = sfi.entry_id
     JOIN fg_feeds f ON f.id = e.feed_id
     JOIN fg_shared_feeds sf ON sf.id = sfi.shared_feed_id
     WHERE sfi.shared_feed_id = $1 AND sf.user_id = $2 AND sf.is_active = true
     ORDER BY sfi.added_at DESC`,
    [sharedFeedId, userId]
  );
  return result.rows;
}

/**
 * Get curated entries for public feed output
 */
export async function getSharedFeedEntries(
  sharedFeed: SharedFeed,
  limit = 50
): Promise<Array<{
  id: number;
  title: string;
  url: string;
  content: string;
  author: string;
  published_at: string;
  feed_title: string;
  note: string | null;
}>> {
  const result = await query(
    `SELECT e.id, e.title, e.url, e.content, e.author, e.published_at,
            f.title AS feed_title, sfi.note
     FROM fg_shared_feed_items sfi
     JOIN fg_entries e ON e.id = sfi.entry_id
     JOIN fg_feeds f ON f.id = e.feed_id
     WHERE sfi.shared_feed_id = $1
     ORDER BY sfi.added_at DESC
     LIMIT $2`,
    [sharedFeed.id, limit]
  );
  return result.rows;
}

/**
 * Check which shared feeds an entry belongs to
 */
export async function getEntrySharedFeeds(
  userId: number,
  entryId: number
): Promise<Array<{ id: number; title: string; has_item: boolean }>> {
  const result = await query<{ id: number; title: string; has_item: boolean }>(
    `SELECT sf.id, sf.title,
       EXISTS(
         SELECT 1 FROM fg_shared_feed_items sfi 
         WHERE sfi.shared_feed_id = sf.id AND sfi.entry_id = $2
       ) AS has_item
     FROM fg_shared_feeds sf
     WHERE sf.user_id = $1 AND sf.is_active = true
     ORDER BY sf.title`,
    [userId, entryId]
  );
  return result.rows;
}
