/**
 * AI Actions Routes — Rule-based automation CRUD + test endpoint
 */

import { Hono } from 'hono';
import { verifyToken } from '../lib/auth.js';
import {
  getActionRules, getActionRule, createActionRule,
  updateActionRule, deleteActionRule, evaluateRules,
  type ActionCondition, type ActionResult, type ActionEntryContext,
} from '../services/actions.js';

const app = new Hono();

// Auth middleware
app.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization required' }, 401);
  }
  try {
    const payload = await verifyToken(auth.slice(7));
    c.set('userId' as any, payload.userId);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// GET /api/actions — List all rules
app.get('/', async (c) => {
  const userId = c.get('userId' as any);
  const rules = await getActionRules(userId);
  return c.json(rules);
});

// GET /api/actions/:id — Get single rule
app.get('/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const rule = await getActionRule(id, userId);
  if (!rule) return c.json({ error: 'Rule not found' }, 404);
  return c.json(rule);
});

// POST /api/actions — Create rule
app.post('/', async (c) => {
  const userId = c.get('userId' as any);
  const body = await c.req.json();

  const { name, conditions, actions, enabled } = body;
  if (!name || !Array.isArray(conditions) || !Array.isArray(actions)) {
    return c.json({ error: 'name, conditions[], and actions[] are required' }, 400);
  }
  if (actions.length === 0) {
    return c.json({ error: 'At least one action is required' }, 400);
  }

  // Validate condition fields
  const validFields = [
    'feed_title', 'feed_url', 'feed_category', 'feed_site_url',
    'entry_title', 'entry_content', 'entry_url', 'entry_author', 'entry_media_length',
  ];
  const validOps = ['contains', 'not_contains', 'eq', 'not_eq', 'gt', 'lt', 'regex'];
  for (const cond of conditions as ActionCondition[]) {
    if (!validFields.includes(cond.field)) {
      return c.json({ error: `Invalid field: ${cond.field}` }, 400);
    }
    if (!validOps.includes(cond.operator)) {
      return c.json({ error: `Invalid operator: ${cond.operator}` }, 400);
    }
  }

  // Validate action types
  const validTypes = ['summary', 'translation', 'readability', 'star', 'mark_read', 'block', 'webhook', 'notification'];
  for (const act of actions as ActionResult[]) {
    if (!validTypes.includes(act.type)) {
      return c.json({ error: `Invalid action type: ${act.type}` }, 400);
    }
    if (act.type === 'translation' && !act.language) {
      return c.json({ error: 'translation action requires language field' }, 400);
    }
    if (act.type === 'webhook' && !act.webhookUrl) {
      return c.json({ error: 'webhook action requires webhookUrl field' }, 400);
    }
  }

  const rule = await createActionRule(userId, { name, conditions, actions, enabled });
  return c.json(rule, 201);
});

// PUT /api/actions/:id — Update rule
app.put('/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json();
  const rule = await updateActionRule(id, userId, body);
  if (!rule) return c.json({ error: 'Rule not found' }, 404);
  return c.json(rule);
});

// DELETE /api/actions/:id — Delete rule
app.delete('/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const ok = await deleteActionRule(id, userId);
  if (!ok) return c.json({ error: 'Rule not found' }, 404);
  return c.json({ success: true });
});

// POST /api/actions/test — Dry-run: test rules against sample entries
app.post('/test', async (c) => {
  const userId = c.get('userId' as any);
  const body = await c.req.json();
  const entries: ActionEntryContext[] = body.entries || [];

  if (entries.length === 0) {
    return c.json({ error: 'entries[] is required' }, 400);
  }

  const result = await evaluateRules(userId, entries);
  return c.json({
    blocked: Array.from(result.blocked),
    entryActions: Object.fromEntries(
      Array.from(result.entryActions.entries()).map(([idx, actions]) => [idx, actions])
    ),
  });
});

export default app;
