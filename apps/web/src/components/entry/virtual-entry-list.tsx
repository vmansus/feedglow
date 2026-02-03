'use client';

import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@feedglow/ui';
import { motion } from 'framer-motion';
import type { Entry } from '@feedglow/shared';
import { useMarkAsRead, useToggleBookmark } from '@/hooks';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { AllCaughtUpState } from '@/components/ui/empty-state';

interface VirtualEntryListProps {
  entries: Entry[];
  selectedId?: number;
  onSelect: (entry: Entry) => void;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function VirtualEntryList({
  entries,
  selectedId,
  onSelect,
  isLoading,
  hasMore,
  onLoadMore,
}: VirtualEntryListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const markAsRead = useMarkAsRead();
  const toggleBookmark = useToggleBookmark();

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120, // Estimated row height
    overscan: 5,
  });

  const handleSelect = useCallback((entry: Entry) => {
    onSelect(entry);
    if (entry.status === 'unread') {
      markAsRead.mutate(entry.id);
    }
  }, [onSelect, markAsRead]);

  const handleBookmark = useCallback((e: React.MouseEvent, entry: Entry) => {
    e.stopPropagation();
    toggleBookmark.mutate(entry.id);
  }, [toggleBookmark]);

  // Load more when scrolling near bottom
  const handleScroll = useCallback(() => {
    if (!parentRef.current || !hasMore || !onLoadMore || isLoading) return;
    
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore, isLoading]);

  if (isLoading && entries.length === 0) {
    return <EntryListSkeleton count={8} />;
  }

  if (entries.length === 0) {
    return <AllCaughtUpState />;
  }

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className="h-full overflow-auto"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const entry = entries[virtualItem.index];
          return (
            <div
              key={entry.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <article
                onClick={() => handleSelect(entry)}
                className={cn(
                  'p-4 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800',
                  selectedId === entry.id
                    ? 'bg-orange-50 dark:bg-orange-900/10'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                  entry.status === 'unread' && 'border-l-4 border-l-orange-500'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-500 truncate">{entry.feedTitle}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(entry.publishedAt), { addSuffix: true })}
                      </span>
                    </div>

                    <h3
                      className={cn(
                        'text-sm mb-1 line-clamp-2',
                        entry.status === 'unread'
                          ? 'font-semibold text-gray-900 dark:text-white'
                          : 'font-normal text-gray-600 dark:text-gray-400'
                      )}
                    >
                      {entry.title}
                    </h3>

                    {entry.summary && (
                      <p className="text-xs text-gray-500 line-clamp-2">{entry.summary}</p>
                    )}
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => handleBookmark(e, entry)}
                    className={cn(
                      'p-1 rounded transition-colors',
                      entry.starred ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'
                    )}
                  >
                    {entry.starred ? '★' : '☆'}
                  </motion.button>
                </div>

                <div className="mt-2 text-xs text-gray-400">{entry.readingTime} min read</div>
              </article>
            </div>
          );
        })}
      </div>
      
      {/* Loading more indicator */}
      {isLoading && entries.length > 0 && (
        <div className="p-4 text-center text-gray-500">
          <span className="animate-pulse">Loading more...</span>
        </div>
      )}
    </div>
  );
}
