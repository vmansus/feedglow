'use client';

import { useEffect, useRef, useCallback } from 'react';
import { translateParagraphs } from '@/lib/api';
import { t } from '@/lib/i18n';

interface HighlightData {
  id: number;
  text: string;
  color: string;
  note?: string | null;
  position_start?: number | null;
  position_end?: number | null;
}

interface BilingualContentProps {
  content: string;
  entryId: number;
  enabled: boolean;
  entryUrl?: string;
  /** The RSS <author> field — for RT tweets this is the retweeter (feed owner) */
  entryAuthor?: string;
  /** Feed title, e.g. "Twitter @Elon Musk" */
  feedTitle?: string;
  /** Saved highlights to render on the content */
  highlights?: HighlightData[];
}

// Get language from localStorage or default to zh-CN
function getTranslateLanguage(): string {
  if (typeof window === 'undefined') return 'zh-CN';
  return localStorage.getItem('translateLanguage') || 'zh-CN';
}

// Cache key for localStorage
function getCacheKey(entryId: number, lang: string) {
  return `feedglow_trans_${entryId}_${lang}`;
}

// Load cached translations
function loadCache(entryId: number, lang: string): Record<string, string> {
  try {
    const cached = localStorage.getItem(getCacheKey(entryId, lang));
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

// Save to cache
function saveCache(entryId: number, lang: string, cache: Record<string, string>) {
  try {
    localStorage.setItem(getCacheKey(entryId, lang), JSON.stringify(cache));
  } catch {
    // Storage full, ignore
  }
}

export function BilingualContent({ content, entryId, enabled, entryUrl, entryAuthor, feedTitle, highlights }: BilingualContentProps) {
  const language = getTranslateLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const translationCache = useRef<Record<string, string>>({});
  const pendingTexts = useRef<Map<Element, string>>(new Map());
  const batchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Initialize and setup observer
  useEffect(() => {
    if (!containerRef.current) return;

    // Load cache
    translationCache.current = loadCache(entryId, language);

    // Pre-process: rewrite twimg.com URLs to proxy BEFORE injecting HTML
    // This prevents the browser from trying to fetch the original CORS-blocked URLs
    let processedContent = content;
    const isTwitterFeed = content.includes('rsshub-quote') || content.includes('twitter.com') || content.includes('x.com') || content.includes('twimg.com') || /^RT\s+/.test(content);
    if (isTwitterFeed) {
      // Rewrite video src and poster URLs
      processedContent = processedContent.replace(
        /(?:src|poster)="(https?:\/\/(?:video|pbs|abs)\.twimg\.com\/[^"]+)"/g,
        (match, url) => {
          const attr = match.startsWith('src') ? 'src' : 'poster';
          return `${attr}="/api/proxy/media?url=${encodeURIComponent(url)}"`;
        }
      );
    }

    // Inject HTML (with proxied URLs if Twitter)
    containerRef.current.innerHTML = processedContent;

    // Secure all external links
    containerRef.current.querySelectorAll('a[href]').forEach((a) => {
      a.setAttribute('rel', 'noopener noreferrer');
      a.setAttribute('referrerpolicy', 'no-referrer');
      a.setAttribute('target', '_blank');
    });
    
    if (isTwitterFeed) {
      const container = containerRef.current;
      
      // 1. Style "RT Username" — it's always the first text node of the container
      //    HTML format: "RT OriginalAuthor<br>tweet text<div class='rsshub-quote'>..."
      //    In RSSHub output: "RT X" means the feed owner retweeted X's tweet
      //    So X = original author, entryAuthor (from <author> tag) = retweeter
      const firstChild = container.firstChild;
      if (firstChild?.nodeType === 3) {
        const text = firstChild.textContent || '';
        const rtMatch = text.match(/^RT\s+(.+)/);
        if (rtMatch) {
          const originalAuthor = rtMatch[1].trim();
          // The retweeter is the feed owner (from <author> tag), e.g. "Elon Musk"
          const retweeter = entryAuthor || feedTitle?.replace(/^Twitter @/, '') || '';
          
          // Build RT header: "🔁 RetweeterName 转推"
          const rtHeader = document.createElement('div');
          rtHeader.className = 'tweet-rt-header';
          rtHeader.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg><span>${retweeter} ${t('entry.retweet')}</span>`;
          
          // Build original author header: "𝕏 OriginalAuthor"
          const authorHeader = document.createElement('div');
          authorHeader.className = 'tweet-original-author';
          authorHeader.innerHTML = `<svg class="tweet-x-badge" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg><span class="tweet-author-name">${originalAuthor}</span>`;
          
          container.replaceChild(rtHeader, firstChild);
          // Remove <br> right after RT header
          while (rtHeader.nextSibling?.nodeName === 'BR') {
            rtHeader.nextSibling.remove();
          }
          // Insert original author header after RT header
          rtHeader.insertAdjacentElement('afterend', authorHeader);
        }
      }
      
      // 2. Style rsshub-quote blocks as tweet cards
      container.querySelectorAll('.rsshub-quote').forEach((quote) => {
        const el = quote as HTMLElement;
        
        // Remove leading <br> tags
        while (el.firstChild && el.firstChild.nodeName === 'BR') {
          el.removeChild(el.firstChild);
        }
        
        // Extract quoted author from first text node (format: "Username: tweet text" or just "Username")
        let authorNode: ChildNode | null = null;
        for (const child of Array.from(el.childNodes)) {
          if (child.nodeType === 3 && child.textContent?.trim()) {
            authorNode = child;
            break;
          }
        }
        
        if (authorNode) {
          const text = authorNode.textContent?.trim() || '';
          const colonIdx = text.indexOf(':');
          let author = '';
          let rest = '';
          
          if (colonIdx > 0 && colonIdx < 50) {
            author = text.substring(0, colonIdx).trim();
            rest = text.substring(colonIdx + 1).trim();
          } else if (text.length < 50 && !text.includes(' ')) {
            // Just a username without colon
            author = text;
          }
          
          if (author) {
            const header = document.createElement('div');
            header.className = 'quote-author-header';
            header.innerHTML = `<svg class="quote-x-badge" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg><span class="quote-author-name">${author}</span>`;
            
            if (rest) {
              const restNode = document.createTextNode(rest);
              el.insertBefore(restNode, authorNode.nextSibling);
            }
            el.replaceChild(header, authorNode);
            
            // Remove <br> right after header
            if (header.nextSibling?.nodeName === 'BR') {
              header.nextSibling.remove();
            }
          }
        }
      });
      
      // 3. Style video elements and add error fallback
      //    (URLs already proxied via pre-processing above)
      container.querySelectorAll('video').forEach((video) => {
        video.setAttribute('controls', 'true');
        video.setAttribute('preload', 'metadata');
        video.setAttribute('playsinline', 'true');
        video.removeAttribute('autoplay');
        video.removeAttribute('loop');
        video.removeAttribute('muted');
        
        // Fallback: if proxy fails, show poster with play button linking to Twitter
        const poster = video.getAttribute('poster') || '';
        video.addEventListener('error', () => {
          const wrapper = document.createElement('div');
          wrapper.className = 'tweet-video-fallback';
          wrapper.innerHTML = `
            ${poster ? `<img src="${poster}" />` : '<div style="height:200px;background:#1a1a1a;border-radius:0.625rem;"></div>'}
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);">
              <div style="background:rgba(29,155,240,0.9);border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <div style="position:absolute;bottom:8px;left:8px;font-size:11px;color:white;opacity:0.7;">${t('entry.watchOnX')}</div>
          `;
          wrapper.addEventListener('click', () => {
            window.open(entryUrl || 'https://x.com', '_blank');
          });
          video.parentNode?.replaceChild(wrapper, video);
        }, { once: true });
      });
      
      // 4. Images already proxied via pre-processing (no extra work needed)
    }

    // ============ Pre-process: normalize nested div/span into <p> tags ============
    // Twitter Clipper content uses <div><div><span><span>text</span></span></div></div>
    // per paragraph. Each leaf div should become its own <p> for proper prose spacing.
    const container = containerRef.current;

    // Detect nested div/span article structure (Twitter Clipper signature)
    const nestedTextSpans = container.querySelectorAll('div > span > span');
    if (nestedTextSpans.length > 3) {
      // Collect unique leaf divs that directly wrap text spans
      const leafDivs: HTMLElement[] = [];
      const seen = new WeakSet<HTMLElement>();

      container.querySelectorAll('div').forEach(div => {
        const el = div as HTMLElement;
        if (seen.has(el)) return;

        const text = el.textContent?.trim() || '';
        if (text.length < 5) return;

        // Skip layout divs (display/flex/grid styles)
        const style = el.getAttribute('style') || '';
        if (/display\s*:|flex|grid|align-items/i.test(style)) return;

        // Skip divs with media elements
        if (el.querySelector('img, video, iframe, audio, svg')) return;

        // Must contain a <span> with text
        if (!el.querySelector('span')) return;

        // Must be a leaf: no descendant divs with substantial text
        const hasChildDivWithText = Array.from(el.querySelectorAll('div')).some(
          c => (c.textContent?.trim().length || 0) > 5
        );
        if (hasChildDivWithText) return;

        seen.add(el);
        leafDivs.push(el);
      });

      // Convert each leaf div to its own <p> element (no merging!)
      if (leafDivs.length > 3) {
        for (const div of leafDivs) {
          const text = div.textContent?.trim();
          if (!text || text.length < 3) continue;
          const p = document.createElement('p');
          p.textContent = text;
          div.parentNode?.insertBefore(p, div);
          div.remove();
        }
      }
    }

    // ============ Apply Highlights ============
    // Remove old note icons
    containerRef.current.querySelectorAll('.feedglow-note-icon').forEach(el => el.remove());

    if (highlights && highlights.length > 0) {
      applyHighlightsWithNoteIcons(containerRef.current, highlights);
    }

    // ============ Translation ============
    if (!enabled) return;

    // Find all block elements that should be translated
    const blocks = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td');
    const processedTexts = new Set<string>();
    
    blocks.forEach((block) => {
      // Skip if already has translation
      if (block.nextElementSibling?.classList.contains('feedglow-translation')) return;
      
      const text = block.textContent?.trim();
      if (!text || text.length < 15) return; // Skip short text
      
      // Normalize text for dedup (remove extra whitespace)
      const normalizedText = text.replace(/\s+/g, ' ');
      if (processedTexts.has(normalizedText)) return; // Skip duplicates
      processedTexts.add(normalizedText);
      
      // Create translation container
      const transDiv = document.createElement('div');
      transDiv.className = 'feedglow-translation';
      transDiv.style.cssText = `
        margin-top: 0.5rem;
        margin-bottom: 1rem;
        padding-left: 0.75rem;
        border-left: 2px solid rgba(249, 115, 22, 0.4);
        color: rgba(249, 115, 22, 0.9);
        font-size: 0.875rem;
        line-height: 1.6;
      `;
      
      // Check cache first
      if (translationCache.current[text]) {
        transDiv.textContent = translationCache.current[text];
      } else {
        transDiv.innerHTML = `<span style="opacity: 0.5">${t('entry.translate.scrollToTranslate')}</span>`;
        transDiv.setAttribute('data-pending', 'true');
        transDiv.setAttribute('data-text', text);
      }
      
      // Insert after the last element of this paragraph group
      block.parentNode?.insertBefore(transDiv, block.nextSibling);
    });

    // Setup Intersection Observer for lazy loading
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            if (el.getAttribute('data-pending') === 'true') {
              const text = el.getAttribute('data-text');
              if (text) {
                pendingTexts.current.set(el, text);
                scheduleBatch();
              }
            }
          }
        });
      },
      { rootMargin: '200px', threshold: 0.1 }
    );

    // Observe all pending translation divs
    containerRef.current.querySelectorAll('.feedglow-translation[data-pending="true"]').forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
      if (batchTimeout.current) clearTimeout(batchTimeout.current);
    };
  }, [content, entryId, enabled, language, entryUrl, highlights]);

  // Batch translate
  const scheduleBatch = useCallback(() => {
    if (batchTimeout.current) clearTimeout(batchTimeout.current);
    
    batchTimeout.current = setTimeout(async () => {
      const pending = Array.from(pendingTexts.current.entries());
      if (pending.length === 0) return;
      
      // Take up to 5 at a time
      const batch = pending.slice(0, 5);
      const texts = batch.map(([, text]) => text);
      const elements = batch.map(([el]) => el);
      
      // Mark as loading
      elements.forEach((el) => {
        (el as HTMLElement).innerHTML = `
          <span style="display: inline-flex; align-items: center; gap: 0.5rem; opacity: 0.5">
            <span style="width: 12px; height: 12px; border: 2px solid rgba(249,115,22,0.3); border-top-color: rgb(249,115,22); border-radius: 50%; animation: spin 1s linear infinite"></span>
            ${t('entry.translate.translating')}
          </span>
        `;
      });
      
      // Remove from pending
      batch.forEach(([el]) => pendingTexts.current.delete(el));
      
      try {
        const translations = await translateParagraphs(texts, language);
        
        elements.forEach((el, i) => {
          const htmlEl = el as HTMLElement;
          htmlEl.textContent = translations[i] || t('entry.translate.failed');
          htmlEl.removeAttribute('data-pending');
          htmlEl.removeAttribute('data-text');
          observerRef.current?.unobserve(el);
          
          // Cache it
          translationCache.current[texts[i]] = translations[i];
        });
        
        // Save cache
        saveCache(entryId, language, translationCache.current);
        
        // Process remaining if any
        if (pendingTexts.current.size > 0) {
          scheduleBatch();
        }
      } catch {
        elements.forEach((el) => {
          (el as HTMLElement).textContent = t('entry.translate.failed');
        });
      }
    }, 150);
  }, [entryId, language]);

  // Add CSS animation for spinner
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const styleId = 'feedglow-trans-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      style={{ fontSize: 'inherit', lineHeight: 'inherit', fontFamily: 'inherit' }}
      className="prose dark:prose-invert max-w-none prose-img:rounded-xl prose-a:text-orange-500 prose-a:no-underline hover:prose-a:underline prose-headings:text-[rgb(var(--text-primary))] prose-p:text-[rgb(var(--text-secondary))]"
    />
  );
}

// ============ Highlight Rendering ============
// Uses CSS Custom Highlights API (zero DOM modification).
// Creates Range objects and registers them with CSS.highlights.
// The browser paints the highlights via ::highlight() pseudo-elements.
// Fallback: inline <mark> tags for unsupported browsers.

const HIGHLIGHT_COLOR_NAMES = ['yellow', 'green', 'blue', 'red'] as const;

/**
 * Apply highlights + insert clickable note icons at the end of highlights that have notes.
 */
function applyHighlightsWithNoteIcons(container: HTMLElement, highlights: HighlightData[]): void {
  const supportsCustomHighlights = typeof CSS !== 'undefined' && 'highlights' in CSS;

  // STEP 1: Find ALL ranges on pristine DOM
  const rangeMap: { hl: HighlightData; range: Range }[] = [];
  for (const hl of highlights) {
    if (!hl.text || hl.text.length < 2) continue;
    const range = findTextRange(container, hl.text, hl.position_start, hl.position_end);
    if (range) {
      rangeMap.push({ hl, range });
    }
  }

  // STEP 2: Insert note icons at the END of highlights that have notes
  // (done before mark tags to avoid DOM corruption, but after finding ranges)
  for (const { hl, range } of rangeMap) {
    if (!hl.note?.trim()) continue;
    try {
      const icon = document.createElement('span');
      icon.className = 'feedglow-note-icon';
      icon.setAttribute('data-note-id', String(hl.id));
      icon.setAttribute('data-note-text', hl.note);
      icon.innerHTML = '💬';
      // Insert after the range end
      const endNode = range.endContainer;
      if (endNode.nodeType === Node.TEXT_NODE && endNode.parentNode) {
        if (range.endOffset < (endNode.textContent?.length || 0)) {
          (endNode as Text).splitText(range.endOffset);
        }
        endNode.parentNode.insertBefore(icon, endNode.nextSibling);
      }
    } catch {
      // Silent fail
    }
  }

  // STEP 3: Re-find ranges (DOM may have changed from icon insertion)
  // and apply visual highlights
  if (supportsCustomHighlights) {
    injectHighlightCSS();
    const rangesByColor: Record<string, Range[]> = {};
    for (const name of HIGHLIGHT_COLOR_NAMES) rangesByColor[name] = [];

    for (const { hl } of rangeMap) {
      const color = HIGHLIGHT_COLOR_NAMES.includes(hl.color as any) ? hl.color : 'yellow';
      const freshRange = findTextRange(container, hl.text, hl.position_start, hl.position_end);
      if (freshRange) {
        rangesByColor[color].push(freshRange);
      }
    }

    for (const color of HIGHLIGHT_COLOR_NAMES) {
      const name = `feedglow-${color}`;
      if (rangesByColor[color].length > 0) {
        CSS.highlights.set(name, new Highlight(...rangesByColor[color]));
      } else {
        CSS.highlights.delete(name);
      }
    }
  } else {
    // Re-find ranges for mark tags too
    const freshRangeMap: { hl: HighlightData; range: Range }[] = [];
    for (const { hl } of rangeMap) {
      const freshRange = findTextRange(container, hl.text, hl.position_start, hl.position_end);
      if (freshRange) freshRangeMap.push({ hl, range: freshRange });
    }
    applyWithMarkTags(freshRangeMap);
  }

  // STEP 4: Add click handlers for note icons
  injectNoteIconCSS();
  container.querySelectorAll('.feedglow-note-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      // Toggle popover
      const existing = el.querySelector('.feedglow-note-popover');
      if (existing) {
        existing.remove();
        return;
      }
      // Close any other open popovers
      container.querySelectorAll('.feedglow-note-popover').forEach(p => p.remove());
      // Create popover
      const noteText = el.getAttribute('data-note-text') || '';
      const popover = document.createElement('div');
      popover.className = 'feedglow-note-popover';
      popover.textContent = noteText;
      el.appendChild(popover);
      // Close on click outside
      const closeHandler = (ev: Event) => {
        if (!el.contains(ev.target as Node)) {
          popover.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 0);
    });
  });
}

function injectNoteIconCSS() {
  const styleId = 'feedglow-note-icon-css';
  if (typeof document === 'undefined' || document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .feedglow-note-icon {
      display: inline;
      cursor: pointer;
      font-size: 0.75em;
      margin-left: 2px;
      position: relative;
      vertical-align: super;
      user-select: none;
      opacity: 0.7;
      transition: opacity 0.15s;
    }
    .feedglow-note-icon:hover { opacity: 1; }
    .feedglow-note-popover {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: rgb(var(--bg-elevated, 30 30 30));
      color: rgb(var(--text-primary, 230 230 230));
      border: 1px solid rgb(var(--border-default, 60 60 60));
      border-left: 3px solid rgb(249, 115, 22);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 14px;
      line-height: 1.6;
      min-width: 180px;
      max-width: 320px;
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      z-index: 1000;
      pointer-events: auto;
    }
    .feedglow-note-popover::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: rgb(var(--border-default, 60 60 60));
    }
  `;
  document.head.appendChild(style);
}

function injectHighlightCSS() {
  const styleId = 'feedglow-highlight-css';
  if (typeof document === 'undefined' || document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    ::highlight(feedglow-yellow) { background-color: rgba(250, 204, 21, 0.35); }
    ::highlight(feedglow-green) { background-color: rgba(74, 222, 128, 0.35); }
    ::highlight(feedglow-blue) { background-color: rgba(96, 165, 250, 0.35); }
    ::highlight(feedglow-red) { background-color: rgba(248, 113, 113, 0.35); }
    mark[data-highlight-id] { cursor: pointer; }
    mark[data-highlight-id]:hover { filter: brightness(0.95); }
  `;
  document.head.appendChild(style);
}

// Note: inline note indicators removed — margin notes handled by MarginNotes component in entry-reader.tsx

// ---- Fallback: <mark> tags (older browsers) ----

function applyWithMarkTags(rangeMap: { hl: HighlightData; range: Range }[]) {
  const COLORS: Record<string, string> = {
    yellow: 'rgba(250, 204, 21, 0.35)',
    green: 'rgba(74, 222, 128, 0.35)',
    blue: 'rgba(96, 165, 250, 0.35)',
    red: 'rgba(248, 113, 113, 0.35)',
  };

  // Process in reverse position order to avoid offset shifts from DOM modifications
  const sorted = [...rangeMap].sort(
    (a, b) => (b.hl.position_start ?? 0) - (a.hl.position_start ?? 0)
  );

  for (const { hl, range } of sorted) {
    const bgColor = COLORS[hl.color] || COLORS.yellow;
    try {
      const mark = document.createElement('mark');
      mark.setAttribute('data-highlight-id', String(hl.id));
      mark.style.backgroundColor = bgColor;
      mark.style.borderRadius = '2px';
      mark.style.padding = '1px 0';
      mark.style.cursor = 'pointer';
      range.surroundContents(mark);
    } catch {
      // Cross-element boundary — skip rather than risk DOM corruption
    }
  }
}

// ---- Shared: find a Range for a highlight ----

function findTextRange(
  container: HTMLElement, searchText: string,
  posStart?: number | null, posEnd?: number | null
): Range | null {
  // Collect text nodes
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push({ node, start: offset });
    offset += node.textContent?.length || 0;
  }
  const fullText = nodes.map(n => n.node.textContent || '').join('');

  // 1. Try exact text search
  let idx = fullText.indexOf(searchText);

  // 2. Fallback: regex-based flexible whitespace search
  if (idx === -1) {
    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.replace(/\s+/g, '\\s+');
    const regex = new RegExp(pattern);
    const match = regex.exec(fullText);
    if (match) {
      idx = match.index;
      searchText = match[0]; // use actual matched text length for correct range
    }
  }

  // 3. Fallback: offset-based
  if (idx === -1 && posStart != null && posEnd != null) {
    idx = posStart;
    searchText = fullText.slice(posStart, posEnd);
  }

  if (idx === -1 || !searchText) return null;

  const endIdx = idx + searchText.length;

  // Find start and end text nodes
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (const { node, start } of nodes) {
    const len = node.textContent?.length || 0;
    if (!startNode && start + len > idx) {
      startNode = node;
      startOffset = idx - start;
    }
    if (start + len >= endIdx) {
      endNode = node;
      endOffset = endIdx - start;
      break;
    }
  }

  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  } catch {
    return null;
  }
}
