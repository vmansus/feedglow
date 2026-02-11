'use client';

import { Clock } from 'lucide-react';
import { t } from '@/lib/i18n';

interface ReadingTimeProps {
  minutes: number;
  words?: number;
  compact?: boolean;
}

export function ReadingTime({ minutes, words, compact = false }: ReadingTimeProps) {
  if (!minutes || minutes <= 0) return null;

  const formatTime = (mins: number) => {
    if (mins < 1) return t('entry.readingTime.lessThanMinute');
    if (mins === 1) return t('entry.readingTime.oneMinute');
    if (mins < 60) return t('entry.readingTime.nMinutes', { n: Math.round(mins) });
    const hours = Math.floor(mins / 60);
    const remaining = Math.round(mins % 60);
    if (remaining === 0) return t('entry.readingTime.nHours', { n: hours });
    return t('entry.readingTime.hoursMinutes', { n: hours, m: remaining });
  };

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
        <Clock className="w-3 h-3" />
        {formatTime(minutes)}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      <Clock className="w-4 h-4" />
      <span>{t('entry.readingTime.estimated', { time: formatTime(minutes) })}</span>
      {words && words > 0 && (
        <span className="text-zinc-400 dark:text-zinc-500">
          · {t('entry.readingTime.words', { n: words.toLocaleString() })}
        </span>
      )}
    </div>
  );
}
