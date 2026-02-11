'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Folder, ArrowLeft, CheckCircle } from 'lucide-react';
import { useCategories, useInfiniteEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useMarkCategoryAsRead } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { EntryFiltersBar, useEntryFilters } from '@/components/entry/entry-filters';
import type { Entry } from '@feedglow/shared';
import { EmptyReader } from '@/components/ui/empty-reader';
import { t } from '../../../../lib/i18n';

export default function CategoryPage() {
  const params = useParams();
  const categoryId = Number(params.id);
  const { filters, updateFilters } = useEntryFilters();
  
  const { categories, isLoading: categoriesLoading } = useCategories();
  const { 
    data: entriesData, 
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteEntries({ 
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

  // Get entries from infinite query
  const entries = useMemo(() => {
    return Array.isArray(entriesData?.entries) ? entriesData.entries : [];
  }, [entriesData?.entries]);
  
  // Apply sorting
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const aDate = new Date(a.publishedAt);
      const bDate = new Date(b.publishedAt);
      return filters.direction === 'desc' ? bDate.getTime() - aDate.getTime() : aDate.getTime() - bDate.getTime();
    });
  }, [entries, filters.direction]);
  
  const unreadCount = useMemo(() => {
    return entries.filter(e => e.status === 'unread').length;
  }, [entries]);

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
          <Folder className="w-16 h-16 mx-auto mb-4 text-muted" />
          <p className="text-red-500 mb-2">Category not found</p>
          <Link href="/feeds" className="text-orange-500 hover:underline">
            ← Back to feeds
          </Link>
        </motion.div>
      </div>
    );
  }

  const listHeader = (
    <div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 flex items-center justify-between border-b border-default">
        <div className="flex items-center gap-3">
          <Link href="/feeds" className="p-2 -ml-2 hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-orange-500" />
            <h1 className="text-lg font-semibold">{category?.title || 'Category'}</h1>
            {entriesData?.total !== undefined && (
              <span className="text-sm font-normal text-muted">({entriesData.total})</span>
            )}
          </div>
        </div>
        
        {unreadCount > 0 && (
          <button
            onClick={() => markCategoryAsRead.mutate({ categoryId })}
            disabled={markCategoryAsRead.isPending}
            className="text-xs text-muted hover:text-orange-500 flex items-center gap-1 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {t('page.common.markAllRead')}
          </button>
        )}
      </motion.div>
      <EntryFiltersBar filters={filters} onChange={updateFilters} />
    </div>
  );

  const listContent = isLoading ? (
    <EntryListSkeleton count={10} />
  ) : sortedEntries.length > 0 ? (
    <EntryList 
      entries={sortedEntries} 
      selectedId={selectedEntry?.id} 
      onSelect={setSelectedEntry}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      fetchNextPage={fetchNextPage}
    />
  ) : (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-32 text-muted"
    >
      <Folder className="w-12 h-12 mb-2 opacity-50" />
      <p>No articles in this category</p>
    </motion.div>
  );

  const readerContent = (
    <AnimatePresence mode="wait">
      {selectedEntry ? (
        <EntryReader key={selectedEntry.id} entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      ) : (
        <EmptyReader />
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
        selectedEntryId={selectedEntry?.id}
        onClearSelection={() => setSelectedEntry(null)}
      />
      <KeyboardHelp isOpen={showHelp} onClose={() => setShowHelp(false)} shortcuts={shortcuts} />
    </>
  );
}
