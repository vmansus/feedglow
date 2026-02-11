'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { RefObject } from 'react';
import * as api from '@/lib/api';

interface UseReadingProgressOptions {
  /** Entry ID (UUID or numeric). null = disabled */
  entryId: number | string | null;
  /** Ref to the scrollable container */
  scrollRef: RefObject<HTMLElement | null>;
  /** Debounce interval in ms (default 5000) */
  debounceMs?: number;
  /** Minimum progress change to trigger save (default 0.05 = 5%) */
  minProgressDelta?: number;
}

interface UseReadingProgressReturn {
  /** Current progress 0-1 */
  progress: number;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Manually restore scroll position from saved progress */
  restore: () => void;
}

export function useReadingProgress({
  entryId,
  scrollRef,
  debounceMs = 5000,
  minProgressDelta = 0.05,
}: UseReadingProgressOptions): UseReadingProgressReturn {
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Track state without re-renders
  const lastSavedProgress = useRef(0);
  const currentProgress = useRef(0);
  const currentScrollPos = useRef(0);
  const openedAt = useRef(Date.now());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedScrollPosition = useRef(0);
  const hasMounted = useRef(false);

  // Save progress to backend
  const doSave = useCallback(async () => {
    if (!entryId) return;
    const prog = currentProgress.current;
    const scrollPos = currentScrollPos.current;
    const timeSpent = Math.round((Date.now() - openedAt.current) / 1000);
    const finished = prog >= 0.95;

    try {
      await api.saveReadingProgress(entryId, {
        progress: Math.round(prog * 100) / 100,
        scrollPosition: Math.round(scrollPos),
        timeSpent,
        finished,
      });
      lastSavedProgress.current = prog;
    } catch {
      // Silently fail — don't block reading
    }
  }, [entryId]);

  // Schedule a debounced save
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSave, debounceMs);
  }, [doSave, debounceMs]);

  // Restore scroll position
  const restore = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !savedScrollPosition.current) return;
    requestAnimationFrame(() => {
      el.scrollTop = savedScrollPosition.current;
    });
  }, [scrollRef]);

  // Load saved progress when entryId changes
  useEffect(() => {
    if (!entryId) {
      setProgress(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    openedAt.current = Date.now();
    lastSavedProgress.current = 0;
    currentProgress.current = 0;
    currentScrollPos.current = 0;

    api.getReadingProgress(entryId).then((data) => {
      if (cancelled) return;
      setIsLoading(false);
      if (data) {
        setProgress(data.progress);
        currentProgress.current = data.progress;
        lastSavedProgress.current = data.progress;
        savedScrollPosition.current = data.scrollPosition;
        // Auto-restore after a short delay to let content render
        const el = scrollRef.current;
        if (el && data.scrollPosition > 0) {
          setTimeout(() => {
            if (!cancelled && scrollRef.current) {
              scrollRef.current.scrollTop = data.scrollPosition;
            }
          }, 300);
        }
      } else {
        savedScrollPosition.current = 0;
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [entryId, scrollRef]);

  // Listen to scroll events
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !entryId) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return;

      const prog = Math.min(1, Math.max(0, scrollTop / maxScroll));
      currentProgress.current = prog;
      currentScrollPos.current = scrollTop;
      setProgress(prog);

      // Save if progress changed significantly
      const delta = Math.abs(prog - lastSavedProgress.current);
      if (delta >= minProgressDelta) {
        scheduleSave();
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [entryId, scrollRef, minProgressDelta, scheduleSave]);

  // Save on unmount / entry change (cleanup)
  useEffect(() => {
    if (!entryId) return;
    hasMounted.current = true;

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Final save when leaving
      if (hasMounted.current && currentProgress.current > 0) {
        const prog = currentProgress.current;
        const scrollPos = currentScrollPos.current;
        const timeSpent = Math.round((Date.now() - openedAt.current) / 1000);
        const finished = prog >= 0.95;

        // Use sendBeacon-style fire-and-forget save
        api.saveReadingProgress(entryId, {
          progress: Math.round(prog * 100) / 100,
          scrollPosition: Math.round(scrollPos),
          timeSpent,
          finished,
        }).catch(() => {});
      }
    };
  }, [entryId]);

  return { progress, isLoading, restore };
}
