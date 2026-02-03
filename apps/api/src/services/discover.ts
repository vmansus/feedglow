/**
 * Feed Discovery Service
 * Recommendations, trending, and curated collections
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Feed } from '../lib/miniflux.js';

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
  id: string;
  name: string;
  description: string;
  feeds: FeedRecommendation[];
  createdBy: string;
  createdAt: number;
}

// Global stats for trending
interface GlobalStats {
  feedSubscriptions: Record<string, number>;  // feedUrl -> subscription count
  feedCategories: Record<string, string>;     // feedUrl -> category
  lastUpdated: number;
}

// Predefined collections (curated)
const CURATED_COLLECTIONS: FeedCollection[] = [
  {
    id: 'tech-news',
    name: 'Tech News',
    description: '科技新闻精选',
    feeds: [
      { feedUrl: 'https://sspai.com/feed', title: '少数派', siteUrl: 'https://sspai.com', category: 'tech', subscribers: 0, language: 'zh' },
      { feedUrl: 'https://www.ifanr.com/feed', title: '爱范儿', siteUrl: 'https://www.ifanr.com', category: 'tech', subscribers: 0, language: 'zh' },
      { feedUrl: 'https://36kr.com/feed', title: '36氪', siteUrl: 'https://36kr.com', category: 'tech', subscribers: 0, language: 'zh' },
      { feedUrl: 'https://techcrunch.com/feed/', title: 'TechCrunch', siteUrl: 'https://techcrunch.com', category: 'tech', subscribers: 0, language: 'en' },
      { feedUrl: 'https://www.theverge.com/rss/index.xml', title: 'The Verge', siteUrl: 'https://www.theverge.com', category: 'tech', subscribers: 0, language: 'en' },
    ],
    createdBy: 'system',
    createdAt: Date.now(),
  },
  {
    id: 'dev-blogs',
    name: 'Developer Blogs',
    description: '开发者博客',
    feeds: [
      { feedUrl: 'https://blog.pragmaticengineer.com/rss/', title: 'Pragmatic Engineer', siteUrl: 'https://blog.pragmaticengineer.com', category: 'dev', subscribers: 0, language: 'en' },
      { feedUrl: 'https://martinfowler.com/feed.atom', title: 'Martin Fowler', siteUrl: 'https://martinfowler.com', category: 'dev', subscribers: 0, language: 'en' },
      { feedUrl: 'https://overreacted.io/rss.xml', title: 'Overreacted (Dan Abramov)', siteUrl: 'https://overreacted.io', category: 'dev', subscribers: 0, language: 'en' },
      { feedUrl: 'https://www.ruanyifeng.com/blog/atom.xml', title: '阮一峰的网络日志', siteUrl: 'https://www.ruanyifeng.com/blog/', category: 'dev', subscribers: 0, language: 'zh' },
    ],
    createdBy: 'system',
    createdAt: Date.now(),
  },
  {
    id: 'ai-ml',
    name: 'AI & Machine Learning',
    description: 'AI 和机器学习',
    feeds: [
      { feedUrl: 'https://openai.com/blog/rss/', title: 'OpenAI Blog', siteUrl: 'https://openai.com/blog', category: 'ai', subscribers: 0, language: 'en' },
      { feedUrl: 'https://www.deepmind.com/blog/rss.xml', title: 'DeepMind Blog', siteUrl: 'https://www.deepmind.com/blog', category: 'ai', subscribers: 0, language: 'en' },
      { feedUrl: 'https://lilianweng.github.io/index.xml', title: "Lil'Log", siteUrl: 'https://lilianweng.github.io', category: 'ai', subscribers: 0, language: 'en' },
    ],
    createdBy: 'system',
    createdAt: Date.now(),
  },
  {
    id: 'design',
    name: 'Design & UX',
    description: '设计与用户体验',
    feeds: [
      { feedUrl: 'https://www.nngroup.com/feed/rss/', title: 'Nielsen Norman Group', siteUrl: 'https://www.nngroup.com', category: 'design', subscribers: 0, language: 'en' },
      { feedUrl: 'https://uxdesign.cc/feed', title: 'UX Collective', siteUrl: 'https://uxdesign.cc', category: 'design', subscribers: 0, language: 'en' },
    ],
    createdBy: 'system',
    createdAt: Date.now(),
  },
];

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

  // Find matching feeds from collections
  const userFeedUrls = new Set(userFeeds.map(f => f.feed_url));
  const recommendations: FeedRecommendation[] = [];

  for (const collection of CURATED_COLLECTIONS) {
    for (const feed of collection.feeds) {
      // Skip if user already subscribed
      if (userFeedUrls.has(feed.feedUrl)) continue;

      // Check if category matches user interests
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

/**
 * Get curated collections
 */
export function getCollections(): FeedCollection[] {
  return CURATED_COLLECTIONS;
}

/**
 * Get a specific collection
 */
export function getCollection(id: string): FeedCollection | null {
  return CURATED_COLLECTIONS.find(c => c.id === id) || null;
}

/**
 * Search feeds in collections
 */
export function searchFeeds(query: string): FeedRecommendation[] {
  const lowerQuery = query.toLowerCase();
  const results: FeedRecommendation[] = [];

  for (const collection of CURATED_COLLECTIONS) {
    for (const feed of collection.feeds) {
      if (
        feed.title.toLowerCase().includes(lowerQuery) ||
        feed.category.toLowerCase().includes(lowerQuery) ||
        (feed.description?.toLowerCase().includes(lowerQuery))
      ) {
        results.push(feed);
      }
    }
  }

  return results;
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
