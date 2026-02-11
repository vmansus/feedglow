/**
 * Feed Engine Data Source
 *
 * Provides the data access layer for all routes, querying PostgreSQL directly.
 */

import type {
  Feed, Entry, Category, EntriesFilter, EntriesResponse,
  IconData, DiscoverResponse, Enclosure,
} from '../lib/types.js';
import {
  getFeeds as storeGetFeeds,
  getFeed as storeGetFeed,
  createFeed as storeCreateFeed,
  updateFeed as storeUpdateFeed,
  deleteFeed as storeDeleteFeed,
  getEntries as storeGetEntries,
  getEntry as storeGetEntry,
  getEntryByUuid as storeGetEntryByUuid,
  insertEntries as storeInsertEntries,
  updateEntryStatus as storeUpdateEntryStatus,
  toggleStar as storeToggleStar,
  markAllRead as storeMarkAllRead,
  getCounters as storeGetCounters,
  getCategories as storeGetCategories,
  createCategory as storeCreateCategory,
  updateCategory as storeUpdateCategory,
  deleteCategory as storeDeleteCategory,
  getUserById,
  type FGFeed,
  type FGEntry,
  // FGCategory used in exportOPML
  type EntryFilter,
} from './store.js';
import { parseFeed, discoverFeeds as discoverFeedUrls, discoverFeedIcon } from './parser.js';
import { refreshFeed as schedulerRefreshFeed } from './scheduler.js';
import { query } from '../lib/db.js';
import { transformPlatformUrl, getNativeFeedUrl, isLikelyFeedUrl } from './url-transformer.js';

/**
 * FeedEngineDataClient — drop-in replacement for MinifluxClient.
 * All return types match Miniflux shapes so downstream code works unchanged.
 */
export class FeedEngineDataClient {
  constructor(private userId: number) {}

  // ============ Feeds ============

  async getFeeds(): Promise<Feed[]> {
    const feeds = await storeGetFeeds(this.userId);
    return feeds.map(f => mapFeedToMiniflux(f));
  }

  async getFeed(id: number): Promise<Feed> {
    const feed = await storeGetFeed(id, this.userId);
    if (!feed) throw Object.assign(new Error('Feed not found'), { status: 404 });
    return mapFeedToMiniflux(feed);
  }

