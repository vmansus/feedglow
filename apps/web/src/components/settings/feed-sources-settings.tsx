'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Trash2, ExternalLink, RefreshCw, Loader2, ToggleLeft, ToggleRight, Check, X, Activity, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@feedglow/ui';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import type { FeedSource } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function FeedSourcesSettings() {
  const confirmDialog = useConfirm();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', url: '', format: 'auto' as const });
  const [healthReport, setHealthReport] = useState<api.SourcesHealthReport | null>(null);
  const [showHealth, setShowHealth] = useState(false);

  // Fetch sources
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['feed-sources'],
    queryFn: api.getFeedSources,
  });

  // Health check mutation
  const healthMutation = useMutation({
    mutationFn: api.checkFeedSourcesHealth,
    onSuccess: (data) => {
      setHealthReport(data);
      setShowHealth(true);
      if (data.overall === 'unhealthy') {
        toast.error(t('settings.feedSources.someUnhealthy'));
      } else if (data.overall === 'degraded') {
        toast.error(t('settings.feedSources.degraded'));
      } else {
        toast.success(t('settings.feedSources.allHealthy'));
      }
    },
    onError: () => toast.error(t('settings.feedSources.healthFailed')),
  });

  // Add source mutation
  const addMutation = useMutation({
    mutationFn: api.addFeedSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-sources'] });
      setShowAddForm(false);
      setNewSource({ name: '', url: '', format: 'auto' });
      toast.success(t('settings.feedSources.sourceAdded'));
    },
    onError: () => toast.error(t('settings.feedSources.addFailed')),
  });

  // Update source mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { enabled?: boolean } }) => 
      api.updateFeedSource(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-sources'] });
    },
    onError: () => toast.error(t('settings.filterRules.updateFailed')),
  });

  // Delete source mutation
  const deleteMutation = useMutation({
    mutationFn: api.deleteFeedSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-sources'] });
      toast.success(t('settings.feedSources.sourceDeleted'));
    },
    onError: () => toast.error(t('settings.telegram.removeFailed')),
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: api.refreshFeedSources,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-sources'] });
      queryClient.invalidateQueries({ queryKey: ['external-feeds'] });
      toast.success(t('settings.feedSources.sourceRefreshed'));
    },
    onError: () => toast.error(t('settings.feedSources.refreshFailed')),
  });

  const handleToggle = (source: FeedSource) => {
    updateMutation.mutate({ id: source.id, updates: { enabled: !source.enabled } });
  };

  const handleAdd = () => {
    if (!newSource.name.trim() || !newSource.url.trim()) {
      toast.error(t('settings.feedSources.fillNameUrl'));
      return;
    }
    addMutation.mutate(newSource);
  };

  const handleDelete = async (source: FeedSource) => {
    const ok = await confirmDialog({ message: t('settings.feedSources.confirmDelete', { name: source.name }), variant: 'danger', confirmText: t('common.delete') }); if (ok) {
      deleteMutation.mutate(source.id);
    }
  };

  const formatLabel = (format: string) => {
    switch (format) {
      case 'opml': return 'OPML';
      case 'csv': return 'CSV';
      case 'json': return 'JSON';
      default: return t('settings.feedSources.autoDetect');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  const builtinSources = sources.filter(s => s.isBuiltin);
  const customSources = sources.filter(s => !s.isBuiltin);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold">{t('settings.feedSources.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => healthMutation.mutate()}
            disabled={healthMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-default hover:bg-[rgb(var(--bg-hover))] transition-colors"
          >
            <Activity className={cn("w-4 h-4", healthMutation.isPending && "animate-pulse")} />
            {t('settings.feedSources.healthCheck')}
          </button>
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-default hover:bg-[rgb(var(--bg-hover))] transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", refreshMutation.isPending && "animate-spin")} />
            {t('settings.feedSources.refresh')}
          </button>
        </div>
      </div>

      <p className="text-sm text-muted">
        {t('settings.feedSources.desc')}
      </p>

      {/* Health Report */}
      {showHealth && healthReport && (
        <div className={cn(
          "rounded-lg border p-4",
          healthReport.overall === 'healthy' 
            ? "border-green-500/30 bg-green-500/5" 
            : healthReport.overall === 'degraded'
              ? "border-yellow-500/30 bg-yellow-500/5"
              : "border-red-500/30 bg-red-500/5"
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {healthReport.overall === 'healthy' ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : healthReport.overall === 'degraded' ? (
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="font-medium">
                {healthReport.overall === 'healthy' ? t('settings.feedSources.allHealthy') : 
                 healthReport.overall === 'degraded' ? t('settings.feedSources.degraded') : t('settings.feedSources.unhealthy')}
              </span>
            </div>
            <button
              onClick={() => setShowHealth(false)}
              className="text-muted hover:text-[rgb(var(--text-primary))]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 text-sm">
            {healthReport.sources.map(source => (
              <div key={source.id} className="flex items-center justify-between py-1.5 border-b border-default/50 last:border-0">
                <div className="flex items-center gap-2">
                  {source.status === 'healthy' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span>{source.name}</span>
                </div>
                <div className="flex items-center gap-3 text-muted">
                  {source.feedCount !== undefined && (
                    <span>{source.feedCount} feeds</span>
                  )}
                  {source.responseTime !== undefined && (
                    <span>{source.responseTime}ms</span>
                  )}
                  {source.error && (
                    <span className="text-red-400 truncate max-w-[200px]" title={source.error}>
                      {source.error}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">
            {t('settings.feedSources.checkedAt')}{new Date(healthReport.checkedAt).toLocaleString()}
          </p>
        </div>
      )}

      {/* Builtin Sources */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted">{t('settings.feedSources.builtIn')}</h3>
        <div className="space-y-2">
          {builtinSources.map(source => (
            <SourceRow
              key={source.id}
              source={source}
              onToggle={handleToggle}
              formatLabel={formatLabel}
            />
          ))}
        </div>
      </div>

      {/* Custom Sources */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted">{t('settings.feedSources.custom')}</h3>
        {customSources.length === 0 && !showAddForm ? (
          <p className="text-sm text-muted py-4 text-center border border-dashed border-default rounded-lg">
            {t('settings.feedSources.noCustom')}
          </p>
        ) : (
          <div className="space-y-2">
            {customSources.map(source => (
              <SourceRow
                key={source.id}
                source={source}
                onToggle={handleToggle}
                onDelete={handleDelete}
                formatLabel={formatLabel}
              />
            ))}
          </div>
        )}

        {/* Add Form */}
        {showAddForm ? (
          <div className="p-4 rounded-lg border border-orange-500/30 bg-orange-500/5 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.newsletter.nameRequired')}</label>
              <input
                type="text"
                value={newSource.name}
                onChange={(e) => setNewSource(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('settings.feedSources.name')}
                className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">URL</label>
              <input
                type="url"
                value={newSource.url}
                onChange={(e) => setNewSource(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://github.com/.../feeds.opml"
                className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.feedSources.format')}</label>
              <select
                value={newSource.format}
                onChange={(e) => setNewSource(prev => ({ ...prev, format: e.target.value as any }))}
                className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm"
              >
                <option value="auto">{t('settings.feedSources.autoDetect')}</option>
                <option value="opml">OPML</option>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAdd}
                disabled={addMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm"
              >
                {addMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {t('action.add')}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewSource({ name: '', url: '', format: 'auto' });
                }}
                className="flex items-center gap-1.5 px-4 py-2 border border-default rounded-lg hover:bg-[rgb(var(--bg-hover))] text-sm"
              >
                <X className="w-4 h-4" />
                {t('settings.common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 border border-dashed border-default rounded-lg hover:border-orange-500/50 hover:text-orange-500 transition-colors text-sm w-full justify-center"
          >
            <Plus className="w-4 h-4" />
            {t('settings.feedSources.addSource')}
          </button>
        )}
      </div>

      <div className="text-xs text-muted pt-4 border-t border-default">
        <p>{t('settings.feedSources.supportedFormats')}</p>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li><strong>OPML</strong> - RSS/Atom feed list</li>
          <li><strong>CSV</strong> - title, siteUrl, feedUrl, tags columns</li>
          <li><strong>JSON</strong> - Array with title and feedUrl fields</li>
        </ul>
      </div>
    </div>
  );
}

function SourceRow({
  source,
  onToggle,
  onDelete,
  formatLabel,
}: {
  source: FeedSource;
  onToggle: (source: FeedSource) => void;
  onDelete?: (source: FeedSource) => void;
  formatLabel: (format: string) => string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
      source.enabled 
        ? "border-default bg-[rgb(var(--bg-elevated))]" 
        : "border-default/50 bg-[rgb(var(--bg-base))] opacity-60"
    )}>
      <button
        onClick={() => onToggle(source)}
        className="shrink-0"
      >
        {source.enabled ? (
          <ToggleRight className="w-6 h-6 text-orange-500" />
        ) : (
          <ToggleLeft className="w-6 h-6 text-muted" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{source.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[rgb(var(--bg-active))] text-muted">
            {formatLabel(source.format)}
          </span>
          {source.isBuiltin && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
              {t('settings.feedSources.builtInBadge')}
            </span>
          )}
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted hover:text-orange-500 truncate block mt-0.5"
        >
          {source.url}
        </a>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded hover:bg-[rgb(var(--bg-hover))] text-muted hover:text-[rgb(var(--text-primary))]"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        {onDelete && !source.isBuiltin && (
          <button
            onClick={() => onDelete(source)}
            className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
