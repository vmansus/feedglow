/**
 * Page Watcher Service
 * Monitors web pages for content changes
 */

import { createHash } from 'crypto';
import { JSDOM } from 'jsdom';
import { query } from '../lib/db.js';

// ============ Types ============

interface WatchedPage {
  id: number;
  user_id: number;
  url: string;
  title: string | null;
  css_selector: string | null;
  check_interval_minutes: number;
  last_hash: string | null;
  last_content: string | null;
  last_checked_at: Date | null;
  last_changed_at: Date | null;
  is_active: boolean;
  created_at: Date;
}

// ============ Diff Algorithm ============

/**
 * Line-by-line diff with context. Only shows changed lines
 * plus a few lines of context around them.
 */
function computeDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build diff entries
  type DiffEntry = { type: 'same' | 'del' | 'ins'; text: string };
  const entries: DiffEntry[] = [];

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length) {
      if (oldLines[oi] === newLines[ni]) {
        entries.push({ type: 'same', text: oldLines[oi] });
        oi++; ni++;
      } else if (!newSet.has(oldLines[oi])) {
        entries.push({ type: 'del', text: oldLines[oi] });
        oi++;
      } else if (!oldSet.has(newLines[ni])) {
        entries.push({ type: 'ins', text: newLines[ni] });
        ni++;
      } else {
        entries.push({ type: 'del', text: oldLines[oi] });
        oi++;
      }
    } else if (oi < oldLines.length) {
      entries.push({ type: 'del', text: oldLines[oi] });
      oi++;
    } else {
      entries.push({ type: 'ins', text: newLines[ni] });
      ni++;
    }
  }

  // Show only changed lines with 1 line of context
  const CONTEXT = 1;
  const showLine = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].type !== 'same') {
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(entries.length - 1, i + CONTEXT); j++) {
        showLine.add(j);
      }
    }
  }

  const result: string[] = [];
  let lastShown = -2;

  for (let i = 0; i < entries.length; i++) {
    if (!showLine.has(i)) continue;

    // Add separator if there's a gap
    if (i > lastShown + 1 && lastShown >= 0) {
      result.push('<span class="diff-sep">···</span>');
    }
    lastShown = i;

    const e = entries[i];
    const escaped = escapeHtml(e.text);
    if (e.type === 'del') {
      result.push(`<del>− ${escaped}</del>`);
    } else if (e.type === 'ins') {
      result.push(`<ins>+ ${escaped}</ins>`);
    } else {
      result.push(`<span class="diff-same">  ${escaped}</span>`);
    }
  }

  if (result.length === 0) {
    return '<span class="diff-same">无变化</span>';
  }

  return result.join('\n');
}

/**
 * Extract text from DOM preserving block-level structure as line breaks.
 */
function extractStructuredText(node: any): string {
  const BLOCK_TAGS = new Set([
    'P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'ARTICLE', 'SECTION', 'BLOCKQUOTE', 'PRE', 'DT', 'DD', 'FIGCAPTION',
    'TD', 'TH', 'BR', 'HR',
  ]);

  const lines: string[] = [];
  let currentLine = '';

  function walk(el: any) {
    if (el.nodeType === 3) {
      // Text node
      const text = el.textContent?.replace(/\s+/g, ' ') || '';
      if (text.trim()) currentLine += text;
      return;
    }
    if (el.nodeType !== 1) return;

    const tag = el.tagName;
    if (BLOCK_TAGS.has(tag)) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
    }

    for (const child of el.childNodes) {
      walk(child);
    }

    if (BLOCK_TAGS.has(tag) && currentLine.trim()) {
      lines.push(currentLine.trim());
      currentLine = '';
    }
  }

  walk(node);
  if (currentLine.trim()) lines.push(currentLine.trim());

  // Deduplicate consecutive empty lines
  return lines.filter(l => l.length > 0).join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============ Content Extraction ============

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function fetchPageContent(url: string, cssSelector?: string | null): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FeedGlow/1.0 PageWatcher',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const html = await res.text();

    if (cssSelector) {
      // Extract content using CSS selector via jsdom
      const dom = new JSDOM(html);
      const elements = dom.window.document.querySelectorAll(cssSelector);
      if (elements.length === 0) {
        throw new Error(`CSS selector "${cssSelector}" matched no elements`);
      }
      const texts = Array.from(elements).map((el) => el.textContent?.trim() || '');
      return texts.join('\n');
    }

    // No selector — extract structured text with line breaks
    const dom = new JSDOM(html);
    const body = dom.window.document.body;
    // Remove script/style/noscript tags
    body.querySelectorAll('script, style, noscript, nav, footer, header').forEach((el) => el.remove());
    return extractStructuredText(body);
  } finally {
    clearTimeout(timeout);
  }
}

// ============ Core Functions ============

/**
 * Check a single watched page for changes
 */
export async function checkPage(pageId: number): Promise<{ changed: boolean; error?: string }> {
  // Get the page
  const { rows } = await query<WatchedPage>(
    'SELECT * FROM fg_watched_pages WHERE id = $1 AND is_active = true',
    [pageId]
  );

  if (rows.length === 0) {
    return { changed: false, error: 'Page not found or inactive' };
  }

  const page = rows[0];

  try {
    const content = await fetchPageContent(page.url, page.css_selector);
    const hash = hashContent(content);
    const now = new Date();

    if (page.last_hash && page.last_hash !== hash) {
      // Content changed!
      const diffHtml = computeDiff(page.last_content || '', content);

      // Insert change record
      await query(
        `INSERT INTO fg_page_changes (watched_page_id, old_content, new_content, diff_html, detected_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [pageId, page.last_content, content, diffHtml, now]
      );

      // Update watched page
      await query(
        `UPDATE fg_watched_pages 
         SET last_hash = $1, last_content = $2, last_checked_at = $3, last_changed_at = $3
         WHERE id = $4`,
        [hash, content, now, pageId]
      );

      console.log(`[PageWatcher] Change detected for page ${pageId}: ${page.url}`);
      return { changed: true };
    } else {
      // No change, just update check time (and set initial hash if first check)
      await query(
        `UPDATE fg_watched_pages 
         SET last_hash = $1, last_content = $2, last_checked_at = $3
         WHERE id = $4`,
        [hash, content, now, pageId]
      );

      return { changed: false };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PageWatcher] Error checking page ${pageId} (${page.url}):`, message);

    // Still update last_checked_at so we don't retry immediately
    await query(
      'UPDATE fg_watched_pages SET last_checked_at = NOW() WHERE id = $1',
      [pageId]
    );

    return { changed: false, error: message };
  }
}

/**
 * Check all pages that are due for a check
 */
export async function checkAllDuePages(): Promise<{ checked: number; changed: number }> {
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM fg_watched_pages 
     WHERE is_active = true 
       AND (last_checked_at IS NULL 
            OR last_checked_at + (check_interval_minutes || ' minutes')::interval < NOW())
     ORDER BY last_checked_at ASC NULLS FIRST
     LIMIT 20`
  );

  let checked = 0;
  let changed = 0;

  for (const row of rows) {
    const result = await checkPage(row.id);
    checked++;
    if (result.changed) changed++;

    // Small delay between checks to be polite
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (checked > 0) {
    console.log(`[PageWatcher] Checked ${checked} pages, ${changed} changed`);
  }

  return { checked, changed };
}
