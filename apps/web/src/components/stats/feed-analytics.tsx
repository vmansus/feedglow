'use client';

import { t } from '@/lib/i18n';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Eye,
  Clock,
  Loader2
} from 'lucide-react';

export function FeedAnalytics() {
  const [selectedCategory, setSelectedCategory] = useState<string>('mostActive');
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['feed-analytics'],
    queryFn: () => api.getFeedAnalytics(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error || !data || typeof data.totalFeeds === 'undefined') {
    return (
      <div className="text-center py-12 text-zinc-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>{t('stats.loadFailed')}</p>
        <button onClick={() => refetch()} className="text-orange-500 hover:underline mt-2">
          {t('stats.retry')}
        </button>
      </div>
    );
  }

  // Ensure arrays exist with defensive defaults
  const analytics = {
    totalFeeds: data.totalFeeds ?? 0,
    totalEntries: data.totalEntries ?? 0,
    mostActive: Array.isArray(data.mostActive) ? data.mostActive : [],
    leastActive: Array.isArray(data.leastActive) ? data.leastActive : [],
    mostRead: Array.isArray(data.mostRead) ? data.mostRead : [],
    neverRead: Array.isArray(data.neverRead) ? data.neverRead : [],
    unhealthy: Array.isArray(data.unhealthy) ? data.unhealthy : [],
  };

  const categories = [
    { id: 'mostActive', label: t('stats.mostActive'), icon: <TrendingUp className="w-4 h-4" />, data: analytics.mostActive },
    { id: 'mostRead', label: t('stats.mostRead'), icon: <Eye className="w-4 h-4" />, data: analytics.mostRead },
    { id: 'leastActive', label: t('stats.leastActive'), icon: <TrendingDown className="w-4 h-4" />, data: analytics.leastActive },
    { id: 'neverRead', label: t('stats.neverRead'), icon: <Clock className="w-4 h-4" />, data: analytics.neverRead },
    { id: 'unhealthy', label: t('stats.healthIssues'), icon: <AlertTriangle className="w-4 h-4" />, data: analytics.unhealthy },
  ];

  const currentCategory = categories.find(c => c.id === selectedCategory);
  const currentData = currentCategory?.data || [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-zinc-900">
          <div className="text-3xl font-bold text-orange-600">{analytics.totalFeeds}</div>
          <div className="text-sm text-zinc-500">{t('stats.feeds')}</div>
        </div>
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="text-3xl font-bold">{analytics.totalEntries.toLocaleString()}</div>
          <div className="text-sm text-zinc-500">{t('stats.totalArticles')}</div>
        </div>
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="text-3xl font-bold text-green-600">{analytics.mostRead.length}</div>
          <div className="text-sm text-zinc-500">{t('stats.highReadRate')}</div>
        </div>
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="text-3xl font-bold text-red-600">{analytics.unhealthy.length}</div>
          <div className="text-sm text-zinc-500">{t('stats.needsAttention')}</div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            {cat.icon}
            {cat.label}
            <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-white/20">
              {cat.data.length}
            </span>
          </button>
        ))}
      </div>

      {/* Feed List */}
      <div className="space-y-3">
        {currentData.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            {t('stats.noCategoryFeeds')}
          </div>
        ) : (
          currentData.map((feed, index) => (
            <motion.div
              key={feed.feedId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-orange-300 dark:hover:border-orange-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{feed.title}</h3>
                  <p className="text-sm text-zinc-500 truncate">{feed.siteUrl}</p>
                </div>
                
                <div className="flex items-center gap-4 text-sm">
                  {/* Read Rate */}
                  <div className="text-center">
                    <div className={`font-bold ${
                      feed.readRate > 70 ? 'text-green-600' : 
                      feed.readRate > 30 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {Math.round(feed.readRate)}%
                    </div>
                    <div className="text-xs text-zinc-500">{t('stats.readRate')}</div>
                  </div>
                  
                  {/* Updates per week */}
                  <div className="text-center">
                    <div className="font-bold">{feed.updatesPerWeek.toFixed(1)}</div>
                    <div className="text-xs text-zinc-500">{t('stats.perWeek')}</div>
                  </div>
                  
                  {/* Starred */}
                  <div className="text-center">
                    <div className="font-bold text-orange-500">{feed.starredCount}</div>
                    <div className="text-xs text-zinc-500">{t('stats.starred')}</div>
                  </div>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                  <span>{feed.totalEntries - feed.unreadEntries} {t('stats.readLabel')}</span>
                  <span>{feed.unreadEntries} {t('stats.unreadLabel')}</span>
                </div>
                <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-orange-500 rounded-full transition-all"
                    style={{ width: `${feed.readRate}%` }}
                  />
                </div>
              </div>

              {/* Warnings */}
              {feed.parsing_error_count > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle className="w-3 h-3" />
                  {t('stats.parseErrors', { count: feed.parsing_error_count })}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
