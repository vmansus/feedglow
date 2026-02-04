'use client';

import { useEffect, useRef, useCallback } from 'react';
import { translateParagraphs } from '@/lib/api';

interface BilingualContentProps {
  content: string;
  entryId: number;
  enabled: boolean;
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

export function BilingualContent({ content, entryId, enabled }: BilingualContentProps) {
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

    // Inject original HTML
    containerRef.current.innerHTML = content;

    if (!enabled) return;

    // Find all block elements that should be translated
    const blocks = containerRef.current.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td');
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
      
      // Create wrapper for translation + toggle
      const wrapper = document.createElement('div');
      wrapper.className = 'feedglow-translation-wrapper';
      wrapper.style.cssText = `
        position: relative;
        margin-top: 0.25rem;
        margin-bottom: 0.75rem;
      `;
      
      // Create translation container (hidden by default when collapsed)
      const transDiv = document.createElement('div');
      transDiv.className = 'feedglow-translation';
      transDiv.style.cssText = `
        padding-left: 0.75rem;
        border-left: 2px solid rgba(249, 115, 22, 0.4);
        color: rgba(249, 115, 22, 0.9);
        font-size: 0.875rem;
        line-height: 1.6;
        transition: all 0.2s ease;
      `;
      
      // Create collapse toggle icon
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'feedglow-translation-toggle';
      toggleBtn.innerHTML = '🌐';
      toggleBtn.title = '点击展开/折叠翻译';
      toggleBtn.style.cssText = `
        display: none;
        position: absolute;
        left: -1.5rem;
        top: 0;
        background: rgba(249, 115, 22, 0.15);
        border: none;
        border-radius: 4px;
        padding: 2px 4px;
        font-size: 0.75rem;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
      `;
      toggleBtn.addEventListener('mouseenter', () => { toggleBtn.style.opacity = '1'; });
      toggleBtn.addEventListener('mouseleave', () => { toggleBtn.style.opacity = '0.7'; });
      
      // Toggle visibility on click
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isCollapsed = transDiv.style.display === 'none';
        if (isCollapsed) {
          transDiv.style.display = 'block';
          toggleBtn.style.opacity = '0.5';
          toggleBtn.style.left = '-1.5rem';
        } else {
          transDiv.style.display = 'none';
          toggleBtn.style.opacity = '1';
          toggleBtn.style.left = '0';
        }
      });
      
      // Check cache first
      if (translationCache.current[text]) {
        transDiv.textContent = translationCache.current[text];
        toggleBtn.style.display = 'inline-block';
      } else {
        transDiv.innerHTML = `<span style="opacity: 0.5">滚动到此处开始翻译...</span>`;
        transDiv.setAttribute('data-pending', 'true');
        transDiv.setAttribute('data-text', text);
      }
      
      wrapper.appendChild(toggleBtn);
      wrapper.appendChild(transDiv);
      
      // Insert after the block
      block.parentNode?.insertBefore(wrapper, block.nextSibling);
    });

    // Setup Intersection Observer for lazy loading
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const wrapper = entry.target as HTMLElement;
            const transDiv = wrapper.querySelector('.feedglow-translation') as HTMLElement;
            if (transDiv?.getAttribute('data-pending') === 'true') {
              const text = transDiv.getAttribute('data-text');
              if (text) {
                pendingTexts.current.set(wrapper, text);
                scheduleBatch();
              }
            }
          }
        });
      },
      { rootMargin: '200px', threshold: 0.1 }
    );

    // Observe all pending translation wrappers
    containerRef.current.querySelectorAll('.feedglow-translation-wrapper').forEach((el) => {
      const transDiv = el.querySelector('.feedglow-translation');
      if (transDiv?.getAttribute('data-pending') === 'true') {
        observerRef.current?.observe(el);
      }
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
      const wrappers = batch.map(([el]) => el);
      
      // Mark as loading
      wrappers.forEach((wrapper) => {
        const transDiv = (wrapper as HTMLElement).querySelector('.feedglow-translation') as HTMLElement;
        if (transDiv) {
          transDiv.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 0.5rem; opacity: 0.5">
              <span style="width: 12px; height: 12px; border: 2px solid rgba(249,115,22,0.3); border-top-color: rgb(249,115,22); border-radius: 50%; animation: spin 1s linear infinite"></span>
              翻译中...
            </span>
          `;
        }
      });
      
      // Remove from pending
      batch.forEach(([el]) => pendingTexts.current.delete(el));
      
      try {
        const translations = await translateParagraphs(texts, language);
        
        wrappers.forEach((wrapper, i) => {
          const wrapperEl = wrapper as HTMLElement;
          const transDiv = wrapperEl.querySelector('.feedglow-translation') as HTMLElement;
          const toggleBtn = wrapperEl.querySelector('.feedglow-translation-toggle') as HTMLElement;
          
          if (transDiv) {
            transDiv.textContent = translations[i] || '[翻译失败]';
            transDiv.removeAttribute('data-pending');
            transDiv.removeAttribute('data-text');
          }
          
          // Show toggle button now that translation is ready
          if (toggleBtn) {
            toggleBtn.style.display = 'inline-block';
          }
          
          observerRef.current?.unobserve(wrapper);
          
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
        wrappers.forEach((wrapper) => {
          const transDiv = (wrapper as HTMLElement).querySelector('.feedglow-translation') as HTMLElement;
          if (transDiv) {
            transDiv.textContent = '[翻译失败]';
          }
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
      style.textContent = `
        @keyframes spin { to { transform: rotate(360deg); } }
        .feedglow-translation-toggle:hover { background: rgba(249, 115, 22, 0.25) !important; }
      `;
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
