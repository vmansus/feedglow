'use client';

import { t, getLocale } from '@/lib/i18n';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { ExternalLink, Sparkles, Link2 } from 'lucide-react';
import { getSharedEntry } from '@/lib/api';

export default function SharedEntryPage() {
  const params = useParams();
  const code = params.code as string;

  const { data: entry, isLoading, error } = useQuery({
    queryKey: ['shared', code],
    queryFn: () => getSharedEntry(code),
    enabled: !!code,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--bg-base))] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full" />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen bg-[rgb(var(--bg-base))] flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <Link2 className="w-16 h-16 mx-auto mb-4 text-muted" />
          <h1 className="text-xl font-semibold mb-2">{t('shared.invalidLink')}</h1>
          <p className="text-muted mb-4">{t('shared.linkMayBeInvalid')}</p>
          <a 
            href="/"
            className="text-orange-500 hover:text-orange-400 transition-colors"
          >
            {t('shared.backToHome')}
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--bg-base))]">
      {/* Header */}
      <header className="border-b border-default bg-[rgb(var(--bg-elevated))]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center glow">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="font-semibold text-sm group-hover:text-orange-500 transition-colors">
              FeedGlow
            </span>
          </a>
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted hover:text-[rgb(var(--text-primary))] flex items-center gap-1 transition-colors"
          >
            {t('shared.viewOriginal')} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Meta */}
          <div className="flex items-center gap-3 mb-4 text-sm text-muted">
            <span>{entry.feedTitle}</span>
            <span>•</span>
            <time>{formatDistanceToNow(new Date(entry.publishedAt), { addSuffix: true, locale: getLocale() === 'zh' ? zhCN : undefined })}</time>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold mb-4 leading-tight text-[rgb(var(--text-primary))]">
            {entry.title}
          </h1>

          {entry.author && (
            <p className="text-sm text-muted mb-8">By {entry.author}</p>
          )}

          {/* AI Summary if available */}
          {entry.summary && (
            <div 
              className="mb-10 p-5 rounded-2xl border border-orange-500/30"
              style={{ 
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(249, 115, 22, 0.03) 100%)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500/60 to-orange-600/60 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-semibold text-orange-400">AI Summary</span>
              </div>
              <p className="text-secondary text-sm leading-relaxed">
                {entry.summary}
              </p>
            </div>
          )}

          {/* Main Content */}
          <div 
            className="prose prose-sm dark:prose-invert max-w-none prose-img:rounded-xl prose-a:text-orange-500 prose-a:no-underline hover:prose-a:underline prose-headings:text-[rgb(var(--text-primary))] prose-p:text-[rgb(var(--text-secondary))]"
            dangerouslySetInnerHTML={{ __html: entry.content }}
          />

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div className="mt-10 pt-6 border-t border-default">
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span 
                    key={tag} 
                    className="px-2 py-1 text-xs bg-[rgb(var(--bg-hover))] text-muted rounded-lg"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.article>
      </main>

      {/* Footer */}
      <footer className="border-t border-default mt-12">
        <div className="max-w-3xl mx-auto px-6 py-8 text-center">
          <p className="text-sm text-muted mb-2">
            {t('shared.sharedBy')}
          </p>
          <p className="text-xs text-muted">
            {t('shared.selfHostedReader')}
          </p>
        </div>
      </footer>
    </div>
  );
}
