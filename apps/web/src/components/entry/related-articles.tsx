'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Sparkles, ArrowRight } from 'lucide-react';
import { getRelatedEntries, type RelatedEntry } from '@/lib/api';
import { cn } from '@feedglow/ui';
import { t, getLocale } from '@/lib/i18n';

interface RelatedArticlesProps {
  entryId: number | string;
  onNavigate?: (entryId: number) => void;
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'ai-recommended': t('entry.related.aiRecommended'),
    similar: t('entry.related.similar'),
    'same-topic': t('entry.related.sameTopic'),
    'same-feed': t('entry.related.sameFeed'),
    reference: t('entry.related.reference'),
  };
  return labels[type] || type;
}

export function RelatedArticles({ entryId, onNavigate }: RelatedArticlesProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['related-articles', entryId],
    queryFn: () => getRelatedEntries(entryId),
    enabled: !!entryId,
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: false, // Don't retry if entry not in knowledge graph yet
  });

  const related = data?.related?.filter(r => r.type !== 'same-feed').slice(0, 5) || [];

  // Don't render anything if no related articles or still loading
  if (isLoading || related.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-default">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-medium text-[rgb(var(--text-primary))]">
          {t('entry.related.title')}
        </span>
        <span className="text-xs text-muted">
          {t('entry.related.subtitle')}
        </span>
      </div>

      <div className="space-y-2">
        {related.map((item) => (
          <RelatedCard
            key={`${item.entry.id}-${item.type}`}
            item={item}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function RelatedCard({ 
  item, 
  onNavigate 
}: { 
  item: RelatedEntry; 
  onNavigate?: (entryId: number) => void;
}) {
  const { entry, type } = item;

  return (
    <button
      onClick={() => onNavigate?.(entry.id)}
      className={cn(
        "w-full text-left p-3 rounded-lg border border-default",
        "hover:border-orange-500/30 hover:bg-[rgb(var(--bg-hover))]",
        "transition-all duration-200 group"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-[rgb(var(--text-primary))] line-clamp-2 group-hover:text-orange-400 transition-colors">
            {entry.title}
          </h4>
          <div className="flex items-center gap-2 mt-1.5">
            {entry.feedTitle && (
              <span className="text-xs text-muted truncate max-w-[120px]">
                {entry.feedTitle}
              </span>
            )}
            <span className="text-xs text-muted">·</span>
            <span className="text-xs text-muted">
              {formatDistanceToNow(new Date(entry.publishedAt), { addSuffix: true, locale: getLocale() === 'zh' ? zhCN : undefined })}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">
              {getTypeLabel(type)}
            </span>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted group-hover:text-orange-400 transition-colors flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}
