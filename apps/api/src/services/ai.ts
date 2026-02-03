/**
 * AI Service - Article summarization and translation
 * Using Vercel AI SDK for multi-provider support
 */

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import type { Entry } from '../lib/miniflux.js';

// Rate limiting: simple in-memory token bucket
const rateLimiter = {
  tokens: 10,
  maxTokens: 10,
  refillRate: 1, // tokens per second
  lastRefill: Date.now(),
  
  tryConsume(): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
};

export class AIRateLimitError extends Error {
  constructor() {
    super('AI rate limit exceeded. Please try again later.');
    this.name = 'AIRateLimitError';
  }
}

// Default timeout for AI requests (30 seconds)
const AI_TIMEOUT_MS = 30000;

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  readingTime: number;
  tokens: number;
}

export interface TranslationResult {
  title: string;
  content: string;
  summary?: string;
  tokens: number;
}

// Default models per provider
const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  ollama: 'llama3.2',
};

function getModel(config: AIConfig) {
  const model = config.model || DEFAULT_MODELS[config.provider];

  switch (config.provider) {
    case 'openai':
      return openai(model);
    case 'anthropic':
      return anthropic(model);
    case 'ollama':
      // For Ollama, use openai-compatible endpoint
      return openai(model, {
        baseURL: config.baseUrl || 'http://localhost:11434/v1',
      });
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

/**
 * Generate a summary for an article
 */
export async function summarizeArticle(
  entry: Entry,
  config: AIConfig
): Promise<SummaryResult> {
  // Rate limiting check
  if (!rateLimiter.tryConsume()) {
    throw new AIRateLimitError();
  }

  const model = getModel(config);

  const prompt = `Please analyze the following article and provide:
1. A concise summary (2-3 sentences)
2. 3-5 key points as bullet points

Article Title: ${entry.title}
Article Content:
${stripHtml(entry.content).slice(0, 8000)}

Respond in JSON format:
{
  "summary": "...",
  "keyPoints": ["...", "..."]
}`;

  const result = await generateText({
    model,
    prompt,
    maxTokens: 500,
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  try {
    const parsed = JSON.parse(result.text);
    return {
      summary: parsed.summary,
      keyPoints: parsed.keyPoints,
      readingTime: entry.reading_time,
      tokens: result.usage?.totalTokens || 0,
    };
  } catch {
    // Fallback if JSON parsing fails
    return {
      summary: result.text.slice(0, 500),
      keyPoints: [],
      readingTime: entry.reading_time,
      tokens: result.usage?.totalTokens || 0,
    };
  }
}

/**
 * Translate an article to target language
 */
export async function translateArticle(
  entry: Entry,
  targetLanguage: string,
  config: AIConfig
): Promise<TranslationResult> {
  // Rate limiting check
  if (!rateLimiter.tryConsume()) {
    throw new AIRateLimitError();
  }

  const model = getModel(config);

  const content = stripHtml(entry.content).slice(0, 10000);

  const prompt = `Translate the following article to ${targetLanguage}. 
Keep the formatting and structure intact.

Title: ${entry.title}

Content:
${content}

Respond in JSON format:
{
  "title": "translated title",
  "content": "translated content",
  "summary": "brief summary in ${targetLanguage}"
}`;

  const result = await generateText({
    model,
    prompt,
    maxTokens: 4000,
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  try {
    const parsed = JSON.parse(result.text);
    return {
      title: parsed.title,
      content: parsed.content,
      summary: parsed.summary,
      tokens: result.usage?.totalTokens || 0,
    };
  } catch {
    return {
      title: entry.title,
      content: result.text,
      tokens: result.usage?.totalTokens || 0,
    };
  }
}

/**
 * Generate tags for an article using AI
 */
export async function generateTags(
  entry: Entry,
  config: AIConfig
): Promise<string[]> {
  // Rate limiting check
  if (!rateLimiter.tryConsume()) {
    throw new AIRateLimitError();
  }

  const model = getModel(config);

  const content = stripHtml(entry.content).slice(0, 4000);

  const prompt = `Analyze this article and suggest 3-5 relevant tags.
Tags should be lowercase, single words or short phrases.

Title: ${entry.title}
Content: ${content}

Respond with a JSON array of tags:
["tag1", "tag2", "tag3"]`;

  const result = await generateText({
    model,
    prompt,
    maxTokens: 100,
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  try {
    return JSON.parse(result.text);
  } catch {
    return [];
  }
}

/**
 * Strip HTML tags from content
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Default config from environment
export function getDefaultAIConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER as AIConfig['provider']) || 'openai';

  return {
    provider,
    model: process.env.AI_MODEL,
    apiKey:
      provider === 'openai'
        ? process.env.OPENAI_API_KEY
        : provider === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY
          : undefined,
    baseUrl: process.env.AI_BASE_URL,
  };
}
