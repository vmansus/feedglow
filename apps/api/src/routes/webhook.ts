/**
 * Webhook Routes
 * Handle webhook notifications for new entries
 */

import { Hono } from 'hono';
import { summarizeArticle, getDefaultAIConfig } from '../services/ai.js';
import { FeedEngineDataClient } from '../feed-engine/data-source.js';

const webhook = new Hono();

// Webhook secret for verification
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Webhook payload structure
interface WebhookPayload {
  event_type: 'new_entries' | 'save_entry';
  feed: {
    id: number;
    title: string;
    site_url: string;
    feed_url: string;
  };
  entries: Array<{
    id: number;
    title: string;
    url: string;
    content: string;
    author: string;
    published_at: string;
  }>;
}

// Auto-summarize setting
const AUTO_SUMMARIZE = process.env.AUTO_SUMMARIZE === 'true';

// Store for AI-generated summaries (in production, this would be in database)
const summaryStore = new Map<number, {
  summary: string;
  keyPoints: string[];
  generatedAt: string;
}>();

webhook.post('/new-entries', async (c) => {
  // Verify webhook secret if configured
  if (WEBHOOK_SECRET) {
    const providedSecret = c.req.header('X-Webhook-Secret');
    if (providedSecret !== WEBHOOK_SECRET) {
      console.log('[Webhook] Invalid or missing webhook secret');
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  const payload = await c.req.json<WebhookPayload>();

  console.log(`[Webhook] Received ${payload.event_type} from feed: ${payload.feed.title}`);
  console.log(`[Webhook] ${payload.entries.length} new entries`);

  // Process new entries
  if (payload.event_type === 'new_entries' && AUTO_SUMMARIZE) {
    const client = new FeedEngineDataClient(1); // Default user for webhook processing
    const config = getDefaultAIConfig();

    // Process entries in background (don't block webhook response)
    setImmediate(async () => {
      for (const entry of payload.entries) {
        try {
          const fullEntry = await client.getEntry(entry.id);
          const result = await summarizeArticle(fullEntry, config);
          
          summaryStore.set(entry.id, {
            summary: result.summary,
            keyPoints: result.keyPoints,
            generatedAt: new Date().toISOString(),
          });

          console.log(`[AI] Generated summary for entry ${entry.id}: ${entry.title.slice(0, 50)}...`);
        } catch (err) {
          console.error(`[AI] Failed to summarize entry ${entry.id}:`, err);
        }
      }
    });
  }

  return c.json({ status: 'ok', processed: payload.entries.length });
});

// Keep old endpoint for backward compatibility
webhook.post('/miniflux', async (c) => {
  // Redirect to new endpoint handler
  const payload = await c.req.json();
  return c.json({ status: 'ok', processed: payload.entries?.length || 0 });
});

// Get stored summary for an entry
webhook.get('/summaries/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const summary = summaryStore.get(id);

  if (!summary) {
    return c.json({ error: 'Summary not found' }, 404);
  }

  return c.json({ entryId: id, ...summary });
});

export default webhook;
