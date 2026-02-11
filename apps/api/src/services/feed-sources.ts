/**
 * External Feed Sources Service
 * Fetches and parses feed recommendations from configurable external sources.
 * Supports OPML, CSV, and JSON formats.
 */

import { query } from '../lib/db.js';

// ============ Types ============

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  format: 'opml' | 'csv' | 'json' | 'auto';
  enabled: boolean;
  isBuiltin: boolean;
  lastSync?: string;
  feedCount?: number;
}

export interface ParsedFeed {
  title: string;
  feedUrl: string;
  siteUrl?: string;
  description?: string;
  category?: string;
  tags?: string[];
  source: string; // which source this came from
  iconUrl?: string; // computed favicon URL
}

/**
 * Generate favicon URL from site or feed URL
 */
function getFaviconUrl(siteUrl?: string, feedUrl?: string): string | null {
  const urlToUse = siteUrl || feedUrl;
  if (!urlToUse) return null;
  try {
    const url = new URL(urlToUse);
    let domain = url.hostname;
    // Strip common feed subdomains to get the main site domain
    domain = domain
      .replace(/^feeds?\d*\./, '')      // feeds., feed., feeds2.
      .replace(/^rss\./, '')            // rss.
      .replace(/^blog\./, '')           // blog.
      .replace(/^www\./, '');           // www.
    // Handle feedburner - can't get useful favicon
    if (domain === 'feeds.feedburner.com' || domain === 'feedburner.com') {
      return null;
    }
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return null;
  }
}

// ============ Built-in Sources ============

// All categories from awesome-rss-feeds (for internal use)
const AWESOME_RSS_CATEGORIES = [
  'Android Development', 'Android', 'Apple', 'Architecture', 'Beauty', 'Books',
  'Business & Economy', 'Cars', 'Cricket', 'DIY', 'Fashion', 'Food', 'Football',
  'Funny', 'Gaming', 'History', 'Interior design', 'Movies', 'Music', 'News',
  'Personal finance', 'Photography', 'Programming', 'Science', 'Space', 'Sports',
  'Startups', 'Tech', 'Television', 'Tennis', 'Travel', 'UI - UX', 'Web Development',
  'iOS Development'
];

// URLs for all awesome-rss-feeds categories (fetched as one source)
const AWESOME_RSS_URLS = AWESOME_RSS_CATEGORIES.map(cat => ({
  url: `https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category/${encodeURIComponent(cat)}.opml`,
  category: cat,
}));

export const BUILTIN_SOURCES: FeedSource[] = [
  // Awesome RSS Feeds - aggregated as single source
  {
    id: 'awesome-rss-feeds',
    name: 'Awesome RSS Feeds',
    url: 'https://github.com/plenaryapp/awesome-rss-feeds', // Display URL
    format: 'opml',
    enabled: true,
    isBuiltin: true,
  },
  // Engineering blogs
  {
    id: 'engineering-blogs',
    name: 'Engineering Blogs',
    url: 'https://raw.githubusercontent.com/kilimchoi/engineering-blogs/master/engineering_blogs.opml',
    format: 'opml',
    enabled: true,
    isBuiltin: true,
  },
  // Chinese blogs
  {
    id: 'chinese-independent-blogs',
    name: '中文独立博客',
    url: 'https://raw.githubusercontent.com/timqian/chinese-independent-blogs/master/blogs-original.csv',
    format: 'csv',
    enabled: true,
    isBuiltin: true,
  },
];

// Export for use in fetchSource
export { AWESOME_RSS_URLS };

// ============ Cache ============

interface CacheEntry {
  feeds: ParsedFeed[];
  fetchedAt: number;
  sources: string[];
}

let feedCache: CacheEntry | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ============ Parsers ============

/**
 * Parse OPML format
 */