  async createFeed(feedUrl: string, categoryId: number): Promise<Feed> {
    // Auto-transform platform URLs (YouTube, Bilibili, etc.) to RSSHub/native feeds
    let resolvedUrl = feedUrl;
    let platform: string | undefined;
    if (!isLikelyFeedUrl(feedUrl)) {
      const transformed = await transformPlatformUrl(feedUrl);
      if (transformed.source !== 'original') {
        console.log(`[URL Transform] ${transformed.platform}: ${feedUrl} → ${transformed.feedUrl}`);
        resolvedUrl = transformed.feedUrl;
        platform = transformed.platform;
      }
    }

    let result;
    try {
      result = await parseFeed(resolvedUrl);
    } catch (err) {
      // If RSSHub route failed, try native RSS as fallback
      if (platform && resolvedUrl !== feedUrl) {
        const nativeUrl = getNativeFeedUrl(feedUrl);
        if (nativeUrl) {
          console.log(`[URL Transform] RSSHub failed, trying native: ${nativeUrl}`);
          resolvedUrl = nativeUrl;
          result = await parseFeed(nativeUrl);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const feed = await storeCreateFeed(
      this.userId,
      resolvedUrl,
      result.feed.title || feedUrl,
      result.feed.siteUrl || '',
      result.feed.description || '',
      categoryId,
    );
    await storeInsertEntries(feed.id, this.userId, result.feed.items);

    // Auto-discover feed icon in background
    const siteUrl = result.feed.siteUrl || feedUrl;
    discoverFeedIcon(siteUrl).then(async (icon) => {
      if (icon) {
        await query(
          'UPDATE fg_feeds SET icon_type = $1, icon_data = $2 WHERE id = $3',
          [icon.type, icon.data, feed.id]
        );
      }
    }).catch(() => { /* icon discovery is best-effort */ });

    return mapFeedToMiniflux(feed);
  }

  async updateFeed(id: number, updates: Partial<Feed>): Promise<Feed> {
    const mapped: any = {};
    if (updates.title !== undefined) mapped.title = updates.title;
    if ((updates as any).category_id !== undefined) mapped.categoryId = (updates as any).category_id;
    if (updates.crawler !== undefined) mapped.crawler = updates.crawler;
    if (updates.disabled !== undefined) mapped.disabled = updates.disabled;
    if ((updates as any).feed_type !== undefined) mapped.feedType = (updates as any).feed_type;
    if (updates.user_agent !== undefined) mapped.userAgent = updates.user_agent;
    if (updates.scraper_rules !== undefined) mapped.scraperRules = updates.scraper_rules;
    if (updates.rewrite_rules !== undefined) mapped.rewriteRules = updates.rewrite_rules;
    if (updates.blocklist_rules !== undefined) mapped.blocklistRules = updates.blocklist_rules;
    if (updates.keeplist_rules !== undefined) mapped.keeplistRules = updates.keeplist_rules;
    if ((updates as any).notify_on_update !== undefined) mapped.notifyOnUpdate = (updates as any).notify_on_update;
    if ((updates as any).pollingFrequency !== undefined) mapped.pollingFrequency = (updates as any).pollingFrequency;

    const feed = await storeUpdateFeed(id, this.userId, mapped);
    if (!feed) throw Object.assign(new Error('Feed not found'), { status: 404 });
    return mapFeedToMiniflux(feed);
  }

  async deleteFeed(id: number): Promise<void> {
    await storeDeleteFeed(id, this.userId);
  }

  async refreshFeed(id: number): Promise<void> {
    const feed = await storeGetFeed(id, this.userId);
    if (feed) await schedulerRefreshFeed(feed);
  }

  async refreshAllFeeds(): Promise<void> {
    const feeds = await storeGetFeeds(this.userId);
    for (const feed of feeds) {
      if (!feed.disabled) {
        try { await schedulerRefreshFeed(feed); } catch { /* skip */ }
      }
    }
  }

  async discoverFeeds(url: string): Promise<DiscoverResponse[]> {
    // Check if URL is a known platform — return RSSHub route directly
    if (!isLikelyFeedUrl(url)) {
      const transformed = await transformPlatformUrl(url);
      if (transformed.source !== 'original') {
        // Try to parse it to verify it works
        try {
          const result = await parseFeed(transformed.feedUrl);
          return [{
            url: transformed.feedUrl,
            title: result.feed.title || transformed.platform || '',
            type: 'rss',
          }];
        } catch {
          // RSSHub route failed, try native feed
          const nativeUrl = getNativeFeedUrl(url);
          if (nativeUrl) {
            return [{ url: nativeUrl, title: transformed.platform || '', type: 'rss' }];
          }
          // Fall through to standard discovery
        }
      }
    }

    const results = await discoverFeedUrls(url);
    return results.map((feedUrl: string) => ({
      url: feedUrl,
      title: '',
      type: 'rss',
    }));
  }

  async getFeedIcon(feedId: number): Promise<IconData | null> {
    const feed = await storeGetFeed(feedId, this.userId);
    if (!feed || !feed.iconData) return null;
    return {
      id: feed.id,
      data: feed.iconData,
      mime_type: feed.iconType || 'image/png',
    };
  }

  // ============ Entries ============

  async getEntries(filter?: EntriesFilter): Promise<EntriesResponse> {
    const sf = mapFilterToStore(filter);
    const result = await storeGetEntries(this.userId, sf);
    return {
      total: result.total,
      entries: result.entries.map(e => mapEntryToMiniflux(e)),
    };
  }

  async getEntry(id: number | string): Promise<Entry> {
    let entry;
    const numericId = typeof id === 'number' ? id : parseInt(id, 10);
    if (typeof id === 'string' && (isNaN(numericId) || String(numericId) !== id)) {
      // It's a UUID
      entry = await storeGetEntryByUuid(id, this.userId);
    } else {
      entry = await storeGetEntry(numericId, this.userId);
    }
    if (!entry) throw Object.assign(new Error('Entry not found'), { status: 404 });
    return mapEntryToMiniflux(entry);
  }

  async getFeedEntries(feedId: number, filter?: EntriesFilter): Promise<EntriesResponse> {
    const sf = { ...mapFilterToStore(filter), feedId };
    const result = await storeGetEntries(this.userId, sf);
    return {
      total: result.total,
      entries: result.entries.map(e => mapEntryToMiniflux(e)),
    };
  }

  async getCategoryEntries(categoryId: number, filter?: EntriesFilter): Promise<EntriesResponse> {
    const sf = { ...mapFilterToStore(filter), categoryId };
    const result = await storeGetEntries(this.userId, sf);
    return {
      total: result.total,
      entries: result.entries.map(e => mapEntryToMiniflux(e)),
    };
  }

  async updateEntryStatus(entryIds: number[], status: 'read' | 'unread'): Promise<void> {
    for (const id of entryIds) {
      await storeUpdateEntryStatus(id, this.userId, status);
    }
  }

  async toggleEntryBookmark(id: number): Promise<void> {
    await storeToggleStar(id, this.userId);
  }

  async saveEntry(_id: number): Promise<void> {
    // No-op (third-party save not applicable)
  }

  async fetchOriginalContent(entryId: number): Promise<{ content: string }> {
    const entry = await storeGetEntry(entryId, this.userId);
    return { content: entry?.content || '' };
  }

  async shareEntry(entryId: number): Promise<string> {
    const entry = await storeGetEntry(entryId, this.userId);
    return entry?.hash || '';
  }

  // ============ Categories ============

  async getCategories(): Promise<Category[]> {
    const cats = await storeGetCategories(this.userId);
    return cats.map(c => ({
      id: c.id,
      title: c.title,
      user_id: c.userId,
      parent_id: c.parentId || null,
      hide_globally: false,
      unreadCount: c.unreadCount || 0,
    }));
  }

  async createCategory(title: string, parentId?: number): Promise<Category> {
    const cat = await storeCreateCategory(this.userId, title, parentId);
    return { id: cat.id, title: cat.title, user_id: cat.userId, hide_globally: false, parent_id: cat.parentId || null };
  }

  async updateCategory(id: number, title: string): Promise<Category> {
    const cat = await storeUpdateCategory(id, this.userId, title);
    return { id: cat.id, title: cat.title, user_id: cat.userId, hide_globally: false };
  }

  async deleteCategory(id: number): Promise<void> {
    await storeDeleteCategory(id, this.userId);
  }

  // ============ Batch Operations ============

  async markFeedEntriesAsRead(feedId: number): Promise<void> {
    await storeMarkAllRead(this.userId, feedId);
  }

  async markCategoryEntriesAsRead(categoryId: number): Promise<void> {
    await storeMarkAllRead(this.userId, undefined, categoryId);
  }

  async markAllEntriesAsRead(): Promise<void> {
    await storeMarkAllRead(this.userId);
  }

  // ============ Counters ============

  async getCounters(): Promise<{ reads: Record<string, number>; unreads: Record<string, number> }> {
    const counters = await storeGetCounters(this.userId);
    const reads: Record<string, number> = {};
    const unreads: Record<string, number> = {};
    for (const [feedId, c] of Object.entries(counters)) {
      reads[feedId] = c.read;
      unreads[feedId] = c.unread;
    }
    return { reads, unreads };
  }

  // ============ User ============

  async getMe(): Promise<{ id: number; username: string; is_admin: boolean }> {
    const user = await getUserById(this.userId);
    return {
      id: user?.id || this.userId,
      username: user?.username || 'user',
      is_admin: user?.isAdmin || false,
    };
  }

  // ============ Health ============

  async healthcheck(): Promise<'OK'> {
    await query('SELECT 1');
    return 'OK';
  }

  // ============ OPML ============

  async exportOPML(feedIds?: number[], categoryIds?: number[]): Promise<string> {
    let feeds = await storeGetFeeds(this.userId);
    const cats = await storeGetCategories(this.userId);
    const catMap = new Map(cats.map(c => [c.id, c.title]));

    // Filter if specified
    if (feedIds?.length) {
      const idSet = new Set(feedIds);
      feeds = feeds.filter(f => idSet.has(f.id));
    } else if (categoryIds?.length) {
      const idSet = new Set(categoryIds);
      feeds = feeds.filter(f => f.categoryId && idSet.has(f.categoryId));
    }

    // Group feeds by category
    const grouped = new Map<string, FGFeed[]>();
    for (const feed of feeds) {
      const catTitle = feed.categoryId ? (catMap.get(feed.categoryId) || 'Uncategorized') : 'Uncategorized';
      if (!grouped.has(catTitle)) grouped.set(catTitle, []);
      grouped.get(catTitle)!.push(feed);
    }

    let opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>FeedGlow Subscriptions</title></head>
<body>
`;
    for (const [catTitle, catFeeds] of grouped) {
      opml += `  <outline text="${escapeXml(catTitle)}" title="${escapeXml(catTitle)}">\n`;
      for (const feed of catFeeds) {
        opml += `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.feedUrl)}" htmlUrl="${escapeXml(feed.siteUrl || '')}"/>\n`;
      }
      opml += `  </outline>\n`;
    }
    opml += `</body>\n</opml>`;
    return opml;
  }

  async importOPML(opmlContent: string): Promise<{ imported: number; failed: number }> {
    // Parse OPML XML to extract feeds
    const feedEntries = parseOPML(opmlContent);
    let imported = 0;
    let failed = 0;

    for (const entry of feedEntries) {
      try {
        // Get or create category
        let categoryId: number | undefined;
        if (entry.category) {
          const cats = await storeGetCategories(this.userId);
          let cat = cats.find(c => c.title === entry.category);
          if (!cat) {
            cat = await storeCreateCategory(this.userId, entry.category);
          }
          categoryId = cat.id;
        }

        // Check if already subscribed
        const feeds = await storeGetFeeds(this.userId);
        if (feeds.some(f => f.feedUrl === entry.xmlUrl)) {
          continue; // Skip duplicates
        }

        // Subscribe
        const result = await parseFeed(entry.xmlUrl);
        const feed = await storeCreateFeed(
          this.userId,
          entry.xmlUrl,
          entry.title || result.feed.title || entry.xmlUrl,
          entry.htmlUrl || result.feed.siteUrl || '',
          result.feed.description || '',
          categoryId,
        );
        await storeInsertEntries(feed.id, this.userId, result.feed.items);
        imported++;
      } catch (err) {
        console.warn(`[OPML Import] Failed to import ${entry.xmlUrl}:`, err instanceof Error ? err.message : err);
        failed++;
      }
    }

    return { imported, failed };
  }
}

