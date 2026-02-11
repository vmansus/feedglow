/**
 * Twitter API Routes
 * Proxy for fetching tweet data to avoid CORS
 * Falls back to local fg_entries (RSS data) when syndication API fails
 */

import { Hono } from 'hono';
import { query } from '../lib/db.js';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';

const app = new Hono();

interface TwitterOEmbed {
  url: string;
  author_name: string;
  author_url: string;
  html: string;
  width: number;
  height: number | null;
  type: string;
  cache_age: string;
  provider_name: string;
  provider_url: string;
  version: string;
}

// Get oEmbed data for a tweet
app.get('/oembed', async (c) => {
  const url = c.req.query('url');
  
  if (!url) {
    return c.json({ error: 'URL is required' }, 400);
  }

  // Validate it's a Twitter/X URL
  if (!url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/)) {
    return c.json({ error: 'Invalid Twitter URL' }, 400);
  }

  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true`;
    const res = await fetch(oembedUrl);
    
    if (!res.ok) {
      return c.json({ error: 'Failed to fetch tweet' }, res.status);
    }

    const data: TwitterOEmbed = await res.json();
    return c.json(data);
  } catch (err) {
    console.error('[Twitter] oEmbed fetch error:', err);
    return c.json({ error: 'Failed to fetch tweet data' }, 500);
  }
});

// Extract tweet ID from URL
function getTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Parse RSS entry HTML content to extract text, images, and links
 */
function parseEntryContent(html: string): { text: string; images: string[]; links: string[] } {
  const images: string[] = [];
  const links: string[] = [];

  // Extract images
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const src = imgMatch[1];
    if (src && !src.startsWith('data:') && !src.includes('emoji')) {
      images.push(src);
    }
  }

  // Extract links (non-twitter)
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const href = linkMatch[1];
    if (href && !href.includes('twitter.com') && !href.includes('x.com') && !href.startsWith('#')) {
      links.push(href);
    }
  }

  // Strip HTML to get plain text
  const text = html
    .replace(/<video[^>]*>.*?<\/video>/gis, '')  // Remove video tags
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, images, links };
}

// Get tweet data — tries syndication API first, falls back to local RSS entries
app.get('/tweet/:id', async (c) => {
  const tweetId = c.req.param('id');
  
  // 1. Try syndication API (public, no auth needed)
  try {
    const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=0`;
    const res = await fetch(syndicationUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedGlow/1.0)' },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.text) {
          return c.json({
            id: tweetId,
            text: data.text,
            author: {
              name: data.user?.name,
              username: data.user?.screen_name,
              avatar: data.user?.profile_image_url_https?.replace('_normal', '_400x400'),
              verified: data.user?.verified || data.user?.is_blue_verified,
            },
            createdAt: data.created_at,
            media: data.mediaDetails?.map((m: any) => ({
              type: m.type,
              url: m.media_url_https,
              width: m.original_info?.width,
              height: m.original_info?.height,
            })),
            stats: {
              replies: data.reply_count,
              retweets: data.retweet_count,
              likes: data.favorite_count,
              views: data.views?.count,
            },
            quotedTweet: data.quoted_tweet ? {
              id: data.quoted_tweet.id_str,
              text: data.quoted_tweet.text,
              author: {
                name: data.quoted_tweet.user?.name,
                username: data.quoted_tweet.user?.screen_name,
                avatar: data.quoted_tweet.user?.profile_image_url_https,
              },
            } : null,
            source: 'syndication',
          });
        }
      }
    }
  } catch (err) {
    // Syndication failed, fall through to local lookup
    console.log(`[Twitter] Syndication unavailable for ${tweetId}, checking local entries`);
  }

  // 2. Fallback: look up in fg_entries (RSS data from RSSHub)
  try {
    const result = await query(
      `SELECT title, content, author, url, published_at, enclosure_url, enclosure_type
       FROM fg_entries WHERE url LIKE $1
       ORDER BY created_at DESC LIMIT 1`,
      [`%/status/${tweetId}%`]
    );

    if (result.rows.length > 0) {
      const entry = result.rows[0];
      const { text, images, links } = parseEntryContent(entry.content || '');

      // Parse author from entry (RSSHub typically gives "Author Name")
      const authorName = entry.author || entry.title?.split(':')[0]?.trim() || '';
      // Try to extract username from URL (e.g., https://x.com/sama/status/123)
      const urlMatch = entry.url?.match(/(?:twitter\.com|x\.com)\/(\w+)\/status/);
      const username = urlMatch ? urlMatch[1] : authorName.toLowerCase().replace(/\s+/g, '');

      // Build media array from images in content + enclosure
      const media: { type: string; url: string }[] = [];
      if (entry.enclosure_url && entry.enclosure_type?.startsWith('image')) {
        media.push({ type: 'photo', url: entry.enclosure_url });
      }
      images.forEach(img => {
        if (!media.some(m => m.url === img)) {
          media.push({ type: 'photo', url: img });
        }
      });

      console.log(`[Twitter] Found tweet ${tweetId} in local RSS entries`);

      return c.json({
        id: tweetId,
        text,
        author: {
          name: authorName,
          username,
        },
        createdAt: entry.published_at,
        media: media.length > 0 ? media : undefined,
        url: entry.url,
        source: 'rss',
      });
    }
  } catch (err) {
    console.warn('[Twitter] Local entry lookup failed:', (err as Error).message);
  }

  // 3. Nothing found
  return c.json({
    id: tweetId,
    url: `https://x.com/i/status/${tweetId}`,
    error: 'Could not fetch tweet details',
  });
});

export default app;
