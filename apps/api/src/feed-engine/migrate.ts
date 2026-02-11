/**
 * Data Migration: Miniflux → FeedGlow Feed Engine
 * 
 * Migrates existing Miniflux data into fg_ self-owned tables.
 * Safe to run multiple times (idempotent via ON CONFLICT).
 * 
 * Usage: npx tsx src/feed-engine/migrate.ts [minifluxUrl] [minifluxApiKey]
 */

import { query } from '../lib/db.js';
import bcrypt from 'bcrypt';

interface MinifluxUser {
  id: number;
  username: string;
  is_admin: boolean;
  language: string;
  timezone: string;
}

interface MinifluxCategory {
  id: number;
  title: string;
  user_id: number;
}

interface MinifluxFeed {
  id: number;
  user_id: number;
  category: { id: number; title: string };
  feed_url: string;
  site_url: string;
  title: string;
  description: string;
  etag_header: string;
  last_modified_header: string;
  parsing_error_count: number;
  parsing_error_message: string;
  crawler: boolean;
  user_agent: string;
  scraper_rules: string;
  rewrite_rules: string;
  blocklist_rules: string;
  keeplist_rules: string;
  disabled: boolean;
  icon: { feed_id: number; icon_id: number };
}

interface MinifluxEntry {
  id: number;
  user_id: number;
  feed_id: number;
  hash: string;
  title: string;
  url: string;
  content: string;
  author: string;
  status: string;
  starred: boolean;
  published_at: string;
  created_at: string;
  changed_at: string;
  reading_time: number;
  enclosures?: Array<{
    url: string;
    mime_type: string;
    size: number;
  }>;
  feed: { id: number; title: string; site_url: string };
}

