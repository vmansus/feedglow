'use client';

import { useState, useEffect } from 'react';
import { cn } from '@feedglow/ui';
import { 
  ArrowUpDown, 
  Star, 
  CheckCircle2, 
  Circle,
  ChevronDown
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
  const [showSortMenu, setShowSortMenu] = useState(false);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-default bg-[rgb(var(--bg-base))] overflow-x-auto flex-nowrap">
      {/* Sort Dropdown */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowSortMenu(!showSortMenu)}
          className="btn-ghost flex items-center gap-1.5 text-xs"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>
            {filters.order === 'published_at' ? '发布时间' : '添加时间'}
            {filters.direction === 'desc' ? ' ↓' : ' ↑'}
          </span>
          <ChevronDown className="w-3 h-3" />
        </button>

        {showSortMenu && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowSortMenu(false)} 
            />
            <div className="absolute top-full left-0 mt-1 py-1 bg-[rgb(var(--bg-elevated))] border border-default rounded-lg shadow-xl z-20 min-w-[140px]">
              <button
                onClick={() => {
                  onChange({ ...filters, order: 'published_at', direction: 'desc' });
                  setShowSortMenu(false);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-xs text-left hover:bg-[rgb(var(--bg-hover))]",
                  filters.order === 'published_at' && filters.direction === 'desc' && "text-orange-500"
                )}
              >
                发布时间 (最新)
              </button>
              <button
                onClick={() => {
                  onChange({ ...filters, order: 'published_at', direction: 'asc' });
                  setShowSortMenu(false);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-xs text-left hover:bg-[rgb(var(--bg-hover))]",
                  filters.order === 'published_at' && filters.direction === 'asc' && "text-orange-500"
                )}
              >
                发布时间 (最早)
              </button>
              <button
                onClick={() => {
                  onChange({ ...filters, order: 'created_at', direction: 'desc' });
                  setShowSortMenu(false);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-xs text-left hover:bg-[rgb(var(--bg-hover))]",
                  filters.order === 'created_at' && filters.direction === 'desc' && "text-orange-500"
                )}
              >
                添加时间 (最新)
              </button>
            </div>
          </>
        )}
      </div>

      <div className="h-4 w-px bg-[rgb(var(--border-default))] flex-shrink-0" />

      {/* Status Filter */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onChange({ ...filters, status: 'all' })}
          className={cn(
            "px-2 py-1 rounded text-xs transition-colors",
            filters.status === 'all' 
              ? "bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-primary))]" 
              : "text-muted hover:text-[rgb(var(--text-secondary))]"
          )}
        >
          全部 {totalCount !== undefined && `(${totalCount})`}
        </button>
        <button
          onClick={() => onChange({ ...filters, status: 'unread' })}
          className={cn(
            "px-2 py-1 rounded text-xs transition-colors flex items-center gap-1",
            filters.status === 'unread' 
              ? "bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-primary))]" 
              : "text-muted hover:text-[rgb(var(--text-secondary))]"
          )}
        >
          <Circle className="w-3 h-3" />
          未读 {unreadCount !== undefined && `(${unreadCount})`}
        </button>
        <button
          onClick={() => onChange({ ...filters, status: 'read' })}
          className={cn(
            "px-2 py-1 rounded text-xs transition-colors flex items-center gap-1",
            filters.status === 'read' 
              ? "bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-primary))]" 
              : "text-muted hover:text-[rgb(var(--text-secondary))]"
          )}
        >
          <CheckCircle2 className="w-3 h-3" />
          已读
        </button>
      </div>

      <div className="h-4 w-px bg-[rgb(var(--border-default))] flex-shrink-0" />

      {/* Starred Filter */}
      <button
        onClick={() => onChange({ ...filters, starred: !filters.starred })}
        className={cn(
          "px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 flex-shrink-0",
          filters.starred 
            ? "bg-yellow-500/20 text-yellow-500" 
            : "text-muted hover:text-[rgb(var(--text-secondary))]"
        )}
      >
        <Star className={cn("w-3 h-3", filters.starred && "fill-current")} />
        收藏
      </button>

      {/* Reset */}
      {(filters.status !== 'all' || filters.starred || filters.order !== 'published_at' || filters.direction !== 'desc') && (
        <>
          <div className="flex-1" />
          <button
            onClick={() => onChange(defaultFilters)}
            className="text-xs text-muted hover:text-orange-500 transition-colors"
          >
            重置
          </button>
        </>
      )}
    </div>
  );
}
