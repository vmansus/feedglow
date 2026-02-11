/**
 * Fever API Compatibility Layer
 * 
 * Implements the Fever API for third-party RSS client support.
 * Endpoint: POST /fever/?api
 * 
 * Compatible clients: Reeder, Unread, FeedMe, NetNewsWire, Fluent Reader, etc.
 */

import { Hono } from 'hono';
import { createHash } from 'crypto';
import type { Entry } from '../lib/types.js';
import { FeedEngineDataClient } from '../feed-engine/data-source.js';
import { query } from '../lib/db.js';

const fever = new Hono();

// ============ Fever Auth ============

interface FeverUser {
  userId: number;
  username: string;
}

/**
 * Authenticate Fever API request.
 * api_key = md5(username:password)
 */
async function authenticateFever(apiKey: string): Promise<FeverUser | null> {
  const result = await query(
    `SELECT user_id, username FROM fg_fever_auth WHERE api_key_hash = $1`,
    [apiKey]
  );
  if (!result.rows[0]) return null;
  return {
    userId: result.rows[0].user_id,
    username: result.rows[0].username,
  };
}

function getClientForFever(user: FeverUser): FeedEngineDataClient {
  return new FeedEngineDataClient(user.userId);
}

function baseResponse(auth: boolean) {
  return {
    api_version: 3,
    auth: auth ? 1 : 0,
    last_refreshed_on_time: Math.floor(Date.now() / 1000),
  };
}

// ============ Main Fever Endpoint ============

fever.post('/', async (c) => {
  const url = new URL(c.req.url, 'http://localhost');
  const body = await c.req.parseBody();
  const apiKey = (body.api_key as string) || '';

  if (!url.searchParams.has('api')) {
    return c.json({ error: 'Missing api parameter' }, 400);
  }

  const user = await authenticateFever(apiKey);
  if (!user) {
    return c.json(baseResponse(false));
  }

  const client = getClientForFever(user);
  let response: Record<string, unknown> = { ...baseResponse(true) };

  try {
    // ?groups
    if (url.searchParams.has('groups')) {
      const categories = await client.getCategories();
      const feeds = await client.getFeeds();

      response.groups = categories.map((cat: any) => ({
        id: cat.id,
        title: cat.title,
      }));

      const feedsByCategory = new Map<number, number[]>();
      for (const feed of feeds) {
        const catId = feed.category?.id || 0;
        if (!feedsByCategory.has(catId)) feedsByCategory.set(catId, []);
        feedsByCategory.get(catId)!.push(feed.id);
      }

      response.feeds_groups = Array.from(feedsByCategory.entries()).map(([groupId, feedIds]) => ({
        group_id: groupId,
        feed_ids: feedIds.join(','),
      }));
    }

    // ?feeds
    if (url.searchParams.has('feeds')) {
      const feeds = await client.getFeeds();

      response.feeds = feeds.map((feed: any) => ({
        id: feed.id,
        favicon_id: feed.icon?.icon_id || 0,
        title: feed.title,
        url: feed.feed_url,
        site_url: feed.site_url,
        is_spark: 0,
        last_updated_on_time: Math.floor(new Date(feed.checked_at || Date.now()).getTime() / 1000),
      }));

      const feedsByCategory = new Map<number, number[]>();
      for (const feed of feeds) {
        const catId = feed.category?.id || 0;
        if (!feedsByCategory.has(catId)) feedsByCategory.set(catId, []);
        feedsByCategory.get(catId)!.push(feed.id);
      }

      response.feeds_groups = Array.from(feedsByCategory.entries()).map(([groupId, feedIds]) => ({
        group_id: groupId,
        feed_ids: feedIds.join(','),
      }));
    }

    // ?favicons
    if (url.searchParams.has('favicons')) {
      const feeds = await client.getFeeds();
      const favicons: Array<{ id: number; data: string }> = [];

      for (const feed of feeds) {
        if (feed.icon?.icon_id) {
          try {
            const icon = await client.getFeedIcon(feed.id);
            if (icon) {
              const data = icon.data.includes('base64,') ? icon.data : `${icon.mime_type};base64,${icon.data}`;
              favicons.push({ id: icon.id, data });
            }
          } catch { /* skip */ }
        }
      }

      response.favicons = favicons;
    }

    // ?items
    if (url.searchParams.has('items')) {
      const sinceId = url.searchParams.get('since_id');
      const maxId = url.searchParams.get('max_id');
      const withIds = url.searchParams.get('with_ids');

      let entries: Entry[] = [];

      if (withIds) {
        const ids = withIds.split(',').map(Number).filter(n => !isNaN(n)).slice(0, 50);
        entries = (await Promise.all(
          ids.map(async (id: number) => {
            try { return await client.getEntry(id); } catch { return null; }
          })
        )).filter(Boolean) as Entry[];
      } else if (sinceId) {
        const result = await client.getEntries({
          after_entry_id: parseInt(sinceId),
          limit: 50,
          order: 'id',
          direction: 'asc',
        });
        entries = result.entries;
      } else if (maxId && maxId !== '0') {
        const result = await client.getEntries({
          before_entry_id: parseInt(maxId),
          limit: 50,
          order: 'id',
          direction: 'desc',
        });
        entries = result.entries;
      } else {
        const result = await client.getEntries({
          limit: 50,
          order: 'id',
          direction: 'desc',
        });
        entries = result.entries;
      }

      response.items = entries.map(entryToFeverItem);

      const allEntries = await client.getEntries({ limit: 1 });
      response.total_items = allEntries.total;
    }

    // ?unread_item_ids
    if (url.searchParams.has('unread_item_ids')) {
      const result = await client.getEntries({
        status: 'unread',
        limit: 10000,
        order: 'id',
        direction: 'asc',
      });
      response.unread_item_ids = result.entries.map((e: any) => e.id).join(',');
    }

    // ?saved_item_ids
    if (url.searchParams.has('saved_item_ids')) {
      const result = await client.getEntries({
        starred: true,
        limit: 10000,
        order: 'id',
        direction: 'asc',
      });
      response.saved_item_ids = result.entries.map((e: any) => e.id).join(',');
    }

    // ============ Write Operations ============

    const mark = body.mark as string;
    const as_ = body.as as string;
    const id = parseInt(body.id as string || '0');

    if (mark && as_ && id) {
      if (mark === 'item') {
        if (as_ === 'read') {
          await client.updateEntryStatus([id], 'read');
        } else if (as_ === 'unread') {
          await client.updateEntryStatus([id], 'unread');
        } else if (as_ === 'saved') {
          const entry = await client.getEntry(id);
          if (!entry.starred) await client.toggleEntryBookmark(id);
        } else if (as_ === 'unsaved') {
          const entry = await client.getEntry(id);
          if (entry.starred) await client.toggleEntryBookmark(id);
        }
      } else if (mark === 'feed' && as_ === 'read') {
        await client.markFeedEntriesAsRead(id);
      } else if (mark === 'group' && as_ === 'read') {
        await client.markCategoryEntriesAsRead(id);
      }
    }

    // unread_recently_read
    if (body.unread_recently_read === '1') {
      const result = await client.getEntries({
        status: 'read',
        limit: 50,
        order: 'changed_at' as any,
        direction: 'desc',
      });
      if (result.entries.length > 0) {
        await client.updateEntryStatus(result.entries.map((e: any) => e.id), 'unread');
      }
    }

  } catch (err) {
    console.error('[Fever API] Error:', err instanceof Error ? err.message : err);
  }

  return c.json(response);
});

