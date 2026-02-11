/**
 * User Interests API Routes
 * Manage user interest profiles for AI content scoring
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { query } from '../lib/db.js';

const interests = new Hono();
interests.use('/*', authMiddleware);

// ============ Schemas ============

const createInterestSchema = z.object({
  category: z.string().min(1).max(100),
  keywords: z.array(z.string()).default([]),
  weight: z.number().min(0).max(1).default(0.5),
  isNegative: z.boolean().default(false),
});

const updateInterestSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  keywords: z.array(z.string()).optional(),
  weight: z.number().min(0).max(1).optional(),
  isNegative: z.boolean().optional(),
});

// ============ Default Presets ============

const DEFAULT_PRESETS = [
  { category: 'AI/机器学习', keywords: ['AI', 'ML', 'GPT', 'LLM', '深度学习', 'machine learning', 'neural network'], weight: 0.8 },
  { category: '编程技术', keywords: ['编程', '代码', 'Python', 'JavaScript', 'TypeScript', 'Rust', 'Go', 'coding', 'programming'], weight: 0.7 },
  { category: '产品设计', keywords: ['产品', 'UX', 'UI', '设计', '原型', 'design', 'product'], weight: 0.6 },
  { category: '创业投资', keywords: ['创业', '融资', 'VC', '估值', 'startup', 'funding', 'YC'], weight: 0.5 },
  { category: '加密货币', keywords: ['crypto', 'BTC', 'ETH', 'web3', 'blockchain', 'DeFi', 'NFT'], weight: 0.3 },
  { category: '搞笑娱乐', keywords: ['哈哈哈', '笑死', 'meme', '段子', 'funny', 'lol'], weight: 0.1, isNegative: true },
];

// ============ Routes ============

// GET / — list user interests
interests.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const result = await query(
    `SELECT id, category, keywords, weight, is_negative, is_learned, created_at, updated_at
     FROM fg_user_interests WHERE user_id = $1 ORDER BY weight DESC, category`,
    [user.userId]
  );
  return c.json({ interests: result.rows.map(formatInterest) });
});

// GET /presets — get default presets
interests.get('/presets', async (c) => {
  return c.json({ presets: DEFAULT_PRESETS });
});

// POST / — create interest
interests.post('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const body = createInterestSchema.parse(await c.req.json());

  const result = await query(
    `INSERT INTO fg_user_interests (user_id, category, keywords, weight, is_negative)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, category) DO UPDATE SET keywords = $3, weight = $4, is_negative = $5, updated_at = NOW()
     RETURNING *`,
    [user.userId, body.category, body.keywords, body.weight, body.isNegative]
  );
  return c.json({ interest: formatInterest(result.rows[0]) }, 201);
});

// PUT /:id — update interest
interests.put('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));
  const body = updateInterestSchema.parse(await c.req.json());

  const sets: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  if (body.category !== undefined) { sets.push(`category = $${idx++}`); vals.push(body.category); }
  if (body.keywords !== undefined) { sets.push(`keywords = $${idx++}`); vals.push(body.keywords); }
  if (body.weight !== undefined) { sets.push(`weight = $${idx++}`); vals.push(body.weight); }
  if (body.isNegative !== undefined) { sets.push(`is_negative = $${idx++}`); vals.push(body.isNegative); }

  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  sets.push(`updated_at = NOW()`);
  vals.push(id, user.userId);

  const result = await query(
    `UPDATE fg_user_interests SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    vals
  );

  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ interest: formatInterest(result.rows[0]) });
});

// DELETE /:id
interests.delete('/:id', async (c) => {
  const user = c.get('user') as JWTPayload;
  const id = parseInt(c.req.param('id'));

  const result = await query(
    'DELETE FROM fg_user_interests WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, user.userId]
  );

  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

// POST /reset — reset to defaults
interests.post('/reset', async (c) => {
  const user = c.get('user') as JWTPayload;

  await query('DELETE FROM fg_user_interests WHERE user_id = $1', [user.userId]);

  for (const preset of DEFAULT_PRESETS) {
    await query(
      `INSERT INTO fg_user_interests (user_id, category, keywords, weight, is_negative)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.userId, preset.category, preset.keywords, preset.weight, preset.isNegative || false]
    );
  }

  const result = await query(
    'SELECT * FROM fg_user_interests WHERE user_id = $1 ORDER BY weight DESC',
    [user.userId]
  );
  return c.json({ interests: result.rows.map(formatInterest) });
});

function formatInterest(row: any) {
  return {
    id: row.id,
    category: row.category,
    keywords: row.keywords || [],
    weight: parseFloat(row.weight),
    isNegative: row.is_negative,
    isLearned: row.is_learned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default interests;
