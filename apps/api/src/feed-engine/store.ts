/**
 * Feed Engine - Database Store
 * Direct PostgreSQL operations replacing Miniflux API calls
 */

import { query, getClient } from '../lib/db.js';
import type { ParsedEntry } from './parser.js';
import { sanitizeContent } from './sanitizer.js';
import { checkAndMarkDuplicates } from '../services/dedup.js';
import { estimateReadingTime } from '../services/reading-time.js';

// ============ Filter Rules Cache ============

interface FilterRule {
  id: number;
  match_target: string;
  match_type: string;
  pattern: string;
  action: string;
  action_value: string | null;
  scope: string;
  scope_id: number | null;
  enabled: boolean;
}

const filterCache = new Map<number, { rules: FilterRule[]; loadedAt: number }>();
const FILTER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateFilterCache(userId: number) {
  filterCache.delete(userId);
}

async function getFilterRules(userId: number): Promise<FilterRule[]> {
  const cached = filterCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < FILTER_CACHE_TTL) return cached.rules;

  const result = await query(
    'SELECT * FROM fg_filter_rules WHERE user_id = $1 AND enabled = true',
    [userId]
  );
  const rules = result.rows as FilterRule[];
  filterCache.set(userId, { rules, loadedAt: Date.now() });
  return rules;
}

function matchesRule(rule: FilterRule, entry: { title?: string; content?: string; author?: string }): boolean {
  const targets: string[] = [];
  if (rule.match_target === 'title' || rule.match_target === 'all') targets.push(entry.title || '');
  if (rule.match_target === 'content' || rule.match_target === 'all') targets.push(entry.content || '');
  if (rule.match_target === 'author' || rule.match_target === 'all') targets.push(entry.author || '');

  for (const text of targets) {
    if (rule.match_type === 'contains') {
      if (text.toLowerCase().includes(rule.pattern.toLowerCase())) return true;
    } else if (rule.match_type === 'regex') {
      try { if (new RegExp(rule.pattern, 'i').test(text)) return true; } catch { /* invalid regex */ }
    }
  }
  return false;
}

async function applyFilterRules(userId: number, feedId: number, entryId: number, entry: { title?: string; content?: string; author?: string }): Promise<void> {
  const rules = await getFilterRules(userId);
  
  // Get feed's category_id for scope matching
  let categoryId: number | null = null;
  
  for (const rule of rules) {
    // Check scope
    if (rule.scope === 'feed' && rule.scope_id !== feedId) continue;
    if (rule.scope === 'category') {
      if (categoryId === null) {
        const feedResult = await query('SELECT category_id FROM fg_feeds WHERE id = $1', [feedId]);
        categoryId = feedResult.rows[0]?.category_id || -1;
      }
      if (rule.scope_id !== categoryId) continue;
    }

    if (!matchesRule(rule, entry)) continue;

    // Execute action
    if (rule.action === 'mark_read') {
      await query("UPDATE fg_entries SET status = 'read' WHERE id = $1", [entryId]);
    } else if (rule.action === 'hide') {
      await query("UPDATE fg_entries SET status = 'removed' WHERE id = $1", [entryId]);
    } else if (rule.action === 'tag' && rule.action_value) {
      // Find or create tag, then attach
      let tagResult = await query('SELECT id FROM fg_tags WHERE user_id = $1 AND name = $2', [userId, rule.action_value]);
      let tagId: number;
      if (tagResult.rows.length > 0) {
        tagId = tagResult.rows[0].id;
      } else {
        const ins = await query('INSERT INTO fg_tags (user_id, name) VALUES ($1, $2) RETURNING id', [userId, rule.action_value]);
        tagId = ins.rows[0].id;
      }
      await query(
        'INSERT INTO fg_entry_tags (entry_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [entryId, tagId]
      );
    }
    // Don't break - allow multiple rules to match
  }
}

// ============ Users ============

