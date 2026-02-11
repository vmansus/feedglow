'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getSavedItems, 
  updateSavedItem, 
  deleteSavedItem,
  bulkDeleteSavedItems,
  type SavedItem 
} from '@/lib/api';
import { ResizableLayout } from '@/components/layout/resizable-layout';
import { SavedItemList } from '@/components/saved/saved-item-list';
import { SavedItemReader } from '@/components/saved/saved-item-reader';
import { KeyboardHelp } from '@/components/ui/keyboard-help';
import { AlertTriangle, CheckSquare, Inbox, Search, Trash2, X } from 'lucide-react';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

type FilterType = 'all' | 'unread' | 'twitter' | 'extension';

export default function SavedPage() {
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const [selectedItem, setSelectedItem] = useState<SavedItem | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Fetch saved items
  const { data, isLoading, error } = useQuery({
    queryKey: ['saved-items', filter, searchQuery],
    queryFn: () => getSavedItems({
      limit: 100,
      unread: filter === 'unread' ? true : undefined,
      source: filter === 'twitter' || filter === 'extension' ? filter : undefined,
      search: searchQuery || undefined,
    }),
  });

  // Mark as read mutation
  const markAsRead = useMutation({
    mutationFn: (id: number) => updateSavedItem(id, { isRead: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] });
    },
  });

  // Delete mutation
  const deleteItem = useMutation({
    mutationFn: deleteSavedItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] });
      setSelectedItem(null);
    },
  });

  // Bulk delete mutation
  const bulkDelete = useMutation({
    mutationFn: (ids: number[]) => bulkDeleteSavedItems(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] });
      setSelectedIds(new Set());
      setSelectMode(false);
      setSelectedItem(null);
    },
  });

  // Toggle item selection
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Select all visible items
  const selectAll = useCallback(() => {
    const allIds = (data?.items || []).map(i => i.id);
    setSelectedIds(prev => {
      if (prev.size === allIds.length) return new Set(); // deselect all
      return new Set(allIds);
    });
  }, [data?.items]);

  // Exit select mode
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // Handle selection - mark as read
  const handleSelect = useCallback((item: SavedItem) => {
    setSelectedItem(item);
    if (!item.isRead) {
      markAsRead.mutate(item.id);
    }
  }, [markAsRead]);

  // Keyboard navigation
  useEffect(() => {
    const items = data?.items || [];
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in search
      if (e.target instanceof HTMLInputElement) return;
      
      switch (e.key) {
        case 'Escape':
          setSelectedItem(null);
          break;
        case '?':
          setShowHelp(true);
          break;
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          const currentIndex = selectedItem 
            ? items.findIndex(i => i.id === selectedItem.id) 
            : -1;
          if (currentIndex < items.length - 1) {
            handleSelect(items[currentIndex + 1]);
          }
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          const currentIndex = selectedItem 
            ? items.findIndex(i => i.id === selectedItem.id) 
            : items.length;
          if (currentIndex > 0) {
            handleSelect(items[currentIndex - 1]);
          }
          break;
        }
        case 'o':
        case 'Enter':
          if (selectedItem) {
            window.open(selectedItem.url, '_blank');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data?.items, selectedItem, handleSelect]);

  const items = data?.items || [];
  const total = data?.total || 0;

  // Keyboard shortcuts
  const shortcuts = [
    { key: 'j / ↓', description: t('page.saved.next') },
    { key: 'k / ↑', description: t('page.saved.prev') },
    { key: 'o / Enter', description: t('page.saved.openLink') },
    { key: 'Esc', description: t('page.saved.closeReader') },
  ];

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-red-500"
        >
          <AlertTriangle className="w-8 h-8 mx-auto mb-4" />
          <p>{t('discover.loadFailed')}</p>
        </motion.div>
      </div>
    );
  }

  // List header with search and filters
  const listHeader = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 space-y-3">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Inbox className="w-5 h-5 text-orange-500" /> {t('page.saved.title')}
          <span className="text-sm font-normal text-muted">({total})</span>
        </h1>
        {!selectMode ? (
          <button
            onClick={() => setSelectMode(true)}
            className="p-1.5 rounded-md text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors"
            title={t('page.saved.batchOps')}
          >
            <CheckSquare className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={exitSelectMode}
            className="p-1.5 rounded-md text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors"
            title={t('page.saved.exitSelect')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Batch action bar */}
      {selectMode && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 px-3 py-2 bg-[rgb(var(--bg-hover))] rounded-lg text-sm"
        >
          <button
            onClick={selectAll}
            className="text-xs text-[rgb(var(--accent))] hover:underline"
          >
            {selectedIds.size === items.length ? t('settings.opml.deselectAll') : t('settings.opml.selectAll')}
          </button>
          <span className="text-muted text-xs">
            {t('page.saved.selectedCount', { count: selectedIds.size })}
          </span>
          <div className="flex-1" />
          <button
            disabled={selectedIds.size === 0 || bulkDelete.isPending}
            onClick={async () => {
              if (selectedIds.size > 0) {
                const ok = await confirmDialog({ message: t('page.saved.deleteConfirm', { count: selectedIds.size }), variant: 'danger', confirmText: t('common.delete') });
                if (ok) bulkDelete.mutate(Array.from(selectedIds));
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            {bulkDelete.isPending ? t('page.saved.deleting') : t('settings.common.delete')}
          </button>
        </motion.div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder={t('page.saved.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 pl-9 text-sm bg-[rgb(var(--bg-secondary))] border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]/50"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 pl-0.5">
        {[
          { key: 'all', label: t('settings.filterRules.targetAll') },
          { key: 'unread', label: t('stats.unreadLabel') },
          { key: 'twitter', label: 'Twitter' },
          { key: 'extension', label: 'Clipper' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as FilterType)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === tab.key
                ? 'bg-orange-500 text-white'
                : 'text-[rgb(var(--text-secondary))] surface-elevated border border-default hover:bg-[rgb(var(--surface-hover))]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </motion.div>
  );

  // List content
  const listContent = (
    <SavedItemList
      items={items}
      selectedId={selectedItem?.id}
      onSelect={selectMode ? undefined : handleSelect}
      onDelete={async (item) => {
        const ok = await confirmDialog({ message: t('page.saved.confirmDelete'), variant: 'danger', confirmText: t('common.delete') });
        if (ok) deleteItem.mutate(item.id);
      }}
      isLoading={isLoading}
      selectMode={selectMode}
      selectedIds={selectedIds}
      onToggleSelect={toggleSelect}
    />
  );

  // Reader content
  const readerContent = (
    <AnimatePresence mode="wait">
      {selectedItem ? (
        <SavedItemReader 
          key={selectedItem.id} 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)}
          onDelete={() => deleteItem.mutate(selectedItem.id)}
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
            <Inbox className="w-16 h-16 mx-auto mb-4" />
            <p className="mb-2">{t('page.saved.selectToView')}</p>
            <p className="text-sm text-muted">
              {t('page.saved.viewShortcuts')}
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
        selectedEntryId={selectedItem?.id}
        onClearSelection={() => setSelectedItem(null)}
      />
      <KeyboardHelp 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
        shortcuts={shortcuts} 
      />
    </>
  );
}
