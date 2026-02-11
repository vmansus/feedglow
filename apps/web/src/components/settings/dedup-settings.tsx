'use client';

import { useState, useEffect } from 'react';
import { Copy, RefreshCw, Link, Type, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import { t } from '@/lib/i18n';

const STRATEGY_OPTIONS = [
  { id: 'url' as const, label: t('settings.dedup.urlMatch'), desc: t('settings.dedup.urlMatchDesc'), icon: Link },
  { id: 'title' as const, label: t('settings.dedup.titleMatch'), desc: t('settings.dedup.titleMatchDesc'), icon: Type },
  { id: 'content' as const, label: t('settings.dedup.contentMatch'), desc: t('settings.dedup.contentMatchDesc'), icon: FileText },
];

const ACTION_OPTIONS = [
  { id: 'mark_only' as const, label: t('settings.dedup.markOnly'), desc: t('settings.dedup.markOnlyDesc') },
  { id: 'mark_read' as const, label: t('settings.dedup.markRead'), desc: t('settings.dedup.markReadDesc') },
  { id: 'hide' as const, label: t('settings.filterRules.actionHide'), desc: t('settings.dedup.hideDesc') },
];

export function DedupSettings() {
  const [settings, setSettings] = useState<api.DedupSettings>({
    enabled: true,
    strategies: ['url', 'title', 'content'],
    action: 'mark_only',
  });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api.getDedupSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (enabled: boolean) => {
    const updated = { ...settings, enabled };
    setSettings(updated);
    try {
      await api.updateDedupSettings({ enabled });
    } catch {
      setSettings(s => ({ ...s, enabled: !enabled }));
      toast.error(t('settings.common.saveFailed'));
    }
  };

  const handleStrategyToggle = async (strategy: 'url' | 'title' | 'content') => {
    const strategies = settings.strategies.includes(strategy)
      ? settings.strategies.filter(s => s !== strategy)
      : [...settings.strategies, strategy];
    
    if (strategies.length === 0) {
      toast.error(t('settings.dedup.keepOneStrategy'));
      return;
    }

    const updated = { ...settings, strategies };
    setSettings(updated);
    try {
      await api.updateDedupSettings({ strategies });
    } catch {
      setSettings(s => ({ ...s, strategies: settings.strategies }));
      toast.error(t('settings.common.saveFailed'));
    }
  };

  const handleActionChange = async (action: api.DedupSettings['action']) => {
    const updated = { ...settings, action };
    setSettings(updated);
    try {
      await api.updateDedupSettings({ action });
    } catch {
      setSettings(s => ({ ...s, action: settings.action }));
      toast.error(t('settings.common.saveFailed'));
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const result = await api.checkDuplicates();
      toast.success(t('settings.dedup.checkComplete', { checked: result.checked, found: result.duplicatesFound }));
    } catch {
      toast.error(t('settings.dedup.checkFailed'));
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Copy className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.dedup.title')}</h2>
        </div>
        <button
          onClick={() => handleToggle(!settings.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enabled ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <p className="text-sm text-muted">
        {t('settings.dedup.desc')}
      </p>

      {settings.enabled && (
        <>
          {/* Strategies */}
          <div>
            <h3 className="text-sm font-medium text-secondary mb-3">{t('settings.dedup.strategy')}</h3>
            <div className="space-y-2">
              {STRATEGY_OPTIONS.map(opt => {
                const active = settings.strategies.includes(opt.id);
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleStrategyToggle(opt.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      active
                        ? 'border-orange-500/50 bg-orange-500/5'
                        : 'border-default hover:bg-[rgb(var(--bg-hover))]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-orange-500' : 'text-muted'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${active ? 'text-[rgb(var(--text-primary))]' : 'text-secondary'}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-muted">{opt.desc}</div>
                    </div>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      active ? 'border-orange-500 bg-orange-500' : 'border-[rgb(var(--border-default))]'
                    }`}>
                      {active && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action */}
          <div>
            <h3 className="text-sm font-medium text-secondary mb-3">{t('settings.dedup.action')}</h3>
            <div className="space-y-2">
              {ACTION_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleActionChange(opt.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                    settings.action === opt.id
                      ? 'border-orange-500/50 bg-orange-500/5'
                      : 'border-default hover:bg-[rgb(var(--bg-hover))]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    settings.action === opt.id ? 'border-orange-500' : 'border-[rgb(var(--border-default))]'
                  }`}>
                    {settings.action === opt.id && (
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${settings.action === opt.id ? 'text-[rgb(var(--text-primary))]' : 'text-secondary'}`}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-muted">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Manual check */}
          <div className="pt-2">
            <button
              onClick={handleCheckNow}
              disabled={checking}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {checking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {checking ? t('settings.dedup.checking') : t('settings.dedup.checkNow')}
            </button>
            <p className="text-xs text-muted mt-2">
              {t('settings.dedup.checkDesc')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
