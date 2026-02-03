/**
 * Knowledge Graph API Routes
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { createMinifluxClient } from '../lib/miniflux.js';
import {
  getGraph,
  getRelatedArticles,
  getGraphStats,
  addToGraph,
} from '../services/knowledge.js';

const knowledge = new Hono();

// Apply auth middleware
knowledge.use('/*', authMiddleware);

// Helper to get client from context
function getClient(c: any) {
  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  return createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });
}

// Get knowledge graph for visualization
knowledge.get('/graph', async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '100');

  const graph = await getGraph(user.userId, limit);

  return c.json(graph);
});

// Get graph statistics
knowledge.get('/stats', async (c) => {
  const user = c.get('user') as JWTPayload;
  const stats = await getGraphStats(user.userId);

  return c.json(stats);
});

// Get related articles for a specific entry
knowledge.get('/related/:id', async (c) => {
  const entryId = parseInt(c.req.param('id'));
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '10');

  const related = await getRelatedArticles(user.userId, entryId, limit);

  return c.json({
    entryId,
    related,
  });
});

// Add an entry to the knowledge graph
knowledge.post('/add/:id', async (c) => {
  const entryId = parseInt(c.req.param('id'));
  const user = c.get('user') as JWTPayload;

  const client = getClient(c);
  const entry = await client.getEntry(entryId);

  // Get feed title
  const feed = await client.getFeed(entry.feed_id);

  await addToGraph(user.userId, entry, feed.title);

  return c.json({
    success: true,
    entryId,
  });
});

export default knowledge;