function parseOPML(xml: string, sourceName: string): ParsedFeed[] {
  const feeds: ParsedFeed[] = [];
  
  // Simple regex-based OPML parsing
  const outlineRegex = /<outline[^>]*>/gi;
  let match;
  
  while ((match = outlineRegex.exec(xml)) !== null) {
    const outline = match[0];
    
    // Extract attributes
    const xmlUrl = outline.match(/xmlUrl=["']([^"']+)["']/i)?.[1];
    const title = outline.match(/(?:text|title)=["']([^"']+)["']/i)?.[1];
    const htmlUrl = outline.match(/htmlUrl=["']([^"']+)["']/i)?.[1];
    const description = outline.match(/description=["']([^"']+)["']/i)?.[1];
    
    if (xmlUrl && title) {
      feeds.push({
        title: decodeHTMLEntities(title),
        feedUrl: xmlUrl,
        siteUrl: htmlUrl,
        description: description ? decodeHTMLEntities(description) : undefined,
        source: sourceName,
        iconUrl: getFaviconUrl(htmlUrl, xmlUrl) || undefined,
      });
    }
  }
  
  return feeds;
}

/**
 * Parse CSV format (assumes: title, siteUrl, feedUrl, tags)
 */
function parseCSV(csv: string, sourceName: string): ParsedFeed[] {
  const feeds: ParsedFeed[] = [];
  const lines = csv.split('\n');
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line (handle quoted fields)
    const fields = parseCSVLine(line);
    if (fields.length < 2) continue;
    
    const [title, siteUrl, feedUrl, tags] = fields;
    
    if (title && (feedUrl || siteUrl)) {
      const trimmedFeedUrl = (feedUrl || '').trim();
      const trimmedSiteUrl = siteUrl?.trim();
      feeds.push({
        title: title.trim(),
        feedUrl: trimmedFeedUrl,
        siteUrl: trimmedSiteUrl,
        tags: tags ? tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : undefined,
        iconUrl: getFaviconUrl(trimmedSiteUrl, trimmedFeedUrl) || undefined,
        source: sourceName,
      });
    }
  }
  
  return feeds;
}

/**
 * Parse JSON format (expects array of objects with title/feedUrl)
 */
function parseJSON(json: string, sourceName: string): ParsedFeed[] {
  try {
    const data = JSON.parse(json);
    const items = Array.isArray(data) ? data : data.feeds || data.items || [];
    
    return items
      .filter((item: any) => item.title && (item.feedUrl || item.feed_url || item.url || item.xmlUrl))
      .map((item: any) => ({
        title: item.title || item.name,
        feedUrl: item.feedUrl || item.feed_url || item.url || item.xmlUrl,
        siteUrl: item.siteUrl || item.site_url || item.htmlUrl || item.website,
        description: item.description,
        category: item.category,
        tags: item.tags,
        source: sourceName,
      }));
  } catch {
    return [];
  }
}

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  
  return fields;
}

/**
 * Decode HTML entities
 */
function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Auto-detect format from content
 */
function detectFormat(content: string, url: string): 'opml' | 'csv' | 'json' {
  // Check URL extension first
  if (url.endsWith('.opml') || url.endsWith('.xml')) return 'opml';
  if (url.endsWith('.csv')) return 'csv';
  if (url.endsWith('.json')) return 'json';
  
  // Check content
  const trimmed = content.trim();
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<opml')) return 'opml';
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json';
  
  // Default to CSV for plain text
  return 'csv';
}

// ============ Database Functions ============

/**
 * Get user's feed sources (builtin + custom)
 */
export async function getFeedSources(userId: number): Promise<FeedSource[]> {
  // Get user's custom sources and overrides
  const result = await query(
    `SELECT * FROM fg_feed_sources WHERE user_id = $1`,
    [userId]
  );
  
  const userSources = new Map<string, any>();
  for (const row of result.rows) {
    userSources.set(row.source_id, row);
  }
  
  // Merge builtin with user settings
  const sources: FeedSource[] = BUILTIN_SOURCES.map(builtin => {
    const userOverride = userSources.get(builtin.id);
    return {
      ...builtin,
      enabled: userOverride ? userOverride.enabled : builtin.enabled,
      lastSync: userOverride?.last_sync,
      feedCount: userOverride?.feed_count,
    };
  });
  
  // Add user's custom sources
  for (const row of result.rows) {
    if (!BUILTIN_SOURCES.find(b => b.id === row.source_id)) {
      sources.push({
        id: row.source_id,
        name: row.name,
        url: row.url,
        format: row.format || 'auto',
        enabled: row.enabled,
        isBuiltin: false,
        lastSync: row.last_sync,
        feedCount: row.feed_count,
      });
    }
  }
  
  return sources;
}

