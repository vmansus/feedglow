'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Folder, ArrowLeft, CheckCheck } from 'lucide-react';
import { useCategories, useEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useUpdateEntriesStatus } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import type { Entry } from '@feedglow/shared';

export default function CategoryPage() {
  const params = useParams();
  const categoryId = Number(params.id);
  
  const { categories, isLoading: categoriesLoading } = useCategories();
  const { data: entriesData, isLoading } = useEntries({ categoryId });
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const updateEntriesStatus = useUpdateEntriesStatus();
  
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  
  const category = categories?.find(c => c.id === categoryId);
  const entries = entriesData?.entries || [];

  const handleMarkAllRead = () => {
    if (entries.length === 0) return;
    const unreadIds = entries.filter(e => e.status === 'unread').map(e => e.id);
    if (unreadIds.length > 0) {
      updateEntriesStatus.mutate({ entryIds: unreadIds, status: 'read' });
    }
  };

  const { showHelp, setShowHelp, shortcuts } = useKeyboardNavigation({
    entries,
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
          <p className="text-gray-500 dark:text-gray-400 mb-4">Category not found</p>
          <Link href="/feeds" className="text-orange-500 hover:underline">
            ← Back to feeds
          </Link>
        </motion.div>
      </div>
    );
  }

  const listHeader = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4">
      <div className="flex items-center gap-3 mb-2">
        <Link
          href="/feeds"
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </Link>
        <Folder className="w-5 h-5 text-orange-500" />
        <h1 className="text-lg font-semibold dark:text-white flex-1 truncate">
          {category?.title || 'Loading...'}
        </h1>
        {entries.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleMarkAllRead}
            disabled={updateEntriesStatus.isPending}
            className="p-2 text-gray-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
            title="Mark all as read"
          >
            <CheckCheck className="w-4 h-4" />
          </motion.button>
        )}
      </div>
      <p className="text-sm text-gray-500 pl-9">
        {entriesData?.total ?? entries.length} articles
      </p>
    </motion.div>
  );

  const listContent = isLoading ? (
    <EntryListSkeleton count={10} />
  ) : entries.length > 0 ? (
    <EntryList entries={entries} selectedId={selectedEntry?.id} onSelect={setSelectedEntry} />
  ) : (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400"
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
          className="flex items-center justify-center h-full text-gray-400"
        >
          <div className="text-center">
            <span className="text-6xl mb-4 block">📖</span>
            <p className="mb-2">Select an article to read</p>
            <p className="text-sm text-gray-500">
              Press <kbd className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">?</kbd> for shortcuts
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