export interface FGUser {
  id: number;
  username: string;
  email?: string;
  isAdmin: boolean;
  language: string;
  timezone: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

export async function getUserById(id: number): Promise<FGUser | null> {
  const r = await query('SELECT * FROM fg_users WHERE id = $1', [id]);
  return r.rows[0] ? mapUser(r.rows[0]) : null;
}

export async function getUserByUsername(username: string): Promise<FGUser & { passwordHash: string } | null> {
  const r = await query('SELECT * FROM fg_users WHERE username = $1', [username]);
  if (!r.rows[0]) return null;
  return { ...mapUser(r.rows[0]), passwordHash: r.rows[0].password_hash };
}

export async function getUserByEmail(email: string): Promise<FGUser & { passwordHash: string } | null> {
  const r = await query('SELECT * FROM fg_users WHERE email = $1', [email]);
  if (!r.rows[0]) return null;
  return { ...mapUser(r.rows[0]), passwordHash: r.rows[0].password_hash };
}

export async function createUser(username: string, passwordHash: string, email?: string): Promise<FGUser> {
  const r = await query(
    `INSERT INTO fg_users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING *`,
    [username, passwordHash, email || null]
  );
  return mapUser(r.rows[0]);
}

export async function updateLastLogin(userId: number): Promise<void> {
  await query('UPDATE fg_users SET last_login_at = NOW() WHERE id = $1', [userId]);
}

export async function updateUserPassword(userId: number, passwordHash: string): Promise<void> {
  await query('UPDATE fg_users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

export async function getUserPasswordHash(userId: number): Promise<string | null> {
  const r = await query('SELECT password_hash FROM fg_users WHERE id = $1', [userId]);
  return r.rows[0]?.password_hash || null;
}

function mapUser(row: any): FGUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email || undefined,
    isAdmin: row.is_admin,
    language: row.language,
    timezone: row.timezone,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || undefined,
  };
}

// ============ Categories ============

export interface FGCategory {
  id: number;
  userId: number;
  parentId: number | null;
  title: string;
  position: number;
  unreadCount?: number;
}

export async function getCategory(id: number): Promise<FGCategory | null> {
  const r = await query('SELECT * FROM fg_categories WHERE id = $1', [id]);
  return r.rows[0] ? mapCategory(r.rows[0]) : null;
}

export async function getCategories(userId: number): Promise<FGCategory[]> {
  const r = await query(
    `SELECT c.*, COALESCE(unread.count, 0) as unread_count
     FROM fg_categories c
     LEFT JOIN (
       SELECT f.category_id, COUNT(*) as count
       FROM fg_entries e
       JOIN fg_feeds f ON e.feed_id = f.id
       WHERE e.status = 'unread' AND f.user_id = $1
       GROUP BY f.category_id
     ) unread ON unread.category_id = c.id
     WHERE c.user_id = $1 
     ORDER BY c.position, c.title`,
    [userId]
  );
  return r.rows.map(mapCategory);
}

export async function createCategory(userId: number, title: string, parentId?: number): Promise<FGCategory> {
  const r = await query(
    'INSERT INTO fg_categories (user_id, title, parent_id) VALUES ($1, $2, $3) RETURNING *',
    [userId, title, parentId || null]
  );
  return mapCategory(r.rows[0]);
}

export async function updateCategory(id: number, userId: number, title: string): Promise<FGCategory> {
  const r = await query(
    'UPDATE fg_categories SET title = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [title, id, userId]
  );
  if (!r.rows[0]) throw new Error('Category not found');
  return mapCategory(r.rows[0]);
}

export async function deleteCategory(id: number, userId: number): Promise<void> {
  await query('DELETE FROM fg_categories WHERE id = $1 AND user_id = $2', [id, userId]);
}

function mapCategory(row: any): FGCategory {
  return { 
    id: row.id, 
    userId: row.user_id, 
    parentId: row.parent_id || null,
    title: row.title, 
    position: row.position,
    unreadCount: parseInt(row.unread_count) || 0,
  };
}

// ============ Feeds ============

export type FeedType = 'article' | 'social' | 'notification' | 'picture' | 'video' | 'newsletter' | 'podcast';

export interface FGFeed {
  id: number;
  userId: number;
  categoryId: number | null;
  feedUrl: string;
  siteUrl: string;
  title: string;
  description: string;
  feedType: FeedType;
  iconType?: string;
  iconData?: string;
  /** RSS channel <image> URL — Twitter profile pic, podcast art, etc. */
  profileImageUrl?: string;
  etag?: string;
  lastModified?: string;
  pollingFrequency: number;
  nextCheckAt: Date;
  checkedAt?: Date;
  parsingErrorCount: number;
  parsingErrorMessage?: string;
  crawler: boolean;
  userAgent?: string;
  scraperRules?: string;
  rewriteRules?: string;
  blocklistRules?: string;
  keeplistRules?: string;
  disabled: boolean;
  notifyOnUpdate: boolean;
  position: number;
  entryCount: number;
  createdAt: Date;
  // Computed
  category?: FGCategory;
  icon?: { feedId: number; iconId: number };
  unreadCount?: number;
}

export async function getFeeds(userId: number): Promise<FGFeed[]> {
  const r = await query(
    `SELECT f.*, c.title as category_title, c.position as category_position,
            COALESCE(unread.count, 0) as unread_count
     FROM fg_feeds f
     LEFT JOIN fg_categories c ON f.category_id = c.id
     LEFT JOIN (
       SELECT feed_id, COUNT(*) as count 
       FROM fg_entries 
       WHERE status = 'unread' 
       GROUP BY feed_id
     ) unread ON unread.feed_id = f.id
     WHERE f.user_id = $1
     ORDER BY f.position, f.title`,
    [userId]
  );
  return r.rows.map(mapFeed);
}

export async function getFeed(id: number, userId: number): Promise<FGFeed | null> {
  const r = await query(
    `SELECT f.*, c.title as category_title, c.position as category_position
     FROM fg_feeds f
     LEFT JOIN fg_categories c ON f.category_id = c.id
     WHERE f.id = $1 AND f.user_id = $2`,
    [id, userId]
  );
  return r.rows[0] ? mapFeed(r.rows[0]) : null;
}

/**
 * Auto-detect feed type based on URL patterns and content
 */
export function detectFeedType(feedUrl: string, siteUrl?: string, entries?: Array<{ enclosureType?: string }>): FeedType {
  const url = (feedUrl + ' ' + (siteUrl || '')).toLowerCase();

  // Podcast platforms & enclosure-based feeds
  if (/podcast|anchor\.fm|podcasts\.apple\.com|overcast\.fm|pocketcasts|castbox|xiaoyuzhoufm\.com|ximalaya\.com|lizhi\.fm|qingting\.fm|castro\.fm|spotify\.com.*show/.test(url)) return 'podcast';

  // Detect podcast by audio enclosures (most entries have audio/* MIME type)
  if (entries && entries.length > 0) {
    const audioCount = entries.filter(e => e.enclosureType?.startsWith('audio/')).length;
    if (audioCount > entries.length * 0.5) return 'podcast';
  }

  // Video platforms
  if (/youtube\.com|youtu\.be|bilibili\.com|b23\.tv|vimeo\.com|dailymotion\.com|twitch\.tv|nebula\.tv/.test(url)) return 'video';

  // Picture/image platforms
  if (/instagram\.com|flickr\.com|unsplash\.com|pinterest\.com|pixiv\.net|deviantart\.com|500px\.com/.test(url)) return 'picture';

  // Social media
  if (/twitter\.com|x\.com|nitter\.|mastodon|reddit\.com|lemmy|weibo\.com|t\.me|telegram\.org|threads\.net|bsky\.app|nostr/.test(url)) return 'social';

  // Notifications (releases, changelogs, monitors)
  if (/github\.com.*\/releases|github\.com.*\/tags|changelog|releases\.atom|status\.|uptime|monitor/.test(url)) return 'notification';

  // Default to article
  return 'article';
}

export async function createFeed(
  userId: number,
  feedUrl: string,
  title: string,
  siteUrl: string,
  description: string,
  categoryId?: number,
  feedType?: FeedType
): Promise<FGFeed> {
  const type = feedType || detectFeedType(feedUrl, siteUrl);
  
  // Get user's polling default for this feed type
  const pollingResult = await query(
    'SELECT polling_defaults FROM fg_user_settings WHERE user_id = $1',
    [userId]
  );
  const pollingDefaults = pollingResult.rows[0]?.polling_defaults || {};
  const pollingFreq = pollingDefaults[type] || 60;
  
  const r = await query(
    `INSERT INTO fg_feeds (user_id, feed_url, title, site_url, description, category_id, feed_type, polling_frequency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [userId, feedUrl, title, siteUrl, description, categoryId != null && categoryId > 0 ? categoryId : null, type, pollingFreq]
  );
  return mapFeed(r.rows[0]);
}

/**
 * Get unread counts grouped by feed type
 */
export async function getUnreadCountsByType(userId: number): Promise<Record<FeedType, number>> {
  const r = await query(
    `SELECT f.feed_type, COUNT(e.id) as count
     FROM fg_entries e
     JOIN fg_feeds f ON e.feed_id = f.id
     WHERE f.user_id = $1 AND e.status = 'unread'
     GROUP BY f.feed_type`,
    [userId]
  );
  const counts: Record<string, number> = { article: 0, social: 0, notification: 0, picture: 0, video: 0, newsletter: 0 };
  for (const row of r.rows) {
    counts[row.feed_type] = parseInt(row.count);
  }
  return counts as Record<FeedType, number>;
}

export async function updateFeed(
  id: number,
  userId: number,
  updates: Partial<Pick<FGFeed, 'title' | 'categoryId' | 'feedType' | 'crawler' | 'userAgent' | 'scraperRules' | 'rewriteRules' | 'blocklistRules' | 'keeplistRules' | 'disabled' | 'pollingFrequency'>>
): Promise<FGFeed | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (updates.title !== undefined) { sets.push(`title = $${idx++}`); values.push(updates.title); }
  if (updates.categoryId !== undefined) { sets.push(`category_id = $${idx++}`); values.push(updates.categoryId || null); }
  if (updates.feedType !== undefined) { sets.push(`feed_type = $${idx++}`); values.push(updates.feedType); }
  if (updates.crawler !== undefined) { sets.push(`crawler = $${idx++}`); values.push(updates.crawler); }
  if (updates.userAgent !== undefined) { sets.push(`user_agent = $${idx++}`); values.push(updates.userAgent); }
  if (updates.scraperRules !== undefined) { sets.push(`scraper_rules = $${idx++}`); values.push(updates.scraperRules); }
  if (updates.rewriteRules !== undefined) { sets.push(`rewrite_rules = $${idx++}`); values.push(updates.rewriteRules); }
  if (updates.blocklistRules !== undefined) { sets.push(`blocklist_rules = $${idx++}`); values.push(updates.blocklistRules); }
  if (updates.keeplistRules !== undefined) { sets.push(`keeplist_rules = $${idx++}`); values.push(updates.keeplistRules); }
  if (updates.disabled !== undefined) { sets.push(`disabled = $${idx++}`); values.push(updates.disabled); }
  if ((updates as any).notifyOnUpdate !== undefined) { sets.push(`notify_on_update = $${idx++}`); values.push((updates as any).notifyOnUpdate); }
  if (updates.pollingFrequency !== undefined) { sets.push(`polling_frequency = $${idx++}`); values.push(updates.pollingFrequency); }

  if (sets.length === 0) return getFeed(id, userId);

  values.push(id, userId);
  const r = await query(
    `UPDATE fg_feeds SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx++} RETURNING *`,
    values
  );
  return r.rows[0] ? mapFeed(r.rows[0]) : null;
}

export async function deleteFeed(id: number, userId: number): Promise<void> {
  await query('DELETE FROM fg_feeds WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function updateFeedCheckResult(
  feedId: number,
  result: { etag?: string; lastModified?: string; errorMessage?: string; errorCount?: number; entryCount?: number; profileImageUrl?: string }
): Promise<void> {
  await query(
    `UPDATE fg_feeds SET
       checked_at = NOW(),
       next_check_at = NOW() + (polling_frequency || ' minutes')::INTERVAL,
       etag = COALESCE($2, etag),
       last_modified = COALESCE($3, last_modified),
       parsing_error_message = $4,
       parsing_error_count = COALESCE($5, parsing_error_count),
       entry_count = COALESCE($6, entry_count),
       profile_image_url = COALESCE($7, profile_image_url)
     WHERE id = $1`,
    [feedId, result.etag || null, result.lastModified || null, result.errorMessage || null, result.errorCount ?? 0, result.entryCount, result.profileImageUrl || null]
  );
}

export async function getFeedsDueForCheck(): Promise<FGFeed[]> {
  const r = await query(
    `SELECT f.* FROM fg_feeds f
     WHERE f.disabled = FALSE AND f.next_check_at <= NOW()
     ORDER BY f.next_check_at
     LIMIT 50`
  );
  return r.rows.map(mapFeed);
}

function mapFeed(row: any): FGFeed {
  const feed: FGFeed = {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    feedUrl: row.feed_url,
    siteUrl: row.site_url || '',
    title: row.title,
    description: row.description || '',
    feedType: row.feed_type || 'article',
    iconType: row.icon_type || undefined,
    iconData: row.icon_data || undefined,
    profileImageUrl: row.profile_image_url || undefined,
    etag: row.etag || undefined,
    lastModified: row.last_modified || undefined,
    pollingFrequency: row.polling_frequency,
    nextCheckAt: row.next_check_at,
    checkedAt: row.checked_at || undefined,
    parsingErrorCount: row.parsing_error_count,
    parsingErrorMessage: row.parsing_error_message || undefined,
    crawler: row.crawler,
    userAgent: row.user_agent || undefined,
    scraperRules: row.scraper_rules || undefined,
    rewriteRules: row.rewrite_rules || undefined,
    blocklistRules: row.blocklist_rules || undefined,
    keeplistRules: row.keeplist_rules || undefined,
    disabled: row.disabled,
    notifyOnUpdate: row.notify_on_update ?? false,
    position: row.position || 0,
    entryCount: row.entry_count,
    createdAt: row.created_at,
    unreadCount: parseInt(row.unread_count) || 0,
  };
  if (row.category_title) {
    feed.category = { id: row.category_id, userId: row.user_id, title: row.category_title, position: row.category_position || 0 };
  }
  if (row.icon_data) {
    feed.icon = { feedId: row.id, iconId: row.id };
  }
  return feed;
}

// ============ Entries ============

export interface FGEntry {
  id: number;
  uuid: string;
  userId: number;
  feedId: number;
  hash: string;
  title: string;
  url: string;
  content: string;
  author: string;
  status: 'unread' | 'read' | 'removed';
  starred: boolean;
  publishedAt: Date;
  createdAt: Date;
  changedAt: Date;
  readingTime: number;
  wordCount: number;
  enclosureUrl?: string;
  enclosureType?: string;
  enclosureSize?: number;
  contentHash?: string;
  // Joined
  feed?: { id: number; title: string; siteUrl: string; iconType?: string; iconData?: string; profileImageUrl?: string; feedType?: string };
}

export interface EntryFilter {
  status?: 'unread' | 'read' | 'removed';
  starred?: boolean;
  feedId?: number;
  categoryId?: number;
  feedType?: FeedType;
  before?: number;    // unix timestamp
  after?: number;     // unix timestamp
  search?: string;
  limit?: number;
  offset?: number;
  order?: 'published_at' | 'created_at' | 'changed_at';
  direction?: 'asc' | 'desc';
}

export async function getEntries(userId: number, filter: EntryFilter = {}): Promise<{ entries: FGEntry[]; total: number }> {
  const conditions: string[] = ['e.user_id = $1'];
  const values: any[] = [userId];
  let idx = 2;

  if (filter.status) { conditions.push(`e.status = $${idx++}`); values.push(filter.status); }
  if (filter.starred !== undefined) { conditions.push(`e.starred = $${idx++}`); values.push(filter.starred); }
  if (filter.feedId) { conditions.push(`e.feed_id = $${idx++}`); values.push(filter.feedId); }
  if (filter.categoryId) {
    conditions.push(`f.category_id = $${idx++}`);
    values.push(filter.categoryId);
  }
  if (filter.feedType) { conditions.push(`f.feed_type = $${idx++}`); values.push(filter.feedType); }
  if (filter.before) { conditions.push(`e.published_at < to_timestamp($${idx++})`); values.push(filter.before); }
  if (filter.after) { conditions.push(`e.published_at > to_timestamp($${idx++})`); values.push(filter.after); }
  if (filter.search) {
    conditions.push(`(e.title ILIKE $${idx} OR e.content ILIKE $${idx} OR f.title ILIKE $${idx})`);
    values.push(`%${filter.search}%`);
    idx++;
  }

  const where = conditions.join(' AND ');
  const order = filter.order || 'published_at';
  const dir = filter.direction || 'desc';
  const limit = Math.min(filter.limit || 50, 200);
  const offset = filter.offset || 0;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT e.*, f.title as feed_title, f.site_url as feed_site_url, f.icon_type as feed_icon_type, f.icon_data as feed_icon_data, f.profile_image_url as feed_profile_image_url, f.feed_type as feed_feed_type
       FROM fg_entries e
       JOIN fg_feeds f ON e.feed_id = f.id
       WHERE ${where}
       ORDER BY e.${order} ${dir}
       LIMIT ${limit} OFFSET ${offset}`,
      values
    ),
    query(
      `SELECT COUNT(*) as total FROM fg_entries e JOIN fg_feeds f ON e.feed_id = f.id WHERE ${where}`,
      values
    ),
  ]);

  return {
    entries: dataResult.rows.map(mapEntry),
    total: parseInt(countResult.rows[0].total),
  };
}

