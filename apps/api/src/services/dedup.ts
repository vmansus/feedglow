/**
 * Article Deduplication Service
 * Detects duplicate articles across RSS feeds for a user.
 */

import { query } from '../lib/db.js';

// ============ Types ============

export interface DuplicateMatch {
  entryId: number;
  duplicateOf: number;
  matchType: 'url' | 'title' | 'content';
  similarity: number;
}

export interface DuplicateInfo {
  id: number;
  entryId: number;
  duplicateOf: number;
  matchType: string;
  similarity: number;
  createdAt: string;
  // Joined from fg_entries
  originalTitle?: string;
  originalUrl?: string;
  originalFeedTitle?: string;
}

export interface DedupSettings {
  enabled: boolean;
  strategies: ('url' | 'title' | 'content')[];
  action: 'mark_read' | 'hide' | 'mark_only';
}

// ============ URL Normalization ============

/**
 * Normalize a URL for comparison:
 * - Strip protocol (http/https)
 * - Remove www. prefix
 * - Remove query params
 * - Remove trailing slash
 * - Remove fragment
 * - Lowercase
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    // Keep pathname, remove trailing slash
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${host}${path}`;
  } catch {
    // If URL parsing fails, do basic normalization
    return url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\?.*$/, '')
      .replace(/#.*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }
}

// ============ Title Similarity ============

/**
 * Tokenize a string into words for Jaccard similarity
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)
  );
}

/**
 * Compute Jaccard similarity between two sets
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if two titles are similar enough to be duplicates.
 * Returns similarity score (0-1), or 0 if not similar enough.
 */
function titleSimilarity(titleA: string, titleB: string): number {
  if (!titleA || !titleB) return 0;

  // Exact match (case-insensitive)
  if (titleA.toLowerCase().trim() === titleB.toLowerCase().trim()) return 1.0;

  const tokensA = tokenize(titleA);
  const tokensB = tokenize(titleB);
  return jaccardSimilarity(tokensA, tokensB);
}

// ============ Core Dedup Logic ============

/**
 * Find duplicates for a given entry within the same user's entries.
 * Looks at entries from OTHER feeds only (same feed dedup is handled by hash).
 */
export async function findDuplicates(
  userId: number,
  entryId: number
): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = [];

  // Get the entry to check
  const entryResult = await query(
    'SELECT id, feed_id, url, title, content_hash FROM fg_entries WHERE id = $1 AND user_id = $2',
    [entryId, userId]
  );
  if (entryResult.rows.length === 0) return matches;

  const entry = entryResult.rows[0];
  const normalizedUrl = normalizeUrl(entry.url);

  // Get user's dedup settings
  const settings = await getDedupSettings(userId);
  if (!settings.enabled) return matches;

  // 1. URL match: find entries from other feeds with the same normalized URL
  if (settings.strategies.includes('url')) {
    const urlCandidates = await query(
      `SELECT id, url FROM fg_entries 
       WHERE user_id = $1 AND feed_id != $2 AND id != $3 AND id < $3
       ORDER BY id DESC LIMIT 500`,
      [userId, entry.feed_id, entryId]
    );

    for (const candidate of urlCandidates.rows) {
      if (normalizeUrl(candidate.url) === normalizedUrl) {
        matches.push({
          entryId,
          duplicateOf: candidate.id,
          matchType: 'url',
          similarity: 1.0,
        });
        break; // One URL match is enough
      }
    }
  }

  // 2. Content hash match
  if (settings.strategies.includes('content') && entry.content_hash && entry.content_hash !== 'full') {
    const hashMatch = await query(
      `SELECT id FROM fg_entries 
       WHERE user_id = $1 AND feed_id != $2 AND id != $3 AND id < $3
         AND content_hash = $4 AND content_hash IS NOT NULL AND content_hash != 'full'
       ORDER BY id ASC LIMIT 1`,
      [userId, entry.feed_id, entryId, entry.content_hash]
    );

    if (hashMatch.rows.length > 0) {
      // Avoid duplicate marking if already matched by URL
      const alreadyMatched = matches.some(m => m.duplicateOf === hashMatch.rows[0].id);
      if (!alreadyMatched) {
        matches.push({
          entryId,
          duplicateOf: hashMatch.rows[0].id,
          matchType: 'content',
          similarity: 1.0,
        });
      }
    }
  }

  // 3. Title similarity match
  if (settings.strategies.includes('title') && entry.title) {
    // Only check recent entries (last 1000) from other feeds
    const titleCandidates = await query(
      `SELECT id, title FROM fg_entries 
       WHERE user_id = $1 AND feed_id != $2 AND id != $3 AND id < $3
       ORDER BY id DESC LIMIT 1000`,
      [userId, entry.feed_id, entryId]
    );

    for (const candidate of titleCandidates.rows) {
      const sim = titleSimilarity(entry.title, candidate.title);
      if (sim > 0.8) {
        // Check not already matched
        const alreadyMatched = matches.some(m => m.duplicateOf === candidate.id);
        if (!alreadyMatched) {
          matches.push({
            entryId,
            duplicateOf: candidate.id,
            matchType: 'title',
            similarity: sim,
          });
          break; // Take first (most recent) title match
        }
      }
    }
  }

  return matches;
}

