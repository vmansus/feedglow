/**
 * Feed Discovery Service
 * Recommendations, trending, and curated collections
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Feed } from '../lib/types.js';
import { query } from '../lib/db.js';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data', 'discover');

// Feed recommendation
export interface FeedRecommendation {
  feedUrl: string;
  title: string;
  siteUrl: string;
  description?: string;
  category: string;
  subscribers: number;
  language: string;
}

// Curated collection
export interface FeedCollection {
  id: number | string;
  name: string;
  description: string;
  iconEmoji: string;
  feeds: FeedRecommendation[];
  createdBy: string;
  createdAt: number;
  isPublic?: boolean;
}

// Global stats for trending
interface GlobalStats {
  feedSubscriptions: Record<string, number>;  // feedUrl -> subscription count
  feedCategories: Record<string, string>;     // feedUrl -> category
  lastUpdated: number;
}

// Predefined collections (curated)
// Seed data — inserted on first run if table is empty
const SEED_COLLECTIONS = [
  { title: 'Tech News', description: '科技新闻精选', iconEmoji: '💻', feeds: [
    { feedUrl: 'https://sspai.com/feed', title: '少数派', siteUrl: 'https://sspai.com', category: 'tech', language: 'zh' },
    { feedUrl: 'https://www.ifanr.com/feed', title: '爱范儿', siteUrl: 'https://www.ifanr.com', category: 'tech', language: 'zh' },
    { feedUrl: 'https://36kr.com/feed', title: '36氪', siteUrl: 'https://36kr.com', category: 'tech', language: 'zh' },
    { feedUrl: 'https://techcrunch.com/feed/', title: 'TechCrunch', siteUrl: 'https://techcrunch.com', category: 'tech', language: 'en' },
    { feedUrl: 'https://www.theverge.com/rss/index.xml', title: 'The Verge', siteUrl: 'https://www.theverge.com', category: 'tech', language: 'en' },
  ]},
  { title: 'Developer Blogs', description: '开发者博客', iconEmoji: '✍️', feeds: [
    { feedUrl: 'https://blog.pragmaticengineer.com/rss/', title: 'Pragmatic Engineer', siteUrl: 'https://blog.pragmaticengineer.com', category: 'dev', language: 'en' },
    { feedUrl: 'https://martinfowler.com/feed.atom', title: 'Martin Fowler', siteUrl: 'https://martinfowler.com', category: 'dev', language: 'en' },
    { feedUrl: 'https://overreacted.io/rss.xml', title: 'Overreacted (Dan Abramov)', siteUrl: 'https://overreacted.io', category: 'dev', language: 'en' },
    { feedUrl: 'https://www.ruanyifeng.com/blog/atom.xml', title: '阮一峰的网络日志', siteUrl: 'https://www.ruanyifeng.com/blog/', category: 'dev', language: 'zh' },
  ]},
  { title: 'AI & Machine Learning', description: 'AI 和机器学习', iconEmoji: '🤖', feeds: [
    { feedUrl: 'https://openai.com/blog/rss/', title: 'OpenAI Blog', siteUrl: 'https://openai.com/blog', category: 'ai', language: 'en' },
    { feedUrl: 'https://www.deepmind.com/blog/rss.xml', title: 'DeepMind Blog', siteUrl: 'https://www.deepmind.com/blog', category: 'ai', language: 'en' },
    { feedUrl: 'https://lilianweng.github.io/index.xml', title: "Lil'Log", siteUrl: 'https://lilianweng.github.io', category: 'ai', language: 'en' },
  ]},
  { title: 'Design & UX', description: '设计与用户体验', iconEmoji: '🎨', feeds: [
    { feedUrl: 'https://www.nngroup.com/feed/rss/', title: 'Nielsen Norman Group', siteUrl: 'https://www.nngroup.com', category: 'design', language: 'en' },
    { feedUrl: 'https://uxdesign.cc/feed', title: 'UX Collective', siteUrl: 'https://uxdesign.cc', category: 'design', language: 'en' },
  ]},
];

let seeded = false;

async function ensureSeedCollections(userId: number): Promise<void> {
  if (seeded) return;
  try {
    const { rows } = await query('SELECT COUNT(*) as count FROM fg_collections');
    if (parseInt(rows[0].count) > 0) { seeded = true; return; }

    console.log('[Discover] Seeding default collections...');
    for (let i = 0; i < SEED_COLLECTIONS.length; i++) {
      const col = SEED_COLLECTIONS[i];
      const r = await query(
        `INSERT INTO fg_collections (user_id, title, description, icon_emoji, position)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, col.title, col.description, col.iconEmoji, i]
      );
      const colId = r.rows[0].id;
      for (let j = 0; j < col.feeds.length; j++) {
        const f = col.feeds[j];
        await query(
          `INSERT INTO fg_collection_feeds (collection_id, feed_url, title, site_url, description, category, language, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
          [colId, f.feedUrl, f.title, f.siteUrl, '', f.category, f.language, j]
        );
      }
    }
    seeded = true;
    console.log('[Discover] Seeded', SEED_COLLECTIONS.length, 'collections');
  } catch (err) {
    console.warn('[Discover] Seed failed:', err instanceof Error ? err.message : err);
  }
}

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Load global stats
 */
