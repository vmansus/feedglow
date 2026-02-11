'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';

const BATCH_INTERVAL = 3000;
const LS_ENABLED_KEY = 'scrollMarkReadEnabled';
const LS_DELAY_KEY = 'scrollMarkReadDelay';

export function getScrollMarkReadSettings() {
  if (typeof window === 'undefined') return { enabled: false, delay: 1.5 };
  return {
    enabled: localStorage.getItem(LS_ENABLED_KEY) === 'true',
    delay: parseFloat(localStorage.getItem(LS_DELAY_KEY) || '1.5'),
  };
}

export function setScrollMarkReadSettings(enabled: boolean, delay: number) {
  localStorage.setItem(LS_ENABLED_KEY, String(enabled));
  localStorage.setItem(LS_DELAY_KEY, String(delay));
}

interface UseScrollMarkReadOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  delay?: number;
  readerOpen?: boolean;
}

export function useScrollMarkRead({
  containerRef,
  enabled,
  delay = 1.5,
  readerOpen = false,
}: UseScrollMarkReadOptions) {
  const queryClient = useQueryClient();
  const pendingIds = useRef<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(async () => {
    if (pendingIds.current.size === 0) return;
    const ids = Array.from(pendingIds.current);
    pendingIds.current.clear();
    try {
      // Convert numeric string IDs to numbers so backend handles them correctly
      const normalizedIds: (number | string)[] = ids.map(id => {
        const num = parseInt(id, 10);
        return (!isNaN(num) && String(num) === id) ? num : id;
      });
      await api.batchMarkRead(normalizedIds);
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    } catch {
      ids.forEach((id) => pendingIds.current.add(id));
    }
  }, [queryClient]);

  useEffect(() => {
    if (!enabled || readerOpen) return;

    const container = containerRef.current;
    if (!container) return;

    const delayMs = delay * 1000;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const ioEntry of entries) {
          const el = ioEntry.target as HTMLElement;
          const entryId = el.dataset.entryId || '';
          const status = el.dataset.entryStatus;
          if (!entryId || status !== 'unread') continue;

          if (ioEntry.isIntersecting) {
            if (!timers.current.has(entryId)) {
              const timer = setTimeout(() => {
                pendingIds.current.add(entryId);
                el.dataset.entryStatus = 'read';
                timers.current.delete(entryId);
              }, delayMs);
              timers.current.set(entryId, timer);
            }
          } else {
            if (ioEntry.boundingClientRect.top > 0) {
              const timer = timers.current.get(entryId);
              if (timer) {
                clearTimeout(timer);
                timers.current.delete(entryId);
              }
            }
          }
        }
      },
      { root: null, threshold: 0.5 }
    );

    const observe = () => {
      const items = container.querySelectorAll('[data-entry-id]');
      items.forEach((el) => observerRef.current?.observe(el));
    };

    observe();

    const mutationObserver = new MutationObserver(() => observe());
    mutationObserver.observe(container, { childList: true, subtree: true });

    flushTimer.current = setInterval(flush, BATCH_INTERVAL);

    return () => {
      observerRef.current?.disconnect();
      mutationObserver.disconnect();
      if (flushTimer.current) clearInterval(flushTimer.current);
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
      flush();
    };
  }, [enabled, readerOpen, delay, containerRef, flush]);
}
