/**
 * AI Task Scheduler
 * Checks for due AI tasks every 60 seconds
 */

import { runDueTasks } from '../services/ai-tasks.js';

let interval: ReturnType<typeof setInterval> | null = null;

export function startTaskScheduler(intervalMs = 60_000): void {
  if (interval) return;
  console.log(`[AITasks] Task scheduler started (interval: ${intervalMs / 1000}s)`);

  // Check every minute for due tasks
  interval = setInterval(() => {
    runDueTasks().catch(err =>
      console.error('[AITasks] Scheduler error:', err.message)
    );
  }, intervalMs);
}

export function stopTaskScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
