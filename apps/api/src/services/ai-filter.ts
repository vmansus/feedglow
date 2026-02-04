/**
 * AI Smart Filter & Classification Service (P2 #18)
 */

import { query } from '../lib/db.js';
import { getAIConfigForUser } from './ai.js';

export interface AIFilter {
  id: number;
  user_id: number;
  name: string;
  description: string;
  action: 'highlight' | 'mute' | 'tag';
  tag_name?: string;
  enabled: boolean;
  created_at: string;
}

/**
 * Get user's AI filters
 */
export async function getAIFilters(userId: number): Promise<AIFilter[]> {
  const result = await query<AIFilter>(
    `SELECT * FROM fg_ai_filters WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  );
  return result.rows;
}

/**
 * Create AI filter
 */
export async function createAIFilter(
  userId: number,
  data: { name: string; description: string; action: string; tagName?: string }
): Promise<AIFilter> {
  const result = await query<AIFilter>(
    `INSERT INTO fg_ai_filters (user_id, name, description, action, tag_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, data.name, data.description, data.action, data.tagName]
  );
  return result.rows[0];
}

/**
 * Update AI filter
 */
export async function updateAIFilter(
  userId: number,
  filterId: number,
  updates: Partial<{ name: string; description: string; action: string; tagName: string; enabled: boolean }>
): Promise<AIFilter | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push(`description = $${idx++}`); values.push(updates.description); }
  if (updates.action !== undefined) { fields.push(`action = $${idx++}`); values.push(updates.action); }
  if (updates.tagName !== undefined) { fields.push(`tag_name = $${idx++}`); values.push(updates.tagName); }
  if (updates.enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(updates.enabled); }

  if (fields.length === 0) return null;

  values.push(filterId, userId);
  const result = await query<AIFilter>(
    `UPDATE fg_ai_filters SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
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

  try {
    const config = await getAIConfigForUser(userId);
    const { createOpenAI } = await import('@ai-sdk/openai');
    const { generateText } = await import('ai');

    const provider = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });

    const filterDescriptions = activeFilters.map((f, i) =>
      `${i + 1}. "${f.name}": ${f.description} (action: ${f.action})`
    ).join('\n');

    const result = await generateText({
      model: provider(config.model),
      prompt: `Score this article's relevance to the user's interests. 

User's interest filters:
${filterDescriptions}

Article:
Title: ${entry.title}
Source: ${entry.feed?.title || 'Unknown'}
Content preview: ${entry.content?.slice(0, 500) || 'No content'}

Respond as JSON only:
{"score": 0-100, "matchedFilters": ["filter name 1"], "primaryAction": "highlight|mute|tag|none"}`,
      maxTokens: 200,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] || '{}');

    return {
      score: Math.min(100, Math.max(0, parsed.score || 50)),
      matchedFilters: parsed.matchedFilters || [],
      action: parsed.primaryAction || undefined,
    };
  } catch {
    return { score: 50, matchedFilters: [] };
  }
}
