'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Loader2, Globe, Check, ExternalLink, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { cn } from '@feedglow/ui';
import { t, getLocale } from '@/lib/i18n';

interface PreviewEntry {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string;
  thumbnail: string | null;
  author: string | null;
  content?: string;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return t('entry.social.justNow');
  if (diffMins < 60) return t('time.minutesAgo', { n: diffMins });
  if (diffHours < 24) return t('time.hoursAgo', { n: diffHours });
  if (diffDays < 7) return t('time.daysAgo', { n: diffDays });
  return date.toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
}

// Entry list item
function PreviewEntryItem({
  entry,
  isSelected,
  onClick,
  feedIcon,
}: {
  entry: PreviewEntry;
  isSelected: boolean;
  onClick: () => void;
  feedIcon?: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClick}
      className={cn(
        'p-4 cursor-pointer transition-all border-l-2',
        isSelected 
          ? 'bg-orange-500/10 border-l-orange-500' 
          : 'hover:bg-[rgb(var(--bg-hover))] border-l-transparent'
      )}
    >
      <div className="flex gap-3">
        {/* Feed icon */}
        {feedIcon && (
          <img 
            src={feedIcon} 
            alt="" 
            className="w-5 h-5 rounded mt-0.5 flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        
        <div className="flex-1 min-w-0">
          {/* Time */}
          <div className="flex items-center gap-2 text-xs text-muted mb-1">
            <span>{formatTimeAgo(entry.publishedAt)}</span>
          </div>
          
          {/* Title */}
          <h3 className={cn(
            'font-medium line-clamp-2 transition-colors',
            isSelected ? 'text-orange-500' : 'text-[rgb(var(--text-primary))]'
          )}>
            {entry.title}
          </h3>
          
          {/* Snippet */}
          {entry.snippet && (
            <p className="text-sm text-secondary mt-1 line-clamp-2">
              {entry.snippet}
            </p>
          )}
        </div>
        
        {/* Thumbnail */}
        {entry.thumbnail && (
          <img 
            src={entry.thumbnail} 
            alt=""
            className="w-20 h-14 object-cover rounded flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
    </motion.div>
  );
}

// Entry list skeleton
function EntryListSkeleton() {
  return (
    <div className="space-y-1">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="p-4 animate-pulse">
          <div className="flex gap-3">
            <div className="w-5 h-5 bg-[rgb(var(--bg-hover))] rounded flex-shrink-0" />
            <div className="flex-1">
              <div className="h-3 bg-[rgb(var(--bg-hover))] rounded w-20 mb-2" />
              <div className="h-4 bg-[rgb(var(--bg-hover))] rounded w-full mb-1" />
              <div className="h-4 bg-[rgb(var(--bg-hover))] rounded w-3/4 mb-2" />
              <div className="h-3 bg-[rgb(var(--bg-hover))] rounded w-full" />
            </div>
            <div className="w-20 h-14 bg-[rgb(var(--bg-hover))] rounded flex-shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Article reader for preview
function PreviewReader({
  entry,
  feedTitle,
}: {
  entry: PreviewEntry | null;
  feedTitle: string;
}) {
  if (!entry) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-secondary">
        <BookOpen className="w-16 h-16 mb-4 text-muted" />
        <p>{t('discover.selectArticle')}</p>
        <p className="text-sm mt-2 text-muted">{t('discover.shortcutHint')}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <article className="max-w-3xl mx-auto p-8">
        {/* Article header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))] mb-4">
            {entry.title}
          </h1>
          
          <div className="flex items-center gap-4 text-sm text-secondary">
            <span>{feedTitle}</span>
            <span>·</span>
            <span>{formatTimeAgo(entry.publishedAt)}</span>
            {entry.author && (
              <>
                <span>·</span>
                <span>{entry.author}</span>
              </>
            )}
          </div>
        </header>
        
        {/* Thumbnail */}
        {entry.thumbnail && (
          <img 
            src={entry.thumbnail} 
            alt=""
            className="w-full max-h-80 object-cover rounded-lg mb-8"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        
        {/* Content preview */}
        <div className="prose dark:prose-invert max-w-none">
          {entry.snippet && (
            <p className="text-lg text-secondary leading-relaxed">
              {entry.snippet}
            </p>
          )}
          
          {/* CTA to read full article */}
          <div className="mt-8 p-6 bg-[rgb(var(--bg-elevated))] rounded-xl border border-[rgb(var(--border-default))] text-center">
            <p className="text-secondary mb-4">
              {t('discover.previewHint')}
            </p>
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {t('discover.readOriginal')}
            </a>
          </div>
        </div>
      </article>
    </div>
  );
}

function FeedPreviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const feedUrl = searchParams.get('url') || '';
  const queryClient = useQueryClient();
  
  const [selectedEntry, setSelectedEntry] = useState<PreviewEntry | null>(null);
  
  // Fetch preview data with infinite scroll
  // Temporarily using simple useQuery instead of useInfiniteQuery
  const {
    data: rawData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['feed-preview-full', feedUrl],
    queryFn: () => api.getFeedPreviewFull(feedUrl, { offset: 0, limit: 50 }),
    enabled: !!feedUrl,
  });
  
  // Fake infinite query interface for compatibility
  const data = rawData ? { pages: [rawData] } : undefined;
  const hasNextPage = false;
  const isFetchingNextPage = false;
  const fetchNextPage = () => Promise.resolve();

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: () => api.createFeed(feedUrl),
    onSuccess: (newFeed) => {
      toast.success(t('discover.subscribeSuccess'));
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      // Navigate to the subscribed feed
      router.push(`/feed/${newFeed.id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || t('discover.subscribeFailed'));
    },
  });

  const preview = data?.pages[0];
  const allEntries = useMemo(() => {
    return data?.pages?.flatMap(page => page?.items || []) || [];
  }, [data?.pages]);

  // Keyboard navigation
  const selectedIndex = selectedEntry ? allEntries.findIndex(e => e.url === selectedEntry.url) : -1;
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = Math.min(selectedIndex + 1, allEntries.length - 1);
      if (nextIndex >= 0) setSelectedEntry(allEntries[nextIndex]);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = Math.max(selectedIndex - 1, 0);
      if (allEntries.length > 0) setSelectedEntry(allEntries[prevIndex]);
    } else if (e.key === 'o' || e.key === 'Enter') {
      if (selectedEntry) {
        window.open(selectedEntry.url, '_blank');
      }
    } else if (e.key === 'Escape') {
      router.back();
    }
  };

  if (!feedUrl) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-secondary">
          <Globe className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>{t('discover.provideFeedUrl')}</p>
          <Link href="/discover" className="text-orange-500 mt-4 inline-block">
            {t('discover.backToDiscover')}
          </Link>
        </div>
      </div>
    );
  }

  // Header component
  const header = (
    <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border-default))] bg-[rgb(var(--bg-elevated))] relative z-10 flex-shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-[rgb(var(--bg-hover))] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3 min-w-0">
          {preview?.iconUrl && (
            <img 
              src={preview.iconUrl} 
              alt="" 
              className="w-8 h-8 rounded-lg flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="min-w-0">
            <h1 className="font-semibold truncate">
              {preview?.title || t('settings.common.loading')}
            </h1>
            {preview?.siteUrl && (
              <a 
                href={preview.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted hover:text-orange-500 truncate block"
              >
                {new URL(preview.siteUrl).hostname}
              </a>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted hidden sm:inline">
          {t('discover.articles', { count: preview?.total || 0 })}
        </span>
        
        <button
          onClick={() => subscribeMutation.mutate()}
          disabled={subscribeMutation.isPending || subscribeMutation.isSuccess}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
            subscribeMutation.isSuccess
              ? 'bg-green-500/20 text-green-400'
              : 'bg-orange-500 hover:bg-orange-600 text-white'
          )}
        >
          {subscribeMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : subscribeMutation.isSuccess ? (
            <Check className="w-4 h-4" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {subscribeMutation.isSuccess ? t('discover.subscribed') : t('settings.categories.subscriptions')}
        </button>
      </div>
    </div>
  );

  // Entry list component
  const entryList = (
    <div className="h-full flex flex-col" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Filter bar */}
      <div className="flex items-center justify-between p-3 border-b border-[rgb(var(--border-default))]">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>{t('settings.filterRules.targetAll')}</span>
          <span>·</span>
          <span>{t('discover.filterLatest')}</span>
        </div>
      </div>
      
      {/* Entry list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <EntryListSkeleton />
        ) : error ? (
          <div className="p-8 text-center">
            <div className="text-6xl mb-4">😕</div>
            <p className="text-secondary mb-2">{t('discover.cannotLoadFeed')}</p>
            <p className="text-sm text-muted mb-6">
              {(error as Error).message || t('discover.feedUnavailable')}
            </p>
            <button
              onClick={() => subscribeMutation.mutate()}
              disabled={subscribeMutation.isPending}
              className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors inline-flex items-center gap-2"
            >
              {subscribeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {t('discover.stillSubscribe')}
            </button>
          </div>
        ) : allEntries.length === 0 ? (
          <div className="p-8 text-center text-secondary">
            {t('discover.noArticles')}
          </div>
        ) : (
          <>
            <div className="divide-y divide-[rgb(var(--border-subtle))]">
              {allEntries.map((entry, index) => (
                <PreviewEntryItem
                  key={`${entry.url}-${index}`}
                  entry={entry}
                  isSelected={selectedEntry?.url === entry.url}
                  onClick={() => setSelectedEntry(entry)}
                  feedIcon={preview?.iconUrl}
                />
              ))}
            </div>
            
            {/* Load more */}
            {hasNextPage && (
              <div className="p-4 text-center">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="px-4 py-2 text-sm text-orange-400 hover:bg-orange-400/10 rounded-lg transition-colors"
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  ) : null}
                  {t('discover.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  // Reader component
  const readerContent = (
    <PreviewReader
      entry={selectedEntry}
      feedTitle={preview?.title || ''}
    />
  );

  return (
    <div className="h-full flex flex-col surface-base">
      {header}
      <div className="flex-1 overflow-hidden">
        <ResizableLayout
          list={entryList}
          reader={readerContent}
          minListSize={300}
          defaultListSize={400}
          maxListSize={600}
        />
      </div>
    </div>
  );
}

export default function FeedPreviewPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    }>
      <FeedPreviewContent />
    </Suspense>
  );
}
