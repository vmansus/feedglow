'use client';

import { useState, Suspense, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Search, Plus, Loader2, TrendingUp, Bookmark, Clock, ArrowRight, Globe, Sparkles, BarChart3, Check, BookOpen, Folder, Library, Newspaper, ExternalLink } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import type { RSSHubRoute } from '@/lib/api';
import { t, getLocale } from '@/lib/i18n';

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) return t('time.minutesAgo', { n: diffMins });
  if (diffHours < 24) return t('time.hoursAgo', { n: diffHours });
  if (diffDays < 7) return t('time.daysAgo', { n: diffDays });
  return date.toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US');
}

// Build RSSHub URL from route
function buildRSSHubUrl(route: RSSHubRoute, instance: string = 'https://rsshub.app'): string {
  if (route.feedUrl) return route.feedUrl;
  if ((route as any).url) return (route as any).url;
  if (route.example) {
    // example might be full URL or just path
    if (route.example.startsWith('http')) return route.example;
    return `${instance}${route.example}`;
  }
  return `${instance}${route.path}`;
}

// Get favicon URL for a domain (from siteUrl or feedUrl)
function getFaviconUrl(siteUrl: string | undefined, feedUrl?: string): string | null {
  const urlToUse = siteUrl || feedUrl;
  if (!urlToUse) return null;
  try {
    const url = new URL(urlToUse);
    let domain = url.hostname;
    // Strip common feed subdomains to get the main site domain
    domain = domain
      .replace(/^feeds?\d*\./, '')      // feeds., feed., feeds2.
      .replace(/^rss\./, '')            // rss.
      .replace(/^blog\./, '')           // blog.
      .replace(/^www\./, '');           // www.
    // Handle feedburner - extract domain from path if possible
    if (domain === 'feeds.feedburner.com' || domain === 'feedburner.com') {
      // feedburner URLs don't help, return null to show fallback
      return null;
    }
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return null;
  }
}

// Category mapping for recommendations
const CATEGORY_MAPPING: Record<string, string[]> = {
  'tech': ['programming', 'new-media', 'design'],
  'news': ['traditional-media', 'new-media', 'government'],
  'dev': ['programming', 'design'],
  'ai': ['programming', 'new-media'],
  'design': ['design', 'picture'],
  'finance': ['finance'],
  'gaming': ['game', 'anime'],
  'entertainment': ['anime', 'live', 'multimedia'],
};

