/**
 * AI Daily Digest Routes (P1 #13)
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { createMinifluxClient } from '../lib/miniflux.js';
import { getDigest, generateDigest } from '../services/digest.js';

const digest = new Hono();

digest.use('*', authMiddleware);

// Get today's digest
digest.get('/today', async (c) => {
  const user = c.get('user') as JWTPayload;
  const today = new Date().toISOString().split('T')[0];

  const existing = await getDigest(user.userId, today);
  if (existing) {
    return c.json(existing);
  }

  return c.json({ date: today, summary: null, message: 'No digest generated yet. Use POST /api/digest/generate to create one.' });
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

  return c.json(existing);
});

// Generate digest (manual trigger)
digest.post('/generate', async (c) => {
  const user = c.get('user') as JWTPayload;
  const today = new Date().toISOString().split('T')[0];

  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  const client = createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });

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

  try {
    const digestResult = await generateDigest(user.userId, result.entries, today);
    return c.json(digestResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to generate digest: ${msg}` }, 500);
  }
});

export default digest;
