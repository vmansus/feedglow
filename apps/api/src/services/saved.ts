/**
 * Saved Items Service
 * "Read Later" / Clipper functionality
 */

import { query } from '../lib/db.js';
import { extractContent } from './readability.js';

// ============ HTML Cleaning ============

/**
 * Clean Twitter long-form article HTML captured by the Clipper.
 * 
 * Problem: Clipper captures images separately from article body.
 * Images are grouped at the top (in a media block), while the article
 * body has empty <section> placeholders where images should appear.
 * 
 * Fix: Extract images from the media block, then inject them back
 * into the empty <section> slots in order.
 */
function cleanTwitterClipperHtml(html: string): string {
  let cleaned = html;

  // 1. Remove Clipper score/interest UI: score number + interest tags
  //    Pattern: <div> 50\n<div>未匹配任何兴趣关键词</div></div> (after Readability strips classes)
  cleaned = cleaned.replace(/<div>\s*\d{1,3}\s*<div>[^<]*兴趣[^<]*<\/div>\s*<\/div>/gi, '');
  // Also catch variants with nested structures or different wording
  cleaned = cleaned.replace(/<div>[^<]*<div>未匹配[^<]*<\/div>\s*<\/div>/gi, '');
  // Remove standalone Clipper score badges (with or without emoji)
  cleaned = cleaned.replace(/<div\b[^>]*class="fg-score[^"]*"[^>]*>[\s\S]*?<\/div>\s*(<\/div>)?/gi, '');

  // 2. Remove trailing "想发布自己的文章？" and view counts
  cleaned = cleaned.replace(/<div>[^<]*想发布自己的文章[\s\S]*$/, '');

  // 3. Extract inline images from the grouped media block (non-avatar images)
  //    These are the article images that should be distributed into <section> slots
  const articleImgRegex = /<img[^>]+src="(https:\/\/pbs\.twimg\.com\/media\/[^"]+)"[^>]*style="max-width:100%[^"]*"[^>]*\/?>/gi;
  const articleImages: string[] = [];
  let imgMatch;
  while ((imgMatch = articleImgRegex.exec(cleaned)) !== null) {
    articleImages.push(imgMatch[1]);
  }

  // 4. Remove the grouped image block (they'll be re-injected at correct positions)
  //    The images appear as consecutive <img> tags with max-width:100%
  cleaned = cleaned.replace(
    /(<img[^>]+src="https:\/\/pbs\.twimg\.com\/media\/[^"]+?"[^>]*style="max-width:100%[^"]*"[^>]*\/?>[\s\n]*)+/gi,
    ''
  );

  // 5. Replace empty <section> placeholders with the extracted images (in order)
  //    Twitter uses <section contenteditable="false"><div><div><div><div></div></div></div></div></section>
  let imgIndex = 0;
  cleaned = cleaned.replace(
    /<section[^>]*>\s*<div>\s*<div>\s*<div>\s*<div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/section>/gi,
    () => {
      if (imgIndex < articleImages.length) {
        const imgUrl = articleImages[imgIndex++];
        return `<figure style="margin:16px 0;text-align:center;"><img src="${imgUrl}" style="max-width:100%;border-radius:8px;" loading="lazy"></figure>`;
      }
      return ''; // No more images, just remove the empty section
    }
  );

  // 6. Strip Twitter Draft.js data attributes (reduce bloat)
  cleaned = cleaned.replace(/\s+data-block="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+data-editor="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+data-offset-key="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+data-text="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+data-contents="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+contenteditable="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+spellcheck="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+data-offset-key="[^"]*"/gi, '');

  // 7. Remove "点击 订阅" UI
  cleaned = cleaned.replace(/<div>点击\s*订阅[^<]*<\/div>/gi, '');

  // 8. Remove analytics UI (e.g. "·" + "188.7万" + "查看")
  cleaned = cleaned.replace(/<div>\s*<span>·<\/span>\s*<\/div>[\s\S]*?查看[\s\S]*?<\/a>/gi, '');
  
  return cleaned.trim();
}

// ============ Types ============

export interface SavedItem {
  id: number;
  userId: number;
  url: string;
  title: string;
  description: string;
  content: string;
  thumbnail: string | null;
  source: 'twitter' | 'extension' | 'manual';
  sourceId: string | null;
  isRead: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveItemInput {
  url: string;
  title?: string;
  description?: string;
  content?: string;
  thumbnail?: string;
  source?: 'twitter' | 'extension' | 'manual';
  sourceId?: string;
}

// ============ Helpers ============

function mapRow(row: any): SavedItem {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    title: row.title,
    description: row.description || '',
    content: row.content || '',
    thumbnail: row.thumbnail,
    source: row.source || 'manual',
    sourceId: row.source_id,
    isRead: row.is_read,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============ CRUD ============

/**
 * Save a new item (with auto content extraction)
 */
export async function saveItem(userId: number, input: SaveItemInput): Promise<SavedItem> {
  let { url, title, description, content, thumbnail, source, sourceId } = input;

  // Normalize URL
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Check if already saved
  const existing = await query(
    'SELECT * FROM fg_saved_items WHERE user_id = $1 AND url = $2',
    [userId, url]
  );
  if (existing.rows.length > 0) {
    const existingItem = mapRow(existing.rows[0]);
    // For Twitter re-saves, run through content enrichment below then update
    // For others, just return existing if we have no richer content
    if (source !== 'twitter') {
      if (content && content.length > (existingItem.content || '').length) {
        const updated = await query(
          `UPDATE fg_saved_items SET content = $1, title = COALESCE(NULLIF($2, ''), title), 
           description = COALESCE(NULLIF($3, ''), description), thumbnail = COALESCE($4, thumbnail),
           updated_at = NOW() WHERE id = $5 RETURNING *`,
          [content, title || '', description || '', thumbnail || null, existingItem.id]
        );
        if (updated.rows.length > 0) return mapRow(updated.rows[0]);
      }
      return existingItem;
    }
    // Twitter: fall through to enrichment, then update existing
  }

  // ============ Content Enrichment ============

  // Detect if URL is on twitter.com/x.com regardless of source
  const isTwitterUrl = /^https?:\/\/(twitter\.com|x\.com)\//i.test(url);

  // If source is 'extension' but URL is Twitter, treat as Twitter for enrichment
  if (source === 'twitter' || (source === 'extension' && isTwitterUrl)) {
    // Extract tweet ID from URL
    const tweetIdMatch = url.match(/\/status\/(\d+)/);
    const tweetId = tweetIdMatch?.[1];

    // For Twitter profile pages (no tweet ID), create a clean summary instead of raw DOM
    if (!tweetId) {
      // Profile page: don't try to extract full content (it's just raw DOM)
      const profileMatch = url.match(/(?:twitter\.com|x\.com)\/(@?\w+)\/?$/);
      if (profileMatch) {
        const handle = profileMatch[1].replace(/^@/, '');
        if (!content || content.length < 100) {
          content = `<div style="text-align:center;padding:24px;">
            <p style="font-size:16px;font-weight:600;">@${handle}</p>
            <p style="font-size:13px;color:#536471;margin-top:8px;">Twitter 用户主页</p>
            <a href="${url}" target="_blank" style="color:#1d9bf0;font-size:14px;">在 X 上查看</a>
          </div>`;
        }
        if (!title) title = `@${handle} / X`;
      }
      // Clean Clipper artifacts even for profile pages
      if (content) {
        content = cleanTwitterClipperHtml(content);
      }
      // Skip the tweet-specific enrichment below
    } else {

    // Keep clipper-provided content (extracted from logged-in DOM)
    const clipperContent = content || '';

    // 1. Look up existing feed entry by tweet ID (RSSHub already has the content)
    if (tweetId && (!content || content.length < 100)) {
      try {
        const entryResult = await query(
          `SELECT title, content, enclosure_url FROM fg_entries 
           WHERE user_id = $1 AND url LIKE $2 
           ORDER BY created_at DESC LIMIT 1`,
          [userId, `%/status/${tweetId}%`]
        );
        if (entryResult.rows.length > 0) {
          const entry = entryResult.rows[0];
          if (entry.content && entry.content.length > (content || '').length) {
            content = entry.content;
            title = title || entry.title || '';
            if (!thumbnail && entry.enclosure_url) {
              thumbnail = entry.enclosure_url;
            }
            if (!thumbnail && entry.content) {
              const imgMatch = entry.content.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (imgMatch && !imgMatch[1].startsWith('data:')) {
                thumbnail = imgMatch[1];
              }
            }
            console.log(`[Saved] Found tweet ${tweetId} in feed entries, using RSS content`);
          }
        }
      } catch (err) {
        console.warn('[Saved] Failed to look up tweet in entries:', (err as Error).message);
      }
    }

    // Use clipper content if it's richer than what we found
    if (clipperContent.length > (content || '').length) {
      content = clipperContent;
      console.log(`[Saved] Using clipper-provided content (${clipperContent.length} chars)`);
    }

    // 2. If still no good content, try to fetch linked articles from t.co URLs
    if (!content || content.length < 50) {
      // If description is empty, try syndication API for tweet text
      let tweetText = description || '';
      if (!tweetText && tweetId) {
        try {
          const synRes = await fetch(
            `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=0`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedGlow/1.0)' }, signal: AbortSignal.timeout(5000) }
          );
          if (synRes.ok) {
            const contentType = synRes.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const synData = await synRes.json();
              if (synData.text) tweetText = synData.text;
            }
          }
        } catch { /* syndication failed, continue */ }
      }

      const tweetHtml = content || (tweetText 
        ? `<div style="font-size:15px;line-height:1.5;white-space:pre-wrap;">${tweetText}</div>` 
        : '');

      const allText = tweetText + ' ' + (content || '');
      // Match t.co short links only (exclude image/media URLs)
      const linkPattern = /https?:\/\/t\.co\/[a-zA-Z0-9]+/gi;
      const externalLinks = [...new Set((allText.match(linkPattern) || []))];

      let articleHtml = '';
      let articleTitle = '';

      for (const link of externalLinks.slice(0, 2)) {
        try {
          const fetched = await extractContent(link);
          if (fetched && fetched.content && fetched.content.length > 200) {
            articleTitle = fetched.title || '';
            articleHtml = `
              <div style="margin-top:20px;padding-top:16px;border-top:2px solid #e1e8ed;">
                <p style="font-size:13px;color:#536471;margin-bottom:8px;">📄 链接文章</p>
                ${articleTitle ? `<h2 style="margin:0 0 12px;font-size:18px;">${articleTitle}</h2>` : ''}
                <div>${fetched.content}</div>
              </div>
            `.trim();
            if (!thumbnail && fetched.content) {
              const imgMatch = fetched.content.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (imgMatch && !imgMatch[1].startsWith('data:')) {
                thumbnail = imgMatch[1];
              }
            }
            break;
          }
        } catch (err) {
          console.warn('[Saved] Failed to fetch linked article:', link, (err as Error).message);
        }
      }

      content = tweetHtml + articleHtml;
      if (!title && articleTitle) title = articleTitle;
    }

    // 3. Clean up Clipper DOM artifacts (empty image sections, data attributes, Clipper UI)
    if (content) {
      content = cleanTwitterClipperHtml(content);
    }

    } // end of else (has tweetId)
    
  } else if (!content) {
    // Non-Twitter: fetch content from URL as before
    try {
      const fetched = await extractContent(url);
      if (fetched) {
        title = title || fetched.title;
        content = fetched.content;
        if (!description && fetched.textContent) {
          description = fetched.textContent.slice(0, 300);
          if (fetched.textContent.length > 300) description += '...';
        }
        if (!thumbnail && fetched.content) {
          const imgMatch = fetched.content.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (imgMatch && !imgMatch[1].startsWith('data:')) {
            thumbnail = imgMatch[1];
          }
        }
      }
    } catch (err) {
      console.warn('[Saved] Failed to fetch content for:', url, err);
    }
  }

  // Fallback title from URL
  if (!title) {
    try {
      const urlObj = new URL(url);
      title = urlObj.hostname + urlObj.pathname;
    } catch {
      title = url;
    }
  }

  // If this was a Twitter re-save (existing item), update it with enriched content
  const existingCheck = await query(
    'SELECT * FROM fg_saved_items WHERE user_id = $1 AND url = $2',
    [userId, url]
  );
  if (existingCheck.rows.length > 0) {
    const updated = await query(
      `UPDATE fg_saved_items SET content = $1, title = COALESCE(NULLIF($2, ''), title), 
       description = COALESCE(NULLIF($3, ''), description), thumbnail = COALESCE($4, thumbnail),
       updated_at = NOW() WHERE id = $5 RETURNING *`,
      [content || '', title || '', description || '', thumbnail || null, existingCheck.rows[0].id]
    );
    if (updated.rows.length > 0) return mapRow(updated.rows[0]);
  }

  const { rows } = await query(
    `INSERT INTO fg_saved_items 
     (user_id, url, title, description, content, thumbnail, source, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, url, title, description || '', content || '', thumbnail || null, source || 'manual', sourceId || null]
  );

  return mapRow(rows[0]);
}

/**
 * Get saved items for a user
 */
export async function getSavedItems(
  userId: number,
  options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    includeArchived?: boolean;
    search?: string;
  } = {}
): Promise<{ items: SavedItem[]; total: number }> {
  const { limit = 20, offset = 0, unreadOnly = false, includeArchived = false, search } = options;

  let whereClause = 'user_id = $1';
  const params: any[] = [userId];
  let paramIndex = 2;

  if (unreadOnly) {
    whereClause += ' AND is_read = FALSE';
  }
  if (!includeArchived) {
    whereClause += ' AND is_archived = FALSE';
  }
  if (search) {
    whereClause += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR url ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const countResult = await query(
    `SELECT COUNT(*) as total FROM fg_saved_items WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const { rows } = await query(
    `SELECT * FROM fg_saved_items WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapRow),
    total,
  };
}

/**
 * Get a single saved item
 */
export async function getSavedItem(userId: number, id: number): Promise<SavedItem | null> {
  const { rows } = await query(
    'SELECT * FROM fg_saved_items WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/**
 * Check if URL is already saved
 */
export async function checkUrl(userId: number, url: string): Promise<{ saved: boolean; item?: SavedItem }> {
  const { rows } = await query(
    'SELECT * FROM fg_saved_items WHERE user_id = $1 AND url = $2',
    [userId, url]
  );
  if (rows.length > 0) {
    return { saved: true, item: mapRow(rows[0]) };
  }
  return { saved: false };
}

/**
 * Update a saved item
 */
export async function updateSavedItem(
  userId: number,
  id: number,
  updates: { isRead?: boolean; isArchived?: boolean; title?: string; description?: string }
): Promise<SavedItem | null> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  let paramIndex = 1;

  if (updates.isRead !== undefined) {
    setClauses.push(`is_read = $${paramIndex++}`);
    params.push(updates.isRead);
  }
  if (updates.isArchived !== undefined) {
    setClauses.push(`is_archived = $${paramIndex++}`);
    params.push(updates.isArchived);
  }
  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    params.push(updates.title);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    params.push(updates.description);
  }

  params.push(id, userId);

  const { rows } = await query(
    `UPDATE fg_saved_items SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
     RETURNING *`,
    params
  );

  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/**
 * Delete a saved item
 */
export async function deleteSavedItem(userId: number, id: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM fg_saved_items WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return (result.rowCount || 0) > 0;
}

/**
 * Bulk delete saved items
 */
export async function bulkDeleteSavedItems(userId: number, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
  const result = await query(
    `DELETE FROM fg_saved_items WHERE user_id = $1 AND id IN (${placeholders})`,
    [userId, ...ids]
  );
  return result.rowCount || 0;
}

/**
 * Mark all items as read
 */
export async function markAllRead(userId: number): Promise<number> {
  const result = await query(
    'UPDATE fg_saved_items SET is_read = TRUE, updated_at = NOW() WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
  return result.rowCount || 0;
}

/**
 * Get unread count
 */
export async function getUnreadCount(userId: number): Promise<number> {
  const { rows } = await query(
    'SELECT COUNT(*) as count FROM fg_saved_items WHERE user_id = $1 AND is_read = FALSE AND is_archived = FALSE',
    [userId]
  );
  return parseInt(rows[0].count);
}