export async function getEntry(id: number, userId: number): Promise<FGEntry | null> {
  const r = await query(
    `SELECT e.*, f.title as feed_title, f.site_url as feed_site_url, f.icon_type as feed_icon_type, f.icon_data as feed_icon_data, f.profile_image_url as feed_profile_image_url, f.feed_type as feed_feed_type
     FROM fg_entries e
     JOIN fg_feeds f ON e.feed_id = f.id
     WHERE e.id = $1 AND e.user_id = $2`,
    [id, userId]
  );
  return r.rows[0] ? mapEntry(r.rows[0]) : null;
}

export async function getEntryByUuid(uuid: string, userId: number): Promise<FGEntry | null> {
  const r = await query(
    `SELECT e.*, f.title as feed_title, f.site_url as feed_site_url, f.icon_type as feed_icon_type, f.icon_data as feed_icon_data, f.profile_image_url as feed_profile_image_url, f.feed_type as feed_feed_type
     FROM fg_entries e
     JOIN fg_feeds f ON e.feed_id = f.id
     WHERE e.uuid = $1 AND e.user_id = $2`,
    [uuid, userId]
  );
  return r.rows[0] ? mapEntry(r.rows[0]) : null;
}

export async function insertEntries(feedId: number, userId: number, entries: ParsedEntry[]): Promise<number> {
  if (entries.length === 0) return 0;

  let inserted = 0;
  for (const entry of entries) {
    try {
      // Privacy sanitization: strip tracking params, pixels, secure links
      const sanitized = sanitizeContent(entry.content || '', entry.url);
      entry.content = sanitized.html;
      entry.url = sanitized.url || entry.url;

      // Calculate reading time from content
      const readingTime = entry.content ? estimateReadingTime(entry.content) : 0;

      // Upsert: insert new or update content if changed (detected by content_hash)
      const result = await query(
        `INSERT INTO fg_entries (user_id, feed_id, hash, title, url, content, author, published_at, enclosure_url, enclosure_type, enclosure_size, content_hash, reading_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (feed_id, hash) DO UPDATE SET
           title = EXCLUDED.title,
           content = CASE WHEN fg_entries.content_hash = 'full' THEN fg_entries.content
                          WHEN fg_entries.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN EXCLUDED.content
                          ELSE fg_entries.content END,
           author = EXCLUDED.author,
           content_hash = CASE WHEN fg_entries.content_hash = 'full' THEN fg_entries.content_hash ELSE EXCLUDED.content_hash END,
           reading_time = CASE WHEN fg_entries.content_hash = 'full' THEN fg_entries.reading_time
                               WHEN EXCLUDED.reading_time > 0 THEN EXCLUDED.reading_time
                               ELSE fg_entries.reading_time END,
           changed_at = CASE WHEN fg_entries.content_hash = 'full' THEN fg_entries.changed_at
                              WHEN fg_entries.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN NOW()
                              ELSE fg_entries.changed_at END
         RETURNING (xmax = 0) AS is_new`,
        [
          userId, feedId, entry.hash, entry.title, entry.url,
          entry.content, entry.author, entry.publishedAt,
          entry.enclosureUrl || null, entry.enclosureType || null, entry.enclosureSize || 0,
          entry.contentHash || null, readingTime,
        ]
      );
      // Count only truly new inserts (not updates)
      if (result.rows[0]?.is_new) {
        inserted++;
        // Apply filter rules to newly inserted entries
        try {
          const entryRow = await query(
            'SELECT id FROM fg_entries WHERE feed_id = $1 AND hash = $2',
            [feedId, entry.hash]
          );
          if (entryRow.rows[0]) {
            await applyFilterRules(userId, feedId, entryRow.rows[0].id, {
              title: entry.title,
              content: entry.content,
              author: entry.author,
            });
            // Dedup check — runs in background, errors don't block insertion
            checkAndMarkDuplicates(userId, entryRow.rows[0].id).catch(() => {});
          }
        } catch { /* filter error shouldn't block insertion */ }
      }
    } catch (err) {
      // Skip on error
    }
  }

  // Update feed entry count
  await query(
    'UPDATE fg_feeds SET entry_count = (SELECT COUNT(*) FROM fg_entries WHERE feed_id = $1) WHERE id = $1',
    [feedId]
  );

  return inserted;
}

