'use client';

import { formatDistanceToNow } from 'date-fns';
import { cn } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
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
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      <AnimatePresence mode="popLayout">
        {entries.map((entry, index) => (
          <motion.article
            key={entry.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15, delay: index * 0.02 }}
            layout
            onClick={() => handleSelect(entry)}
            className={cn(
              'p-4 cursor-pointer transition-colors',
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

                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {entry.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
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
          </motion.article>
        ))}
      </AnimatePresence>
    </div>
  );
}
