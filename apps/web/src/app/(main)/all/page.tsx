'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useInfiniteEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useMarkAllAsRead, useScrollMarkRead, getScrollMarkReadSettings } from '@/hooks';
import { getEntry } from '@/lib/api';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { EntryFiltersBar, useEntryFilters } from '@/components/entry/entry-filters';
import { useFeedType } from '@/contexts/feed-type-context';
import { CheckCircle, AlertTriangle, Newspaper, MessageCircle, Bell, Image, Video, Inbox } from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import { EmptyReader } from '@/components/ui/empty-reader';
import { t } from '../../../lib/i18n';

export default function AllPage() {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const scrollMarkReadSettings = getScrollMarkReadSettings();
  const [entryParam] = useState(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('entry');
  });
  const { selectedType } = useFeedType();
  const { filters, updateFilters } = useEntryFilters();
  
  const { 
    data, 
    isLoading, 
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteEntries({
    status: filters.status === 'all' ? undefined : filters.status,
    starred: filters.starred || undefined,
    feedType: selectedType === 'all' ? undefined : selectedType,
  });
  
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const markAllAsRead = useMarkAllAsRead();

  // Get entries from infinite query
  const entries = useMemo(() => {
    return Array.isArray(data?.entries) ? data.entries : [];
  }, [data?.entries]);

  // Auto-open entry from URL param (?entry=<uuid>)
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (entryParam && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      getEntry(entryParam as any).then(setSelectedEntry).catch(() => {});
    }
  }, [entryParam]);

  // Apply client-side sorting
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

  useScrollMarkRead({
    containerRef: listContainerRef,
    enabled: scrollMarkReadSettings.enabled,
    delay: scrollMarkReadSettings.delay,
    readerOpen: !!selectedEntry,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center text-red-500">
          <AlertTriangle className="w-8 h-8 mx-auto mb-4" />
          <p>Error loading entries</p>
        </motion.div>
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    all: 'All Articles',
    article: t('settings.polling.article'),
    social: t('page.common.social'),
    notification: t('settings.polling.notification'),
    picture: t('settings.polling.picture'),
    video: t('settings.polling.video'),
  };

  const typeIcons: Record<string, React.ReactNode> = {
    all: <Newspaper className="w-5 h-5 text-orange-500" />,
    article: <Newspaper className="w-5 h-5 text-orange-500" />,
    social: <MessageCircle className="w-5 h-5 text-orange-500" />,
    notification: <Bell className="w-5 h-5 text-orange-500" />,
    picture: <Image className="w-5 h-5 text-orange-500" />,
    video: <Video className="w-5 h-5 text-orange-500" />,
  };

  const listHeader = (
    <div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          {typeIcons[selectedType]} {typeLabels[selectedType]}
          {data?.total !== undefined && <span className="text-sm font-normal text-muted">({data.total})</span>}
        </h1>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
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

  const listContent = <div ref={listContainerRef} className="h-full">{isLoading ? (
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
      <Inbox className="w-8 h-8 mb-2" />
      <p>No articles found</p>
    </motion.div>
  )}</div>;

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
