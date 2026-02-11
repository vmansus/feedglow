'use client';

import { t } from '@/lib/i18n';

import { useState } from 'react';
import { useDigest, useGenerateDigest, type DigestEntry } from '@/hooks/use-digest';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  ChevronRight, 
  RefreshCw, 
  Calendar,
  BookOpen,
  TrendingUp,
  Loader2,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

interface DailyDigestProps {
  compact?: boolean;
  date?: string;
}

export function DailyDigest({ compact = false, date }: DailyDigestProps) {
  const { data: digest, isLoading, error } = useDigest(date);
  const generateDigest = useGenerateDigest();
  const [expanded, setExpanded] = useState(false);

  const handleGenerate = async () => {
    await generateDigest.mutateAsync();
  };

  if (isLoading) {
    return (
      <div className={`rounded-xl border border-zinc-200 dark:border-zinc-800 ${compact ? 'p-4' : 'p-6'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center animate-pulse">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/3 animate-pulse" />
            <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2 mt-2 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !digest) {
    return (
      <div className={`rounded-xl border border-zinc-200 dark:border-zinc-800 ${compact ? 'p-4' : 'p-6'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">{t('digest.todaySummary')}</h3>
              <p className="text-sm text-zinc-500">{t('digest.notGenerated')}</p>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generateDigest.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50"
          >
            {generateDigest.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {t('digest.generate')}
          </button>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <Link href="/digest" className="block">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:border-orange-300 dark:hover:border-orange-800 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">{t('digest.todaySummary')}</h3>
                <p className="text-sm text-zinc-500 line-clamp-1">{digest.summary.slice(0, 50)}...</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-400" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="p-6 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t('digest.todaySummary')}</h2>
              <div className="flex items-center gap-2 text-sm text-zinc-500 mt-1">
                <Calendar className="w-4 h-4" />
                <span>{new Date(digest.date).toLocaleDateString(undefined, { 
                  month: 'long', 
                  day: 'numeric',
                  weekday: 'long'
                })}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generateDigest.isPending}
            className="p-2 rounded-lg hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
            title={t('digest.regenerate')}
          >
            {generateDigest.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
            ) : (
              <RefreshCw className="w-5 h-5 text-zinc-500" />
            )}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="p-6">
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
          {digest.summary}
        </p>
      </div>

      {/* Stats */}
      <div className="px-6 pb-4">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-zinc-400" />
            <span className="text-zinc-600 dark:text-zinc-400">
              <span className="font-semibold text-zinc-900 dark:text-white">{digest.stats.readArticles}</span>
              {t('digest.articlesRead', { total: digest.stats.totalArticles })}
            </span>
          </div>
          {digest.stats.topCategories.length > 0 && (
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-zinc-400" />
              <span className="text-zinc-600 dark:text-zinc-400">
                {t('digest.trendingCategories', { categories: digest.stats.topCategories.map(c => c.name).join(', ') })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Highlights */}
      {digest.highlights.length > 0 && (
        <>
          <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="font-medium">{t('digest.highlights')} ({digest.highlights.length})</span>
              <ChevronRight className={`w-5 h-5 text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-zinc-100 dark:border-zinc-800"
              >
                <div className="p-4 space-y-3">
                  {digest.highlights.map((entry: DigestEntry) => (
                    <a
                      key={entry.id}
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium line-clamp-2 group-hover:text-orange-600 transition-colors">
                            {entry.title}
                          </h4>
                          <p className="text-sm text-zinc-500 mt-1">{entry.feedTitle}</p>
                          {entry.summary && (
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-2">
                              {entry.summary}
                            </p>
                          )}
                        </div>
                        <ExternalLink className="w-4 h-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
                      </div>
                    </a>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Footer */}
      <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-900/50 text-xs text-zinc-500">
        {t('digest.generatedAt', { time: new Date(digest.generatedAt).toLocaleTimeString() })}
      </div>
    </div>
  );
}
