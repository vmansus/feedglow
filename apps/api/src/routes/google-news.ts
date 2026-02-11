/**
 * Google News Search API
 * Uses Google News RSS feeds to search for news articles
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import RssParser from 'rss-parser';

const googleNews = new Hono();
googleNews.use('*', authMiddleware);

// Google News title format: "Article Title - Source" → extract source
function extractSource(title?: string): string {
  if (!title) return '';
  const parts = title.split(' - ');
  return parts.length > 1 ? parts[parts.length - 1].trim() : '';
}

// Strip source suffix from title
function cleanTitle(title?: string): string {
  if (!title) return '';
  const parts = title.split(' - ');
  if (parts.length > 1) {
    return parts.slice(0, -1).join(' - ').trim();
  }
  return title;
}

const LOCALE_MAP: Record<string, { gl: string; ceid: string }> = {
  'zh-CN': { gl: 'CN', ceid: 'CN:zh-Hans' },
  'zh-TW': { gl: 'TW', ceid: 'TW:zh-Hant' },
  'en-US': { gl: 'US', ceid: 'US:en' },
  'en-GB': { gl: 'GB', ceid: 'GB:en' },
  'ja':    { gl: 'JP', ceid: 'JP:ja' },
};

googleNews.get('/search', async (c) => {
  const q = c.req.query('q');
  const hl = c.req.query('hl') || 'en-US';
  const locale = LOCALE_MAP[hl] || LOCALE_MAP['en-US'];

  if (!q) {
    return c.json({ error: 'query required' }, 400);
  }

  try {
    const parser = new RssParser();
    const feed = await parser.parseURL(
      `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${locale.gl}&ceid=${locale.ceid}`
    );

    const items = feed.items.map(item => ({
      title: cleanTitle(item.title),
      url: item.link,
      source: item.creator || extractSource(item.title),
      publishedAt: item.pubDate || item.isoDate || '',
      snippet: item.contentSnippet || item.content || '',
    }));

    return c.json({ query: q, items });
  } catch (err) {
    console.error('[GoogleNews] Search failed:', err);
    return c.json({ error: 'Failed to fetch Google News results', query: q, items: [] }, 502);
  }
});

// ============ Google News URL Decoder ============
// Based on: https://github.com/SSujitX/google-news-url-decoder

import { extractContent } from '../services/readability.js';

/**
 * Extract the base64 article ID from a Google News URL.
 */
