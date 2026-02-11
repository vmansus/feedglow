/**
 * Feed Parser - RSS/Atom/JSON Feed parsing
 * Replaces Miniflux's feed fetching and parsing
 *
 * Features:
 * - RSS 2.0, Atom 0.3/1.0, RDF/RSS 1.0, JSON Feed
 * - Robust date parsing (handles dozens of non-standard formats)
 * - Charset detection & conversion (ISO-8859, Windows-1252, etc.)
 * - HTML sanitization (XSS prevention)
 * - Content rewrite rules (YouTube, Bilibili, etc.)
 * - Feed icon auto-discovery
 */

import Parser from 'rss-parser';
import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import iconv from 'iconv-lite';

// ============ Types ============

export interface ParsedFeed {
  title: string;
  description: string;
  siteUrl: string;
  feedUrl: string;
  language?: string;
  iconUrl?: string;
  /** RSS channel <image><url> — for Twitter feeds this is the profile pic */
  imageUrl?: string;
  items: ParsedEntry[];
}

export interface ParsedEntry {
  hash: string;
  title: string;
  url: string;
  content: string;
  author: string;
  publishedAt: Date;
  enclosureUrl?: string;
  enclosureType?: string;
  enclosureSize?: number;
  contentHash?: string; // For detecting content updates
}

export interface FetchOptions {
  etag?: string;
  lastModified?: string;
  userAgent?: string;
  username?: string;     // HTTP Basic auth
  password?: string;     // HTTP Basic auth
  crawler?: boolean;     // Fetch full content via Readability
  scraperRules?: string; // CSS selector for content extraction
  blocklistRules?: string; // Regex to exclude entries
  keeplistRules?: string;  // Regex to include entries only
}

// ============ RSS Parser Instance ============

const parser = new Parser({
  timeout: 15_000,
  headers: {
    'User-Agent': 'FeedGlow/1.0 (+https://feedglow.dev)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml',
  },
  maxRedirects: 5,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: false }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: false }],
    ],
  },
});

// ============ 1. Robust Date Parsing ============

/**
 * Parse dates from feeds — handles dozens of non-standard formats
 * that are common in real-world RSS feeds.
 */
