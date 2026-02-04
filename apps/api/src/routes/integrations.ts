/**
 * Integrations Routes (P2 #17)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { createMinifluxClient } from '../lib/miniflux.js';
import {
  getUserIntegrations,
  getIntegration,
  saveIntegration,
  deleteIntegration,
  saveToService,
  getSupportedServices,
} from '../services/integrations.js';

const integrations = new Hono();

integrations.use('*', authMiddleware);

// List supported services
integrations.get('/services', async (c) => {
  return c.json({ services: getSupportedServices() });
});

// List user's configured integrations
integrations.get('/', async (c) => {
  const user = c.get('user') as JWTPayload;
  const list = await getUserIntegrations(user.userId);
  
  // Mask sensitive fields
  const masked = list.map(i => ({
    ...i,
    config: Object.fromEntries(
      Object.entries(i.config).map(([k, v]) => [k, maskSensitive(k, v)])
    ),
  }));
  
  return c.json({ integrations: masked });
});

// Get specific integration
integrations.get('/:service', async (c) => {
  const user = c.get('user') as JWTPayload;
  const service = c.req.param('service');
  const integration = await getIntegration(user.userId, service);
  
  if (!integration) {
    return c.json({ error: 'Integration not configured' }, 404);
  }
  
  return c.json({
    ...integration,
    config: Object.fromEntries(
      Object.entries(integration.config).map(([k, v]) => [k, maskSensitive(k, v)])
    ),
  });
});

// Configure integration
const configSchema = z.object({
  enabled: z.boolean().optional().default(true),
  config: z.record(z.string()),
});

integrations.put('/:service', zValidator('json', configSchema), async (c) => {
  const user = c.get('user') as JWTPayload;
  const service = c.req.param('service');
  const { enabled, config } = c.req.valid('json');
  
  await saveIntegration(user.userId, service, enabled, config);
  return c.json({ success: true });
});

// Delete integration
integrations.delete('/:service', async (c) => {
  const user = c.get('user') as JWTPayload;
  const service = c.req.param('service');
  const deleted = await deleteIntegration(user.userId, service);
  if (!deleted) return c.json({ error: 'Integration not found' }, 404);
  return c.json({ success: true });
});

// Save entry to service
integrations.post('/:service/save/:entryId', async (c) => {
  const user = c.get('user') as JWTPayload;
  const service = c.req.param('service');
  const entryId = parseInt(c.req.param('entryId'));
  
  const integration = await getIntegration(user.userId, service);
  if (!integration || !integration.enabled) {
    return c.json({ error: 'Integration not configured or disabled' }, 400);
  }
  
  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  const client = createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });
  const entry = await client.getEntry(entryId);
  
  const result = await saveToService(service, integration.config, {
    title: entry.title,
    url: entry.url,
    content: entry.content,
    author: entry.author,
  });
  
  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }
  
  return c.json({ success: true, service });
});

// Test integration
integrations.post('/:service/test', async (c) => {
  const user = c.get('user') as JWTPayload;
  const service = c.req.param('service');
  
  const integration = await getIntegration(user.userId, service);
  if (!integration) {
    return c.json({ error: 'Integration not configured' }, 400);
  }
  
  const result = await saveToService(service, integration.config, {
    title: '🧪 FeedGlow Integration Test',
    url: 'https://feedglow.vmansus.top',
  });
  
  return c.json(result);
});

function maskSensitive(key: string, value: string): string {
  const sensitiveKeys = ['token', 'key', 'secret', 'password', 'access_token', 'api_key', 'consumer_key', 'bot_token'];
  if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
    if (value.length <= 8) return '****';
    return value.slice(0, 4) + '****' + value.slice(-4);
  }
  return value;
}

export default integrations;
