'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// Format date: relative for < 30 days, specific date+time for >= 30 days
function formatEntryDate(date: Date): string {
  const days = differenceInDays(new Date(), date);
  if (days < 30) {
    return formatDistanceToNow(date, { addSuffix: false, locale: getLocale() === 'zh' ? zhCN : undefined });
  }
  return format(date, getLocale() === 'zh' ? 'yyyy年M月d日 HH:mm' : 'MMM d, yyyy HH:mm');
}
import { cn } from '@feedglow/ui';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import { useMarkAsRead, useMarkAsUnread, useToggleBookmark } from '@/hooks';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { AllCaughtUpState } from '@/components/ui/empty-state';
import { SwipeableEntry } from './swipeable-entry';
import { getLocale } from '@/lib/i18n';

interface VirtualizedEntryListProps {
  entries: Entry[];
  selectedId?: number;
  onSelect: (entry: Entry) => void;
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

const ITEM_HEIGHT = 96; // Approximate height of each entry item

// Extract thumbnail from entry content
function extractThumbnail(entry: Entry): string | null {
  if ((entry as any).imageUrl) return (entry as any).imageUrl;
  
  if ((entry as any).enclosures?.length) {
    const img = (entry as any).enclosures.find((e: any) => 
      e.mime_type?.startsWith('image/') || e.mimeType?.startsWith('image/')
    );
    if (img?.url) return img.url;
  }
  
  if (entry.content) {
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(entry.content)) !== null) {
      const url = match[1];
      const lowerUrl = url.toLowerCase();
      const skipPatterns = ['pixel', 'tracking', 'beacon', 'spacer', '1x1', 'blank.gif', 
        'clear.gif', 'favicon', 'icon', 'logo', 'badge', 'button', 'analytics', 'feedburner'];
      if (!skipPatterns.some(p => lowerUrl.includes(p))) {
        return url;
      }
    }
  }
  
  return null;
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function VirtualizedEntryList({ 
  entries: rawEntries, 
  selectedId, 
  onSelect, 
  isLoading,
  onLoadMore,
  hasMore,
}: VirtualizedEntryListProps) {
  // Defensive: ensure entries is always an array
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  
  const parentRef = useRef<HTMLDivElement>(null);
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const toggleBookmark = useToggleBookmark();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const items = virtualizer.getVirtualItems();

  // Infinite scroll - load more when near bottom
  const handleScroll = useCallback(() => {
    if (!parentRef.current || !onLoadMore || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    if (scrollHeight - scrollTop - clientHeight < 500) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedId) {
      const index = entries.findIndex(e => e.id === selectedId);
      if (index !== -1) {
        virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
      }
    }
  }, [selectedId, entries, virtualizer]);

  const handleSelect = (entry: Entry) => {
    onSelect(entry);
    if (entry.status === 'unread') {
      markAsRead.mutate(entry.id);
    }
  };

  const handleBookmark = (e: React.MouseEvent, entry: Entry) => {
    e.stopPropagation();
    toggleBookmark.mutate(entry.id);
  };

  if (isLoading) {
    return <EntryListSkeleton count={8} />;
  }

  if (entries.length === 0) {
    return <AllCaughtUpState />;
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {items.map((virtualItem) => {
          const entry = entries[virtualItem.index];
          const thumbnail = extractThumbnail(entry);
          const isSelected = selectedId === entry.id;
          const isUnread = entry.status === 'unread';

          const entryContent = (
            <motion.article
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => handleSelect(entry)}
              className={cn(
                'p-4 cursor-pointer transition-all border-b border-default relative',
                isSelected 
                  ? 'bg-[rgb(var(--bg-hover))] bg-glow-gradient' 
                  : 'hover:bg-[rgb(var(--bg-hover))]'
              )}
            >
              {isSelected && (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1" 
                  style={{ 
                    backgroundColor: 'rgb(var(--color-primary))',
                    boxShadow: '0 0 10px rgba(var(--color-primary-rgb), 0.8), 0 0 20px rgba(var(--color-primary-rgb), 0.4)' 
                  }}
                />
              )}

              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-muted">
                      {formatEntryDate(new Date(entry.publishedAt))}
                    </span>
                  </div>

                  <h3
                    className={cn(
                      'text-sm mb-1.5 line-clamp-2 leading-snug',
                      isUnread 
                        ? 'font-medium text-[rgb(var(--text-primary))]' 
                        : 'font-normal text-secondary'
                    )}
                  >
                    {entry.title}
                  </h3>

                  <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                    {entry.summary || stripHtml(entry.content).slice(0, 150)}
                  </p>
                </div>

                {thumbnail && (
                  <div className="flex-shrink-0">
                    <img 
                      src={thumbnail} 
                      alt=""
                      className={cn(
                        "w-16 h-16 rounded-lg object-cover transition-opacity",
                        isSelected ? "opacity-100" : "opacity-70"
                      )}
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                {!isMobile && (
                  <button
                    onClick={(e) => handleBookmark(e, entry)}
                    className={cn(
                      'flex-shrink-0 p-1 rounded transition-colors self-start',
                      entry.starred 
                        ? 'text-yellow-500' 
                        : 'text-muted hover:text-yellow-500'
                    )}
                  >
                    <Star className={cn("w-4 h-4", entry.starred && "fill-current")} />
                  </button>
                )}
              </div>
            </motion.article>
          );

          const content = isMobile ? (
            <SwipeableEntry
              entry={entry}
              onMarkRead={() => markAsRead.mutate(entry.id)}
              onMarkUnread={() => markAsUnread.mutate(entry.id)}
              onToggleStar={() => toggleBookmark.mutate(entry.id)}
            >
              {entryContent}
            </SwipeableEntry>
          ) : entryContent;

          return (
            <div
              key={entry.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {content}
            </div>
          );
        })}
      </div>
      
      {/* Loading indicator for infinite scroll */}
      {hasMore && (
        <div className="py-4 text-center text-sm text-muted">
          Loading more...
        </div>
      )}
    </div>
  );
}
