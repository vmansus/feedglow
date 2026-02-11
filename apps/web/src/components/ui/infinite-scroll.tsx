'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { t } from '@/lib/i18n';

interface InfiniteScrollProps {
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  children: React.ReactNode;
  threshold?: number; // pixels from bottom to trigger
  loader?: React.ReactNode;
  endMessage?: React.ReactNode;
}

export function InfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  children,
  threshold = 200,
  loader,
  endMessage,
}: InfiniteScrollProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    // Find the closest scrollable parent
    const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      if (!node) return null;
      const overflowY = window.getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return node;
      }
      return getScrollParent(node.parentElement);
    };

    const scrollParent = getScrollParent(element.parentElement);

    observerRef.current = new IntersectionObserver(handleObserver, {
      root: scrollParent, // Use scroll parent instead of viewport
      rootMargin: `${threshold}px`,
      threshold: 0,
    });

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleObserver, threshold]);

  const defaultLoader = (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      <span className="ml-2 text-sm text-zinc-500">{t('infiniteScroll.loadMore')}</span>
    </div>
  );

  const defaultEndMessage = (
    <div className="text-center py-4 text-sm text-zinc-400">
      {t('infiniteScroll.noMore')}
    </div>
  );

  return (
    <>
      {children}
      
      {/* Load more trigger element */}
      <div ref={loadMoreRef} className="h-1" />
      
      {/* Loading indicator */}
      {isFetchingNextPage && (loader || defaultLoader)}
      
      {/* End message */}
      {!hasNextPage && !isFetchingNextPage && (endMessage || defaultEndMessage)}
    </>
  );
}
