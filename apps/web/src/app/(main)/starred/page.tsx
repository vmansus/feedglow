'use client';

import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useInfiniteEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { SocialEntryList } from '@/components/entry/social-entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { Newspaper, MessageCircle, Bell, Image, Play, AlertTriangle, Star } from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import type { FeedType } from '@/lib/api';
import { EmptyReader } from '@/components/ui/empty-reader';
import { t } from '@/lib/i18n';

type TypeFilter = FeedType | 'all';

const TYPE_TABS: { type: TypeFilter; icon: React.ReactNode; label: string }[] = [
  { type: 'article', icon: <Newspaper className="w-4 h-4" />, label: t('settings.polling.article') },
  { type: 'social', icon: <MessageCircle className="w-4 h-4" />, label: t('page.common.social') },
  { type: 'picture', icon: <Image className="w-4 h-4" />, label: t('settings.polling.picture') },
  { type: 'video', icon: <Play className="w-4 h-4" />, label: t('settings.polling.video') },
  { type: 'notification', icon: <Bell className="w-4 h-4" />, label: t('settings.polling.notification') },
];

export default function StarredPage() {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('article');
  const { 
    data, 
    isLoading, 
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteEntries({ starred: true });
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();

  // Get entries from infinite query
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

  // Filter entries by selected type
  const filteredEntries = useMemo(() => {
    if (typeFilter === 'all') return entries;
    return entries.filter(e => (e.feedType || 'article') === typeFilter);
  }, [entries, typeFilter]);

  const isSocialView = typeFilter === 'social';

  const { showHelp, setShowHelp, shortcuts } = useKeyboardNavigation({
    entries: filteredEntries,
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
          <AlertTriangle className="w-8 h-8 mx-auto mb-4" />
          <p>Error loading entries</p>
        </motion.div>
      </div>
    );
  }

  const listHeader = (
    <div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 border-b border-[rgb(var(--border-default))]">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Star className="w-5 h-5 text-orange-500 fill-current" /> Starred
          {data?.total !== undefined && <span className="text-sm font-normal text-[rgb(var(--text-muted))]">({data.total})</span>}
        </h1>
      </motion.div>
      {/* Type filter tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[rgb(var(--border-default))] overflow-x-auto scrollbar-hide">
        {TYPE_TABS.map(({ type, icon, label }) => {
          const count = typeCounts[type] || 0;
          const isActive = typeFilter === type;
          // Hide tabs with 0 items (except "all")
          if (type !== 'all' && count === 0) return null;
          return (
            <button
              key={type}
              onClick={() => { setTypeFilter(type); setSelectedEntry(null); }}
              className={`
                relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                transition-all duration-200 whitespace-nowrap
                ${isActive
                  ? 'bg-orange-500/15 text-orange-500'
                  : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--bg-hover))]'
                }
              `}
            >
              {icon}
              {label}
              {count > 0 && (
                <span className={`text-[10px] ${isActive ? 'text-orange-400' : 'text-[rgb(var(--text-muted))]'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const listContent = isLoading ? (
    <EntryListSkeleton count={10} />
  ) : filteredEntries.length > 0 ? (
    isSocialView ? (
      <SocialEntryList
        entries={filteredEntries}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    ) : (
      <EntryList
        entries={filteredEntries}
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
      className="flex flex-col items-center justify-center h-32 text-[rgb(var(--text-muted))]"
    >
      <Star className="w-8 h-8 mb-2" />
      <p>{t('page.starred.noStarred', { type: typeFilter === 'all' ? t('settings.filterRules.targetContent') : TYPE_TABS.find(tab => tab.type === typeFilter)?.label || t('settings.filterRules.targetContent') })}</p>
    </motion.div>
  );

  const readerContent = (
    <AnimatePresence mode="wait">
      {selectedEntry && !isSocialView ? (
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
