'use client';

import { useState, useRef, useEffect } from 'react';
import { FolderPlus, Check, Loader2, Plus } from 'lucide-react';
import { cn } from '@feedglow/ui';
import {
  useSharedFeeds,
  useEntrySharedFeeds,
  useAddSharedFeedItem,
  useRemoveSharedFeedItem,
  useCreateSharedFeed,
} from '@/hooks/use-shared-feeds';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';

interface AddToCollectionProps {
  entryId: string;
}

export function AddToCollection({ entryId }: AddToCollectionProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: feeds = [] } = useSharedFeeds();
  const { data: entryFeeds = [], isLoading } = useEntrySharedFeeds(open ? entryId : null);
  const addItem = useAddSharedFeedItem();
  const removeItem = useRemoveSharedFeedItem();
  const createFeed = useCreateSharedFeed();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  const handleToggle = async (feedId: number, hasItem: boolean) => {
    try {
      if (hasItem) {
        await removeItem.mutateAsync({ sharedFeedId: feedId, entryId });
        toast.success(t('entry.collection.removed'));
      } else {
        await addItem.mutateAsync({ sharedFeedId: feedId, entryId });
        toast.success(t('entry.collection.added'));
      }
    } catch {
      toast.error(hasItem ? t('entry.collection.removeFailed') : t('entry.collection.addFailed'));
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const feed = await createFeed.mutateAsync({ title: newName.trim() });
      setNewName('');
      setCreating(false);
      // Auto-add current article
      await addItem.mutateAsync({ sharedFeedId: feed.id, entryId });
      toast.success(t('entry.collection.createdAndAdded', { name: feed.title }));
    } catch {
      toast.error(t('entry.collection.createFailed'));
    }
  };

  // Merge feeds list with entry membership info
  const feedsWithStatus = feeds.map(f => ({
    ...f,
    has_item: entryFeeds.find(ef => ef.id === f.id)?.has_item ?? false,
  }));

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "p-2 rounded-lg transition-colors",
          open
            ? "text-orange-500 bg-orange-500/10"
            : "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
        )}
        title={t('entry.collection.addTo')}
      >
        <FolderPlus className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] py-1 rounded-lg border border-default surface-elevated shadow-xl">
          <div className="px-3 py-1.5 text-xs text-muted border-b border-default mb-1">
            {t('entry.collection.addTo')}
          </div>

          {isLoading ? (
            <div className="px-3 py-3 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            </div>
          ) : feedsWithStatus.length === 0 && !creating ? (
            <div className="px-3 py-2 text-sm text-zinc-400">
              {t('entry.collection.empty')}
            </div>
          ) : (
            feedsWithStatus.map(feed => (
              <button
                key={feed.id}
                onClick={() => handleToggle(feed.id, feed.has_item)}
                disabled={addItem.isPending || removeItem.isPending}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:bg-[rgb(var(--bg-hover))] transition-colors disabled:opacity-50"
              >
                <span className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center flex-none",
                  feed.has_item
                    ? "bg-orange-500 border-orange-500"
                    : "border-zinc-300 dark:border-zinc-600"
                )}>
                  {feed.has_item && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="truncate">{feed.title}</span>
                {feed.item_count != null && (
                  <span className="text-xs text-zinc-400 ml-auto">{feed.item_count}</span>
                )}
              </button>
            ))
          )}

          {/* Quick create */}
          <div className="border-t border-default mt-1 pt-1">
            {creating ? (
              <div className="px-3 py-2 flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                  }}
                  placeholder={t('entry.collection.namePlaceholder')}
                  className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-600 bg-transparent focus:ring-1 focus:ring-orange-500 focus:outline-none"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createFeed.isPending}
                  className="px-2 py-1 text-xs rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {createFeed.isPending ? '...' : t('entry.collection.create')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-500 hover:bg-[rgb(var(--bg-hover))] transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('entry.collection.new')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
