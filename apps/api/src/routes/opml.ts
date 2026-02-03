/**
 * OPML Import/Export Routes
 */

import { Hono } from 'hono';
import { authMiddleware } from '../lib/auth.js';

const opml = new Hono();

// All routes require authentication
opml.use('*', authMiddleware);

/**
 * Export OPML
 * GET /api/opml/export
 */
opml.get('/export', async (c) => {
  const { miniflux } = c.var;

  try {
    const response = await fetch(`${miniflux.baseUrl}/v1/export`, {
      headers: {
        'X-Auth-Token': miniflux.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return c.json({ error: `Miniflux error: ${error}` }, response.status as 400);
    }

    const opmlContent = await response.text();

    // Return as downloadable file
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
  const { miniflux } = c.var;

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

    // Send to Miniflux
    const response = await fetch(`${miniflux.baseUrl}/v1/import`, {
      method: 'POST',
      headers: {
        'X-Auth-Token': miniflux.apiKey,
        'Content-Type': 'application/xml',
      },
      body: opmlContent,
    });

    if (!response.ok) {
      const error = await response.text();
      return c.json({ error: `Miniflux import error: ${error}` }, response.status as 400);
    }

    const result = await response.json();

    return c.json({
      success: true,
      message: result.message || 'OPML imported successfully',
    });
  } catch (error) {
    console.error('OPML import error:', error);
    return c.json({ error: 'Failed to import OPML' }, 500);
  }
});

export default opml;