/**
 * Add a custom feed source
 */
export async function addFeedSource(
  userId: number,
  source: { name: string; url: string; format?: string }
): Promise<FeedSource> {
  const id = `custom-${Date.now()}`;
  
  await query(
    `INSERT INTO fg_feed_sources (user_id, source_id, name, url, format, enabled, is_builtin)
     VALUES ($1, $2, $3, $4, $5, true, false)`,
    [userId, id, source.name, source.url, source.format || 'auto']
  );
  
  return {
    id,
    name: source.name,
    url: source.url,
    format: (source.format as any) || 'auto',
    enabled: true,
    isBuiltin: false,
  };
}

/**
 * Update a feed source (enable/disable or modify custom)
 */
export async function updateFeedSource(
  userId: number,
  sourceId: string,
  updates: { enabled?: boolean; name?: string; url?: string }
): Promise<void> {
  const existing = await query(
    `SELECT * FROM fg_feed_sources WHERE user_id = $1 AND source_id = $2`,
    [userId, sourceId]
  );
  
  if (existing.rows.length === 0) {
    // Create override for builtin source
    const builtin = BUILTIN_SOURCES.find(b => b.id === sourceId);
    if (builtin) {
      await query(
        `INSERT INTO fg_feed_sources (user_id, source_id, name, url, format, enabled, is_builtin)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [userId, sourceId, builtin.name, builtin.url, builtin.format, updates.enabled ?? true]
      );
    }
  } else {
    // Update existing
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;
    
    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${idx++}`);
      values.push(updates.enabled);
    }
    if (updates.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.url !== undefined) {
      setClauses.push(`url = $${idx++}`);
      values.push(updates.url);
    }
    
    if (setClauses.length > 0) {
      values.push(userId, sourceId);
      await query(
        `UPDATE fg_feed_sources SET ${setClauses.join(', ')} WHERE user_id = $${idx++} AND source_id = $${idx}`,
        values
      );
    }
  }
  
  // Invalidate cache
  feedCache = null;
}

/**
 * Delete a custom feed source
 */
export async function deleteFeedSource(userId: number, sourceId: string): Promise<void> {
  await query(
    `DELETE FROM fg_feed_sources WHERE user_id = $1 AND source_id = $2 AND is_builtin = false`,
    [userId, sourceId]
  );
  feedCache = null;
}

// ============ Fetch & Aggregate ============

/**
 * Fetch feeds from a single source
 */
