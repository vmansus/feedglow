/**
 * FeedGlow API Server
 * Lightweight AI-enhanced RSS reader backend
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { getMinifluxClient } from './lib/miniflux.js';

// Routes
import feeds from './routes/feeds.js';
import entries from './routes/entries.js';
import categories from './routes/categories.js';
import webhook from './routes/webhook.js';
import auth from './routes/auth.js';
import settings from './routes/settings.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://feedglow.vmansus.top',
    ],
    credentials: true,
  })
);

// Health check
app.get('/health', async (c) => {
  try {
    const client = getMinifluxClient();
    const health = await client.healthcheck();
    return c.json({
      status: 'ok',
      miniflux: health,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return c.json(
      {
        status: 'error',
        miniflux: 'unreachable',
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      503
    );
  }
});

// API info
app.get('/', (c) => {
  return c.json({
    name: 'FeedGlow API',
    version: '0.2.0',
    endpoints: {
      health: 'GET /health',
      auth: {
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        verify: 'POST /api/auth/verify',
        logout: 'POST /api/auth/logout',
      },
      settings: {
        get: 'GET /api/settings',
        update: 'PUT /api/settings',
        patch: 'PATCH /api/settings/:section',
        reset: 'DELETE /api/settings',
      },
      feeds: 'GET /api/feeds',
      entries: 'GET /api/entries',
      categories: 'GET /api/categories',
      webhook: 'POST /api/webhook/miniflux',
    },
  });
});

// Mount routes
app.route('/api/auth', auth);
app.route('/api/settings', settings);
app.route('/api/feeds', feeds);
app.route('/api/entries', entries);
app.route('/api/categories', categories);
app.route('/api/webhook', webhook);

// Error handler
app.onError((err, c) => {
  console.error(`[Error] ${err.message}`);
  return c.json(
    {
      error: err.message,
      status: 'error',
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      path: c.req.path,
    },
    404
  );
});

// Start server
const port = parseInt(process.env.PORT || '3001');

console.log(`
🌟 FeedGlow API Server
━━━━━━━━━━━━━━━━━━━━━━
Port: ${port}
Miniflux: ${process.env.MINIFLUX_URL || 'Not configured'}
AI Provider: ${process.env.AI_PROVIDER || 'openai'}
━━━━━━━━━━━━━━━━━━━━━━
`);

serve({
  fetch: app.fetch,
  port,
});
