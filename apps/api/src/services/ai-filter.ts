/**
 * AI Smart Filter & Classification Service (P2 #18)
 */

import { query } from '../lib/db.js';
import { getAIConfigForUser } from './ai.js';
import type { AIFilter, AIFilterCriteria, CreateAIFilterInput, UpdateAIFilterInput } from '@feedglow/shared';

function mapRow(row: any): AIFilter {
  return {
    id: String(row.id),
    userId: row.user_id,
    name: row.name,
    description: row.description || '',
    type: row.type || 'boost',
    criteria: typeof row.criteria === 'string' ? JSON.parse(row.criteria) : (row.criteria || {}),
    score: row.score ?? 50,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

/**
 * Get user's AI filters
 */
export async function getAIFilters(userId: number): Promise<AIFilter[]> {
  const result = await query(
    `SELECT * FROM fg_ai_filters WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  );
  return result.rows.map(mapRow);
}

/**
 * Create AI filter
 */
export async function createAIFilter(
  userId: number,
  data: CreateAIFilterInput
): Promise<AIFilter> {
  const result = await query(
    `INSERT INTO fg_ai_filters (user_id, name, description, type, criteria, score, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      data.name,
      data.description || '',
      data.type || 'boost',
      JSON.stringify(data.criteria || {}),
      data.score ?? 50,
      data.enabled ?? true,
    ]
  );
  return mapRow(result.rows[0]);
}

/**
 * Update AI filter
 */
export async function updateAIFilter(
  userId: number,
  filterId: number,
  updates: UpdateAIFilterInput
): Promise<AIFilter | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push(`description = $${idx++}`); values.push(updates.description); }
  if (updates.type !== undefined) { fields.push(`type = $${idx++}`); values.push(updates.type); }
  if (updates.criteria !== undefined) { fields.push(`criteria = $${idx++}`); values.push(JSON.stringify(updates.criteria)); }
  if (updates.score !== undefined) { fields.push(`score = $${idx++}`); values.push(updates.score); }
  if (updates.enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(updates.enabled); }

  if (fields.length === 0) return null;

  fields.push(`updated_at = NOW()`);
  values.push(filterId, userId);
  const result = await query(
    `UPDATE fg_ai_filters SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Delete AI filter
 */
export async function deleteAIFilter(userId: number, filterId: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM fg_ai_filters WHERE id = $1 AND user_id = $2`,
    [filterId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Score an entry against user's AI filters
 * Returns relevance score 0-100 and matched filters
 */
export async function scoreEntry(
  userId: number,
  entry: { title: string; content: string; feed?: { title: string } }
): Promise<{ score: number; matchedFilters: string[]; action?: string }> {
  const filters = await getAIFilters(userId);
  const activeFilters = filters.filter(f => f.enabled);

  if (activeFilters.length === 0) {
    return { score: 50, matchedFilters: [] };
  }

  // Simple keyword-based scoring (no AI call needed for basic matching)
  let totalScore = 50;
  const matchedFilters: string[] = [];
  const titleLower = entry.title.toLowerCase();
  const contentLower = (entry.content || '').toLowerCase().slice(0, 2000);

  for (const filter of activeFilters) {
    let matched = false;

    // Check keywords
    if (filter.criteria.keywords?.length) {
      matched = filter.criteria.keywords.some(kw => 
        titleLower.includes(kw.toLowerCase()) || contentLower.includes(kw.toLowerCase())
      );
    }

    // Check topics
    if (!matched && filter.criteria.topics?.length) {
      matched = filter.criteria.topics.some(topic =>
        titleLower.includes(topic.toLowerCase()) || contentLower.includes(topic.toLowerCase())
      );
    }

    if (matched) {
      matchedFilters.push(filter.name);
      totalScore += filter.score;
    }
  }

  return {
    score: Math.min(100, Math.max(0, totalScore)),
    matchedFilters,
  };
}
