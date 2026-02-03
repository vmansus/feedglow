'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyTheme, getThemeById, type CustomTheme } from '@/lib/themes';

interface ThemeContextType {
  presetId: string;
  customAccent: string | null;
  isDark: boolean;
  setPreset: (presetId: string) => void;
  setAccent: (accent: string | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'feedglow-theme';
const DEFAULT_THEME = 'dark-default';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [presetId, setPresetId] = useState<string>(DEFAULT_THEME);
  const [customAccent, setCustomAccent] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true);

  // Load saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: CustomTheme = JSON.parse(saved);
        if (getThemeById(parsed.presetId)) {
          setPresetId(parsed.presetId);
          setCustomAccent(parsed.customAccent || null);
        }
      } catch {
        // Invalid saved theme, use default
      }
    }
  }, []);

  // Apply theme when it changes
  useEffect(() => {
    const preset = getThemeById(presetId);
    if (!preset) return;

    applyTheme(preset, customAccent || undefined);
    setIsDark(preset.isDark);

    // Save to localStorage
    const toSave: CustomTheme = { presetId };
    if (customAccent) toSave.customAccent = customAccent;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }, [presetId, customAccent]);

  const setPreset = (newPresetId: string) => {
    if (getThemeById(newPresetId)) {
      setPresetId(newPresetId);
    }
  };

  const setAccent = (accent: string | null) => {
    setCustomAccent(accent);
  };

  return (
    <ThemeContext.Provider value={{ presetId, customAccent, isDark, setPreset, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
