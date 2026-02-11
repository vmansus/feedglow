/**
 * Categories API Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDataClient } from '../feed-engine/data-source.js';
import { authMiddleware } from '../lib/auth.js';

const categories = new Hono();

// Apply auth middleware to all categories routes
categories.use('*', authMiddleware);

// Helper to get data client (works with both Miniflux and Feed Engine)
function getClient(c: any) {
  return getDataClient(c);
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
  parentId: z.number().optional(),
  parent_id: z.number().optional(),
});

categories.post(
  '/',
  zValidator('json', createCategorySchema),
  async (c) => {
    const data = c.req.valid('json');
    const parentId = data.parentId || data.parent_id;
    const client = getClient(c);
    const category = await client.createCategory(data.title, parentId);
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

// Mark all category entries as read
categories.post('/:id/mark-read', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.markCategoryEntriesAsRead(id);
  return c.json({ success: true });
});

// Delete category
categories.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getClient(c);
  await client.deleteCategory(id);
  return c.json({ success: true });
});

export default categories;