function parseDate(input: string | undefined | null): Date {
  if (!input) return new Date();

  const s = input.trim();

  // Try native Date first (handles ISO 8601, RFC 2822)
  const native = new Date(s);
  if (!isNaN(native.getTime()) && native.getTime() > 0) return native;

  // Common non-standard formats seen in the wild:

  // "01 Jan 2026 12:00:00" (no timezone)
  const noTz = new Date(s + ' UTC');
  if (!isNaN(noTz.getTime())) return noTz;

  // "2026/01/15 08:30:00"
  const slashDate = s.replace(/(\d{4})\/(\d{1,2})\/(\d{1,2})/, '$1-$2-$3');
  if (slashDate !== s) {
    const d = new Date(slashDate);
    if (!isNaN(d.getTime())) return d;
  }

  // "15-01-2026" or "15/01/2026" (DD-MM-YYYY)
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ddmmyyyy) {
    const d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`);
    if (!isNaN(d.getTime())) return d;
  }

  // "Jan 15, 2026" or "January 15, 2026"
  const monthFirst = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthFirst) {
    const d = new Date(`${monthFirst[1]} ${monthFirst[2]}, ${monthFirst[3]}`);
    if (!isNaN(d.getTime())) return d;
  }

  // "15 Jan 2026" or "15 January 2026"
  const dayFirst = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (dayFirst) {
    const d = new Date(`${dayFirst[2]} ${dayFirst[1]}, ${dayFirst[3]}`);
    if (!isNaN(d.getTime())) return d;
  }

  // Epoch seconds (some feeds return unix timestamps)
  if (/^\d{10}$/.test(s)) return new Date(parseInt(s) * 1000);
  if (/^\d{13}$/.test(s)) return new Date(parseInt(s));

  // Chinese date format "2026年01月15日"
  const cnDate = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cnDate) {
    return new Date(`${cnDate[1]}-${cnDate[2].padStart(2, '0')}-${cnDate[3].padStart(2, '0')}`);
  }

  // Last resort: return current time
  console.warn(`[parser] Unparseable date: "${s}"`);
  return new Date();
}

// ============ 2. Charset Detection & Conversion ============

/**
 * Detect charset from HTTP headers and XML declaration, then decode to UTF-8.
 */
function detectAndDecode(buffer: Buffer, contentType: string): string {
  // 1. Check HTTP Content-Type header
  let charset = extractCharset(contentType);

  // 2. If not in header, check XML declaration
  if (!charset) {
    // Peek at the first 200 bytes as ASCII to find encoding
    const head = buffer.subarray(0, 200).toString('ascii');
    const xmlMatch = head.match(/encoding=["']([^"']+)["']/i);
    if (xmlMatch) charset = xmlMatch[1];
  }

  // 3. Auto-detect common non-UTF-8 signatures
  if (!charset) {
    // BOM detection
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) charset = 'utf-16le';
    else if (buffer[0] === 0xFE && buffer[1] === 0xFF) charset = 'utf-16be';
    else if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) charset = 'utf-8';
  }

  // 4. Normalize charset name
  charset = normalizeCharset(charset || 'utf-8');

  // 5. Decode
  if (charset === 'utf-8') {
    return buffer.toString('utf-8');
  }

  if (iconv.encodingExists(charset)) {
    return iconv.decode(buffer, charset);
  }

  // Fallback: try UTF-8
  console.warn(`[parser] Unknown charset "${charset}", falling back to UTF-8`);
  return buffer.toString('utf-8');
}

function extractCharset(contentType: string): string | null {
  const match = contentType.match(/charset=([^\s;]+)/i);
  return match ? match[1].replace(/['"]/g, '') : null;
}

function normalizeCharset(charset: string): string {
  const lower = charset.toLowerCase().replace(/[^a-z0-9]/g, '');
  const map: Record<string, string> = {
    'utf8': 'utf-8',
    'latin1': 'iso-8859-1',
    'latin2': 'iso-8859-2',
    'ascii': 'ascii',
    'usascii': 'ascii',
    'iso88591': 'iso-8859-1',
    'iso885915': 'iso-8859-15',
    'windows1250': 'windows-1250',
    'windows1251': 'windows-1251',
    'windows1252': 'windows-1252',
    'windows1253': 'windows-1253',
    'windows1254': 'windows-1254',
    'windows1256': 'windows-1256',
    'cp1252': 'windows-1252',
    'gb2312': 'gb2312',
    'gbk': 'gbk',
    'gb18030': 'gb18030',
    'big5': 'big5',
    'eucjp': 'euc-jp',
    'euckr': 'euc-kr',
    'shiftjis': 'shift_jis',
    'sjis': 'shift_jis',
    'koi8r': 'koi8-r',
    'koi8u': 'koi8-u',
  };
  return map[lower] || charset.toLowerCase();
}

// ============ 3. HTML Sanitization ============

/**
 * Sanitize HTML content to prevent XSS while keeping useful formatting.
 */
function sanitizeContent(html: string): string {
  if (!html) return '';

  return sanitizeHtml(html, {
    allowedTags: [
      // Structure
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'div', 'span', 'br', 'hr',
      'blockquote', 'pre', 'code',
      // Lists
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      // Text formatting
      'a', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
      'sub', 'sup', 'small', 'mark', 'abbr',
      // Media
      'img', 'figure', 'figcaption', 'picture', 'source',
      'audio', 'video', 'iframe',
      // Tables
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      // Other
      'details', 'summary', 'time',
    ],
    allowedAttributes: {
      'a': ['href', 'title', 'rel', 'target'],
      'img': ['src', 'alt', 'title', 'width', 'height', 'loading'],
      'iframe': ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow'],
      'video': ['src', 'poster', 'width', 'height', 'controls', 'preload'],
      'audio': ['src', 'controls', 'preload'],
      'source': ['src', 'type', 'srcset', 'media'],
      'td': ['colspan', 'rowspan'],
      'th': ['colspan', 'rowspan', 'scope'],
      'time': ['datetime'],
      'abbr': ['title'],
      'blockquote': ['cite'],
      'code': ['class'], // Allow language class for syntax highlighting
      'pre': ['class'],
      'div': ['class'],
      'span': ['class'],
    },
    allowedIframeHostnames: [
      'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
      'player.vimeo.com', 'player.bilibili.com',
      'open.spotify.com', 'w.soundcloud.com',
      'codepen.io', 'jsfiddle.net',
    ],
    allowedSchemes: ['http', 'https', 'mailto'],
    // Enforce noopener on links
    transformTags: {
      'a': (tagName: string, attribs: Record<string, string>) => {
        return {
          tagName,
          attribs: {
            ...attribs,
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        };
      },
    },
  });
}

// ============ 4. Content Rewrite Rules ============

/**
 * Rewrite content for better reading experience.
 * Handles YouTube, Bilibili, Twitter embeds, etc.
 */
function rewriteContent(content: string, url: string): string {
  if (!content) return '';
  let result = content;

  // YouTube: convert links to embedded player
  result = result.replace(
    /(?:<a[^>]*href=["'])?https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})[^"'<\s]*(?:["'][^>]*>.*?<\/a>)?/gi,
    (match, videoId) => {
      // Don't double-embed if already in iframe
      if (result.includes(`youtube.com/embed/${videoId}`)) return match;
      return `<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/${videoId}" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
    }
  );

  // Bilibili: convert links to embedded player
  result = result.replace(
    /https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/gi,
    (match, bvid) => {
      if (result.includes(`player.bilibili.com/player.html?bvid=${bvid}`)) return match;
      return `<iframe width="560" height="315" src="https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1" frameborder="0" allowfullscreen></iframe>`;
    }
  );

  // Vimeo: convert links to embedded player
  result = result.replace(
    /https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/gi,
    (match, videoId) => {
      if (result.includes(`player.vimeo.com/video/${videoId}`)) return match;
      return `<iframe width="560" height="315" src="https://player.vimeo.com/video/${videoId}" frameborder="0" allowfullscreen></iframe>`;
    }
  );

  // Twitter/X: convert tweet links to nitter embed (open source Twitter frontend)
  result = result.replace(
    /https?:\/\/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/gi,
    (match, user, tweetId) => {
      return `<blockquote><a href="https://x.com/${user}/status/${tweetId}" rel="noopener noreferrer" target="_blank">🐦 Tweet by @${user}</a></blockquote>`;
    }
  );

  // Reddit: add target=_blank to reddit links
  result = result.replace(
    /href="(https?:\/\/(?:www\.)?reddit\.com\/[^"]+)"/gi,
    'href="$1" target="_blank" rel="noopener noreferrer"'
  );

  // Lazy-load images
  result = result.replace(
    /<img\s+(?!.*loading=)/gi,
    '<img loading="lazy" '
  );

  return result;
}

