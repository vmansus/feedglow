'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Clock, Loader2, Check, Globe, BookOpen, Newspaper } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '@/lib/api';
import { t, getLocale } from '@/lib/i18n';

interface FeedPreviewPanelProps {
  feedUrl: string | null;
  feedName?: string;
  onClose: () => void;
  onSubscribe: (url: string) => void;
  subscribing?: boolean;
  subscribed?: boolean;
}

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

function ArticleSkeleton() {
  return (
    <div className="py-4 border-b border-white/5 animate-pulse">
      <div className="h-5 bg-white/10 rounded w-3/4 mb-2" />
      <div className="h-4 bg-white/10 rounded w-full mb-1" />
      <div className="h-4 bg-white/10 rounded w-2/3 mb-2" />
      <div className="h-3 bg-white/10 rounded w-1/4" />
    </div>
  );
}

export function FeedPreviewPanel({
  feedUrl,
  feedName,
  onClose,
  onSubscribe,
  subscribing = false,
  subscribed = false,
}: FeedPreviewPanelProps) {
  const router = useRouter();
  
  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['feed-preview-full', feedUrl],
    queryFn: () => api.getFeedPreviewFull(feedUrl!, { limit: 10 }),
    enabled: !!feedUrl,
    staleTime: 10 * 60 * 1000,
  });

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Navigate to full preview page
  const handleFullPreview = () => {
    if (feedUrl) {
      router.push(`/discover/feed?url=${encodeURIComponent(feedUrl)}`);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {feedUrl && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-[#0d0d0d] border-l border-white/10 z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex-shrink-0 p-5 border-b border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3 flex-1 min-w-0">
                  {preview?.iconUrl ? (
                    <img 
                      src={preview.iconUrl} 
                      alt="" 
                      className="w-12 h-12 rounded-xl flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center flex-shrink-0">
                      {feedName?.[0] ? (
                        <span className="text-xl font-semibold text-orange-500">{feedName[0]}</span>
                      ) : (
                        <Newspaper className="w-6 h-6 text-orange-500" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-lg text-white truncate">
                      {preview?.title || feedName || t('discover.loading')}
                    </h2>
                    {preview?.siteUrl && (
                      <a 
                        href={preview.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1"
                      >
                        <Globe className="w-3 h-3" />
                        {new URL(preview.siteUrl).hostname}
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              {preview?.description && (
                <p className="text-sm text-white/50 mt-3 line-clamp-2">
                  {preview.description}
                </p>
              )}
              
              {preview && (
                <div className="flex items-center gap-3 mt-3 text-xs text-white/40">
                  <span>{t('discover.totalArticles', { count: preview.total })}</span>
                  {preview.language && <span>· {preview.language}</span>}
                  {preview.cached && <span className="text-green-400/60">· {t('discover.cached')}</span>}
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="flex-shrink-0 p-4 border-b border-white/10 flex gap-3">
              <button
                onClick={() => feedUrl && onSubscribe(feedUrl)}
                disabled={subscribing || subscribed}
                className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                  subscribed
                    ? 'bg-green-500/10 text-green-400 cursor-default'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
              >
                {subscribing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : subscribed ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {subscribed ? t('discover.subscribed') : t('discover.subscribe')}
              </button>
              
              {/* Full Preview Button */}
              <button
                onClick={handleFullPreview}
                className="py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm flex items-center gap-2 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                {t('discover.preview')}
              </button>
            </div>
            
            {/* Articles */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-5">
                <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
                  {t('discover.latestArticles')}
                </h3>
                
                {/* Loading */}
                {isLoading && (
                  <div>
                    <ArticleSkeleton />
                    <ArticleSkeleton />
                    <ArticleSkeleton />
                    <ArticleSkeleton />
                  </div>
                )}
                
                {/* Error */}
                {error && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-3">😕</div>
                    <p className="text-white/70 mb-1">{t('discover.cannotLoadPreview')}</p>
                    <p className="text-xs text-white/40">
                      {(error as Error).message || t('discover.feedUnavailable')}
                    </p>
                  </div>
                )}
                
                {/* Articles list */}
                {preview && preview.items.length > 0 && (
                  <div className="space-y-1">
                    {preview.items.map((item, index) => (
                      <a
                        key={`${item.url}-${index}`}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block py-4 border-b border-white/5 last:border-b-0 group hover:bg-white/5 -mx-2 px-2 rounded-lg transition-colors"
                      >
                        <div className="flex gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-white group-hover:text-orange-400 transition-colors line-clamp-2">
                              {item.title}
                            </h4>
                            {item.snippet && (
                              <p className="text-sm text-white/50 mt-1.5 line-clamp-2">
                                {item.snippet}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
                              <Clock className="w-3 h-3" />
                              <span>{formatTimeAgo(item.publishedAt)}</span>
                              {item.author && (
                                <>
                                  <span>·</span>
                                  <span className="truncate max-w-[120px]">{item.author}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {item.thumbnail && (
                            <img 
                              src={item.thumbnail} 
                              alt=""
                              className="w-20 h-14 object-cover rounded-lg flex-shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
                
                {/* Empty state */}
                {preview && preview.items.length === 0 && (
                  <div className="text-center py-8 text-white/50">
                    {t('discover.noArticles')}
                  </div>
                )}
                
                {/* View all link */}
                {preview && preview.items.length > 0 && (
                  <div className="text-center pt-4">
                    <button
                      onClick={handleFullPreview}
                      className="text-sm text-orange-400 hover:text-orange-300"
                    >
                      {t('discover.viewAllArticles', { count: preview.total })}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default FeedPreviewPanel;
