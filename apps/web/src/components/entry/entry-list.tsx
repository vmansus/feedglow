'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@feedglow/ui';
import type { Entry } from '@feedglow/shared';
import { useMarkAsRead, useToggleBookmark } from '@/hooks';

interface EntryListProps {
  entries: Entry[];
  selectedId?: number;
  onSelect: (entry: Entry) => void;
}

export function EntryList({ entries, selectedId, onSelect }: EntryListProps) {
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

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <span className="text-4xl mb-4">📭</span>
        <p>No articles found</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {entries.map((entry) => (
        <article
          key={entry.id}
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
              {/* Feed info */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-500 truncate">
                  {entry.feedTitle}
                </span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(entry.publishedAt), { addSuffix: true })}
                </span>
              </div>

              {/* Title */}
              <h3
                className={cn(
                  'text-sm mb-1 line-clamp-2',
                  entry.status === 'unread' ? 'font-semibold' : 'font-normal text-gray-600'
                )}
              >
                {entry.title}
              </h3>

              {/* Summary if available */}
              {entry.summary && (
                <p className="text-xs text-gray-500 line-clamp-2">{entry.summary}</p>
              )}

              {/* Tags */}
              {entry.tags && entry.tags.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {entry.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bookmark button */}
            <button
              onClick={(e) => handleBookmark(e, entry)}
              className={cn(
                'p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors',
                entry.starred ? 'text-yellow-500' : 'text-gray-400'
              )}
            >
              {entry.starred ? '★' : '☆'}
            </button>
          </div>

          {/* Reading time */}
          <div className="mt-2 text-xs text-gray-400">
            {entry.readingTime} min read
          </div>
        </article>
      ))}
    </div>
  );
}