export async function migrateFromMiniflux(
  minifluxUrl: string,
  minifluxApiKey: string,
  defaultPassword = 'changeme123'
): Promise<{
  users: number;
  categories: number;
  feeds: number;
  entries: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const stats = { users: 0, categories: 0, feeds: 0, entries: 0 };

  const headers = {
    'X-Auth-Token': minifluxApiKey,
    'Content-Type': 'application/json',
  };

  async function mfGet<T>(path: string): Promise<T> {
    const res = await fetch(`${minifluxUrl}${path}`, { headers });
    if (!res.ok) throw new Error(`Miniflux API ${path}: ${res.status}`);
    return res.json() as T;
  }

  console.log('[Migration] Starting Miniflux → FeedGlow migration...');
  console.log(`[Migration] Source: ${minifluxUrl}`);

  // ID mapping: miniflux ID → fg_ ID
  const userMap = new Map<number, number>();
  const categoryMap = new Map<number, number>();
  const feedMap = new Map<number, number>();

  // ============ 1. Migrate Users ============
  console.log('[Migration] Step 1: Users...');
  try {
    const users = await mfGet<MinifluxUser[]>('/v1/users');
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    for (const user of users) {
      try {
        const r = await query(
          `INSERT INTO fg_users (username, password_hash, is_admin, language, timezone)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (username) DO UPDATE SET is_admin = EXCLUDED.is_admin
           RETURNING id`,
          [user.username, passwordHash, user.is_admin, user.language || 'zh-CN', user.timezone || 'Asia/Shanghai']
        );
        userMap.set(user.id, r.rows[0].id);
        stats.users++;
      } catch (err) {
        errors.push(`User ${user.username}: ${err}`);
      }
    }
  } catch (err) {
    // If /v1/users fails (non-admin), try /v1/me
    console.log('[Migration] Cannot list users (non-admin?), using /v1/me');
    try {
      const me = await mfGet<MinifluxUser>('/v1/me');
      const passwordHash = await bcrypt.hash(defaultPassword, 12);
      const r = await query(
        `INSERT INTO fg_users (username, password_hash, is_admin, language, timezone)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO UPDATE SET is_admin = EXCLUDED.is_admin
         RETURNING id`,
        [me.username, passwordHash, me.is_admin, me.language || 'zh-CN', me.timezone || 'Asia/Shanghai']
      );
      userMap.set(me.id, r.rows[0].id);
      stats.users++;
    } catch (err2) {
      errors.push(`User migration failed: ${err2}`);
    }
  }

  console.log(`[Migration] Users: ${stats.users} migrated`);

  // ============ 2. Migrate Categories ============
  console.log('[Migration] Step 2: Categories...');
  try {
    const categories = await mfGet<MinifluxCategory[]>('/v1/categories');
    for (const cat of categories) {
      const fgUserId = userMap.get(cat.user_id) || [...userMap.values()][0];
      if (!fgUserId) continue;

      try {
        const r = await query(
          `INSERT INTO fg_categories (user_id, title)
           VALUES ($1, $2)
           ON CONFLICT (user_id, title) DO UPDATE SET title = EXCLUDED.title
           RETURNING id`,
          [fgUserId, cat.title]
        );
        categoryMap.set(cat.id, r.rows[0].id);
        stats.categories++;
      } catch (err) {
        errors.push(`Category ${cat.title}: ${err}`);
      }
    }
  } catch (err) {
    errors.push(`Categories migration failed: ${err}`);
  }

  console.log(`[Migration] Categories: ${stats.categories} migrated`);

  // ============ 3. Migrate Feeds ============
  console.log('[Migration] Step 3: Feeds...');
  try {
    const feeds = await mfGet<MinifluxFeed[]>('/v1/feeds');
    for (const feed of feeds) {
      const fgUserId = userMap.get(feed.user_id) || [...userMap.values()][0];
      if (!fgUserId) continue;

      const fgCategoryId = feed.category ? categoryMap.get(feed.category.id) : null;

      // Fetch icon if available
      let iconData: string | null = null;
      let iconType: string | null = null;
      if (feed.icon?.icon_id) {
        try {
          const icon = await mfGet<{ id: number; mime_type: string; data: string }>(
            `/v1/feeds/${feed.id}/icon`
          );
          iconType = icon.mime_type;
          // Miniflux data already includes "mime;base64," prefix
          iconData = icon.data.startsWith('data:') ? icon.data : `data:${icon.data}`;
        } catch {
          // Icon fetch failed, skip
        }
      }

      try {
        const r = await query(
          `INSERT INTO fg_feeds (user_id, category_id, feed_url, site_url, title, description,
            icon_type, icon_data, etag, last_modified,
            parsing_error_count, parsing_error_message, crawler, user_agent,
            scraper_rules, rewrite_rules, blocklist_rules, keeplist_rules, disabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
           ON CONFLICT (user_id, feed_url) DO UPDATE SET
             title = EXCLUDED.title, category_id = EXCLUDED.category_id,
             icon_type = EXCLUDED.icon_type, icon_data = EXCLUDED.icon_data
           RETURNING id`,
          [
            fgUserId, fgCategoryId || null, feed.feed_url, feed.site_url, feed.title, feed.description || '',
            iconType, iconData, feed.etag_header || null, feed.last_modified_header || null,
            feed.parsing_error_count, feed.parsing_error_message || null,
            feed.crawler, feed.user_agent || null,
            feed.scraper_rules || null, feed.rewrite_rules || null,
            feed.blocklist_rules || null, feed.keeplist_rules || null, feed.disabled,
          ]
        );
        feedMap.set(feed.id, r.rows[0].id);
        stats.feeds++;
      } catch (err) {
        errors.push(`Feed ${feed.title}: ${err}`);
      }
    }
  } catch (err) {
    errors.push(`Feeds migration failed: ${err}`);
  }

  console.log(`[Migration] Feeds: ${stats.feeds} migrated`);

  // ============ 4. Migrate Entries (paginated) ============
  console.log('[Migration] Step 4: Entries (this may take a while)...');
  try {
    let offset = 0;
    const batchSize = 100;
    let hasMore = true;

    while (hasMore) {
      const result = await mfGet<{ total: number; entries: MinifluxEntry[] }>(
        `/v1/entries?order=published_at&direction=desc&limit=${batchSize}&offset=${offset}`
      );

      for (const entry of result.entries) {
        const fgFeedId = feedMap.get(entry.feed_id);
        const fgUserId = userMap.get(entry.user_id) || [...userMap.values()][0];
        if (!fgFeedId || !fgUserId) continue;

        const enclosure = entry.enclosures?.[0];

        try {
          await query(
            `INSERT INTO fg_entries (user_id, feed_id, hash, title, url, content, author,
              status, starred, published_at, created_at, changed_at, reading_time,
              enclosure_url, enclosure_type, enclosure_size)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (feed_id, hash) DO NOTHING`,
            [
              fgUserId, fgFeedId, entry.hash, entry.title, entry.url,
              entry.content, entry.author || '',
              entry.status === 'read' ? 'read' : 'unread',
              entry.starred,
              entry.published_at, entry.created_at, entry.changed_at || entry.created_at,
              entry.reading_time || 0,
              enclosure?.url || null, enclosure?.mime_type || null, enclosure?.size || 0,
            ]
          );
          stats.entries++;
        } catch (err) {
          // Skip duplicate
        }
      }

      offset += batchSize;
      hasMore = result.entries.length === batchSize;

      if (offset % 500 === 0) {
        console.log(`[Migration] Entries: ${stats.entries} migrated (offset: ${offset}/${result.total})`);
      }
    }
  } catch (err) {
    errors.push(`Entries migration failed: ${err}`);
  }

  // Update feed entry counts
  await query(`
    UPDATE fg_feeds SET entry_count = (
      SELECT COUNT(*) FROM fg_entries WHERE fg_entries.feed_id = fg_feeds.id
    )
  `);

  console.log(`[Migration] Complete!`);
  console.log(`  Users: ${stats.users}`);
  console.log(`  Categories: ${stats.categories}`);
  console.log(`  Feeds: ${stats.feeds}`);
  console.log(`  Entries: ${stats.entries}`);
  if (errors.length) console.log(`  Errors: ${errors.length}`);

  return { ...stats, errors };
}

// CLI entry point
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  const minifluxUrl = process.argv[2] || process.env.MINIFLUX_URL || 'http://localhost:8080';
  const minifluxApiKey = process.argv[3] || process.env.MINIFLUX_API_KEY || '';

  if (!minifluxApiKey) {
    console.error('Usage: npx tsx src/feed-engine/migrate.ts <minifluxUrl> <minifluxApiKey>');
    process.exit(1);
  }

  import('../lib/db.js').then(async (db) => {
    await db.runMigrations();
    const result = await migrateFromMiniflux(minifluxUrl, minifluxApiKey);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.errors.length > 0 ? 1 : 0);
  });
}
