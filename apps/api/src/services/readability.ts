/**
 * Full-text content extraction using Readability
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

// Simple in-memory cache (could be Redis/DB in production)
const contentCache = new Map<string, { content: string; title: string; excerpt: string; fetchedAt: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// User agents to rotate for anti-bot evasion
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
];

export interface ExtractedContent {
  title: string;
  content: string;
  excerpt: string;
  byline?: string;
  siteName?: string;
  length: number;
  cached: boolean;
}

export class ContentExtractionError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'ContentExtractionError';
  }
}

/**
 * Fetch and extract readable content from a URL
 */
export async function extractContent(url: string): Promise<ExtractedContent> {
  // Check cache first
  const cached = contentCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return {
      title: cached.title,
      content: cached.content,
      excerpt: cached.excerpt,
      length: cached.content.length,
      cached: true,
    };
  }

  // Fetch the page
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  
  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ContentExtractionError('Request timeout', 408);
    }
    throw new ContentExtractionError(`Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (!response.ok) {
    throw new ContentExtractionError(`HTTP ${response.status}`, response.status);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new ContentExtractionError('Not an HTML page');
  }

  const html = await response.text();

  // Parse with JSDOM
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  // Extract with Readability
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.content) {
    throw new ContentExtractionError('Could not extract content from page');
  }

  // Cache the result
  contentCache.set(url, {
    title: article.title || '',
    content: article.content,
    excerpt: article.excerpt || '',
    fetchedAt: Date.now(),
  });

  // Clean up old cache entries (keep max 1000)
  if (contentCache.size > 1000) {
    const oldestKey = contentCache.keys().next().value;
    if (oldestKey) contentCache.delete(oldestKey);
  }

  return {
    title: article.title || '',
    content: article.content,
    excerpt: article.excerpt || '',
    byline: article.byline || undefined,
    siteName: article.siteName || undefined,
    length: article.content.length,
    cached: false,
  };
}

/**
 * Clear cache for a specific URL or all
 */
export function clearCache(url?: string): void {
  if (url) {
    contentCache.delete(url);
  } else {
    contentCache.clear();
  }
}

/**
 * Get cache stats
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: contentCache.size,
    maxSize: 1000,
  };
}
