/**
 * Knowledge Graph Service (PostgreSQL)
 * Article relationships and connections
 */

import { query } from '../lib/db.js';
import type { Entry } from '../lib/miniflux.js';
import { findSimilarEntries, indexEntry } from './chat.js';

// Graph node (article)
export interface GraphNode {
  id: number;
  title: string;
  feedId: number;
  feedTitle?: string;
  publishedAt: string;
  tags?: string[];
}

// Graph edge (relationship)
export interface GraphEdge {
  source: number;
  target: number;
  type: 'similar' | 'same-topic' | 'same-feed' | 'reference';
  weight: number;
}

/**
 * Add an article to the knowledge graph
 */
export async function addToGraph(
  userId: number,
  entry: Entry,
  feedTitle?: string
): Promise<void> {
  // Upsert node
  await query(
    `INSERT INTO fg_knowledge_nodes (user_id, entry_id, title, feed_id, feed_title, published_at, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, entry_id) DO UPDATE SET
       title = $3, feed_title = $5, tags = $7`,
    [userId, entry.id, entry.title, entry.feed_id, feedTitle || null, entry.published_at, entry.tags || []]
  );

  // Index for similarity search
  await indexEntry(entry, userId);

  // Find similar articles
  const similar = await findSimilarEntries(
    `${entry.title} ${stripHtml(entry.content).slice(0, 1000)}`,
    userId,
    5
  );

  for (const sim of similar) {
    if (sim.entryId === entry.id) continue;
    if (sim.similarity < 0.3) continue;

    await query(
      `INSERT INTO fg_knowledge_edges (user_id, source_entry_id, target_entry_id, type, weight)
       VALUES ($1, $2, $3, 'similar', $4)
       ON CONFLICT (user_id, source_entry_id, target_entry_id, type) DO UPDATE SET weight = $4`,
      [userId, entry.id, sim.entryId, sim.similarity]
    );
  }

  // Add same-feed edges
  const sameFeedNodes = await query(
    `SELECT entry_id FROM fg_knowledge_nodes WHERE user_id = $1 AND feed_id = $2 AND entry_id != $3 LIMIT 20`,
    [userId, entry.feed_id, entry.id]
  );

  for (const row of sameFeedNodes.rows) {
    await query(
      `INSERT INTO fg_knowledge_edges (user_id, source_entry_id, target_entry_id, type, weight)
       VALUES ($1, $2, $3, 'same-feed', 0.5)
       ON CONFLICT (user_id, source_entry_id, target_entry_id, type) DO NOTHING`,
      [userId, entry.id, row.entry_id]
    );
  }

  // Limit graph size (keep latest 500 nodes per user)
  await query(
    `DELETE FROM fg_knowledge_nodes WHERE user_id = $1 AND entry_id NOT IN (
       SELECT entry_id FROM fg_knowledge_nodes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500
     )`,
    [userId]
  );

  // Clean orphan edges
  await query(
    `DELETE FROM fg_knowledge_edges WHERE user_id = $1 AND (
       source_entry_id NOT IN (SELECT entry_id FROM fg_knowledge_nodes WHERE user_id = $1) OR
       target_entry_id NOT IN (SELECT entry_id FROM fg_knowledge_nodes WHERE user_id = $1)
     )`,
    [userId]
  );
}

/**
 * Get the knowledge graph for visualization
 */
export async function getGraph(
  userId: number,
  limit: number = 100
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const nodesResult = await query(
    `SELECT * FROM fg_knowledge_nodes WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );

  const nodes: GraphNode[] = nodesResult.rows.map(row => ({
    id: row.entry_id,
    title: row.title,
    feedId: row.feed_id,
    feedTitle: row.feed_title,
    publishedAt: row.published_at,
    tags: row.tags,
  }));

  const nodeIds = nodes.map(n => n.id);

  if (nodeIds.length === 0) {
    return { nodes: [], edges: [] };
  }

  const edgesResult = await query(
    `SELECT * FROM fg_knowledge_edges WHERE user_id = $1 
     AND source_entry_id = ANY($2) AND target_entry_id = ANY($2)`,
    [userId, nodeIds]
  );

  const edges: GraphEdge[] = edgesResult.rows.map(row => ({
    source: row.source_entry_id,
    target: row.target_entry_id,
    type: row.type,
    weight: parseFloat(row.weight),
  }));

  return { nodes, edges };
}

/**
 * Get related articles for a specific entry
 */
export async function getRelatedArticles(
  userId: number,
  entryId: number,
  limit: number = 10
): Promise<{ entry: GraphNode; type: string; weight: number }[]> {
  const result = await query(
    `SELECT e.*, n.title, n.feed_id, n.feed_title, n.published_at, n.tags
     FROM fg_knowledge_edges e
     JOIN fg_knowledge_nodes n ON n.user_id = e.user_id AND (
       (e.source_entry_id = $2 AND n.entry_id = e.target_entry_id) OR
       (e.target_entry_id = $2 AND n.entry_id = e.source_entry_id)
     )
     WHERE e.user_id = $1 AND (e.source_entry_id = $2 OR e.target_entry_id = $2)
     ORDER BY e.weight DESC
     LIMIT $3`,
    [userId, entryId, limit]
  );

  return result.rows.map(row => ({
    entry: {
      id: row.entry_id,
      title: row.title,
      feedId: row.feed_id,
      feedTitle: row.feed_title,
      publishedAt: row.published_at,
      tags: row.tags,
    },
    type: row.type,
    weight: parseFloat(row.weight),
  }));
}

/**
 * Get graph statistics
 */
export async function getGraphStats(userId: number): Promise<{
  nodeCount: number;
  edgeCount: number;
  clusters: number;
  avgConnections: number;
}> {
  const nodeResult = await query(
    'SELECT COUNT(*) as cnt FROM fg_knowledge_nodes WHERE user_id = $1',
    [userId]
  );
  const edgeResult = await query(
    'SELECT COUNT(*) as cnt FROM fg_knowledge_edges WHERE user_id = $1',
    [userId]
  );

  const nodeCount = parseInt(nodeResult.rows[0].cnt);
  const edgeCount = parseInt(edgeResult.rows[0].cnt);
  const avgConnections = nodeCount > 0 ? Math.round((edgeCount * 2) / nodeCount * 10) / 10 : 0;

  // Simple cluster estimation
  const feedResult = await query(
    'SELECT COUNT(DISTINCT feed_id) as cnt FROM fg_knowledge_nodes WHERE user_id = $1',
    [userId]
  );
  const clusters = parseInt(feedResult.rows[0].cnt);

  return { nodeCount, edgeCount, clusters, avgConnections };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
