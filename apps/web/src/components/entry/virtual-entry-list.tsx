'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@feedglow/ui';
import { Star, CheckCircle2 } from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import { useMarkAsRead, useMarkAsUnread, useToggleBookmark } from '@/hooks';
import { getReadingProgressBatch } from '@/lib/api';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { AllCaughtUpState } from '@/components/ui/empty-state';
import { SwipeableEntry } from './swipeable-entry';
import { t, getLocale } from '@/lib/i18n';

// Format date: relative for < 30 days, specific date+time for >= 30 days
function formatEntryDate(date: Date): string {
  const days = differenceInDays(new Date(), date);
  if (days < 30) {
    return formatDistanceToNow(date, { addSuffix: false, locale: getLocale() === 'zh' ? zhCN : undefined });
  }
  return format(date, getLocale() === 'zh' ? 'yyyy年M月d日 HH:mm' : 'MMM d, yyyy HH:mm');
}

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

// Helper to strip HTML tags
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

interface VirtualEntryListProps {
  entries: Entry[];
  selectedId?: number;
  onSelect: (entry: Entry) => void;
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}

const ESTIMATED_ROW_HEIGHT = 116; // Based on typical entry card height

export function VirtualEntryList({ 
  entries: rawEntries, 
  selectedId, 
  onSelect, 
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: VirtualEntryListProps) {
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  
  const parentRef = useRef<HTMLDivElement>(null);
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const toggleBookmark = useToggleBookmark();
  const [isMobile, setIsMobile] = useState(false);

  // Fetch reading progress for visible entries (batch)
  const entryIds = useMemo(() => entries.map(e => e.id), [entries]);
  const { data: readingProgress } = useQuery({
    queryKey: ['reading-progress-batch', entryIds.slice(0, 100).join(',')],
    queryFn: () => getReadingProgressBatch(entryIds.slice(0, 100)),
    enabled: entryIds.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Virtual list configuration
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5, // Render 5 extra items outside viewport
  });

  // Infinite scroll - fetch more when near bottom
  const lastItem = virtualizer.getVirtualItems().at(-1);
  
  useEffect(() => {
    if (!lastItem) return;
    
    const isNearEnd = lastItem.index >= entries.length - 5;
    if (isNearEnd && hasNextPage && !isFetchingNextPage && fetchNextPage) {
      fetchNextPage();
    }
  }, [lastItem, entries.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

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

  if (isLoading) {
    return <EntryListSkeleton count={8} />;
  }

  if (entries.length === 0) {
    return <AllCaughtUpState />;
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div 
      ref={parentRef} 
      className="h-full overflow-auto"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const entry = entries[virtualRow.index];
          if (!entry) return null;
          
          const thumbnail = extractThumbnail(entry);
          const isSelected = selectedId === entry.id;
          const isUnread = entry.status === 'unread';

          const entryContent = (
            <article
              data-entry-id={entry.id}
              data-entry-status={entry.status}
              onClick={() => handleSelect(entry)}
              className={cn(
                'p-4 cursor-pointer transition-all border-b border-default relative',
                isUnread && !isSelected && 'pl-6', // Extra padding for unread dot
                isSelected 
                  ? 'bg-[rgb(var(--bg-hover))] bg-glow-gradient' 
                  : 'hover:bg-[rgb(var(--bg-hover))]',
                !isUnread && 'opacity-70' // Dim read articles
              )}
            >
              {/* Selected indicator - glow bar */}
              {isSelected && (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1" 
                  style={{ 
                    backgroundColor: 'rgb(var(--color-primary))',
                    boxShadow: '0 0 10px rgba(var(--color-primary-rgb), 0.8), 0 0 20px rgba(var(--color-primary-rgb), 0.4)' 
                  }}
                />
              )}
              
              {/* Unread indicator - blue dot */}
              {isUnread && !isSelected && (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500" />
              )}

              <div className="flex gap-3">
                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Meta: Feed source + time */}
                  <div className="flex items-center gap-2 mb-1.5 text-xs text-muted">
                    {/* Feed icon */}
                    {entry.feedIconUrl ? (
                      <img 
                        src={entry.feedIconUrl} 
                        alt="" 
                        className="w-4 h-4 rounded object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-4 h-4 rounded bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">
                        {entry.feedTitle?.charAt(0).toUpperCase() || 'F'}
                      </div>
                    )}
                    {/* Feed title */}
                    <span className="truncate max-w-[120px]">{entry.feedTitle}</span>
                    <span className="text-[rgb(var(--border-default))]">·</span>
                    {/* Time */}
                    <span>{formatEntryDate(new Date(entry.publishedAt))}</span>
                    {/* Reading time */}
                    {(entry as any).readingTime > 0 && (entry as any).feedType === 'article' && (
                      <>
                        <span className="text-[rgb(var(--border-default))]">·</span>
                        <span>{(entry as any).readingTime} min</span>
                      </>
                    )}
                  </div>

                  {/* Title */}
                  <h3
                    className={cn(
                      'text-sm mb-1.5 line-clamp-2 leading-snug',
                      isUnread 
                        ? 'font-medium text-[rgb(var(--text-primary))]' 
                        : 'font-normal text-secondary'
                    )}
                  >
                    {entry.title}
                    {(entry as any).isDuplicate && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 align-middle">
                        {t('entry.duplicate')}
                      </span>
                    )}
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                    {entry.summary || stripHtml(entry.content).slice(0, 150)}
                  </p>

                  {/* Reading progress indicator (articles only) */}
                  {(entry as any).feedType === 'article' && readingProgress?.[String(entry.id)] && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {readingProgress[String(entry.id)].finished ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-500">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('entry.readComplete')}
                        </span>
                      ) : readingProgress[String(entry.id)].progress > 0 ? (
                        <>
                          <div className="flex-1 h-1 bg-[rgb(var(--bg-hover))] rounded-full max-w-[80px] overflow-hidden">
                            <div
                              className="h-full bg-orange-500/60 rounded-full transition-all"
                              style={{ width: `${Math.round(readingProgress[String(entry.id)].progress * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted">
                            {Math.round(readingProgress[String(entry.id)].progress * 100)}%
                          </span>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Thumbnail */}
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

                {/* Star button - hidden on mobile (use swipe instead) */}
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
            </article>
          );

          // Wrap with SwipeableEntry on mobile
          const wrappedContent = isMobile ? (
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
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {wrappedContent}
            </div>
          );
        })}
      </div>
      
      {/* Loading more indicator */}
      {isFetchingNextPage && (
        <div className="p-4 text-center text-muted text-sm">
          {t('entry.loadMore')}
        </div>
      )}
    </div>
  );
}
