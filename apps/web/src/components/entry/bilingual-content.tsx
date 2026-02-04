'use client';

import { useEffect, useRef, useCallback } from 'react';
import { translateParagraphs } from '@/lib/api';

interface BilingualContentProps {
  content: string;
  entryId: number;
  enabled: boolean;
  language?: string;
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

export function BilingualContent({ content, entryId, enabled, language = 'zh-CN' }: BilingualContentProps) {
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

    // Inject original HTML
    containerRef.current.innerHTML = content;

    if (!enabled) return;

    // Find all block elements that should be translated
    const blocks = containerRef.current.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th');
    
    blocks.forEach((block) => {
      const text = block.textContent?.trim();
      if (!text || text.length < 15) return; // Skip short text (dates, labels)
      
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
        transDiv.innerHTML = `<span style="opacity: 0.5">滚动到此处开始翻译...</span>`;
        transDiv.setAttribute('data-pending', 'true');
        transDiv.setAttribute('data-text', text);
      }
      
      // Insert after the block
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
  }, [content, entryId, enabled, language]);

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
            翻译中...
          </span>
        `;
      });
      
      // Remove from pending
      batch.forEach(([el]) => pendingTexts.current.delete(el));
      
      try {
        const translations = await translateParagraphs(texts, language);
        
        elements.forEach((el, i) => {
          const htmlEl = el as HTMLElement;
          htmlEl.textContent = translations[i] || '[翻译失败]';
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
          (el as HTMLElement).textContent = '[翻译失败]';
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
      className="prose prose-sm dark:prose-invert max-w-none prose-img:rounded-xl prose-a:text-orange-500 prose-a:no-underline hover:prose-a:underline prose-headings:text-[rgb(var(--text-primary))] prose-p:text-[rgb(var(--text-secondary))]"
    />
  );
}
