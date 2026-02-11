/**
 * Newsletter Email Subscription Service
 * Handles inbound email parsing and newsletter address management
 */

import { createHash } from 'crypto';
import { query } from '../lib/db.js';
import sanitizeHtml from 'sanitize-html';

// ============ DB Setup ============

export async function ensureNewsletterTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS fg_newsletter_addresses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      feed_id INTEGER NOT NULL REFERENCES fg_feeds(id) ON DELETE CASCADE,
      address VARCHAR(64) NOT NULL UNIQUE,
      sender_filter TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_newsletter_addr ON fg_newsletter_addresses(address)
  `);
}

// ============ Address Generation ============

function generateAddress(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const prefix = 'fg-';
  let result = prefix;
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============ Email HTML Sanitization ============

export function sanitizeNewsletterHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'a', 'img',
      'blockquote', 'pre', 'code',
      'strong', 'b', 'em', 'i', 'u', 's', 'del',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span', 'sup', 'sub',
      'figure', 'figcaption',
    ],
    allowedAttributes: {
      'a': ['href', 'title', 'target'],
      'img': ['src', 'alt', 'width', 'height', 'title'],
      'td': ['colspan', 'rowspan'],
      'th': ['colspan', 'rowspan'],
    },
    // Remove tracking pixels (1x1 images)
    exclusiveFilter: (frame) => {
      if (frame.tag === 'img') {
        const w = parseInt(frame.attribs.width || '0');
        const h = parseInt(frame.attribs.height || '0');
        if (w <= 1 && h <= 1) return true;
        // Remove tracking pixels by common patterns
        const src = frame.attribs.src || '';
        if (src.includes('tracking') || src.includes('pixel') || src.includes('open.') || src.includes('beacon')) {
          return true;
        }
      }
      return false;
    },
    transformTags: {
      'a': (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    },
  });
}

// ============ Simple Email Parser ============

interface ParsedEmail {
  from: string;
  subject: string;
  date: Date;
  html: string;
  text: string;
}

/**
 * Lightweight email parser - handles the common cases without heavy dependencies.
 * For CF Worker forwarded JSON, we already have structured fields.
 * For raw MIME, do basic multipart parsing.
 */
export function parseEmailContent(rawOrHtml: string, fallbackSubject?: string, fallbackFrom?: string): ParsedEmail {
  // If it looks like raw MIME, do basic extraction
  if (rawOrHtml.startsWith('From:') || rawOrHtml.startsWith('MIME-Version') || rawOrHtml.includes('\r\nContent-Type:')) {
    return parseRawMime(rawOrHtml);
  }

  // Otherwise treat as pre-parsed HTML content
  return {
    from: fallbackFrom || 'unknown',
    subject: fallbackSubject || '(untitled)',
    date: new Date(),
    html: rawOrHtml,
    text: rawOrHtml.replace(/<[^>]+>/g, ''),
  };
}

function parseRawMime(raw: string): ParsedEmail {
  const lines = raw.split(/\r?\n/);
  let subject = '';
  let from = '';
  let date = new Date();
  let inHeaders = true;
  let boundary = '';
  let htmlPart = '';
  let textPart = '';

  // Parse headers
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '' || lines[i] === '\r') {
      inHeaders = false;
      // Check for boundary in content-type
      const headerBlock = lines.slice(0, i).join('\n');
      const boundaryMatch = headerBlock.match(/boundary="?([^";\s]+)"?/i);
      if (boundaryMatch) boundary = boundaryMatch[1];
      break;
    }

    const headerMatch = lines[i].match(/^([^:]+):\s*(.*)$/);
    if (headerMatch) {
      const key = headerMatch[1].toLowerCase();
      const val = headerMatch[2];
      if (key === 'subject') subject = decodeHeader(val);
      if (key === 'from') from = val;
      if (key === 'date') {
        try { date = new Date(val); } catch { /* keep default */ }
      }
    }
  }

  if (boundary) {
    // Multipart - extract HTML and text parts
    const parts = raw.split(`--${boundary}`);
    for (const part of parts) {
      if (part.includes('Content-Type: text/html')) {
        const bodyStart = part.indexOf('\r\n\r\n') || part.indexOf('\n\n');
        if (bodyStart > -1) htmlPart = part.slice(bodyStart + 4).trim();
      } else if (part.includes('Content-Type: text/plain')) {
        const bodyStart = part.indexOf('\r\n\r\n') || part.indexOf('\n\n');
        if (bodyStart > -1) textPart = part.slice(bodyStart + 4).trim();
      }
    }
  } else {
    // Single part
    const bodyStart = raw.indexOf('\r\n\r\n') || raw.indexOf('\n\n');
    if (bodyStart > -1) {
      const body = raw.slice(bodyStart + 4);
      if (raw.toLowerCase().includes('content-type: text/html')) {
        htmlPart = body;
      } else {
        textPart = body;
      }
    }
  }

  // Decode base64 if needed
  if (htmlPart && raw.toLowerCase().includes('content-transfer-encoding: base64')) {
    try { htmlPart = Buffer.from(htmlPart.replace(/\s/g, ''), 'base64').toString('utf-8'); } catch { /* keep as-is */ }
  }
  if (textPart && raw.toLowerCase().includes('content-transfer-encoding: base64')) {
    try { textPart = Buffer.from(textPart.replace(/\s/g, ''), 'base64').toString('utf-8'); } catch { /* keep as-is */ }
  }

  return {
    from,
    subject: subject || '(untitled)',
    date: isNaN(date.getTime()) ? new Date() : date,
    html: htmlPart || `<pre>${textPart}</pre>`,
    text: textPart || htmlPart.replace(/<[^>]+>/g, ''),
  };
}

function decodeHeader(val: string): string {
  // Decode =?UTF-8?B?...?= encoded headers
  return val.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_, charset, encoding, data) => {
    if (encoding.toUpperCase() === 'B') {
      return Buffer.from(data, 'base64').toString('utf-8');
    }
    // Q encoding
    return data.replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16))).replace(/_/g, ' ');
  });
}

// ============ CRUD Operations ============

export interface NewsletterSubscription {
  id: number;
  userId: number;
  feedId: number;
  address: string;
  fullAddress: string;
  senderFilter: string | null;
  feedTitle: string;
  categoryId: number | null;
  categoryTitle: string | null;
  entryCount: number;
  createdAt: string;
}

const NEWSLETTER_DOMAIN = process.env.NEWSLETTER_DOMAIN || 'mail.example.com';

export async function createNewsletterSubscription(
  userId: number,
  name: string,
  categoryId?: number,
  senderFilter?: string
): Promise<NewsletterSubscription> {
  // Generate unique address (retry on collision)
  let address: string;
  let attempts = 0;
  do {
    address = generateAddress();
    const existing = await query('SELECT 1 FROM fg_newsletter_addresses WHERE address = $1', [address]);
    if (existing.rows.length === 0) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) throw new Error('Failed to generate unique address');

  // Create a feed for this newsletter
  const feedUrl = `newsletter://${address}@${NEWSLETTER_DOMAIN}`;
  const feedResult = await query(
    `INSERT INTO fg_feeds (user_id, feed_url, title, site_url, description, category_id, feed_type, disabled)
     VALUES ($1, $2, $3, $4, $5, $6, 'newsletter', true)
     RETURNING id`,
    [userId, feedUrl, name, `mailto:${address}@${NEWSLETTER_DOMAIN}`, `Newsletter: ${name}`, categoryId || null]
  );
  const feedId = feedResult.rows[0].id;

  // Create the address record
  const result = await query(
    `INSERT INTO fg_newsletter_addresses (user_id, feed_id, address, sender_filter)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, feedId, address, senderFilter || null]
  );

  return {
    id: result.rows[0].id,
    userId,
    feedId,
    address,
    fullAddress: `${address}@${NEWSLETTER_DOMAIN}`,
    senderFilter: senderFilter || null,
    feedTitle: name,
    categoryId: categoryId || null,
    categoryTitle: null,
    entryCount: 0,
    createdAt: result.rows[0].created_at,
  };
}

export async function listNewsletterSubscriptions(userId: number): Promise<NewsletterSubscription[]> {
  const result = await query(
    `SELECT na.*, f.title as feed_title, f.category_id, f.entry_count,
            c.title as category_title
     FROM fg_newsletter_addresses na
     JOIN fg_feeds f ON na.feed_id = f.id
     LEFT JOIN fg_categories c ON f.category_id = c.id
     WHERE na.user_id = $1
     ORDER BY na.created_at DESC`,
    [userId]
  );

  return result.rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    feedId: r.feed_id,
    address: r.address,
    fullAddress: `${r.address}@${NEWSLETTER_DOMAIN}`,
    senderFilter: r.sender_filter,
    feedTitle: r.feed_title,
    categoryId: r.category_id,
    categoryTitle: r.category_title,
    entryCount: r.entry_count || 0,
    createdAt: r.created_at,
  }));
}

export async function deleteNewsletterSubscription(id: number, userId: number): Promise<boolean> {
  // This cascades to fg_feeds → fg_entries via ON DELETE CASCADE
  const result = await query(
    `DELETE FROM fg_newsletter_addresses WHERE id = $1 AND user_id = $2 RETURNING feed_id`,
    [id, userId]
  );
  if (result.rows.length === 0) return false;

  // Also delete the feed
  await query('DELETE FROM fg_feeds WHERE id = $1', [result.rows[0].feed_id]);
  return true;
}

export async function updateNewsletterSubscription(
  id: number,
  userId: number,
  updates: { name?: string; categoryId?: number | null; senderFilter?: string | null }
): Promise<boolean> {
  const addr = await query(
    'SELECT feed_id FROM fg_newsletter_addresses WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (addr.rows.length === 0) return false;
  const feedId = addr.rows[0].feed_id;

  if (updates.name !== undefined) {
    await query('UPDATE fg_feeds SET title = $1 WHERE id = $2', [updates.name, feedId]);
  }
  if (updates.categoryId !== undefined) {
    await query('UPDATE fg_feeds SET category_id = $1 WHERE id = $2', [updates.categoryId, feedId]);
  }
  if (updates.senderFilter !== undefined) {
    await query('UPDATE fg_newsletter_addresses SET sender_filter = $1 WHERE id = $2', [updates.senderFilter, id]);
  }

  return true;
}

// ============ Inbound Email Processing ============

export async function processInboundEmail(
  toAddress: string,
  fromEmail: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
  rawDate?: string
): Promise<{ ok: boolean; error?: string }> {
  // 1. Look up address
  const addr = await query(
    `SELECT na.*, f.user_id FROM fg_newsletter_addresses na
     JOIN fg_feeds f ON na.feed_id = f.id
     WHERE na.address = $1`,
    [toAddress]
  );
  if (addr.rows.length === 0) {
    return { ok: false, error: 'unknown address' };
  }

  const { feed_id, user_id, sender_filter } = addr.rows[0];

  // 2. Sender filter check
  if (sender_filter && !fromEmail.toLowerCase().includes(sender_filter.toLowerCase())) {
    return { ok: false, error: 'sender rejected' };
  }

  // 3. Sanitize HTML
  const cleanHtml = sanitizeNewsletterHtml(htmlContent || `<pre>${textContent || ''}</pre>`);

  // 4. Generate dedup hash
  const publishedAt = rawDate ? new Date(rawDate) : new Date();
  const hash = createHash('sha256')
    .update(`${fromEmail}:${subject}:${publishedAt.toISOString().slice(0, 10)}`)
    .digest('hex').slice(0, 16);

  // 5. Calculate reading stats
  const text = textContent || cleanHtml.replace(/<[^>]+>/g, '');
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  // 6. Insert entry
  try {
    await query(
      `INSERT INTO fg_entries 
       (user_id, feed_id, hash, title, url, content, author, status, published_at, word_count, reading_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'unread', $8, $9, $10)
       ON CONFLICT (feed_id, hash) DO NOTHING`,
      [user_id, feed_id, hash, subject || '(untitled)',
       `mailto:${fromEmail}`, cleanHtml, fromEmail,
       isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
       wordCount, readingTime]
    );
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  // 7. Update feed stats
  await query(
    `UPDATE fg_feeds SET entry_count = (
       SELECT COUNT(*) FROM fg_entries WHERE feed_id = $1
     ), checked_at = NOW() WHERE id = $1`,
    [feed_id]
  );

  return { ok: true };
}
