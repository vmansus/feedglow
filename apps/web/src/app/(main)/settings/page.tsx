'use client';

import { useState, useEffect } from 'react';
import { Save, RefreshCw, Palette, BookOpen, Languages, Sparkles, Bell, ExternalLink, Download, Settings2, Zap, Clock, Bot } from 'lucide-react';
import toast from 'react-hot-toast';
import { AISettings } from '@/components/settings/ai-settings';
import { ThemeSettings } from '@/components/settings/theme-settings';
import { AIFiltersSettings } from '@/components/settings/ai-filters-settings';
import { NotificationsSettings } from '@/components/settings/notifications-settings';
import { ChannelSettings } from '@/components/settings/channel-settings';
import { IntegrationsSettings } from '@/components/settings/integrations-settings';
import { ExportSettings } from '@/components/settings/export-settings';
import { PrivacySettings } from '@/components/settings/privacy-settings';
import { FeedAdvancedSettings } from '@/components/settings/feed-advanced-settings';
import { CategorySettings } from '@/components/settings/category-settings';
import { ActionSettings } from '@/components/settings/action-settings';
import { AITasksSettings } from '@/components/settings/ai-tasks-settings';
import { RetentionSettings } from '@/components/settings/retention-settings';
import { FeedSourcesSettings } from '@/components/settings/feed-sources-settings';
import { FilterRulesSettings } from '@/components/settings/filter-rules-settings';
import { DedupSettings } from '@/components/settings/dedup-settings';
import { PlatformSettings } from '@/components/settings/platform-settings';
import { SharedFeedsSettings } from '@/components/settings/shared-feeds-settings';
import { NewsletterSettings } from '@/components/settings/newsletter-settings';
import { CustomCssSettings } from '@/components/settings/custom-css-settings';
import { ChangePasswordSettings } from '@/components/settings/change-password-settings';
import { motion } from 'framer-motion';
import { Shield, Rss, Folder, Archive, Database, Key, Timer, Filter, Mail, Copy } from 'lucide-react';
import * as api from '@/lib/api';
import { getScrollMarkReadSettings, setScrollMarkReadSettings } from '@/hooks/use-scroll-mark-read';
import { t, useLocale } from '@/lib/i18n';

type SettingsTab = 'general' | 'categories' | 'feed-sources' | 'actions' | 'ai-tasks' | 'ai' | 'ai-filters' | 'filters' | 'dedup' | 'privacy' | 'change-password' | 'feeds' | 'retention' | 'notifications' | 'integrations' | 'platforms' | 'shared-feeds' | 'newsletter' | 'export' | 'custom-css';

// Grouped sidebar navigation
const SETTINGS_GROUPS: { label: string; items: { id: SettingsTab; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: t('settings.page.group.general'),
    items: [
      { id: 'general', label: t('settings.page.tab.general'), icon: <Settings2 className="w-4 h-4" /> },
      { id: 'categories', label: t('settings.categories.title'), icon: <Folder className="w-4 h-4" /> },
      { id: 'feeds', label: t('settings.page.tab.feeds'), icon: <Rss className="w-4 h-4" /> },
      { id: 'feed-sources', label: t('settings.feedSources.title'), icon: <Database className="w-4 h-4" /> },
      { id: 'custom-css', label: t('settings.page.tab.customCss'), icon: <Palette className="w-4 h-4" /> },
    ],
  },
  {
    label: t('settings.filterRules.targetContent'),
    items: [
      { id: 'filters', label: t('settings.page.tab.filters'), icon: <Filter className="w-4 h-4" /> },
      { id: 'dedup', label: t('settings.dedup.title'), icon: <Copy className="w-4 h-4" /> },
      { id: 'retention', label: t('settings.retention.title'), icon: <Archive className="w-4 h-4" /> },
    ],
  },
  {
    label: t('settings.page.group.ai'),
    items: [
      { id: 'ai', label: t('settings.page.tab.aiConfig'), icon: <Sparkles className="w-4 h-4" /> },
      { id: 'ai-filters', label: t('settings.page.tab.aiFilters'), icon: <Sparkles className="w-4 h-4" /> },
      { id: 'actions', label: 'AI Actions', icon: <Zap className="w-4 h-4" /> },
      { id: 'ai-tasks', label: 'AI Tasks', icon: <Clock className="w-4 h-4" /> },
    ],
  },
  {
    label: t('settings.sharedFeeds.title'),
    items: [
      { id: 'shared-feeds', label: t('settings.page.tab.sharedFeeds'), icon: <Rss className="w-4 h-4" /> },
      { id: 'newsletter', label: t('settings.newsletter.title'), icon: <Mail className="w-4 h-4" /> },
      { id: 'export', label: t('settings.page.tab.export'), icon: <Download className="w-4 h-4" /> },
    ],
  },
  {
    label: t('settings.telegram.connect'),
    items: [
      { id: 'notifications', label: t('settings.polling.notification'), icon: <Bell className="w-4 h-4" /> },
      { id: 'integrations', label: t('settings.page.tab.integrations'), icon: <ExternalLink className="w-4 h-4" /> },
      { id: 'platforms', label: t('settings.platforms.title'), icon: <Key className="w-4 h-4" /> },
    ],
  },
  {
    label: t('settings.page.group.security'),
    items: [
      { id: 'change-password', label: t('settings.page.tab.changePassword'), icon: <Key className="w-4 h-4" /> },
      { id: 'privacy', label: t('settings.page.tab.privacy'), icon: <Shield className="w-4 h-4" /> },
    ],
  },
];

