/**
 * Feed Engine Routes - Direct PostgreSQL, no Miniflux
 * Drop-in replacement for existing /api/feeds, /api/entries, /api/categories routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { feedEngineAuthMiddleware, type AuthPayload } from './auth.js';
import {
  getFeeds, getFeed, createFeed, updateFeed, deleteFeed,
  getEntries, getEntry, updateEntryStatus, toggleStar, markAllRead, getCounters,
  getCategories, createCategory, updateCategory, deleteCategory,
  insertEntries, getUnreadCountsByType, detectFeedType,
  type FeedType,
} from './store.js';
import { parseFeed, discoverFeeds, discoverFeedIcon } from './parser.js';
import { refreshFeed } from './scheduler.js';

// ============ Feeds ============

export const feedRoutes = new Hono();
feedRoutes.use('*', feedEngineAuthMiddleware());

function getUser(c: any): AuthPayload {
  return c.get('user') as AuthPayload;
}

// Feed counters (must be before /:id)
feedRoutes.get('/counters', async (c) => {
  const user = getUser(c);
  const counters = await getCounters(user.userId);
  return c.json(counters);
});

// Unread counts by feed type (for top tab bar)
feedRoutes.get('/type-counts', async (c) => {
  const user = getUser(c);
  const counts = await getUnreadCountsByType(user.userId);
  return c.json(counts);
});

// Feed health
feedRoutes.get('/health', async (c) => {
  const user = getUser(c);
  const feeds = await getFeeds(user.userId);
  const unhealthy = feeds.filter(f => f.parsingErrorCount > 0);
  return c.json({
    total: feeds.length,
    healthy: feeds.length - unhealthy.length,
    unhealthy: unhealthy.map(f => ({
      id: f.id,
      title: f.title,
      errorCount: f.parsingErrorCount,
      errorMessage: f.parsingErrorMessage,
      checkedAt: f.checkedAt,
    })),
  });
});

// Feed analytics (must be before /:id)
feedRoutes.get('/analytics', async (c) => {
  const user = getUser(c);
  const feeds = await getFeeds(user.userId);
  const counters = await getCounters(user.userId);

  const feedStats = feeds.map(f => {
    const c = counters[f.id] || { read: 0, unread: 0 };
    const total = c.read + c.unread;
    return {
      feedId: f.id,
      title: f.title,
      siteUrl: f.siteUrl,
      totalEntries: total,
      unreadEntries: c.unread,
      readRate: total > 0 ? Math.round((c.read / total) * 100) : 0,
      starredCount: 0,
      avgReadingTime: 0,
      lastPublishedAt: f.checkedAt?.toISOString() || '',
      updatesPerWeek: 0,
      parsing_error_count: f.parsingErrorCount,
    };
  });

  const sorted = [...feedStats].sort((a, b) => b.totalEntries - a.totalEntries);
  return c.json({
    totalFeeds: feeds.length,
    totalEntries: feedStats.reduce((s, f) => s + f.totalEntries, 0),
    mostActive: sorted,
    leastActive: [...sorted].reverse(),
    mostRead: [...feedStats].sort((a, b) => b.readRate - a.readRate),
    neverRead: feedStats.filter(f => f.readRate === 0),
    unhealthy: feedStats.filter(f => f.parsing_error_count > 0),
  });
});

// Refresh all feeds
feedRoutes.post('/refresh', async (c) => {
  const user = getUser(c);
  const feeds = await getFeeds(user.userId);
  let refreshed = 0;
  for (const feed of feeds) {
    if (!feed.disabled) {
      await refreshFeed(feed);
      refreshed++;
    }
  }
  return c.json({ success: true, refreshed });
});

// List feeds
feedRoutes.get('/', async (c) => {
  const user = getUser(c);
  const typeFilter = c.req.query('type') as FeedType | undefined;
  let feeds = await getFeeds(user.userId);

  // Filter by feed type if specified
  if (typeFilter && ['article', 'social', 'notification', 'picture', 'video'].includes(typeFilter)) {
    feeds = feeds.filter(f => f.feedType === typeFilter);
  }

  // Format to match existing API shape
  return c.json(feeds.map(f => ({
    id: f.id,
    user_id: f.userId,
    feed_url: f.feedUrl,
    site_url: f.siteUrl,
    title: f.title,
    description: f.description,
    feed_type: f.feedType,
    checked_at: f.checkedAt?.toISOString() || null,
    parsing_error_count: f.parsingErrorCount,
    parsing_error_message: f.parsingErrorMessage || '',
    disabled: f.disabled,
    crawler: f.crawler,
    category: f.category ? { id: f.category.id, title: f.category.title, user_id: f.userId } : null,
    icon: f.iconData ? { feed_id: f.id, icon_id: f.id, external_icon_id: '' } : null,
    profileImageUrl: f.profileImageUrl || null,
  })));
});

// Get single feed
feedRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const feed = await getFeed(id, user.userId);
  if (!feed) return c.json({ error: 'Feed not found' }, 404);

  return c.json({
    id: feed.id,
    user_id: feed.userId,
    feed_url: feed.feedUrl,
    site_url: feed.siteUrl,
    title: feed.title,
    description: feed.description,
    feed_type: feed.feedType,
    checked_at: feed.checkedAt?.toISOString() || null,
    parsing_error_count: feed.parsingErrorCount,
    parsing_error_message: feed.parsingErrorMessage || '',
    disabled: feed.disabled,
    crawler: feed.crawler,
    category: feed.category ? { id: feed.category.id, title: feed.category.title, user_id: feed.userId } : null,
    icon: feed.iconData ? { feed_id: feed.id, icon_id: feed.id } : null,
  });
});

// Create feed (subscribe)
const createFeedSchema = z.object({
  url: z.string().url(),
  categoryId: z.number().optional(),
  feedType: z.enum(['article', 'social', 'notification', 'picture', 'video']).optional(),
});

feedRoutes.post('/', zValidator('json', createFeedSchema), async (c) => {
  const { url, categoryId } = c.req.valid('json');
  const user = getUser(c);

  try {
    // Fetch and parse the feed first
    const result = await parseFeed(url);
    const feed = await createFeed(
      user.userId, url, result.feed.title || url, result.feed.siteUrl, result.feed.description, categoryId
    );

    // Insert initial entries
    const inserted = await insertEntries(feed.id, user.userId, result.feed.items);

    // Auto-discover feed icon in background
    const siteUrl = result.feed.siteUrl || url;
    discoverFeedIcon(siteUrl).then(async (icon) => {
      if (icon) {
        const { query: dbQuery } = await import('../lib/db.js');
        await dbQuery(
          'UPDATE fg_feeds SET icon_type = $1, icon_data = $2 WHERE id = $3',
          [icon.type, icon.data, feed.id]
        );
      }
    }).catch(() => { /* best-effort */ });

    return c.json({
      id: feed.id,
      title: feed.title,
      feed_url: feed.feedUrl,
      site_url: feed.siteUrl,
      entries_imported: inserted,
    }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key') || msg.includes('UNIQUE')) {
      return c.json({ error: 'You are already subscribed to this feed' }, 409);
    }
    return c.json({ error: `Failed to subscribe: ${msg}` }, 400);
  }
});