export async function updateEntryStatus(id: number, userId: number, status: 'unread' | 'read' | 'removed'): Promise<void> {
  await query(
    'UPDATE fg_entries SET status = $1, changed_at = NOW() WHERE id = $2 AND user_id = $3',
    [status, id, userId]
  );
}

export async function updateEntryStatusByUuid(uuid: string, userId: number, status: 'unread' | 'read' | 'removed'): Promise<void> {
  await query(
    'UPDATE fg_entries SET status = $1, changed_at = NOW() WHERE uuid = $2 AND user_id = $3',
    [status, uuid, userId]
  );
}

export async function toggleStar(id: number, userId: number): Promise<boolean> {
  const r = await query(
    'UPDATE fg_entries SET starred = NOT starred, changed_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING starred',
    [id, userId]
  );
  return r.rows[0]?.starred ?? false;
}

export async function toggleStarByUuid(uuid: string, userId: number): Promise<boolean> {
  const r = await query(
    'UPDATE fg_entries SET starred = NOT starred, changed_at = NOW() WHERE uuid = $1 AND user_id = $2 RETURNING starred',
    [uuid, userId]
  );
  return r.rows[0]?.starred ?? false;
}

export async function markAllRead(userId: number, feedId?: number, categoryId?: number): Promise<number> {
  let sql = "UPDATE fg_entries SET status = 'read', changed_at = NOW() WHERE user_id = $1 AND status = 'unread'";
  const values: any[] = [userId];

  if (feedId) {
    sql += ' AND feed_id = $2';
    values.push(feedId);
  } else if (categoryId) {
    sql += ' AND feed_id IN (SELECT id FROM fg_feeds WHERE category_id = $2 AND user_id = $1)';
    values.push(categoryId);
  }

  const r = await query(sql, values);
  return r.rowCount || 0;
}