// ============ Factory ============

/**
 * Get the data client for the authenticated user.
 */
export function getDataClient(c: any): FeedEngineDataClient {
  const user = c.get('user');
  const raw = user?.userId ?? c.get('userId');
  const userId = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!userId || isNaN(userId)) {
    throw new Error('Invalid userId in auth context');
  }
  return new FeedEngineDataClient(userId);
}

// ============ Mappers ============

function mapFeedToMiniflux(f: FGFeed): Feed {
  return {
    id: f.id,
    user_id: f.userId,
    feed_url: f.feedUrl,
    site_url: f.siteUrl || '',
    title: f.title,
    checked_at: f.checkedAt?.toISOString() || '',
    next_check_at: f.nextCheckAt?.toISOString() || '',
    etag_header: f.etag || '',
    last_modified_header: f.lastModified || '',
    parsing_error_message: f.parsingErrorMessage || '',
    parsing_error_count: f.parsingErrorCount,
    scraper_rules: f.scraperRules || '',
    rewrite_rules: f.rewriteRules || '',
    crawler: f.crawler,
    blocklist_rules: f.blocklistRules || '',
    keeplist_rules: f.keeplistRules || '',
    urlrewrite_rules: '',
    user_agent: f.userAgent || '',
    cookie: '',
    username: '',
    password: '',
    disabled: f.disabled,
    no_media_player: false,
    ignore_http_cache: false,
    allow_self_signed_certificates: false,
    fetch_via_proxy: false,
    hide_globally: false,
    feed_type: f.feedType || 'article',
    position: f.position || 0,
    polling_frequency: f.pollingFrequency || 60,
    category_id: f.categoryId || 0,
    unreadCount: f.unreadCount || 0,
    category: f.category ? {
      id: f.category.id,
      title: f.category.title,
      user_id: f.userId,
      hide_globally: false,
      unreadCount: f.category.unreadCount || 0,
    } : { id: 0, title: 'Uncategorized', user_id: f.userId, hide_globally: false },
    icon: f.iconData ? { feed_id: f.id, icon_id: f.id } : undefined,
    profileImageUrl: f.profileImageUrl || undefined,
    notify_on_update: f.notifyOnUpdate ?? false,
  };
}

