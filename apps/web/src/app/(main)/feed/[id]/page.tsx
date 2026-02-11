'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, CheckCircle, Loader2, Trash2, Inbox } from 'lucide-react';
import { useFeed, useDeleteFeed, useRefreshFeed, useBackfillFeed, useInfiniteEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useMarkFeedAsRead, useScrollMarkRead, getScrollMarkReadSettings } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { SocialEntryList } from '@/components/entry/social-entry-list';
import { EntryListSkeleton, FeedHeaderSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { EntryFiltersBar, useEntryFilters } from '@/components/entry/entry-filters';
import type { Entry } from '@feedglow/shared';
import { EmptyReader } from '@/components/ui/empty-reader';
import { t } from '@/lib/i18n';

export default function FeedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const feedId = Number(params.id);
  const { filters, updateFilters } = useEntryFilters();
  
  const { data: feed, isLoading: feedLoading } = useFeed(feedId);
  const { 
    data: entriesData, 
    isLoading: entriesLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteEntries({ 
    feedId,
    status: filters.status === 'all' ? undefined : filters.status,
    starred: filters.starred || undefined,
  });
  const refreshFeed = useRefreshFeed();
  const backfillFeed = useBackfillFeed();
  const deleteFeed = useDeleteFeed();
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const markFeedAsRead = useMarkFeedAsRead();
  
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const scrollMarkReadSettings = getScrollMarkReadSettings();

  // Get entries from infinite query
  const entries = useMemo(() => {
    return Array.isArray(entriesData?.entries) ? entriesData.entries : [];
  }, [entriesData?.entries]);
  
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

  // Auto-trigger backfill once when all pages are loaded
  const hasTriedBackfillRef = useRef(false);
  
  useEffect(() => {
    hasTriedBackfillRef.current = false;
  }, [feedId]);
  
  useEffect(() => {
    // Trigger backfill when:
    // 1. Not currently loading
    // 2. No more pages to fetch (all entries loaded)
    // 3. We have some entries (not empty feed)
    // 4. Haven't tried backfill yet for this feed
    // 5. Backfill mutation is not already running
    if (
      !entriesLoading && 
      !hasNextPage && 
      !isFetchingNextPage &&
      entries.length > 0 && 
      !hasTriedBackfillRef.current && 
      !backfillFeed.isPending
    ) {
      hasTriedBackfillRef.current = true;
      backfillFeed.mutate(feedId);
    }
  }, [entriesLoading, hasNextPage, isFetchingNextPage, entries.length, backfillFeed.isPending, feedId]);

  const handleRefresh = () => {
    refreshFeed.mutate(feedId);
  };

  const handleDelete = () => {
    deleteFeed.mutate(feedId, {
      onSuccess: () => {
        router.push('/feeds');
      },
    });
  };

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

  if (!feedLoading && !feed) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <span className="text-6xl mb-4 block">📡</span>
          <p className="text-red-500 mb-2">Feed not found</p>
          <Link href="/feeds" className="text-orange-500 hover:underline">
            ← Back to feeds
          </Link>
        </motion.div>
      </div>
    );
  }

  const listHeader = (
    <div>
      {/* Feed Header */}
      {feedLoading ? (
        <FeedHeaderSkeleton />
      ) : feed ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 border-b border-default">
          <div className="flex items-start gap-4">
            <Link href="/feeds" className="p-2 -ml-2 hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                {feed.iconUrl && (
                  <img src={feed.iconUrl} alt="" className="w-6 h-6 rounded" />
                )}
                <h1 className="text-lg font-semibold text-[rgb(var(--text-primary))] truncate">{feed.title}</h1>
              </div>
              {feed.siteUrl && (
                <a href={feed.siteUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-orange-500 truncate block">
                  {feed.siteUrl}
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markFeedAsRead.mutate({ feedId })}
                  disabled={markFeedAsRead.isPending}
                  className="text-xs text-muted hover:text-orange-500 flex items-center gap-1 transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {t('page.common.markAllRead')}
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshFeed.isPending}
                className="p-2 hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors"
                title={t('settings.feedSources.refresh')}
              >
                <RefreshCw className={`w-4 h-4 ${refreshFeed.isPending ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 hover:bg-red-500/10 text-muted hover:text-red-500 rounded-lg transition-colors"
                title={t('page.feed.deleteFeed')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
      
      <EntryFiltersBar filters={filters} onChange={updateFilters} />
    </div>
  );

  const listContent = <div ref={listContainerRef} className="h-full">{entriesLoading ? (
    <EntryListSkeleton count={10} />
  ) : sortedEntries.length > 0 ? (
    <>
      <EntryList 
        entries={sortedEntries} 
        selectedId={selectedEntry?.id} 
        onSelect={setSelectedEntry}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
      {/* Backfill status indicator - separate from infinite scroll */}
      {backfillFeed.isPending && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
          <span className="ml-2 text-sm text-zinc-500">{t('page.feed.backfilling')}</span>
        </div>
      )}
    </>
  ) : (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-32 text-muted"
    >
      <Inbox className="w-8 h-8 mb-2" />
      <p>No articles in this feed</p>
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

  // ── Social timeline layout (for feed_type === 'social') ──
  const isSocial = feed?.feed_type === 'social';

  if (isSocial) {
    return (
      <>
        <div className="h-full overflow-y-auto scrollbar-hide">
          {/* Feed header — reused */}
          {listHeader}

          {/* Social timeline */}
          {entriesLoading ? (
            <div className="max-w-[680px] mx-auto px-4">
              <EntryListSkeleton count={8} />
            </div>
          ) : sortedEntries.length > 0 ? (
            <>
              <SocialEntryList
                entries={sortedEntries}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={fetchNextPage}
              />
              {backfillFeed.isPending && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                  <span className="ml-2 text-sm text-zinc-500">{t('page.feed.backfilling')}</span>
                </div>
              )}
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-32 text-muted"
            >
              <Inbox className="w-8 h-8 mb-2" />
              <p>No tweets in this feed</p>
            </motion.div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
              onClick={() => setShowDeleteConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="surface-elevated p-6 rounded-xl border border-default max-w-sm mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold mb-2">{t('page.feed.deleteFeed')}</h3>
                <p className="text-muted mb-4">{t('page.feed.deleteConfirm', { title: feed?.title || '' })}</p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 text-sm border border-default rounded-lg hover:bg-[rgb(var(--bg-hover))]"
                  >
                    {t('settings.common.cancel')}
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteFeed.isPending}
                    className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    {deleteFeed.isPending ? t('page.saved.deleting') : t('settings.common.delete')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ── Default article layout ──
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
      
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="surface-elevated p-6 rounded-xl border border-default max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-2">{t('page.feed.deleteFeed')}</h3>
              <p className="text-muted mb-4">{t('page.feed.deleteConfirm', { title: feed?.title || '' })}</p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm border border-default rounded-lg hover:bg-[rgb(var(--bg-hover))]"
                >
                  {t('settings.common.cancel')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteFeed.isPending}
                  className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                >
                  {deleteFeed.isPending ? t('page.saved.deleting') : t('settings.common.delete')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
