'use client';

import { useState, useEffect } from 'react';
import {
  useNotificationRules,
  useCreateNotificationRule,
  useUpdateNotificationRule,
  useDeleteNotificationRule,
  useTestNotification,
  type NotificationRule
} from '@/hooks/use-notifications';
import { useFeeds } from '@/hooks/use-feeds';
import { useCategories } from '@/hooks/use-categories';
import { Button } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  TestTube,
} from 'lucide-react';
import * as api from '@/lib/api';
import type { NotificationChannel } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

type TriggerType = 'new_article' | 'keyword' | 'feed' | 'category';

const TRIGGER_LABELS: Record<TriggerType, string> = {
  new_article: t('settings.notifications.triggerAllNew'),
  keyword: t('settings.notifications.triggerKeyword'),
  feed: t('settings.notifications.triggerFeed'),
  category: t('settings.notifications.triggerCategory')
};

export function NotificationsSettings() {
  const confirmDialog = useConfirm();
  const { data: rules = [], isLoading } = useNotificationRules();
  const { feeds = [] } = useFeeds();
  const { categories = [] } = useCategories();
  const createRule = useCreateNotificationRule();
  const updateRule = useUpdateNotificationRule();
  const deleteRule = useDeleteNotificationRule();
  const testNotification = useTestNotification();

  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [availableChannels, setAvailableChannels] = useState<NotificationChannel[]>([]);
  const [newRule, setNewRule] = useState<Partial<NotificationRule>>({
    name: '',
    enabled: true,
    triggers: { type: 'new_article' },
    channels: { channelIds: [] },
    schedule: { type: 'immediate' }
  });
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  useEffect(() => {
    api.getNotificationChannels().then(data => {
      setAvailableChannels(data.channels || []);
    }).catch(() => {});
  }, []);

  const handleCreateRule = async () => {
    if (!newRule.name) return;

    await createRule.mutateAsync({
      name: newRule.name,
      enabled: newRule.enabled ?? true,
      triggers: newRule.triggers as NotificationRule['triggers'],
      channels: newRule.channels as NotificationRule['channels'],
      schedule: newRule.schedule
    });
    
    setNewRule({
      name: '',
      enabled: true,
      triggers: { type: 'new_article' },
      channels: { channelIds: [] },
      schedule: { type: 'immediate' }
    });
    setShowNewForm(false);
  };

  const handleToggleRule = async (rule: NotificationRule) => {
    await updateRule.mutateAsync({
      id: rule.id,
      enabled: !rule.enabled
    });
  };

  const handleDeleteRule = async (id: string) => {
    const ok = await confirmDialog({ message: t('settings.notifications.confirmDelete'), variant: 'danger', confirmText: t('common.delete') }); if (ok) {
      await deleteRule.mutateAsync(id);
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testNotification.mutateAsync();
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: t('settings.notifications.testFailed') });
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
          <Bell className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold">{t('settings.notifications.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testNotification.isPending}
            className="flex items-center gap-2"
          >
            {testNotification.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <TestTube className="w-4 h-4" />
            )}
            {t('settings.notifications.sendTest')}
          </Button>
          <Button
            size="sm"
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('settings.notifications.addRule')}
          </Button>
        </div>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${
          testResult.success 
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {testResult.success ? '✓ ' + t('settings.notifications.testSuccess') : '✗ ' + (testResult.message || t('settings.notifications.testFailed'))}
        </div>
      )}

      {/* New Rule Form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border border-orange-300 dark:border-orange-800 rounded-lg overflow-hidden"
          >
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 space-y-4">
              <h3 className="font-medium">{t('settings.notifications.newRule')}</h3>
              
              {/* Rule Name */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('settings.notifications.ruleName')}</label>
                <input
                  type="text"
                  value={newRule.name || ''}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder={t('settings.notifications.ruleNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              {/* Trigger Type */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('settings.notifications.triggerLabel')}</label>
                <select
                  value={newRule.triggers?.type || 'new_article'}
                  onChange={(e) => setNewRule({
                    ...newRule,
                    triggers: { type: e.target.value as TriggerType }
                  })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                >
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Trigger Details */}
              {newRule.triggers?.type === 'keyword' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.notifications.keywordsComma')}</label>
                  <input
                    type="text"
                    value={newRule.triggers?.keywords?.join(', ') || ''}
                    onChange={(e) => setNewRule({
                      ...newRule,
                      triggers: {
                        ...newRule.triggers,
                        type: 'keyword',
                        keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      }
                    })}
                    placeholder={t('settings.notifications.keywordsComma')}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  />
                </div>
              )}

              {newRule.triggers?.type === 'feed' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.notifications.selectFeed')}</label>
                  <select
                    value={newRule.triggers?.feedId || ''}
                    onChange={(e) => setNewRule({
                      ...newRule,
                      triggers: {
                        ...newRule.triggers,
                        type: 'feed',
                        feedId: Number(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  >
                    <option value="">{t('settings.notifications.selectFeedPlaceholder')}</option>
                    {categories.map(cat => {
                      const catFeeds = feeds.filter(f => f.categoryId === cat.id);
                      if (catFeeds.length === 0) return null;
                      return [
                        <option key={`cat-${cat.id}`} disabled style={{ fontWeight: 'bold' }}>
                          {cat.title}
                        </option>,
                        ...catFeeds.map(feed => (
                          <option key={feed.id} value={feed.id}>{'\u00A0\u00A0\u00A0└→ ' + feed.title}</option>
                        ))
                      ];
                    })}
                    {(() => {
                      const uncategorized = feeds.filter(f => !f.categoryId);
                      if (uncategorized.length === 0) return null;
                      return [
                        <option key="cat-uncategorized" disabled style={{ fontWeight: 'bold' }}>
                          {t('settings.opml.uncategorized')}
                        </option>,
                        ...uncategorized.map(feed => (
                          <option key={feed.id} value={feed.id}>{'\u00A0\u00A0\u00A0└→ ' + feed.title}</option>
                        ))
                      ];
                    })()}
                  </select>
                </div>
              )}

              {newRule.triggers?.type === 'category' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.notifications.selectCategory')}</label>
                  <select
                    value={newRule.triggers?.categoryId || ''}
                    onChange={(e) => setNewRule({
                      ...newRule,
                      triggers: {
                        ...newRule.triggers,
                        type: 'category',
                        categoryId: Number(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  >
                    <option value="">{t('settings.notifications.selectCategoryPlaceholder')}</option>
                    {categories.filter(c => !c.parent_id).map(cat => {
                      const count = feeds.filter(f => f.categoryId === cat.id).length;
                      const children = categories.filter(c => c.parent_id === cat.id);
                      return [
                        <option key={cat.id} value={cat.id}>{cat.title} ({count})</option>,
                        ...children.map(child => {
                          const childCount = feeds.filter(f => f.categoryId === child.id).length;
                          return (
                            <option key={child.id} value={child.id}>{'\u00A0\u00A0\u00A0└→ ' + child.title} ({childCount})</option>
                          );
                        })
                      ];
                    })}
                  </select>
                </div>
              )}

              {/* Notification Channels */}
              <div>
                <label className="block text-sm font-medium mb-2">{t('settings.notifications.channelsLabel')}</label>
                {availableChannels.length === 0 ? (
                  <p className="text-sm text-zinc-400">{t('settings.notifications.noChannels')}</p>
                ) : (
                  <div className="space-y-2">
                    {availableChannels.map(ch => (
                      <label key={ch.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(newRule.channels as any)?.channelIds?.includes(ch.id) || false}
                          onChange={(e) => {
                            const ids: number[] = (newRule.channels as any)?.channelIds || [];
                            const next = e.target.checked
                              ? [...ids, ch.id]
                              : ids.filter((i: number) => i !== ch.id);
                            setNewRule({ ...newRule, channels: { channelIds: next } });
                          }}
                          className="rounded border-zinc-300"
                        />
                        <span className="text-sm">{ch.name} ({ch.type})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  onClick={handleCreateRule}
                  disabled={!newRule.name || createRule.isPending}
                >
                  {createRule.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {t('settings.notifications.createRule')}
                </Button>
                <Button variant="outline" onClick={() => setShowNewForm(false)}>
                  {t('settings.common.cancel')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing Rules */}
      <div className="space-y-3">
        {rules.map(rule => {
          const isExpanded = expandedRule === rule.id;
          
          return (
            <motion.div
              key={rule.id}
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
              layout
            >
              <div 
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleRule(rule); }}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      rule.enabled ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span 
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        rule.enabled ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                  <div>
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-sm text-zinc-500">
                      {TRIGGER_LABELS[rule.triggers.type as TriggerType]}
                      {rule.triggers.keywords && ` · ${rule.triggers.keywords.join(', ')}`}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-zinc-400 text-xs">
                    {(rule.channels.channelIds?.length ?? 0) > 0
                      ? t('settings.notifications.channelCount', { count: rule.channels.channelIds?.length ?? 0 })
                      : (rule.channels.push ? 'Telegram' : '')
                    }
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-zinc-400" />
                  )}
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <div className="p-4 space-y-3">
                      {/* Trigger details */}
                      <div className="text-sm space-y-1">
                        <div className="text-zinc-500 font-medium">{t('settings.notifications.triggerLabel')}</div>
                        <div>{TRIGGER_LABELS[rule.triggers.type as TriggerType]}</div>
                        {rule.triggers.type === 'feed' && rule.triggers.feedId && (
                          <div className="text-zinc-400">
                            {t('settings.notifications.feedLabel')} {feeds.find(f => f.id === rule.triggers.feedId)?.title || `#${rule.triggers.feedId}`}
                          </div>
                        )}
                        {rule.triggers.type === 'category' && rule.triggers.categoryId && (
                          <div className="text-zinc-400">
                            {t('settings.notifications.categoryLabel')} {categories.find(c => c.id === rule.triggers.categoryId)?.title || `#${rule.triggers.categoryId}`}
                          </div>
                        )}
                        {rule.triggers.type === 'keyword' && rule.triggers.keywords && (
                          <div className="text-zinc-400">
                            {t('settings.notifications.keywordsLabel')} {rule.triggers.keywords.join(', ')}
                          </div>
                        )}
                      </div>

                      {/* Channel details */}
                      <div className="text-sm space-y-1">
                        <div className="text-zinc-500 font-medium">{t('settings.notifications.channelsLabel')}</div>
                        <div className="flex flex-wrap gap-2">
                          {(rule.channels.channelIds?.length ?? 0) > 0 ? (
                            rule.channels.channelIds?.map((cid: number) => {
                              const ch = availableChannels.find(c => c.id === cid);
                              return (
                                <span key={cid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">
                                  {ch ? `${ch.name} (${ch.type})` : `#${cid}`}
                                </span>
                              );
                            })
                          ) : rule.channels.push ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">
                              {t('settings.notifications.telegramLegacy')}
                            </span>
                          ) : (
                            <span className="text-zinc-400 text-xs">{t('settings.notifications.noChannelsConfigured')}</span>
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-zinc-400">
                        {t('settings.notifications.createdAt')} {new Date(rule.createdAt).toLocaleDateString()}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t('settings.notifications.deleteRule')}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {rules.length === 0 && !showNewForm && (
        <div className="text-center py-12 text-zinc-500">
          <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>{t('settings.notifications.empty')}</p>
          <p className="text-sm mt-1">{t('settings.notifications.emptyDesc')}</p>
        </div>
      )}
    </div>
  );
}
