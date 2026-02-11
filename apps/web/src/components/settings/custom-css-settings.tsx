'use client';

import { useState, useEffect } from 'react';
import { Code, Save, RefreshCw, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import { t } from '@/lib/i18n';

const CSS_PRESETS: { label: string; description: string; css: string }[] = [
  {
    label: t('settings.customCss.hideSidebar'),
    description: t('settings.customCss.hideSidebarDesc'),
    css: `/* Hide sidebar */
nav[class*="sidebar"], aside[class*="sidebar"] {
  display: none !important;
}`,
  },
  {
    label: t('settings.customCss.compactSpacing'),
    description: t('settings.customCss.compactSpacingDesc'),
    css: `/* Compact spacing */
[class*="entry-list"] > * {
  padding-top: 0.25rem !important;
  padding-bottom: 0.25rem !important;
}`,
  },
  {
    label: t('settings.customCss.largeFont'),
    description: t('settings.customCss.largeFontDesc'),
    css: `/* Large font */
article, [class*="content"] p {
  font-size: 18px !important;
  line-height: 1.8 !important;
}`,
  },
  {
    label: t('settings.customCss.hideImages'),
    description: t('settings.customCss.hideImagesDesc'),
    css: `/* Hide images */
article img, [class*="content"] img {
  display: none !important;
}`,
  },
];

export function CustomCssSettings() {
  const [css, setCss] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.getCustomCss()
      .then((data) => {
        setCss(data.css || '');
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateCustomCss(css);
      // Immediately inject + cache in localStorage
      const { saveAndInjectCss } = await import('@/hooks/use-custom-css');
      saveAndInjectCss(css);
      toast.success(t('settings.customCss.saved'));
      setDirty(false);
    } catch {
      toast.error(t('settings.common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (presetCss: string) => {
    const newCss = css ? `${css}\n\n${presetCss}` : presetCss;
    setCss(newCss);
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-5 h-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Code className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.customCss.title')}</h2>
      </div>

      <p className="text-sm text-muted">
        {t('settings.customCss.desc')}
      </p>

      {/* Presets */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Wand2 className="w-4 h-4 text-muted" />
          <span className="text-sm font-medium text-secondary">{t('settings.customCss.presets')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CSS_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset.css)}
              title={preset.description}
              className="px-3 py-1.5 text-xs rounded-lg border border-default hover:bg-[rgb(var(--bg-hover))] text-secondary transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* CSS Editor */}
      <textarea
        value={css}
        onChange={(e) => {
          setCss(e.target.value);
          setDirty(true);
        }}
        placeholder={'/* Custom CSS */\n\nbody {\n  font-family: "Source Han Sans", sans-serif;\n}'}
        className="w-full h-64 px-4 py-3 font-mono text-sm border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] placeholder-[rgb(var(--text-muted))] focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-y"
        spellCheck={false}
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {t('settings.customCss.charLimit')} · {t('settings.customCss.overrideHint')} <code className="px-1 py-0.5 rounded bg-[rgb(var(--bg-active))] text-xs">!important</code> {t('settings.customCss.overrideHint')}
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {t('settings.customCss.saveStyle')}
        </button>
      </div>
    </div>
  );
}
