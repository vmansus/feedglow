/**
 * Collections Auto-Sync Service
 * Pulls collections from external sources:
 * 1. awesome-rss-feeds (GitHub OPML files)
 * 2. RSSHub categories (auto-generated from namespace data)
 */

import { query } from '../lib/db.js';
import { getRSSHubCategoryList, getRSSHubCategoryDetail } from './discover.js';

// ============ Config ============

const AWESOME_RSS_REPO = 'https://api.github.com/repos/plenaryapp/awesome-rss-feeds/contents/recommended/with_category';
const AWESOME_RSS_RAW = 'https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/recommended/with_category';

// Category → emoji mapping for awesome-rss-feeds
const AWESOME_EMOJI: Record<string, string> = {
  'Tech': '💻', 'Programming': '👨‍💻', 'Web Development': '🌐', 'iOS Development': '📱',
  'Android Development': '🤖', 'Android': '🤖', 'Apple': '🍎', 'News': '📰',
  'Science': '🔬', 'Space': '🚀', 'Gaming': '🎮', 'Movies': '🎬',
  'Music': '🎵', 'Books': '📚', 'Food': '🍳', 'Travel': '✈️',
  'Photography': '📷', 'Fashion': '👗', 'Beauty': '💄', 'Cars': '🚗',
  'Sports': '⚽', 'Football': '🏈', 'Cricket': '🏏', 'Tennis': '🎾',
  'Business & Economy': '💼', 'Personal finance': '💰', 'Startups': '🚀',
  'History': '📜', 'Funny': '😂', 'DIY': '🔧', 'Television': '📺',
  'Architecture': '🏛️', 'Interior design': '🏠', 'UI - UX': '🎨',
};

// ============ OPML Parser ============

interface OPMLFeed {
  title: string;
  xmlUrl: string;
  description: string;
}

function parseOPML(xml: string): OPMLFeed[] {
  const feeds: OPMLFeed[] = [];
  // Simple regex parser for OPML outline elements
  const outlineRegex = /<outline\s[^>]*xmlUrl="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = outlineRegex.exec(xml)) !== null) {
    const tag = match[0];
    const xmlUrl = match[1];
    const titleMatch = tag.match(/\btitle="([^"]*)"/);
    const descMatch = tag.match(/\bdescription="([^"]*)"/);
    if (xmlUrl) {
      feeds.push({
        title: titleMatch?.[1] || '',
        xmlUrl: xmlUrl.replace(/&amp;/g, '&'),
        description: descMatch?.[1] || '',
      });
    }
  }
  return feeds;
}

// ============ Awesome RSS Feeds Sync ============

/**
 * Sync collections from awesome-rss-feeds GitHub repo.
 * Fetches OPML files, parses them, and upserts into fg_collections.
 */
