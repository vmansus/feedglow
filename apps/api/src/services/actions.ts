/**
 * AI Actions Service — Rule-based automation engine
 * 
 * Inspired by Folo's action system. Users define rules with conditions and actions:
 * - When: feed/entry fields match conditions (contains, regex, eq, gt, lt...)
 * - Then: auto-summarize, translate, star, mark-read, block, webhook, notify
 * 
 * Actions run automatically when new entries are fetched.
 */

import { query } from '../lib/db.js';

// ============ Types ============

export type ActionField =
  | 'feed_title' | 'feed_url' | 'feed_category' | 'feed_site_url'
  | 'entry_title' | 'entry_content' | 'entry_url' | 'entry_author'
  | 'entry_media_length';

export type ActionOperator =
  | 'contains' | 'not_contains'
  | 'eq' | 'not_eq'
  | 'gt' | 'lt'
  | 'regex';

export type ActionType =
  | 'summary'        // Generate AI summary
  | 'translation'    // Translate to target language
  | 'readability'    // Fetch full content via Readability
  | 'star'           // Auto-star entry
  | 'mark_read'      // Auto mark as read (silence)
  | 'block'          // Block (don't store entry)
  | 'webhook'        // Trigger external webhook
  | 'notification';  // Send push notification

export interface ActionCondition {
  field: ActionField;
  operator: ActionOperator;
  value: string;
}

export interface ActionResult {
  type: ActionType;
  // type-specific config
  language?: string;       // for translation
  webhookUrl?: string;     // for webhook
  webhookSecret?: string;  // for webhook
}

export interface ActionRule {
  id: number;
  userId: number;
  name: string;
  enabled: boolean;
  // Conditions — ALL must match (AND logic)
  conditions: ActionCondition[];
  // Actions — all execute if conditions match
  actions: ActionResult[];
  createdAt: Date;
  updatedAt: Date;
}

// Entry context passed to the engine
export interface ActionEntryContext {
  entryId?: number;
  title: string;
  url: string;
  content: string;
  author: string;
  // Feed context
  feedTitle: string;
  feedUrl: string;
  feedSiteUrl: string;
  feedCategory: string;
  // Media
  enclosureUrl?: string;
  enclosureType?: string;
  enclosureSize?: number;
}

// ============ CRUD ============