// Update feed
const updateFeedSchema = z.object({
  title: z.string().optional(),
  categoryId: z.number().optional(),
  crawler: z.boolean().optional(),
  disabled: z.boolean().optional(),
});

feedRoutes.put('/:id', zValidator('json', updateFeedSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const updates = c.req.valid('json');

  const feed = await updateFeed(id, user.userId, updates);
  if (!feed) return c.json({ error: 'Feed not found' }, 404);
  return c.json(feed);
});

// Delete feed
feedRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  await deleteFeed(id, user.userId);
  return c.json({ success: true });
});

// Refresh single feed
feedRoutes.post('/:id/refresh', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const feed = await getFeed(id, user.userId);
  if (!feed) return c.json({ error: 'Feed not found' }, 404);

  const result = await refreshFeed(feed);
  return c.json({ success: true, newEntries: result.inserted, error: result.error });
});

// Feed icon
feedRoutes.get('/:id/icon', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const feed = await getFeed(id, user.userId);
  if (!feed || !feed.iconData) return c.json({ error: 'No icon found' }, 404);

  return c.json({
    feedId: feed.id,
    iconId: feed.id,
    mimeType: feed.iconType || 'image/png',
    dataUrl: feed.iconData,
  });
});

// Mark feed entries as read
feedRoutes.post('/:id/mark-read', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const count = await markAllRead(user.userId, id);
  return c.json({ success: true, marked: count });
});

// ============ Entries ============

export const entryRoutes = new Hono();
entryRoutes.use('*', feedEngineAuthMiddleware());

// Search
entryRoutes.get('/search', async (c) => {
  const user = getUser(c);
  const q = c.req.query('q') || '';
  const limit = parseInt(c.req.query('limit') || '25');
  const offset = parseInt(c.req.query('offset') || '0');

  const result = await getEntries(user.userId, { search: q, limit, offset });
  return c.json(result);
});