fever.get('/', async (c) => {
  return c.json(baseResponse(false));
});

// ============ Fever Auth Management ============

import { authMiddleware, type JWTPayload } from '../lib/auth.js';

const feverSetup = new Hono();
feverSetup.use('*', authMiddleware);

feverSetup.post('/setup', async (c) => {
  const user = c.get('user') as JWTPayload;
  const { username, password } = await c.req.json();

  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  const apiKeyHash = createHash('md5').update(`${username}:${password}`).digest('hex');

  await query(
    `INSERT INTO fg_fever_auth (user_id, username, api_key_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       username = $2, api_key_hash = $3`,
    [user.userId, username, apiKeyHash]
  );

  return c.json({
    success: true,
    endpoint: '/fever/?api',
    username,
    apiKey: apiKeyHash,
    message: 'Use this endpoint and credentials in your Fever-compatible RSS client',
  });
});

feverSetup.get('/status', async (c) => {
  const user = c.get('user') as JWTPayload;
  const result = await query(
    `SELECT username, created_at FROM fg_fever_auth WHERE user_id = $1`,
    [user.userId]
  );

  if (!result.rows[0]) {
    return c.json({ configured: false });
  }

  return c.json({
    configured: true,
    username: result.rows[0].username,
    endpoint: '/fever/?api',
    configuredAt: result.rows[0].created_at,
  });
});

feverSetup.delete('/revoke', async (c) => {
  const user = c.get('user') as JWTPayload;
  await query(`DELETE FROM fg_fever_auth WHERE user_id = $1`, [user.userId]);
  return c.json({ success: true });
});

// ============ Helper ============

function entryToFeverItem(entry: any) {
  return {
    id: entry.id,
    feed_id: entry.feed_id,
    title: entry.title,
    author: entry.author || '',
    html: entry.content || '',
    url: entry.url,
    is_saved: entry.starred ? 1 : 0,
    is_read: entry.status === 'read' ? 1 : 0,
    created_on_time: Math.floor(new Date(entry.published_at).getTime() / 1000),
  };
}

export { fever, feverSetup };