/**
 * Mark an entry as a duplicate of another
 */
export async function markDuplicate(
  userId: number,
  entryId: number,
  duplicateOf: number,
  matchType: string,
  similarity: number = 1.0
): Promise<void> {
  await query(
    `INSERT INTO fg_entry_duplicates (user_id, entry_id, duplicate_of, match_type, similarity)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (entry_id, duplicate_of) DO UPDATE SET
       match_type = EXCLUDED.match_type,
       similarity = EXCLUDED.similarity`,
    [userId, entryId, duplicateOf, matchType, similarity]
  );
}

/**
 * Get all duplicates for an entry (both as source and as duplicate)
 */
export async function getDuplicatesForEntry(
  entryId: number
): Promise<DuplicateInfo[]> {
  const result = await query(
    `SELECT d.*, 
            e.title as original_title, 
            e.url as original_url,
            f.title as original_feed_title
     FROM fg_entry_duplicates d
     JOIN fg_entries e ON d.duplicate_of = e.id
     JOIN fg_feeds f ON e.feed_id = f.id
     WHERE d.entry_id = $1
     UNION
     SELECT d.*,
            e.title as original_title,
            e.url as original_url,
            f.title as original_feed_title
     FROM fg_entry_duplicates d
     JOIN fg_entries e ON d.entry_id = e.id
     JOIN fg_feeds f ON e.feed_id = f.id
     WHERE d.duplicate_of = $1
     ORDER BY created_at DESC`,
    [entryId]
  );

  return result.rows.map(row => ({
    id: row.id,
    entryId: row.entry_id,
    duplicateOf: row.duplicate_of,
    matchType: row.match_type,
    similarity: row.similarity,
    createdAt: row.created_at,
    originalTitle: row.original_title,
    originalUrl: row.original_url,
    originalFeedTitle: row.original_feed_title,
  }));
}

/**
 * Run dedup check for an entry and apply configured action
 */
export async function checkAndMarkDuplicates(
  userId: number,
  entryId: number
): Promise<DuplicateMatch[]> {
  const matches = await findDuplicates(userId, entryId);

  if (matches.length === 0) return matches;

  const settings = await getDedupSettings(userId);

  for (const match of matches) {
    await markDuplicate(userId, match.entryId, match.duplicateOf, match.matchType, match.similarity);
  }

  // Apply action based on settings
  if (settings.action === 'mark_read') {
    await query(
      "UPDATE fg_entries SET status = 'read' WHERE id = $1 AND user_id = $2",
      [entryId, userId]
    );
  } else if (settings.action === 'hide') {
    await query(
      "UPDATE fg_entries SET status = 'removed' WHERE id = $1 AND user_id = $2",
      [entryId, userId]
    );
  }
  // 'mark_only' — just records the duplicate, no status change

  return matches;
}

/**
 * Batch check duplicates for a user (manual trigger).
 * Checks recent unread entries.
 */
export async function batchCheckDuplicates(
  userId: number,
  limit: number = 200
): Promise<{ checked: number; duplicatesFound: number }> {
  const entries = await query(
    `SELECT id FROM fg_entries 
     WHERE user_id = $1 AND status = 'unread'
     ORDER BY id DESC LIMIT $2`,
    [userId, limit]
  );

  let duplicatesFound = 0;
  for (const row of entries.rows) {
    // Skip if already has duplicates recorded
    const existing = await query(
      'SELECT 1 FROM fg_entry_duplicates WHERE entry_id = $1 LIMIT 1',
      [row.id]
    );
    if (existing.rows.length > 0) continue;

    const matches = await checkAndMarkDuplicates(userId, row.id);
    duplicatesFound += matches.length;
  }

  return { checked: entries.rows.length, duplicatesFound };
}

// ============ Settings ============

const DEFAULT_DEDUP_SETTINGS: DedupSettings = {
  enabled: true,
  strategies: ['url', 'title', 'content'],
  action: 'mark_only',
};

/**
 * Get dedup settings for a user
 */
export async function getDedupSettings(userId: number): Promise<DedupSettings> {
  const result = await query(
    'SELECT dedup_settings FROM fg_user_settings WHERE user_id = $1',
    [userId]
  );

  if (!result.rows[0]?.dedup_settings) {
    return DEFAULT_DEDUP_SETTINGS;
  }

  return { ...DEFAULT_DEDUP_SETTINGS, ...result.rows[0].dedup_settings };
}

/**
 * Update dedup settings for a user
 */
export async function updateDedupSettings(
  userId: number,
  settings: Partial<DedupSettings>
): Promise<DedupSettings> {
  const current = await getDedupSettings(userId);
  const merged = { ...current, ...settings };

  await query(
    `UPDATE fg_user_settings SET dedup_settings = $1, updated_at = NOW() WHERE user_id = $2`,
    [JSON.stringify(merged), userId]
  );

  return merged;
}
