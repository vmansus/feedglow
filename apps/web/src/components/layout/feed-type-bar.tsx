'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import * as api from '@/lib/api';
import type { FeedType } from '@/lib/api';
import { useFeedType } from '@/contexts/feed-type-context';
import { Newspaper, MessageCircle, Bell, Image, Play, LayoutGrid, Mail, Headphones } from 'lucide-react';
import { t } from '@/lib/i18n';

const FEED_TYPES: { type: FeedType | 'all'; icon: React.ReactNode; labelKey: string }[] = [
  { type: 'all', icon: <LayoutGrid className="w-[18px] h-[18px]" />, labelKey: 'feedType.all' },
  { type: 'article', icon: <Newspaper className="w-[18px] h-[18px]" />, labelKey: 'feedType.article' },
  { type: 'podcast', icon: <Headphones className="w-[18px] h-[18px]" />, labelKey: 'feedType.podcast' },
  { type: 'social', icon: <MessageCircle className="w-[18px] h-[18px]" />, labelKey: 'feedType.social' },
  { type: 'newsletter', icon: <Mail className="w-[18px] h-[18px]" />, labelKey: 'feedType.newsletter' },
  { type: 'picture', icon: <Image className="w-[18px] h-[18px]" />, labelKey: 'feedType.picture' },
  { type: 'video', icon: <Play className="w-[18px] h-[18px]" />, labelKey: 'feedType.video' },
  { type: 'notification', icon: <Bell className="w-[18px] h-[18px]" />, labelKey: 'feedType.notification' },
];

export function FeedTypeBar() {
  const { selectedType, setSelectedType } = useFeedType();

  const { data: counts } = useQuery({
    queryKey: ['feeds', 'type-counts'],
    queryFn: api.getFeedTypeCounts,
    refetchInterval: 60000,
  });

  const totalCount = counts
    ? (counts.article || 0) + (counts.social || 0) + (counts.notification || 0) + (counts.picture || 0) + (counts.video || 0) + (counts.podcast || 0) + (counts.newsletter || 0)
    : 0;

  function getCount(type: FeedType | 'all'): number {
    if (!counts) return 0;
    if (type === 'all') return totalCount;
    return counts[type] || 0;
  }

  function formatCount(n: number): string {
    if (n === 0) return '';
    if (n > 99) return '99+';
    return String(n);
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2.5 border-b border-[rgb(var(--border-base))] overflow-x-auto scrollbar-hide">
      {FEED_TYPES.map(({ type, icon, labelKey }) => {
        const count = getCount(type);
        const isActive = selectedType === type;
        const countStr = formatCount(count);

        return (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className="relative flex flex-col items-center gap-0.5 group flex-shrink-0 min-w-[48px]"
          >
            <div
              className={`
                relative w-9 h-9 rounded-lg flex items-center justify-center
                transition-all duration-200
                ${isActive
                  ? 'bg-orange-500/15 text-orange-500'
                  : 'text-[rgb(var(--text-muted))] group-hover:text-[rgb(var(--text-secondary))] group-hover:bg-[rgb(var(--bg-hover))]'
                }
              `}
            >
              {icon}
              {countStr && (
                <span className={`absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center text-[9px] font-bold ${isActive ? 'text-orange-400' : 'text-orange-500'}`}>
                  {countStr}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-medium leading-tight transition-colors ${isActive ? 'text-orange-500' : 'text-[rgb(var(--text-muted))]'}`}>
              {t(labelKey)}
            </span>
            {isActive && (
              <motion.div
                layoutId="feedTypeUnderline"
                className="absolute -bottom-2.5 left-1.5 right-1.5 h-[2px] bg-orange-500 rounded-full"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
