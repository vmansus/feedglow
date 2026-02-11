/**
 * Clipper AI Content Analysis API
 * Analyzes content relevance against user interests using DeepSeek
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { query } from '../lib/db.js';
import crypto from 'crypto';

const clipperAi = new Hono();
clipperAi.use('/*', authMiddleware);

const analyzeSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    content: z.string().max(2000),
  })).min(1).max(20),
  platform: z.string().default('twitter'),
});

// ============ Routes ============

// POST /analyze-content — batch analyze content relevance
clipperAi.post('/analyze-content', async (c) => {
  const user = c.get('user') as JWTPayload;
  const body = analyzeSchema.parse(await c.req.json());

  // 1. Get user interests
  const interestsResult = await query(
    'SELECT category, keywords, weight, is_negative FROM fg_user_interests WHERE user_id = $1',
    [user.userId]
  );

  if (interestsResult.rows.length === 0) {
    // No interests configured — return neutral scores
    return c.json({
      results: body.items.map(item => ({
        id: item.id, score: 50, reason: '请先配置兴趣偏好', tags: [],
      })),
      model: 'none',
      tokens: 0,
    });
  }

  // 2. Check cache for already-analyzed items
  const results: Map<string, any> = new Map();
  const uncached: typeof body.items = [];

  for (const item of body.items) {
    const hash = crypto.createHash('sha256').update(item.content).digest('hex');
    const cached = await query(
      `SELECT score, reason, tags FROM fg_content_analysis_cache
       WHERE user_id = $1 AND content_hash = $2 AND (expires_at IS NULL OR expires_at > NOW())`,
      [user.userId, hash]
    );
    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      results.set(item.id, {
        id: item.id, score: row.score, reason: row.reason, tags: row.tags || [],
      });
    } else {
      uncached.push(item);
    }
  }

  // 3. Call AI for uncached items
  if (uncached.length > 0) {
    // Get AI config from user settings
    let aiApiKey = process.env.DEEPSEEK_API_KEY || '';
    let aiBaseUrl = 'https://api.deepseek.com/v1';
    let aiModel = 'deepseek-chat';

    try {
      const settingsResult = await query(
        "SELECT ai_config FROM fg_user_settings WHERE user_id = $1",
        [user.userId]
      );
      if (settingsResult.rows.length > 0 && settingsResult.rows[0].ai_config) {
        const cfg = settingsResult.rows[0].ai_config;
        if (cfg.apiKey) aiApiKey = cfg.apiKey;
        if (cfg.baseUrl) aiBaseUrl = cfg.baseUrl;
        if (cfg.model) aiModel = cfg.model;
      }
    } catch {
      // fg_user_settings may not have ai_config column — use env defaults
    }

    if (!aiApiKey) {
      // Fallback: keyword matching
      for (const item of uncached) {
        const result = keywordMatch(item, interestsResult.rows);
        results.set(item.id, result);
      }
    } else {
      try {
        const aiResults = await callDeepSeek(
          aiApiKey, aiBaseUrl, aiModel,
          interestsResult.rows, uncached
        );
        for (const r of aiResults) {
          results.set(r.id, r);
          // Cache result
          const hash = crypto.createHash('sha256')
            .update(uncached.find(i => i.id === r.id)!.content)
            .digest('hex');
          await query(
            `INSERT INTO fg_content_analysis_cache (user_id, content_hash, platform, score, reason, tags, model, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '24 hours')
             ON CONFLICT (user_id, content_hash) DO UPDATE SET score=$4, reason=$5, tags=$6, model=$7, expires_at=NOW() + INTERVAL '24 hours'`,
            [user.userId, hash, body.platform, r.score, r.reason, r.tags, aiModel]
          );
        }
      } catch (err) {
        console.error('[Clipper AI] DeepSeek call failed, falling back to keywords:', err);
        for (const item of uncached) {
          results.set(item.id, keywordMatch(item, interestsResult.rows));
        }
      }
    }
  }

  return c.json({
    results: body.items.map(item => results.get(item.id) || { id: item.id, score: 50, reason: 'Unknown', tags: [] }),
    model: 'deepseek-chat',
    tokens: 0,
  });
});

// ============ Helpers ============

function keywordMatch(item: { id: string; content: string }, interests: any[]) {
  const content = item.content.toLowerCase();
  let totalScore = 0;
  let totalWeight = 0;
  const matchedTags: string[] = [];

  for (const interest of interests) {
    const keywords: string[] = interest.keywords || [];
    const weight = parseFloat(interest.weight);
    const isNeg = interest.is_negative;
    let matched = false;

    for (const kw of keywords) {
      if (content.includes(kw.toLowerCase())) {
        matched = true;
        break;
      }
    }

    if (matched) {
      if (isNeg) {
        totalScore -= weight * 30;
      } else {
        totalScore += weight * 100;
        matchedTags.push(interest.category);
      }
      totalWeight += weight;
    }
  }

  const score = totalWeight > 0 ? Math.max(0, Math.min(100, Math.round(totalScore / totalWeight))) : 50;
  return {
    id: item.id,
    score,
    reason: matchedTags.length > 0 ? `匹配: ${matchedTags.join(', ')}` : '未匹配任何兴趣关键词',
    tags: matchedTags,
  };
}

async function callDeepSeek(
  apiKey: string, baseUrl: string, model: string,
  interests: any[], items: { id: string; content: string }[]
) {
  const interestDesc = interests.map(i => {
    const dir = i.is_negative ? '(负向-不感兴趣)' : '';
    return `- ${i.category} ${dir}: 关键词[${(i.keywords || []).join(',')}] 权重=${i.weight}`;
  }).join('\n');

  const itemsList = items.map((item, idx) =>
    `${idx + 1}. [id=${item.id}] ${item.content.slice(0, 500)}`
  ).join('\n');

  const prompt = `你是内容相关度分析助手。根据用户兴趣配置，为每条内容打分(0-100)。

用户兴趣配置：
${interestDesc}

评分标准：
- 85-100: 与高权重兴趣高度相关
- 60-84: 较相关
- 30-59: 一般
- 0-29: 不相关或匹配负向兴趣

内容列表：
${itemsList}

严格返回JSON数组，不要任何其他文字：
[{"id":"xxx","score":85,"reason":"简短原因","tags":["标签"]}]`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '[]';

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array in AI response');

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.map((r: any) => ({
    id: String(r.id),
    score: Math.max(0, Math.min(100, Number(r.score) || 50)),
    reason: String(r.reason || ''),
    tags: Array.isArray(r.tags) ? r.tags : [],
  }));
}

export default clipperAi;
