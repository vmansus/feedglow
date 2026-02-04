'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useMarkAllAsRead } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { EntryFiltersBar, useEntryFilters } from '@/components/entry/entry-filters';
import { CheckCircle } from 'lucide-react';
import type { Entry } from '@feedglow/shared';

export default function AllPage() {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const { filters, updateFilters } = useEntryFilters();
  
  const { data, isLoading, error } = useEntries({
    status: filters.status === 'all' ? undefined : filters.status,
    starred: filters.starred || undefined,
  });
  
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const markAllAsRead = useMarkAllAsRead();

  const entries = data?.entries || [];
  
  // Apply client-side sorting (API might not support all sort options)
  const sortedEntries = [...entries].sort((a, b) => {
    const aDate = new Date(filters.order === 'published_at' ? a.publishedAt : a.createdAt || a.publishedAt);
    const bDate = new Date(filters.order === 'published_at' ? b.publishedAt : b.createdAt || b.publishedAt);
    return filters.direction === 'desc' ? bDate.getTime() - aDate.getTime() : aDate.getTime() - bDate.getTime();
  });

  const unreadCount = entries.filter(e => e.status === 'unread').length;

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
          <span>📰</span> All Articles
          {data?.total !== undefined && <span className="text-sm font-normal text-muted">({data.total})</span>}
        </h1>
        {unreadCount > 0 && (
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
      <EntryFiltersBar
        filters={filters}
        onChange={updateFilters}
        totalCount={data?.total}
        unreadCount={unreadCount}
      />
    </div>
  );

  const listContent = isLoading ? <EntryListSkeleton count={10} /> : <EntryList entries={sortedEntries} selectedId={selectedEntry?.id} onSelect={setSelectedEntry} />;

  const readerContent = (
    <AnimatePresence mode="wait">
      {selectedEntry ? (
        <EntryReader key={selectedEntry.id} entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      ) : (
        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center h-full text-muted">
          <div className="text-center">
            <span className="text-6xl mb-4 block">📖</span>
            <p className="mb-2">Select an article</p>
            <p className="text-sm text-muted">Press <kbd className="px-1.5 py-0.5 text-xs bg-[rgb(var(--bg-hover))] rounded">?</kbd> for shortcuts</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <ResizableLayout sidebar={null} listHeader={listHeader} list={listContent} reader={readerContent} />
      <KeyboardHelp isOpen={showHelp} onClose={() => setShowHelp(false)} shortcuts={shortcuts} />
    </>
  );
}