function mapEntryToMiniflux(e: FGEntry): Entry {
  const enclosures: Enclosure[] = [];
  if (e.enclosureUrl) {
    enclosures.push({
      id: 0,
      user_id: e.userId,
      entry_id: e.id,
      url: e.enclosureUrl,
      mime_type: e.enclosureType || '',
      size: e.enclosureSize || 0,
      media_progression: 0,
    });
  }

  // Build feed icon URL from icon_data (base64 data URL)
  const feedIconData = (e.feed as any)?.iconData;
  const feedIconUrl = feedIconData ? feedIconData : undefined;

  return {
    id: e.uuid,  // Use UUID as public ID
    _numericId: e.id,  // Keep numeric ID for internal use
    user_id: e.userId,
    feed_id: e.feedId,
    status: e.status,
    hash: e.hash,
    title: e.title,
    url: e.url,
    comments_url: '',
    published_at: e.publishedAt.toISOString(),
    created_at: e.createdAt.toISOString(),
    changed_at: e.changedAt.toISOString(),
    content: e.content,
    author: e.author,
    share_code: '',
    starred: e.starred,
    reading_time: e.readingTime,
    enclosures,
    // Flat fields for frontend compatibility
    feedId: e.feedId,
    feedTitle: e.feed?.title || '',
    feedIconUrl,
    feedProfileImageUrl: (e.feed as any)?.profileImageUrl || undefined,
    feedType: (e.feed as any)?.feedType || 'article',
    publishedAt: e.publishedAt.toISOString(),
    readingTime: e.readingTime,
    feed: e.feed ? {
      id: e.feed.id,
      user_id: e.userId,
      feed_url: '',
      site_url: e.feed.siteUrl || '',
      title: e.feed.title,
      icon_type: (e.feed as any).iconType || null,
      icon_data: (e.feed as any).iconData || null,
      checked_at: '',
      next_check_at: '',
      etag_header: '',
      last_modified_header: '',
      parsing_error_message: '',
      parsing_error_count: 0,
      scraper_rules: '',
      rewrite_rules: '',
      crawler: false,
      blocklist_rules: '',
      keeplist_rules: '',
      urlrewrite_rules: '',
      user_agent: '',
      cookie: '',
      username: '',
      password: '',
      disabled: false,
      no_media_player: false,
      ignore_http_cache: false,
      allow_self_signed_certificates: false,
      fetch_via_proxy: false,
      hide_globally: false,
      category: { id: 0, title: '', user_id: e.userId, hide_globally: false },
    } : undefined as any,
    tags: [],
    hasFullContent: e.contentHash === 'full',
  };
}