async function loadGlobalStats(): Promise<GlobalStats> {
  await ensureDataDir();
  const path = join(DATA_DIR, 'global-stats.json');

  try {
    const data = await readFile(path, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      feedSubscriptions: {},
      feedCategories: {},
      lastUpdated: Date.now(),
    };
  }
}

/**
 * Save global stats
 */
async function saveGlobalStats(stats: GlobalStats): Promise<void> {
  await ensureDataDir();
  const path = join(DATA_DIR, 'global-stats.json');
  stats.lastUpdated = Date.now();
  await writeFile(path, JSON.stringify(stats, null, 2));
}

/**
 * Record a subscription (for trending)
 */
export async function recordSubscription(feed: Feed): Promise<void> {
  const stats = await loadGlobalStats();

  const url = feed.feed_url;
  stats.feedSubscriptions[url] = (stats.feedSubscriptions[url] || 0) + 1;
  stats.feedCategories[url] = feed.category?.title || 'uncategorized';

  await saveGlobalStats(stats);
}

/**
 * Get trending feeds
 */
export async function getTrendingFeeds(limit: number = 20): Promise<FeedRecommendation[]> {
  const stats = await loadGlobalStats();

  const trending = Object.entries(stats.feedSubscriptions)
    .map(([url, count]) => ({
      feedUrl: url,
      title: extractTitleFromUrl(url),
      siteUrl: extractSiteUrl(url),
      category: stats.feedCategories[url] || 'uncategorized',
      subscribers: count,
      language: 'unknown',
    }))
    .sort((a, b) => b.subscribers - a.subscribers)
    .slice(0, limit);

  return trending;
}

/**
 * Get recommended feeds based on user's subscriptions
 */
export async function getRecommendedFeeds(
  userFeeds: Feed[],
  limit: number = 10
): Promise<FeedRecommendation[]> {
  // Analyze user's feed categories
  const userCategories = new Map<string, number>();
  for (const feed of userFeeds) {
    const cat = feed.category?.title || 'uncategorized';
    userCategories.set(cat, (userCategories.get(cat) || 0) + 1);
  }

  // Get top categories
  const topCategories = [...userCategories.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat.toLowerCase());

  // Find matching feeds from DB collections
  const userFeedUrls = new Set(userFeeds.map(f => f.feed_url));
  const recommendations: FeedRecommendation[] = [];

  const collections = await getCollections(0);
  for (const collection of collections) {
    for (const feed of collection.feeds) {
      if (userFeedUrls.has(feed.feedUrl)) continue;
      const feedCat = feed.category.toLowerCase();
      if (topCategories.some(cat => feedCat.includes(cat) || cat.includes(feedCat))) {
        recommendations.push(feed);
      }
    }
  }

  // Also add some trending feeds
  const trending = await getTrendingFeeds(20);
  for (const feed of trending) {
    if (!userFeedUrls.has(feed.feedUrl) && !recommendations.find(r => r.feedUrl === feed.feedUrl)) {
      recommendations.push(feed);
    }
  }

  return recommendations.slice(0, limit);
}

// ============ DB-backed Collections ============

function mapCollectionRow(row: any, feedRows: any[]): FeedCollection {
  return {
    id: row.id,
    name: row.title,
    description: row.description || '',
    iconEmoji: row.icon_emoji || '📦',
    isPublic: row.is_public,
    feeds: feedRows.map(f => ({
      feedUrl: f.feed_url,
      title: f.title,
      siteUrl: f.site_url || '',
      description: f.description || '',
      category: f.category || '',
      subscribers: 0,
      language: f.language || '',
    })),
    createdBy: String(row.user_id),
    createdAt: new Date(row.created_at).getTime(),
  };
}

