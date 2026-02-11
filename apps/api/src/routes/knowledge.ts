/**
 * Knowledge Graph API Routes
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
import {
  getGraph,
  getGraphWithTopics,
  getRelatedArticles,
  getGraphStats,
  addToGraph,
  getTopics,
  getTopicDetail,
  extractTopics,
  addEntryTopics,
} from '../services/knowledge.js';
import { query as dbQuery } from '../lib/db.js';

// Resolve UUID or numeric ID to numeric entry ID
async function resolveEntryId(idParam: string, userId: number): Promise<number | null> {
  // UUID format
  if (idParam.includes('-') && idParam.length > 20) {
    const result = await dbQuery(
      'SELECT id FROM fg_entries WHERE uuid = $1 AND user_id = $2',
      [idParam, userId]
    );
    return result.rows[0]?.id ?? null;
  }
  const numericId = parseInt(idParam);
  if (!isNaN(numericId)) return numericId;
  return null;
}

const knowledge = new Hono();

// Apply auth middleware
knowledge.use('/*', authMiddleware);

// Safe userId extraction
function getUserId(c: any): number {
  const user = c.get('user') as JWTPayload | undefined;
  const raw = user?.userId ?? c.get('userId');
  const id = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!id || isNaN(id)) throw new Error('Invalid userId');
  return id;
}

// Get knowledge graph for visualization (with topics)
knowledge.get('/graph', async (c) => {
  const limit = parseInt(c.req.query('limit') || '100');
  const withTopics = c.req.query('withTopics') === 'true';

  if (withTopics) {
    const graph = await getGraphWithTopics(getUserId(c), limit);
    return c.json(graph);
  }

  const graph = await getGraph(getUserId(c), limit);
  return c.json(graph);
});

// Get all topics
knowledge.get('/topics', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');

  const topics = await getTopics(getUserId(c), limit);
  return c.json(topics);
});

// Get topic detail with articles and summary
knowledge.get('/topics/:name', async (c) => {
  const topicName = decodeURIComponent(c.req.param('name'));

  const topic = await getTopicDetail(getUserId(c), topicName);
  if (!topic) {
    return c.json({ error: 'Topic not found' }, 404);
  }

  return c.json(topic);
});

// Get graph statistics
knowledge.get('/stats', async (c) => {
  const stats = await getGraphStats(getUserId(c));

  return c.json(stats);
});

// Get related articles for a specific entry (supports UUID or numeric ID)
knowledge.get('/related/:id', async (c) => {
  const userId = getUserId(c);
  const entryId = await resolveEntryId(c.req.param('id'), userId);
  if (!entryId) {
    return c.json({ entryId: null, related: [] });
  }
  const limit = parseInt(c.req.query('limit') || '10');

  const related = await getRelatedArticles(userId, entryId, limit);

  return c.json({
    entryId,
    related,
  });
});

// Add an entry to the knowledge graph (with auto topic extraction)
knowledge.post('/add/:id', async (c) => {
  const client = getDataClient(c);
  const entry = await client.getEntry(c.req.param('id'));
  const numericId = (entry as any)._numericId;

  // Get feed title
  const feed = await client.getFeed(entry.feed_id);

  // Override entry.id with integer ID (mapped entry uses UUID as id)
  const entryWithIntId = { ...entry, id: numericId };

  // Add to graph
  await addToGraph(getUserId(c), entryWithIntId, feed.title);

  // Extract and add topics
  const topics = await extractTopics(getUserId(c), entryWithIntId);
  if (topics.length > 0) {
    await addEntryTopics(getUserId(c), numericId, topics);
  }

  return c.json({
    success: true,
    entryId,
    topics,
  });
});

// Bulk backfill: add all read entries to knowledge graph
// Uses AI for topic extraction in batches
knowledge.post('/backfill', async (c) => {
  const userId = getUserId(c);
  const batchSize = parseInt(c.req.query('batch') || '20');

  // Find read entries not yet in knowledge graph
  const missing = await dbQuery(
    `SELECT e.id, e.title, e.content, e.feed_id, e.published_at, e.author,
            f.title as feed_title
     FROM fg_entries e
     JOIN fg_feeds f ON f.id = e.feed_id
     LEFT JOIN fg_knowledge_nodes kn ON kn.entry_id = e.id AND kn.user_id = e.user_id
     WHERE e.user_id = $1 AND e.status = 'read' AND kn.entry_id IS NULL
     ORDER BY e.published_at DESC
     LIMIT $2`,
    [userId, batchSize]
  );

  let indexed = 0;
  let topicsTotal = 0;

  for (const row of missing.rows) {
    try {
      const entry = {
        id: row.id,
        title: row.title,
        content: row.content,
        feed_id: row.feed_id,
        published_at: row.published_at,
        author: row.author,
        tags: [],
      } as any;

      await addToGraph(userId, entry, row.feed_title);

      const topics = await extractTopics(userId, entry);
      if (topics.length > 0) {
        await addEntryTopics(userId, row.id, topics);
        topicsTotal += topics.length;
      }

      indexed++;
    } catch (err) {
      console.error(`[Knowledge] Backfill failed for entry ${row.id}:`, err);
    }
  }

  const remaining = await dbQuery(
    `SELECT COUNT(*) as cnt FROM fg_entries e
     LEFT JOIN fg_knowledge_nodes kn ON kn.entry_id = e.id AND kn.user_id = e.user_id
     WHERE e.user_id = $1 AND e.status = 'read' AND kn.entry_id IS NULL`,
    [userId]
  );

  return c.json({
    success: true,
    indexed,
    topics: topicsTotal,
    remaining: parseInt(remaining.rows[0].cnt),
  });
});

export default knowledge;
