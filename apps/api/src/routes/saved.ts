/**
 * Saved Items API Routes
 * "Read Later" / Clipper functionality
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import {
  saveItem,
  getSavedItems,
  getSavedItem,
  checkUrl,
  updateSavedItem,
  deleteSavedItem,
  markAllRead,
  getUnreadCount,
} from '../services/saved.js';
import { summarizeContent, translateParagraphs, getAIConfigForUser, AIRateLimitError } from '../services/ai.js';
import { getAISettings } from '../services/settings.js';

const saved = new Hono();

// Auth required for all routes
saved.use('/*', authMiddleware);

// ============ Schemas ============

const saveItemSchema = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  thumbnail: z.string().optional(),
  source: z.enum(['twitter', 'extension', 'manual']).optional(),
  sourceId: z.string().optional(),
});

const updateItemSchema = z.object({
  isRead: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

// ============ Routes ============

// Save a new item
saved.post('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  
  try {
    const body = await c.req.json();
    const input = saveItemSchema.parse(body);
    
    const item = await saveItem(user.userId, input);
    return c.json(item, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: err.errors }, 400);
    }
    throw err;
  }
});

// Get saved items list
saved.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = parseInt(c.req.query('offset') || '0');
  const unreadOnly = c.req.query('unread') === '1' || c.req.query('unread') === 'true';
  const includeArchived = c.req.query('archived') === '1' || c.req.query('archived') === 'true';
  const search = c.req.query('q') || undefined;

  const result = await getSavedItems(user.userId, {
    limit,
    offset,
    unreadOnly,
    includeArchived,
    search,
  });

  return c.json(result);
});

// Get unread count
saved.get('/count', async (c) => {
  const user = c.get('user') as JWTPayload;
  const count = await getUnreadCount(user.userId);
  return c.json({ count });
});

// Check if URL is saved
saved.get('/check', async (c) => {
  const user = c.get('user') as JWTPayload;
  const url = c.req.query('url');
  
  if (!url) {
    return c.json({ error: 'url parameter required' }, 400);
  }

  const result = await checkUrl(user.userId, url);
  return c.json(result);
});

// Bulk delete items
saved.post('/bulk-delete', async (c) => {
  const user = c.get('user') as JWTPayload;
  
  try {
    const body = await c.req.json();
    const { ids } = z.object({ ids: z.array(z.number()).min(1).max(100) }).parse(body);
    
    const result = await import('../services/saved.js').then(m => m.bulkDeleteSavedItems(user.userId, ids));
    return c.json({ deleted: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: err.errors }, 400);
    }
    throw err;
  }
});

// AI Summarize saved item
saved.post('/summarize', async (c) => {
  const user = c.get('user') as JWTPayload;
  
  try {
    const body = await c.req.json();
    const { id } = z.object({ id: z.number() }).parse(body);
    
    const aiSettings = await getAISettings(user.userId);
    if (!aiSettings.enableSummary) {
      return c.json({ error: 'AI summaries are disabled. Enable them in Settings → AI.', code: 'FEATURE_DISABLED' }, 403);
    }

    const item = await getSavedItem(user.userId, id);
    if (!item) return c.json({ error: 'Item not found' }, 404);

    const content = item.content || item.description || '';
    if (!content) return c.json({ error: 'No content to summarize' }, 400);

    const config = await getAIConfigForUser(user.userId);
    const result = await summarizeContent(item.title || 'Untitled', content, config);

    return c.json({ id, ...result });
  } catch (err) {
    if (err instanceof z.ZodError) return c.json({ error: 'Invalid input' }, 400);
    if (err instanceof AIRateLimitError) return c.json({ error: 'AI 请求太频繁，请稍后再试', code: 'RATE_LIMITED' }, 429);
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `AI 服务异常: ${msg}`, code: 'AI_ERROR' }, 500);
  }
});

// Mark all as read
saved.post('/mark-all-read', async (c) => {
  const user = c.get('user') as JWTPayload;
  const count = await markAllRead(user.userId);
  return c.json({ success: true, markedRead: count });
});

// Get single item
saved.get('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  const item = await getSavedItem(user.userId, id);
  if (!item) {
    return c.json({ error: 'Item not found' }, 404);
  }

  return c.json(item);
});

// Update item
saved.patch('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const body = await c.req.json();
    const updates = updateItemSchema.parse(body);
    
    const item = await updateSavedItem(user.userId, id, updates);
    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    return c.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: err.errors }, 400);
    }
    throw err;
  }
});

// Delete item
saved.delete('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  const deleted = await deleteSavedItem(user.userId, id);
  if (!deleted) {
    return c.json({ error: 'Item not found' }, 404);
  }

  return c.json({ success: true });
});

export default saved;
