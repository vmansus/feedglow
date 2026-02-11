/**
 * Tags Service — Manual tag management (P0)
 */

import { query } from '../lib/db.js';

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  article_count?: number;
  created_at: string;
}

/**
 * Get all tags for a user, with article counts
 */
export async function getUserTags(userId: number): Promise<Tag[]> {
  const result = await query<Tag>(
    `SELECT t.id, t.user_id, t.name, t.color, t.created_at,
            COUNT(et.entry_id)::int AS article_count
     FROM fg_tags t
     LEFT JOIN fg_entry_tags et ON et.tag_id = t.id
     WHERE t.user_id = $1
     GROUP BY t.id
     ORDER BY t.name`,
    [userId]
  );
  return result.rows;
}

/**
 * Create a new tag
 */
export async function createTag(userId: number, name: string, color?: string): Promise<Tag> {
  const result = await query<Tag>(
    `INSERT INTO fg_tags (user_id, name, color)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, name) DO UPDATE SET color = EXCLUDED.color
     RETURNING *`,
    [userId, name.trim(), color || '#6366f1']
  );
  return result.rows[0];
}

/**
 * Update a tag
 */
export async function updateTag(userId: number, tagId: number, updates: { name?: string; color?: string }): Promise<Tag | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIdx++}`);
    values.push(updates.name.trim());
  }
  if (updates.color !== undefined) {
    fields.push(`color = $${paramIdx++}`);
    values.push(updates.color);
  }

  if (fields.length === 0) return null;

  values.push(tagId, userId);
  const result = await query<Tag>(
    `UPDATE fg_tags SET ${fields.join(', ')} WHERE id = $${paramIdx++} AND user_id = $${paramIdx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete a tag (cascades to entry_tags)
 */
export async function deleteTag(userId: number, tagId: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM fg_tags WHERE id = $1 AND user_id = $2`,
    [tagId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Add tag to an entry
 */
export async function addTagToEntry(userId: number, entryId: number, tagId: number): Promise<void> {
  // Verify the tag exists and belongs to the user
  const tagCheck = await query(
    `SELECT id FROM fg_tags WHERE id = $1 AND user_id = $2`,
    [tagId, userId]
  );
  if (tagCheck.rows.length === 0) {
    throw Object.assign(new Error('Tag not found'), { status: 404 });
  }

  await query(
    `INSERT INTO fg_entry_tags (user_id, entry_id, tag_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [userId, entryId, tagId]
  );
}

/**
 * Remove tag from an entry
 */
export async function removeTagFromEntry(userId: number, entryId: number, tagId: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM fg_entry_tags WHERE user_id = $1 AND entry_id = $2 AND tag_id = $3`,
    [userId, entryId, tagId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get tags for a specific entry
 */
export async function getEntryTags(userId: number, entryId: number): Promise<Tag[]> {
  const result = await query<Tag>(
    `SELECT t.id, t.user_id, t.name, t.color, t.created_at
     FROM fg_tags t
     JOIN fg_entry_tags et ON et.tag_id = t.id
     WHERE et.user_id = $1 AND et.entry_id = $2
     ORDER BY t.name`,
    [userId, entryId]
  );
  return result.rows;
}

/**
 * Get entry IDs that have a specific tag
 */
export async function getEntriesByTag(userId: number, tagName: string, limit = 50, offset = 0): Promise<{ entryIds: number[]; total: number }> {
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM fg_entry_tags et
     JOIN fg_tags t ON t.id = et.tag_id
     WHERE et.user_id = $1 AND t.name = $2`,
    [userId, tagName]
  );

  const result = await query<{ entry_id: number }>(
    `SELECT et.entry_id
     FROM fg_entry_tags et
     JOIN fg_tags t ON t.id = et.tag_id
     WHERE et.user_id = $1 AND t.name = $2
     ORDER BY et.created_at DESC
     LIMIT $3 OFFSET $4`,
    [userId, tagName, limit, offset]
  );

  return {
    entryIds: result.rows.map(r => r.entry_id),
    total: countResult.rows[0]?.total || 0,
  };
}
