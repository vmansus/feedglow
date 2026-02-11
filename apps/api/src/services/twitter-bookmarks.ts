/**
 * Twitter Bookmarks Service
 * Fetches bookmarks via Twitter's internal GraphQL API using auth_token cookie.
 * Mirrors the approach used by RSSHub's web-api for Likes/Tweets.
 */

import { createHash } from 'crypto';
import type { ParsedEntry } from '../feed-engine/parser.js';

// ============ Constants ============

const TWITTER_BASE_URL = 'https://x.com/i/api';
// Twitter's internal bearer token (public, used by web client)
const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN || 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// GraphQL endpoint for Bookmarks (from twitter-api-client)
const BOOKMARKS_ENDPOINT = '/graphql/tmd4ifV8RHltzn8ymGg1aw/Bookmarks';

const GQL_FEATURES = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

// ============ Types ============

interface TweetLegacy {
  full_text: string;
  id_str: string;
  created_at: string;
  user?: {
    name: string;
    screen_name: string;
    profile_image_url_https?: string;
  };
  entities?: {
    urls?: Array<{ expanded_url: string; display_url: string; url: string }>;
    media?: Array<{ media_url_https: string; type: string; expanded_url: string }>;
    hashtags?: Array<{ text: string }>;
  };
  extended_entities?: {
    media?: Array<{
      media_url_https: string;
      type: string;
      video_info?: { variants: Array<{ url: string; content_type: string; bitrate?: number }> };
    }>;
  };
  quoted_status?: TweetLegacy;
  retweeted_status_result?: { result: any };
}

export interface BookmarkTweet {
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  authorAvatar?: string;
  createdAt: Date;
  url: string;
  html: string;
  mediaUrls: string[];
  quotedTweet?: {
    text: string;
    author: string;
    authorHandle: string;
    url: string;
  };
}

// ============ Cookie Management ============

/**
 * Get csrf token (ct0) from Twitter using auth_token cookie
 */
