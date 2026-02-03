'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import type { Entry } from '@feedglow/shared';

export default function StarredPage() {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const { data, isLoading, error } = useEntries({ starred: true });
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();

  const entries = data?.entries || [];

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

  return (
    <>
      <div className="flex h-full">
        <div className="w-96 border-r border-gray-200 dark:border-gray-800 overflow-y-auto bg-white dark:bg-gray-900 flex-shrink-0">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
            <h1 className="text-lg font-semibold flex items-center gap-2 dark:text-white">
              <span>⭐</span> Starred
              {data?.total !== undefined && <span className="text-sm font-normal text-gray-500">({data.total})</span>}
            </h1>
          </motion.div>
          {isLoading ? <EntryListSkeleton count={10} /> : <EntryList entries={entries} selectedId={selectedEntry?.id} onSelect={setSelectedEntry} />}
        </div>

        <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900">
          <AnimatePresence mode="wait">
            {selectedEntry ? (
              <EntryReader key={selectedEntry.id} entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <span className="text-6xl mb-4 block">⭐</span>
                  <p className="mb-2">Your starred articles</p>
                  <p className="text-sm text-gray-500">Press <kbd className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">s</kbd> to star</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <KeyboardHelp isOpen={showHelp} onClose={() => setShowHelp(false)} shortcuts={shortcuts} />
    </>
  );
}
