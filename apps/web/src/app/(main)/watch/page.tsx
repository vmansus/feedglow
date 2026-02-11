'use client';

import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Eye,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  Globe,
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { DiffViewer } from '@/components/watch/diff-viewer';
import {
  getWatchedPages,
  createWatchedPage,
  updateWatchedPage,
  deleteWatchedPage,
  triggerPageCheck,
  getPageChanges,
  type WatchedPage,
  type PageChange,
} from '@/lib/watch-api';
import { Pencil, Save, X } from 'lucide-react';

export default function WatchPage() {
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const [selectedPage, setSelectedPage] = useState<WatchedPage | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSelector, setNewSelector] = useState('');
  const [newInterval, setNewInterval] = useState(60);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSelector, setEditSelector] = useState('');
  const [editInterval, setEditInterval] = useState(60);

  // Fetch watched pages
  const { data, isLoading } = useQuery({
    queryKey: ['watched-pages'],
    queryFn: getWatchedPages,
  });

  // Fetch changes for selected page
  const { data: changesData, isLoading: changesLoading } = useQuery({
    queryKey: ['page-changes', selectedPage?.id],
    queryFn: () => (selectedPage ? getPageChanges(selectedPage.id) : null),
    enabled: !!selectedPage,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createWatchedPage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watched-pages'] });
      setShowAddForm(false);
      setNewUrl('');
      setNewTitle('');
      setNewSelector('');
      setNewInterval(60);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteWatchedPage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watched-pages'] });
      setSelectedPage(null);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, ...input }: { id: number; title?: string; cssSelector?: string | null; checkIntervalMinutes?: number }) =>
      updateWatchedPage(id, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['watched-pages'] });
      setSelectedPage(updated);
      setEditing(false);
    },
  });

  // Check now mutation
  const checkMutation = useMutation({
    mutationFn: triggerPageCheck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watched-pages'] });
      if (selectedPage) {
        queryClient.invalidateQueries({ queryKey: ['page-changes', selectedPage.id] });
      }
    },
  });

  const handleCreate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newUrl.trim()) return;
      createMutation.mutate({
        url: newUrl.trim(),
        title: newTitle.trim() || undefined,
        cssSelector: newSelector.trim() || undefined,
        checkIntervalMinutes: newInterval,
      });
    },
    [newUrl, newTitle, newSelector, newInterval, createMutation]
  );

  const pages = data?.items || [];

  // Detail view for a single page
  if (selectedPage) {
    return (
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto">
        <button
          onClick={() => setSelectedPage(null)}
          className="flex items-center gap-2 text-sm text-muted hover:text-primary mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('watch.backToList')}
        </button>

        {editing ? (
          /* Edit mode */
          <div className="mb-6 p-4 rounded-lg border border-[rgb(var(--border-default))] space-y-3">
            <div>
              <label className="text-xs text-muted block mb-1">{t('watch.labelTitle')}</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={selectedPage.url}
                className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border-default))] bg-[rgb(var(--bg-card))] text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">{t('watch.cssSelector')}</label>
              <input
                type="text"
                value={editSelector}
                onChange={(e) => setEditSelector(e.target.value)}
                placeholder={t('watch.cssSelectorPlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border-default))] bg-[rgb(var(--bg-card))] text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">{t('watch.checkInterval')}</label>
              <select
                value={editInterval}
                onChange={(e) => setEditInterval(parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border-default))] bg-[rgb(var(--bg-card))] text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value={15}>{t('watch.every15min')}</option>
                <option value={30}>{t('watch.every30min')}</option>
                <option value={60}>{t('watch.every1h')}</option>
                <option value={120}>{t('watch.every2h')}</option>
                <option value={360}>{t('watch.every6h')}</option>
                <option value={720}>{t('watch.every12h')}</option>
                <option value={1440}>{t('watch.every24h')}</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => updateMutation.mutate({
                  id: selectedPage.id,
                  title: editTitle.trim() || undefined,
                  cssSelector: editSelector.trim() || null,
                  checkIntervalMinutes: editInterval,
                })}
                disabled={updateMutation.isPending}
                className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('watch.save')}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-sm bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-secondary))] rounded-lg hover:bg-[rgb(var(--bg-elevated))] transition-colors flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                {t('action.cancel')}
              </button>
            </div>
          </div>
        ) : (
          /* View mode */
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-primary">
                {selectedPage.title || selectedPage.url}
              </h1>
              <a
                href={selectedPage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted hover:text-accent flex items-center gap-1 mt-1"
              >
                {selectedPage.url}
                <ExternalLink className="w-3 h-3" />
              </a>
              {selectedPage.cssSelector && (
                <p className="text-xs text-muted mt-1">
                  {t('watch.cssSelector')}: <code className="bg-[rgb(var(--bg-hover))] px-1 rounded">{selectedPage.cssSelector}</code>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setEditTitle(selectedPage.title || '');
                  setEditSelector(selectedPage.cssSelector || '');
                  setEditInterval(selectedPage.checkIntervalMinutes || 60);
                  setEditing(true);
                }}
                className="px-3 py-1.5 text-sm bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-secondary))] rounded-lg hover:bg-[rgb(var(--bg-elevated))] transition-colors flex items-center gap-1.5"
              >
                <Pencil className="w-4 h-4" />
                {t('watch.edit')}
              </button>
              <button
                onClick={() => checkMutation.mutate(selectedPage.id)}
                disabled={checkMutation.isPending}
                className="px-3 py-1.5 text-sm bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {checkMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {t('watch.checkNow')}
              </button>
              <button
                onClick={async () => {
                  const ok = await confirmDialog({ message: t('watch.confirmStop'), variant: 'danger', confirmText: t('common.delete') });
                  if (ok) {
                    deleteMutation.mutate(selectedPage.id);
                  }
                }}
                className="px-3 py-1.5 text-sm bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                {t('watch.stopWatch')}
              </button>
            </div>
          </div>
        )}

        {/* Status info */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-3 rounded-lg bg-[rgb(var(--bg-hover))]">
            <p className="text-xs text-muted">{t('watch.checkInterval')}</p>
            <p className="text-sm font-medium text-primary">{t('watch.intervalMinutes', { n: selectedPage.checkIntervalMinutes })}</p>
          </div>
          <div className="p-3 rounded-lg bg-[rgb(var(--bg-hover))]">
            <p className="text-xs text-muted">{t('watch.lastChecked')}</p>
            <p className="text-sm font-medium text-primary">
              {selectedPage.lastCheckedAt
                ? new Date(selectedPage.lastCheckedAt).toLocaleString()
                : t('watch.notCheckedYet')}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[rgb(var(--bg-hover))]">
            <p className="text-xs text-muted">{t('watch.lastChanged')}</p>
            <p className="text-sm font-medium text-primary">
              {selectedPage.lastChangedAt
                ? new Date(selectedPage.lastChangedAt).toLocaleString()
                : t('watch.noChanges')}
            </p>
          </div>
        </div>

        {checkMutation.isSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {checkMutation.data?.changed ? t('watch.changeDetected') : t('watch.noChange')}
          </div>
        )}

        {checkMutation.isError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {t('watch.checkFailed', { error: checkMutation.error instanceof Error ? checkMutation.error.message : t('watch.unknownError') })}
          </div>
        )}

        {/* Changes list */}
        <h2 className="text-lg font-semibold text-primary mb-4">{t('watch.changeHistory')}</h2>

        {changesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted" />
          </div>
        ) : changesData?.items && changesData.items.length > 0 ? (
          <div className="space-y-4">
            {changesData.items.map((change: PageChange) => (
              <DiffViewer
                key={change.id}
                diffHtml={change.diffHtml || ''}
                detectedAt={change.detectedAt}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('watch.noChangeRecords')}</p>
            <p className="text-xs mt-1">{t('watch.changeWillShowHere')}</p>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Eye className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-bold text-primary">{t('watch.title')}</h1>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('watch.addWatch')}
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate}
            className="mb-6 p-4 rounded-lg border border-default bg-[rgb(var(--bg-hover))] space-y-3 overflow-hidden"
          >
            <div>
              <label className="text-xs text-muted block mb-1">{t('watch.pageUrl')}</label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/page"
                className="w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">{t('watch.titleOptional')}</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t('watch.titlePlaceholder')}
                className="w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted block mb-1">{t('watch.cssSelector')}</label>
                <input
                  type="text"
                  value={newSelector}
                  onChange={(e) => setNewSelector(e.target.value)}
                  placeholder={t('watch.cssSelectorExample')}
                  className="w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">{t('watch.intervalLabel')}</label>
                <select
                  value={newInterval}
                  onChange={(e) => setNewInterval(parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value={15}>{t('watch.every15min')}</option>
                  <option value={30}>{t('watch.every30min')}</option>
                  <option value={60}>{t('watch.every1h')}</option>
                  <option value={120}>{t('watch.every2h')}</option>
                  <option value={360}>{t('watch.every6h')}</option>
                  <option value={720}>{t('watch.every12h')}</option>
                  <option value={1440}>{t('watch.every24h')}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-sm text-muted hover:text-primary transition-colors"
              >
                {t('action.cancel')}
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !newUrl.trim()}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('watch.startWatch')}
              </button>
            </div>
            {createMutation.isError && (
              <p className="text-red-400 text-xs">
                {createMutation.error instanceof Error ? createMutation.error.message : t('watch.addFailed')}
              </p>
            )}
          </motion.form>
        )}
      </AnimatePresence>

      {/* Pages list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : pages.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">{t('watch.noWatchedPages')}</p>
          <p className="text-sm mt-1">{t('watch.addPageHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((page: WatchedPage) => (
            <motion.div
              key={page.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-lg border border-default hover:border-accent/30 bg-[rgb(var(--bg-base))] hover:bg-[rgb(var(--bg-hover))] transition-all cursor-pointer group"
              onClick={() => setSelectedPage(page)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-primary truncate">
                    {page.title || page.url}
                  </h3>
                  <p className="text-xs text-muted truncate mt-0.5">{page.url}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t('watch.everyNMinutes', { n: page.checkIntervalMinutes })}
                    </span>
                    {page.lastCheckedAt && (
                      <span>
                        {t('watch.lastChecked')}: {new Date(page.lastCheckedAt).toLocaleString()}
                      </span>
                    )}
                    {page.lastChangedAt && (
                      <span className="text-amber-400">
                        {t('watch.lastChanged')}: {new Date(page.lastChangedAt).toLocaleString()}
                      </span>
                    )}
                    {page.changeCount > 0 && (
                      <span className="text-accent">{t('watch.changeCount', { count: page.changeCount })}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      checkMutation.mutate(page.id);
                    }}
                    className="p-1.5 rounded-md hover:bg-accent/10 text-muted hover:text-accent transition-colors"
                    title={t('watch.checkNow')}
                  >
                    <RefreshCw className={`w-4 h-4 ${checkMutation.isPending ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirmDialog({ message: t('watch.confirmStop'), variant: 'danger', confirmText: t('common.delete') });
                      if (ok) {
                        deleteMutation.mutate(page.id);
                      }
                    }}
                    className="p-1.5 rounded-md hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                    title={t('watch.stopWatch')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
