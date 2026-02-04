'use client';

import { useState, useEffect } from 'react';
import { cn } from '@feedglow/ui';
import { 
  ArrowUpDown, 
  Star, 
  ChevronDown,
  Filter
} from 'lucide-react';

export interface EntryFilters {
  order: 'published_at' | 'created_at';
  direction: 'desc' | 'asc';
  status: 'all' | 'unread' | 'read';
  starred: boolean;
}

const STORAGE_KEY = 'feedglow_entry_filters';

const defaultFilters: EntryFilters = {
  order: 'published_at',
  direction: 'desc',
  status: 'all',
  starred: false,
};

function loadFilters(): EntryFilters {
  if (typeof window === 'undefined') return defaultFilters;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...defaultFilters, ...JSON.parse(saved) } : defaultFilters;
  } catch {
    return defaultFilters;
  }
}

function saveFilters(filters: EntryFilters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore
  }
}

interface EntryFiltersBarProps {
  filters: EntryFilters;
  onChange: (filters: EntryFilters) => void;
  totalCount?: number;
  unreadCount?: number;
}

export function useEntryFilters() {
  const [filters, setFilters] = useState<EntryFilters>(defaultFilters);

  useEffect(() => {
    setFilters(loadFilters());
  }, []);

  const updateFilters = (newFilters: Partial<EntryFilters>) => {
    const updated = { ...filters, ...newFilters };
    setFilters(updated);
    saveFilters(updated);
  };

  return { filters, updateFilters };
}

export function EntryFiltersBar({ 
  filters, 
  onChange, 
  totalCount,
  unreadCount 
}: EntryFiltersBarProps) {
  const [showMenu, setShowMenu] = useState(false);

  const statusLabel = filters.status === 'all' 
    ? `全部${totalCount !== undefined ? ` (${totalCount})` : ''}`
    : filters.status === 'unread' 
      ? `未读${unreadCount !== undefined ? ` (${unreadCount})` : ''}`
      : '已读';

  const sortLabel = filters.direction === 'desc' ? '最新' : '最早';

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-default bg-[rgb(var(--bg-base))]">
      {/* Combined Filter Button */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="btn-ghost flex items-center gap-2 text-xs"
        >
          <Filter className="w-3.5 h-3.5" />
          <span>{statusLabel}</span>
          <span className="text-muted">·</span>
          <span className="text-muted">{sortLabel}</span>
          {filters.starred && (
            <>
              <span className="text-muted">·</span>
              <Star className="w-3 h-3 text-yellow-500 fill-current" />
            </>
          )}
          <ChevronDown className="w-3 h-3 ml-1" />
        </button>

        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowMenu(false)} 
            />
            <div className="absolute top-full left-0 mt-1 py-2 bg-[rgb(var(--bg-elevated))] border border-default rounded-xl shadow-2xl z-50 min-w-[200px]">
              {/* Status Section */}
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted">状态</div>
              <button
                onClick={() => {
                  onChange({ ...filters, status: 'all' });
                }}
                className={cn(
                  "w-full px-3 py-2 text-xs text-left hover:bg-[rgb(var(--bg-hover))] flex items-center justify-between",
                  filters.status === 'all' && "text-orange-500"
                )}
              >
                <span>全部</span>
                {totalCount !== undefined && <span className="text-muted">{totalCount}</span>}
              </button>
              <button
                onClick={() => {
                  onChange({ ...filters, status: 'unread' });
                }}
                className={cn(
                  "w-full px-3 py-2 text-xs text-left hover:bg-[rgb(var(--bg-hover))] flex items-center justify-between",
                  filters.status === 'unread' && "text-orange-500"
                )}
              >
                <span>未读</span>
                {unreadCount !== undefined && <span className="text-muted">{unreadCount}</span>}
              </button>
              <button
                onClick={() => {
                  onChange({ ...filters, status: 'read' });
                }}
                className={cn(
                  "w-full px-3 py-2 text-xs text-left hover:bg-[rgb(var(--bg-hover))]",
                  filters.status === 'read' && "text-orange-500"
                )}
              >
                已读
              </button>

              <div className="h-px bg-[rgb(var(--border-default))] my-2" />

              {/* Sort Section */}
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted">排序</div>
              <button
                onClick={() => {
                  onChange({ ...filters, direction: 'desc' });
                }}
                className={cn(
                  "w-full px-3 py-2 text-xs text-left hover:bg-[rgb(var(--bg-hover))]",
                  filters.direction === 'desc' && "text-orange-500"
                )}
              >
                最新优先
              </button>
              <button
                onClick={() => {
                  onChange({ ...filters, direction: 'asc' });
                }}
                className={cn(
                  "w-full px-3 py-2 text-xs text-left hover:bg-[rgb(var(--bg-hover))]",
                  filters.direction === 'asc' && "text-orange-500"
                )}
              >
                最早优先
              </button>

              <div className="h-px bg-[rgb(var(--border-default))] my-2" />

              {/* Starred Toggle */}
              <button
                onClick={() => {
                  onChange({ ...filters, starred: !filters.starred });
                }}
                className={cn(
                  "w-full px-3 py-2 text-xs text-left hover:bg-[rgb(var(--bg-hover))] flex items-center gap-2",
                  filters.starred && "text-yellow-500"
                )}
              >
                <Star className={cn("w-3.5 h-3.5", filters.starred && "fill-current")} />
                只看收藏
              </button>

              {/* Reset */}
              {(filters.status !== 'all' || filters.starred || filters.direction !== 'desc') && (
                <>
                  <div className="h-px bg-[rgb(var(--border-default))] my-2" />
                  <button
                    onClick={() => {
                      onChange(defaultFilters);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-muted hover:text-orange-500 hover:bg-[rgb(var(--bg-hover))]"
                  >
                    重置筛选
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
