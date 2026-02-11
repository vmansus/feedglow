'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, FileText, Folder, Star, Clock, Rss } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useRouter } from 'next/navigation';
import * as api from '@/lib/api';
import type { Entry, Feed } from '@feedglow/shared';
import { t } from '@/lib/i18n';

// ============ Shared Context ============

interface CommandPaletteContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextType | undefined>(undefined);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useHotkeys('meta+k, ctrl+k', (e) => {
    e.preventDefault();
    setIsOpen(true);
  }, []);

  return (
    <CommandPaletteContext.Provider value={{
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }}>
      {children}
      <CommandPalette isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </CommandPaletteContext.Provider>
  );
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [feedResults, setFeedResults] = useState<Feed[]>([]);
  const [entryResults, setEntryResults] = useState<Entry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Total items for keyboard navigation
  const totalItems = feedResults.length + entryResults.length;

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFeedResults([]);
      setEntryResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search debounced - search both feeds and entries
  useEffect(() => {
    if (!query.trim()) {
      setFeedResults([]);
      setEntryResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [feeds, entries] = await Promise.all([
          api.searchMyFeeds(query).catch(() => []),
          api.searchEntries({ q: query, limit: 8 }).then(d => 
            Array.isArray(d?.entries) ? d.entries : []
          ).catch(() => []),
        ]);
        setFeedResults(Array.isArray(feeds) ? feeds : []);
        setEntryResults(entries);
        setSelectedIndex(0);
      } catch {
        setFeedResults([]);
        setEntryResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  useHotkeys('up', () => setSelectedIndex((i) => Math.max(0, i - 1)), { enableOnFormTags: true, enabled: isOpen }, [totalItems]);
  useHotkeys('down', () => setSelectedIndex((i) => Math.min(totalItems - 1, i + 1)), { enableOnFormTags: true, enabled: isOpen }, [totalItems]);
  useHotkeys('enter', () => {
    if (selectedIndex < feedResults.length) {
      handleSelectFeed(feedResults[selectedIndex]);
    } else {
      const entryIdx = selectedIndex - feedResults.length;
      if (entryResults[entryIdx]) {
        handleSelectEntry(entryResults[entryIdx]);
      }
    }
  }, { enableOnFormTags: true, enabled: isOpen }, [feedResults, entryResults, selectedIndex]);
  useHotkeys('escape', onClose, { enableOnFormTags: true, enabled: isOpen }, [onClose]);

  const handleSelectFeed = useCallback((feed: Feed) => {
    onClose();
    router.push(`/feed/${feed.id}`);
  }, [onClose, router]);

  const handleSelectEntry = useCallback((entry: Entry) => {
    onClose();
    router.push(`/all?entry=${entry.id}`);
  }, [onClose, router]);

  const quickActions = [
    { icon: FileText, label: t('commandPalette.allArticles'), action: () => { onClose(); router.push('/all'); } },
    { icon: Clock, label: t('commandPalette.unread'), action: () => { onClose(); router.push('/unread'); } },
    { icon: Star, label: t('commandPalette.starred'), action: () => { onClose(); router.push('/starred'); } },
    { icon: Folder, label: t('commandPalette.feeds'), action: () => { onClose(); router.push('/feeds/add'); } },
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
            className="fixed inset-x-0 top-[20%] mx-auto z-50 w-full max-w-xl px-4"
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
                  placeholder={t('commandPalette.placeholder')}
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
                    <span className="animate-pulse">{t('commandPalette.searching')}</span>
                  </div>
                )}

                {!query && !isSearching && (
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-medium text-muted uppercase">{t('commandPalette.quickActions')}</div>
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

                {query && !isSearching && feedResults.length === 0 && entryResults.length === 0 && (
                  <div className="p-8 text-center text-muted">
                    <Search className="w-8 h-8 mx-auto mb-2" />
                    <p>{t('commandPalette.noResults')}</p>
                  </div>
                )}

                {feedResults.length > 0 && (
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-medium text-muted uppercase">{t('commandPalette.feeds')}</div>
                    {feedResults.map((feed, i) => (
                      <button
                        key={`feed-${feed.id}`}
                        onClick={() => handleSelectFeed(feed)}
                        className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          i === selectedIndex ? 'bg-orange-500/10' : 'hover:bg-[rgb(var(--bg-hover))]'
                        }`}
                      >
                        <Rss className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[rgb(var(--text-primary))] truncate">{feed.title}</p>
                          <p className="text-xs text-muted truncate">{(feed as any).categoryTitle || (feed as any).site_url || feed.siteUrl}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {entryResults.length > 0 && (
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-medium text-muted uppercase">{t('commandPalette.articles')}</div>
                    {entryResults.map((entry, i) => {
                      const globalIdx = feedResults.length + i;
                      return (
                        <button
                          key={`entry-${entry.id}`}
                          onClick={() => handleSelectEntry(entry)}
                          className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                            globalIdx === selectedIndex ? 'bg-orange-500/10' : 'hover:bg-[rgb(var(--bg-hover))]'
                          }`}
                        >
                          <FileText className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[rgb(var(--text-primary))] truncate">{entry.title}</p>
                            <p className="text-xs text-muted truncate">{entry.feedTitle}</p>
                          </div>
                          {entry.starred && <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 bg-[rgb(var(--bg-base))] text-xs text-muted flex items-center gap-4">
                <span><kbd className="px-1 bg-[rgb(var(--bg-hover))] rounded">↑↓</kbd> {t('commandPalette.navigate')}</span>
                <span><kbd className="px-1 bg-[rgb(var(--bg-hover))] rounded">↵</kbd> {t('commandPalette.select')}</span>
                <span><kbd className="px-1 bg-[rgb(var(--bg-hover))] rounded">esc</kbd> {t('commandPalette.close')}</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook to use command palette - uses shared context
export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  }
  return context;
}
