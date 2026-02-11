/**
 * Retention Policy Routes (P1 #12)
 * 
 * Manage article retention policies, run cleanup, view stats.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
import {
  getRetentionPolicies,
  upsertRetentionPolicy,
  deleteRetentionPolicy,
  runRetentionCleanup,
  getRetentionStats,
  getCleanupLogs,
} from '../services/retention.js';

const retention = new Hono();
retention.use('*', authMiddleware);

// ============ Policy CRUD ============

/**
 * GET /api/retention/policies
 * List all retention policies
 */
retention.get('/policies', async (c) => {
  const user = c.get('user') as JWTPayload;
  const policies = await getRetentionPolicies(user.userId);
  return c.json(policies);
});

/**
 * POST /api/retention/policies
 * Create or update a retention policy
 */
const policySchema = z.object({
  feedId: z.number().nullable().optional(),
  keepDays: z.number().min(1).max(3650),
  keepStarred: z.boolean().optional().default(true),
  keepUnread: z.boolean().optional().default(true),
  keepMinCount: z.number().min(0).optional().default(0),
  action: z.enum(['mark_read', 'remove']).optional().default('mark_read'),
  enabled: z.boolean().optional().default(true),
});

retention.post('/policies', zValidator('json', policySchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const body = c.req.valid('json');
  const policy = await upsertRetentionPolicy(user.userId, body);
  return c.json(policy, 201);
});

/**
 * DELETE /api/retention/policies/:id
 * Delete a retention policy
 */
retention.delete('/policies/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  const deleted = await deleteRetentionPolicy(user.userId, id);
  
  if (!deleted) {
    return c.json({ error: 'Policy not found' }, 404);
  }
  return c.json({ success: true });
});

// ============ Cleanup ============

/**
 * POST /api/retention/cleanup
 * Run retention cleanup manually
 */
retention.post('/cleanup', async (c) => {
  const user = c.get('user') as JWTPayload;
  const client = getDataClient(c) as any;

  const result = await runRetentionCleanup(user.userId, client);
  return c.json(result);
});

/**
 * GET /api/retention/logs
 * Get cleanup execution history
 */
retention.get('/logs', async (c) => {
  const user = c.get('user') as JWTPayload;
  const limit = parseInt(c.req.query('limit') || '10');
  const logs = await getCleanupLogs(user.userId, limit);
  return c.json(logs);
});

// ============ Stats ============

/**
 * GET /api/retention/stats
 * Get retention-relevant statistics
 */
retention.get('/stats', async (c) => {
  const user = c.get('user') as JWTPayload;
  const client = getDataClient(c) as any;

  const stats = await getRetentionStats(user.userId, client);
  return c.json(stats);
});

export default retention;