/**
 * Get all public collections (+ user's own)
 */
export async function getCollections(userId: number): Promise<FeedCollection[]> {
  await ensureSeedCollections(userId);
  const { rows: colRows } = await query(
    `SELECT * FROM fg_collections WHERE is_public = TRUE OR user_id = $1 ORDER BY position, id`,
    [userId]
  );
  const collections: FeedCollection[] = [];
  for (const col of colRows) {
    const { rows: feedRows } = await query(
      `SELECT * FROM fg_collection_feeds WHERE collection_id = $1 ORDER BY position, id`,
      [col.id]
    );
    collections.push(mapCollectionRow(col, feedRows));
  }
  return collections;
}

/**
 * Get a specific collection by ID
 */
export async function getCollection(id: number | string): Promise<FeedCollection | null> {
  const numId = typeof id === 'string' ? parseInt(id) : id;
  if (isNaN(numId)) return null;
  const { rows: colRows } = await query('SELECT * FROM fg_collections WHERE id = $1', [numId]);
  if (colRows.length === 0) return null;
  const { rows: feedRows } = await query(
    'SELECT * FROM fg_collection_feeds WHERE collection_id = $1 ORDER BY position, id',
    [numId]
  );
  return mapCollectionRow(colRows[0], feedRows);
}

/**
 * Create a new collection
 */
export async function createCollection(
  userId: number,
  data: { title: string; description?: string; iconEmoji?: string; isPublic?: boolean }
): Promise<FeedCollection> {
  const { rows } = await query(
    `INSERT INTO fg_collections (user_id, title, description, icon_emoji, is_public)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, data.title, data.description || '', data.iconEmoji || '📦', data.isPublic ?? true]
  );
  return mapCollectionRow(rows[0], []);
}

/**
 * Update a collection
 */
export async function updateCollection(
  id: number,
  userId: number,
  data: { title?: string; description?: string; iconEmoji?: string; isPublic?: boolean }
): Promise<FeedCollection | null> {
  const col = await getCollection(id);
  if (!col) return null;
  await query(
    `UPDATE fg_collections SET
       title = COALESCE($3, title),
       description = COALESCE($4, description),
       icon_emoji = COALESCE($5, icon_emoji),
       is_public = COALESCE($6, is_public),
       updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [id, userId, data.title, data.description, data.iconEmoji, data.isPublic]
  );
  return getCollection(id);
}

/**
 * Delete a collection
 */
export async function deleteCollection(id: number, userId: number): Promise<boolean> {
  const r = await query('DELETE FROM fg_collections WHERE id = $1 AND user_id = $2', [id, userId]);
  return (r.rowCount || 0) > 0;
}

/**
 * Add a feed to a collection
 */
export async function addFeedToCollection(
  collectionId: number,
  feed: { feedUrl: string; title: string; siteUrl?: string; description?: string; category?: string; language?: string }
): Promise<void> {
  await query(
    `INSERT INTO fg_collection_feeds (collection_id, feed_url, title, site_url, description, category, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (collection_id, feed_url) DO NOTHING`,
    [collectionId, feed.feedUrl, feed.title, feed.siteUrl || '', feed.description || '', feed.category || '', feed.language || '']
  );
}

/**
 * Remove a feed from a collection
 */
export async function removeFeedFromCollection(collectionId: number, feedUrl: string): Promise<boolean> {
  const r = await query(
    'DELETE FROM fg_collection_feeds WHERE collection_id = $1 AND feed_url = $2',
    [collectionId, feedUrl]
  );
  return (r.rowCount || 0) > 0;
}

/**
 * Search feeds in collections
 */
export async function searchFeeds(q: string): Promise<FeedRecommendation[]> {
  const { rows } = await query(
    `SELECT cf.* FROM fg_collection_feeds cf
     JOIN fg_collections c ON cf.collection_id = c.id
     WHERE c.is_public = TRUE
       AND (cf.title ILIKE $1 OR cf.category ILIKE $1 OR cf.description ILIKE $1)
     ORDER BY cf.title LIMIT 20`,
    [`%${q}%`]
  );
  return rows.map((f: any) => ({
    feedUrl: f.feed_url,
    title: f.title,
    siteUrl: f.site_url || '',
    description: f.description || '',
    category: f.category || '',
    subscribers: 0,
    language: f.language || '',
  }));
}

