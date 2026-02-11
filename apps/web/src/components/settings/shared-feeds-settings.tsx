'use client';

import { useState, useRef } from 'react';
import {
  useSharedFeeds,
  useCreateSharedFeed,
  useDeleteSharedFeed,
  useSharedFeedItems,
  useRemoveSharedFeedItem,
  getSharedFeedUrl,
  getSharedFeedPreviewUrl,
  type SharedFeed,
} from '@/hooks/use-shared-feeds';
import { Button } from '@feedglow/ui';
import {
  Rss,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  Loader2,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  X,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { OpmlExportModal } from './opml-export-modal';
import { t, getLocale } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function SharedFeedsSettings() {
  const confirmDialog = useConfirm();
  const { data: sharedFeeds = [], isLoading } = useSharedFeeds();
  const createMutation = useCreateSharedFeed();
  const deleteMutation = useDeleteSharedFeed();

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedFeed, setExpandedFeed] = useState<number | null>(null);
  const [showOpmlExport, setShowOpmlExport] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast.error(t('settings.sharedFeeds.enterTitle'));
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
      });
      toast.success(t('settings.sharedFeeds.created'));
      setShowCreate(false);
      setNewTitle('');
      setNewDescription('');
    } catch (err: any) {
      toast.error(err.message || t('settings.sharedFeeds.createFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirmDialog({ message: t('settings.sharedFeeds.confirmDelete'), variant: 'danger', confirmText: t('common.delete') }); if (!ok) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success(t('settings.sharedFeeds.deleted'));
    } catch {
      toast.error(t('settings.telegram.removeFailed'));
    }
  };

  const handleCopy = async (feed: SharedFeed) => {
    const code = feed.shareCode || feed.share_code || '';
    const url = getSharedFeedUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(feed.id);
      toast.success(t('settings.sharedFeeds.copied'));
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error(t('settings.sharedFeeds.copyFailed'));
    }
  };

  const handleImportOpml = async (file: File) => {
    setImporting(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
      const { getAuthHeader } = await import('@/lib/auth');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/api/opml/import`, {
        method: 'POST',
        headers: { ...getAuthHeader() },
        body: formData,
      });
      if (!res.ok) throw new Error(t('settings.sharedFeeds.importFailed'));
      const data = await res.json();
      toast.success(data.failed ? t('settings.sharedFeeds.importResultWithFail', { imported: data.imported, failed: data.failed }) : t('settings.sharedFeeds.importResult', { imported: data.imported }));
    } catch {
      toast.error(t('settings.sharedFeeds.importFailed'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Rss className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold">{t('settings.sharedFeeds.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportOpml(file);
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t('settings.sharedFeeds.importOpml')}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowOpmlExport(true)}
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t('settings.sharedFeeds.exportOpml')}
          </Button>
          <Button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('settings.sharedFeeds.newCollection')}
          </Button>
        </div>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
        {t('settings.sharedFeeds.desc1')}
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        {t('settings.sharedFeeds.desc2')}
      </p>

      {/* Create Form */}
      {showCreate && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('settings.sharedFeeds.collectionName')}</label>
            <input
              type="text"
              placeholder={t('settings.sharedFeeds.collectionNamePlaceholder')}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('settings.sharedFeeds.descriptionOptional')}</label>
            <input
              type="text"
              placeholder={t('settings.sharedFeeds.descriptionPlaceholder')}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {t('settings.common.create')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
            >
              {t('settings.common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Shared Feeds List */}
      {sharedFeeds.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          {t('settings.sharedFeeds.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {sharedFeeds.map((feed) => (
            <SharedFeedCard
              key={feed.id}
              feed={feed}
              copiedId={copiedId}
              expanded={expandedFeed === feed.id}
              onToggleExpand={() => setExpandedFeed(expandedFeed === feed.id ? null : feed.id)}
              onCopy={() => handleCopy(feed)}
              onDelete={() => handleDelete(feed.id)}
              deletePending={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      <OpmlExportModal open={showOpmlExport} onClose={() => setShowOpmlExport(false)} />
    </div>
  );
}

function SharedFeedCard({
  feed,
  copiedId,
  expanded,
  onToggleExpand,
  onCopy,
  onDelete,
  deletePending,
}: {
  feed: SharedFeed;
  copiedId: number | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onCopy: () => void;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const code = feed.shareCode || feed.share_code || '';
  const feedUrl = getSharedFeedUrl(code);
  const previewUrl = getSharedFeedPreviewUrl(code);
  const itemCount = feed.item_count ?? 0;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={onToggleExpand}
                className="flex items-center gap-1 hover:text-orange-500 transition-colors"
              >
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <h3 className="font-medium truncate">{feed.title}</h3>
              </button>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">
                <FileText className="w-3 h-3" />
                {t('settings.sharedFeeds.articlesCount', { count: itemCount })}
              </span>
            </div>
            {feed.description && (
              <p className="text-sm text-zinc-500 mb-2 ml-5">{feed.description}</p>
            )}
            <div className="text-xs text-zinc-400 font-mono break-all ml-5">
              {feedUrl}
            </div>
          </div>

          <div className="flex items-center gap-1 ml-4 shrink-0">
            <button
              onClick={onCopy}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={t('settings.sharedFeeds.copyFeedUrl')}
            >
              {copiedId === feed.id ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 text-zinc-500" />
              )}
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={t('settings.sharedFeeds.preview')}
            >
              <ExternalLink className="w-4 h-4 text-zinc-500" />
            </a>
            <button
              onClick={onDelete}
              disabled={deletePending}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title={t('settings.common.delete')}
            >
              {deletePending ? (
                <Loader2 className="w-4 h-4 animate-spin text-red-500" />
              ) : (
                <Trash2 className="w-4 h-4 text-red-500" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded: show items */}
      {expanded && <SharedFeedItemsList sharedFeedId={feed.id} />}
    </div>
  );
}

function SharedFeedItemsList({ sharedFeedId }: { sharedFeedId: number }) {
  const { data: items = [], isLoading } = useSharedFeedItems(sharedFeedId);
  const removeMutation = useRemoveSharedFeedItem();

  const handleRemove = async (entryId: number) => {
    try {
      await removeMutation.mutateAsync({ sharedFeedId, entryId: String(entryId) });
      toast.success(t('settings.sharedFeeds.removed'));
    } catch {
      toast.error(t('settings.sharedFeeds.removeFailed'));
    }
  };

  if (isLoading) {
    return (
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 flex justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 text-center text-sm text-zinc-400">
        {t('settings.sharedFeeds.noItems')}
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
      {items.map((item) => (
        <div key={item.id} className="px-4 py-2.5 flex items-center gap-3 group">
          <div className="flex-1 min-w-0">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:text-orange-500 truncate block"
            >
              {item.title || item.url}
            </a>
            <div className="text-xs text-zinc-400 flex items-center gap-2">
              {item.feed_title && <span>{item.feed_title}</span>}
              {item.added_at && <span>{new Date(item.added_at).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US')}</span>}
            </div>
          </div>
          <button
            onClick={() => handleRemove(item.entry_id)}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
            title={t('settings.sharedFeeds.remove')}
          >
            <X className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      ))}
    </div>
  );
}
