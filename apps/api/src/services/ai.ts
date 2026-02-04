/**
 * AI Service - Article summarization and translation
 * Using Vercel AI SDK for multi-provider support
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
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
const AI_TIMEOUT_MS = 60000;

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
    case 'openai': {
      // Support custom baseUrl for OpenAI-compatible APIs (DeepSeek, etc.)
      const openai = createOpenAI({
        baseURL: config.baseUrl || 'https://api.openai.com/v1',
        apiKey: config.apiKey,
      });
      return openai(model);
    }
    case 'anthropic':
      return anthropic(model);
    case 'ollama': {
      // For Ollama, use openai-compatible endpoint
      const ollama = createOpenAI({
        baseURL: config.baseUrl || 'http://localhost:11434/v1',
        apiKey: 'ollama', // Ollama doesn't need a real key
      });
      return ollama(model);
    }
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
    const parsed = JSON.parse(extractJson(result.text));
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

  const content = stripHtml(entry.content).slice(0, 5000);

  const prompt = `Translate to ${targetLanguage}. Return JSON only, no markdown.

Title: ${entry.title}

Content:
${content}

{"title":"translated title","content":"translated content","summary":"one sentence summary in ${targetLanguage}"}`;

  const result = await generateText({
    model,
    prompt,
    maxTokens: 4000,
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  try {
    const parsed = JSON.parse(extractJson(result.text));
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
    return JSON.parse(extractJson(result.text));
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

/**
 * Extract JSON from text that might be wrapped in markdown code blocks
 */
function extractJson(text: string): string {
  // Try to extract from ```json ... ``` or ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  
  // Try to find JSON object or array directly
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1];
  }
  
  return text;
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

/**
 * Get AI config for a specific user (from stored settings)
 */
export async function getAIConfigForUser(userId: number): Promise<AIConfig> {
  // Dynamic import to avoid circular dependencies
  const { getAISettings, getDecryptedApiKey, DEFAULT_BASE_URLS, DEFAULT_MODELS } = await import('./settings.js');
  
  const settings = await getAISettings(userId);
  const apiKey = await getDecryptedApiKey(userId);
  
  // Map provider to AIConfig format
  let provider: AIConfig['provider'] = 'openai';
  let baseUrl = settings.baseUrl;
  
  switch (settings.provider) {
    case 'openai':
      provider = 'openai';
      baseUrl = baseUrl || DEFAULT_BASE_URLS.openai;
      break;
    case 'anthropic':
      provider = 'anthropic';
      break;
    case 'deepseek':
      provider = 'openai'; // DeepSeek uses OpenAI-compatible API
      baseUrl = baseUrl || DEFAULT_BASE_URLS.deepseek;
      break;
    case 'ollama':
      provider = 'ollama';
      baseUrl = baseUrl || DEFAULT_BASE_URLS.ollama;
      break;
    case 'custom':
      provider = 'openai'; // Custom uses OpenAI-compatible API
      break;
  }
  
  return {
    provider,
    model: settings.model || DEFAULT_MODELS[settings.provider],
    apiKey,
    baseUrl,
  };
}
