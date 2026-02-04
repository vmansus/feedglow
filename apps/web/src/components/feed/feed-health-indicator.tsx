'use client';

import { useState } from 'react';
import { cn } from '@feedglow/ui';
import { 
  AlertTriangle, 
  RefreshCw, 
  Pause, 
  Play,
  Clock,
  X
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface FeedHealth {
  feedId: number;
  title: string;
  errorCount: number;
  errorMessage?: string;
  checkedAt?: string;
  disabled: boolean;
}

interface FeedHealthIndicatorProps {
  errorCount?: number;
  errorMessage?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
}

export function FeedHealthIndicator({
  errorCount = 0,
  errorMessage,
  disabled = false,
  size = 'sm',
  onClick,
}: FeedHealthIndicatorProps) {
  if (errorCount === 0 && !disabled) return null;

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  if (disabled) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "flex items-center gap-1 text-muted transition-colors hover:text-[rgb(var(--text-secondary))]",
          size === 'sm' ? 'text-xs' : 'text-sm'
        )}
        title="Feed 已暂停"
      >
        <Pause className={iconSize} />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 text-yellow-500 transition-colors hover:text-yellow-400",
        size === 'sm' ? 'text-xs' : 'text-sm'
      )}
      title={errorMessage || `${errorCount} 次抓取失败`}
    >
      <AlertTriangle className={iconSize} />
      {size === 'md' && <span>{errorCount}</span>}
    </button>
  );
}

interface FeedHealthDetailProps {
  feed: FeedHealth;
  onRetry: () => void;
  onToggleDisable: () => void;
  isRetrying?: boolean;
}

export function FeedHealthDetail({
  feed,
  onRetry,
  onToggleDisable,
  isRetrying = false,
}: FeedHealthDetailProps) {
  return (
    <div className="p-4 bg-[rgb(var(--bg-base))] border border-default rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-medium text-sm">{feed.title}</h4>
          {feed.checkedAt && (
            <p className="text-xs text-muted flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" />
              上次检查: {formatDistanceToNow(new Date(feed.checkedAt), { addSuffix: true })}
            </p>
          )}
        </div>
        <div className={cn(
          "px-2 py-0.5 rounded text-xs",
          feed.disabled 
            ? "bg-gray-500/20 text-gray-400" 
            : feed.errorCount > 0 
              ? "bg-yellow-500/20 text-yellow-500" 
              : "bg-green-500/20 text-green-500"
        )}>
          {feed.disabled ? '已暂停' : feed.errorCount > 0 ? `${feed.errorCount} 次失败` : '正常'}
        </div>
      </div>

      {feed.errorMessage && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
          {feed.errorMessage}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="flex-1 py-1.5 rounded-lg bg-[rgb(var(--bg-hover))] hover:bg-[rgb(var(--bg-active))] transition-colors text-xs flex items-center justify-center gap-1"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isRetrying && "animate-spin")} />
          {isRetrying ? '刷新中...' : '重试'}
        </button>
        <button
          onClick={onToggleDisable}
          className={cn(
            "flex-1 py-1.5 rounded-lg transition-colors text-xs flex items-center justify-center gap-1",
            feed.disabled 
              ? "bg-green-500/20 text-green-500 hover:bg-green-500/30" 
              : "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30"
          )}
        >
          {feed.disabled ? (
            <>
              <Play className="w-3.5 h-3.5" />
              启用
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5" />
              暂停
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface FeedHealthPanelProps {
  feeds: FeedHealth[];
  onRetry: (feedId: number) => void;
  onToggleDisable: (feedId: number, disable: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function FeedHealthPanel({
  feeds,
  onRetry,
  onToggleDisable,
  isOpen,
  onClose,
}: FeedHealthPanelProps) {
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());

  const unhealthyFeeds = feeds.filter(f => f.errorCount > 0 || f.disabled);
  const disabledCount = feeds.filter(f => f.disabled).length;
  const errorCount = feeds.filter(f => f.errorCount > 0 && !f.disabled).length;

  const handleRetry = async (feedId: number) => {
    setRetryingIds(prev => new Set(prev).add(feedId));
    try {
      await onRetry(feedId);
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(feedId);
        return next;
      });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute top-full right-0 mt-2 w-80 max-h-[400px] overflow-y-auto bg-[rgb(var(--bg-elevated))] border border-default rounded-xl shadow-xl z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-default sticky top-0 bg-[rgb(var(--bg-elevated))]">
            <div>
              <h3 className="font-semibold text-sm">Feed 健康状态</h3>
              <p className="text-xs text-muted">
                {errorCount} 个错误, {disabledCount} 个已暂停
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-2">
            {unhealthyFeeds.length === 0 ? (
              <p className="text-center text-sm text-muted py-4">
                所有 Feed 运行正常 ✓
              </p>
            ) : (
              unhealthyFeeds.map(feed => (
                <FeedHealthDetail
                  key={feed.feedId}
                  feed={feed}
                  onRetry={() => handleRetry(feed.feedId)}
                  onToggleDisable={() => onToggleDisable(feed.feedId, !feed.disabled)}
                  isRetrying={retryingIds.has(feed.feedId)}
                />
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
