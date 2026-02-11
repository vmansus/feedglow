'use client';

import { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, Link2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@feedglow/ui';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';

interface PrivacySettings {
  stripTracking: boolean;
  proxyImages: boolean;
  blockExternalFonts: boolean;
  sanitizeHtml: boolean;
  hideReadingProgress: boolean;
}

export function PrivacySettings() {
  const [settings, setSettings] = useState<PrivacySettings>({
    stripTracking: true,
    proxyImages: false,
    blockExternalFonts: false,
    sanitizeHtml: true,
    hideReadingProgress: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem('privacySettings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch { /* ignore parse errors */ }
    }
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem('privacySettings', JSON.stringify(settings));
      toast.success(t('settings.privacy.saved'));
    } catch {
      toast.error(t('settings.common.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSetting = (key: keyof PrivacySettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold">{t('settings.privacy.title')}</h2>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        {t('settings.privacy.desc')}
      </p>

      <div className="space-y-4">
        {/* Strip Tracking */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Link2 className="w-5 h-5 text-zinc-500" />
            <div>
              <div className="font-medium">{t('settings.privacy.stripTracking')}</div>
              <div className="text-sm text-zinc-500">{t('settings.privacy.stripTrackingDesc')}</div>
            </div>
          </div>
          <button
            onClick={() => toggleSetting('stripTracking')}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.stripTracking ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.stripTracking ? 'left-6' : 'left-1'
            }`} />
          </button>
        </div>

        {/* Proxy Images */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-zinc-500" />
            <div>
              <div className="font-medium">{t('settings.privacy.proxyImages')}</div>
              <div className="text-sm text-zinc-500">{t('settings.privacy.proxyImagesDesc')}</div>
            </div>
          </div>
          <button
            onClick={() => toggleSetting('proxyImages')}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.proxyImages ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.proxyImages ? 'left-6' : 'left-1'
            }`} />
          </button>
        </div>

        {/* Block External Fonts */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <ExternalLink className="w-5 h-5 text-zinc-500" />
            <div>
              <div className="font-medium">{t('settings.privacy.blockExternalFonts')}</div>
              <div className="text-sm text-zinc-500">{t('settings.privacy.blockExternalFontsDesc')}</div>
            </div>
          </div>
          <button
            onClick={() => toggleSetting('blockExternalFonts')}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.blockExternalFonts ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.blockExternalFonts ? 'left-6' : 'left-1'
            }`} />
          </button>
        </div>

        {/* Sanitize HTML */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-zinc-500" />
            <div>
              <div className="font-medium">{t('settings.privacy.sanitizeHtml')}</div>
              <div className="text-sm text-zinc-500">{t('settings.privacy.sanitizeHtmlDesc')}</div>
            </div>
          </div>
          <button
            onClick={() => toggleSetting('sanitizeHtml')}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.sanitizeHtml ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.sanitizeHtml ? 'left-6' : 'left-1'
            }`} />
          </button>
        </div>

        {/* Hide Reading Progress */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <EyeOff className="w-5 h-5 text-zinc-500" />
            <div>
              <div className="font-medium">{t('settings.privacy.hideReadingProgress')}</div>
              <div className="text-sm text-zinc-500">{t('settings.privacy.hideReadingProgressDesc')}</div>
            </div>
          </div>
          <button
            onClick={() => toggleSetting('hideReadingProgress')}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.hideReadingProgress ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.hideReadingProgress ? 'left-6' : 'left-1'
            }`} />
          </button>
        </div>
      </div>

      <div className="pt-4">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {t('settings.privacy.saveSettings')}
        </Button>
      </div>
    </div>
  );
}
