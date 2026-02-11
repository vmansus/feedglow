'use client';

import { t, getLocale } from '@/lib/i18n';

import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface DiffViewerProps {
  diffHtml: string;
  detectedAt: string;
}

export function DiffViewer({ diffHtml, detectedAt }: DiffViewerProps) {
  const timeAgo = formatDistanceToNow(new Date(detectedAt), {
    addSuffix: true,
    locale: getLocale() === 'zh' ? zhCN : undefined,
  });

  return (
    <div className="rounded-lg border border-default overflow-hidden">
      <div className="px-4 py-2 bg-[rgb(var(--bg-hover))] border-b border-default flex items-center justify-between">
        <span className="text-sm text-muted">{t('watch.changeRecord')}</span>
        <time className="text-xs text-muted" title={new Date(detectedAt).toLocaleString(getLocale() === 'zh' ? 'zh-CN' : 'en-US')}>
          {timeAgo}
        </time>
      </div>
      <div
        className="p-4 text-sm font-mono whitespace-pre-wrap leading-relaxed diff-content overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: diffHtml }}
      />
      <style jsx global>{`
        .diff-content ins {
          background-color: rgba(34, 197, 94, 0.15);
          color: rgb(34, 197, 94);
          text-decoration: none;
          padding: 1px 4px;
          border-radius: 2px;
        }
        .diff-content del {
          background-color: rgba(239, 68, 68, 0.15);
          color: rgb(239, 68, 68);
          text-decoration: line-through;
          padding: 1px 4px;
          border-radius: 2px;
        }
        .diff-content .diff-same {
          color: rgb(var(--text-secondary));
        }
        .diff-content .diff-sep {
          display: block;
          color: rgb(var(--text-muted));
          opacity: 0.5;
          text-align: center;
          padding: 4px 0;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
