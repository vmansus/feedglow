'use client';

import { useState, useMemo } from 'react';
import { X, Download, Loader2, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@feedglow/ui';
import { useCategories } from '@/hooks/use-categories';
import { useFeeds } from '@/hooks/use-feeds';
import type { Category, Feed } from '@feedglow/shared';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';

interface OpmlExportModalProps {
  open: boolean;
  onClose: () => void;
}

export function OpmlExportModal({ open, onClose }: OpmlExportModalProps) {
  const { categories = [] } = useCategories();
  const { feeds = [] } = useFeeds();
  const [selectedFeedIds, setSelectedFeedIds] = useState<Set<number>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

  // Build tree
  const tree = useMemo(() => {
    const catMap = new Map<number, { cat: Category; children: Category[]; feeds: Feed[] }>();
    for (const cat of categories) {
      catMap.set(cat.id, { cat, children: [], feeds: [] });
    }
    const roots: typeof catMap extends Map<any, infer V> ? V[] : never = [];

    for (const cat of categories) {
      const node = catMap.get(cat.id)!;
      if (cat.parent_id && catMap.has(cat.parent_id)) {
        catMap.get(cat.parent_id)!.children.push(cat);
      } else {
        roots.push(node);
      }
    }

    for (const feed of feeds) {
      if (feed.categoryId && catMap.has(feed.categoryId)) {
        catMap.get(feed.categoryId)!.feeds.push(feed);
      }
    }

    // Uncategorized feeds
    const uncategorized = feeds.filter(f => !f.categoryId || !catMap.has(f.categoryId));

    return { roots, catMap, uncategorized };
  }, [categories, feeds]);

  const allFeedIds = useMemo(() => new Set(feeds.map(f => f.id)), [feeds]);

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedFeedIds(new Set());
    } else {
      setSelectedFeedIds(new Set(allFeedIds));
    }
    setSelectAll(!selectAll);
  };

  const toggleCategory = (catId: number) => {
    const catFeeds = getCategoryFeedIds(catId);
    const allSelected = catFeeds.every(id => selectedFeedIds.has(id));
    const next = new Set(selectedFeedIds);
    for (const id of catFeeds) {
      if (allSelected) next.delete(id); else next.add(id);
    }
    setSelectedFeedIds(next);
  };

  const getCategoryFeedIds = (catId: number): number[] => {
    const node = tree.catMap.get(catId);
    if (!node) return [];
    const ids = node.feeds.map(f => f.id);
    for (const child of node.children) {
      ids.push(...getCategoryFeedIds(child.id));
    }
    return ids;
  };

  const toggleFeed = (feedId: number) => {
    const next = new Set(selectedFeedIds);
    if (next.has(feedId)) next.delete(feedId); else next.add(feedId);
    setSelectedFeedIds(next);
  };

  const toggleExpand = (catId: number) => {
    const next = new Set(expandedCats);
    if (next.has(catId)) next.delete(catId); else next.add(catId);
    setExpandedCats(next);
  };

  const handleExport = async () => {
    if (selectedFeedIds.size === 0) {
      toast.error(t('settings.opml.selectAtLeastOne'));
      return;
    }
    setExporting(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
      const { getAuthHeader } = await import('@/lib/auth');
      const idsParam = Array.from(selectedFeedIds).join(',');
      const res = await fetch(`${API_BASE}/api/opml/export?feedIds=${idsParam}`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error(t('settings.opml.exportFailed'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'feedglow-subscriptions.opml';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('settings.opml.exported', { count: selectedFeedIds.size }));
      onClose();
    } catch {
      toast.error(t('settings.opml.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  const renderCategory = (catId: number, depth: number = 0) => {
    const node = tree.catMap.get(catId);
    if (!node) return null;
    const catFeedIds = getCategoryFeedIds(catId);
    const selectedCount = catFeedIds.filter(id => selectedFeedIds.has(id)).length;
    const allSelected = catFeedIds.length > 0 && selectedCount === catFeedIds.length;
    const someSelected = selectedCount > 0 && !allSelected;
    const expanded = expandedCats.has(catId);

    return (
      <div key={catId}>
        <div
          className="flex items-center gap-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded px-2 cursor-pointer"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <button onClick={() => toggleExpand(catId)} className="p-0.5">
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
          </button>
          <button
            onClick={() => toggleCategory(catId)}
            className={`w-4 h-4 rounded border flex items-center justify-center flex-none ${
              allSelected ? 'bg-orange-500 border-orange-500' : someSelected ? 'bg-orange-200 border-orange-400' : 'border-zinc-300 dark:border-zinc-600'
            }`}
          >
            {allSelected && <Check className="w-3 h-3 text-white" />}
            {someSelected && <div className="w-2 h-0.5 bg-orange-500 rounded" />}
          </button>
          <span className="text-sm font-medium truncate" onClick={() => toggleExpand(catId)}>
            {node.cat.title}
          </span>
          <span className="text-xs text-zinc-400 ml-auto">
            {selectedCount}/{catFeedIds.length}
          </span>
        </div>
        {expanded && (
          <>
            {node.feeds.map(feed => (
              <div
                key={feed.id}
                className="flex items-center gap-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded px-2 cursor-pointer"
                style={{ paddingLeft: `${(depth + 1) * 20 + 28}px` }}
                onClick={() => toggleFeed(feed.id)}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-none ${
                  selectedFeedIds.has(feed.id) ? 'bg-orange-500 border-orange-500' : 'border-zinc-300 dark:border-zinc-600'
                }`}>
                  {selectedFeedIds.has(feed.id) && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="text-sm truncate text-zinc-600 dark:text-zinc-300">{feed.title}</span>
              </div>
            ))}
            {node.children.map(child => renderCategory(child.id, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-lg font-semibold">{t('settings.sharedFeeds.exportOpml')}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Select all */}
        <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <button onClick={handleSelectAll} className="flex items-center gap-2 text-sm text-orange-500 hover:text-orange-600">
            {selectAll ? t('settings.opml.deselectAll') : t('settings.opml.selectAll')}
          </button>
          <span className="text-xs text-zinc-400">{t('settings.opml.feedCount', { selected: selectedFeedIds.size, total: feeds.length })}</span>
        </div>

        {/* Feed tree */}
        <div className="flex-1 overflow-y-auto p-2">
          {tree.roots.map(node => renderCategory(node.cat.id))}
          {tree.uncategorized.length > 0 && (
            <div>
              <div className="text-xs text-zinc-400 px-2 py-1 mt-2">{t('settings.opml.uncategorized')}</div>
              {tree.uncategorized.map(feed => (
                <div
                  key={feed.id}
                  className="flex items-center gap-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded px-2 pl-7 cursor-pointer"
                  onClick={() => toggleFeed(feed.id)}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-none ${
                    selectedFeedIds.has(feed.id) ? 'bg-orange-500 border-orange-500' : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {selectedFeedIds.has(feed.id) && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="text-sm truncate text-zinc-600 dark:text-zinc-300">{feed.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>{t('settings.common.cancel')}</Button>
          <Button onClick={handleExport} disabled={exporting || selectedFeedIds.size === 0} className="flex items-center gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {t('settings.export.exportData')} ({selectedFeedIds.size})
          </Button>
        </div>
      </div>
    </div>
  );
}
