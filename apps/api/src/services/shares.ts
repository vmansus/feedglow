/**
 * Shares Service — Public article sharing (P0)
 */

import { randomBytes } from 'crypto';
import { query } from '../lib/db.js';

export interface Share {
  id: number;
  user_id: number;
  entry_id: number;
  share_code: string;
  title: string;
  content: string;
  url: string;
  author: string;
  feed_title: string;
  published_at: string;
  created_at: string;
}

/**
 * Create a public share for an entry
 */
export async function createShare(
  userId: number,
  entry: {
    id: number;
    title: string;
    content: string;
    url: string;
    author: string;
    feed: { title: string };
    published_at: string;
  }
): Promise<Share> {
  const shareCode = randomBytes(16).toString('hex');

  const result = await query<Share>(
    `INSERT INTO fg_shares (user_id, entry_id, share_code, title, content, url, author, feed_title, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, entry_id) DO UPDATE SET
       content = EXCLUDED.content,
       title = EXCLUDED.title
     RETURNING *`,
    [
      userId,
      entry.id,
      shareCode,
      entry.title,
      entry.content,
      entry.url,
      entry.author,
      entry.feed?.title || '',
      entry.published_at,
    ]
  );

  return result.rows[0];
}

/**
 * Get share by code (public, no auth required)
 */
export async function getShareByCode(code: string): Promise<Share | null> {
  const result = await query<Share>(
    `SELECT * FROM fg_shares WHERE share_code = $1`,
    [code]
  );
  return result.rows[0] || null;
}

/**
 * Delete a share
 */
export async function deleteShare(userId: number, entryId: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM fg_shares WHERE user_id = $1 AND entry_id = $2`,
    [userId, entryId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get share for a specific entry
 */
export async function getShareForEntry(userId: number, entryId: number): Promise<Share | null> {
  const result = await query<Share>(
    `SELECT * FROM fg_shares WHERE user_id = $1 AND entry_id = $2`,
    [userId, entryId]
  );
  return result.rows[0] || null;
}

/**
 * List all shares for a user
 */
export async function getUserShares(userId: number, limit = 50, offset = 0): Promise<{ shares: Share[]; total: number }> {
  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM fg_shares WHERE user_id = $1`,
    [userId]
  );

  const result = await query<Share>(
    `SELECT * FROM fg_shares WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return {
    shares: result.rows,
    total: countResult.rows[0]?.total || 0,
  };
}
