/**
 * Full-text content extraction using Readability
 * With headless browser fallback for anti-bot protected sites
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
// Playwright is lazy-loaded to avoid importing the heavy module at startup
type Browser = import('playwright').Browser;

// Simple in-memory cache with size limit
const contentCache = new Map<string, { content: string; title: string; excerpt: string; fetchedAt: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour (reduced from 24h)

// User agents to rotate for anti-bot evasion
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
];

// Status codes that trigger browser fallback
const BROWSER_FALLBACK_CODES = [403, 429, 503];

// Lazy-loaded browser instance with auto-close after inactivity
let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;
let browserIdleTimer: ReturnType<typeof setTimeout> | null = null;
const BROWSER_IDLE_TIMEOUT = 60_000; // Close browser after 1 min idle

function scheduleBrowserClose() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(async () => {
    if (browserInstance) {
      console.log('[Readability] Closing idle browser instance');
      await browserInstance.close().catch(() => {});
      browserInstance = null;
    }
  }, BROWSER_IDLE_TIMEOUT);
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) {
    scheduleBrowserClose(); // Reset idle timer
    return browserInstance;
  }
  
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }
  
  // Dynamic import to avoid loading playwright at startup
  const { chromium } = await import('playwright');
  
  browserLaunchPromise = chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
    ],
  });
  
  browserInstance = await browserLaunchPromise;
  browserLaunchPromise = null;
  scheduleBrowserClose();
  
  return browserInstance;
}

export interface ExtractedContent {
  title: string;
  content: string;
  excerpt: string;
  byline?: string;
  siteName?: string;
  length: number;
  cached: boolean;
  usedBrowser?: boolean;
}

export class ContentExtractionError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'ContentExtractionError';
  }
}

/**
 * Fetch HTML using headless browser (for anti-bot protected sites)
 */
async function fetchWithBrowser(url: string): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1920, height: 1080 },
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate with timeout - wait for network to be mostly idle
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    // Wait for common article selectors to appear
    const articleSelectors = [
      'article',
      '[role="article"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content-body',
      'main article',
      '.post-body',
      '#article-body',
    ];
    
    // Try to wait for any article container
    for (const selector of articleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        console.log(`[Readability] Found article selector: ${selector}`);
        break;
      } catch {
        // Selector not found, try next
      }
    }
    
    // Extra wait for JS rendering
    await page.waitForTimeout(1500);
    
    // Scroll down to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(500);
    
    // Get the HTML
    const html = await page.content();
    return html;
  } finally {
    await context.close();
  }
}

/**
 * Fetch and extract readable content from a URL
 * Falls back to headless browser if regular fetch is blocked
 */