export async function getActionRules(userId: number): Promise<ActionRule[]> {
  const r = await query(
    'SELECT * FROM fg_action_rules WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );
  return r.rows.map(mapRule);
}

export async function getActionRule(id: number, userId: number): Promise<ActionRule | null> {
  const r = await query(
    'SELECT * FROM fg_action_rules WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return r.rows[0] ? mapRule(r.rows[0]) : null;
}

export async function createActionRule(
  userId: number,
  data: { name: string; conditions: ActionCondition[]; actions: ActionResult[]; enabled?: boolean }
): Promise<ActionRule> {
  const r = await query(
    `INSERT INTO fg_action_rules (user_id, name, conditions, actions, enabled)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, data.name, JSON.stringify(data.conditions), JSON.stringify(data.actions), data.enabled ?? true]
  );
  return mapRule(r.rows[0]);
}

export async function updateActionRule(
  id: number,
  userId: number,
  data: Partial<{ name: string; conditions: ActionCondition[]; actions: ActionResult[]; enabled: boolean }>
): Promise<ActionRule | null> {
  const sets: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(data.name); }
  if (data.conditions !== undefined) { sets.push(`conditions = $${idx++}`); vals.push(JSON.stringify(data.conditions)); }
  if (data.actions !== undefined) { sets.push(`actions = $${idx++}`); vals.push(JSON.stringify(data.actions)); }
  if (data.enabled !== undefined) { sets.push(`enabled = $${idx++}`); vals.push(data.enabled); }

  if (sets.length === 0) return getActionRule(id, userId);

  sets.push(`updated_at = NOW()`);
  vals.push(id, userId);

  const r = await query(
    `UPDATE fg_action_rules SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    vals
  );
  return r.rows[0] ? mapRule(r.rows[0]) : null;
}

export async function deleteActionRule(id: number, userId: number): Promise<boolean> {
  const r = await query(
    'DELETE FROM fg_action_rules WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return (r.rowCount ?? 0) > 0;
}

// ============ Engine ============

/**
 * Evaluate all rules for a user against entries.
 * Returns a map of entry index → list of action types to execute.
 * 'block' actions filter entries OUT before insertion.
 */
export async function evaluateRules(
  userId: number,
  entries: ActionEntryContext[]
): Promise<{
  blocked: Set<number>;               // indices to block (don't insert)
  entryActions: Map<number, ActionResult[]>;  // index → actions to run post-insert
}> {
  const rules = await query(
    'SELECT * FROM fg_action_rules WHERE user_id = $1 AND enabled = TRUE',
    [userId]
  );

  const activeRules: ActionRule[] = rules.rows.map(mapRule);
  const blocked = new Set<number>();
  const entryActions = new Map<number, ActionResult[]>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const matchedActions: ActionResult[] = [];

    for (const rule of activeRules) {
      if (matchesAllConditions(rule.conditions, entry)) {
        matchedActions.push(...rule.actions);
      }
    }

    // Separate block actions
    const hasBlock = matchedActions.some(a => a.type === 'block');
    if (hasBlock) {
      blocked.add(i);
      continue; // Don't collect other actions for blocked entries
    }

    if (matchedActions.length > 0) {
      entryActions.set(i, matchedActions);
    }
  }

  return { blocked, entryActions };
}

/**
 * Execute post-insert actions on an entry.
 * Called after entry is stored in DB.
 */
export async function executeActions(
  userId: number,
  entryId: number,
  actions: ActionResult[],
  context: ActionEntryContext
): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'star':
          await query('UPDATE fg_entries SET starred = TRUE WHERE id = $1 AND user_id = $2', [entryId, userId]);
          break;

        case 'mark_read':
          await query("UPDATE fg_entries SET status = 'read' WHERE id = $1 AND user_id = $2", [entryId, userId]);
          break;

        case 'summary':
          // Queue summary generation (non-blocking)
          generateSummaryAsync(userId, entryId, context).catch(err =>
            console.error(`[Actions] Summary failed for entry ${entryId}:`, err.message)
          );
          break;

        case 'translation':
          if (action.language) {
            generateTranslationAsync(userId, entryId, context, action.language).catch(err =>
              console.error(`[Actions] Translation failed for entry ${entryId}:`, err.message)
            );
          }
          break;

        case 'readability':
          fetchReadabilityAsync(entryId, context).catch(err =>
            console.error(`[Actions] Readability failed for entry ${entryId}:`, err.message)
          );
          break;

        case 'webhook':
          if (action.webhookUrl) {
            triggerWebhook(action.webhookUrl, action.webhookSecret, context).catch(err =>
              console.error(`[Actions] Webhook failed for entry ${entryId}:`, err.message)
            );
          }
          break;

        case 'notification':
          // Store notification for polling
          await query(
            `INSERT INTO fg_notifications (user_id, type, title, body, entry_id) VALUES ($1, 'action', $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [userId, `New: ${context.title}`, `From ${context.feedTitle}`, entryId]
          );
          break;
      }
    } catch (err) {
      console.error(`[Actions] Action ${action.type} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

// ============ Condition Matching ============

function matchesAllConditions(conditions: ActionCondition[], entry: ActionEntryContext): boolean {
  if (conditions.length === 0) return true; // No conditions = always match
  return conditions.every(c => matchCondition(c, entry));
}

function matchCondition(condition: ActionCondition, entry: ActionEntryContext): boolean {
  const fieldValue = getFieldValue(condition.field, entry);

  switch (condition.operator) {
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(condition.value.toLowerCase());

    case 'not_contains':
      return typeof fieldValue === 'string' && !fieldValue.toLowerCase().includes(condition.value.toLowerCase());

    case 'eq':
      return String(fieldValue).toLowerCase() === condition.value.toLowerCase();

    case 'not_eq':
      return String(fieldValue).toLowerCase() !== condition.value.toLowerCase();

    case 'gt': {
      const num = parseFloat(String(fieldValue));
      const threshold = parseFloat(condition.value);
      return !isNaN(num) && !isNaN(threshold) && num > threshold;
    }

    case 'lt': {
      const num = parseFloat(String(fieldValue));
      const threshold = parseFloat(condition.value);
      return !isNaN(num) && !isNaN(threshold) && num < threshold;
    }

    case 'regex':
      try {
        const re = new RegExp(condition.value, 'i');
        return re.test(String(fieldValue));
      } catch {
        return false;
      }

    default:
      return false;
  }
}

function getFieldValue(field: ActionField, entry: ActionEntryContext): string | number {
  switch (field) {
    case 'feed_title': return entry.feedTitle;
    case 'feed_url': return entry.feedUrl;
    case 'feed_category': return entry.feedCategory;
    case 'feed_site_url': return entry.feedSiteUrl;
    case 'entry_title': return entry.title;
    case 'entry_content': return entry.content;
    case 'entry_url': return entry.url;
    case 'entry_author': return entry.author;
    case 'entry_media_length': return entry.enclosureSize || 0;
    default: return '';
  }
}

// ============ Async Action Executors ============

async function generateSummaryAsync(userId: number, entryId: number, ctx: ActionEntryContext): Promise<void> {
  const { getAIConfigForUser, summarize } = await import('./ai.js');
  const config = await getAIConfigForUser(userId);
  if (!config) return;
  const result = await summarize(ctx.content, ctx.title, config);
  await query(
    `INSERT INTO fg_entry_metadata (entry_id, key, value) VALUES ($1, 'ai_summary', $2)
     ON CONFLICT (entry_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [entryId, JSON.stringify(result)]
  );
}

async function generateTranslationAsync(
  userId: number, entryId: number, ctx: ActionEntryContext, language: string
): Promise<void> {
  const { getAIConfigForUser, translate } = await import('./ai.js');
  const config = await getAIConfigForUser(userId);
  if (!config) return;
  const result = await translate(ctx.content, language, config);
  await query(
    `INSERT INTO fg_entry_metadata (entry_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (entry_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [entryId, `translation_${language}`, JSON.stringify(result)]
  );
}

async function fetchReadabilityAsync(entryId: number, ctx: ActionEntryContext): Promise<void> {
  if (!ctx.url) return;
  const { fetchFullContent } = await import('../feed-engine/parser.js');
  const content = await fetchFullContent(ctx.url);
  if (content && content.length > ctx.content.length) {
    await query('UPDATE fg_entries SET content = $1 WHERE id = $2', [content, entryId]);
  }
}

async function triggerWebhook(url: string, secret: string | undefined, ctx: ActionEntryContext): Promise<void> {
  const payload = JSON.stringify({
    event: 'action.triggered',
    entry: {
      title: ctx.title,
      url: ctx.url,
      author: ctx.author,
      feed: ctx.feedTitle,
      category: ctx.feedCategory,
    },
    timestamp: new Date().toISOString(),
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) {
    const { createHmac } = await import('crypto');
    headers['X-Webhook-Signature'] = createHmac('sha256', secret).update(payload).digest('hex');
  }

  await fetch(url, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
}

// ============ Helpers ============

function mapRule(row: any): ActionRule {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    enabled: row.enabled,
    conditions: typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions,
    actions: typeof row.actions === 'string' ? JSON.parse(row.actions) : row.actions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
