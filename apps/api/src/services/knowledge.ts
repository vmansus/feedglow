/**
 * Knowledge Graph Service
 * Article relationships and connections
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Entry } from '../lib/miniflux.js';
import { findSimilarEntries, indexEntry } from './chat.js';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data', 'knowledge');

// Graph node (article)
export interface GraphNode {
  id: number;           // entry id
  title: string;
  feedId: number;
  feedTitle?: string;
  publishedAt: string;
  tags?: string[];
}

// Graph edge (relationship)
export interface GraphEdge {
  source: number;       // entry id
  target: number;       // entry id
  type: 'similar' | 'same-topic' | 'same-feed' | 'reference';
  weight: number;       // 0-1 strength
}

// User knowledge graph
interface UserKnowledgeGraph {
  userId: number;
  nodes: Map<number, GraphNode>;
  edges: GraphEdge[];
  lastUpdated: number;
}

// In-memory cache
const graphCache = new Map<number, UserKnowledgeGraph>();

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

function getGraphPath(userId: number): string {
  return join(DATA_DIR, `graph-${userId}.json`);
}

/**
 * Load user knowledge graph
 */
async function loadGraph(userId: number): Promise<UserKnowledgeGraph> {
  // Check cache
  if (graphCache.has(userId)) {
    return graphCache.get(userId)!;
  }

  await ensureDataDir();
  const path = getGraphPath(userId);

  try {
    const data = await readFile(path, 'utf-8');
    const parsed = JSON.parse(data);
    const graph: UserKnowledgeGraph = {
      userId: parsed.userId,
      nodes: new Map(Object.entries(parsed.nodes).map(([k, v]) => [parseInt(k), v as GraphNode])),
      edges: parsed.edges,
      lastUpdated: parsed.lastUpdated,
    };
    graphCache.set(userId, graph);
    return graph;
  } catch {
    const graph: UserKnowledgeGraph = {
      userId,
      nodes: new Map(),
      edges: [],
      lastUpdated: Date.now(),
    };
    graphCache.set(userId, graph);
    return graph;
  }
}

/**
 * Save user knowledge graph
 */
async function saveGraph(graph: UserKnowledgeGraph): Promise<void> {
  await ensureDataDir();
  const path = getGraphPath(graph.userId);

  const serializable = {
    userId: graph.userId,
    nodes: Object.fromEntries(graph.nodes),
    edges: graph.edges,
    lastUpdated: Date.now(),
  };

  await writeFile(path, JSON.stringify(serializable, null, 2));
  graphCache.set(graph.userId, graph);
}

/**
 * Add an article to the knowledge graph
 */
export async function addToGraph(
  userId: number,
  entry: Entry,
  feedTitle?: string
): Promise<void> {
  const graph = await loadGraph(userId);

  // Add node
  const node: GraphNode = {
    id: entry.id,
    title: entry.title,
    feedId: entry.feed_id,
    feedTitle,
    publishedAt: entry.published_at,
    tags: entry.tags,
  };
  graph.nodes.set(entry.id, node);

  // Index for similarity search
  await indexEntry(entry, userId);

  // Find and add edges for similar articles
  const similar = await findSimilarEntries(
    `${entry.title} ${stripHtml(entry.content).slice(0, 1000)}`,
    userId,
    5
  );

  for (const sim of similar) {
    if (sim.entryId === entry.id) continue;
    if (sim.similarity < 0.3) continue; // Threshold

    // Check if edge already exists
    const existingEdge = graph.edges.find(
      e => (e.source === entry.id && e.target === sim.entryId) ||
           (e.source === sim.entryId && e.target === entry.id)
    );

    if (!existingEdge) {
      graph.edges.push({
        source: entry.id,
        target: sim.entryId,
        type: 'similar',
        weight: sim.similarity,
      });
    }
  }

  // Add same-feed edges
  for (const [id, existingNode] of graph.nodes) {
    if (id === entry.id) continue;
    if (existingNode.feedId === entry.feed_id) {
      const existingEdge = graph.edges.find(
        e => e.type === 'same-feed' &&
             ((e.source === entry.id && e.target === id) ||
              (e.source === id && e.target === entry.id))
      );

      if (!existingEdge) {
        graph.edges.push({
          source: entry.id,
          target: id,
          type: 'same-feed',
          weight: 0.5,
        });
      }
    }
  }

  // Limit graph size (keep last 500 nodes)
  if (graph.nodes.size > 500) {
    const sorted = Array.from(graph.nodes.entries())
      .sort((a, b) => new Date(b[1].publishedAt).getTime() - new Date(a[1].publishedAt).getTime());
    
    const toKeep = new Set(sorted.slice(0, 500).map(([id]) => id));
    
    // Remove old nodes
    for (const [id] of graph.nodes) {
      if (!toKeep.has(id)) {
        graph.nodes.delete(id);
      }
    }
    
    // Remove edges referencing deleted nodes
    graph.edges = graph.edges.filter(e => toKeep.has(e.source) && toKeep.has(e.target));
  }

  await saveGraph(graph);
}

/**
 * Get the knowledge graph for visualization
 */
export async function getGraph(
  userId: number,
  limit: number = 100
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const graph = await loadGraph(userId);

  // Get most recent nodes
  const nodes = Array.from(graph.nodes.values())
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);

  const nodeIds = new Set(nodes.map(n => n.id));

  // Filter edges to only include visible nodes
  const edges = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

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
  const graph = await loadGraph(userId);

  // Find all edges containing this entry
  const related: { entry: GraphNode; type: string; weight: number }[] = [];

  for (const edge of graph.edges) {
    let relatedId: number | null = null;

    if (edge.source === entryId) {
      relatedId = edge.target;
    } else if (edge.target === entryId) {
      relatedId = edge.source;
    }

    if (relatedId !== null) {
      const node = graph.nodes.get(relatedId);
      if (node) {
        related.push({
          entry: node,
          type: edge.type,
          weight: edge.weight,
        });
      }
    }
  }

  // Sort by weight and limit
  return related
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
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
  const graph = await loadGraph(userId);

  const nodeCount = graph.nodes.size;
  const edgeCount = graph.edges.length;

  // Simple cluster estimation (connected components)
  const visited = new Set<number>();
  let clusters = 0;

  function dfs(nodeId: number) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    for (const edge of graph.edges) {
      if (edge.source === nodeId && !visited.has(edge.target)) {
        dfs(edge.target);
      } else if (edge.target === nodeId && !visited.has(edge.source)) {
        dfs(edge.source);
      }
    }
  }

  for (const [nodeId] of graph.nodes) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
      clusters++;
    }
  }

  const avgConnections = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;

  return {
    nodeCount,
    edgeCount,
    clusters,
    avgConnections: Math.round(avgConnections * 10) / 10,
  };
}

// Helper
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
