'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  ArrowLeft, 
  RefreshCw, 
  Trash2, 
  ExternalLink, 
  Rss,
  CheckCheck 
} from 'lucide-react';
import { useFeed, useDeleteFeed, useRefreshFeed, useEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useUpdateEntriesStatus } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton, FeedHeaderSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import type { Entry } from '@feedglow/shared';

export default function FeedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const feedId = Number(params.id);
  
  const { data: feed, isLoading: feedLoading } = useFeed(feedId);
  const { data: entriesData, isLoading: entriesLoading } = useEntries({ feedId });
  const refreshFeed = useRefreshFeed();
  const deleteFeed = useDeleteFeed();
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const updateEntriesStatus = useUpdateEntriesStatus();
  
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const entries = entriesData?.entries || [];

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

  if (!feedLoading && !feed) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <span className="text-6xl mb-4 block">📡</span>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Feed not found</p>
          <Link href="/feeds" className="text-orange-500 hover:underline">
            ← Back to feeds
          </Link>
        </motion.div>
      </div>
    );
  }

  const listHeader = feedLoading ? (
    <FeedHeaderSkeleton />
  ) : (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4">
      {/* Feed info */}
      <div className="flex items-center gap-3 mb-3">
        <Link
          href="/feeds"
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </Link>
        {feed?.iconUrl ? (
          <img src={feed.iconUrl} alt="" className="w-8 h-8 rounded" />
        ) : (
          <Rss className="w-8 h-8 text-gray-300" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate dark:text-white">{feed?.title}</h1>
          <p className="text-xs text-gray-500 truncate">{feed?.siteUrl || feed?.feedUrl}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3 pl-9">
        <span>{feed?.unreadCount || 0} unread</span>
        <span>•</span>
        <span>{entriesData?.total ?? entries.length} total</span>
        {feed?.lastCheckedAt && (
          <>
            <span>•</span>
            <span>Updated {new Date((feed as any).checkedAt || feed.lastCheckedAt).toLocaleDateString()}</span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pl-9">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleRefresh}
          disabled={refreshFeed.isPending}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshFeed.isPending ? 'animate-spin' : ''}`} />
          Refresh
        </motion.button>
        
        {feed?.siteUrl && (
          <a
            href={feed.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Visit
          </a>
        )}

        {entries.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleMarkAllRead}
            disabled={updateEntriesStatus.isPending}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
            title="Mark all as read"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </motion.button>
        )}

        <div className="flex-1" />

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </motion.div>
  );

  const listContent = entriesLoading ? (
    <EntryListSkeleton count={10} />
  ) : entries.length > 0 ? (
    <EntryList entries={entries} selectedId={selectedEntry?.id} onSelect={setSelectedEntry} />
  ) : (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-32 text-gray-500"
    >
      <span className="text-3xl mb-2">📭</span>
      <p>No entries yet</p>
      <button
        onClick={handleRefresh}
        className="mt-2 text-orange-500 hover:underline text-sm"
      >
        Refresh to fetch entries
      </button>
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

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4"
            >
              <h3 className="text-lg font-semibold mb-2 dark:text-white">Delete Feed?</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Are you sure you want to delete "{feed?.title}"? This will also remove all its entries.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDelete}
                  disabled={deleteFeed.isPending}
                  className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleteFeed.isPending ? 'Deleting...' : 'Delete'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
