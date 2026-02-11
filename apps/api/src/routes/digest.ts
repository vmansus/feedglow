/**
 * AI Daily Digest Routes (P1 #13)
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
import { getDigest, generateDigest, type Digest } from '../services/digest.js';

const digest = new Hono();

digest.use('*', authMiddleware);

/**
 * Transform backend Digest to frontend DailyDigest format
 */
function formatDigest(d: Digest, realTotal?: number, realRead?: number) {
  const totalFromCategories = d.category_summaries.reduce((sum, c) => sum + (c.entryCount || 0), 0);
  const totalArticles = realTotal ?? totalFromCategories;
  const readArticles = realRead ?? totalFromCategories;
  return {
    date: d.date,
    summary: d.summary,
    highlights: d.highlights.map(h => ({
      id: h.entryId,
      title: h.title,
      feedTitle: h.feedTitle,
      summary: h.reason,
      url: '',
      publishedAt: '',
    })),
    stats: {
      totalArticles,
      readArticles,
      topCategories: d.category_summaries
        .sort((a, b) => (b.entryCount || 0) - (a.entryCount || 0))
        .slice(0, 3)
        .map(c => ({
          name: c.categoryTitle === 'Uncategorized' ? '未分类' : c.categoryTitle,
          count: c.entryCount || 0,
        })),
    },
    categorySummaries: d.category_summaries,
    generatedAt: typeof d.generated_at === 'string' ? d.generated_at : new Date(d.generated_at).toISOString(),
  };
}

// Get today's digest
digest.get('/today', async (c) => {
  const user = c.get('user') as JWTPayload;
  const today = new Date().toISOString().split('T')[0];

  const existing = await getDigest(user.userId, today);
  if (existing) {
    return c.json(formatDigest(existing));
  }

  return c.json({ error: 'No digest generated yet', date: today }, 404);
});

// Get digest for a specific date
digest.get('/:date', async (c) => {
  const user = c.get('user') as JWTPayload;
  const date = c.req.param('date');

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
  }

  const existing = await getDigest(user.userId, date);
  if (!existing) {
    return c.json({ error: 'No digest found for this date' }, 404);
  }

  return c.json(formatDigest(existing));
});

// Generate digest (manual trigger)
digest.post('/generate', async (c) => {
  const user = c.get('user') as JWTPayload;
  const today = new Date().toISOString().split('T')[0];

  const client = getDataClient(c);

  // Get entries from last 24 hours
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
  const result = await client.getEntries({
    after: oneDayAgo,
    limit: 200,
    order: 'published_at',
    direction: 'desc',
  });

  if (result.entries.length === 0) {
    return c.json({ error: 'No articles in the last 24 hours to summarize' }, 400);
  }

  // Count real read stats
  const totalArticles = result.entries.length;
  const readArticles = result.entries.filter((e: any) => e.status === 'read').length;

  try {
    const digestResult = await generateDigest(user.userId, result.entries, today);
    return c.json(formatDigest(digestResult, totalArticles, readArticles));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to generate digest: ${msg}` }, 500);
  }
});

export default digest;
