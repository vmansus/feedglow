'use client';

import { useState, useEffect } from 'react';
import { Settings2, Loader2, Key, Globe, Filter, ChevronDown, ChevronRight, Server } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { useFeeds, useUpdateFeedSettings } from '@/hooks/use-feeds';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';

interface FeedAdvancedConfig {
  // RSSHub settings
  rsshubUrl: string;
  // Per-feed settings
  crawlerEnabled: boolean;
  httpAuth: {
    enabled: boolean;
    username: string;
    password: string;
  };
  userAgent: string;
  blocklist: string;
  keeplist: string;
  scraperSelector: string;
  rewriteRules: string;
}

const defaultConfig: FeedAdvancedConfig = {
  rsshubUrl: '',
  crawlerEnabled: false,
  httpAuth: { enabled: false, username: '', password: '' },
  userAgent: '',
  blocklist: '',
  keeplist: '',
  scraperSelector: '',
  rewriteRules: '',
};

// RSSHub public instances
const RSSHUB_INSTANCES = [
  { url: '', label: t('settings.feedAdvanced.serverDefault') },
  { url: 'https://rsshub.app', label: 'rsshub.app' },
  { url: 'https://rsshub.rssforever.com', label: 'rsshub.rssforever.com' },
  { url: 'https://rsshub.moeyy.cn', label: 'rsshub.moeyy.cn' },
];

