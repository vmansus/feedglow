/**
 * FeedGlow API Server
 * Lightweight AI-enhanced RSS reader backend
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { runMigrations } from './lib/db.js';

// Routes
import feeds from './routes/feeds.js';
import entries from './routes/entries.js';
import categories from './routes/categories.js';
import webhook from './routes/webhook.js';
import settings from './routes/settings.js';
import opml from './routes/opml.js';
import events from './routes/events.js';
import discover from './routes/discover.js';
import stats from './routes/stats.js';
import knowledge from './routes/knowledge.js';
import tags from './routes/tags.js';
import shares from './routes/shares.js';
import digest from './routes/digest.js';
import notifications from './routes/notifications.js';
import exports_ from './routes/exports.js';
import integrations from './routes/integrations.js';
import aiFilters from './routes/ai-filters.js';
import podcast from './routes/podcast.js';
import retention from './routes/retention.js';
import backfill from './routes/backfill.js';
import proxy from './routes/proxy.js';
import saved from './routes/saved.js';
import actions from './routes/actions.js';
import aiTasks from './routes/ai-tasks.js';
import twitter from './routes/twitter.js';
import feedSources from './routes/feed-sources.js';
import { fever, feverSetup } from './routes/fever.js';
import telegram from './routes/telegram.js';
import interests from './routes/interests.js';
import clipperAi from './routes/clipper-ai.js';
import filters from './routes/filters.js';
import notificationChannels from './routes/notification-channels.js';
import highlights from './routes/highlights.js';
import sharedFeeds from './routes/shared-feeds.js';
import watch from './routes/watch.js';
import newsletter from './routes/newsletter.js';
import googleNews from './routes/google-news.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow specific origins
      const extraOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
      const allowed = [
        'http://localhost:3000',
        'http://localhost:3001',
        ...extraOrigins,
      ];
      if (!origin || allowed.includes(origin)) return origin || '*';
      // Allow Chrome extensions
      if (origin.startsWith('chrome-extension://')) return origin;
      // Allow moz-extension for Firefox
      if (origin.startsWith('moz-extension://')) return origin;
      return null;
    },
    credentials: true,
  })
);

// Health check
app.get('/health', async (c) => {
  try {
    const { query } = await import('./lib/db.js');
    await query('SELECT 1');
    return c.json({
      status: 'ok',
      mode: 'feed-engine',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return c.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      503
    );
  }
});

// Public config (for frontend to use self-hosted RSSHub instance)
app.get('/api/config', (c) => {
  return c.json({
    rsshubUrl: process.env.RSSHUB_URL || 'https://rsshub.app',
  });
});

// API info
app.get('/', (c) => {
  return c.json({
    name: 'FeedGlow API',
    version: '0.3.0',
    endpoints: {
      health: 'GET /health',
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
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
      opml: {
        export: 'GET /api/opml/export',
        import: 'POST /api/opml/import',
      },
    },
  });
});

// Auth routes (Feed Engine)
const { authRoutes, startScheduler, startTaskScheduler } = await import('./feed-engine/index.js');
app.route('/api/auth', authRoutes);

// Start feed polling scheduler + AI task scheduler
startScheduler(60_000);
startTaskScheduler(60_000);

// Collections auto-sync: every 24 hours
import { syncAllCollections } from './services/collections-sync.js';
const COLLECTIONS_SYNC_INTERVAL = 24 * 3600_000; // 24h
async function runCollectionsSync() {
  try {
    // Use userId=1 (admin) for syncing public collections
    const result = await syncAllCollections(1);
    console.log(`[Collections] Auto-sync done: awesome=${result.awesome.synced}/${result.awesome.feeds}, rsshub=${result.rsshub.synced}/${result.rsshub.feeds}`);
  } catch (err) {
    console.warn('[Collections] Auto-sync failed:', err instanceof Error ? err.message : err);
  }
}
// Run first sync 30s after startup, then every 24h
setTimeout(runCollectionsSync, 30_000);
setInterval(runCollectionsSync, COLLECTIONS_SYNC_INTERVAL);

// Page watcher: check due pages every 5 minutes
import { checkAllDuePages } from './services/page-watcher.js';
setInterval(async () => {
  try { await checkAllDuePages(); } catch (e) { console.warn('[PageWatcher] Error:', e); }
}, 5 * 60_000);

// Core routes
app.route('/api/feeds', feeds);
app.route('/api/entries', entries);
app.route('/api/categories', categories);
app.route('/api/settings', settings);
app.route('/api/opml', opml);
app.route('/api/events', events);
app.route('/api/discover', discover);
app.route('/api/stats', stats);
app.route('/api/knowledge', knowledge);
app.route('/api/tags', tags);
app.route('/api/shared', shares);
app.route('/api/digest', digest);
app.route('/api/notifications', notifications);
app.route('/api/export', exports_);
app.route('/api/integrations', integrations);
app.route('/api/ai/filters', aiFilters);
app.route('/api/podcast', podcast);
app.route('/api/retention', retention);
app.route('/api/backfill', backfill);
app.route('/api/saved', saved);
app.route('/api/actions', actions);
app.route('/api/ai/tasks', aiTasks);
app.route('/api/twitter', twitter);   // Twitter embed proxy
app.route('/api/proxy', proxy);               // Media proxy (Twitter videos)
app.route('/api/feed-sources', feedSources);  // External feed sources
app.route('/fever', fever);           // Fever API: POST /fever/?api
app.route('/api/fever', feverSetup);  // Fever setup: POST /api/fever/setup
app.route('/api/webhook', webhook);
app.route('/api/telegram', telegram);
app.route('/api/interests', interests);
app.route('/api/ai/content', clipperAi);
app.route('/api/filters', filters);
app.route('/api/notification-channels', notificationChannels);
app.route('/api/highlights', highlights);
app.route('/api/shared-feeds', sharedFeeds);
app.route('/api/watch', watch);
app.route('/api/newsletter', newsletter);
app.route('/api/google-news', googleNews);

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

async function start() {
  // Run database migrations
  try {
    await runMigrations();
    // Ensure newsletter tables exist
    const { ensureNewsletterTables } = await import('./services/newsletter.js');
    await ensureNewsletterTables();
    
    // Start Twitter token auto-refresh scheduler (check every 6 hours)
    const { startAutoRefreshScheduler } = await import('./services/twitter-token-refresh.js');
    startAutoRefreshScheduler();
  } catch (err) {
    console.error('[DB] Migration failed:', err instanceof Error ? err.message : err);
    console.warn('[DB] Continuing without PostgreSQL — some features may be unavailable');
  }

  console.log(`
🌟 FeedGlow API Server
━━━━━━━━━━━━━━━━━━━━━━
Port: ${port}
Mode: 🚀 Feed Engine
Database: PostgreSQL
━━━━━━━━━━━━━━━━━━━━━━
  `);

  serve({
    fetch: app.fetch,
    port,
  });
}

start();
