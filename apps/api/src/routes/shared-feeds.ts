/**
 * Shared Feeds API Routes
 * 
 * Curated article collections with public JSON Feed URLs.
 * 
 * Public routes (no auth):
 *   GET /feed/:code.json  — JSON Feed 1.1
 *   GET /feed/:code       — HTML preview page
 * 
 * Authenticated routes:
 *   POST /                — create shared feed
 *   GET /                 — list user's shared feeds
 *   DELETE /:id           — deactivate shared feed
 *   POST /:id/items       — add article to shared feed
 *   DELETE /:id/items/:entryId — remove article from shared feed
 *   GET /:id/items        — list items in shared feed
 *   GET /entry/:entryId   — check which feeds contain this entry
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { query } from '../lib/db.js';
import {
  createSharedFeed,
  getUserSharedFeeds,
  getSharedFeedByCode,
  deactivateSharedFeed,
  getSharedFeedEntries,
  ensureSharedFeedsTable,
  addItemToSharedFeed,
  removeItemFromSharedFeed,
  getSharedFeedItems,
  getEntrySharedFeeds,
} from '../services/shared-feeds.js';

const sharedFeeds = new Hono();

// Ensure table exists on first load
let tableReady = false;
async function ensureTable() {
  if (!tableReady) {
    await ensureSharedFeedsTable();
    tableReady = true;
  }
}

/** Resolve UUID entry ID to numeric */
async function resolveEntryId(entryIdOrUuid: string, userId: number): Promise<number | null> {
  const asNum = parseInt(entryIdOrUuid);
  if (!isNaN(asNum) && String(asNum) === entryIdOrUuid) return asNum;
  // UUID
  const r = await query<{ id: number }>(
    `SELECT id FROM fg_entries WHERE uuid = $1 AND user_id = $2`,
    [entryIdOrUuid, userId]
  );
  return r.rows[0]?.id ?? null;
}

// ============ Public Routes (no auth) ============