// Expandable Feed Card with inline article preview
function FeedCard({
  route,
  isExpanded,
  onToggle,
  onSubscribe,
  subscribing,
  isSubscribed,
}: {
  route: RSSHubRoute;
  isExpanded: boolean;
  onToggle: () => void;
  onSubscribe: () => void;
  subscribing: boolean;
  isSubscribed: boolean;
}) {
  const router = useRouter();
  const feedUrl = buildRSSHubUrl(route);
  
  // Fetch preview when expanded
  const { data: preview, isLoading } = useQuery({
    queryKey: ['feed-preview', feedUrl],
    queryFn: () => api.getFeedPreviewFull(feedUrl, { limit: 5 }),
    enabled: isExpanded,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return (
    <div
      onClick={onToggle}
      className={cn(
        'rounded-2xl border p-5 cursor-pointer transition-all',
        isExpanded
          ? 'border-orange-500 bg-[rgb(var(--bg-elevated))]'
          : 'border-[rgb(var(--border-default))] hover:border-orange-500/50 bg-[rgb(var(--bg-elevated))]',
        isExpanded && 'shadow-[0_0_30px_rgba(249,115,22,0.15)]'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        {/* Icon - use pre-computed iconUrl from API, fallback to generated */}
        {(() => {
          const faviconUrl = route.iconUrl || preview?.iconUrl || getFaviconUrl(preview?.siteUrl || route.siteUrl, feedUrl);
          return (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
              {/* Always show Globe as fallback/loading state */}
              <div className="favicon-fallback flex items-center justify-center absolute inset-0">
                <Globe className="w-6 h-6 text-orange-500" />
              </div>
              {/* Favicon overlays Globe when loaded */}
              {faviconUrl && (
                <img
                  src={faviconUrl}
                  alt=""
                  className="w-8 h-8 rounded object-contain relative z-10 bg-[rgb(var(--bg-elevated))]"
                  onLoad={(e) => {
                    // Successfully loaded - ensure it's visible
                    (e.currentTarget as HTMLImageElement).style.opacity = '1';
                  }}
                  onError={(e) => {
                    // Hide broken image to show Globe fallback
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                  style={{ opacity: 1 }}
                />
              )}
            </div>
          );
        })()}
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg text-[rgb(var(--text-primary))]">
            {route.name}
          </h3>
          {route.description && (
            <p className="text-sm text-muted mt-0.5 line-clamp-1">
              {route.description}
            </p>
          )}
          {route.category && (
            <div className="flex gap-1 mt-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 bg-[rgb(var(--bg-hover))] text-muted rounded">
                {route.category}
              </span>
            </div>
          )}
        </div>
        
        {/* Subscribe button */}
        {isSubscribed ? (
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-green-500/20 text-green-500 flex items-center justify-center">
            <Check className="w-5 h-5" />
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSubscribe();
            }}
            disabled={subscribing}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-all"
          >
            {subscribing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {/* Expanded content - Article previews */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-5"
            onClick={(e) => e.stopPropagation()}
          >
            {isLoading ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-[240px] p-4 rounded-xl bg-[rgb(var(--bg-base))] animate-pulse">
                    <div className="h-4 bg-[rgb(var(--bg-hover))] rounded w-full mb-2" />
                    <div className="h-4 bg-[rgb(var(--bg-hover))] rounded w-2/3 mb-3" />
                    <div className="h-3 bg-[rgb(var(--bg-hover))] rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : preview?.items && preview.items.length > 0 ? (
              <>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {preview.items.slice(0, 5).map((item, index) => (
                    <a
                      key={`${item.url}-${index}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 w-[240px] rounded-xl bg-[rgb(var(--bg-base))] hover:bg-[rgb(var(--bg-hover))] transition-colors group overflow-hidden"
                    >
                      {/* Thumbnail */}
                      {item.thumbnail && (
                        <div className="w-full h-28 bg-[rgb(var(--bg-hover))] overflow-hidden">
                          <img
                            src={item.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      <div className="p-4">
                        <h4 className="font-medium text-[rgb(var(--text-primary))] line-clamp-2 group-hover:text-orange-500 transition-colors">
                          {item.title}
                        </h4>
                        <p className="text-xs text-muted mt-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(item.publishedAt)}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-[rgb(var(--border-default))]">
                  <span className="text-sm text-muted">
                    {t('discover.totalArticles', { count: preview.total })}
                  </span>
                  <button
                    onClick={() => router.push(`/discover/feed?url=${encodeURIComponent(feedUrl)}`)}
                    className="text-sm text-orange-500 hover:text-orange-400 flex items-center gap-1"
                  >
                    {t('discover.viewAll')} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-6 text-muted">
                <p>{t('discover.cannotLoadPreview')}</p>
                <p className="text-xs mt-1">{t('discover.subscribeToView')}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Compact route card
function CompactRouteCard({
  route,
  onClick,
  onSubscribe,
  subscribing,
  isSubscribed,
}: {
  route: RSSHubRoute;
  onClick: () => void;
  onSubscribe: () => void;
  subscribing: boolean;
  isSubscribed: boolean;
}) {
  const feedUrl = route.feedUrl || route.path;
  const faviconUrl = route.iconUrl || getFaviconUrl(route.siteUrl, feedUrl);
  
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 cursor-pointer transition-all flex items-center gap-4",
        isSubscribed 
          ? "border-green-500/30 bg-green-500/5" 
          : "border-[rgb(var(--border-default))] hover:border-orange-500/50 bg-[rgb(var(--bg-elevated))]"
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
        {/* Globe fallback always visible underneath */}
        <Globe className="w-5 h-5 text-orange-500 absolute" />
        {/* Favicon overlays when loaded */}
        {faviconUrl && (
          <img
            src={faviconUrl}
            alt=""
            className="w-6 h-6 rounded object-contain relative z-10"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[rgb(var(--text-primary))] truncate">
            {route.name}
          </h3>
          {isSubscribed && (
            <span className="text-xs text-green-500 flex-shrink-0">{t('discover.subscribed')}</span>
          )}
        </div>
        {route.description ? (
          <p className="text-sm text-muted truncate">{route.description}</p>
        ) : (
          <p className="text-xs text-muted truncate">{route.path}</p>
        )}
      </div>
      
      {isSubscribed ? (
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-green-500/20 text-green-500 flex items-center justify-center">
          <Check className="w-4 h-4" />
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSubscribe();
          }}
          disabled={subscribing}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-all"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ============ News Article Card with preview + source subscribe ============

function NewsArticleCard({
  item,
  isExpanded,
  onToggle,
  onSubscribeSource,
  isSourceSubscribed,
  subscribing,
}: {
  item: api.GoogleNewsItem;
  isExpanded: boolean;
  onToggle: () => void;
  onSubscribeSource: (feedUrl: string) => void;
  isSourceSubscribed: boolean;
  subscribing: boolean;
}) {
  // Fetch article content when expanded
  const { data: article, isLoading: loadingArticle } = useQuery({
    queryKey: ['google-news-article', item.url],
    queryFn: () => api.fetchGoogleNewsArticle(item.url),
    enabled: isExpanded,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  // Find source RSS feed
  const { data: sourceFeed, isLoading: findingFeed } = useQuery({
    queryKey: ['google-news-source-feed', item.source, item.url],
    queryFn: () => api.findSourceFeed(item.source, item.url),
    enabled: isExpanded && !isSourceSubscribed,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        isExpanded
          ? 'border-blue-500/50 bg-[rgb(var(--bg-elevated))]'
          : 'border-[rgb(var(--border-default))] bg-[rgb(var(--bg-elevated))] hover:border-blue-500/30'
      )}
    >
      {/* Header — always visible */}
      <div
        onClick={onToggle}
        className="p-4 cursor-pointer flex items-start gap-3"
      >
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-[rgb(var(--text-primary))] line-clamp-2 leading-snug">
            {item.title}
          </h3>
          {!isExpanded && item.snippet && (
            <p className="text-xs text-muted mt-1 line-clamp-2">{item.snippet}</p>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-blue-500 font-medium">{item.source}</span>
            {item.publishedAt && (
              <>
                <span className="text-muted">·</span>
                <span className="text-muted">{formatTimeAgo(item.publishedAt)}</span>
              </>
            )}
          </div>
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-2 rounded-lg text-muted hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
          title={t('discover.openOriginal')}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Expanded: article content + source subscribe */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-4"
          >
            {/* Source subscribe bar */}
            {sourceFeed && sourceFeed.feeds.length > 0 && !isSourceSubscribed && (
              <div className="mb-3 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
                <span className="text-sm text-blue-400">
                  {t('settings.categories.subscriptions')} <strong>{item.source}</strong>
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSubscribeSource(sourceFeed.feeds[0].url);
                  }}
                  disabled={subscribing}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {subscribing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  {t('discover.subscribe')}
                </button>
              </div>
            )}
            {isSourceSubscribed && (
              <div className="mb-3 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-sm text-green-500">
                <Check className="w-4 h-4" />
                {t('discover.alreadySubscribed', { source: item.source })}
              </div>
            )}
            {findingFeed && !sourceFeed && (
              <div className="mb-3 flex items-center gap-2 text-xs text-muted">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('discover.findingFeed', { source: item.source })}
              </div>
            )}

            {/* Article content */}
            {loadingArticle ? (
              <div className="py-8 flex flex-col items-center gap-2 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">{t('discover.loadingArticle')}</span>
              </div>
            ) : article?.content ? (
              <div className="border-t border-[rgb(var(--border-default))] pt-3">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-[rgb(var(--text-secondary))] max-h-[400px] overflow-y-auto pr-2"
                  dangerouslySetInnerHTML={{ __html: article.content }}
                />
                {article.url && article.url !== item.url && (
                  <div className="mt-3 pt-3 border-t border-[rgb(var(--border-default))]">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1"
                    >
                      {t('discover.readFull')} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-4 text-center text-muted text-sm border-t border-[rgb(var(--border-default))]">
                {t('discover.cannotLoadArticle')}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-400 ml-1"
                >
                  {t('discover.openOriginalLink')}
                </a>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NEWS_LANGS = [
  { id: 'en-US', label: 'English' },
  { id: 'zh-CN', label: t('settings.general.langZhCN') },
  { id: 'ja', label: t('settings.general.langJa') },
];

function GoogleNewsSection() {
  const [newsQuery, setNewsQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [newsLang, setNewsLang] = useState('en-US');

  const { data: newsResults, isLoading: newsLoading } = useQuery({
    queryKey: ['google-news', submittedQuery, newsLang],
    queryFn: () => api.searchGoogleNews(submittedQuery, newsLang),
    enabled: submittedQuery.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const [subscribedQuery, setSubscribedQuery] = useState(false);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [subscribedSources, setSubscribedSources] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const subscribeFeedMutation = useMutation({
    mutationFn: (feedUrl: string) => api.createFeed(feedUrl),
    onSuccess: (_data, feedUrl) => {
      if (feedUrl.includes('news.google.com/rss/search')) {
        toast.success(t('discover.subscribedAutoDeliver'));
        setSubscribedQuery(true);
      } else {
        toast.success(t('discover.subscribedSource'));
      }
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
    onError: (err: Error) => toast.error(err.message || t('discover.subscribeFailed')),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsQuery.trim()) {
      setSubmittedQuery(newsQuery.trim());
      setSubscribedQuery(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
          <Newspaper className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[rgb(var(--text-primary))]">Google News</h2>
          <p className="text-xs text-muted">{t('discover.searchLatestNews')}</p>
        </div>
      </div>

      {/* Language toggle */}
      <div className="flex gap-1.5 mb-3">
        {NEWS_LANGS.map((lang) => (
          <button
            key={lang.id}
            onClick={() => {
              setNewsLang(lang.id);
              if (submittedQuery) setSubmittedQuery(submittedQuery); // re-trigger
            }}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
              newsLang === lang.id
                ? 'bg-blue-500 text-white'
                : 'bg-[rgb(var(--bg-elevated))] text-muted hover:text-[rgb(var(--text-primary))]'
            )}
          >
            {lang.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          value={newsQuery}
          onChange={(e) => setNewsQuery(e.target.value)}
          placeholder={t('discover.searchNewsPlaceholder')}
          className="w-full pl-11 pr-20 py-2.5 rounded-xl bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--border-default))] text-[rgb(var(--text-primary))] placeholder-muted focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
        />
        <button
          type="submit"
          disabled={!newsQuery.trim() || newsLoading}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm transition-colors"
        >
          {newsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('discover.searchBtn')}
        </button>
      </form>

      {/* Subscribe to search as feed */}
      {newsResults && newsResults.items.length > 0 && submittedQuery && (
        <div className="mb-4 p-3 rounded-xl bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--border-default))] flex items-center justify-between">
          <div className="text-sm text-secondary">
            <span className="text-muted">{t('discover.or')}</span>{' '}
            <span className="font-medium text-[rgb(var(--text-primary))]">「{submittedQuery}」</span>{' '}
            <span className="text-muted">{t('discover.subscribeAsRss')}</span>
          </div>
          <button
            onClick={() => {
              const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(submittedQuery)}&hl=${newsLang}&gl=${newsLang === 'zh-CN' ? 'CN' : newsLang === 'ja' ? 'JP' : 'US'}&ceid=${newsLang === 'zh-CN' ? 'CN:zh-Hans' : newsLang === 'ja' ? 'JP:ja' : 'US:en'}`;
              subscribeFeedMutation.mutate(feedUrl);
            }}
            disabled={subscribeFeedMutation.isPending || subscribedQuery}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ml-3",
              subscribedQuery
                ? "bg-green-500/20 text-green-500"
                : "bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
            )}
          >
            {subscribedQuery ? (
              <><Check className="w-4 h-4" /> {t('discover.subscribed')}</>
            ) : subscribeFeedMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t('discover.subscribing')}</>
            ) : (
              <><Plus className="w-4 h-4" /> {t('discover.subscribeSearch')}</>
            )}
          </button>
        </div>
      )}

      {/* Results */}
      {newsResults && newsResults.items.length > 0 && (
        <div className="space-y-3">
          {newsResults.items.slice(0, 15).map((item, index) => (
            <NewsArticleCard
              key={`${item.url}-${index}`}
              item={item}
              isExpanded={expandedArticle === item.url}
              onToggle={() => setExpandedArticle(expandedArticle === item.url ? null : item.url)}
              onSubscribeSource={(feedUrl) => {
                subscribeFeedMutation.mutate(feedUrl);
                setSubscribedSources(prev => new Set([...prev, item.source]));
              }}
              isSourceSubscribed={subscribedSources.has(item.source)}
              subscribing={subscribeFeedMutation.isPending}
            />
          ))}
        </div>
      )}

      {newsResults && newsResults.items.length === 0 && submittedQuery && (
        <div className="text-center py-8 text-muted">
          <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('discover.noNewsFound')}</p>
        </div>
      )}
    </div>
  );
}

function DiscoverContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'popular' | 'recommended' | 'trending' | 'categories' | 'news'>('popular');
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch user's feeds (to filter out already subscribed)
  const { data: userFeeds } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => api.getFeeds(),
    retry: false,
    throwOnError: false,
  });

  // Fetch reading analytics to understand user's actual reading habits
  const { data: readingStats } = useQuery({
    queryKey: ['feed-analytics'],
    queryFn: () => api.getFeedAnalytics(),
    retry: false,
    throwOnError: false,
  });

  // Set of already subscribed feed URLs (to filter recommendations)
  const subscribedUrls = useMemo(() => {
    if (!userFeeds || !Array.isArray(userFeeds)) return new Set<string>();
    return new Set(userFeeds.map(f => f.feedUrl?.toLowerCase()).filter(Boolean));
  }, [userFeeds]);

  // Analyze user's READING habits (not just subscriptions)
  // Based on feeds they actually read most
  const userInterests = useMemo(() => {
    if (!readingStats?.mostRead) return [];
    // Extract categories from most-read feeds
    const catCount = new Map<string, number>();
    for (const feed of readingStats.mostRead.slice(0, 10)) {
      // Extract keywords from feed title for category detection
      const keywords = feed.title?.toLowerCase().split(/[\s\-_]+/) || [];
      
      // Simple keyword-based category detection
      for (const kw of keywords) {
        if (['tech', 'dev', 'code', 'programming', '技术', '开发'].some(t => kw.includes(t))) {
          catCount.set('programming', (catCount.get('programming') || 0) + feed.readRate);
        }
        if (['ai', 'ml', 'machine', 'learning', '人工智能'].some(t => kw.includes(t))) {
          catCount.set('programming', (catCount.get('programming') || 0) + feed.readRate);
        }
        if (['news', '新闻', 'media', '媒体'].some(t => kw.includes(t))) {
          catCount.set('new-media', (catCount.get('new-media') || 0) + feed.readRate);
        }
        if (['design', '设计', 'ui', 'ux'].some(t => kw.includes(t))) {
          catCount.set('design', (catCount.get('design') || 0) + feed.readRate);
        }
        if (['game', '游戏', 'gaming'].some(t => kw.includes(t))) {
          catCount.set('game', (catCount.get('game') || 0) + feed.readRate);
        }
        if (['finance', '财经', 'stock', '股票'].some(t => kw.includes(t))) {
          catCount.set('finance', (catCount.get('finance') || 0) + feed.readRate);
        }
      }
    }
    
    return [...catCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);
  }, [readingStats]);

  // Map user reading interests to RSSHub categories
  const rsshubCategories = useMemo(() => {
    if (userInterests.length === 0) {
      // Fallback: use subscription categories if no reading history
      if (!userFeeds || !Array.isArray(userFeeds)) return [];
      const catCount = new Map<string, number>();
      for (const feed of userFeeds) {
        const cat = feed.categoryTitle?.toLowerCase() || 'other';
        catCount.set(cat, (catCount.get(cat) || 0) + 1);
      }
      const topCats = [...catCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat]) => cat);
      
      const cats = new Set<string>();
      for (const userCat of topCats) {
        const mapped = CATEGORY_MAPPING[userCat] || [];
        mapped.forEach(c => cats.add(c));
      }
      return [...cats].slice(0, 3);
    }
    return userInterests;
  }, [userInterests, userFeeds]);

  // Fetch curated feeds from external sources (awesome-rss-feeds, engineering-blogs, etc.)
  const { data: externalFeedsData, isLoading: loadingExternal } = useQuery({
    queryKey: ['external-feeds'],
    queryFn: () => api.getExternalFeeds({ limit: 100 }),
    enabled: activeTab === 'popular',
    retry: false,
    throwOnError: false,
  });

  // Fetch recommended feeds from external sources, filtered by reading habits
  const { data: recommendedData, isLoading: loadingRecommended } = useQuery({
    queryKey: ['external-feeds-recommended', rsshubCategories, [...subscribedUrls].join(',')],
    queryFn: async () => {
      const result = await api.getExternalFeeds({ limit: 200 });
      let feeds = result.feeds || [];
      
      // Filter out already subscribed
      feeds = feeds.filter(f => !subscribedUrls.has(f.feedUrl?.toLowerCase() || ''));
      
      // If user has reading habits, prioritize matching categories
      if (rsshubCategories.length > 0) {
        const categoryKeywords = rsshubCategories.flatMap(cat => 
          cat.toLowerCase().split(/[-_\s]+/)
        );
        
        // Score feeds by category match
        const scoredFeeds = feeds.map(feed => {
          const feedText = `${feed.title} ${feed.category || ''} ${feed.tags?.join(' ') || ''}`.toLowerCase();
          const score = categoryKeywords.filter(kw => feedText.includes(kw)).length;
          return { feed, score };
        });
        
        // Sort by score, then shuffle within same score for variety
        scoredFeeds.sort((a, b) => b.score - a.score);
        feeds = scoredFeeds.map(s => s.feed);
      } else {
        // No reading habits, shuffle for variety
        feeds = feeds.sort(() => Math.random() - 0.5);
      }
      
      return { 
        feeds: feeds.slice(0, 50),
        sources: result.sources 
      };
    },
    enabled: activeTab === 'recommended',
    retry: false,
    throwOnError: false,
  });

  // Fetch trending (most subscribed by FeedGlow users)
  const { data: trendingData, isLoading: loadingTrending } = useQuery({
    queryKey: ['discover', 'trending'],
    queryFn: () => api.getTrendingFeeds(),
    enabled: activeTab === 'trending',
    retry: false,
    throwOnError: false,
  });

  // Fetch external source categories
  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ['feed-sources', 'categories'],
    queryFn: () => api.getFeedSourceCategories(),
    enabled: activeTab === 'categories',
    retry: false,
    throwOnError: false,
  });

  // Fetch feeds from selected category/source
  const { data: categoryDetail, isLoading: loadingCategoryDetail } = useQuery({
    queryKey: ['feed-sources', 'category', selectedCategory],
    queryFn: () => api.getFeedsFromCategory(selectedCategory!),
    enabled: !!selectedCategory,
    retry: false,
    throwOnError: false,
  });

  // Search RSSHub
  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['rsshub', 'search', searchQuery],
    queryFn: () => api.searchRSSHubRoutes(searchQuery),
    enabled: searchQuery.length > 2,
    retry: false,
    throwOnError: false,
  });

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: (url: string) => api.createFeed(url),
    onSuccess: () => {
      toast.success(t('discover.subscribeSuccess'));
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || t('discover.subscribeFailed'));
    },
  });

  // Get current routes to display
  const currentRoutes: RSSHubRoute[] = useMemo(() => {
    if (searchQuery.length > 2) {
      return searchResults?.routes || [];
    }
    
    if (selectedCategory && categoryDetail) {
      // Convert external feeds to route format
      return (categoryDetail?.feeds || []).map((feed: any) => ({
        name: feed.title,
        path: feed.feedUrl,
        siteUrl: feed.siteUrl || feed.feedUrl,
        feedUrl: feed.feedUrl,
        description: feed.description || '',
        category: feed.category || '',
        source: feed.source,
        tags: feed.tags,
        iconUrl: feed.iconUrl || getFaviconUrl(feed.siteUrl, feed.feedUrl), // Fallback to computed
      }));
    }
    
    switch (activeTab) {
      case 'popular':
        // Convert external feeds to route format
        return (externalFeedsData?.feeds || []).map((feed: any) => ({
          name: feed.title,
          path: feed.feedUrl,
          siteUrl: feed.siteUrl || feed.feedUrl,
          feedUrl: feed.feedUrl,
          description: feed.description || '',
          category: feed.category || '',
          source: feed.source, // Keep source for attribution
          iconUrl: feed.iconUrl || getFaviconUrl(feed.siteUrl, feed.feedUrl), // Fallback to computed
        }));
      case 'recommended':
        // Convert external feeds to route format
        return (recommendedData?.feeds || []).map((feed: any) => ({
          name: feed.title,
          path: feed.feedUrl,
          siteUrl: feed.siteUrl || feed.feedUrl,
          feedUrl: feed.feedUrl,
          description: feed.description || '',
          category: feed.category || '',
          source: feed.source,
          tags: feed.tags,
          iconUrl: feed.iconUrl || getFaviconUrl(feed.siteUrl, feed.feedUrl), // Fallback to computed
        }));
      case 'trending':
        // Convert trending feeds to route format
        return (trendingData?.feeds || []).map((feed: any) => ({
          name: feed.title || feed.feedUrl,
          path: feed.feedUrl,
          siteUrl: feed.siteUrl || feed.feedUrl,
          feedUrl: feed.feedUrl,
          description: feed.description || '',
          category: feed.categoryTitle || feed.category || '',
          iconUrl: feed.iconUrl || getFaviconUrl(feed.siteUrl, feed.feedUrl), // Fallback to computed
        }));
      default:
        return [];
    }
  }, [searchQuery, searchResults, selectedCategory, categoryDetail, activeTab, externalFeedsData, recommendedData, trendingData]);

  const isLoading = searchQuery.length > 2 
    ? searching 
    : selectedCategory 
      ? loadingCategoryDetail
      : activeTab === 'popular' 
        ? loadingExternal 
        : activeTab === 'recommended'
          ? loadingRecommended
          : activeTab === 'trending'
            ? loadingTrending
            : loadingCategories;

  const handleToggleRoute = (routePath: string) => {
    setExpandedRoute(expandedRoute === routePath ? null : routePath);
  };

  const handleSubscribe = (route: RSSHubRoute) => {
    const url = buildRSSHubUrl(route);
    subscribeMutation.mutate(url);
  };

  return (
    <div className="h-full overflow-y-auto surface-base">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center"
              style={{ boxShadow: '0 0 30px rgba(249, 115, 22, 0.4)' }}
            >
              <Compass className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">{t('discover.title')}</h1>
              <p className="text-sm text-muted">{t('discover.subtitle')}</p>
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
            placeholder={t('discover.searchPlaceholder')}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--border-default))] text-[rgb(var(--text-primary))] placeholder-muted focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
          {searching && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted animate-spin" />
          )}
        </div>

        {/* Tabs */}
        {!searchQuery && (
          <div className="flex gap-2 mb-6 flex-wrap">
            <button
              onClick={() => { setActiveTab('popular'); setSelectedCategory(null); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                activeTab === 'popular' && !selectedCategory
                  ? 'bg-orange-500 text-white'
                  : 'bg-[rgb(var(--bg-elevated))] text-muted hover:text-[rgb(var(--text-primary))]'
              )}
            >
              <TrendingUp className="w-4 h-4" />
              {t('discover.featured')}
            </button>
            <button
              onClick={() => { setActiveTab('recommended'); setSelectedCategory(null); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                activeTab === 'recommended' && !selectedCategory
                  ? 'bg-orange-500 text-white'
                  : 'bg-[rgb(var(--bg-elevated))] text-muted hover:text-[rgb(var(--text-primary))]'
              )}
            >
              <Sparkles className="w-4 h-4" />
              {t('settings.platforms.recommended')}
            </button>
            <button
              onClick={() => { setActiveTab('trending'); setSelectedCategory(null); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                activeTab === 'trending' && !selectedCategory
                  ? 'bg-orange-500 text-white'
                  : 'bg-[rgb(var(--bg-elevated))] text-muted hover:text-[rgb(var(--text-primary))]'
              )}
            >
              <BarChart3 className="w-4 h-4" />
              {t('discover.trending')}
            </button>
            <button
              onClick={() => { setActiveTab('categories'); setSelectedCategory(null); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                (activeTab === 'categories' || selectedCategory) && activeTab !== 'popular' && activeTab !== 'recommended' && activeTab !== 'trending' && activeTab !== 'news'
                  ? 'bg-orange-500 text-white'
                  : 'bg-[rgb(var(--bg-elevated))] text-muted hover:text-[rgb(var(--text-primary))]'
              )}
            >
              <Bookmark className="w-4 h-4" />
              {t('settings.newsletter.category')}
            </button>
            <button
              onClick={() => { setActiveTab('news'); setSelectedCategory(null); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                activeTab === 'news'
                  ? 'bg-blue-500 text-white'
                  : 'bg-[rgb(var(--bg-elevated))] text-muted hover:text-[rgb(var(--text-primary))]'
              )}
            >
              <Newspaper className="w-4 h-4" />
              {t('discover.newsSearch')}
            </button>
          </div>
        )}

        {/* Recommendation info */}
        {activeTab === 'recommended' && !searchQuery && (
          <div className="mb-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <p className="text-sm text-orange-500 flex items-center gap-1.5">
              {userInterests.length > 0 ? (
                <><BookOpen className="w-4 h-4 inline-flex" /> {t('discover.recommendByReading')} ({rsshubCategories.join(', ')})</>
              ) : rsshubCategories.length > 0 ? (
                <><Folder className="w-4 h-4 inline-flex" /> {t('discover.recommendByCategory')} ({rsshubCategories.join(', ')})</>
              ) : (
                <><Sparkles className="w-4 h-4 inline-flex" /> {t('discover.recommendHint')}</>
              )}
            </p>
          </div>
        )}

        {/* Category pills */}
        {activeTab === 'categories' && !searchQuery && !selectedCategory && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
            {loadingCategories ? (
              [...Array(12)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-[rgb(var(--bg-elevated))] animate-pulse" />
              ))
            ) : (
              (categoriesData?.categories || []).map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className="p-4 rounded-xl bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--border-default))] hover:border-orange-500/50 transition-all text-left"
                >
                  <Library className="w-6 h-6 mb-1 text-orange-500" />
                  <div className="font-medium text-sm text-[rgb(var(--text-primary))]">{cat.name}</div>
                  <div className="text-xs text-muted">{t('discover.feedCount', { count: cat.feedCount })}</div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Selected category header */}
        {selectedCategory && (
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-orange-500 hover:text-orange-400"
            >
              {t('discover.backToCategories')}
            </button>
            <span className="text-muted">|</span>
            <span className="font-medium text-[rgb(var(--text-primary))]">
              {categoriesData?.categories?.find((c: any) => c.id === selectedCategory)?.name || selectedCategory}
            </span>
          </div>
        )}

        {/* Google News tab */}
        {activeTab === 'news' && !searchQuery && (
          <GoogleNewsSection />
        )}

        {/* Routes list */}
        {activeTab !== 'news' && (activeTab !== 'categories' || selectedCategory || searchQuery.length > 2) && (
          <div className="space-y-4">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-[rgb(var(--border-default))] p-5 animate-pulse">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-[rgb(var(--bg-hover))] rounded-xl" />
                    <div className="flex-1">
                      <div className="h-5 bg-[rgb(var(--bg-hover))] rounded w-1/3 mb-2" />
                      <div className="h-4 bg-[rgb(var(--bg-hover))] rounded w-2/3" />
                    </div>
                  </div>
                </div>
              ))
            ) : currentRoutes.length === 0 ? (
              <div className="text-center py-16 text-muted">
                <Search className="w-12 h-12 mx-auto mb-4 text-muted" />
                <p className="text-lg">{t('discover.noContent')}</p>
                {activeTab === 'recommended' && rsshubCategories.length === 0 && (
                  <p className="text-sm mt-2">{t('discover.noRecommendHint')}</p>
                )}
                {activeTab === 'recommended' && rsshubCategories.length > 0 && (
                  <p className="text-sm mt-2">{t('discover.noMatchingFeeds')}</p>
                )}
                {activeTab === 'trending' && (
                  <p className="text-sm mt-2">{t('discover.noTrendingData')}</p>
                )}
              </div>
            ) : (
              currentRoutes.map((route) => {
                const routeKey = route.feedUrl || (route as any).url || route.path || route.name;
                const isExpanded = expandedRoute === routeKey;
                const isSubscribed = subscribedUrls.has(routeKey?.toLowerCase() || '');
                
                if (isExpanded) {
                  return (
                    <FeedCard
                      key={routeKey}
                      route={route}
                      isExpanded={true}
                      onToggle={() => handleToggleRoute(routeKey)}
                      onSubscribe={() => handleSubscribe(route)}
                      subscribing={subscribeMutation.isPending}
                      isSubscribed={isSubscribed}
                    />
                  );
                }
                
                return (
                  <CompactRouteCard
                    key={routeKey}
                    route={route}
                    onClick={() => handleToggleRoute(routeKey)}
                    onSubscribe={() => handleSubscribe(route)}
                    subscribing={subscribeMutation.isPending}
                    isSubscribed={isSubscribed}
                  />
                );
              })
            )}
          </div>
        )}

        {/* Data source attribution for popular tab */}
        {activeTab === 'popular' && externalFeedsData?.sources && externalFeedsData.sources.length > 0 && (
          <div className="mt-6 pt-4 border-t border-default text-center text-xs text-muted">
            {t('discover.dataSource', { sources: externalFeedsData.sources.join(', ') })}
          </div>
        )}

      </div>
    </div>
  );
}

// Wrap in Suspense
export default function DiscoverPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    }>
      <DiscoverContent />
    </Suspense>
  );
}
