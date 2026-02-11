/**
 * Newsletter Routes
 * - Inbound email webhook (from Cloudflare Worker)
 * - CRUD for newsletter subscriptions (authenticated)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import {
  createNewsletterSubscription,
  listNewsletterSubscriptions,
  deleteNewsletterSubscription,
  updateNewsletterSubscription,
  processInboundEmail,
  parseEmailContent,
  sanitizeNewsletterHtml,
} from '../services/newsletter.js';

const newsletter = new Hono();

// ============ Inbound Webhook (no auth, uses webhook secret) ============

const inboundSchema = z.object({
  to: z.string(),           // address part before @
  from: z.string(),          // sender email
  subject: z.string().optional().default('(untitled)'),
  html: z.string().optional(),
  text: z.string().optional(),
  raw: z.string().optional(), // raw MIME (fallback)
  date: z.string().optional(),
});

newsletter.post('/inbound', async (c) => {
  // Verify webhook secret
  const secret = c.req.header('X-Webhook-Secret');
  const expectedSecret = process.env.NEWSLETTER_WEBHOOK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  let body;
  try {
    body = inboundSchema.parse(await c.req.json());
  } catch (err: any) {
    return c.json({ error: 'invalid payload', details: err.message }, 400);
  }

  // Extract address (handle full email or just the local part)
  const address = body.to.split('@')[0];

  // Determine HTML content
  let html = body.html || '';
  let text = body.text || '';

  // If we only have raw MIME, parse it
  if (!html && !text && body.raw) {
    const parsed = parseEmailContent(body.raw, body.subject, body.from);
    html = parsed.html;
    text = parsed.text;
  }

  const result = await processInboundEmail(
    address,
    body.from,
    body.subject,
    html,
    text,
    body.date
  );

  if (!result.ok) {
    const status = result.error === 'unknown address' ? 404 
                 : result.error === 'sender rejected' ? 403 
                 : 500;
    return c.json({ error: result.error }, status);
  }

  return c.json({ ok: true });
});

// ============ Authenticated CRUD Routes ============

newsletter.use('/subscriptions/*', authMiddleware);
newsletter.use('/subscriptions', authMiddleware);

// List all newsletter subscriptions
newsletter.get('/subscriptions', async (c) => {
  const user = c.get('user') as JWTPayload;
  const subs = await listNewsletterSubscriptions(user.userId);
  return c.json(subs);
});

// Create a newsletter subscription
const createSchema = z.object({
  name: z.string().min(1).max(200),
  categoryId: z.number().optional(),
  senderFilter: z.string().optional(),
});

newsletter.post('/subscriptions', async (c) => {
  const user = c.get('user') as JWTPayload;

  let data;
  try {
    data = createSchema.parse(await c.req.json());
  } catch (err: any) {
    return c.json({ error: 'invalid input', details: err.message }, 400);
  }

  try {
    const sub = await createNewsletterSubscription(
      user.userId,
      data.name,
      data.categoryId,
      data.senderFilter
    );
    return c.json(sub, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Update a newsletter subscription
const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  categoryId: z.number().nullable().optional(),
  senderFilter: z.string().nullable().optional(),
});

newsletter.put('/subscriptions/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'invalid id' }, 400);

  let data;
  try {
    data = updateSchema.parse(await c.req.json());
  } catch (err: any) {
    return c.json({ error: 'invalid input', details: err.message }, 400);
  }

  const ok = await updateNewsletterSubscription(id, user.userId, data);
  if (!ok) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

// Delete a newsletter subscription
newsletter.delete('/subscriptions/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'invalid id' }, 400);

  const ok = await deleteNewsletterSubscription(id, user.userId);
  if (!ok) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

export default newsletter;
