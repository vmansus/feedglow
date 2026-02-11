'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Tag, ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import * as api from '@/lib/api';
import type { Entry } from '@feedglow/shared';
import { EmptyReader } from '@/components/ui/empty-reader';

export default function TagPage() {
  const params = useParams();
  const tagName = decodeURIComponent(params.name as string);
  
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  
  // Fetch entries by tag
  const { data, isLoading, error } = useQuery({
    queryKey: ['entries', 'tag', tagName],
    queryFn: () => api.getEntriesByTag(tagName),
  });

  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();

  const entries = useMemo(() => {
    return Array.isArray(data?.entries) ? data.entries : [];
  }, [data?.entries]);

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
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <Tag className="w-16 h-16 mx-auto mb-4 text-muted" />
          <p className="text-red-500 mb-2">Failed to load tag</p>
          <Link href="/all" className="text-orange-500 hover:underline">
            ← Back to articles
          </Link>
        </motion.div>
      </div>
    );
  }

  const listHeader = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 flex items-center gap-3 border-b border-default">
      <Link href="/all" className="p-2 -ml-2 hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <div className="flex items-center gap-2">
        <Tag className="w-5 h-5 text-orange-500" />
        <h1 className="text-lg font-semibold">#{tagName}</h1>
        {data?.total !== undefined && (
          <span className="text-sm font-normal text-muted">({data.total})</span>
        )}
      </div>
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
      className="flex flex-col items-center justify-center h-32 text-muted"
    >
      <Tag className="w-12 h-12 mb-2 opacity-50" />
      <p>No articles with this tag</p>
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