export async function extractContent(url: string): Promise<ExtractedContent> {
  // Check cache first
  const cached = contentCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return {
      title: cached.title,
      content: cached.content,
      excerpt: cached.excerpt,
      length: cached.content.length,
      cached: true,
    };
  }

  // Twitter/X special handling — use oEmbed API (JS pages can't be parsed)
  const twitterMatch = url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/);
  if (twitterMatch) {
    return extractTwitterContent(url, twitterMatch[1], twitterMatch[2]);
  }

  // Twitter/X non-tweet pages (profiles, lists, etc.) — can't be meaningfully extracted
  const isTwitterPage = /^https?:\/\/(twitter\.com|x\.com)\//i.test(url);
  if (isTwitterPage) {
    // Profile page: x.com/username
    const profileMatch = url.match(/(?:twitter\.com|x\.com)\/(@?\w+)\/?$/);
    const handle = profileMatch ? profileMatch[1].replace(/^@/, '') : 'user';
    const fallbackContent = `
      <div style="text-align:center;padding:24px;">
        <p style="font-size:16px;font-weight:600;">@${handle}</p>
        <p style="font-size:13px;color:#536471;margin-top:8px;">Twitter 用户主页</p>
        <a href="${url}" target="_blank" style="color:#1d9bf0;font-size:14px;">在 X 上查看</a>
      </div>`;
    return {
      title: `@${handle} / X`,
      content: fallbackContent,
      excerpt: `Twitter profile page for @${handle}`,
      length: fallbackContent.length,
      cached: false,
    };
  }

  let html: string;
  let usedBrowser = false;

  // First try regular fetch
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      // Check if we should try browser fallback
      if (BROWSER_FALLBACK_CODES.includes(response.status)) {
        console.log(`[Readability] HTTP ${response.status} for ${url}, trying browser fallback...`);
        try {
          html = await fetchWithBrowser(url);
          usedBrowser = true;
        } catch (browserErr) {
          console.error(`[Readability] Browser fallback failed:`, browserErr);
          throw new ContentExtractionError(`HTTP ${response.status}`, response.status);
        }
      } else {
        throw new ContentExtractionError(`HTTP ${response.status}`, response.status);
      }
    } else {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        throw new ContentExtractionError('Not an HTML page');
      }
      html = await response.text();
    }
  } catch (error) {
    if (error instanceof ContentExtractionError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ContentExtractionError('Request timeout', 408);
    }
    throw new ContentExtractionError(`Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Parse with JSDOM
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  // Remove common non-content elements before extraction
  const removeSelectors = [
    'nav', 'header', 'footer', '.nav', '.navbar', '.header', '.footer',
    '.sidebar', '.comments', '.related', '.advertisement', '.ad',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  ];
  for (const selector of removeSelectors) {
    document.querySelectorAll(selector).forEach((el: Element) => el.remove());
  }

  // Extract with Readability
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.content) {
    throw new ContentExtractionError('Could not extract content from page');
  }

  // Check if extracted content is too short (likely navigation/footer)
  const textContent = article.content.replace(/<[^>]*>/g, '').trim();
  if (textContent.length < 200) {
    throw new ContentExtractionError('Extracted content too short, likely navigation or ads');
  }

  // Cache the result
  contentCache.set(url, {
    title: article.title || '',
    content: article.content,
    excerpt: article.excerpt || '',
    fetchedAt: Date.now(),
  });

  // Clean up expired + enforce max 100 entries
  if (contentCache.size > 50) {
    const now = Date.now();
    for (const [key, val] of contentCache) {
      if (now - val.fetchedAt > CACHE_TTL) contentCache.delete(key);
    }
    // If still over limit, remove oldest
    if (contentCache.size > 100) {
      const keys = [...contentCache.keys()];
      for (let i = 0; i < keys.length - 50; i++) {
        contentCache.delete(keys[i]);
      }
    }
  }

  return {
    title: article.title || '',
    content: article.content,
    excerpt: article.excerpt || '',
    byline: article.byline || undefined,
    siteName: article.siteName || undefined,
    length: article.content.length,
    cached: false,
    usedBrowser,
  };
}

/**
 * Clear cache for a specific URL or all
 */
export function clearCache(url?: string): void {
  if (url) {
    contentCache.delete(url);
  } else {
    contentCache.clear();
  }
}

/**
 * Get cache stats
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: contentCache.size,
    maxSize: 1000,
  };
}

/**
 * Cleanup browser on shutdown
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Extract Twitter/X content using oEmbed API.
 * Falls back gracefully since Twitter pages are JS-rendered and unparseable.
 */
async function extractTwitterContent(url: string, username: string, tweetId: string): Promise<ExtractedContent> {
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });
    
    if (!res.ok) {
      throw new ContentExtractionError(`Twitter oEmbed failed: ${res.status}`, res.status);
    }
    
    const data = await res.json() as { html?: string; author_name?: string; author_url?: string };
    const embedHtml = data.html || '';
    const authorName = data.author_name || username;
    
    // Build a richer HTML wrapper around the oEmbed blockquote
    const content = `
      <div class="twitter-embed" style="max-width:550px;margin:0 auto;">
        ${embedHtml}
        <p style="margin-top:12px;text-align:center;">
          <a href="${url}" target="_blank" rel="noopener noreferrer">在 X 上查看原文 →</a>
        </p>
      </div>
    `.trim();
    
    const title = `@${username} 的推文`;
    const excerpt = embedHtml.replace(/<[^>]*>/g, '').slice(0, 200);

    // Cache it
    contentCache.set(url, {
      content,
      title,
      excerpt,
      fetchedAt: Date.now(),
    });

    return {
      title,
      content,
      excerpt,
      length: content.length,
      cached: false,
    };
  } catch (err) {
    // If oEmbed fails, return a minimal card rather than throwing
    const fallbackContent = `
      <div class="twitter-embed" style="max-width:550px;margin:0 auto;padding:16px;border:1px solid #333;border-radius:12px;">
        <p><strong>@${username}</strong></p>
        <p><a href="${url}" target="_blank" rel="noopener noreferrer">在 X 上查看此推文 →</a></p>
      </div>
    `.trim();

    return {
      title: `@${username} 的推文`,
      content: fallbackContent,
      excerpt: `Tweet by @${username}`,
      length: fallbackContent.length,
      cached: false,
    };
  }
}
