/**
 * Knowledge Graph Service (PostgreSQL)
 * Article relationships and connections
 */

import { query } from '../lib/db.js';
import type { Entry } from '../lib/types.js';
// Topic-based relations only; similarity search was too noisy with hash embeddings
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { getAIConfigForUser } from './ai.js';

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

  // Topic-based edges are created via addEntryTopics(), no need for noisy similarity edges

  // Limit graph size (keep latest 2000 nodes per user)
  await query(
    `DELETE FROM fg_knowledge_nodes WHERE user_id = $1 AND entry_id NOT IN (
       SELECT entry_id FROM fg_knowledge_nodes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 2000
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
 * Step 1: Topic overlap to get candidates
 * Step 2: AI re-ranks candidates for true relevance
 */
export async function getRelatedArticles(
  userId: number,
  entryId: number,
  limit: number = 5
): Promise<{ entry: GraphNode; type: string; weight: number }[]> {
  // Get current article info
  const currentNode = await query(
    'SELECT entry_id, title, feed_title FROM fg_knowledge_nodes WHERE user_id = $1 AND entry_id = $2',
    [userId, entryId]
  );
  if (currentNode.rows.length === 0) return [];
  const currentTitle = currentNode.rows[0].title;

  // Step 1: Get candidate articles via shared topics (broad pool)
  const topicResult = await query(
    `SELECT 
       n.entry_id, n.title, n.feed_id, n.feed_title, n.published_at, n.tags,
       COUNT(DISTINCT shared_t.id) as shared_topics
     FROM fg_entry_topics et
     JOIN fg_topics t ON t.id = et.topic_id AND t.user_id = $1
     JOIN fg_entry_topics et2 ON et2.topic_id = et.topic_id AND et2.user_id = $1 AND et2.entry_id != $2
     JOIN fg_topics shared_t ON shared_t.id = et2.topic_id
     JOIN fg_knowledge_nodes n ON n.entry_id = et2.entry_id AND n.user_id = $1
     WHERE et.user_id = $1 AND et.entry_id = $2
     GROUP BY n.entry_id, n.title, n.feed_id, n.feed_title, n.published_at, n.tags
     ORDER BY shared_topics DESC, n.published_at DESC
     LIMIT 20`,
    [userId, entryId]
  );

  if (topicResult.rows.length === 0) return [];

  const candidates = topicResult.rows.map(row => ({
    id: row.entry_id,
    title: row.title,
    feedId: row.feed_id,
    feedTitle: row.feed_title,
    publishedAt: row.published_at,
    tags: row.tags,
    sharedTopics: row.shared_topics,
  }));

  // Step 2: AI re-rank — ask AI to pick the most truly related articles
  const config = await getAIConfigForUser(userId);
  if (config) {
    try {
      const candidateList = candidates.map((c, i) => `${i + 1}. [${c.feedTitle}] ${c.title}`).join('\n');

      const prompt = `You are recommending related articles. Given the current article a user is reading, pick the ${limit} most relevant and interesting recommendations from the candidates.

Current article: "${currentTitle}"

Candidates:
${candidateList}

Return ONLY a JSON array of the candidate numbers (1-indexed) in order of relevance, e.g. [3, 7, 1, 5, 2]
Pick only articles that are genuinely related in topic or theme. If fewer than ${limit} are truly relevant, return fewer.`;

      let model;
      if (config.provider === 'anthropic') {
        model = anthropic(config.model || 'claude-3-5-haiku-latest');
      } else {
        const openai = createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
        });
        model = openai(config.model || 'gpt-4o-mini');
      }

      const result = await generateText({
        model,
        prompt,
        maxTokens: 100,
      });

      const match = result.text.match(/\[[\s\S]*?\]/);
      if (match) {
        const indices = JSON.parse(match[0]) as number[];
        const ranked = indices
          .filter(i => i >= 1 && i <= candidates.length)
          .slice(0, limit)
          .map((i, rank) => {
            const c = candidates[i - 1];
            return {
              entry: {
                id: c.id,
                title: c.title,
                feedId: c.feedId,
                feedTitle: c.feedTitle,
                publishedAt: c.publishedAt,
                tags: c.tags,
              },
              type: 'ai-recommended' as const,
              weight: Math.round((1 - rank * 0.15) * 100) / 100, // 1.0, 0.85, 0.7, ...
            };
          });

        if (ranked.length > 0) return ranked;
      }
    } catch (e) {
      console.error('[Knowledge] AI re-rank failed, falling back to topic count:', e);
    }
  }

  // Fallback: just use topic overlap count
  return candidates.slice(0, limit).map(c => ({
    entry: {
      id: c.id,
      title: c.title,
      feedId: c.feedId,
      feedTitle: c.feedTitle,
      publishedAt: c.publishedAt,
      tags: c.tags,
    },
    type: 'same-topic' as const,
    weight: Math.min(1, c.sharedTopics * 0.3),
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

// ============================================
// Topic Extraction & Management
// ============================================

export interface Topic {
  id: number;
  name: string;
  articleCount: number;
  lastSeenAt: string | null;
}

export interface TopicWithArticles extends Topic {
  articles: GraphNode[];
  summary?: string;
}

/**
 * Extract topics from an article using AI
 */
export async function extractTopics(
  userId: number,
  entry: Entry
): Promise<string[]> {
  const config = await getAIConfigForUser(userId);
  if (!config) {
    // Fallback: extract from tags if no AI config
    return entry.tags?.slice(0, 5) || [];
  }

  const content = stripHtml(entry.content).slice(0, 2000);
  const prompt = `Extract 3-5 broad topic categories from this article. Use GENERAL, REUSABLE terms that would apply to many articles on similar subjects. Avoid overly specific or unique terms.

Good examples: "ai safety", "web development", "politics", "climate change", "open source", "cybersecurity", "mobile apps", "startups"
Bad examples: "grok 4.20 release", "trump phone controversy", "specific company name"

Title: ${entry.title}

Content: ${content}

Return ONLY a JSON array of topic strings (lowercase, 1-3 words each).`;

  try {
    let model;
    if (config.provider === 'anthropic') {
      model = anthropic(config.model || 'claude-3-5-haiku-latest');
    } else {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      model = openai(config.model || 'gpt-4o-mini');
    }

    const result = await generateText({
      model,
      prompt,
      maxTokens: 200,
    });

    // Parse JSON array from response
    const match = result.text.match(/\[[\s\S]*?\]/);
    if (match) {
      const topics = JSON.parse(match[0]) as string[];
      return topics.map(t => t.toLowerCase().trim()).filter(t => t.length > 0).slice(0, 5);
    }
  } catch (e) {
    console.error('Topic extraction failed:', e);
  }

  // Fallback to tags
  return entry.tags?.slice(0, 5) || [];
}

/**
 * Add topics to an entry and update topic counts
 */
export async function addEntryTopics(
  userId: number,
  entryId: number,
  topics: string[]
): Promise<void> {
  for (const topicName of topics) {
    // Upsert topic
    const topicResult = await query(
      `INSERT INTO fg_topics (user_id, name, article_count, last_seen_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (user_id, name) DO UPDATE SET
         article_count = fg_topics.article_count + 1,
         last_seen_at = NOW()
       RETURNING id`,
      [userId, topicName]
    );

    const topicId = topicResult.rows[0].id;

    // Link entry to topic
    await query(
      `INSERT INTO fg_entry_topics (entry_id, topic_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [entryId, topicId, userId]
    );
  }
}

