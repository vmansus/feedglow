'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import { useRankedEntries, useKeyboardNavigation, useToggleBookmark, useMarkAsRead, useMarkAsUnread, useRecordReadEvent } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { DailyDigest } from '@/components/digest/daily-digest';
import type { Entry } from '@feedglow/shared';

export default function ForYouPage() {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const { data, isLoading, error, refetch } = useRankedEntries();
  const toggleBookmark = useToggleBookmark();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const recordReadEvent = useRecordReadEvent();

  // Defensive: ensure entries is always an array
  const entries = Array.isArray(data?.entries) ? data.entries : [];

  // Track reading time for selected entry
  const readStartTime = useRef<number | null>(null);
  
  useEffect(() => {
    if (selectedEntry) {
      readStartTime.current = Date.now();
    } else if (readStartTime.current) {
      // Entry was deselected
      readStartTime.current = null;
    }
  }, [selectedEntry]);

  const handleSelect = useCallback((entry: Entry) => {
    // Record previous entry's read time
    if (selectedEntry && readStartTime.current) {
      const duration = Math.round((Date.now() - readStartTime.current) / 1000);
      recordReadEvent.mutate({
        entryId: selectedEntry.id,
        duration,
        completed: duration > 30, // Consider "completed" if read > 30s
      });
    }
    
    setSelectedEntry(entry);
    readStartTime.current = Date.now();
  }, [selectedEntry, recordReadEvent]);

  const { showHelp, setShowHelp, shortcuts } = useKeyboardNavigation({
    entries,
    selectedId: selectedEntry?.id,
    onSelect: handleSelect,
    onOpen: handleSelect,
    onClose: () => setSelectedEntry(null),
    onToggleStar: (entry) => toggleBookmark.mutate(entry.id),
    onToggleRead: (entry) => {
      if (entry.status === 'unread') markAsRead.mutate(entry.id);
      else markAsUnread.mutate(entry.id);
    },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-red-500" />
          <p className="text-red-500 mb-2">Failed to load recommendations</p>
          <button 
            onClick={() => refetch()}
            className="text-orange-500 hover:underline"
          >
            Try again
          </button>
        </motion.div>
      </div>
    );
  }

  const listHeader = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 border-b border-default">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center"
            style={{ boxShadow: '0 0 20px rgba(249, 115, 22, 0.4)' }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-[rgb(var(--text-primary))]">For You</h1>
            <p className="text-xs text-muted">Personalized based on your reading</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="p-2 text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors"
          title="Refresh recommendations"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </motion.div>
  );

  const listContent = isLoading ? (
    <EntryListSkeleton count={10} />
  ) : entries.length > 0 ? (
    <>
      {/* Daily Digest Card */}
      <div className="p-4 border-b border-default">
        <DailyDigest compact />
      </div>
      <EntryList entries={entries} selectedId={selectedEntry?.id} onSelect={handleSelect} />
      {/* Feedback hint at bottom */}
      <div className="p-4 text-center text-xs text-muted border-t border-default">
        <p>Your reading habits help improve recommendations</p>
      </div>
    </>
  ) : (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-64 text-muted p-6"
    >
      <Sparkles className="w-12 h-12 text-orange-500/50 mb-4" />
      <p className="text-center mb-2">Not enough data yet</p>
      <p className="text-center text-sm">Read more articles and we&apos;ll personalize your feed</p>
    </motion.div>
  );

  const readerContent = (
    <AnimatePresence mode="wait">
      {selectedEntry ? (
        <EntryReader 
          key={selectedEntry.id} 
          entry={selectedEntry} 
          onClose={() => setSelectedEntry(null)}
        />
      ) : (
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center justify-center h-full text-muted"
        >
          <div className="text-center">
            <div 
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center mx-auto mb-4"
              style={{ boxShadow: '0 0 40px rgba(249, 115, 22, 0.15)' }}
            >
              <Sparkles className="w-8 h-8 text-orange-500" />
            </div>
            <p className="mb-2">AI-curated articles just for you</p>
            <p className="text-sm text-muted">
              Press <kbd className="px-1.5 py-0.5 text-xs bg-[rgb(var(--bg-hover))] rounded">?</kbd> for shortcuts
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <ResizableLayout
        sidebar={null}
        listHeader={listHeader}
        list={listContent}
        reader={readerContent}
        selectedEntryId={selectedEntry?.id}
        onClearSelection={() => setSelectedEntry(null)}
      />
      <KeyboardHelp isOpen={showHelp} onClose={() => setShowHelp(false)} shortcuts={shortcuts} />
    </>
  );
}
