/**
 * Categories API Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getMinifluxClient } from '../lib/miniflux.js';

const categories = new Hono();

// List categories
categories.get('/', async (c) => {
  const client = getMinifluxClient();
  const categoryList = await client.getCategories();
  return c.json({ categories: categoryList });
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
    const client = getMinifluxClient();
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
    const client = getMinifluxClient();
    const category = await client.updateCategory(id, title);
    return c.json(category);
  }
);

// Delete category
categories.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const client = getMinifluxClient();
  await client.deleteCategory(id);
  return c.json({ success: true });
});

export default categories;
