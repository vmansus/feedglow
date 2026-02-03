'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Search, TrendingUp, Bookmark, Plus, Check, Loader2, Sparkles, Grid, List } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';

interface DiscoverFeed {
  id: string;
  title: string;
  description?: string;
  url: string;
  siteUrl?: string;
  iconUrl?: string;
  category?: string;
  subscribers?: number;
  isSubscribed?: boolean;
}

interface Collection {
  id: string;
  name: string;
  description: string;
  iconEmoji: string;
  feeds: DiscoverFeed[];
}

export default function DiscoverPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'recommended' | 'trending' | 'collections'>('recommended');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const queryClient = useQueryClient();

  // Fetch recommended feeds
  const { data: recommended, isLoading: loadingRecommended } = useQuery({
    queryKey: ['discover', 'recommended'],
    queryFn: () => api.getRecommendedFeeds(),
  });

  // Fetch trending feeds
  const { data: trending, isLoading: loadingTrending } = useQuery({
    queryKey: ['discover', 'trending'],
    queryFn: () => api.getTrendingFeeds(),
  });

  // Fetch collections
  const { data: collections, isLoading: loadingCollections } = useQuery({
    queryKey: ['discover', 'collections'],
    queryFn: () => api.getFeedCollections(),
  });

  // Search feeds
  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['discover', 'search', searchQuery],
    queryFn: () => api.searchFeeds(searchQuery),
    enabled: searchQuery.length > 2,
  });

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: (feedUrl: string) => api.subscribeFeed(feedUrl),
    onSuccess: () => {
      toast.success('Subscribed!');
      queryClient.invalidateQueries({ queryKey: ['discover'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
    onError: () => {
      toast.error('Failed to subscribe');
    },
  });

  const isLoading = activeTab === 'recommended' ? loadingRecommended 
    : activeTab === 'trending' ? loadingTrending 
    : loadingCollections;

  const currentFeeds = searchQuery.length > 2 
    ? searchResults?.feeds || []
    : activeTab === 'recommended' 
      ? recommended?.feeds || []
      : activeTab === 'trending'
        ? trending?.feeds || []
        : [];

  return (
    <div className="h-full overflow-y-auto surface-base">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center"
              style={{ boxShadow: '0 0 25px rgba(249, 115, 22, 0.4)' }}
            >
              <Compass className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">Discover</h1>
              <p className="text-sm text-muted">Find new feeds to follow</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search feeds by name, URL, or topic..."
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-[rgb(var(--bg-elevated))] border border-default text-[rgb(var(--text-primary))] placeholder-muted focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
          {searching && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted animate-spin" />
          )}
        </div>

        {/* Tabs */}
        {!searchQuery && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              <TabButton 
                active={activeTab === 'recommended'} 
                onClick={() => setActiveTab('recommended')}
                icon={<Sparkles className="w-4 h-4" />}
              >
                For You
              </TabButton>
              <TabButton 
                active={activeTab === 'trending'} 
                onClick={() => setActiveTab('trending')}
                icon={<TrendingUp className="w-4 h-4" />}
              >
                Trending
              </TabButton>
              <TabButton 
                active={activeTab === 'collections'} 
                onClick={() => setActiveTab('collections')}
                icon={<Bookmark className="w-4 h-4" />}
              >
                Collections
              </TabButton>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  viewMode === 'grid' ? 'bg-orange-500 text-white' : 'text-muted hover:bg-[rgb(var(--bg-hover))]'
                )}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  viewMode === 'list' ? 'bg-orange-500 text-white' : 'text-muted hover:bg-[rgb(var(--bg-hover))]'
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {isLoading || searching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : activeTab === 'collections' && !searchQuery ? (
          <CollectionsView 
            collections={collections?.collections || []} 
            onSubscribe={(url) => subscribeMutation.mutate(url)}
            subscribing={subscribeMutation.isPending}
          />
        ) : (
          <FeedsGrid 
            feeds={currentFeeds}
            viewMode={viewMode}
            onSubscribe={(url) => subscribeMutation.mutate(url)}
            subscribing={subscribeMutation.isPending}
          />
        )}

        {/* Empty state */}
        {!isLoading && !searching && currentFeeds.length === 0 && activeTab !== 'collections' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Compass className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-muted">
              {searchQuery ? 'No feeds found for your search' : 'No recommendations yet'}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function TabButton({ 
  children, 
  active, 
  onClick, 
  icon 
}: { 
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
        active 
          ? 'bg-orange-500 text-white' 
          : 'text-secondary hover:bg-[rgb(var(--bg-hover))]'
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function FeedsGrid({ 
  feeds, 
  viewMode,
  onSubscribe, 
  subscribing 
}: { 
  feeds: DiscoverFeed[];
  viewMode: 'grid' | 'list';
  onSubscribe: (url: string) => void;
  subscribing: boolean;
}) {
  return (
    <div className={cn(
      viewMode === 'grid' 
        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
        : 'space-y-3'
    )}>
      <AnimatePresence mode="popLayout">
        {feeds.map((feed, i) => (
          <motion.div
            key={feed.id || feed.url}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              'surface-elevated rounded-xl border border-default p-4 transition-all hover:border-orange-500/30',
              viewMode === 'list' && 'flex items-center gap-4'
            )}
          >
            {/* Icon */}
            <div className={cn(
              'flex-shrink-0',
              viewMode === 'grid' && 'mb-3'
            )}>
              {feed.iconUrl ? (
                <img 
                  src={feed.iconUrl} 
                  alt="" 
                  className="w-10 h-10 rounded-lg object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center">
                  <span className="text-lg">{feed.title?.[0] || '📰'}</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-[rgb(var(--text-primary))] truncate">
                {feed.title}
              </h3>
              {feed.description && (
                <p className="text-sm text-muted line-clamp-2 mt-1">
                  {feed.description}
                </p>
              )}
              {feed.category && (
                <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-[rgb(var(--bg-hover))] text-muted rounded">
                  {feed.category}
                </span>
              )}
            </div>

            {/* Subscribe button */}
            <button
              onClick={() => onSubscribe(feed.url)}
              disabled={feed.isSubscribed || subscribing}
              className={cn(
                'flex-shrink-0 p-2 rounded-lg transition-all',
                feed.isSubscribed 
                  ? 'bg-green-500/10 text-green-500' 
                  : 'bg-orange-500 text-white hover:bg-orange-600'
              )}
            >
              {feed.isSubscribed ? (
                <Check className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function CollectionsView({ 
  collections, 
  onSubscribe, 
  subscribing 
}: { 
  collections: Collection[];
  onSubscribe: (url: string) => void;
  subscribing: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {collections.map((collection) => (
        <motion.div
          key={collection.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="surface-elevated rounded-xl border border-default overflow-hidden"
        >
          {/* Collection header */}
          <button
            onClick={() => setExpanded(expanded === collection.id ? null : collection.id)}
            className="w-full p-4 flex items-center gap-3 hover:bg-[rgb(var(--bg-hover))] transition-colors"
          >
            <span className="text-2xl">{collection.iconEmoji}</span>
            <div className="flex-1 text-left">
              <h3 className="font-semibold text-[rgb(var(--text-primary))]">{collection.name}</h3>
              <p className="text-sm text-muted">{collection.description}</p>
            </div>
            <span className="text-sm text-muted">{collection.feeds.length} feeds</span>
          </button>

          {/* Expanded feeds */}
          <AnimatePresence>
            {expanded === collection.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-default"
              >
                <div className="p-4 space-y-2">
                  {collection.feeds.map((feed) => (
                    <div key={feed.id || feed.url} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[rgb(var(--bg-hover))]">
                      {feed.iconUrl ? (
                        <img src={feed.iconUrl} alt="" className="w-6 h-6 rounded" />
                      ) : (
                        <div className="w-6 h-6 rounded bg-[rgb(var(--bg-hover))] flex items-center justify-center text-xs">
                          📰
                        </div>
                      )}
                      <span className="flex-1 text-sm text-[rgb(var(--text-primary))] truncate">
                        {feed.title}
                      </span>
                      <button
                        onClick={() => onSubscribe(feed.url)}
                        disabled={feed.isSubscribed || subscribing}
                        className={cn(
                          'p-1.5 rounded transition-colors',
                          feed.isSubscribed 
                            ? 'text-green-500' 
                            : 'text-orange-500 hover:bg-orange-500/10'
                        )}
                      >
                        {feed.isSubscribed ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}
