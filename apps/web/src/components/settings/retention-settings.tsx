'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, Save, Info } from 'lucide-react';
import { cn } from '@feedglow/ui';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import { useFeeds } from '@/hooks/use-feeds';
import { t } from '@/lib/i18n';

interface RetentionPolicy {
  feedId: number; // 0 for global default
  keepDays: number;
  keepUnread: boolean;
  keepStarred: boolean;
  maxEntries: number;
}

export function RetentionSettings() {
  const queryClient = useQueryClient();
  const { feeds = [] } = useFeeds();
  
  const [globalPolicy, setGlobalPolicy] = useState<RetentionPolicy>({
    feedId: 0,
    keepDays: 90,
    keepUnread: true,
    keepStarred: true,
    maxEntries: 1000,
  });
  
  const [feedOverrides, setFeedOverrides] = useState<Map<number, RetentionPolicy>>(new Map());
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch retention policies
  const { data: policies, isLoading } = useQuery({
    queryKey: ['retention-policies'],
    queryFn: api.getRetentionPolicies,
  });

  // Load policies into state
  useEffect(() => {
    if (!policies) return;
    
    const global = policies.find((p: RetentionPolicy) => p.feedId === 0);
    if (global) {
      setGlobalPolicy(global);
    }
    
    const overrides = new Map<number, RetentionPolicy>();
    policies.filter((p: RetentionPolicy) => p.feedId > 0).forEach((p: RetentionPolicy) => {
      overrides.set(p.feedId, p);
    });
    setFeedOverrides(overrides);
  }, [policies]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (policy: RetentionPolicy) => 
      policy.feedId === 0 
        ? api.updateRetentionPolicy(policy) 
        : api.updateFeedRetentionPolicy(policy.feedId, policy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retention-policies'] });
      toast.success(t('settings.retention.saved'));
    },
    onError: () => toast.error(t('settings.common.saveFailed')),
  });

  const handleSaveGlobal = async () => {
    setIsSaving(true);
    try {
      await saveMutation.mutateAsync(globalPolicy);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFeed = async (feedId: number) => {
    const policy = feedOverrides.get(feedId);
    if (!policy) return;
    
    setIsSaving(true);
    try {
      await saveMutation.mutateAsync(policy);
    } finally {
      setIsSaving(false);
    }
  };

  const updateFeedPolicy = (feedId: number, updates: Partial<RetentionPolicy>) => {
    const current = feedOverrides.get(feedId) || {
      feedId,
      keepDays: globalPolicy.keepDays,
      keepUnread: globalPolicy.keepUnread,
      keepStarred: globalPolicy.keepStarred,
      maxEntries: globalPolicy.maxEntries,
    };
    
    setFeedOverrides(prev => {
      const next = new Map(prev);
      next.set(feedId, { ...current, ...updates });
      return next;
    });
  };

  const removeFeedOverride = (feedId: number) => {
    setFeedOverrides(prev => {
      const next = new Map(prev);
      next.delete(feedId);
      return next;
    });
    setSelectedFeedId(null);
    // TODO: API call to remove override
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Clock className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold">{t('settings.retention.title')}</h2>
      </div>

      {/* Info */}
      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-400">
          <p>{t('settings.retention.infoLine1')}</p>
          <p className="mt-1">{t('settings.retention.infoLine2')}</p>
        </div>
      </div>

      {/* Global Policy */}
      <div className="rounded-lg border border-default overflow-hidden">
        <div className="px-4 py-3 bg-[rgb(var(--bg-hover))] border-b border-default">
          <h3 className="font-medium">{t('settings.retention.globalPolicy')}</h3>
          <p className="text-xs text-muted mt-0.5">{t('settings.retention.globalPolicyDesc')}</p>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Keep days */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('settings.retention.keepDays')}</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={7}
                max={365}
                step={7}
                value={globalPolicy.keepDays}
                onChange={(e) => setGlobalPolicy(prev => ({ ...prev, keepDays: Number(e.target.value) }))}
                className="flex-1"
              />
              <span className="text-sm font-mono w-24 text-right">{t('settings.retention.daysLabel', { n: globalPolicy.keepDays })}</span>
            </div>
          </div>

          {/* Max entries */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('settings.retention.maxEntries')}</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={100}
                max={10000}
                step={100}
                value={globalPolicy.maxEntries}
                onChange={(e) => setGlobalPolicy(prev => ({ ...prev, maxEntries: Number(e.target.value) }))}
                className="flex-1"
              />
              <span className="text-sm font-mono w-24 text-right">{globalPolicy.maxEntries}</span>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('settings.retention.keepUnread')}</div>
              <div className="text-xs text-muted">{t('settings.retention.keepUnreadDesc')}</div>
            </div>
            <button
              onClick={() => setGlobalPolicy(prev => ({ ...prev, keepUnread: !prev.keepUnread }))}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                globalPolicy.keepUnread ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
              )}
            >
              <span className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                globalPolicy.keepUnread ? 'left-6' : 'left-1'
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('settings.retention.keepStarred')}</div>
              <div className="text-xs text-muted">{t('settings.retention.keepStarredDesc')}</div>
            </div>
            <button
              onClick={() => setGlobalPolicy(prev => ({ ...prev, keepStarred: !prev.keepStarred }))}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                globalPolicy.keepStarred ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
              )}
            >
              <span className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                globalPolicy.keepStarred ? 'left-6' : 'left-1'
              )} />
            </button>
          </div>

          {/* Save button */}
          <button
            onClick={handleSaveGlobal}
            disabled={isSaving}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('settings.retention.saveGlobal')}
          </button>
        </div>
      </div>

      {/* Per-feed Override */}
      <div className="rounded-lg border border-default overflow-hidden">
        <div className="px-4 py-3 bg-[rgb(var(--bg-hover))] border-b border-default">
          <h3 className="font-medium">{t('settings.retention.feedPolicy')}</h3>
          <p className="text-xs text-muted mt-0.5">{t('settings.retention.feedPolicyDesc')}</p>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Feed selector */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('settings.retention.selectFeed')}</label>
            <select
              value={selectedFeedId || ''}
              onChange={(e) => setSelectedFeedId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-[rgb(var(--text-primary))]"
            >
              <option value="">{t('settings.retention.selectFeedPlaceholder')}</option>
              {feeds.map(feed => (
                <option key={feed.id} value={feed.id}>
                  {feed.title}
                  {feedOverrides.has(feed.id) && ' ✓'}
                </option>
              ))}
            </select>
          </div>

          {/* Feed policy form */}
          {selectedFeedId && (
            <div className="space-y-4 p-4 rounded-lg bg-[rgb(var(--bg-base))]">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">
                  {feeds.find(f => f.id === selectedFeedId)?.title}
                </h4>
                {feedOverrides.has(selectedFeedId) && (
                  <button
                    onClick={() => removeFeedOverride(selectedFeedId)}
                    className="text-xs text-red-500 hover:text-red-400"
                  >
                    {t('settings.retention.removeOverride')}
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm mb-2">{t('settings.retention.keepDays')}</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={7}
                    max={365}
                    step={7}
                    value={feedOverrides.get(selectedFeedId)?.keepDays || globalPolicy.keepDays}
                    onChange={(e) => updateFeedPolicy(selectedFeedId, { keepDays: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono w-20 text-right">
                    {t('settings.retention.daysLabel', { n: feedOverrides.get(selectedFeedId)?.keepDays || globalPolicy.keepDays })}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2">{t('settings.retention.maxEntries')}</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={100}
                    max={10000}
                    step={100}
                    value={feedOverrides.get(selectedFeedId)?.maxEntries || globalPolicy.maxEntries}
                    onChange={(e) => updateFeedPolicy(selectedFeedId, { maxEntries: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono w-20 text-right">
                    {feedOverrides.get(selectedFeedId)?.maxEntries || globalPolicy.maxEntries}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleSaveFeed(selectedFeedId)}
                disabled={isSaving}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2 text-sm"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('settings.retention.saveFeedPolicy')}
              </button>
            </div>
          )}

          {/* List of overridden feeds */}
          {feedOverrides.size > 0 && (
            <div className="pt-4 border-t border-default">
              <h4 className="text-sm font-medium mb-2">{t('settings.retention.overriddenFeeds')}</h4>
              <div className="space-y-1">
                {Array.from(feedOverrides.entries()).map(([feedId, policy]) => {
                  const feed = feeds.find(f => f.id === feedId);
                  return (
                    <div 
                      key={feedId}
                      className="flex items-center justify-between p-2 rounded bg-[rgb(var(--bg-base))] text-sm"
                    >
                      <span>{feed?.title || `Feed #${feedId}`}</span>
                      <span className="text-muted">
                        {policy.keepDays}{t('settings.retention.days')} / {policy.maxEntries}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