function mapFilterToStore(filter?: EntriesFilter): EntryFilter {
  if (!filter) return {};
  return {
    status: filter.status as any,
    starred: filter.starred,
    categoryId: filter.category_id,
    feedType: filter.feedType as any,
    before: filter.before,
    after: filter.after,
    search: filter.search,
    limit: filter.limit,
    offset: filter.offset,
    order: (filter.order === 'id' ? 'created_at' : filter.order) as any,
    direction: filter.direction,
  };
}

// ============ OPML Helpers ============

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface OPMLEntry {
  xmlUrl: string;
  htmlUrl: string;
  title: string;
  category: string;
}

function parseOPML(xml: string): OPMLEntry[] {
  const entries: OPMLEntry[] = [];
  // Simple regex-based OPML parser

  // Find category outlines (containing nested outlines)
  const categoryRegex = /<outline[^>]*?text="([^"]*)"[^>]*>([\s\S]*?)<\/outline>/gi;
  let catMatch;

  while ((catMatch = categoryRegex.exec(xml)) !== null) {
    const catTitle = unescapeXml(catMatch[1]);
    const inner = catMatch[2];

    // Find feed outlines inside
    const feedRegex = /<outline[^>]*?xmlUrl="([^"]*)"[^>]*?\/?>/gi;
    let feedMatch;
    while ((feedMatch = feedRegex.exec(inner)) !== null) {
      const feedTag = feedMatch[0];
      const xmlUrl = unescapeXml(feedMatch[1]);
      const titleMatch = feedTag.match(/(?:text|title)="([^"]*)"/);
      const htmlMatch = feedTag.match(/htmlUrl="([^"]*)"/);

      entries.push({
        xmlUrl,
        htmlUrl: htmlMatch ? unescapeXml(htmlMatch[1]) : '',
        title: titleMatch ? unescapeXml(titleMatch[1]) : '',
        category: catTitle,
      });
    }
  }

  // Also find top-level feed outlines (not inside a category)
  if (entries.length === 0) {
    const feedRegex = /<outline[^>]*?xmlUrl="([^"]*)"[^>]*?\/?>/gi;
    let feedMatch;
    while ((feedMatch = feedRegex.exec(xml)) !== null) {
      const feedTag = feedMatch[0];
      const xmlUrl = unescapeXml(feedMatch[1]);
      const titleMatch = feedTag.match(/(?:text|title)="([^"]*)"/);
      const htmlMatch = feedTag.match(/htmlUrl="([^"]*)"/);

      entries.push({
        xmlUrl,
        htmlUrl: htmlMatch ? unescapeXml(htmlMatch[1]) : '',
        title: titleMatch ? unescapeXml(titleMatch[1]) : '',
        category: '',
      });
    }
  }

  return entries;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