// JSON Feed 1.1 output
sharedFeeds.get('/feed/:code{.+\\.json$}', async (c) => {
  await ensureTable();
  const rawCode = c.req.param('code');
  const code = rawCode.replace(/\.json$/, '');

  const sharedFeed = await getSharedFeedByCode(code);
  if (!sharedFeed) {
    return c.json({ error: 'Shared feed not found' }, 404);
  }

  const entries = await getSharedFeedEntries(sharedFeed);

  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  const feedUrl = `${baseUrl}/api/shared-feeds/feed/${sharedFeed.share_code}.json`;

  const jsonFeed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: sharedFeed.title,
    description: sharedFeed.description || '',
    home_page_url: baseUrl,
    feed_url: feedUrl,
    items: entries.map((entry) => ({
      id: String(entry.id),
      url: entry.url,
      title: entry.title,
      content_html: entry.content || '',
      summary: entry.note || undefined,
      date_published: entry.published_at
        ? new Date(entry.published_at).toISOString()
        : undefined,
      authors: entry.author
        ? [{ name: entry.author }]
        : entry.feed_title
          ? [{ name: entry.feed_title }]
          : [],
    })),
  };

  return c.json(jsonFeed, 200, {
    'Content-Type': 'application/feed+json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
});

// HTML preview page
sharedFeeds.get('/feed/:code', async (c) => {
  await ensureTable();
  const code = c.req.param('code');
  const sharedFeed = await getSharedFeedByCode(code);

  if (!sharedFeed) {
    return c.html('<html><body><h1>404 - 未找到</h1><p>此共享 Feed 不存在或已停用。</p></body></html>', 404);
  }

  const entries = await getSharedFeedEntries(sharedFeed, 20);
  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  const feedUrl = `${baseUrl}/api/shared-feeds/feed/${sharedFeed.share_code}.json`;

  const entriesHtml = entries.map((entry) => `
    <article style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #eee;">
      <h3 style="margin:0 0 8px;"><a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener" style="color:#ea580c;text-decoration:none;">${escapeHtml(entry.title)}</a></h3>
      <div style="font-size:13px;color:#888;margin-bottom:8px;">
        ${entry.author ? escapeHtml(entry.author) + ' · ' : ''}${entry.feed_title ? escapeHtml(entry.feed_title) + ' · ' : ''}${entry.published_at ? new Date(entry.published_at).toLocaleDateString('zh-CN') : ''}
      </div>
      ${entry.note ? `<div style="font-size:13px;color:#ea580c;margin-bottom:8px;font-style:italic;">📝 ${escapeHtml(entry.note)}</div>` : ''}
      <div style="font-size:14px;color:#555;line-height:1.6;">
        ${truncateHtml(entry.content || '', 300)}
      </div>
    </article>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(sharedFeed.title)} - FeedGlow</title>
  <link rel="alternate" type="application/feed+json" title="${escapeHtml(sharedFeed.title)}" href="${feedUrl}">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; color: #333; background: #fafafa; }
    .header { margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid #ea580c; }
    .header h1 { margin: 0 0 8px; font-size: 24px; color: #111; }
    .header p { margin: 0; color: #666; font-size: 14px; }
    .subscribe-btn { display: inline-block; margin-top: 12px; padding: 8px 20px; background: #ea580c; color: #fff; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500; }
    .subscribe-btn:hover { background: #c2410c; }
    .feed-url { margin-top: 8px; font-size: 12px; color: #999; word-break: break-all; }
    .count { display: inline-block; padding: 2px 8px; background: #fff7ed; color: #ea580c; border-radius: 4px; font-size: 12px; margin-left: 8px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(sharedFeed.title)} <span class="count">${entries.length} 篇精选</span></h1>
    ${sharedFeed.description ? `<p>${escapeHtml(sharedFeed.description)}</p>` : ''}
    <a class="subscribe-btn" href="${feedUrl}" target="_blank">📡 订阅 JSON Feed</a>
    <div class="feed-url">${feedUrl}</div>
  </div>
  
  <main>
    ${entriesHtml || '<p style="color:#999;">此 Feed 暂无精选文章。</p>'}
  </main>

  <div class="footer">
    Powered by <a href="${baseUrl}" style="color:#ea580c;">FeedGlow</a>
  </div>
</body>
</html>`;

  return c.html(html);
});

// ============ Authenticated Routes ============

// List user's shared feeds
sharedFeeds.get('/', authMiddleware, async (c) => {
  await ensureTable();
  const user = c.get('user') as JWTPayload;
  const feeds = await getUserSharedFeeds(user.userId);
  return c.json({ sharedFeeds: feeds });
});

// Create shared feed (no more scope — just title + description)
sharedFeeds.post('/', authMiddleware, async (c) => {
  await ensureTable();
  const user = c.get('user') as JWTPayload;
  const body = await c.req.json();

  const { title, description } = body;

  if (!title) {
    return c.json({ error: 'title is required' }, 400);
  }

  const sharedFeed = await createSharedFeed(
    user.userId,
    title,
    description
  );

  return c.json(sharedFeed, 201);
});

// Deactivate shared feed
sharedFeeds.delete('/:id', authMiddleware, async (c) => {
  await ensureTable();
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const deleted = await deactivateSharedFeed(user.userId, id);
  if (!deleted) {
    return c.json({ error: 'Shared feed not found' }, 404);
  }

  return c.json({ success: true });
});

// ============ Item Management ============

// Add article to shared feed
sharedFeeds.post('/:id/items', authMiddleware, async (c) => {
  await ensureTable();
  const user = c.get('user') as JWTPayload;
  const sharedFeedId = parseInt(c.req.param('id'));
  const body = await c.req.json();

  if (isNaN(sharedFeedId)) {
    return c.json({ error: 'Invalid shared feed id' }, 400);
  }

  const entryId = await resolveEntryId(String(body.entryId), user.userId);
  if (!entryId) {
    return c.json({ error: 'Entry not found' }, 404);
  }

  const item = await addItemToSharedFeed(user.userId, sharedFeedId, entryId, body.note);
  if (!item) {
    return c.json({ error: 'Shared feed not found' }, 404);
  }

  return c.json(item, 201);
});

// Remove article from shared feed
sharedFeeds.delete('/:id/items/:entryId', authMiddleware, async (c) => {
  await ensureTable();
  const user = c.get('user') as JWTPayload;
  const sharedFeedId = parseInt(c.req.param('id'));
  const entryIdParam = c.req.param('entryId');

  if (isNaN(sharedFeedId)) {
    return c.json({ error: 'Invalid shared feed id' }, 400);
  }

  const entryId = await resolveEntryId(entryIdParam, user.userId);
  if (!entryId) {
    return c.json({ error: 'Entry not found' }, 404);
  }

  const removed = await removeItemFromSharedFeed(user.userId, sharedFeedId, entryId);
  if (!removed) {
    return c.json({ error: 'Item not found' }, 404);
  }

  return c.json({ success: true });
});

// List items in a shared feed
sharedFeeds.get('/:id/items', authMiddleware, async (c) => {
  await ensureTable();
  const user = c.get('user') as JWTPayload;
  const sharedFeedId = parseInt(c.req.param('id'));

  if (isNaN(sharedFeedId)) {
    return c.json({ error: 'Invalid shared feed id' }, 400);
  }

  const items = await getSharedFeedItems(user.userId, sharedFeedId);
  return c.json({ items });
});

// Check which shared feeds contain an entry
sharedFeeds.get('/entry/:entryId', authMiddleware, async (c) => {
  await ensureTable();
  const user = c.get('user') as JWTPayload;
  const entryIdParam = c.req.param('entryId');

  const entryId = await resolveEntryId(entryIdParam, user.userId);
  if (!entryId) {
    return c.json({ error: 'Entry not found' }, 404);
  }

  const feeds = await getEntrySharedFeeds(user.userId, entryId);
  return c.json({ feeds });
});

// ============ Helpers ============

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateHtml(html: string, maxLen: number): string {
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  if (text.length <= maxLen) return escapeHtml(text);
  return escapeHtml(text.slice(0, maxLen)) + '…';
}

export default sharedFeeds;
