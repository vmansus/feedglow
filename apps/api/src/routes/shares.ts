/**
 * Shares API Routes (P0)
 * 
 * Note: GET /shared/:code is PUBLIC (no auth).
 * All other routes require auth.
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { createMinifluxClient } from '../lib/miniflux.js';
import {
  createShare,
  deleteShare,
  getShareForEntry,
  getShareByCode,
  getUserShares,
} from '../services/shares.js';

const shares = new Hono();

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
  const entryId = parseInt(c.req.param('entryId'));

  // Check if already shared
  const existing = await getShareForEntry(user.userId, entryId);
  if (existing) {
    return c.json({
      shareCode: existing.share_code,
      shareUrl: `/shared/view/${existing.share_code}`,
      alreadyShared: true,
    });
  }

  // Fetch entry from Miniflux
  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  const client = createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });
  const entry = await client.getEntry(entryId);

  const share = await createShare(user.userId, entry);

  return c.json({
    shareCode: share.share_code,
    shareUrl: `/shared/view/${share.share_code}`,
    alreadyShared: false,
  }, 201);
});

// Delete share
shares.delete('/:entryId', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = parseInt(c.req.param('entryId'));
  
  const deleted = await deleteShare(user.userId, entryId);
  if (!deleted) {
    return c.json({ error: 'Share not found' }, 404);
  }
  return c.json({ success: true });
});

// Check if entry is shared
shares.get('/:entryId/status', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const entryId = parseInt(c.req.param('entryId'));
  
  const share = await getShareForEntry(user.userId, entryId);
  return c.json({
    shared: !!share,
    shareCode: share?.share_code || null,
    shareUrl: share ? `/shared/view/${share.share_code}` : null,
  });
});

export default shares;
