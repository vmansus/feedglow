/**
 * OPML Import/Export Routes
 */

import { Hono } from 'hono';
import { authMiddleware } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';

const opml = new Hono();

// All routes require authentication
opml.use('*', authMiddleware);

/**
 * Export OPML
 * GET /api/opml/export
 * Optional query: ?feedIds=1,2,3 or ?categoryIds=1,2,3 to filter
 */
opml.get('/export', async (c) => {
  try {
    const client = getDataClient(c);
    const feedIdsParam = c.req.query('feedIds');
    const categoryIdsParam = c.req.query('categoryIds');

    let feedIds: number[] | undefined;
    let categoryIds: number[] | undefined;

    if (feedIdsParam) {
      feedIds = feedIdsParam.split(',').map(Number).filter(n => !isNaN(n));
    }
    if (categoryIdsParam) {
      categoryIds = categoryIdsParam.split(',').map(Number).filter(n => !isNaN(n));
    }

    const opmlContent = await client.exportOPML(feedIds, categoryIds);

    c.header('Content-Type', 'application/xml');
    c.header('Content-Disposition', 'attachment; filename="feedglow-subscriptions.opml"');
    return c.body(opmlContent);
  } catch (error) {
    console.error('OPML export error:', error);
    return c.json({ error: 'Failed to export OPML' }, 500);
  }
});

/**
 * Import OPML
 * POST /api/opml/import
 * Body: multipart/form-data with 'file' field containing OPML file
 */
opml.post('/import', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No OPML file provided' }, 400);
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.opml') && !fileName.endsWith('.xml')) {
      return c.json({ error: 'Invalid file type. Please upload an OPML or XML file.' }, 400);
    }

    const opmlContent = await file.text();

    // Validate it looks like OPML
    if (!opmlContent.includes('<opml') && !opmlContent.includes('<outline')) {
      return c.json({ error: 'Invalid OPML format' }, 400);
    }

    const client = getDataClient(c);
    const result = await client.importOPML(opmlContent);
    return c.json({
      success: true,
      message: `Imported ${result.imported} feeds (${result.failed} failed)`,
      imported: result.imported,
      failed: result.failed,
    });
  } catch (error) {
    console.error('OPML import error:', error);
    return c.json({ error: 'Failed to import OPML' }, 500);
  }
});

export default opml;