/**
 * Get all topics for a user
 */
export async function getTopics(
  userId: number,
  limit: number = 50
): Promise<Topic[]> {
  const result = await query(
    `SELECT id, name, article_count, last_seen_at
     FROM fg_topics
     WHERE user_id = $1
     ORDER BY article_count DESC, last_seen_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    articleCount: row.article_count,
    lastSeenAt: row.last_seen_at,
  }));
}

/**
 * Get articles for a specific topic
 */
export async function getTopicArticles(
  userId: number,
  topicName: string,
  limit: number = 20
): Promise<GraphNode[]> {
  const result = await query(
    `SELECT n.entry_id, n.title, n.feed_id, n.feed_title, n.published_at, n.tags
     FROM fg_entry_topics et
     JOIN fg_topics t ON t.id = et.topic_id
     JOIN fg_knowledge_nodes n ON n.entry_id = et.entry_id AND n.user_id = et.user_id
     WHERE et.user_id = $1 AND t.name = $2
     ORDER BY n.published_at DESC
     LIMIT $3`,
    [userId, topicName, limit]
  );

  return result.rows.map(row => ({
    id: row.entry_id,
    title: row.title,
    feedId: row.feed_id,
    feedTitle: row.feed_title,
    publishedAt: row.published_at,
    tags: row.tags,
  }));
}

/**
 * Get topic with articles and AI summary
 */
export async function getTopicDetail(
  userId: number,
  topicName: string
): Promise<TopicWithArticles | null> {
  const topicResult = await query(
    `SELECT id, name, article_count, last_seen_at
     FROM fg_topics
     WHERE user_id = $1 AND name = $2`,
    [userId, topicName]
  );

  if (topicResult.rows.length === 0) {
    return null;
  }

  const topic = topicResult.rows[0];
  const articles = await getTopicArticles(userId, topicName, 20);

  // Generate summary if we have articles
  let summary: string | undefined;
  if (articles.length >= 3) {
    const config = await getAIConfigForUser(userId);
    if (config) {
      try {
        const titles = articles.slice(0, 10).map(a => `- ${a.title}`).join('\n');
        const prompt = `Summarize the main themes and trends from these recent articles about "${topicName}" in 2-3 sentences:\n\n${titles}`;

        let model;
        if (config.provider === 'anthropic') {
          model = anthropic(config.model || 'claude-3-5-haiku-latest');
        } else {
          const openai = createOpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
          });
          model = openai(config.model || 'gpt-4o-mini');
        }

        const result = await generateText({
          model,
          prompt,
          maxTokens: 300,
        });
        summary = result.text;
      } catch (e) {
        console.error('Topic summary failed:', e);
      }
    }
  }

  return {
    id: topic.id,
    name: topic.name,
    articleCount: topic.article_count,
    lastSeenAt: topic.last_seen_at,
    articles,
    summary,
  };
}

/**
 * Get graph with topic nodes for visualization
 */
export async function getGraphWithTopics(
  userId: number,
  limit: number = 100
): Promise<{
  nodes: Array<GraphNode & { type: 'article' | 'topic' | 'feed' }>;
  edges: GraphEdge[];
}> {
  // Get regular graph
  const { nodes: articleNodes, edges } = await getGraph(userId, limit);

  // Get topics
  const topics = await getTopics(userId, 20);

  // Build topic nodes
  const topicNodes = topics.map((t, i) => ({
    id: -(i + 1), // negative IDs for topics
    title: t.name,
    feedId: 0,
    publishedAt: t.lastSeenAt || new Date().toISOString(),
    type: 'topic' as const,
    size: Math.min(30, 10 + t.articleCount * 2), // size based on article count
  }));

  // Add article nodes with type
  const typedArticleNodes = articleNodes.map(n => ({
    ...n,
    type: 'article' as const,
  }));

  // Get entry-topic links
  const entryTopicResult = await query(
    `SELECT et.entry_id, t.name as topic_name
     FROM fg_entry_topics et
     JOIN fg_topics t ON t.id = et.topic_id
     WHERE et.user_id = $1`,
    [userId]
  );

  // Create topic-article edges
  const topicEdges: GraphEdge[] = [];
  for (const row of entryTopicResult.rows) {
    const topicNode = topicNodes.find(t => t.title === row.topic_name);
    const articleNode = typedArticleNodes.find(a => a.id === row.entry_id);
    if (topicNode && articleNode) {
      topicEdges.push({
        source: topicNode.id,
        target: articleNode.id,
        type: 'same-topic',
        weight: 0.8,
      });
    }
  }

  return {
    nodes: [...topicNodes, ...typedArticleNodes] as any,
    edges: [...edges, ...topicEdges],
  };
}
