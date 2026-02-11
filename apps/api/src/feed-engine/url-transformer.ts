/**
 * URL Transformer - Auto-convert platform URLs to RSSHub feed URLs
 * 
 * When users paste a YouTube/Bilibili/Twitter etc. URL,
 * automatically converts it to the corresponding RSSHub route.
 */

const RSSHUB_BASE = process.env.RSSHUB_URL || 'http://localhost:1200';

interface TransformResult {
  feedUrl: string;
  source: 'rsshub' | 'native' | 'original';
  platform?: string;
}

/**
 * Resolve a YouTube @handle or /c/name to a channel ID by fetching the page.
 * Returns null if resolution fails.
 * 
 * IMPORTANT: The page HTML contains many "channelId" fields from recommended
 * channels. We must use reliable unique fields to find the actual channel ID:
 * - "rssUrl" — directly contains the RSS feed URL (most reliable)
 * - <link rel="canonical"> — contains the channel URL with ID
 * - "externalId" — unique to the page's channel (appears only once)
 * - "channelId" is NOT reliable (appears dozens of times for different channels)
 */
async function resolveYouTubeChannelId(handle: string): Promise<string | null> {
  try {
    const url = handle.startsWith('http') ? handle : `https://www.youtube.com/@${handle.replace(/^@/, '')}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    
    // Priority order — most reliable first, avoid "channelId" which appears for recommended channels
    const patterns = [
      // 1. rssUrl field — directly embeds the RSS URL with channel ID (most reliable)
      /"rssUrl":"https?:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[a-zA-Z0-9_-]+)"/,
      // 2. canonical link — unique per page
      /<link\s+rel="canonical"\s+href="https?:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)"/,
      // 3. externalId — unique to the page's channel
      /"externalId":"(UC[a-zA-Z0-9_-]+)"/,
      // 4. meta itemprop — if present, reliable
      /<meta\s+itemprop="channelId"\s+content="(UC[a-zA-Z0-9_-]+)"/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        console.log(`[YouTube] Resolved ${handle} → ${match[1]} (via ${pattern.source.slice(0, 30)}...)`);
        return match[1];
      }
    }
    return null;
  } catch (err) {
    console.warn(`[YouTube] Failed to resolve ${handle}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

type UrlMatcher = {
  platform: string;
  patterns: RegExp[];
  transform: (url: URL, match: RegExpMatchArray) => string | null | Promise<string | null>;
  /** Some platforms have native RSS, prefer that over RSSHub */
  native?: (url: URL, match: RegExpMatchArray) => string | null;
};

const PLATFORM_MATCHERS: UrlMatcher[] = [
  // ============ YouTube ============
  {
    platform: 'youtube',
    patterns: [
      // youtube.com/@handle
      /^https?:\/\/(?:www\.)?youtube\.com\/@([a-zA-Z0-9_.-]+)/,
      // youtube.com/channel/UCxxx
      /^https?:\/\/(?:www\.)?youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/,
      // youtube.com/c/channelname (legacy)
      /^https?:\/\/(?:www\.)?youtube\.com\/c\/([a-zA-Z0-9_.-]+)/,
      // youtube.com/user/username (legacy)
      /^https?:\/\/(?:www\.)?youtube\.com\/user\/([a-zA-Z0-9_.-]+)/,
      // youtube.com/playlist?list=PLxxx
      /^https?:\/\/(?:www\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/,
    ],
    transform: async (url, match) => {
      const path = url.pathname;
      const listId = url.searchParams.get('list');

      // Playlist
      if (listId) {
        return `${RSSHUB_BASE}/youtube/playlist/${listId}`;
      }
      // Channel by ID (UCxxx) — RSSHub accepts directly
      if (path.startsWith('/channel/') && match[1].startsWith('UC')) {
        return `${RSSHUB_BASE}/youtube/channel/${match[1]}`;
      }
      // @handle, /c/, /user/ — need to resolve to channel ID first
      const channelId = await resolveYouTubeChannelId(match[1]);
      if (channelId) {
        return `${RSSHUB_BASE}/youtube/channel/${channelId}`;
      }
      // Fallback: use YouTube native RSS with channel ID (if resolved), or return null
      return null;
    },
    native: (url, match) => {
      const path = url.pathname;
      // Only channel IDs have native RSS directly
      if (path.startsWith('/channel/') && match[1].startsWith('UC')) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${match[1]}`;
      }
      // Playlists have native RSS too
      const listId = url.searchParams.get('list');
      if (listId) {
        return `https://www.youtube.com/feeds/videos.xml?playlist_id=${listId}`;
      }
      // For @handle — native RSS won't work without channel ID, return null
      return null;
    },
  },

  // ============ Bilibili ============
  {
    platform: 'bilibili',
    patterns: [
      // space.bilibili.com/12345 (user space)
      /^https?:\/\/space\.bilibili\.com\/(\d+)/,
      // bilibili.com/video/BVxxx
      /^https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/,
      // bilibili.com/bangumi/media/mdXXX
      /^https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/media\/md(\d+)/,
    ],
    transform: (url, match) => {
      const path = url.pathname;
      if (url.hostname === 'space.bilibili.com') {
        return `${RSSHUB_BASE}/bilibili/user/video/${match[1]}`;
      }
      if (path.includes('/bangumi/')) {
        return `${RSSHUB_BASE}/bilibili/bangumi/media/${match[1]}`;
      }
      // Single video — not a feed, return null
      return null;
    },
  },

  // ============ Twitter/X ============
  {
    platform: 'twitter',
    patterns: [
      /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})\/?$/,
      /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})\/(?:with_replies|media|likes)?\/?$/,
    ],
    transform: (_url, match) => {
      const username = match[1].toLowerCase();
      // Skip non-user pages
      if (['home', 'explore', 'search', 'settings', 'i', 'intent'].includes(username)) return null;
      return `${RSSHUB_BASE}/twitter/user/${username}`;
    },
  },

  // ============ Reddit ============
  {
    platform: 'reddit',
    patterns: [
      /^https?:\/\/(?:www\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)/,
      /^https?:\/\/(?:www\.)?reddit\.com\/user\/([a-zA-Z0-9_-]+)/,
    ],
    transform: (url, match) => {
      if (url.pathname.startsWith('/user/')) {
        return `${RSSHUB_BASE}/reddit/user/${match[1]}`;
      }
      return `${RSSHUB_BASE}/reddit/subreddit/${match[1]}`;
    },
    native: (url, match) => {
      // Reddit has native RSS
      if (url.pathname.startsWith('/user/')) {
        return `https://www.reddit.com/user/${match[1]}/.rss`;
      }
      return `https://www.reddit.com/r/${match[1]}/.rss`;
    },
  },

  // ============ GitHub ============
  {
    platform: 'github',
    patterns: [
      // github.com/user/repo
      /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/?$/,
      // github.com/user/repo/releases
      /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/releases/,
      // github.com/user (profile)
      /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/?$/,
    ],
    transform: (url, match) => {
      if (match[2]) {
        // Repo — prefer releases feed
        if (url.pathname.includes('/releases')) {
          return `${RSSHUB_BASE}/github/release/${match[1]}/${match[2]}`;
        }
        // Default: commits
        return `${RSSHUB_BASE}/github/repos/${match[1]}/${match[2]}/commits`;
      }
      // User activity
      return `${RSSHUB_BASE}/github/user/activities/${match[1]}`;
    },
    native: (url, match) => {
      if (match[2]) {
        // GitHub has native Atom feeds for releases and commits
        if (url.pathname.includes('/releases')) {
          return `https://github.com/${match[1]}/${match[2]}/releases.atom`;
        }
        return `https://github.com/${match[1]}/${match[2]}/commits.atom`;
      }
      return null;
    },
  },

  // ============ Weibo ============
  {
    platform: 'weibo',
    patterns: [
      /^https?:\/\/(?:www\.)?weibo\.com\/u\/(\d+)/,
      /^https?:\/\/(?:www\.)?weibo\.com\/([a-zA-Z0-9_]+)/,
    ],
    transform: (_url, match) => {
      return `${RSSHUB_BASE}/weibo/user/${match[1]}`;
    },
  },

  // ============ Zhihu (知乎) ============
  {
    platform: 'zhihu',
    patterns: [
      /^https?:\/\/(?:www\.)?zhihu\.com\/people\/([a-zA-Z0-9_-]+)/,
      /^https?:\/\/(?:www\.)?zhihu\.com\/column\/([a-zA-Z0-9_-]+)/,
      /^https?:\/\/zhuanlan\.zhihu\.com\/([a-zA-Z0-9_-]+)/,
    ],
    transform: (url, match) => {
      if (url.pathname.startsWith('/people/')) {
        return `${RSSHUB_BASE}/zhihu/people/activities/${match[1]}`;
      }
      // Column
      return `${RSSHUB_BASE}/zhihu/zhuanlan/${match[1]}`;
    },
  },

  // ============ Xiaohongshu (小红书) ============
  {
    platform: 'xiaohongshu',
    patterns: [
      /^https?:\/\/(?:www\.)?xiaohongshu\.com\/user\/profile\/([a-zA-Z0-9]+)/,
    ],
    transform: (_url, match) => {
      return `${RSSHUB_BASE}/xiaohongshu/user/${match[1]}/notes`;
    },
  },

  // ============ Douyin (抖音) ============
  {
    platform: 'douyin',
    patterns: [
      /^https?:\/\/(?:www\.)?douyin\.com\/user\/([a-zA-Z0-9_-]+)/,
    ],
    transform: (_url, match) => {
      return `${RSSHUB_BASE}/douyin/user/${match[1]}`;
    },
  },

  // ============ Telegram ============
  {
    platform: 'telegram',
    patterns: [
      /^https?:\/\/t\.me\/([a-zA-Z0-9_]{5,})\/?$/,
      /^https?:\/\/t\.me\/s\/([a-zA-Z0-9_]{5,})\/?$/,
    ],
    transform: (_url, match) => {
      return `${RSSHUB_BASE}/telegram/channel/${match[1]}`;
    },
  },

  // ============ Instagram ============
  {
    platform: 'instagram',
    patterns: [
      /^https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?$/,
    ],
    transform: (_url, match) => {
      const username = match[1].toLowerCase();
      if (['explore', 'reels', 'stories', 'direct', 'accounts', 'p'].includes(username)) return null;
      return `${RSSHUB_BASE}/instagram/user/${username}`;
    },
  },

  // ============ TikTok ============
  {
    platform: 'tiktok',
    patterns: [
      /^https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._]+)/,
    ],
    transform: (_url, match) => {
      return `${RSSHUB_BASE}/tiktok/user/@${match[1]}`;
    },
  },

  // ============ Podcast (Apple Podcasts) ============
  {
    platform: 'apple-podcasts',
    patterns: [
      /^https?:\/\/podcasts\.apple\.com\/[a-z]{2}\/podcast\/[^/]+\/id(\d+)/,
    ],
    transform: (_url, match) => {
      return `${RSSHUB_BASE}/apple/podcast/${match[1]}`;
    },
  },
];

