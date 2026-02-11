'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, Minus, Plus } from 'lucide-react';
import { t } from '@/lib/i18n';

interface ReaderSettings {
  fontSize: number;
  fontFamily: 'sans' | 'serif' | 'mono';
  lineHeight: number;
  contentWidth: number;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 16,
  fontFamily: 'sans',
  lineHeight: 1.75,
  contentWidth: 720,
};

type ThemePreset = {
  key: string;
  labelKey: string;
  settings: ReaderSettings;
};

const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'default',
    labelKey: 'readerSettings.default',
    settings: { fontFamily: 'sans', fontSize: 16, lineHeight: 1.75, contentWidth: 720 },
  },
  {
    key: 'serif',
    labelKey: 'readerSettings.serif',
    settings: { fontFamily: 'serif', fontSize: 17, lineHeight: 1.85, contentWidth: 680 },
  },
  {
    key: 'compact',
    labelKey: 'readerSettings.compact',
    settings: { fontFamily: 'sans', fontSize: 14, lineHeight: 1.5, contentWidth: 800 },
  },
  {
    key: 'relaxed',
    labelKey: 'readerSettings.relaxed',
    settings: { fontFamily: 'sans', fontSize: 18, lineHeight: 2.0, contentWidth: 640 },
  },
  {
    key: 'code',
    labelKey: 'readerSettings.codeOptimized',
    settings: { fontFamily: 'mono', fontSize: 15, lineHeight: 1.6, contentWidth: 860 },
  },
];

function getActivePreset(settings: ReaderSettings): string | null {
  for (const preset of THEME_PRESETS) {
    const p = preset.settings;
    if (
      p.fontFamily === settings.fontFamily &&
      p.fontSize === settings.fontSize &&
      p.lineHeight === settings.lineHeight &&
      p.contentWidth === settings.contentWidth
    ) {
      return preset.key;
    }
  }
  return null;
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('feedglow-reader-settings');
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }, []);

  const updateSettings = (updates: Partial<ReaderSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('feedglow-reader-settings', JSON.stringify(newSettings));
  };

  return { settings, updateSettings, isOpen, setIsOpen };
}

interface ReaderSettingsButtonProps {
  settings: ReaderSettings;
  updateSettings: (updates: Partial<ReaderSettings>) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function ReaderSettingsButton({ settings, updateSettings, isOpen, setIsOpen }: ReaderSettingsButtonProps) {
  const activePreset = getActivePreset(settings);

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title={t('readerSettings.title')}
      >
        <Settings2 className="w-4 h-4" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4"
            >
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('readerSettings.title')}</h3>

              {/* Theme Presets */}
              <div className="mb-4">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('readerSettings.presets')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => updateSettings(preset.settings)}
                      className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                        activePreset === preset.key
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 ring-1 ring-orange-400/50'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {t(preset.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                {/* Font Size */}
                <div className="mb-4">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('readerSettings.fontSize')}</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateSettings({ fontSize: Math.max(12, settings.fontSize - 1) })}
                      className="p-1.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="flex-1 text-center text-sm font-medium text-gray-900 dark:text-white">{settings.fontSize}px</span>
                    <button
                      onClick={() => updateSettings({ fontSize: Math.min(24, settings.fontSize + 1) })}
                      className="p-1.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Font Family */}
                <div className="mb-4">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('readerSettings.fontFamily')}</label>
                  <div className="flex gap-1">
                    {[
                      { value: 'sans', label: t('readerSettings.sansSerif'), class: 'font-sans' },
                      { value: 'serif', label: t('readerSettings.serifFont'), class: 'font-serif' },
                      { value: 'mono', label: t('readerSettings.monospace'), class: 'font-mono' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateSettings({ fontFamily: option.value as ReaderSettings['fontFamily'] })}
                        className={`flex-1 py-1.5 text-xs rounded transition-colors ${option.class} ${
                          settings.fontFamily === option.value
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                            : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Line Height */}
                <div className="mb-4">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('readerSettings.lineHeight')}</label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-6">{t('readerSettings.tight')}</span>
                    <input
                      type="range"
                      min="1.2"
                      max="2.4"
                      step="0.05"
                      value={settings.lineHeight}
                      onChange={(e) => updateSettings({ lineHeight: parseFloat(e.target.value) })}
                      className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-orange-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-6">{t('readerSettings.loose')}</span>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-8 text-right">{settings.lineHeight.toFixed(2)}</span>
                  </div>
                </div>

                {/* Content Width */}
                <div className="mb-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('readerSettings.contentWidth')}</label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-6">{t('readerSettings.narrow')}</span>
                    <input
                      type="range"
                      min="600"
                      max="900"
                      step="10"
                      value={settings.contentWidth}
                      onChange={(e) => updateSettings({ contentWidth: parseInt(e.target.value) })}
                      className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-orange-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-6">{t('readerSettings.wide')}</span>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-12 text-right">{settings.contentWidth}px</span>
                  </div>
                </div>
              </div>

              {/* Reset */}
              <button
                onClick={() => updateSettings(DEFAULT_SETTINGS)}
                className="w-full mt-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                {t('readerSettings.resetDefault')}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// CSS variables for reader content
export function getReaderStyles(settings: ReaderSettings): React.CSSProperties {
  const fontFamilyMap = {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, monospace',
  };

  return {
    fontSize: `${settings.fontSize}px`,
    fontFamily: fontFamilyMap[settings.fontFamily],
    lineHeight: settings.lineHeight,
    maxWidth: `${settings.contentWidth}px`,
  };
}