// Mark all read
entryRoutes.post('/mark-all-read', async (c) => {
  const user = getUser(c);
  const count = await markAllRead(user.userId);
  return c.json({ success: true, marked: count });
});

// Batch mark read
entryRoutes.post('/mark-read', async (c) => {
  const body = await c.req.json();
  const user = getUser(c);
  const ids: number[] = body.ids || [];
  let count = 0;
  for (const id of ids) {
    await updateEntryStatus(id, user.userId, 'read');
    count++;
  }
  return c.json({ success: true, marked: count });
});

// List entries
entryRoutes.get('/', async (c) => {
  const user = getUser(c);
  const filter = {
    status: c.req.query('status') as any,
    feedId: c.req.query('feedId') ? parseInt(c.req.query('feedId')!) : undefined,
    categoryId: c.req.query('categoryId') ? parseInt(c.req.query('categoryId')!) : undefined,
    starred: c.req.query('starred') === 'true' ? true : undefined,
    feedType: c.req.query('feedType') as FeedType | undefined,
    limit: parseInt(c.req.query('limit') || '25'),
    offset: parseInt(c.req.query('offset') || '0'),
    order: (c.req.query('order') || 'published_at') as any,
    direction: (c.req.query('direction') || 'desc') as any,
    before: c.req.query('before') ? parseInt(c.req.query('before')!) : undefined,
    after: c.req.query('after') ? parseInt(c.req.query('after')!) : undefined,
  };

  const result = await getEntries(user.userId, filter);

  // Format to match existing API shape
  return c.json({
    total: result.total,
    entries: result.entries.map(e => ({
      id: e.id,
      user_id: e.userId,
      feed_id: e.feedId,
      title: e.title,
      url: e.url,
      content: e.content,
      author: e.author,
      status: e.status,
      starred: e.starred,
      published_at: e.publishedAt.toISOString(),
      created_at: e.createdAt.toISOString(),
      changed_at: e.changedAt.toISOString(),
      reading_time: e.readingTime,
      feed: e.feed ? {
        id: e.feed.id,
        title: e.feed.title,
        site_url: e.feed.siteUrl,
      } : undefined,
      enclosures: e.enclosureUrl ? [{
        url: e.enclosureUrl,
        mime_type: e.enclosureType || '',
        size: e.enclosureSize || 0,
      }] : [],
    })),
  });
});

// Get single entry
entryRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const entry = await getEntry(id, user.userId);
  if (!entry) return c.json({ error: 'Entry not found' }, 404);

  return c.json({
    id: entry.id,
    user_id: entry.userId,
    feed_id: entry.feedId,
    title: entry.title,
    url: entry.url,
    content: entry.content,
    author: entry.author,
    status: entry.status,
    starred: entry.starred,
    published_at: entry.publishedAt.toISOString(),
    created_at: entry.createdAt.toISOString(),
    reading_time: entry.readingTime,
    feed: entry.feed,
    enclosures: entry.enclosureUrl ? [{
      url: entry.enclosureUrl,
      mime_type: entry.enclosureType || '',
      size: entry.enclosureSize || 0,
    }] : [],
  });
});

// Update entry status
entryRoutes.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const body = await c.req.json();

  if (body.status) {
    await updateEntryStatus(id, user.userId, body.status);
  }
  if (body.starred !== undefined) {
    await toggleStar(id, user.userId);
  }

  const entry = await getEntry(id, user.userId);
  return c.json(entry);
});

// Toggle star
entryRoutes.put('/:id/bookmark', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const starred = await toggleStar(id, user.userId);
  return c.json({ success: true, starred });
});

// ============ Categories ============

export const categoryRoutes = new Hono();
categoryRoutes.use('*', feedEngineAuthMiddleware());

categoryRoutes.get('/', async (c) => {
  const user = getUser(c);
  const categories = await getCategories(user.userId);
  return c.json(categories.map(cat => ({
    id: cat.id,
    title: cat.title,
    user_id: cat.userId,
    parent_id: cat.parentId,
    unread_count: cat.unreadCount || 0,
  })));
});

categoryRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const user = getUser(c);
  const category = await createCategory(user.userId, body.title, body.parentId);
  return c.json({ id: category.id, title: category.title, user_id: category.userId, parent_id: category.parentId }, 201);
});

categoryRoutes.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const body = await c.req.json();
  const category = await updateCategory(id, user.userId, body.title);
  return c.json({ id: category.id, title: category.title, user_id: category.userId });
});

categoryRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  await deleteCategory(id, user.userId);
  return c.json({ success: true });
});

categoryRoutes.post('/:id/mark-read', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = getUser(c);
  const count = await markAllRead(user.userId, undefined, id);
  return c.json({ success: true, marked: count });
});
