/**
 * AI Tasks Service — Scheduled AI analysis
 * 
 * Users define custom prompts + schedules. The system runs them periodically,
 * feeds relevant entries as context, and stores/notifies with results.
 * 
 * Examples:
 * - "每天早上总结我未读的科技新闻" (daily tech news summary)
 * - "每周一分析本周阅读趋势" (weekly reading trend analysis)
 * - "当有关于 AI 的重大新闻时通知我" (alert on AI news)
 */

import { query } from '../lib/db.js';

// ============ Types ============

export type ScheduleType = 'once' | 'daily' | 'weekly' | 'monthly';

export interface TaskSchedule {
  type: ScheduleType;
  // For 'once': ISO datetime string
  date?: string;
  // For 'daily': "HH:MM" in user's timezone
  timeOfDay?: string;
  // For 'weekly': 0-6 (Sunday=0)
  dayOfWeek?: number;
  // For 'monthly': 1-31
  dayOfMonth?: number;
  // User's timezone (e.g., "Asia/Shanghai")
  timezone?: string;
}

export type NotifyChannel = 'in_app' | 'email' | 'webhook';

export interface TaskOptions {
  notifyChannels: NotifyChannel[];
  webhookUrl?: string;
  // Feed/category scope — empty = all feeds
  feedIds?: number[];
  categoryIds?: number[];
  // Entry filters
  onlyUnread?: boolean;
  maxEntries?: number;  // max entries to include as context (default 50)
}

