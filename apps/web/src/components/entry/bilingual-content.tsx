'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { translateParagraphs } from '@/lib/api';

interface BilingualContentProps {
  content: string;
  entryId: number;
  enabled: boolean;
  language?: string;
}

interface Paragraph {
  text: string;
  translation: string | null;
  status: 'pending' | 'loading' | 'done' | 'error';
}

// Parse HTML content into paragraphs
function extractParagraphs(html: string): string[] {
  const div = document.createElement('div');
  div.innerHTML = html;
  
  const paragraphs: string[] = [];
  const blocks = div.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
  
  blocks.forEach((block) => {
    const text = block.textContent?.trim();
    if (text && text.length > 10) {
      paragraphs.push(text);
    }
  });
  
  // If no block elements found, split by double newlines
  if (paragraphs.length === 0) {
    const text = div.textContent || '';
    text.split(/\n\s*\n/).forEach((p) => {
      const trimmed = p.trim();
      if (trimmed.length > 10) {
        paragraphs.push(trimmed);
      }
    });
  }
  
  return paragraphs;
}

// Cache key for localStorage
function getCacheKey(entryId: number, lang: string) {
  return `feedglow_translation_${entryId}_${lang}`;
}

export function BilingualContent({ content, entryId, enabled, language = 'zh-CN' }: BilingualContentProps) {
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const paragraphRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingBatch = useRef<Set<number>>(new Set());
  const batchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Initialize paragraphs from content
  useEffect(() => {
    const texts = extractParagraphs(content);
    
    // Try to load from cache
    const cached = localStorage.getItem(getCacheKey(entryId, language));
    let cachedTranslations: Record<number, string> = {};
    if (cached) {
      try {
        cachedTranslations = JSON.parse(cached);
      } catch {
        // Invalid cache, ignore
      }
    }
    
    setParagraphs(texts.map((text, i) => ({
      text,
      translation: cachedTranslations[i] || null,
      status: cachedTranslations[i] ? 'done' : 'pending',
    })));
  }, [content, entryId, language]);

  // Batch translate function
  const translateBatch = useCallback(async (indices: number[]) => {
    if (indices.length === 0) return;
    
    // Mark as loading
    setParagraphs((prev) => prev.map((p, i) => 
      indices.includes(i) ? { ...p, status: 'loading' as const } : p
    ));

    try {
      const textsToTranslate = indices.map((i) => paragraphs[i]?.text).filter(Boolean);
      const translations = await translateParagraphs(textsToTranslate, language);
      
      setParagraphs((prev) => {
        const updated = [...prev];
        indices.forEach((idx, i) => {
          if (updated[idx]) {
            updated[idx] = {
              ...updated[idx],
              translation: translations[i] || '[翻译失败]',
              status: 'done',
            };
          }
        });
        
        // Save to cache
        const cache: Record<number, string> = {};
        updated.forEach((p, i) => {
          if (p.translation) cache[i] = p.translation;
        });
        localStorage.setItem(getCacheKey(entryId, language), JSON.stringify(cache));
        
        return updated;
      });
    } catch {
      setParagraphs((prev) => prev.map((p, i) => 
        indices.includes(i) ? { ...p, status: 'error' as const, translation: '[翻译失败]' } : p
      ));
    }
  }, [paragraphs, entryId, language]);

  // Schedule batch translation
  const scheduleBatch = useCallback((index: number) => {
    pendingBatch.current.add(index);
    
    if (batchTimeout.current) {
      clearTimeout(batchTimeout.current);
    }
    
    batchTimeout.current = setTimeout(() => {
      const indices = Array.from(pendingBatch.current);
      pendingBatch.current.clear();
      translateBatch(indices);
    }, 100); // 100ms debounce
  }, [translateBatch]);

  // Setup Intersection Observer
  useEffect(() => {
    if (!enabled) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            const para = paragraphs[index];
            if (para && para.status === 'pending') {
              scheduleBatch(index);
            }
          }
        });
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    // Observe all paragraph elements
    paragraphRefs.current.forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [enabled, paragraphs, scheduleBatch]);

  // Register paragraph ref
  const setRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      paragraphRefs.current.set(index, el);
      observerRef.current?.observe(el);
    } else {
      paragraphRefs.current.delete(index);
    }
  }, []);

  if (!enabled) {
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }

  return (
    <div className="space-y-6">
      {paragraphs.map((para, i) => (
        <div
          key={i}
          ref={(el) => setRef(i, el)}
          data-index={i}
          className="group"
        >
          {/* Original text */}
          <p className="text-[rgb(var(--text-secondary))] leading-relaxed mb-2">
            {para.text}
          </p>
          
          {/* Translation */}
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pl-3 border-l-2 border-orange-500/40"
          >
            {para.status === 'loading' ? (
              <p className="text-orange-400/50 text-sm flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
                翻译中...
              </p>
            ) : para.status === 'done' || para.status === 'error' ? (
              <p className="text-orange-400/90 text-sm leading-relaxed">
                {para.translation}
              </p>
            ) : (
              <p className="text-muted text-sm opacity-50">
                滚动到此处开始翻译...
              </p>
            )}
          </motion.div>
        </div>
      ))}
    </div>
  );
}
