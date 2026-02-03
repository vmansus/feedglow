'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFeed, useDeleteFeed, useRefreshFeed, useEntries } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { 
  ArrowLeft, 
  RefreshCw, 
  Trash2, 
  ExternalLink, 
  Rss 
} from 'lucide-react';
import type { Entry } from '@feedglow/shared';

export default function FeedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const feedId = Number(params.id);
  
  const { data: feed, isLoading: feedLoading } = useFeed(feedId);
  const { data: entriesData, isLoading: entriesLoading } = useEntries({ feedId });
  const refreshFeed = useRefreshFeed();
  const deleteFeed = useDeleteFeed();
  
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

  if (feedLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!feed) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">Feed not found</p>
        <Link href="/feeds" className="text-orange-500 hover:underline mt-2 inline-block">
          ← Back to feeds
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left panel - Feed info and entries */}
      <div className={`${selectedEntry ? 'w-1/2 border-r border-gray-200 dark:border-gray-800' : 'w-full'} flex flex-col`}>
        {/* Feed header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/feeds"
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </Link>
            {feed.iconUrl ? (
              <img src={feed.iconUrl} alt="" className="w-8 h-8 rounded" />
            ) : (
              <Rss className="w-8 h-8 text-gray-300" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate dark:text-white">{feed.title}</h1>
              <p className="text-sm text-gray-500 truncate">{feed.siteUrl || feed.feedUrl}</p>
            </div>
          </div>

          {/* Feed stats */}
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
            <span>{feed.unreadCount || 0} unread</span>
            <span>•</span>
            <span>{entries?.length || 0} total</span>
            {feed.lastCheckedAt && (
              <>
                <span>•</span>
                <span>Updated {new Date(feed.checkedAt).toLocaleDateString()}</span>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshFeed.isPending}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshFeed.isPending ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            
            {feed.siteUrl && (
              <a
                href={feed.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Visit Site
              </a>
            )}

            <div className="flex-1" />

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Entries list */}
        <div className="flex-1 overflow-auto">
          {entriesLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : entries.length > 0 ? (
            <EntryList
              entries={entries}
              selectedId={selectedEntry?.id}
              onSelect={setSelectedEntry}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <p>No entries yet</p>
              <button
                onClick={handleRefresh}
                className="mt-2 text-orange-500 hover:underline text-sm"
              >
                Refresh to fetch entries
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right panel - Entry reader */}
      {selectedEntry && (
        <div className="w-1/2 overflow-auto bg-white dark:bg-gray-950">
          <EntryReader entry={selectedEntry} />
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2 dark:text-white">Delete Feed?</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete "{feed.title}"? This will also remove all its entries.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteFeed.isPending}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleteFeed.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