function extractBase64(gnUrl: string): string | null {
  try {
    const url = new URL(gnUrl);
    if (url.hostname !== 'news.google.com') return null;
    const parts = url.pathname.split('/');
    const idx = parts.findIndex(p => p === 'articles' || p === 'read');
    if (idx >= 0 && parts[idx + 1]) {
      // Remove query string that might be appended
      return parts[idx + 1].split('?')[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch decoding params (signature + timestamp) from Google News page.
 */
async function getDecodingParams(base64Str: string): Promise<{ signature: string; timestamp: string } | null> {
  const urls = [
    `https://news.google.com/articles/${base64Str}`,
    `https://news.google.com/rss/articles/${base64Str}`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      if (!resp.ok) continue;
      const html = await resp.text();

      // Extract data-n-a-sg and data-n-a-ts from the HTML
      const sigMatch = html.match(/data-n-a-sg="([^"]+)"/);
      const tsMatch = html.match(/data-n-a-ts="([^"]+)"/);

      if (sigMatch && tsMatch) {
        return { signature: sigMatch[1], timestamp: tsMatch[1] };
      }
    } catch { /* try next URL */ }
  }
  return null;
}

/**
 * Decode the actual URL using Google's batchexecute API.
 */
async function decodeGoogleNewsUrl(base64Str: string, signature: string, timestamp: string): Promise<string | null> {
  try {
    const url = 'https://news.google.com/_/DotsSplashUi/data/batchexecute';
    const payload = [
      'Fbv4je',
      `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${base64Str}",${timestamp},"${signature}"]`,
    ];

    const body = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return null;
    const text = await resp.text();

    // Response format: first line is length, second line is JSON data
    const parts = text.split('\n\n');
    if (parts.length < 2) return null;

    const parsed = JSON.parse(parts[1]);
    // Remove trailing metadata
    const data = parsed.slice(0, -2);
    const innerData = JSON.parse(data[0][2]);
    return innerData[1] || null;
  } catch (err) {
    console.error('[GoogleNews] Decode failed:', err);
    return null;
  }
}

/**
 * Resolve a Google News URL to the actual article URL.
 */
async function resolveGoogleNewsUrl(gnUrl: string): Promise<string> {
  const base64Str = extractBase64(gnUrl);
  if (!base64Str) return gnUrl;

  const params = await getDecodingParams(base64Str);
  if (!params) return gnUrl;

  const decoded = await decodeGoogleNewsUrl(base64Str, params.signature, params.timestamp);
  return decoded || gnUrl;
}

// Fetch article content (resolve redirect → readability extract)
googleNews.get('/article', async (c) => {
  const url = c.req.query('url');
  if (!url) {
    return c.json({ error: 'url required' }, 400);
  }

  try {
    // Resolve Google News redirect
    const realUrl = url.includes('news.google.com')
      ? await resolveGoogleNewsUrl(url)
      : url;

    // Extract article content
    const content = await extractContent(realUrl);

    return c.json({
      url: realUrl,
      originalUrl: url,
      title: content.title,
      content: content.content,
      excerpt: content.excerpt,
    });
  } catch (err) {
    console.error('[GoogleNews] Article fetch failed:', err);
    return c.json({ error: 'Failed to fetch article', url }, 502);
  }
});

// Try to find RSS feed for a source by domain
googleNews.get('/find-feed', async (c) => {
  const source = c.req.query('source');
  const articleUrl = c.req.query('url');

  if (!source && !articleUrl) {
    return c.json({ error: 'source or url required' }, 400);
  }

  try {
    // Resolve the article URL to get the domain
    let domain = '';
    if (articleUrl) {
      const realUrl = articleUrl.includes('news.google.com')
        ? await resolveGoogleNewsUrl(articleUrl)
        : articleUrl;
      try {
        const parsed = new URL(realUrl);
        domain = parsed.hostname;
      } catch {}
    }

    // Skip aggregator domains — we want the actual source, not Google News itself
    const skipDomains = ['news.google.com', 'google.com', 'consent.google.com'];
    if (skipDomains.some(d => domain.includes(d))) {
      return c.json({ feeds: [], source, domain, message: 'Aggregator domain, cannot resolve actual source' });
    }

    // Try common RSS feed patterns
    const feedPatterns = [
      '/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml',
      '/feeds/posts/default', '/blog/feed', '/blog/rss',
      '/index.xml', '/.rss',
    ];

    if (!domain) {
      return c.json({ feeds: [], source, message: 'Could not resolve domain' });
    }

    const baseUrl = `https://${domain}`;
    const parser = new RssParser();
    const foundFeeds: { url: string; title: string }[] = [];

    // First: try to find feed links in the homepage HTML
    try {
      const homeResp = await fetch(baseUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedGlow/1.0)' },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      const html = await homeResp.text();
      // Look for <link rel="alternate" type="application/rss+xml" ...>
      const feedLinkRegex = /<link[^>]+type=["'](application\/rss\+xml|application\/atom\+xml|application\/feed\+json)["'][^>]*>/gi;
      let match;
      while ((match = feedLinkRegex.exec(html)) !== null) {
        const hrefMatch = match[0].match(/href=["']([^"']+)["']/);
        const titleMatch = match[0].match(/title=["']([^"']+)["']/);
        if (hrefMatch) {
          let feedUrl = hrefMatch[1];
          if (feedUrl.startsWith('/')) feedUrl = baseUrl + feedUrl;
          foundFeeds.push({
            url: feedUrl,
            title: titleMatch ? titleMatch[1] : source || domain,
          });
        }
      }
    } catch { /* homepage fetch failed */ }

    if (foundFeeds.length > 0) {
      return c.json({ feeds: foundFeeds, source, domain });
    }

    // Fallback: try common patterns
    for (const pattern of feedPatterns) {
      const feedUrl = baseUrl + pattern;
      try {
        const feed = await parser.parseURL(feedUrl);
        if (feed && feed.items && feed.items.length > 0) {
          foundFeeds.push({
            url: feedUrl,
            title: feed.title || source || domain,
          });
          break; // One is enough
        }
      } catch { /* not a feed */ }
    }

    return c.json({ feeds: foundFeeds, source, domain });
  } catch (err) {
    console.error('[GoogleNews] Find feed failed:', err);
    return c.json({ feeds: [], source, error: 'Failed to discover feeds' });
  }
});

export default googleNews;