// ============ RSSHub Integration ============

// Build RSSHub instances list - prioritize self-hosted instance from env
const RSSHUB_INSTANCES = [
  process.env.RSSHUB_URL || 'https://rsshub.app',
  // Fallback public instances (may be rate-limited)
  ...(process.env.RSSHUB_URL ? ['https://rsshub.app'] : []),
  'https://rsshub.rssforever.com',
  'https://rsshub.moeyy.cn',
].filter((v, i, a) => a.indexOf(v) === i); // dedupe

// --- Category Mapping ---
const CATEGORY_MAP: Record<string, { name: string; emoji: string; color: string }> = {
  'social-media':      { name: '社交媒体',   emoji: '💬', color: '#3B82F6' },
  'programming':       { name: '编程',       emoji: '💻', color: '#10B981' },
  'traditional-media': { name: '传统媒体',   emoji: '📰', color: '#6366F1' },
  'new-media':         { name: '新媒体',     emoji: '📱', color: '#8B5CF6' },
  'finance':           { name: '金融',       emoji: '💰', color: '#F59E0B' },
  'game':              { name: '游戏',       emoji: '🎮', color: '#EF4444' },
  'anime':             { name: '动漫',       emoji: '🎌', color: '#EC4899' },
  'reading':           { name: '阅读',       emoji: '📚', color: '#14B8A6' },
  'design':            { name: '设计',       emoji: '🎨', color: '#F97316' },
  'blog':              { name: '博客',       emoji: '✍️', color: '#06B6D4' },
  'multimedia':        { name: '多媒体',     emoji: '🎬', color: '#A855F7' },
  'picture':           { name: '图片',       emoji: '🖼️', color: '#D946EF' },
  'university':        { name: '大学',       emoji: '🎓', color: '#0EA5E9' },
  'study':             { name: '学习',       emoji: '📖', color: '#22D3EE' },
  'shopping':          { name: '购物',       emoji: '🛒', color: '#FB923C' },
  'government':        { name: '政务',       emoji: '🏛️', color: '#64748B' },
  'journal':           { name: '期刊',       emoji: '📑', color: '#84CC16' },
  'forecast':          { name: '预报',       emoji: '🌤️', color: '#38BDF8' },
  'bbs':               { name: '论坛',       emoji: '💬', color: '#A3E635' },
  'popular':           { name: '热门',       emoji: '🔥', color: '#F43F5E' },
  'program-update':    { name: '程序更新',   emoji: '🔄', color: '#94A3B8' },
  'other':             { name: '其他',       emoji: '📦', color: '#9CA3AF' },
};

// --- Types ---

export interface RSSHubRoute {
  name: string;
  path: string;
  url: string;
  description: string;
  categories: string[];
  example: string;
  parameters: Record<string, string>;
  instance: string;
}

export interface RSSHubRouteDetail {
  path: string;
  name: string;
  description: string;
  example: string;
  parameters: { name: string; description: string; required: boolean }[];
  view: number;
  features: string[];
  feedUrl: string;
}

export interface RSSHubNamespace {
  id: string;
  name: string;
  url: string;
  lang: string;
  routeCount: number;
  totalViews: number;
  routes: RSSHubRouteDetail[];
}

export interface RSSHubCategoryInfo {
  id: string;
  name: string;
  nameEn: string;
  emoji: string;
  count: number;
  color: string;
}

export interface RSSHubPopularRoute {
  namespace: string;
  namespaceName: string;
  url: string;
  path: string;
  name: string;
  description: string;
  example: string;
  parameters: { name: string; description: string; required: boolean }[];
  view: number;
  category: string;
  lang: string;
}

// --- Namespace Cache ---

interface NamespaceEntry {
  name: string;
  url: string;
  categories: string[];
  lang: string;
  description: string;
  routes: Record<string, any>;
}

let namespaceCache: Record<string, NamespaceEntry> | null = null;
let namespaceCacheExpiry = 0;
const CACHE_TTL = 6 * 3600_000; // 6 hours
let cacheLoading: Promise<Record<string, NamespaceEntry>> | null = null;

/**
 * Load and cache the full RSSHub namespace data.
 * Uses in-memory cache with 6-hour TTL.
 * Deduplicates concurrent requests.
 */