export function FeedAdvancedSettings() {
  const { feeds = [] } = useFeeds();
  const updateFeedSettings = useUpdateFeedSettings();
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [config, setConfig] = useState<FeedAdvancedConfig>(defaultConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['rsshub', 'crawler', 'filtering']);

  // Load saved config
  useEffect(() => {
    const key = selectedFeedId 
      ? `feedAdvancedSettings_${selectedFeedId}` 
      : 'feedAdvancedSettings_global';
    const saved = localStorage.getItem(key);
    
    // Also load rsshubUrl from its dedicated key
    const rsshubUrl = localStorage.getItem('rsshubUrl') || '';
    
    if (saved) {
      try {
        setConfig({ ...defaultConfig, ...JSON.parse(saved), rsshubUrl });
      } catch { 
        setConfig({ ...defaultConfig, rsshubUrl });
      }
    } else {
      setConfig({ ...defaultConfig, rsshubUrl });
    }
  }, [selectedFeedId]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const key = selectedFeedId 
        ? `feedAdvancedSettings_${selectedFeedId}` 
        : 'feedAdvancedSettings_global';
      localStorage.setItem(key, JSON.stringify(config));
      
      // If feed selected, also update via API
      if (selectedFeedId) {
        await updateFeedSettings.mutateAsync({
          feedId: selectedFeedId,
          settings: {
            crawler: config.crawlerEnabled,
            username: config.httpAuth.enabled ? config.httpAuth.username : undefined,
            password: config.httpAuth.enabled ? config.httpAuth.password : undefined,
            user_agent: config.userAgent || undefined,
            blocklist_rules: config.blocklist || undefined,
            keeplist_rules: config.keeplist || undefined,
            scraper_rules: config.scraperSelector || undefined,
            rewrite_rules: config.rewriteRules || undefined,
          },
        });
      }
      
      toast.success(t('settings.feedAdvanced.saved'));
    } catch {
      toast.error(t('settings.common.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const SectionHeader = ({ 
    title, 
    icon: Icon, 
    section 
  }: { 
    title: string; 
    icon: React.ElementType; 
    section: string;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between p-4 hover:bg-[rgb(var(--bg-hover))] transition-colors rounded-lg"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-orange-500" />
        <span className="font-medium">{title}</span>
      </div>
      {expandedSections.includes(section) ? (
        <ChevronDown className="w-4 h-4 text-muted" />
      ) : (
        <ChevronRight className="w-4 h-4 text-muted" />
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings2 className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold">{t('settings.feedAdvanced.title')}</h2>
      </div>

      {/* RSSHub Instance */}
      <div className="rounded-lg border border-default overflow-hidden">
        <SectionHeader title={t('settings.feedAdvanced.rsshubInstance')} icon={Server} section="rsshub" />
        {expandedSections.includes('rsshub') && (
          <div className="p-4 pt-0 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('settings.feedAdvanced.rsshubAddress')}</label>
              <select
                value={RSSHUB_INSTANCES.some(i => i.url === config.rsshubUrl) ? config.rsshubUrl : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') return;
                  setConfig(prev => ({ ...prev, rsshubUrl: e.target.value }));
                  // Save immediately to localStorage for discover page
                  localStorage.setItem('rsshubUrl', e.target.value);
                }}
                className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-[rgb(var(--text-primary))]"
              >
                {RSSHUB_INSTANCES.map(inst => (
                  <option key={inst.url} value={inst.url}>{inst.label}</option>
                ))}
                <option value="custom">{t('settings.feedAdvanced.customAddress')}</option>
              </select>
            </div>
            
            {(!RSSHUB_INSTANCES.some(i => i.url === config.rsshubUrl) && config.rsshubUrl) && (
              <div>
                <label className="block text-sm font-medium mb-2">{t('settings.feedAdvanced.customAddressLabel')}</label>
                <input
                  type="url"
                  value={config.rsshubUrl}
                  onChange={(e) => {
                    setConfig(prev => ({ ...prev, rsshubUrl: e.target.value }));
                    localStorage.setItem('rsshubUrl', e.target.value);
                  }}
                  placeholder="https://your-rsshub-instance.com"
                  className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm"
                />
              </div>
            )}
            
            <p className="text-xs text-muted">
              {t('settings.feedAdvanced.rsshubDesc')}
              <a 
                href="https://docs.rsshub.app/deploy/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-orange-500 hover:underline ml-1"
              >
                {t('settings.feedAdvanced.deployGuide')}
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Feed Selector */}
      <div>
        <label className="block text-sm font-medium mb-2">{t('settings.notifications.selectFeed')}</label>
        <select
          value={selectedFeedId || ''}
          onChange={(e) => setSelectedFeedId(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-[rgb(var(--text-primary))]"
        >
          <option value="">{t('settings.feedAdvanced.globalDefault')}</option>
          {feeds.map(feed => (
            <option key={feed.id} value={feed.id}>{feed.title}</option>
          ))}
        </select>
        <p className="text-xs text-muted mt-1">
          {t('settings.feedAdvanced.overrideNote')}
        </p>
      </div>

      {/* Crawler / Full Content Section */}
      <div className="rounded-lg border border-default overflow-hidden">
        <SectionHeader title={t('settings.feedAdvanced.fullContent')} icon={Globe} section="crawler" />
        {expandedSections.includes('crawler') && (
          <div className="p-4 pt-0 space-y-4">
            {/* Crawler toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{t('settings.feedAdvanced.enableCrawler')}</div>
                <div className="text-xs text-muted">{t('settings.feedAdvanced.crawlerDesc')}</div>
              </div>
              <button
                onClick={() => setConfig(prev => ({ ...prev, crawlerEnabled: !prev.crawlerEnabled }))}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  config.crawlerEnabled ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
                )}
              >
                <span className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                  config.crawlerEnabled ? 'left-6' : 'left-1'
                )} />
              </button>
            </div>

            {/* Scraper selector */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings.feedAdvanced.cssSelector')} <span className="text-muted font-normal">{t('settings.feedAdvanced.optional')}</span>
              </label>
              <input
                type="text"
                value={config.scraperSelector}
                onChange={(e) => setConfig(prev => ({ ...prev, scraperSelector: e.target.value }))}
                placeholder={t('settings.feedAdvanced.cssSelectorDesc')}
                className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm"
              />
              <p className="text-xs text-muted mt-1">
                {t('settings.feedAdvanced.cssSelectorDesc')}
              </p>
            </div>

            {/* Rewrite rules */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings.feedAdvanced.rewriteRules')} <span className="text-muted font-normal">{t('settings.feedAdvanced.optional')}</span>
              </label>
              <input
                type="text"
                value={config.rewriteRules}
                onChange={(e) => setConfig(prev => ({ ...prev, rewriteRules: e.target.value }))}
                placeholder={t('settings.feedAdvanced.rewriteRulesDesc')}
                className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm"
              />
              <p className="text-xs text-muted mt-1">
                {t('settings.feedAdvanced.rewriteRulesDesc')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* HTTP Auth Section */}
      <div className="rounded-lg border border-default overflow-hidden">
        <SectionHeader title={t('settings.feedAdvanced.httpAuth')} icon={Key} section="auth" />
        {expandedSections.includes('auth') && (
          <div className="p-4 pt-0 space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{t('settings.feedAdvanced.enableAuth')}</div>
                <div className="text-xs text-muted">{t('settings.feedAdvanced.authDesc')}</div>
              </div>
              <button
                onClick={() => setConfig(prev => ({ 
                  ...prev, 
                  httpAuth: { ...prev.httpAuth, enabled: !prev.httpAuth.enabled } 
                }))}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  config.httpAuth.enabled ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
                )}
              >
                <span className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                  config.httpAuth.enabled ? 'left-6' : 'left-1'
                )} />
              </button>
            </div>

            {config.httpAuth.enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('settings.feedAdvanced.username')}</label>
                  <input
                    type="text"
                    value={config.httpAuth.username}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      httpAuth: { ...prev.httpAuth, username: e.target.value } 
                    }))}
                    className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('settings.feedAdvanced.password')}</label>
                  <input
                    type="password"
                    value={config.httpAuth.password}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      httpAuth: { ...prev.httpAuth, password: e.target.value } 
                    }))}
                    className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm"
                  />
                </div>
              </div>
            )}

            {/* Custom User Agent */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings.feedAdvanced.customUserAgent')} <span className="text-muted font-normal">{t('settings.feedAdvanced.optional')}</span>
              </label>
              <input
                type="text"
                value={config.userAgent}
                onChange={(e) => setConfig(prev => ({ ...prev, userAgent: e.target.value }))}
                placeholder={t('settings.feedAdvanced.leaveEmpty')}
                className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Content Filtering Section */}
      <div className="rounded-lg border border-default overflow-hidden">
        <SectionHeader title={t('settings.feedAdvanced.contentFilter')} icon={Filter} section="filtering" />
        {expandedSections.includes('filtering') && (
          <div className="p-4 pt-0 space-y-4">
            {/* Blocklist */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings.feedAdvanced.blocklist')}
              </label>
              <textarea
                value={config.blocklist}
                onChange={(e) => setConfig(prev => ({ ...prev, blocklist: e.target.value }))}
                placeholder={t('settings.feedAdvanced.blocklistDesc')}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm font-mono resize-none"
              />
              <p className="text-xs text-muted mt-1">
                {t('settings.feedAdvanced.blocklistDesc')}
              </p>
            </div>

            {/* Keeplist */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings.feedAdvanced.keeplist')}
              </label>
              <textarea
                value={config.keeplist}
                onChange={(e) => setConfig(prev => ({ ...prev, keeplist: e.target.value }))}
                placeholder={t('settings.feedAdvanced.keeplistDesc')}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--bg-base))] text-sm font-mono resize-none"
              />
              <p className="text-xs text-muted mt-1">
                {t('settings.feedAdvanced.keeplistDesc')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="pt-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('settings.feedAdvanced.saveSettings')}
        </button>
      </div>
    </div>
  );
}
