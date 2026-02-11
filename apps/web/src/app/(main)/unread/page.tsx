'use client';

import { useState, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertTriangle, Inbox, CheckCircle2 } from 'lucide-react';
import { useInfiniteEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useMarkAllAsRead, useScrollMarkRead, getScrollMarkReadSettings } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { SocialEntryList } from '@/components/entry/social-entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { useEntryFilters } from '@/components/entry/entry-filters';
import { useFeedType } from '@/contexts/feed-type-context';
import { ArrowUpDown, ChevronDown, Star, Newspaper, MessageCircle, Bell, Image, Play } from 'lucide-react';
import { cn } from '@feedglow/ui';
import type { Entry } from '@feedglow/shared';
import { EmptyReader } from '@/components/ui/empty-reader';
import type { FeedType } from '@/lib/api';
import { t } from '@/lib/i18n';

type TypeFilter = FeedType | 'all';

const TYPE_TABS: { type: TypeFilter; icon: React.ReactNode; label: string }[] = [
  { type: 'article', icon: <Newspaper className="w-3.5 h-3.5" />, label: t('settings.polling.article') },
  { type: 'social', icon: <MessageCircle className="w-3.5 h-3.5" />, label: t('page.common.social') },
  { type: 'picture', icon: <Image className="w-3.5 h-3.5" />, label: t('settings.polling.picture') },
  { type: 'video', icon: <Play className="w-3.5 h-3.5" />, label: t('settings.polling.video') },
  { type: 'notification', icon: <Bell className="w-3.5 h-3.5" />, label: t('settings.polling.notification') },
];

export default function UnreadPage() {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const scrollMarkReadSettings = getScrollMarkReadSettings();
  const { selectedType } = useFeedType();
  const { filters, updateFilters } = useEntryFilters();
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  
  const { 
    data, 
    isLoading, 
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteEntries({ 
    status: 'unread',
    feedType: selectedType === 'all' ? undefined : selectedType,
    starred: filters.starred || undefined,
  });
  
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const markAllAsRead = useMarkAllAsRead();

  // Get entries from infinite query result
  const entries = useMemo(() => {
    return Array.isArray(data?.entries) ? data.entries : [];
  }, [data?.entries]);
  
  // Count entries by type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      const t = e.feedType || 'article';
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [entries]);

  // Filter by type then sort
  const filteredEntries = useMemo(() => {
    if (typeFilter === 'all') return entries;
    return entries.filter(e => (e.feedType || 'article') === typeFilter);
  }, [entries, typeFilter]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      const aDate = new Date(a.publishedAt);
      const bDate = new Date(b.publishedAt);
      return filters.direction === 'desc' ? bDate.getTime() - aDate.getTime() : aDate.getTime() - bDate.getTime();
    });
  }, [filteredEntries, filters.direction]);

  const isSocialView = typeFilter === 'social';

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

  const listHeader = (
    <div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Inbox className="w-5 h-5 text-orange-500" /> Unread
          {data?.total !== undefined && <span className="text-sm font-normal text-muted">({data.total})</span>}
        </h1>
        {entries.length > 0 && (
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
      
      {/* Type Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-default">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn(
            "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
            typeFilter === 'all'
              ? "bg-orange-500/20 text-orange-500"
              : "text-muted hover:text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--bg-hover))]"
          )}
        >
          {t('unread.allType', { type: '' })} {typeCounts.all || 0}
        </button>
        {TYPE_TABS.map(tab => {
          const count = typeCounts[tab.type] || 0;
          if (count === 0) return null;
          return (
            <button
              key={tab.type}
              onClick={() => setTypeFilter(tab.type)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1",
                typeFilter === tab.type
                  ? "bg-orange-500/20 text-orange-500"
                  : "text-muted hover:text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--bg-hover))]"
              )}
            >
              {tab.icon}
              {tab.label} {count}
            </button>
          );
        })}
      </div>

      {/* Sort & filter bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-default bg-[rgb(var(--bg-base))]">
        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>
              {filters.order === 'published_at' ? t('page.common.publishTime') : t('page.common.addedTime')}
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
                  {t('page.common.publishNewest')}
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
                  {t('page.common.publishOldest')}
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
          {t('stats.starred')}
        </button>
      </div>
    </div>
  );

  const listContent = <div ref={listContainerRef} className="h-full">{isLoading ? (
    <EntryListSkeleton count={10} />
  ) : sortedEntries.length > 0 ? (
    isSocialView ? (
      <SocialEntryList
        entries={sortedEntries}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    ) : (
      <EntryList 
        entries={sortedEntries} 
        selectedId={selectedEntry?.id} 
        onSelect={setSelectedEntry}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    )
  ) : (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-32 text-muted"
    >
      <CheckCircle2 className="w-8 h-8 mb-2 text-green-500" />
      <p>{t('page.common.allCaughtUp')}</p>
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