export interface AITask {
  id: number;
  userId: number;
  name: string;
  prompt: string;
  schedule: TaskSchedule;
  options: TaskOptions;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastResult: string | null;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskRun {
  id: number;
  taskId: number;
  result: string;
  entriesUsed: number;
  tokensUsed: number;
  durationMs: number;
  error: string | null;
  createdAt: Date;
}

// ============ CRUD ============

export async function getAITasks(userId: number): Promise<AITask[]> {
  const r = await query(
    'SELECT * FROM fg_ai_tasks WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );
  return r.rows.map(mapTask);
}

export async function getAITask(id: number, userId: number): Promise<AITask | null> {
  const r = await query(
    'SELECT * FROM fg_ai_tasks WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return r.rows[0] ? mapTask(r.rows[0]) : null;
}

export async function createAITask(
  userId: number,
  data: { name: string; prompt: string; schedule: TaskSchedule; options?: TaskOptions; enabled?: boolean }
): Promise<AITask> {
  const nextRunAt = computeNextRun(data.schedule);
  const r = await query(
    `INSERT INTO fg_ai_tasks (user_id, name, prompt, schedule, options, enabled, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId, data.name, data.prompt,
      JSON.stringify(data.schedule),
      JSON.stringify(data.options || { notifyChannels: ['in_app'] }),
      data.enabled ?? true,
      nextRunAt,
    ]
  );
  return mapTask(r.rows[0]);
}

export async function updateAITask(
  id: number,
  userId: number,
  data: Partial<{ name: string; prompt: string; schedule: TaskSchedule; options: TaskOptions; enabled: boolean }>
): Promise<AITask | null> {
  const sets: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(data.name); }
  if (data.prompt !== undefined) { sets.push(`prompt = $${idx++}`); vals.push(data.prompt); }
  if (data.schedule !== undefined) {
    sets.push(`schedule = $${idx++}`); vals.push(JSON.stringify(data.schedule));
    sets.push(`next_run_at = $${idx++}`); vals.push(computeNextRun(data.schedule));
  }
  if (data.options !== undefined) { sets.push(`options = $${idx++}`); vals.push(JSON.stringify(data.options)); }
  if (data.enabled !== undefined) { sets.push(`enabled = $${idx++}`); vals.push(data.enabled); }

  if (sets.length === 0) return getAITask(id, userId);

  sets.push('updated_at = NOW()');
  vals.push(id, userId);

  const r = await query(
    `UPDATE fg_ai_tasks SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    vals
  );
  return r.rows[0] ? mapTask(r.rows[0]) : null;
}

export async function deleteAITask(id: number, userId: number): Promise<boolean> {
  const r = await query('DELETE FROM fg_ai_tasks WHERE id = $1 AND user_id = $2', [id, userId]);
  return (r.rowCount ?? 0) > 0;
}

export async function getTaskRuns(taskId: number, userId: number, limit = 20): Promise<TaskRun[]> {
  // Verify ownership
  const task = await getAITask(taskId, userId);
  if (!task) return [];

  const r = await query(
    'SELECT * FROM fg_ai_task_runs WHERE task_id = $1 ORDER BY created_at DESC LIMIT $2',
    [taskId, limit]
  );
  return r.rows.map(mapRun);
}

// ============ Execution Engine ============

/**
 * Check and run all due tasks (called by scheduler)
 */
export async function runDueTasks(): Promise<void> {
  const r = await query(
    `SELECT * FROM fg_ai_tasks WHERE enabled = TRUE AND next_run_at <= NOW()
     ORDER BY next_run_at ASC LIMIT 10`
  );

  for (const row of r.rows) {
    const task = mapTask(row);
    runTask(task).catch(err =>
      console.error(`[AITasks] Task ${task.id} failed:`, err.message)
    );
  }
}

/**
 * Run a single AI task
 */
export async function runTask(task: AITask): Promise<TaskRun> {
  const startTime = Date.now();
  let result = '';
  let entriesUsed = 0;
  let tokensUsed = 0;
  let error: string | null = null;

  try {
    // 1. Gather relevant entries
    const entries = await gatherEntries(task);
    entriesUsed = entries.length;

    if (entries.length === 0) {
      result = 'No matching entries found for this task.';
    } else {
      // 2. Build prompt with entry context
      const contextPrompt = buildContextPrompt(task.prompt, entries);

      // 3. Run AI
      const { getAIConfigForUser } = await import('./ai.js');
      const config = await getAIConfigForUser(task.userId);
      if (!config) {
        throw new Error('AI not configured. Please set up your AI provider in settings.');
      }

      const { generateText } = await import('ai');
      const { createOpenAI } = await import('@ai-sdk/openai');

      let model: any;
      if (config.provider === 'openai' || config.provider === 'ollama') {
        const openai = createOpenAI({
          apiKey: config.apiKey || 'ollama',
          baseURL: config.baseUrl || 'https://api.openai.com/v1',
        });
        model = openai(config.model || 'gpt-4o-mini');
      } else {
        const { anthropic } = await import('@ai-sdk/anthropic');
        model = anthropic(config.model || 'claude-3-5-haiku-20241022');
      }

      const aiResult = await generateText({
        model,
        prompt: contextPrompt,
        maxTokens: 4096,
        abortSignal: AbortSignal.timeout(120_000),
      });

      result = aiResult.text;
      tokensUsed = (aiResult.usage?.totalTokens) || 0;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    result = `Error: ${error}`;
  }

  const durationMs = Date.now() - startTime;

  // Store run result
  const runResult = await query(
    `INSERT INTO fg_ai_task_runs (task_id, result, entries_used, tokens_used, duration_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [task.id, result, entriesUsed, tokensUsed, durationMs, error]
  );

  // Update task metadata
  const nextRun = computeNextRun(task.schedule);
  await query(
    `UPDATE fg_ai_tasks SET last_run_at = NOW(), next_run_at = $1, last_result = $2, run_count = run_count + 1
     WHERE id = $3`,
    [nextRun, result.slice(0, 10000), task.id]
  );

  // Send notifications
  if (!error) {
    await sendNotifications(task, result);
  }

  console.log(`[AITasks] Task "${task.name}" completed: ${entriesUsed} entries, ${tokensUsed} tokens, ${durationMs}ms`);

  return mapRun(runResult.rows[0]);
}

// ============ Helpers ============

async function gatherEntries(task: AITask): Promise<Array<{ title: string; content: string; url: string; feedTitle: string; publishedAt: Date }>> {
  const opts = task.options;
  const maxEntries = opts.maxEntries || 50;
  const conditions: string[] = ['e.user_id = $1'];
  const params: any[] = [task.userId];
  let idx = 2;

  if (opts.onlyUnread) {
    conditions.push(`e.status = 'unread'`);
  }

  if (opts.feedIds && opts.feedIds.length > 0) {
    conditions.push(`e.feed_id = ANY($${idx++})`);
    params.push(opts.feedIds);
  }

  if (opts.categoryIds && opts.categoryIds.length > 0) {
    conditions.push(`f.category_id = ANY($${idx++})`);
    params.push(opts.categoryIds);
  }

  // Only entries since last run (or last 24h for first run)
  if (task.lastRunAt) {
    conditions.push(`e.published_at >= $${idx++}`);
    params.push(task.lastRunAt);
  } else {
    conditions.push(`e.published_at >= NOW() - INTERVAL '24 hours'`);
  }

  params.push(maxEntries);

  const r = await query(
    `SELECT e.title, e.content, e.url, e.published_at, f.title as feed_title
     FROM fg_entries e
     JOIN fg_feeds f ON e.feed_id = f.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.published_at DESC
     LIMIT $${idx}`,
    params
  );

  return r.rows.map((row: any) => ({
    title: row.title,
    content: row.content || '',
    url: row.url,
    feedTitle: row.feed_title,
    publishedAt: row.published_at,
  }));
}

function buildContextPrompt(
  userPrompt: string,
  entries: Array<{ title: string; content: string; url: string; feedTitle: string; publishedAt: Date }>
): string {
  const entrySummaries = entries.map((e, i) => {
    // Truncate content to avoid token overflow
    const truncated = e.content.length > 500 ? e.content.slice(0, 500) + '...' : e.content;
    return `[${i + 1}] ${e.title}\n   Source: ${e.feedTitle} | ${e.url}\n   ${truncated}`;
  }).join('\n\n');

  return `You are an AI assistant for an RSS reader. The user has configured the following task:

--- USER PROMPT ---
${userPrompt}
--- END PROMPT ---

Below are the ${entries.length} most recent entries matching the task scope:

${entrySummaries}

Based on the entries above, fulfill the user's request. Be concise and helpful. Use the entry numbers [1], [2] etc. to reference specific articles. Write in the same language as the user's prompt.`;
}

async function sendNotifications(task: AITask, result: string): Promise<void> {
  const channels = task.options.notifyChannels || ['in_app'];

  for (const channel of channels) {
    switch (channel) {
      case 'in_app':
        await query(
          `INSERT INTO fg_notifications (user_id, type, title, body)
           VALUES ($1, 'ai_task', $2, $3)`,
          [task.userId, `AI Task: ${task.name}`, result.slice(0, 5000)]
        );
        break;

      case 'webhook':
        if (task.options.webhookUrl) {
          try {
            await fetch(task.options.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'ai_task.completed',
                task: { id: task.id, name: task.name },
                result: result.slice(0, 10000),
                timestamp: new Date().toISOString(),
              }),
              signal: AbortSignal.timeout(10_000),
            });
          } catch { /* ignore webhook errors */ }
        }
        break;

      case 'email':
        // TODO: implement email notification (requires SMTP config)
        console.log(`[AITasks] Email notification not yet implemented`);
        break;
    }
  }
}

/**
 * Compute the next run time for a schedule
 */
function computeNextRun(schedule: TaskSchedule): Date | null {
  const now = new Date();

  switch (schedule.type) {
    case 'once': {
      if (!schedule.date) return null;
      const d = new Date(schedule.date);
      return d > now ? d : null; // Already passed
    }

    case 'daily': {
      if (!schedule.timeOfDay) return new Date(now.getTime() + 24 * 3600_000);
      const [h, m] = schedule.timeOfDay.split(':').map(Number);
      const next = new Date(now);
      next.setUTCHours(h, m, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }

    case 'weekly': {
      const targetDay = schedule.dayOfWeek ?? 1; // Monday default
      const [h, m] = (schedule.timeOfDay || '08:00').split(':').map(Number);
      const next = new Date(now);
      next.setUTCHours(h, m, 0, 0);
      const daysUntil = (targetDay - now.getUTCDay() + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntil);
      return next;
    }

    case 'monthly': {
      const targetDay = schedule.dayOfMonth ?? 1;
      const [h, m] = (schedule.timeOfDay || '08:00').split(':').map(Number);
      const next = new Date(now);
      next.setUTCDate(targetDay);
      next.setUTCHours(h, m, 0, 0);
      if (next <= now) next.setMonth(next.getMonth() + 1);
      return next;
    }

    default:
      return null;
  }
}

function mapTask(row: any): AITask {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    prompt: row.prompt,
    schedule: typeof row.schedule === 'string' ? JSON.parse(row.schedule) : row.schedule,
    options: typeof row.options === 'string' ? JSON.parse(row.options) : (row.options || { notifyChannels: ['in_app'] }),
    enabled: row.enabled,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastResult: row.last_result,
    runCount: row.run_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRun(row: any): TaskRun {
  return {
    id: row.id,
    taskId: row.task_id,
    result: row.result,
    entriesUsed: row.entries_used,
    tokensUsed: row.tokens_used,
    durationMs: row.duration_ms,
    error: row.error,
    createdAt: row.created_at,
  };
}
