/**
 * Categories API Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createMinifluxClient } from '../lib/miniflux.js';
import { authMiddleware } from '../lib/auth.js';

const categories = new Hono();

// Apply auth middleware to all categories routes
categories.use('*', authMiddleware);

// Helper to get client from context
function getClient(c: any) {
  const minifluxUrl = c.get('minifluxUrl');
  const minifluxApiKey = c.get('minifluxApiKey');
  return createMinifluxClient({ baseUrl: minifluxUrl, apiKey: minifluxApiKey });
}

// List categories
categories.get('/', async (c) => {
  const client = getClient(c);
  const categoryList = await client.getCategories();
  return c.json(categoryList);
});

// Create category
const createCategorySchema = z.object({
  title: z.string().min(1).max(255),
});

categories.post(
  '/',
  zValidator('json', createCategorySchema),
  async (c) => {
    const { title } = c.req.valid('json');
    const client = getClient(c);
    const category = await client.createCategory(title);
    return c.json(category, 201);
  }
);

// Update category
categories.patch(
  '/:id',
  zValidator('json', createCategorySchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const { title } = c.req.valid('json');
    const client = getClient(c);
    const category = await client.updateCategory(id, title);
    return c.json(category);
  }
);

// Delete category
categories.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.deleteCategory(id);
  return c.json({ success: true });
});

export default categories;
