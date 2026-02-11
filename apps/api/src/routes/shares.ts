/**
 * Shares API Routes (P0)
 * 
 * Note: GET /shared/:code is PUBLIC (no auth).
 * All other routes require auth.
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
import { query as dbQuery } from '../lib/db.js';
import {
  createShare,
  deleteShare,
  getShareForEntry,
  getShareByCode,
  getUserShares,
} from '../services/shares.js';

const shares = new Hono();

async function resolveEntryId(idParam: string, userId: number): Promise<number | null> {
  if (idParam.includes('-') && idParam.length > 20) {
    const result = await dbQuery('SELECT id FROM fg_entries WHERE uuid = $1 AND user_id = $2', [idParam, userId]);
    return result.rows[0]?.id ?? null;
  }
  const numericId = parseInt(idParam);
  return isNaN(numericId) ? null : numericId;
}

// ============ Public Route (no auth) ============

// View shared article
shares.get('/view/:code', async (c) => {
  const code = c.req.param('code');
  const share = await getShareByCode(code);
  
  if (!share) {
    return c.json({ error: 'Share not found' }, 404);
  }

  return c.json({
    title: share.title,
    content: share.content,
    url: share.url,
    author: share.author,
    feedTitle: share.feed_title,
    publishedAt: share.published_at,
    sharedAt: share.created_at,
  });
});

// ============ Authenticated Routes ============

// List user's shares
shares.get('/', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  
  const result = await getUserShares(user.userId, limit, offset);
  return c.json(result);
});

// Create share for an entry
shares.post('/:entryId', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = await resolveEntryId(c.req.param('entryId'), user.userId);
  if (!entryId) return c.json({ error: 'Entry not found' }, 404);

  // Check if already shared
  const existing = await getShareForEntry(user.userId, entryId);
  if (existing) {
    return c.json({
      shareCode: existing.share_code,
      shareUrl: `/shared/view/${existing.share_code}`,
      alreadyShared: true,
    });
  }

  // Fetch entry (entry.id is UUID from mapEntryToMiniflux, so override with numeric)
  const client = getDataClient(c);
  const entry = await client.getEntry(entryId);

  const share = await createShare(user.userId, { ...entry, id: entryId });

  return c.json({
    shareCode: share.share_code,
    shareUrl: `/shared/view/${share.share_code}`,
    alreadyShared: false,
  }, 201);
});

// Delete share
shares.delete('/:entryId', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = await resolveEntryId(c.req.param('entryId'), user.userId);
  if (!entryId) return c.json({ error: 'Entry not found' }, 404);
  
  const deleted = await deleteShare(user.userId, entryId);
  if (!deleted) {
    return c.json({ error: 'Share not found' }, 404);
  }
  return c.json({ success: true });
});

// Check if entry is shared
shares.get('/:entryId/status', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = await resolveEntryId(c.req.param('entryId'), user.userId);
  if (!entryId) return c.json({ shared: false });
  
  const share = await getShareForEntry(user.userId, entryId);
  return c.json({
    shared: !!share,
    shareCode: share?.share_code || null,
    shareUrl: share ? `/shared/view/${share.share_code}` : null,
  });
});

export default shares;
