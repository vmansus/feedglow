'use client';

import { formatDistanceToNow } from 'date-fns';
import { cn } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import { useMarkAsRead, useToggleBookmark } from '@/hooks';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { AllCaughtUpState } from '@/components/ui/empty-state';

interface EntryListProps {
  entries: Entry[];
  selectedId?: number;
  onSelect: (entry: Entry) => void;
  isLoading?: boolean;
}

// Extract thumbnail from entry content
function extractThumbnail(entry: Entry): string | null {
  // Check if entry has explicit image
  if ((entry as any).imageUrl) return (entry as any).imageUrl;
  if ((entry as any).enclosures?.length) {
    const img = (entry as any).enclosures.find((e: any) => e.mimeType?.startsWith('image/'));
    if (img?.url) return img.url;
  }
  
  // Try to extract from content
  if (entry.content) {
    const match = entry.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match) return match[1];
  }
  
  return null;
}

export function EntryList({ entries, selectedId, onSelect, isLoading }: EntryListProps) {
  const markAsRead = useMarkAsRead();
  const toggleBookmark = useToggleBookmark();

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
    <div>
      <AnimatePresence mode="popLayout">
        {entries.map((entry, index) => {
          const thumbnail = extractThumbnail(entry);
          const isSelected = selectedId === entry.id;
          const isUnread = entry.status === 'unread';

          return (
            <motion.article
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
              layout
              onClick={() => handleSelect(entry)}
              className={cn(
                'p-4 cursor-pointer transition-all border-b border-default relative',
                isSelected 
                  ? 'bg-[rgb(var(--bg-hover))] bg-glow-gradient' 
                  : 'hover:bg-[rgb(var(--bg-hover))]'
              )}
            >
              {/* Selected indicator - glow bar */}
              {isSelected && (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" 
                  style={{ boxShadow: '0 0 10px rgba(249, 115, 22, 0.8), 0 0 20px rgba(249, 115, 22, 0.4)' }}
                />
              )}

              <div className="flex gap-3">
                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Meta */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-muted">
                      {formatDistanceToNow(new Date(entry.publishedAt), { addSuffix: false })}
                    </span>
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
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                    {entry.summary || stripHtml(entry.content).slice(0, 150)}
                  </p>
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

                {/* Star button */}
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
              </div>
            </motion.article>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// Helper to strip HTML tags
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