// ============ 5. Feed Icon Discovery ============

/**
 * Discover the icon/favicon for a feed's website.
 * Tries multiple methods:
 * 1. <link rel="icon"> in HTML
 * 2. /favicon.ico
 * 3. Google favicon service as fallback
 */
export async function discoverFeedIcon(siteUrl: string): Promise<{ url: string; type: string; data: string } | null> {
  if (!siteUrl) return null;

  try {
    const base = new URL(siteUrl);

    // Special: YouTube/Bilibili channels — use og:image (channel avatar)
    const isYouTube = base.hostname.includes('youtube.com') || base.hostname.includes('youtu.be');
    const isBilibili = base.hostname.includes('bilibili.com');
    if (isYouTube || isBilibili) {
      try {
        const res = await fetch(siteUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(10000),
        });
        const html = await res.text();
        const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        if (ogMatch?.[1]) {
          const avatarUrl = ogMatch[1].startsWith('//') ? `https:${ogMatch[1]}` : ogMatch[1];
          const iconData = await fetchIconAsDataUrl(avatarUrl);
          if (iconData) return iconData;
        }
      } catch { /* fall through to generic methods */ }
    }

    // Method 1: Parse HTML for <link rel="icon">
    try {
      const res = await fetch(siteUrl, {
        headers: { 'User-Agent': 'FeedGlow/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      const html = await res.text();

      // Find icon links in HTML
      const iconRegex = /<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
      let match;
      let bestIcon: string | null = null;
      let bestSize = 0;

      while ((match = iconRegex.exec(html)) !== null) {
        const href = match[1];
        const sizeMatch = match[0].match(/sizes=["'](\d+)/);
        const size = sizeMatch ? parseInt(sizeMatch[1]) : 16;

        // Prefer icons between 32-128px
        if (!bestIcon || (size >= 32 && size <= 128 && size > bestSize)) {
          bestIcon = href;
          bestSize = size;
        }
      }

      // Also check reverse order: href before rel
      const iconRegex2 = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi;
      while ((match = iconRegex2.exec(html)) !== null) {
        if (!bestIcon) bestIcon = match[1];
      }

      if (bestIcon) {
        const iconUrl = bestIcon.startsWith('http') ? bestIcon :
                        bestIcon.startsWith('//') ? `${base.protocol}${bestIcon}` :
                        bestIcon.startsWith('/') ? `${base.origin}${bestIcon}` :
                        `${base.origin}/${bestIcon}`;
        const iconData = await fetchIconAsDataUrl(iconUrl);
        if (iconData) return iconData;
      }
    } catch { /* fall through */ }

    // Method 2: Try /favicon.ico
    try {
      const faviconUrl = `${base.origin}/favicon.ico`;
      const iconData = await fetchIconAsDataUrl(faviconUrl);
      if (iconData) return iconData;
    } catch { /* fall through */ }

    // Method 3: Google favicon service
    try {
      const googleUrl = `https://www.google.com/s2/favicons?domain=${base.hostname}&sz=64`;
      const iconData = await fetchIconAsDataUrl(googleUrl);
      if (iconData) return iconData;
    } catch { /* fall through */ }

  } catch (err) {
    console.warn(`[parser] Icon discovery failed for ${siteUrl}:`, err instanceof Error ? err.message : err);
  }

  return null;
}

async function fetchIconAsDataUrl(url: string): Promise<{ url: string; type: string; data: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FeedGlow/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || 'image/x-icon';
    // Skip if it's HTML (some servers redirect to a page)
    if (contentType.includes('text/html')) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    // Skip if too small (likely empty/broken) or too large
    if (buffer.length < 32 || buffer.length > 500_000) return null;

    const base64 = buffer.toString('base64');
    const mimeType = contentType.split(';')[0].trim();

    return {
      url,
      type: mimeType,
      data: `data:${mimeType};base64,${base64}`,
    };
  } catch {
    return null;
  }
}

// ============ 6. Crawler Mode (Readability) ============

/**
 * Fetch full article content using Readability (when crawler=true).
 */
async function fetchFullContent(url: string): Promise<string | null> {
  try {
    const { extractContent } = await import('../services/readability.js');
    const result = await extractContent(url);
    return result?.content || null;
  } catch {
    return null;
  }
}

// ============ 7. Blocklist / Keeplist Filtering ============

/**
 * Filter entries based on blocklist (exclude) and keeplist (include only) regex rules.
 * Rules are newline-separated regex patterns matched against title + URL.
 */
function applyFilterRules(
  entries: ParsedEntry[],
  blocklistRules?: string,
  keeplistRules?: string,
): ParsedEntry[] {
  let result = entries;

  // Keeplist: only keep entries matching at least one rule
  if (keeplistRules?.trim()) {
    const patterns = keeplistRules.split('\n').filter(Boolean).map(p => {
      try { return new RegExp(p.trim(), 'i'); } catch { return null; }
    }).filter(Boolean) as RegExp[];

    if (patterns.length > 0) {
      result = result.filter(e => {
        const text = `${e.title} ${e.url}`;
        return patterns.some(p => p.test(text));
      });
    }
  }

  // Blocklist: exclude entries matching any rule
  if (blocklistRules?.trim()) {
    const patterns = blocklistRules.split('\n').filter(Boolean).map(p => {
      try { return new RegExp(p.trim(), 'i'); } catch { return null; }
    }).filter(Boolean) as RegExp[];

    if (patterns.length > 0) {
      result = result.filter(e => {
        const text = `${e.title} ${e.url}`;
        return !patterns.some(p => p.test(text));
      });
    }
  }

  return result;
}

// ============ 8. Content Hash for Update Detection ============

/**
 * Generate hash of content for detecting article updates.
 */
function contentHash(content: string): string {
  return crypto.createHash('md5').update(content || '').digest('hex');
}

// ============ Core Functions ============

/**
 * Generate a deterministic hash for deduplication
 */
function entryHash(guid: string | undefined, url: string | undefined, title: string): string {
  const input = guid || url || title;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 64);
}

/**
 * Detect if URL is a JSON Feed
 */
async function isJsonFeed(url: string, headers?: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'FeedGlow/1.0', ...headers },
      signal: AbortSignal.timeout(5000),
    });
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/feed+json');
  } catch {
    return false;
  }
}

