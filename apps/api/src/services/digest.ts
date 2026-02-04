/**
 * AI Daily Digest Service (P1 #13)
 */

import { query } from '../lib/db.js';
import { getAIConfigForUser } from './ai.js';

export interface Digest {
  id: number;
  user_id: number;
  date: string;
  summary: string;
  highlights: DigestHighlight[];
  category_summaries: CategorySummary[];
  generated_at: string;
}

export interface DigestHighlight {
  entryId: number;
  title: string;
  feedTitle: string;
  reason: string;
}

export interface CategorySummary {
  categoryId: number;
  categoryTitle: string;
  summary: string;
  entryCount: number;
}

/**
 * Get digest for a specific date
 */
export async function getDigest(userId: number, date: string): Promise<Digest | null> {
  const result = await query<any>(
    `SELECT * FROM fg_digests WHERE user_id = $1 AND date = $2`,
    [userId, date]
  );
  if (!result.rows[0]) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    date: row.date,
    summary: row.summary,
    highlights: JSON.parse(row.highlights || '[]'),
    category_summaries: JSON.parse(row.category_summaries || '[]'),
    generated_at: row.generated_at,
  };
}

/**
 * Generate digest using AI
 */
export async function generateDigest(
  userId: number,
  entries: Array<{
    id: number;
    title: string;
    content: string;
    feed: { title: string };
    category?: { id: number; title: string };
    published_at: string;
  }>,
  date: string
): Promise<Digest> {
  const config = await getAIConfigForUser(userId);

  // Group entries by category
  const byCategory = new Map<string, typeof entries>();
  for (const entry of entries) {
    const catKey = entry.category?.title || 'Uncategorized';
    if (!byCategory.has(catKey)) byCategory.set(catKey, []);
    byCategory.get(catKey)!.push(entry);
  }

  // Build prompt
  const categoryBlocks = Array.from(byCategory.entries()).map(([cat, catEntries]) => {
    const titles = catEntries.slice(0, 10).map(e => `- ${e.title} (${e.feed.title})`).join('\n');
    return `## ${cat} (${catEntries.length} articles)\n${titles}`;
  }).join('\n\n');

  const prompt = `You are an AI reader assistant. Generate a daily digest for the user based on today's RSS articles.

Total articles: ${entries.length}
Date: ${date}

Articles by category:
${categoryBlocks}

Please generate:
1. A brief overall summary (2-3 sentences) of today's news landscape
2. Top 5 must-read articles with reasons (pick the most important/interesting)
3. A short summary for each category (1-2 sentences each)

Respond in the same language as the majority of article titles.
Format as JSON:
{
  "summary": "overall summary",
  "highlights": [{"entryId": 123, "title": "...", "feedTitle": "...", "reason": "why read this"}],
  "categorySummaries": [{"categoryTitle": "...", "summary": "...", "entryCount": 5}]
}`;

  // Use AI SDK
  const { createOpenAI } = await import('@ai-sdk/openai');
  const { generateText } = await import('ai');

  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  const result = await generateText({
    model: provider(config.model),
    prompt,
    maxTokens: 2000,
  });

  let parsed: any;
  try {
    // Extract JSON from response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] || '{}');
  } catch {
    parsed = {
      summary: result.text.slice(0, 500),
      highlights: [],
      categorySummaries: [],
    };
  }

  // Save to database
  const dbResult = await query<any>(
    `INSERT INTO fg_digests (user_id, date, summary, highlights, category_summaries, generated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, date) DO UPDATE SET
       summary = EXCLUDED.summary,
       highlights = EXCLUDED.highlights,
       category_summaries = EXCLUDED.category_summaries,
       generated_at = NOW()
     RETURNING *`,
    [
      userId,
      date,
      parsed.summary || '',
      JSON.stringify(parsed.highlights || []),
      JSON.stringify(parsed.categorySummaries || []),
    ]
  );

  const row = dbResult.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    date: row.date,
    summary: row.summary,
    highlights: JSON.parse(row.highlights || '[]'),
    category_summaries: JSON.parse(row.category_summaries || '[]'),
    generated_at: row.generated_at,
  };
}