async function getNamespaceData(): Promise<Record<string, NamespaceEntry>> {
  if (namespaceCache && Date.now() < namespaceCacheExpiry) {
    return namespaceCache;
  }

  // Avoid parallel fetches
  if (cacheLoading) return cacheLoading;

  cacheLoading = (async () => {
    for (const instance of RSSHUB_INSTANCES) {
      try {
        console.log(`[RSSHub] Fetching namespace data from ${instance}...`);
        const res = await fetch(`${instance}/api/namespace`, {
          signal: AbortSignal.timeout(15_000),
          headers: { 'Accept': 'application/json' },
        });
        if (!res.ok) continue;

        const data = await res.json() as Record<string, NamespaceEntry>;
        namespaceCache = data;
        namespaceCacheExpiry = Date.now() + CACHE_TTL;
        console.log(`[RSSHub] Cached ${Object.keys(data).length} namespaces from ${instance}`);
        return data;
      } catch (err) {
        console.warn(`[RSSHub] Failed to fetch from ${instance}:`, err instanceof Error ? err.message : err);
        continue;
      }
    }
    throw new Error('All RSSHub instances failed');
  })();

  try {
    const result = await cacheLoading;
    return result;
  } finally {
    cacheLoading = null;
  }
}

/**
 * Force refresh namespace cache
 */
export async function refreshNamespaceCache(): Promise<{ namespaces: number; routes: number }> {
  namespaceCache = null;
  namespaceCacheExpiry = 0;
  const data = await getNamespaceData();
  const routeCount = Object.values(data).reduce((sum, ns) => sum + Object.keys(ns.routes || {}).length, 0);
  return { namespaces: Object.keys(data).length, routes: routeCount };
}

// --- Parameter Parsing ---

/**
 * Parse route path template parameters into structured data.
 * `:name` → required, `:name?` → optional, `{.+}` regex stripped
 */
function parseParameters(
  routePath: string,
  paramDescriptions: Record<string, string> = {}
): { name: string; description: string; required: boolean }[] {
  const params: { name: string; description: string; required: boolean }[] = [];
  // Match :paramName or :paramName? (with optional regex like {.+})
  const paramRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)(\{[^}]*\})?(\?)?/g;
  let match;
  while ((match = paramRegex.exec(routePath)) !== null) {
    const name = match[1];
    const optional = !!match[3];
    params.push({
      name,
      description: paramDescriptions[name] || '',
      required: !optional,
    });
  }
  return params;
}

/**
 * Extract active feature flags from a route's features object.
 */
function extractFeatures(features: Record<string, boolean> = {}): string[] {
  const flags: string[] = [];
  if (features.supportRadar) flags.push('supportRadar');
  if (features.supportBT) flags.push('supportBT');
  if (features.supportPodcast) flags.push('supportPodcast');
  if (features.supportScihub) flags.push('supportScihub');
  if (features.requirePuppeteer) flags.push('requirePuppeteer');
  if (features.requireConfig) flags.push('requireConfig');
  if (features.antiCrawler) flags.push('antiCrawler');
  return flags;
}

// --- Public API Functions ---

/**
 * Get all RSSHub categories with namespace counts.
 */