/**
 * Check if a URL is a known platform URL and transform it to an RSSHub feed URL.
 * Returns the original URL if no transformation applies.
 * 
 * Prefers RSSHub routes over native RSS for richer metadata and consistency.
 * Falls back to native RSS if RSSHub route doesn't work.
 */
export async function transformPlatformUrl(inputUrl: string): Promise<TransformResult> {
  let url: URL;
  try {
    url = new URL(inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`);
  } catch {
    return { feedUrl: inputUrl, source: 'original' };
  }

  for (const matcher of PLATFORM_MATCHERS) {
    for (const pattern of matcher.patterns) {
      const match = inputUrl.match(pattern) || url.href.match(pattern);
      if (match) {
        const rsshubUrl = await matcher.transform(url, match);
        if (rsshubUrl) {
          return {
            feedUrl: rsshubUrl,
            source: 'rsshub',
            platform: matcher.platform,
          };
        }
        // Transform matched but returned null (e.g. YouTube handle resolution failed)
        // Try native feed URL as fallback
        if (matcher.native) {
          const nativeUrl = matcher.native(url, match);
          if (nativeUrl) {
            return {
              feedUrl: nativeUrl,
              source: 'native',
              platform: matcher.platform,
            };
          }
        }
      }
    }
  }

  return { feedUrl: inputUrl, source: 'original' };
}

/**
 * Get the native RSS URL for a platform URL (if available).
 * Used as fallback when RSSHub is down.
 */
export function getNativeFeedUrl(inputUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`);
  } catch {
    return null;
  }

  for (const matcher of PLATFORM_MATCHERS) {
    if (!matcher.native) continue;
    for (const pattern of matcher.patterns) {
      const match = inputUrl.match(pattern) || url.href.match(pattern);
      if (match) {
        return matcher.native(url, match);
      }
    }
  }

  return null;
}

