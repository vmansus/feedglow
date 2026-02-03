import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (to be implemented by Chad)
app.get('/api/v1/feeds', (c) => {
  // TODO: Implement Miniflux integration
  return c.json({ feeds: [], total: 0 });
});

app.get('/api/v1/entries', (c) => {
  // TODO: Implement Miniflux integration
  return c.json({ entries: [], total: 0 });
});

app.post('/api/v1/ai/summarize', (c) => {
  // TODO: Implement AI summarization
  return c.json({ error: 'Not implemented' }, 501);
});

app.post('/api/v1/ai/translate', (c) => {
  // TODO: Implement AI translation
  return c.json({ error: 'Not implemented' }, 501);
});

// Miniflux webhook receiver
app.post('/api/webhook/miniflux', (c) => {
  // TODO: Handle Miniflux webhook
  return c.json({ received: true });
});

const port = process.env.PORT || 3001;
console.log(`🚀 FeedGlow API running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