const FEED_TYPE_LABELS: Record<string, string> = {
  article: t('settings.polling.article'),
  social: t('settings.polling.social'),
  picture: t('settings.polling.picture'),
  video: t('settings.polling.video'),
  notification: t('settings.polling.notification'),
};

function PollingDefaultsSection() {
  const [defaults, setDefaults] = useState<Record<string, number>>({
    article: 60, social: 10, picture: 60, video: 120, notification: 30,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPollingDefaults().then(setDefaults).catch(() => {});
  }, []);

  const handleChange = (type: string, value: number) => {
    setDefaults(prev => ({ ...prev, [type]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updatePollingDefaults(defaults);
      toast.success(t('settings.polling.saved'));
      setDirty(false);
    } catch {
      toast.error(t('settings.common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const formatFreq = (min: number) => min >= 60 ? `${min / 60}h` : `${min}min`;

  return (
    <section className="surface-elevated rounded-xl border border-default p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Timer className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.polling.title')}</h2>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {saving ? t('settings.newsletter.saving') : t('settings.common.save')}
          </button>
        )}
      </div>
      <p className="text-sm text-muted mb-4">{t('settings.polling.desc')}</p>
      <div className="space-y-3">
        {Object.entries(FEED_TYPE_LABELS).map(([type, label]) => (
          <div key={type} className="flex items-center gap-3">
            <span className="text-sm font-medium w-20 text-secondary">{label}</span>
            <input
              type="range"
              min={5}
              max={240}
              step={5}
              value={defaults[type] || 60}
              onChange={(e) => handleChange(type, Number(e.target.value))}
              className="flex-1 accent-orange-500"
            />
            <span className="text-sm font-mono w-12 text-right text-muted">
              {formatFreq(defaults[type] || 60)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { locale, setLocale } = useLocale();
  const [apiUrl, setApiUrl] = useState('');
  const [entriesPerPage, setEntriesPerPage] = useState('25');
  const [autoMarkRead, setAutoMarkRead] = useState(true);
  const [translateLanguage, setTranslateLanguage] = useState('zh-CN');
  const [isSaving, setIsSaving] = useState(false);
  const [enableSummary, setEnableSummary] = useState(true);
  const [enableTranslation, setEnableTranslation] = useState(true);
  const [scrollMarkRead, setScrollMarkRead] = useState(false);
  const [scrollMarkReadDelay, setScrollMarkReadDelay] = useState(1.5);

  useEffect(() => {
    const savedApiUrl = localStorage.getItem('apiUrl') || '';
    const savedEntriesPerPage = localStorage.getItem('entriesPerPage') || '25';
    const savedAutoMarkRead = localStorage.getItem('autoMarkRead') !== 'false';
    const savedTranslateLanguage = localStorage.getItem('translateLanguage') || 'zh-CN';
    
    setApiUrl(savedApiUrl);
    setEntriesPerPage(savedEntriesPerPage);
    setAutoMarkRead(savedAutoMarkRead);
    setTranslateLanguage(savedTranslateLanguage);

    const smr = getScrollMarkReadSettings();
    setScrollMarkRead(smr.enabled);
    setScrollMarkReadDelay(smr.delay);

    // Load AI feature toggles from server
    api.getAISettings().then((data) => {
      setEnableSummary(data.enableSummary);
      setEnableTranslation(data.enableTranslation);
    }).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem('apiUrl', apiUrl);
      localStorage.setItem('entriesPerPage', entriesPerPage);
      localStorage.setItem('autoMarkRead', String(autoMarkRead));
      localStorage.setItem('translateLanguage', translateLanguage);
      toast.success(t('settings.general.settingsSaved'));
    } catch {
      toast.error(t('settings.general.settingsSaveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-6">
            {/* Appearance - Theme & Accent */}
            <section className="surface-elevated rounded-xl border border-default p-6">
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.general.appearance')}</h2>
              </div>
              <ThemeSettings />
            </section>

            {/* Language */}
            <section className="surface-elevated rounded-xl border border-default p-6">
              <div className="flex items-center gap-2 mb-4">
                <Languages className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.general.language')}</h2>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  {t('settings.general.displayLanguage')}
                </label>
                <select
                  value={locale}
                  onChange={(e) => {
                    setLocale(e.target.value as 'zh' | 'en');
                    window.location.reload();
                  }}
                  className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
                <p className="text-sm text-muted mt-1">{t('settings.general.languageDesc')}</p>
              </div>
            </section>

            {/* Reading */}
            <section className="surface-elevated rounded-xl border border-default p-6">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.general.reading')}</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    {t('settings.general.articlesPerPage')}
                  </label>
                  <select
                    value={entriesPerPage}
                    onChange={(e) => setEntriesPerPage(e.target.value)}
                    className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-secondary">
                      {t('settings.general.autoMarkRead')}
                    </label>
                    <p className="text-sm text-muted">
                      {t('settings.general.autoMarkReadDesc')}
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoMarkRead(!autoMarkRead)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autoMarkRead ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        autoMarkRead ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-secondary">
                      {t('settings.general.scrollMarkRead')}
                    </label>
                    <p className="text-sm text-muted">
                      {t('settings.general.scrollMarkReadDesc')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !scrollMarkRead;
                      setScrollMarkRead(next);
                      setScrollMarkReadSettings(next, scrollMarkReadDelay);
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      scrollMarkRead ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        scrollMarkRead ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {scrollMarkRead && (
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">
                      {t('settings.general.scrollMarkReadDelay', { delay: scrollMarkReadDelay })}
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={0.5}
                      value={scrollMarkReadDelay}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setScrollMarkReadDelay(val);
                        setScrollMarkReadSettings(scrollMarkRead, val);
                      }}
                      className="w-full accent-orange-500"
                    />
                    <div className="flex justify-between text-xs text-muted mt-1">
                      <span>{t('settings.general.second1')}</span>
                      <span>{t('settings.general.second5')}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Translation */}
            <section className="surface-elevated rounded-xl border border-default p-6">
              <div className="flex items-center gap-2 mb-4">
                <Languages className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.actions.actionTranslate')}</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    {t('settings.general.defaultTranslateLanguage')}
                  </label>
                  <select
                    value={translateLanguage}
                    onChange={(e) => setTranslateLanguage(e.target.value)}
                    className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="zh-CN">{t('settings.general.langZhCN')}</option>
                    <option value="zh-TW">{t('settings.general.langZhTW')}</option>
                    <option value="en">English</option>
                    <option value="ja">{t('settings.general.langJa')}</option>
                    <option value="ko">한국어</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="ru">Русский</option>
                    <option value="pt">Português</option>
                    <option value="ar">العربية</option>
                  </select>
                  <p className="mt-1 text-sm text-muted">
                    {t('settings.general.translateDesc')}
                  </p>
                </div>
              </div>
            </section>

            {/* Polling Defaults */}
            <PollingDefaultsSection />

            {/* AI Features */}
            <section className="surface-elevated rounded-xl border border-default p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.general.aiFeatures')}</h2>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-secondary">
                      {t('settings.general.aiSummary')}
                    </label>
                    <p className="text-sm text-muted">
                      {t('settings.general.aiSummaryDesc')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !enableSummary;
                      setEnableSummary(next);
                      api.updateAISettings({ enableSummary: next }).catch(() => setEnableSummary(!next));
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      enableSummary ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        enableSummary ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-secondary">
                      {t('settings.general.aiTranslation')}
                    </label>
                    <p className="text-sm text-muted">
                      {t('settings.general.aiTranslationDesc')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !enableTranslation;
                      setEnableTranslation(next);
                      api.updateAISettings({ enableTranslation: next }).catch(() => setEnableTranslation(!next));
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      enableTranslation ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        enableTranslation ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </section>

            {/* API Configuration */}
            <section className="surface-elevated rounded-xl border border-default p-6">
              <h2 className="text-lg font-semibold mb-4 text-[rgb(var(--text-primary))]">{t('settings.general.apiConfig')}</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    {t('settings.general.customApiUrl')}
                  </label>
                  <input
                    type="url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://api.example.com"
                    className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] placeholder-[rgb(var(--text-muted))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-sm text-muted">
                    {t('settings.general.customApiUrlDesc')}
                  </p>
                </div>
              </div>
            </section>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {t('settings.general.saveSettings')}
              </button>
            </div>

            {/* About */}
            <section className="surface-elevated rounded-xl border border-default p-6">
              <h2 className="text-lg font-semibold mb-4 text-[rgb(var(--text-primary))]">{t('settings.general.about')}</h2>
              <div className="space-y-2 text-sm text-secondary">
                <p><strong className="text-[rgb(var(--text-primary))]">FeedGlow</strong> — {t('settings.general.aboutDesc')}</p>
                <p>{t('settings.general.version')}: 0.1.0</p>
                <p>
                  <a
                    href="https://github.com/vmansus/feedglow"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 hover:underline"
                  >
                    {t('settings.general.githubRepo')}
                  </a>
                </p>
              </div>
            </section>
          </div>
        );
      
      case 'categories':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <CategorySettings />
          </section>
        );

      case 'feed-sources':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <FeedSourcesSettings />
          </section>
        );
      
      case 'actions':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <ActionSettings />
          </section>
        );
      
      case 'ai-tasks':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <AITasksSettings />
          </section>
        );

      case 'ai':
        return (
          <div className="space-y-6">
            <AISettings />
          </div>
        );
      
      case 'ai-filters':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <AIFiltersSettings />
          </section>
        );
      
      case 'filters':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <FilterRulesSettings />
          </section>
        );
      
      case 'dedup':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <DedupSettings />
          </section>
        );
      
      case 'notifications':
        return (
          <div className="space-y-6">
            <section className="surface-elevated rounded-xl border border-default p-6">
              <ChannelSettings />
            </section>
            <section className="surface-elevated rounded-xl border border-default p-6">
              <NotificationsSettings />
            </section>
          </div>
        );
      
      case 'integrations':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <IntegrationsSettings />
          </section>
        );
      
      case 'change-password':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <ChangePasswordSettings />
          </section>
        );

      case 'privacy':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <PrivacySettings />
          </section>
        );
      
      case 'feeds':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <FeedAdvancedSettings />
          </section>
        );
      
      case 'retention':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <RetentionSettings />
          </section>
        );
      
      case 'platforms':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <PlatformSettings />
          </section>
        );

      case 'shared-feeds':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <SharedFeedsSettings />
          </section>
        );

      case 'newsletter':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <NewsletterSettings />
          </section>
        );

      case 'custom-css':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <CustomCssSettings />
          </section>
        );

      case 'export':
        return (
          <section className="surface-elevated rounded-xl border border-default p-6">
            <ExportSettings />
          </section>
        );
      
      default:
        return null;
    }
  };

  // Find current tab label for mobile header
  const currentTabLabel = SETTINGS_GROUPS.flatMap(g => g.items).find(t => t.id === activeTab)?.label || t('settings.page.title');

  return (
    <div className="h-full overflow-y-auto surface-base">
      <div className="max-w-6xl mx-auto p-6 flex gap-6">
        {/* Left sidebar navigation - sticky */}
        <nav className="w-52 flex-shrink-0 hidden md:block sticky top-0 self-start max-h-[calc(100vh-3rem)] overflow-y-auto">
          <h1 className="text-xl font-bold mb-5 text-[rgb(var(--text-primary))] px-3">{t('settings.page.title')}</h1>
          <div className="space-y-5">
            {SETTINGS_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--text-muted))] px-3 mb-1.5">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-orange-500/15 text-orange-500 font-medium'
                            : 'text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--bg-hover))] hover:text-[rgb(var(--text-primary))]'
                        }`}
                      >
                        <span className={isActive ? 'text-orange-500' : 'text-[rgb(var(--text-muted))]'}>
                          {item.icon}
                        </span>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Mobile tab selector (shown below md breakpoint) */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-20 surface-base border-b border-default px-4 py-3">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as SettingsTab)}
            className="w-full px-3 py-2 rounded-lg border border-default surface-elevated text-[rgb(var(--text-primary))] text-sm"
          >
            {SETTINGS_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Right content area */}
        <div className="flex-1 min-w-0">
          {/* Content header - show current section name on desktop */}
          <div className="hidden md:block mb-5">
            <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{currentTabLabel}</h2>
          </div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {renderTabContent()}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
