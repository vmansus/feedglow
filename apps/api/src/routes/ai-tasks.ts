/**
 * AI Tasks Routes — Scheduled AI analysis CRUD + manual trigger
 */

import { Hono } from 'hono';
import { verifyToken } from '../lib/auth.js';
import {
  getAITasks, getAITask, createAITask, updateAITask,
  deleteAITask, getTaskRuns, runTask,
} from '../services/ai-tasks.js';

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

// GET /api/ai/tasks — List all tasks
app.get('/', async (c) => {
  const userId = c.get('userId' as any);
  const tasks = await getAITasks(userId);
  return c.json(tasks);
});

// GET /api/ai/tasks/:id — Get single task
app.get('/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const task = await getAITask(id, userId);
  if (!task) return c.json({ error: 'Task not found' }, 404);
  return c.json(task);
});

// POST /api/ai/tasks — Create task
app.post('/', async (c) => {
  const userId = c.get('userId' as any);
  const body = await c.req.json();

  const { name, prompt, schedule, options, enabled } = body;
  if (!name || !prompt || !schedule) {
    return c.json({ error: 'name, prompt, and schedule are required' }, 400);
  }

  // Validate schedule
  const validTypes = ['once', 'daily', 'weekly', 'monthly'];
  if (!validTypes.includes(schedule.type)) {
    return c.json({ error: `Invalid schedule type: ${schedule.type}` }, 400);
  }
  if (schedule.type === 'once' && !schedule.date) {
    return c.json({ error: 'once schedule requires date field' }, 400);
  }
  if (prompt.length > 2000) {
    return c.json({ error: 'Prompt must be under 2000 characters' }, 400);
  }

  const task = await createAITask(userId, { name, prompt, schedule, options, enabled });
  return c.json(task, 201);
});

// PUT /api/ai/tasks/:id — Update task
app.put('/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json();
  const task = await updateAITask(id, userId, body);
  if (!task) return c.json({ error: 'Task not found' }, 404);
  return c.json(task);
});

// DELETE /api/ai/tasks/:id — Delete task
app.delete('/:id', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const ok = await deleteAITask(id, userId);
  if (!ok) return c.json({ error: 'Task not found' }, 404);
  return c.json({ success: true });
});

// POST /api/ai/tasks/:id/run — Manually trigger a task
app.post('/:id/run', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const task = await getAITask(id, userId);
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const run = await runTask(task);
  return c.json(run);
});

// GET /api/ai/tasks/:id/runs — Get run history
app.get('/:id/runs', async (c) => {
  const userId = c.get('userId' as any);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const limit = parseInt(c.req.query('limit') || '20');
  const runs = await getTaskRuns(id, userId, limit);
  return c.json(runs);
});

export default app;