/**
 * Check if a URL looks like it's already an RSS/Atom/JSON feed URL
 */
export function isLikelyFeedUrl(url: string): boolean {
  const lower = url.toLowerCase();
  // Common feed URL patterns
  if (/\.(xml|rss|atom|json)$/i.test(lower)) return true;
  if (/\/(feed|rss|atom|feeds\/)(\/|$|\?)/i.test(lower)) return true;
  if (lower.includes('rsshub.') || lower.includes('/rsshub/')) return true;
  if (lower.includes('/feeds/videos.xml')) return true; // YouTube native
  return false;
}

/**
 * Get list of supported platforms (for UI display)
 */
export function getSupportedPlatforms(): { id: string; name: string; examples: string[] }[] {
  return [
    { id: 'youtube', name: 'YouTube', examples: ['youtube.com/@channel', 'youtube.com/channel/UCxxx'] },
    { id: 'bilibili', name: 'Bilibili', examples: ['space.bilibili.com/12345'] },
    { id: 'twitter', name: 'Twitter/X', examples: ['twitter.com/username', 'x.com/username'] },
    { id: 'reddit', name: 'Reddit', examples: ['reddit.com/r/subreddit'] },
    { id: 'github', name: 'GitHub', examples: ['github.com/user/repo'] },
    { id: 'weibo', name: '微博', examples: ['weibo.com/u/12345'] },
    { id: 'zhihu', name: '知乎', examples: ['zhihu.com/people/username'] },
    { id: 'xiaohongshu', name: '小红书', examples: ['xiaohongshu.com/user/profile/xxx'] },
    { id: 'douyin', name: '抖音', examples: ['douyin.com/user/xxx'] },
    { id: 'telegram', name: 'Telegram', examples: ['t.me/channelname'] },
    { id: 'instagram', name: 'Instagram', examples: ['instagram.com/username'] },
    { id: 'tiktok', name: 'TikTok', examples: ['tiktok.com/@username'] },
    { id: 'apple-podcasts', name: 'Apple Podcasts', examples: ['podcasts.apple.com/.../id12345'] },
  ];
}
