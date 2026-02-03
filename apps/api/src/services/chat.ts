/**
 * AI Chat Service
 * Deep Q&A for articles with context
 */

import { generateText, streamText, embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Entry } from '../lib/miniflux.js';
import { getAIConfigForUser } from './ai.js';

// Simple in-memory embedding cache (MVP)
// TODO: Upgrade to pgvector for production
const embeddingCache = new Map<string, { embedding: number[]; entryId: number; title: string }>();

/**
 * Get embedding model based on provider
 */
function getEmbeddingModel(config: { provider: string; apiKey?: string; baseUrl?: string }) {
  // Use OpenAI-compatible embedding endpoint
  const openai = createOpenAI({
    baseURL: config.baseUrl || 'https://api.openai.com/v1',
    apiKey: config.apiKey,
  });

  // Different models for different providers
  if (config.baseUrl?.includes('deepseek')) {
    // DeepSeek doesn't have embedding, fall back to simple hash
    return null;
  }

  return openai.embedding('text-embedding-3-small');
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(
  text: string,
  config: { provider: string; apiKey?: string; baseUrl?: string }
): Promise<number[] | null> {
  const model = getEmbeddingModel(config);

  if (!model) {
    // Fallback: simple hash-based "embedding" for providers without embedding support
    return simpleHashEmbedding(text);
  }

  try {
    const { embedding } = await embed({
      model,
      value: text.slice(0, 8000), // Limit text length
    });
    return embedding;
  } catch {
    // Fallback on error
    return simpleHashEmbedding(text);
  }
}

/**
 * Simple hash-based embedding fallback
 * Not as good as real embeddings, but works for basic similarity
 */
function simpleHashEmbedding(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const embedding = new Array(256).fill(0);

  for (const word of words) {
    const hash = simpleHash(word);
    embedding[hash % 256] += 1;
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
  return embedding.map(v => v / magnitude);
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Index an entry for semantic search
 */
export async function indexEntry(
  entry: Entry,
  userId: number
): Promise<void> {
  const config = await getAIConfigForUser(userId);
  const text = `${entry.title}\n${stripHtml(entry.content).slice(0, 4000)}`;
  const embedding = await generateEmbedding(text, config);

  if (embedding) {
    const key = `${userId}-${entry.id}`;
    embeddingCache.set(key, {
      embedding,
      entryId: entry.id,
      title: entry.title,
    });
  }
}

/**
 * Find semantically similar entries
 */
export async function findSimilarEntries(
  query: string,
  userId: number,
  limit: number = 5
): Promise<{ entryId: number; title: string; similarity: number }[]> {
  const config = await getAIConfigForUser(userId);
  const queryEmbedding = await generateEmbedding(query, config);

  if (!queryEmbedding) {
    return [];
  }

  const results: { entryId: number; title: string; similarity: number }[] = [];

  for (const [key, value] of embeddingCache.entries()) {
    if (!key.startsWith(`${userId}-`)) continue;

    const similarity = cosineSimilarity(queryEmbedding, value.embedding);
    results.push({
      entryId: value.entryId,
      title: value.title,
      similarity,
    });
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Chat with an article
 */
export async function chatWithArticle(
  entry: Entry,
  message: string,
  userId: number,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<{ answer: string; relatedEntries: { entryId: number; title: string }[] }> {
  const config = await getAIConfigForUser(userId);

  // Build context from article
  const articleContent = stripHtml(entry.content).slice(0, 6000);

  // Find related articles
  const relatedEntries = await findSimilarEntries(message, userId, 3);

  // Build system prompt
  const systemPrompt = `You are an AI reading assistant. Answer questions about the following article.

Article Title: ${entry.title}
Article Content:
${articleContent}

Instructions:
- Answer based on the article content
- Be concise but thorough
- If the question is not related to the article, politely redirect
- Use markdown formatting when helpful`;

  // Build messages
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history,
    { role: 'user' as const, content: message },
  ];

  // Get model based on provider
  const openai = createOpenAI({
    baseURL: config.baseUrl || 'https://api.openai.com/v1',
    apiKey: config.apiKey,
  });

  const model = openai(config.model || 'gpt-4o-mini');

  const result = await generateText({
    model,
    messages,
    maxTokens: 1000,
  });

  return {
    answer: result.text,
    relatedEntries: relatedEntries
      .filter(e => e.entryId !== entry.id)
      .map(e => ({ entryId: e.entryId, title: e.title })),
  };
}

/**
 * Strip HTML tags
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Semantic search across all indexed entries
 */
export async function semanticSearch(
  query: string,
  userId: number,
  limit: number = 10
): Promise<{ entryId: number; title: string; similarity: number }[]> {
  return findSimilarEntries(query, userId, limit);
}

/**
 * Get cache stats
 */
export function getIndexStats(): { totalEntries: number } {
  return {
    totalEntries: embeddingCache.size,
  };
}