async function getCsrfToken(authToken: string): Promise<string> {
  // Visit x.com to get ct0 cookie
  const res = await fetch('https://x.com', {
    headers: {
      'Cookie': `auth_token=${authToken}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  });

  // Extract ct0 from set-cookie headers
  const cookies = res.headers.getSetCookie?.() || [];
  for (const cookie of cookies) {
    const match = cookie.match(/ct0=([^;]+)/);
    if (match) return match[1];
  }

  // Try to extract from response body
  const body = await res.text();
  const ct0Match = body.match(/ct0=([a-f0-9]+)/);
  if (ct0Match) return ct0Match[1];

  // Generate a random ct0 (sometimes works)
  const randomCt0 = createHash('sha256').update(authToken + Date.now()).digest('hex').slice(0, 32);
  return randomCt0;
}

// ============ GraphQL Fetcher ============

/**
 * Fetch Twitter Bookmarks using GraphQL API
 */
export async function fetchBookmarks(
  authToken: string,
  count: number = 40,
  cursor?: string
): Promise<{ tweets: BookmarkTweet[]; nextCursor?: string }> {
  const ct0 = await getCsrfToken(authToken);

  const variables: Record<string, any> = {
    count,
    includePromotedContent: false,
  };
  if (cursor) {
    variables.cursor = cursor;
  }

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GQL_FEATURES),
  });

  const url = `${TWITTER_BASE_URL}${BOOKMARKS_ENDPOINT}?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      'authority': 'x.com',
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': BEARER_TOKEN,
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'cookie': `auth_token=${authToken}; ct0=${ct0}`,
      'dnt': '1',
      'pragma': 'no-cache',
      'referer': 'https://x.com/i/bookmarks',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-csrf-token': ct0,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twitter Bookmarks API returned ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();

  // Parse response
  const instructions = data?.data?.bookmark_timeline_v2?.timeline?.instructions || data?.data?.bookmark_timeline?.timeline?.instructions || [];
  const addEntries = instructions.find((i: any) => i.type === 'TimelineAddEntries');
  const entries = addEntries?.entries || [];

  const tweets: BookmarkTweet[] = [];
  let nextCursor: string | undefined;

  for (const entry of entries) {
    const entryId = entry.entryId;

    // Extract cursor for pagination
    if (entryId?.startsWith('cursor-bottom-')) {
      nextCursor = entry.content?.value;
      continue;
    }
    if (entryId?.startsWith('cursor-top-')) continue;

    // Extract tweet
    if (!entryId?.startsWith('tweet-')) continue;

    try {
      const tweetResult = entry.content?.itemContent?.tweet_results?.result;
      if (!tweetResult) continue;

      const tweet = tweetResult.tweet || tweetResult;
      const legacy = tweet.legacy;
      if (!legacy) continue;

      // Get user info
      const userResult = tweet.core?.user_result?.result || tweet.core?.user_results?.result;
      const userLegacy = userResult?.legacy;
      const userName = userResult?.core?.name || userLegacy?.name || 'Unknown';
      const screenName = userResult?.core?.screen_name || userLegacy?.screen_name || 'unknown';
      const avatar = userLegacy?.profile_image_url_https?.replace('_normal', '_400x400');

      // Handle note tweets (long tweets)
      let fullText = legacy.full_text;
      if (tweet.note_tweet) {
        fullText = tweet.note_tweet.note_tweet_results?.result?.text || fullText;
      }

      // Build tweet URL
      const tweetId = legacy.id_str || tweet.rest_id;
      const tweetUrl = `https://x.com/${screenName}/status/${tweetId}`;

      // Extract media
      const mediaUrls: string[] = [];
      const extMedia = legacy.extended_entities?.media || legacy.entities?.media || [];
      for (const m of extMedia) {
        if (m.type === 'photo') {
          mediaUrls.push(m.media_url_https);
        } else if (m.type === 'video' || m.type === 'animated_gif') {
          // Get best quality video
          const variants = m.video_info?.variants || [];
          const mp4s = variants.filter((v: any) => v.content_type === 'video/mp4');
          const best = mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
          if (best) mediaUrls.push(best.url);
          else mediaUrls.push(m.media_url_https);
        }
      }

      // Build HTML content
      let html = buildTweetHtml(fullText, legacy, screenName, userName, avatar, mediaUrls);

      // Handle quoted tweet
      let quotedTweet: BookmarkTweet['quotedTweet'];
      const quotedResult = tweet.quoted_status_result?.result?.tweet || tweet.quoted_status_result?.result;
      if (quotedResult?.legacy) {
        const qUser = quotedResult.core?.user_result?.result || quotedResult.core?.user_results?.result;
        const qUserLegacy = qUser?.legacy;
        const qName = qUser?.core?.name || qUserLegacy?.name || 'Unknown';
        const qHandle = qUser?.core?.screen_name || qUserLegacy?.screen_name || 'unknown';
        const qText = quotedResult.note_tweet?.note_tweet_results?.result?.text || quotedResult.legacy.full_text;
        const qId = quotedResult.legacy.id_str || quotedResult.rest_id;

        quotedTweet = {
          text: qText,
          author: qName,
          authorHandle: qHandle,
          url: `https://x.com/${qHandle}/status/${qId}`,
        };

        html += buildQuotedTweetHtml(qText, qName, qHandle, quotedTweet.url);
      }

      tweets.push({
        id: tweetId,
        text: fullText,
        author: userName,
        authorHandle: screenName,
        authorAvatar: avatar,
        createdAt: new Date(legacy.created_at),
        url: tweetUrl,
        html,
        mediaUrls,
        quotedTweet,
      });
    } catch (err) {
      console.error('[TwitterBookmarks] Error parsing tweet entry:', err);
    }
  }

  return { tweets, nextCursor };
}

// ============ HTML Builders ============

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTweetHtml(
  text: string,
  legacy: any,
  screenName: string,
  userName: string,
  avatar: string | undefined,
  mediaUrls: string[]
): string {
  // Replace t.co links with expanded URLs
  let htmlText = escapeHtml(text);
  const urls = legacy.entities?.urls || [];
  for (const u of urls) {
    htmlText = htmlText.replace(
      escapeHtml(u.url),
      `<a href="${escapeHtml(u.expanded_url)}" target="_blank">${escapeHtml(u.display_url)}</a>`
    );
  }

  // Replace newlines
  htmlText = htmlText.replace(/\n/g, '<br>');

  // Remove trailing t.co media links (they get rendered as images)
  const mediaEntities = legacy.entities?.media || [];
  for (const m of mediaEntities) {
    htmlText = htmlText.replace(
      `<a href="${escapeHtml(m.expanded_url)}" target="_blank">${escapeHtml(m.display_url)}</a>`,
      ''
    );
    htmlText = htmlText.replace(escapeHtml(m.url), '');
  }

  let html = '';

  // Author header
  html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">`;
  if (avatar) {
    html += `<img src="${escapeHtml(avatar)}" width="40" height="40" style="border-radius:50%;" alt="${escapeHtml(userName)}">`;
  }
  html += `<div><strong>${escapeHtml(userName)}</strong> <span style="color:#71767b;">@${escapeHtml(screenName)}</span></div>`;
  html += `</div>`;

  // Tweet text
  html += `<div style="margin-bottom:8px;">${htmlText.trim()}</div>`;

  // Media
  for (const url of mediaUrls) {
    if (url.includes('.mp4') || url.includes('video')) {
      html += `<video src="${escapeHtml(url)}" controls style="max-width:100%;border-radius:12px;margin:4px 0;"></video>`;
    } else {
      html += `<img src="${escapeHtml(url)}" style="max-width:100%;border-radius:12px;margin:4px 0;" loading="lazy">`;
    }
  }

  return html;
}

function buildQuotedTweetHtml(text: string, author: string, handle: string, url: string): string {
  let htmlText = escapeHtml(text).replace(/\n/g, '<br>');
  return `
    <div style="border:1px solid #2f3336;border-radius:12px;padding:12px;margin-top:8px;">
      <div style="margin-bottom:4px;">
        <strong>${escapeHtml(author)}</strong> <span style="color:#71767b;">@${escapeHtml(handle)}</span>
      </div>
      <div>${htmlText}</div>
      <a href="${escapeHtml(url)}" target="_blank" style="color:#1d9bf0;font-size:0.9em;">查看原推</a>
    </div>
  `.trim();
}

// ============ Convert to ParsedEntry ============

/**
 * Convert BookmarkTweet to ParsedEntry for database insertion
 */
export function bookmarkToEntry(tweet: BookmarkTweet): ParsedEntry {
  const hash = createHash('sha256').update(`twitter-bookmark-${tweet.id}`).digest('hex').slice(0, 64);
  const contentHash = createHash('sha256').update(tweet.html).digest('hex').slice(0, 64);

  return {
    hash,
    title: `${tweet.author} (@${tweet.authorHandle})`,
    url: tweet.url,
    content: tweet.html,
    author: `${tweet.author} (@${tweet.authorHandle})`,
    publishedAt: tweet.createdAt,
    contentHash,
  };
}
