'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Folder, ArrowLeft, CheckCircle } from 'lucide-react';
import { useCategories, useEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useMarkCategoryAsRead } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { EntryFiltersBar, useEntryFilters } from '@/components/entry/entry-filters';
import type { Entry } from '@feedglow/shared';

export default function CategoryPage() {
  const params = useParams();
  const categoryId = Number(params.id);
  const { filters, updateFilters } = useEntryFilters();
  
  const { categories, isLoading: categoriesLoading } = useCategories();
  const { data: entriesData, isLoading } = useEntries({ 
    categoryId,
    status: filters.status === 'all' ? undefined : filters.status,
    starred: filters.starred || undefined,
  });
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const markCategoryAsRead = useMarkCategoryAsRead();
  
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  
  const category = categories?.find(c => c.id === categoryId);
  const entries = entriesData?.entries || [];
  
  // Apply sorting
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

  if (!categoriesLoading && !category) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <span className="text-6xl mb-4 block">📁</span>
          <p className="text-muted mb-4">Category not found</p>
          <Link href="/feeds" className="text-orange-500 hover:underline">
            ← Back to feeds
          </Link>
        </motion.div>
      </div>
    );
  }

  const listHeader = (
    <div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 border-b border-default">
        <div className="flex items-center gap-3">
          <Link
            href="/feeds"
            className="p-1.5 hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted" />
          </Link>
          <Folder className="w-5 h-5 text-orange-500" />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate text-[rgb(var(--text-primary))]">
              {category?.title || 'Loading...'}
            </h1>
            <p className="text-xs text-muted">
              {unreadCount} unread
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markCategoryAsRead.mutate({ categoryId })}
              disabled={markCategoryAsRead.isPending}
              className="p-2 rounded-lg text-muted hover:text-orange-500 hover:bg-[rgb(var(--bg-hover))] transition-colors"
              title="全部已读"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
      <EntryFiltersBar
        filters={filters}
        onChange={updateFilters}
        totalCount={entriesData?.total}
        unreadCount={unreadCount}
      />
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
      <span className="text-3xl mb-2">📭</span>
      <p>No entries in this category</p>
    </motion.div>
  );

  const readerContent = (
    <AnimatePresence mode="wait">
      {selectedEntry ? (
        <EntryReader key={selectedEntry.id} entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      ) : (
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center justify-center h-full text-muted"
        >
          <div className="text-center">
            <span className="text-6xl mb-4 block">📖</span>
            <p className="mb-2">Select an article to read</p>
            <p className="text-sm text-muted">
              Press <kbd className="px-1.5 py-0.5 text-xs bg-[rgb(var(--bg-hover))] rounded">?</kbd> for shortcuts
            </p>
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
