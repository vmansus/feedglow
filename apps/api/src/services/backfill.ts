/**
 * Backfill Service
 * 
 * Fetches historical articles from a site's sitemap.xml or archive pages,
 * then imports them into Miniflux via the import entry API.
 * This allows new feed subscriptions to show older articles.
 */

import { type FeedEngineDataClient } from '../feed-engine/data-source.js';
import { query } from '../lib/db.js';
import type { BackfillResult } from '@feedglow/shared';
export type { BackfillResult };

interface SitemapEntry {
  url: string;
  lastmod?: string;
  priority?: number;
}

// ============ Sitemap Discovery ============

/**
 * Try to find and parse sitemap(s) from a site
 */
export async function discoverSitemapUrls(siteUrl: string): Promise<SitemapEntry[]> {
  const base = siteUrl.replace(/\/$/, '');
  const entries: SitemapEntry[] = [];
  
  // Common sitemap locations
  const sitemapUrls = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap-index.xml`,
    `${base}/post-sitemap.xml`,
    `${base}/news-sitemap.xml`,
    `${base}/article-sitemap.xml`,
  ];

  // Also check robots.txt for sitemap references
  try {
    const robotsRes = await fetchWithTimeout(`${base}/robots.txt`, 10000);
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      const sitemapLines = robotsTxt.split('\n')
        .filter(line => line.toLowerCase().startsWith('sitemap:'))
        .map(line => line.split(':').slice(1).join(':').trim());
      sitemapUrls.push(...sitemapLines);
    }
  } catch {
    // robots.txt not available
  }

  // Deduplicate
  const uniqueUrls = [...new Set(sitemapUrls)];

  for (const url of uniqueUrls) {
    try {
      const sitemapEntries = await parseSitemap(url);
      entries.push(...sitemapEntries);
      if (entries.length >= 1000) break; // Enough articles found
    } catch {
      continue;
    }
  }

  // Filter to article-like URLs (heuristic)
  const articleEntries = entries.filter(e => isArticleUrl(e.url, base));

  // Sort by lastmod (newest first) and limit
  return articleEntries
    .sort((a, b) => {
      if (a.lastmod && b.lastmod) return b.lastmod.localeCompare(a.lastmod);
      return 0;
    })
    .slice(0, 1000); // Max 1000 articles to backfill
}

/**
 * Parse a sitemap XML, handling both sitemap index and urlset
 */
async function parseSitemap(url: string): Promise<SitemapEntry[]> {
  const res = await fetchWithTimeout(url, 15000);
  if (!res.ok) return [];
  
  const xml = await res.text();
  const entries: SitemapEntry[] = [];

  // Check if it's a sitemap index (contains other sitemaps)
  if (xml.includes('<sitemapindex') || xml.includes('<sitemap>')) {
    const locMatches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g);
    const childUrls: string[] = [];
    for (const m of locMatches) {
      childUrls.push(m[1]);
    }
    // Parse child sitemaps (limit to first 10 for broader coverage)
    for (const childUrl of childUrls.slice(0, 10)) {
      try {
        const childEntries = await parseSitemap(childUrl);
        entries.push(...childEntries);
      } catch {
        continue;
      }
    }
  } else {
    // Regular sitemap with <url> entries
    const urlBlocks = xml.split('<url>').slice(1);
    for (const block of urlBlocks) {
      const locMatch = block.match(/<loc>\s*(.*?)\s*<\/loc>/);
      const lastmodMatch = block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/);
      const priorityMatch = block.match(/<priority>\s*(.*?)\s*<\/priority>/);
      
      if (locMatch) {
        entries.push({
          url: locMatch[1].trim(),
          lastmod: lastmodMatch?.[1]?.trim(),
          priority: priorityMatch ? parseFloat(priorityMatch[1]) : undefined,
        });
      }
    }
  }

  return entries;
}

// ============ Article URL Detection ============

/**
 * Heuristic: is this URL likely an article?
 */
function isArticleUrl(url: string, siteBase: string): boolean {
  const path = url.replace(siteBase, '').toLowerCase();
  
  // Skip non-article pages
  const skipPatterns = [
    /^\/?$/, /\/tag\//i, /\/category\//i, /\/author\//i, /\/page\/\d/i,
    /\/search/i, /\/about/i, /\/contact/i, /\/privacy/i, /\/terms/i,
    /\/login/i, /\/register/i, /\/feed/i, /\/rss/i, /\/sitemap/i,
    /\.(jpg|png|gif|pdf|zip|css|js)$/i,
  ];
  
  if (skipPatterns.some(p => p.test(path))) return false;
  
  // Article-like paths typically have dates or slug patterns
  const articlePatterns = [
    /\/\d{4}\/\d{2}\//, // /2024/01/article-slug
    /\/\d{4}-\d{2}-/, // /2024-01-article
    /\/posts?\//i, // /post/ or /posts/
    /\/articles?\//i, // /article/ or /articles/
    /\/blog\//i, // /blog/something
    /\/news\//i, // /news/something
    /\/[a-z0-9-]{10,}/i, // long slug
  ];
  
  // If path has at least 2 segments and some length, likely an article
  const segments = path.split('/').filter(Boolean);
  if (segments.length >= 1 && path.length > 10) return true;
  
  return articlePatterns.some(p => p.test(path));
}

// ============ Article Fetching ============

/**
 * Fetch and extract article content from a URL (lightweight, no JSDOM)
 */
async function fetchArticle(url: string): Promise<{
  title: string;
  content: string;
  author: string;
  publishedAt: string | null;
} | null> {
  try {
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Lightweight extraction using regex (no heavy JSDOM)
    const title = extractMeta(html, 'og:title') 
      || extractMeta(html, 'twitter:title')
      || extractTag(html, 'title')
      || '';
    
    if (!title) return null;

    // Extract description/content
    const description = extractMeta(html, 'og:description')
      || extractMeta(html, 'description')
      || extractMeta(html, 'twitter:description')
      || '';

    // Extract published date
    let publishedAt: string | null = null;
    const dateStr = extractMeta(html, 'article:published_time')
      || extractMeta(html, 'og:published_time')
      || extractMeta(html, 'pubdate')
      || extractMeta(html, 'date')
      || extractMeta(html, 'dc.date');
    
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        publishedAt = parsed.toISOString();
      }
    }

    // Extract author
    const author = extractMeta(html, 'author')
      || extractMeta(html, 'article:author')
      || '';

    // Use description as content (lightweight — full Readability extraction
    // can be done on-demand when reading the article)
    const content = description ? `<p>${description}</p>` : '';

    return { title, content, author, publishedAt };
  } catch {
    return null;
  }
}

/** Extract content of a meta tag by property or name */
function extractMeta(html: string, name: string): string | null {
  // Try property="name"
  const propMatch = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
  return propMatch?.[1] || null;
}

/** Extract content of an HTML tag */
function extractTag(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
  return match?.[1]?.trim() || null;
}

// ============ Backfill Execution ============

/**
 * Run backfill for a feed — discover historical articles and import them
 */
export async function backfillFeed(
  client: any,
  feedId: number,
  options: { maxArticles?: number } = {}
): Promise<BackfillResult> {
  const maxArticles = options.maxArticles || 200;
  const feed = await client.getFeed(feedId);
  const siteUrl = feed.site_url || new URL(feed.feed_url).origin;

  const result: BackfillResult = {
    feedId,
    siteUrl,
    discovered: 0,
    fetched: 0,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  // Get existing entry URLs to avoid duplicates
  const { entries: existingEntries } = await client.getFeedEntries(feedId, { limit: 100 });
  const existingUrls = new Set(existingEntries.map(e => e.url));

  // Discover sitemap URLs
  const sitemapEntries = await discoverSitemapUrls(siteUrl);
  result.discovered = sitemapEntries.length;

  if (sitemapEntries.length === 0) {
    result.errors.push('No sitemap found or no article URLs discovered');
    return result;
  }

  // Filter out already-existing URLs
  const newUrls = sitemapEntries
    .filter(e => !existingUrls.has(e.url))
    .slice(0, maxArticles);

  // Fetch and import articles
  for (const entry of newUrls) {
    try {
      const article = await fetchArticle(entry.url);
      if (!article) {
        result.skipped++;
        continue;
      }
      result.fetched++;

      // Store in main entries table (unified with UUID)
      const publishedAt = article.publishedAt || entry.lastmod || new Date().toISOString();
      const hash = require('crypto').createHash('md5').update(entry.url).digest('hex');
      await query(
        `INSERT INTO fg_entries (user_id, feed_id, hash, title, url, content, author, published_at, status, uuid)
         VALUES (
           (SELECT user_id FROM fg_feeds WHERE id = $1),
           $1, $2, $3, $4, $5, $6, $7, 'unread', gen_random_uuid()
         )
         ON CONFLICT (feed_id, hash) DO NOTHING`,
        [feedId, hash, article.title, entry.url, article.content, article.author, publishedAt]
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      if (result.errors.length < 5) {
        result.errors.push(`${entry.url}: ${err.message || String(err)}`);
      }
    }

    // Small delay to be nice to servers
    await sleep(200);
  }

  return result;
}

// ============ Query Backfilled Entries ============

/**
 * Get backfilled entries for a feed, formatted like Miniflux entries
 */
export async function getBackfilledEntries(
  feedId: number,
  options: { limit?: number; offset?: number; status?: string } = {}
): Promise<{ entries: any[]; total: number }> {
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  // Build count query - only uses feedId and optionally status
  const countParams: any[] = [feedId];
  let countStatusFilter = '';
  if (options.status) {
    countParams.push(options.status);
    countStatusFilter = `AND status = $2`;
  }

  const countResult = await query(
    `SELECT COUNT(*) as total FROM fg_backfill_entries WHERE feed_id = $1 ${countStatusFilter}`,
    countParams
  );

  // Build main query - uses feedId, limit, offset, and optionally status
  const params: any[] = [feedId, limit, offset];
  let statusFilter = '';
  if (options.status) {
    params.push(options.status);
    statusFilter = `AND status = $4`;
  }

  const result = await query(
    `SELECT b.*, f.title as feed_title, f.icon_data as feed_icon_data
     FROM fg_backfill_entries b
     JOIN fg_feeds f ON b.feed_id = f.id
     WHERE b.feed_id = $1 ${statusFilter}
     ORDER BY b.published_at DESC
     LIMIT $2 OFFSET $3`,
    params
  );

  const entries = result.rows.map(row => ({
    id: `bf-${row.id}`,  // Prefix to distinguish from Miniflux entries
    feed_id: row.feed_id,
    feedId: row.feed_id,
    title: row.title,
    url: row.url,
    content: row.content,
    author: row.author,
    published_at: row.published_at,
    publishedAt: row.published_at,
    status: row.status,
    starred: false,
    reading_time: 0,
    readingTime: 0,
    created_at: row.created_at,
    // Feed info for frontend
    feedTitle: row.feed_title || '',
    feedIconUrl: row.feed_icon_data || undefined,
    _backfilled: true,  // Flag for frontend
  }));

  return {
    entries,
    total: parseInt(countResult.rows[0].total),
  };
}

/**
 * Get count of backfilled entries per feed
 */
export async function getBackfillCounts(feedIds: number[]): Promise<Record<number, number>> {
  if (feedIds.length === 0) return {};
  const placeholders = feedIds.map((_, i) => `$${i + 1}`).join(',');
  const result = await query(
    `SELECT feed_id, COUNT(*) as count FROM fg_backfill_entries 
     WHERE feed_id IN (${placeholders}) GROUP BY feed_id`,
    feedIds
  );
  const counts: Record<number, number> = {};
  for (const row of result.rows) {
    counts[row.feed_id] = parseInt(row.count);
  }
  return counts;
}

// ============ Helpers ============

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FeedGlow/1.0 (RSS Reader; +https://github.com/vmansus/feedglow)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