export async function syncAwesomeRSSFeeds(userId: number): Promise<{ synced: number; feeds: number }> {
  console.log('[Collections] Syncing awesome-rss-feeds...');

  // Fetch directory listing
  const dirRes = await fetch(AWESOME_RSS_REPO, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'Accept': 'application/json', 'User-Agent': 'FeedGlow/1.0' },
  });
  if (!dirRes.ok) throw new Error(`GitHub API error: ${dirRes.status}`);
  const files = await dirRes.json() as { name: string; download_url: string }[];

  let synced = 0;
  let totalFeeds = 0;

  for (const file of files) {
    if (!file.name.endsWith('.opml')) continue;
    const categoryName = file.name.replace('.opml', '');

    try {
      // Fetch OPML content
      const opmlRes = await fetch(file.download_url, {
        signal: AbortSignal.timeout(8_000),
        headers: { 'User-Agent': 'FeedGlow/1.0' },
      });
      if (!opmlRes.ok) continue;
      const opmlText = await opmlRes.text();
      const feeds = parseOPML(opmlText);
      if (feeds.length === 0) continue;

      const emoji = AWESOME_EMOJI[categoryName] || '📦';
      const source = 'awesome-rss-feeds';

      // Upsert collection by (user_id, title)
      const description = `Curated ${categoryName} feeds from awesome-rss-feeds`;
      let colId: number;
      const existing = await query(
        'SELECT id FROM fg_collections WHERE title = $1 AND user_id = $2 LIMIT 1',
        [categoryName, userId]
      );
      if (existing.rows.length > 0) {
        colId = existing.rows[0].id;
        await query(
          'UPDATE fg_collections SET description = $2, icon_emoji = $3, source = $4, updated_at = NOW() WHERE id = $1',
          [colId, description, emoji, 'awesome-rss-feeds']
        );
      } else {
        const ins = await query(
          'INSERT INTO fg_collections (user_id, title, description, icon_emoji, is_public, source) VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING id',
          [userId, categoryName, description, emoji, 'awesome-rss-feeds']
        );
        colId = ins.rows[0].id;
      }

      // Upsert feeds
      for (let i = 0; i < feeds.length; i++) {
        const f = feeds[i];
        await query(
          `INSERT INTO fg_collection_feeds (collection_id, feed_url, title, description, category, position)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (collection_id, feed_url) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description`,
          [colId, f.xmlUrl, f.title, f.description, categoryName.toLowerCase(), i]
        );
      }

      totalFeeds += feeds.length;
      synced++;
      console.log(`[Collections] ${emoji} ${categoryName}: ${feeds.length} feeds`);
    } catch (err) {
      console.warn(`[Collections] Failed to sync ${categoryName}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[Collections] Synced ${synced} categories, ${totalFeeds} total feeds`);
  return { synced, feeds: totalFeeds };
}

// ============ RSSHub Auto-Collections ============

/**
 * Generate collections from RSSHub categories (top routes by view).
 */
export async function syncRSSHubCollections(userId: number): Promise<{ synced: number; feeds: number }> {
  console.log('[Collections] Syncing RSSHub collections...');

  const categories = await getRSSHubCategoryList();
  let synced = 0;
  let totalFeeds = 0;

  for (const cat of categories) {
    // Skip 'other' (too broad) and categories with very few entries
    if (cat.id === 'other' || cat.count < 2) continue;

    try {
      const detail = await getRSSHubCategoryDetail(cat.id, { limit: 10, sort: 'popular' });
      
      // Collect top routes across all namespaces
      const topRoutes: { feedUrl: string; title: string; siteUrl: string; description: string }[] = [];
      for (const ns of detail.namespaces) {
        for (const route of ns.routes.slice(0, 3)) {
          if (topRoutes.length >= 15) break;
          topRoutes.push({
            feedUrl: route.example || route.feedUrl,
            title: `${ns.name} — ${route.name}`,
            siteUrl: ns.url ? `https://${ns.url}` : '',
            description: route.description.slice(0, 200),
          });
        }
      }

      if (topRoutes.length === 0) continue;

      const title = `RSSHub: ${cat.name}`;
      const description = `${cat.emoji} ${cat.name} — RSSHub 热门路由 (${cat.count} 源)`;

      // Upsert collection
      const existing = await query(
        'SELECT id FROM fg_collections WHERE title = $1 AND user_id = $2 LIMIT 1',
        [title, userId]
      );

      let colId: number;
      if (existing.rows.length > 0) {
        colId = existing.rows[0].id;
        await query(
          'UPDATE fg_collections SET description = $2, icon_emoji = $3, updated_at = NOW() WHERE id = $1',
          [colId, description, cat.emoji]
        );
        // Clear old feeds and re-insert
        await query('DELETE FROM fg_collection_feeds WHERE collection_id = $1', [colId]);
      } else {
        const ins = await query(
          'INSERT INTO fg_collections (user_id, title, description, icon_emoji, is_public) VALUES ($1, $2, $3, $4, TRUE) RETURNING id',
          [userId, title, description, cat.emoji]
        );
        colId = ins.rows[0].id;
      }

      for (let i = 0; i < topRoutes.length; i++) {
        const r = topRoutes[i];
        await query(
          `INSERT INTO fg_collection_feeds (collection_id, feed_url, title, site_url, description, category, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (collection_id, feed_url) DO NOTHING`,
          [colId, r.feedUrl, r.title, r.siteUrl, r.description, cat.id, i]
        );
      }

      totalFeeds += topRoutes.length;
      synced++;
    } catch (err) {
      console.warn(`[Collections] Failed RSSHub ${cat.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[Collections] RSSHub: ${synced} categories, ${totalFeeds} routes`);
  return { synced, feeds: totalFeeds };
}

// ============ Full Sync ============

/**
 * Run all collection sync sources.
 */
export async function syncAllCollections(userId: number): Promise<{
  awesome: { synced: number; feeds: number };
  rsshub: { synced: number; feeds: number };
}> {
  const awesome = await syncAwesomeRSSFeeds(userId);
  const rsshub = await syncRSSHubCollections(userId);
  return { awesome, rsshub };
}