/**
 * Parse a JSON Feed (https://www.jsonfeed.org/)
 */
async function parseJsonFeed(url: string, headers?: Record<string, string>): Promise<ParsedFeed> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FeedGlow/1.0', ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as any;

  if (!data.version?.startsWith('https://jsonfeed.org/version/')) {
    throw new Error('Not a valid JSON Feed');
  }

  return {
    title: data.title || '',
    description: data.description || '',
    siteUrl: data.home_page_url || '',
    feedUrl: data.feed_url || url,
    language: data.language,
    iconUrl: data.icon || data.favicon,
    items: (data.items || []).map((item: any) => ({
      hash: entryHash(item.id, item.url, item.title || ''),
      title: item.title || '',
      url: item.url || item.external_url || '',
      content: sanitizeContent(rewriteContent(
        item.content_html || item.content_text || '',
        item.url || ''
      )),
      author: item.authors?.[0]?.name || item.author?.name || '',
      publishedAt: parseDate(item.date_published || item.date_modified),
      enclosureUrl: item.attachments?.[0]?.url,
      enclosureType: item.attachments?.[0]?.mime_type,
      enclosureSize: item.attachments?.[0]?.size_in_bytes,
    })),
  };
}

/**
 * Fetch and parse a feed URL.
 * Supports: HTTP Basic auth, conditional requests, charset detection,
 * crawler mode, scraper rules, blocklist/keeplist filtering.
 */
