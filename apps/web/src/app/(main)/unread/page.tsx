'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { useEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useMarkAllAsRead } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { useEntryFilters } from '@/components/entry/entry-filters';
import { ArrowUpDown, ChevronDown, Star } from 'lucide-react';
import { cn } from '@feedglow/ui';
import type { Entry } from '@feedglow/shared';

export default function UnreadPage() {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const { filters, updateFilters } = useEntryFilters();
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  const { data, isLoading, error } = useEntries({ 
    status: 'unread',
    starred: filters.starred || undefined,
  });
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const markAllAsRead = useMarkAllAsRead();

  const entries = data?.entries || [];
  
  // Apply sorting
  const sortedEntries = [...entries].sort((a, b) => {
    const aDate = new Date(a.publishedAt);
    const bDate = new Date(b.publishedAt);
    return filters.direction === 'desc' ? bDate.getTime() - aDate.getTime() : aDate.getTime() - bDate.getTime();
  });

  const { showHelp, setShowHelp, shortcuts } = useKeyboardNavigation({
    entries: sortedEntries,
    selectedId: selectedEntry?.id,
    onSelect: setSelectedEntry,
    onOpen: setSelectedEntry,
    onClose: () => setSelectedEntry(null),
    onToggleStar: (entry) => toggleBookmark.mutate(entry.id),
    onToggleRead: (entry) => {
      if (entry.status === 'unread') markAsRead.mutate(entry.id);
      else markAsUnread.mutate(entry.id);
    },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center text-red-500">
          <span className="text-4xl mb-4 block">❌</span>
          <p>Error loading entries</p>
        </motion.div>
      </div>
    );
  }

  const listHeader = (
    <div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <span>📥</span> Unread
          {data?.total !== undefined && <span className="text-sm font-normal text-muted">({data.total})</span>}
        </h1>
        {entries.length > 0 && (
          <button
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
            className="text-xs text-muted hover:text-orange-500 flex items-center gap-1 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            全部已读
          </button>
        )}
      </motion.div>
      
      {/* Simplified filter bar for unread page */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-default bg-[rgb(var(--bg-base))]">
        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>
              {filters.order === 'published_at' ? '发布时间' : '添加时间'}
              {filters.direction === 'desc' ? ' ↓' : ' ↑'}
            </span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
              <div className="absolute top-full left-0 mt-1 py-1 bg-[rgb(var(--bg-elevated))] border border-default rounded-lg shadow-xl z-20 min-w-[140px]">
                <button
                  onClick={() => {
                    updateFilters({ order: 'published_at', direction: 'desc' });
                    setShowSortMenu(false);
                  }}
                  className={cn(
                    "w-full px-3 py-1.5 text-xs text-left hover:bg-[rgb(var(--bg-hover))]",
                    filters.order === 'published_at' && filters.direction === 'desc' && "text-orange-500"
                  )}
                >
                  发布时间 (最新)
                </button>
                <button
                  onClick={() => {
                    updateFilters({ order: 'published_at', direction: 'asc' });
                    setShowSortMenu(false);
                  }}
                  className={cn(
                    "w-full px-3 py-1.5 text-xs text-left hover:bg-[rgb(var(--bg-hover))]",
                    filters.order === 'published_at' && filters.direction === 'asc' && "text-orange-500"
                  )}
                >
                  发布时间 (最早)
                </button>
              </div>
            </>
          )}
        </div>

        <div className="h-4 w-px bg-[rgb(var(--border-default))]" />

        {/* Starred Filter */}
        <button
          onClick={() => updateFilters({ starred: !filters.starred })}
          className={cn(
            "px-2 py-1 rounded text-xs transition-colors flex items-center gap-1",
            filters.starred 
              ? "bg-yellow-500/20 text-yellow-500" 
              : "text-muted hover:text-[rgb(var(--text-secondary))]"
          )}
        >
          <Star className={cn("w-3 h-3", filters.starred && "fill-current")} />
          收藏
        </button>
      </div>
    </div>
  );

  const listContent = isLoading ? (
    <EntryListSkeleton count={10} />
  ) : sortedEntries.length > 0 ? (
    <EntryList entries={sortedEntries} selectedId={selectedEntry?.id} onSelect={setSelectedEntry} />
  ) : (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-32 text-muted"
    >
      <span className="text-3xl mb-2">🎉</span>
      <p>全部已读！</p>
    </motion.div>
  );

  const readerContent = (
    <AnimatePresence mode="wait">
      {selectedEntry ? (
        <EntryReader key={selectedEntry.id} entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      ) : (
        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center h-full text-muted">
          <div className="text-center">
            <span className="text-6xl mb-4 block">📖</span>
            <p className="mb-2">Select an article to read</p>
            <p className="text-sm text-muted">Press <kbd className="px-1.5 py-0.5 text-xs bg-[rgb(var(--bg-hover))] rounded">?</kbd> for shortcuts</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <ResizableLayout
        sidebar={null}
        listHeader={listHeader}
        list={listContent}
        reader={readerContent}
      />
      <KeyboardHelp isOpen={showHelp} onClose={() => setShowHelp(false)} shortcuts={shortcuts} />
    </>
  );
}
