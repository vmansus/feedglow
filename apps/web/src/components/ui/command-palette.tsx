'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, FileText, Folder, Star, Clock } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useRouter } from 'next/navigation';
import * as api from '@/lib/api';
import type { Entry } from '@feedglow/shared';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Entry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search debounced - use full-text search API
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Use searchEntries for full-text search, fallback to getEntries
        const data = await api.searchEntries({ q: query, limit: 10 });
        setResults(data.entries || []);
        setSelectedIndex(0);
      } catch {
        // Fallback to basic search
        try {
          const data = await api.getEntries({ search: query, limit: 10 });
          setResults(data.entries || []);
          setSelectedIndex(0);
        } catch {
          setResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  useHotkeys('up', () => setSelectedIndex((i) => Math.max(0, i - 1)), { enableOnFormTags: true, enabled: isOpen }, [results]);
  useHotkeys('down', () => setSelectedIndex((i) => Math.min(results.length - 1, i + 1)), { enableOnFormTags: true, enabled: isOpen }, [results]);
  useHotkeys('enter', () => {
    if (results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  }, { enableOnFormTags: true, enabled: isOpen }, [results, selectedIndex]);
  useHotkeys('escape', onClose, { enableOnFormTags: true, enabled: isOpen }, [onClose]);

  const handleSelect = useCallback((entry: Entry) => {
    onClose();
    // Navigate to the entry - for now go to all articles
    router.push(`/all?entry=${entry.id}`);
  }, [onClose, router]);

  const quickActions = [
    { icon: FileText, label: 'All Articles', action: () => { onClose(); router.push('/all'); } },
    { icon: Clock, label: 'Unread', action: () => { onClose(); router.push('/unread'); } },
    { icon: Star, label: 'Starred', action: () => { onClose(); router.push('/starred'); } },
    { icon: Folder, label: 'Feeds', action: () => { onClose(); router.push('/feeds'); } },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-xl"
          >
            <div className="bg-[rgb(var(--bg-elevated))] rounded-xl shadow-2xl border border-default overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-default">
                <Search className="w-5 h-5 text-muted" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索文章、Feed 或输入命令..."
                  className="flex-1 bg-transparent outline-none text-[rgb(var(--text-primary))] placeholder-[rgb(var(--text-muted))]"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="p-1 hover:bg-[rgb(var(--bg-hover))] rounded">
                    <X className="w-4 h-4 text-muted" />
                  </button>
                )}
                <kbd className="px-2 py-1 text-xs bg-[rgb(var(--bg-hover))] rounded text-muted">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto">
                {isSearching && (
                  <div className="p-4 text-center text-muted">
                    <span className="animate-pulse">搜索中...</span>
                  </div>
                )}

                {!query && !isSearching && (
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-medium text-muted uppercase">快捷操作</div>
                    {quickActions.map((action, i) => (
                      <button
                        key={action.label}
                        onClick={action.action}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          i === selectedIndex ? 'bg-orange-500/10 text-orange-500' : 'hover:bg-[rgb(var(--bg-hover))]'
                        }`}
                      >
                        <action.icon className="w-4 h-4 text-muted" />
                        <span className="text-[rgb(var(--text-primary))]">{action.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {query && !isSearching && results.length === 0 && (
                  <div className="p-8 text-center text-muted">
                    <span className="text-3xl mb-2 block">🔍</span>
                    <p>没有找到结果</p>
                  </div>
                )}

                {results.length > 0 && (
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-medium text-muted uppercase">文章</div>
                    {results.map((entry, i) => (
                      <button
                        key={entry.id}
                        onClick={() => handleSelect(entry)}
                        className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          i === selectedIndex ? 'bg-orange-500/10' : 'hover:bg-[rgb(var(--bg-hover))]'
                        }`}
                      >
                        <FileText className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[rgb(var(--text-primary))] truncate">{entry.title}</p>
                          <p className="text-xs text-muted truncate">{entry.feedTitle}</p>
                        </div>
                        {entry.starred && <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 bg-[rgb(var(--bg-base))] text-xs text-muted flex items-center gap-4">
                <span><kbd className="px-1 bg-[rgb(var(--bg-hover))] rounded">↑↓</kbd> 导航</span>
                <span><kbd className="px-1 bg-[rgb(var(--bg-hover))] rounded">↵</kbd> 选择</span>
                <span><kbd className="px-1 bg-[rgb(var(--bg-hover))] rounded">esc</kbd> 关闭</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook to use command palette
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useHotkeys('meta+k, ctrl+k', (e) => {
    e.preventDefault();
    setIsOpen(true);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