async function fetchSource(source: FeedSource): Promise<ParsedFeed[]> {
  // Special handling for awesome-rss-feeds - fetch all categories
  if (source.id === 'awesome-rss-feeds') {
    return fetchAwesomeRssFeeds();
  }
  
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'FeedGlow/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!res.ok) {
      console.warn(`[FeedSources] Failed to fetch ${source.name}: ${res.status}`);
      return [];
    }
    
    const content = await res.text();
    const format = source.format === 'auto' ? detectFormat(content, source.url) : source.format;
    
    switch (format) {
      case 'opml':
        return parseOPML(content, source.name);
      case 'csv':
        return parseCSV(content, source.name);
      case 'json':
        return parseJSON(content, source.name);
      default:
        return [];
    }
  } catch (err) {
    console.warn(`[FeedSources] Error fetching ${source.name}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fetch all awesome-rss-feeds categories
 */
async function fetchAwesomeRssFeeds(): Promise<ParsedFeed[]> {
  const allFeeds: ParsedFeed[] = [];
  
  // Fetch all categories in parallel (with concurrency limit)
  const batchSize = 10;
  for (let i = 0; i < AWESOME_RSS_URLS.length; i += batchSize) {
    const batch = AWESOME_RSS_URLS.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async ({ url, category }) => {
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': 'FeedGlow/1.0' },
            signal: AbortSignal.timeout(10000),
          });
          
          if (!res.ok) return [];
          
          const content = await res.text();
          const feeds = parseOPML(content, 'Awesome RSS Feeds');
          
          // Add category to each feed
          return feeds.map(f => ({
            ...f,
            category,
            source: 'Awesome RSS Feeds',
          }));
        } catch {
          return [];
        }
      })
    );
    
    allFeeds.push(...results.flat());
  }
  
  return allFeeds;
}

/**
 * Get aggregated feeds from all enabled sources
 */
export async function getAggregatedFeeds(userId: number): Promise<{
  feeds: ParsedFeed[];
  sources: string[];
  fetchedAt: string;
}> {
  // Check cache
  if (feedCache && Date.now() - feedCache.fetchedAt < CACHE_TTL) {
    return {
      feeds: feedCache.feeds,
      sources: feedCache.sources,
      fetchedAt: new Date(feedCache.fetchedAt).toISOString(),
    };
  }
  
  // Get user's enabled sources
  const sources = await getFeedSources(userId);
  const enabledSources = sources.filter(s => s.enabled);
  
  // Fetch all sources in parallel
  const results = await Promise.all(
    enabledSources.map(source => fetchSource(source))
  );
  
  // Aggregate and dedupe by feedUrl
  const seen = new Set<string>();
  const feeds: ParsedFeed[] = [];
  const sourceNames: string[] = [];
  
  for (let i = 0; i < results.length; i++) {
    const sourceFeeds = results[i];
    if (sourceFeeds.length > 0) {
      sourceNames.push(enabledSources[i].name);
    }
    
    for (const feed of sourceFeeds) {
      const key = feed.feedUrl.toLowerCase();
      if (!seen.has(key) && feed.feedUrl) {
        seen.add(key);
        feeds.push(feed);
      }
    }
  }
  
  // Update cache
  feedCache = {
    feeds,
    sources: sourceNames,
    fetchedAt: Date.now(),
  };
  
  return {
    feeds,
    sources: sourceNames,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Force refresh the cache
 */
export async function refreshFeedSources(userId: number): Promise<void> {
  feedCache = null;
  await getAggregatedFeeds(userId);
}

/**
 * Get feeds grouped by source
 */
export async function getFeedsBySource(userId: number): Promise<{
  categories: Array<{
    id: string;
    name: string;
    feedCount: number;
    icon?: string;
  }>;
}> {
  const result = await getAggregatedFeeds(userId);
  
  // Group by category (for Awesome RSS Feeds) or source (for others)
  const categoryMap = new Map<string, number>();
  for (const feed of result.feeds) {
    // Use category if available, otherwise use source
    const groupKey = feed.category || feed.source || 'Unknown';
    categoryMap.set(groupKey, (categoryMap.get(groupKey) || 0) + 1);
  }
  
  // Convert to categories array with icons
  const iconMap: Record<string, string> = {
    // Content categories from Awesome RSS Feeds
    'Android Development': '🤖',
    'Android': '📱',
    'Apple': '🍎',
    'Architecture': '🏛️',
    'Beauty': '💄',
    'Books': '📚',
    'Business & Economy': '💼',
    'Cars': '🚗',
    'Cricket': '🏏',
    'DIY': '🔧',
    'Fashion': '👗',
    'Food': '🍕',
    'Football': '⚽',
    'Funny': '😂',
    'Gaming': '🎮',
    'History': '📜',
    'Interior design': '🏠',
    'Movies': '🎬',
    'Music': '🎵',
    'News': '📰',
    'Personal finance': '💰',
    'Photography': '📷',
    'Programming': '👨‍💻',
    'Science': '🔬',
    'Space': '🚀',
    'Sports': '🏆',
    'Startups': '🚀',
    'Tech': '💻',
    'Television': '📺',
    'Tennis': '🎾',
    'Travel': '✈️',
    'UI - UX': '🎨',
    'Web Development': '🌐',
    'iOS Development': '📲',
    // Other sources
    'Engineering Blogs': '🏗️',
    '中文独立博客': '✍️',
  };
  
  const categories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      feedCount: count,
      icon: iconMap[name] || '📚',
    }))
    .sort((a, b) => b.feedCount - a.feedCount);
  
  return { categories };
}

/**
 * Get feeds from a specific category or source
 */
export async function getFeedsFromSource(userId: number, categoryName: string): Promise<{
  feeds: ParsedFeed[];
  source: string;
}> {
  const result = await getAggregatedFeeds(userId);
  const searchKey = categoryName.toLowerCase().replace(/-/g, ' ');
  
  // Filter by category first, then by source
  const feeds = result.feeds.filter(f => {
    const feedCategory = (f.category || '').toLowerCase();
    const feedSource = (f.source || '').toLowerCase();
    const categoryId = feedCategory.replace(/\s+/g, '-');
    const sourceId = feedSource.replace(/\s+/g, '-');
    
    return feedCategory === searchKey ||
           categoryId === categoryName.toLowerCase() ||
           feedSource === searchKey ||
           sourceId === categoryName.toLowerCase();
  });
  
  return { 
    feeds,
    source: feeds[0]?.category || feeds[0]?.source || categoryName,
  };
}

// ============ Health Check ============

export interface SourceHealth {
  id: string;
  name: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  statusCode?: number;
  feedCount?: number;
  responseTime?: number;
  error?: string;
  lastChecked: string;
}

/**
 * Check health of all feed sources
 */
export async function checkSourcesHealth(userId: number): Promise<{
  overall: 'healthy' | 'degraded' | 'unhealthy';
  sources: SourceHealth[];
  checkedAt: string;
}> {
  const sources = await getFeedSources(userId);
  const enabledSources = sources.filter(s => s.enabled);
  
  const healthResults = await Promise.all(
    enabledSources.map(async (source): Promise<SourceHealth> => {
      const startTime = Date.now();
      try {
        const res = await fetch(source.url, {
          method: 'HEAD',  // Just check if accessible
          headers: { 'User-Agent': 'FeedGlow/1.0 HealthCheck' },
          signal: AbortSignal.timeout(15000),
        });
        
        const responseTime = Date.now() - startTime;
        
        if (res.ok) {
          // Also try to fetch and parse to verify content
          const contentRes = await fetch(source.url, {
            headers: { 'User-Agent': 'FeedGlow/1.0' },
            signal: AbortSignal.timeout(15000),
          });
          const content = await contentRes.text();
          const format = source.format === 'auto' ? detectFormat(content, source.url) : source.format;
          
          let feedCount = 0;
          switch (format) {
            case 'opml':
              feedCount = parseOPML(content, source.name).length;
              break;
            case 'csv':
              feedCount = parseCSV(content, source.name).length;
              break;
            case 'json':
              feedCount = parseJSON(content, source.name).length;
              break;
          }
          
          return {
            id: source.id,
            name: source.name,
            url: source.url,
            status: feedCount > 0 ? 'healthy' : 'unhealthy',
            statusCode: res.status,
            feedCount,
            responseTime,
            error: feedCount === 0 ? 'No feeds parsed from source' : undefined,
            lastChecked: new Date().toISOString(),
          };
        } else {
          return {
            id: source.id,
            name: source.name,
            url: source.url,
            status: 'unhealthy',
            statusCode: res.status,
            responseTime,
            error: `HTTP ${res.status}: ${res.statusText}`,
            lastChecked: new Date().toISOString(),
          };
        }
      } catch (err) {
        return {
          id: source.id,
          name: source.name,
          url: source.url,
          status: 'unhealthy',
          responseTime: Date.now() - startTime,
          error: err instanceof Error ? err.message : 'Unknown error',
          lastChecked: new Date().toISOString(),
        };
      }
    })
  );
  
  // Calculate overall status
  const healthyCount = healthResults.filter(r => r.status === 'healthy').length;
  const totalCount = healthResults.length;
  
  let overall: 'healthy' | 'degraded' | 'unhealthy';
  if (healthyCount === totalCount) {
    overall = 'healthy';
  } else if (healthyCount > 0) {
    overall = 'degraded';
  } else {
    overall = 'unhealthy';
  }
  
  return {
    overall,
    sources: healthResults,
    checkedAt: new Date().toISOString(),
  };
}
