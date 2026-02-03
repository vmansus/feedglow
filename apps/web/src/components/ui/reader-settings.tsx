'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, Minus, Plus } from 'lucide-react';

interface ReaderSettings {
  fontSize: number;
  fontFamily: 'sans' | 'serif' | 'mono';
  lineHeight: number;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 16,
  fontFamily: 'sans',
  lineHeight: 1.75,
};

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
  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title="Reader settings"
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
              className="absolute right-0 top-full mt-2 z-50 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4"
            >
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Reading Settings</h3>
              
              {/* Font Size */}
              <div className="mb-4">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Font Size</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })}
                    className="p-1.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="flex-1 text-center text-sm font-medium">{settings.fontSize}px</span>
                  <button
                    onClick={() => updateSettings({ fontSize: Math.min(24, settings.fontSize + 2) })}
                    className="p-1.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Font Family */}
              <div className="mb-4">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Font Family</label>
                <div className="flex gap-1">
                  {[
                    { value: 'sans', label: 'Sans', class: 'font-sans' },
                    { value: 'serif', label: 'Serif', class: 'font-serif' },
                    { value: 'mono', label: 'Mono', class: 'font-mono' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => updateSettings({ fontFamily: option.value as ReaderSettings['fontFamily'] })}
                      className={`flex-1 py-1.5 text-sm rounded transition-colors ${option.class} ${
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
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Line Height</label>
                <div className="flex gap-1">
                  {[
                    { value: 1.5, label: 'Tight' },
                    { value: 1.75, label: 'Normal' },
                    { value: 2, label: 'Loose' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => updateSettings({ lineHeight: option.value })}
                      className={`flex-1 py-1.5 text-sm rounded transition-colors ${
                        settings.lineHeight === option.value
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset */}
              <button
                onClick={() => updateSettings(DEFAULT_SETTINGS)}
                className="w-full mt-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Reset to defaults
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
  };
}
