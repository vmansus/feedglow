'use client';

import Link from 'next/link';
import { useFeeds, useCategories } from '@/hooks';
import { Plus, Rss, Folder, ExternalLink, RefreshCw } from 'lucide-react';

export default function FeedsPage() {
  const { feeds, isLoading: feedsLoading, mutate: refreshFeeds } = useFeeds();
  const { categories, isLoading: categoriesLoading } = useCategories();

  const isLoading = feedsLoading || categoriesLoading;

  // Group feeds by category
  const feedsByCategory = feeds?.reduce((acc, feed) => {
    const catId = feed.category?.id || 0;
    if (!acc[catId]) {
      acc[catId] = [];
    }
    acc[catId].push(feed);
    return acc;
  }, {} as Record<number, typeof feeds>) || {};

  const uncategorized = feedsByCategory[0] || [];
  const categorizedFeeds = Object.entries(feedsByCategory).filter(([id]) => id !== '0');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Feeds</h1>
        <div className="flex gap-2">
          <button
            onClick={() => refreshFeeds()}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <Link
            href="/feeds/add"
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Feed
          </Link>
        </div>
      </div>

      {(!feeds || feeds.length === 0) ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Rss className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">No feeds yet</p>
          <Link
            href="/feeds/add"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            <Plus className="w-4 h-4" />
            Add your first feed
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Categorized feeds */}
          {categorizedFeeds.map(([catId, catFeeds]) => {
            const category = categories?.find(c => c.id === Number(catId));
            return (
              <div key={catId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <Folder className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">{category?.title || 'Unknown'}</span>
                  <span className="text-sm text-gray-400">({catFeeds.length})</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {catFeeds.map((feed) => (
                    <FeedItem key={feed.id} feed={feed} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Uncategorized feeds */}
          {uncategorized.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <Rss className="w-4 h-4 text-gray-500" />
                <span className="font-medium">Uncategorized</span>
                <span className="text-sm text-gray-400">({uncategorized.length})</span>
              </div>
              <div className="divide-y divide-gray-100">
                {uncategorized.map((feed) => (
                  <FeedItem key={feed.id} feed={feed} />
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="text-center text-sm text-gray-400 pt-4">
            {feeds.length} feed{feeds.length !== 1 ? 's' : ''} subscribed
          </div>
        </div>
      )}
    </div>
  );
}

function FeedItem({ feed }: { feed: any }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      {feed.icon_url ? (
        <img
          src={feed.icon_url}
          alt=""
          className="w-6 h-6 rounded"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <Rss className="w-6 h-6 text-gray-300" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{feed.title}</div>
        <div className="text-sm text-gray-400 truncate">{feed.site_url || feed.feed_url}</div>
      </div>
      <div className="flex items-center gap-3 text-sm text-gray-400">
        {feed.unread_count > 0 && (
          <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs font-medium">
            {feed.unread_count}
          </span>
        )}
        {feed.site_url && (
          <a
            href={feed.site_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:text-gray-600"
            title="Visit site"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
