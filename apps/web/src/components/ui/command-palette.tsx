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

  // Search debounced
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await api.getEntries({ search: query, limit: 10 });
        setResults(data.entries || []);
        setSelectedIndex(0);
      } catch {
        setResults([]);
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
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <Search className="w-5 h-5 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search articles, feeds, or type a command..."
                  className="flex-1 bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-400"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}
                <kbd className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded text-gray-500">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto">
                {isSearching && (
                  <div className="p-4 text-center text-gray-500">
                    <span className="animate-pulse">Searching...</span>
                  </div>
                )}

                {!query && !isSearching && (
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">Quick Actions</div>
                    {quickActions.map((action, i) => (
                      <button
                        key={action.label}
                        onClick={action.action}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          i === selectedIndex ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <action.icon className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900 dark:text-white">{action.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {query && !isSearching && results.length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    <span className="text-3xl mb-2 block">🔍</span>
                    <p>No results found</p>
                  </div>
                )}

                {results.length > 0 && (
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">Articles</div>
                    {results.map((entry, i) => (
                      <button
                        key={entry.id}
                        onClick={() => handleSelect(entry)}
                        className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          i === selectedIndex ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{entry.title}</p>
                          <p className="text-xs text-gray-500 truncate">{entry.feedTitle}</p>
                        </div>
                        {entry.starred && <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 flex items-center gap-4">
                <span><kbd className="px-1 bg-gray-200 dark:bg-gray-700 rounded">↑↓</kbd> navigate</span>
                <span><kbd className="px-1 bg-gray-200 dark:bg-gray-700 rounded">↵</kbd> select</span>
                <span><kbd className="px-1 bg-gray-200 dark:bg-gray-700 rounded">esc</kbd> close</span>
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