export async function getRSSHubCategoryList(): Promise<RSSHubCategoryInfo[]> {
  const data = await getNamespaceData();

  // Count namespaces per category
  const counts: Record<string, number> = {};
  for (const ns of Object.values(data)) {
    const cats = ns.categories || [];
    if (cats.length === 0) {
      counts['other'] = (counts['other'] || 0) + 1;
    } else {
      for (const cat of cats) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
  }

  // Build result sorted by count descending
  const categories: RSSHubCategoryInfo[] = [];
  for (const [id, count] of Object.entries(counts)) {
    const meta = CATEGORY_MAP[id] || { name: id, emoji: '📦', color: '#9CA3AF' };
    categories.push({
      id,
      name: meta.name,
      nameEn: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      emoji: meta.emoji,
      count,
      color: meta.color,
    });
  }

  categories.sort((a, b) => b.count - a.count);
  return categories;
}

/**
 * Get namespaces and routes for a specific category.
 */
export async function getRSSHubCategoryDetail(
  categoryId: string,
  options: { lang?: string; sort?: string; limit?: number; offset?: number } = {}
): Promise<{ category: RSSHubCategoryInfo; namespaces: RSSHubNamespace[]; total: number; hasMore: boolean }> {
  const { lang = 'all', sort = 'popular', limit = 50, offset = 0 } = options;
  const data = await getNamespaceData();
  const instance = RSSHUB_INSTANCES[0];

  const meta = CATEGORY_MAP[categoryId] || { name: categoryId, emoji: '📦', color: '#9CA3AF' };

  // Collect matching namespaces
  const matchingNs: { id: string; ns: NamespaceEntry; totalViews: number }[] = [];
  for (const [nsId, ns] of Object.entries(data)) {
    const cats = ns.categories || [];
    // Match category (uncategorized → 'other')
    const inCategory = cats.includes(categoryId) || (categoryId === 'other' && cats.length === 0);
    if (!inCategory) continue;
    // Language filter
    if (lang !== 'all' && ns.lang && ns.lang !== lang) continue;

    let totalViews = 0;
    for (const route of Object.values(ns.routes || {})) {
      totalViews += (route as any).view || 0;
    }
    matchingNs.push({ id: nsId, ns, totalViews });
  }

  // Sort
  if (sort === 'popular') {
    matchingNs.sort((a, b) => b.totalViews - a.totalViews || a.ns.name.localeCompare(b.ns.name));
  } else {
    matchingNs.sort((a, b) => a.ns.name.localeCompare(b.ns.name));
  }

  const total = matchingNs.length;
  const paged = matchingNs.slice(offset, offset + limit);

  // Build namespace details
  const namespaces: RSSHubNamespace[] = paged.map(({ id, ns, totalViews }) => {
    const routes: RSSHubRouteDetail[] = [];
    for (const [routePath, routeRaw] of Object.entries(ns.routes || {})) {
      const route = routeRaw as any;
      routes.push({
        path: `/${id}${routePath}`,
        name: route.name || routePath,
        description: (route.description || '').replace(/:::\s*tip[\s\S]*?:::/g, '').trim(),
        example: route.example ? `${instance}${route.example}` : '',
        parameters: parseParameters(routePath, route.parameters || {}),
        view: route.view || 0,
        features: extractFeatures(route.features || {}),
        feedUrl: route.example ? `${instance}${route.example}` : `${instance}/${id}${routePath}`,
      });
    }
    // Sort routes by view descending
    routes.sort((a, b) => b.view - a.view);

    return {
      id,
      name: ns.name || id,
      url: ns.url || '',
      lang: ns.lang || 'unknown',
      routeCount: routes.length,
      totalViews,
      routes,
    };
  });

  return {
    category: {
      id: categoryId,
      name: meta.name,
      nameEn: categoryId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      emoji: meta.emoji,
      count: total,
      color: meta.color,
    },
    namespaces,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Get popular routes sorted by view count.
 */
export async function getRSSHubPopularRoutes(
  options: { lang?: string; limit?: number; category?: string } = {}
): Promise<RSSHubPopularRoute[]> {
  const { lang = 'all', limit = 30, category } = options;
  const data = await getNamespaceData();
  const instance = RSSHUB_INSTANCES[0];

  const allRoutes: RSSHubPopularRoute[] = [];

  for (const [nsId, ns] of Object.entries(data)) {
    if (lang !== 'all' && ns.lang && ns.lang !== lang) continue;
    const nsCats = ns.categories || [];
    if (category && !nsCats.includes(category)) continue;

    for (const [routePath, routeRaw] of Object.entries(ns.routes || {})) {
      const route = routeRaw as any;
      const view = route.view || 0;
      if (view === 0) continue; // Only routes with popularity data

      allRoutes.push({
        namespace: nsId,
        namespaceName: ns.name || nsId,
        url: ns.url || '',
        path: `/${nsId}${routePath}`,
        name: route.name || routePath,
        description: (route.description || '').replace(/:::\s*tip[\s\S]*?:::/g, '').trim(),
        example: route.example ? `${instance}${route.example}` : '',
        feedUrl: route.example ? `${instance}${route.example}` : `${instance}/${nsId}${routePath}`,
        parameters: parseParameters(routePath, route.parameters || {}),
        view,
        category: (route.categories || nsCats)[0] || 'other',
        lang: ns.lang || 'unknown',
      });
    }
  }

  allRoutes.sort((a, b) => b.view - a.view);
  return allRoutes.slice(0, limit);
}

/**
 * Enhanced search: searches both namespace names and route names.
 */
export async function searchRSSHubEnhanced(
  keyword: string,
  options: { lang?: string; category?: string; limit?: number } = {}
): Promise<RSSHubPopularRoute[]> {
  const { lang = 'all', category, limit = 20 } = options;
  const data = await getNamespaceData();
  const instance = RSSHUB_INSTANCES[0];
  const lowerKeyword = keyword.toLowerCase();

  const results: (RSSHubPopularRoute & { score: number })[] = [];

  for (const [nsId, ns] of Object.entries(data)) {
    if (lang !== 'all' && ns.lang && ns.lang !== lang) continue;
    const nsCats = ns.categories || [];
    if (category && !nsCats.includes(category)) continue;

    const nsNameMatch = (ns.name || '').toLowerCase().includes(lowerKeyword);
    const nsUrlMatch = (ns.url || '').toLowerCase().includes(lowerKeyword);
    const nsIdMatch = nsId.toLowerCase().includes(lowerKeyword);

    for (const [routePath, routeRaw] of Object.entries(ns.routes || {})) {
      const route = routeRaw as any;
      const routeName = (route.name || '').toLowerCase();
      const routeDesc = (route.description || '').toLowerCase();

      // Score relevance
      let score = 0;
      if (nsIdMatch) score += 10;
      if (nsNameMatch) score += 8;
      if (nsUrlMatch) score += 6;
      if (routeName.includes(lowerKeyword)) score += 10;
      if (routeDesc.includes(lowerKeyword)) score += 3;

      if (score === 0) continue;
      // Boost by popularity
      score += Math.min((route.view || 0) / 10, 5);

      results.push({
        namespace: nsId,
        namespaceName: ns.name || nsId,
        url: ns.url || '',
        path: `/${nsId}${routePath}`,
        name: route.name || routePath,
        description: (route.description || '').replace(/:::\s*tip[\s\S]*?:::/g, '').trim(),
        example: route.example ? `${instance}${route.example}` : '',
        feedUrl: route.example ? `${instance}${route.example}` : `${instance}/${nsId}${routePath}`,
        parameters: parseParameters(routePath, route.parameters || {}),
        view: route.view || 0,
        category: (route.categories || nsCats)[0] || 'other',
        lang: ns.lang || 'unknown',
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Legacy search — hits RSSHub /api/routes/:domain directly.
 * Kept as fallback for URL-based lookups.
 */
export async function searchRSSHub(keyword: string): Promise<RSSHubRoute[]> {
  const results: RSSHubRoute[] = [];

  let domain = '';
  try {
    const url = new URL(keyword.startsWith('http') ? keyword : `https://${keyword}`);
    domain = url.hostname.replace(/^www\./, '');
  } catch {
    domain = keyword.toLowerCase();
  }

  for (const instance of RSSHUB_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/routes/${domain}`, {
        signal: AbortSignal.timeout(5_000),
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) continue;

      const data = await res.json() as any;
      if (data.data && typeof data.data === 'object') {
        for (const [routePath, routeInfo] of Object.entries(data.data) as [string, any][]) {
          const routes = Array.isArray(routeInfo) ? routeInfo : [routeInfo];
          for (const route of routes) {
            results.push({
              name: route.name || domain,
              path: routePath,
              url: `${instance}${routePath}`,
              description: route.description || '',
              categories: route.categories || [],
              example: route.example ? `${instance}${route.example}` : `${instance}${routePath}`,
              parameters: route.parameters || {},
              instance,
            });
          }
        }
      }

      if (results.length > 0) break;
    } catch {
      continue;
    }
  }

  return results;
}

/** @deprecated Use getRSSHubCategoryList + getRSSHubCategoryDetail instead */
export async function getRSSHubCategories(): Promise<Record<string, RSSHubRoute[]>> {
  // Backward compat: convert new format to old
  const cats = await getRSSHubCategoryList();
  const result: Record<string, RSSHubRoute[]> = {};
  const instance = RSSHUB_INSTANCES[0];
  for (const cat of cats.slice(0, 8)) {
    const detail = await getRSSHubCategoryDetail(cat.id, { limit: 10 });
    result[cat.id] = [];
    for (const ns of detail.namespaces) {
      for (const r of ns.routes.slice(0, 3)) {
        result[cat.id].push({
          name: r.name,
          path: r.path,
          url: r.feedUrl,
          description: r.description,
          categories: [cat.id],
          example: r.example,
          parameters: Object.fromEntries(r.parameters.map(p => [p.name, p.description])),
          instance,
        });
      }
    }
  }
  return result;
}

// Helper functions
function extractTitleFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function extractSiteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return url;
  }
}