export async function getCounters(userId: number): Promise<Record<number, { read: number; unread: number }>> {
  const r = await query(
    `SELECT feed_id, status, COUNT(*) as count
     FROM fg_entries WHERE user_id = $1
     GROUP BY feed_id, status`,
    [userId]
  );

  const counters: Record<number, { read: number; unread: number }> = {};
  for (const row of r.rows) {
    if (!counters[row.feed_id]) counters[row.feed_id] = { read: 0, unread: 0 };
    if (row.status === 'read') counters[row.feed_id].read = parseInt(row.count);
    if (row.status === 'unread') counters[row.feed_id].unread = parseInt(row.count);
  }
  return counters;
}

function mapEntry(row: any): FGEntry {
  const entry: FGEntry = {
    id: row.id,
    uuid: row.uuid,
    userId: row.user_id,
    feedId: row.feed_id,
    hash: row.hash,
    title: row.title,
    url: row.url,
    content: row.content || '',
    author: row.author || '',
    status: row.status,
    starred: row.starred,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    changedAt: row.changed_at,
    readingTime: row.reading_time || 0,
    wordCount: row.word_count || 0,
    enclosureUrl: row.enclosure_url || undefined,
    enclosureType: row.enclosure_type || undefined,
    enclosureSize: row.enclosure_size || undefined,
    contentHash: row.content_hash || undefined,
  };
  if (row.feed_title) {
    entry.feed = {
      id: row.feed_id,
      title: row.feed_title,
      siteUrl: row.feed_site_url || '',
      iconType: row.feed_icon_type || undefined,
      iconData: row.feed_icon_data || undefined,
      profileImageUrl: row.feed_profile_image_url || undefined,
      feedType: row.feed_feed_type || 'article',
    };
  }
  return entry;
}
