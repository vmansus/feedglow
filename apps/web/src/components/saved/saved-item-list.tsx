'use client';

import { getLocale, t } from '@/lib/i18n';

import { formatDistanceToNow, differenceInDays, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Trash2, Twitter, Bookmark, Pencil, Inbox } from 'lucide-react';
import type { SavedItem } from '@/lib/api';

// Format date: relative for < 30 days, specific date+time for >= 30 days
function formatDate(date: Date): string {
  const days = differenceInDays(new Date(), date);
  if (days < 30) {
    return formatDistanceToNow(date, { addSuffix: false, locale: getLocale() === 'zh' ? zhCN : undefined });
  }
  return format(date, getLocale() === 'zh' ? 'yyyy年M月d日 HH:mm' : 'MMM d, yyyy HH:mm');
}

// Source styling
const SOURCE_CONFIG: Record<string, { Icon: typeof Twitter; label: string; bgColor: string; textColor: string }> = {
  twitter: { Icon: Twitter, label: 'Twitter', bgColor: 'bg-blue-500/10', textColor: 'text-blue-400' },
  extension: { Icon: Bookmark, label: 'Clipper', bgColor: 'bg-orange-500/10', textColor: 'text-orange-400' },
  manual: { Icon: Pencil, label: 'Manual', bgColor: 'bg-gray-500/10', textColor: 'text-gray-400' },
};

interface SavedItemListProps {
  items: SavedItem[];
  selectedId?: number;
  onSelect?: (item: SavedItem) => void;
  onDelete?: (item: SavedItem) => void;
  isLoading?: boolean;
  selectMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
}

// Helper to get hostname from URL
function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function SavedItemList({ 
  items, 
  selectedId, 
  onSelect,
  onDelete,
  isLoading,
  selectMode,
  selectedIds,
  onToggleSelect,
}: SavedItemListProps) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded bg-[rgb(var(--bg-hover))]" />
              <div className="flex-1">
                <div className="h-4 bg-[rgb(var(--bg-hover))] rounded w-3/4 mb-2" />
                <div className="h-3 bg-[rgb(var(--bg-hover))] rounded w-1/2 mb-1" />
                <div className="h-3 bg-[rgb(var(--bg-hover))] rounded w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-40 text-muted"
      >
        <Inbox className="w-10 h-10 mb-3" />
        <p className="font-medium">{t('saved.noItems')}</p>
        <p className="text-xs mt-1">{t('saved.useClipper')}</p>
      </motion.div>
    );
  }

  return (
    <div>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => {
          const isSelected = selectedId === item.id;
          const isChecked = selectMode && selectedIds?.has(item.id);
          const isUnread = !item.isRead;
          const source = SOURCE_CONFIG[item.source] || SOURCE_CONFIG.manual;

          return (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
              layout
              onClick={() => selectMode ? onToggleSelect?.(item.id) : onSelect?.(item)}
              className={cn(
                'p-4 cursor-pointer transition-all border-b border-default relative group',
                isSelected 
                  ? 'bg-[rgb(var(--bg-hover))] bg-glow-gradient' 
                  : isChecked
                    ? 'bg-orange-500/5'
                    : 'hover:bg-[rgb(var(--bg-hover))]'
              )}
            >
              {/* Selected indicator - glow bar */}
              {isSelected && !selectMode && (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1" 
                  style={{ 
                    backgroundColor: 'rgb(var(--color-primary))',
                    boxShadow: '0 0 10px rgba(var(--color-primary-rgb), 0.8), 0 0 20px rgba(var(--color-primary-rgb), 0.4)' 
                  }}
                />
              )}

              {/* Unread indicator */}
              {isUnread && !isSelected && !selectMode && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[rgb(var(--accent))]" />
              )}

              <div className="flex gap-3">
                {/* Checkbox in select mode */}
                {selectMode && (
                  <div className="flex-shrink-0 self-center">
                    <div className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                      isChecked 
                        ? 'bg-orange-500 border-orange-500' 
                        : 'border-gray-300 dark:border-gray-600'
                    )}>
                      {isChecked && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                )}
                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Meta: Source + hostname + time */}
                  <div className="flex items-center gap-2 mb-1.5 text-xs text-muted">
                    {/* Source badge */}
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1', source.bgColor, source.textColor)}>
                      <source.Icon className="w-3 h-3" /> {source.label}
                    </span>
                    <span className="text-[rgb(var(--border-default))]">·</span>
                    {/* Hostname */}
                    <span className="truncate max-w-[100px]">{getHostname(item.url)}</span>
                    <span className="text-[rgb(var(--border-default))]">·</span>
                    {/* Time */}
                    <span>{formatDate(new Date(item.createdAt))}</span>
                  </div>

                  {/* Title */}
                  <h3
                    className={cn(
                      'text-sm mb-1.5 line-clamp-2 leading-snug',
                      isUnread 
                        ? 'font-medium text-[rgb(var(--text-primary))]' 
                        : 'font-normal text-secondary'
                    )}
                  >
                    {item.title || 'Untitled'}
                  </h3>

                  {/* Description */}
                  {item.description && (
                    <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Thumbnail */}
                {item.thumbnail && (
                  <div className="flex-shrink-0">
                    <img 
                      src={item.thumbnail} 
                      alt=""
                      className={cn(
                        "w-16 h-16 rounded-lg object-cover transition-opacity",
                        isSelected ? "opacity-100" : "opacity-70"
                      )}
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                {/* Delete button - show on hover (hidden in select mode) */}
                {onDelete && !selectMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item);
                    }}
                    className="flex-shrink-0 p-1 rounded transition-colors self-start text-muted hover:text-red-500 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.article>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
