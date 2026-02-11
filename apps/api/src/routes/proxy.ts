/**
 * Media proxy — streams Twitter videos/images through our server
 * to bypass CORS restrictions on video.twimg.com / pbs.twimg.com
 */

import { Hono } from 'hono';

const proxy = new Hono();

// Allowed domains for proxying (security: don't become an open proxy)
const ALLOWED_DOMAINS = [
  'video.twimg.com',
  'pbs.twimg.com',
  'abs.twimg.com',
  'ton.twimg.com',
];

proxy.get('/media', async (c) => {
  const url = c.req.query('url');
  if (!url) {
    return c.json({ error: 'Missing url parameter' }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  // Security: only proxy allowed domains
  if (!ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
    return c.json({ error: 'Domain not allowed' }, 403);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://x.com/',
        'Origin': 'https://x.com',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return c.json({ error: `Upstream returned ${response.status}` }, response.status as any);
    }

    // Forward content type and content length
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400', // Cache 24h
      'Access-Control-Allow-Origin': '*',
    };
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    // Support range requests for video seeking
    const range = c.req.header('range');
    if (range) {
      const rangeResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://x.com/',
          'Origin': 'https://x.com',
          'Range': range,
        },
        redirect: 'follow',
      });
      
      const rangeHeaders: Record<string, string> = {
        'Content-Type': rangeResponse.headers.get('content-type') || contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      };
      const contentRange = rangeResponse.headers.get('content-range');
      if (contentRange) rangeHeaders['Content-Range'] = contentRange;
      const rangeLength = rangeResponse.headers.get('content-length');
      if (rangeLength) rangeHeaders['Content-Length'] = rangeLength;
      rangeHeaders['Accept-Ranges'] = 'bytes';

      return new Response(rangeResponse.body, {
        status: 206,
        headers: rangeHeaders,
      });
    }

    headers['Accept-Ranges'] = 'bytes';
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy fetch failed';
    console.error('[Proxy] Error:', message);
    return c.json({ error: message }, 502);
  }
});

export default proxy;
