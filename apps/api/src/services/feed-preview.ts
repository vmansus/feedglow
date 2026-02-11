/**
 * Feed Preview Service
 * Fetches and previews RSS feeds on-the-fly for the discover page.
 * Includes in-memory cache to avoid re-fetching on repeated hover events.
 */

import { parseFeed, type ParsedEntry } from '../feed-engine/parser.js';

// ============ Types ============

export interface FeedPreviewItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string;
  thumbnail: string | null;
  author: string;
}

export interface FeedPreviewResult {
  feedUrl: string;
  title: string;
  description: string;
  siteUrl: string;
  language: string;
  iconUrl: string | null;
  items: FeedPreviewItem[];
  fetchedAt: number;
  cached: boolean;
}

// ============ Cache ============

interface CacheEntry {
  result: FeedPreviewResult;
  expiresAt: number;
}

const previewCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60_000; // 10 minutes
const MAX_CACHE_SIZE = 200;

// Deduplicate concurrent requests for the same URL
const pendingRequests = new Map<string, Promise<FeedPreviewResult>>();

function cleanCache(): void {
  if (previewCache.size <= MAX_CACHE_SIZE) return;
  const now = Date.now();
  // Remove expired first
  for (const [key, entry] of previewCache) {
    if (entry.expiresAt < now) previewCache.delete(key);
  }
  // If still too big, remove oldest
  if (previewCache.size > MAX_CACHE_SIZE) {
    const entries = [...previewCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE + 50);
    for (const [key] of toRemove) previewCache.delete(key);
  }
}

// ============ Helpers ============

/**
 * Extract a plain-text snippet from HTML content.
 */
function extractSnippet(html: string, maxLength: number = 200): string {
  if (!html) return '';
  // Strip HTML tags
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() + '…' : text;
}

/**
 * Extract the first image URL from HTML content.
 */
function extractFirstImage(html: string): string | null {
  if (!html) return null;
  // Match <img src="...">
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    const url = imgMatch[1];
    // Skip tiny tracking pixels, base64 data URIs, and common spacer GIFs
    if (url.startsWith('data:')) return null;
    if (url.includes('pixel') || url.includes('spacer') || url.includes('1x1')) return null;
    return url;
  }
  return null;
}

/**
 * Map a parsed entry to a preview item.
 */
function toPreviewItem(entry: ParsedEntry): FeedPreviewItem {
  // Try enclosure image first, then content image
  let thumbnail: string | null = null;
  if (entry.enclosureUrl && entry.enclosureType?.startsWith('image/')) {
    thumbnail = entry.enclosureUrl;
  }
  if (!thumbnail) {
    thumbnail = extractFirstImage(entry.content);
  }

  return {
    title: entry.title,
    url: entry.url,
    snippet: extractSnippet(entry.content),
    publishedAt: entry.publishedAt.toISOString(),
    thumbnail,
    author: entry.author || '',
  };
}

// ============ Main API ============

/**
 * Preview a feed by URL.
 * Returns the latest N entries with snippets and thumbnails.
 * Uses in-memory cache to avoid re-fetching on repeated hover events.
 */
export async function previewFeed(
  feedUrl: string,
  options: { limit?: number; skipCache?: boolean } = {}
): Promise<FeedPreviewResult> {
  const { limit = 5, skipCache = false } = options;
  const cacheKey = feedUrl;

  // Check cache
  if (!skipCache) {
    const cached = previewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, items: cached.result.items.slice(0, limit), cached: true };
    }
  }

  // Deduplicate concurrent requests
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    const result = await pending;
    return { ...result, items: result.items.slice(0, limit), cached: true };
  }

  const fetchPromise = (async (): Promise<FeedPreviewResult> => {
    const { feed } = await parseFeed(feedUrl, {
      userAgent: 'FeedGlow/1.0 (Preview)',
    });

    const items = feed.items
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 10) // Cache up to 10 items, return `limit` to caller
      .map(toPreviewItem);

    return {
      feedUrl,
      title: feed.title,
      description: feed.description,
      siteUrl: feed.siteUrl,
      language: feed.language || '',
      iconUrl: feed.iconUrl || null,
      items,
      fetchedAt: Date.now(),
      cached: false,
    };
  })();

  pendingRequests.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;

    // Store in cache
    cleanCache();
    previewCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return { ...result, items: result.items.slice(0, limit) };
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

/**
 * Preview a feed's full entry page.
 * Returns more entries than the hover preview.
 */
export async function previewFeedFull(
  feedUrl: string,
  options: { limit?: number; offset?: number } = {}
): Promise<FeedPreviewResult & { total: number; hasMore: boolean }> {
  const { limit = 20, offset = 0 } = options;

  // Use the parser directly for full preview (bypass cache limit of 10)
  const { feed } = await parseFeed(feedUrl, {
    userAgent: 'FeedGlow/1.0 (Preview)',
  });

  const allItems = feed.items
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .map(toPreviewItem);

  const total = allItems.length;
  const paged = allItems.slice(offset, offset + limit);

  return {
    feedUrl,
    title: feed.title,
    description: feed.description,
    siteUrl: feed.siteUrl,
    language: feed.language || '',
    iconUrl: feed.iconUrl || null,
    items: paged,
    fetchedAt: Date.now(),
    cached: false,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Clear the preview cache (for admin/debug).
 */
export function clearPreviewCache(): { cleared: number } {
  const count = previewCache.size;
  previewCache.clear();
  return { cleared: count };
}