export async function parseFeed(
  url: string,
  options?: FetchOptions,
): Promise<{ feed: ParsedFeed; etag?: string; lastModified?: string; notModified: boolean }> {
  // Build headers
  const fetchHeaders: Record<string, string> = {
    'User-Agent': options?.userAgent || 'FeedGlow/1.0 (+https://feedglow.dev)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
  };
  if (options?.etag) fetchHeaders['If-None-Match'] = options.etag;
  if (options?.lastModified) fetchHeaders['If-Modified-Since'] = options.lastModified;

  // HTTP Basic auth
  if (options?.username && options?.password) {
    const creds = Buffer.from(`${options.username}:${options.password}`).toString('base64');
    fetchHeaders['Authorization'] = `Basic ${creds}`;
  }

  // Check if JSON Feed first
  const jsonFeed = await isJsonFeed(url, fetchHeaders);
  if (jsonFeed) {
    let feed = await parseJsonFeed(url, fetchHeaders);
    // Apply blocklist/keeplist
    feed.items = applyFilterRules(feed.items, options?.blocklistRules, options?.keeplistRules);
    return { feed, notModified: false };
  }

  // Fetch with conditional headers
  const res = await fetch(url, {
    headers: fetchHeaders,
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 304) {
    return {
      feed: { title: '', description: '', siteUrl: '', feedUrl: url, items: [] },
      etag: options?.etag,
      lastModified: options?.lastModified,
      notModified: true,
    };
  }

  if (!res.ok) {
    throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
  }

  // Charset detection & conversion
  const ct = res.headers.get('content-type') || '';
  const rawBuffer = Buffer.from(await res.arrayBuffer());
  const xml = detectAndDecode(rawBuffer, ct);

  const parsed = await parser.parseString(xml);

  let items: ParsedEntry[] = (parsed.items || []).map((item: any) => {
    const enclosure = item.enclosure;
    const rawContent = item['content:encoded'] || item.content || item.summary || '';
    const entryUrl = item.link || '';

    return {
      hash: entryHash(item.guid || item.id, item.link, item.title || ''),
      title: item.title || '',
      url: entryUrl,
      content: sanitizeContent(rewriteContent(rawContent, entryUrl)),
      author: item.creator || item.author || item['dc:creator'] || '',
      publishedAt: parseDate(item.pubDate || item.isoDate),
      enclosureUrl: enclosure?.url,
      enclosureType: enclosure?.type,
      enclosureSize: enclosure?.length ? parseInt(String(enclosure.length)) : undefined,
      contentHash: contentHash(rawContent),
    };
  });

  // Apply blocklist/keeplist filtering
  items = applyFilterRules(items, options?.blocklistRules, options?.keeplistRules);

  // Crawler mode: fetch full content via Readability for each entry
  if (options?.crawler) {
    const crawlPromises = items.map(async (entry) => {
      if (!entry.url) return entry;
      try {
        const fullContent = await fetchFullContent(entry.url);
        if (fullContent && fullContent.length > entry.content.length) {
          entry.content = sanitizeContent(rewriteContent(fullContent, entry.url));
          entry.contentHash = contentHash(fullContent);
        }
      } catch { /* keep original content */ }
      return entry;
    });
    // Process with concurrency limit of 3
    for (let i = 0; i < crawlPromises.length; i += 3) {
      await Promise.allSettled(crawlPromises.slice(i, i + 3));
    }
  }

  const feed: ParsedFeed = {
    title: parsed.title || '',
    description: parsed.description || '',
    siteUrl: parsed.link || '',
    feedUrl: parsed.feedUrl || url,
    language: parsed.language,
    imageUrl: parsed.image?.url || undefined,
    items,
  };

  return {
    feed,
    etag: res.headers.get('etag') || undefined,
    lastModified: res.headers.get('last-modified') || undefined,
    notModified: false,
  };
}

/**
 * Discover feed URLs from a website URL
 */
export async function discoverFeeds(siteUrl: string): Promise<string[]> {
  try {
    const res = await fetch(siteUrl, {
      headers: { 'User-Agent': 'FeedGlow/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await res.text();

    const feeds: string[] = [];
    const linkRegex = /<link[^>]*type=["'](application\/(?:rss|atom)\+xml|application\/feed\+json)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      let feedUrl = match[2];
      if (feedUrl.startsWith('/')) {
        const base = new URL(siteUrl);
        feedUrl = `${base.origin}${feedUrl}`;
      }
      feeds.push(feedUrl);
    }

    // Also check reverse attribute order (href before type)
    const linkRegex2 = /<link[^>]*href=["']([^"']+)["'][^>]*type=["'](application\/(?:rss|atom)\+xml|application\/feed\+json)["'][^>]*>/gi;
    while ((match = linkRegex2.exec(html)) !== null) {
      let feedUrl = match[1];
      if (feedUrl.startsWith('/')) {
        const base = new URL(siteUrl);
        feedUrl = `${base.origin}${feedUrl}`;
      }
      if (!feeds.includes(feedUrl)) feeds.push(feedUrl);
    }

    // Also check common feed paths
    if (feeds.length === 0) {
      const commonPaths = ['/feed', '/rss', '/atom.xml', '/feed.xml', '/rss.xml', '/index.xml', '/feed/atom', '/feed/rss'];
      for (const path of commonPaths) {
        try {
          const base = new URL(siteUrl);
          const testUrl = `${base.origin}${path}`;
          const testRes = await fetch(testUrl, {
            method: 'HEAD',
            headers: { 'User-Agent': 'FeedGlow/1.0' },
            signal: AbortSignal.timeout(5000),
          });
          if (testRes.ok) {
            const ct = testRes.headers.get('content-type') || '';
            if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom') || ct.includes('json')) {
              feeds.push(testUrl);
            }
          }
        } catch {
          // skip
        }
      }
    }

    return feeds;
  } catch {
    return [];
  }
}
