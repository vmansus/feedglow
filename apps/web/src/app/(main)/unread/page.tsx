'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck } from 'lucide-react';
import { useEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useUpdateEntriesStatus } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import type { Entry } from '@feedglow/shared';

export default function UnreadPage() {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const { data, isLoading, error } = useEntries({ status: 'unread' });
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const updateEntriesStatus = useUpdateEntriesStatus();

  const entries = data?.entries || [];

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

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center text-red-500">
          <span className="text-4xl mb-4 block">❌</span>
          <p>Error loading entries</p>
          <p className="text-sm">{error.message}</p>
        </motion.div>
      </div>
    );
  }

  const listHeader = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 flex items-center justify-between">
      <h1 className="text-lg font-semibold flex items-center gap-2 dark:text-white">
        <span>📥</span> Unread
        {data?.total !== undefined && <span className="text-sm font-normal text-gray-500">({data.total})</span>}
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
          <CheckCheck className="w-5 h-5" />
        </motion.button>
      )}
    </motion.div>
  );

  const listContent = isLoading ? (
    <EntryListSkeleton count={10} />
  ) : (
    <EntryList entries={entries} selectedId={selectedEntry?.id} onSelect={setSelectedEntry} />
  );

  const readerContent = (
    <AnimatePresence mode="wait">
      {selectedEntry ? (
        <EntryReader key={selectedEntry.id} entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      ) : (
        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <span className="text-6xl mb-4 block">📖</span>
            <p className="mb-2">Select an article to read</p>
            <p className="text-sm text-gray-500">Press <kbd className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">?</kbd> for shortcuts</p>
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
        defaultListSize={30}
        minListSize={20}
        maxListSize={50}
      />
      <KeyboardHelp isOpen={showHelp} onClose={() => setShowHelp(false)} shortcuts={shortcuts} />
    </>
  );
}
