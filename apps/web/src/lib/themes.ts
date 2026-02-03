/**
 * FeedGlow Theme System
 * Preset themes + custom accent color support
 */

export interface ThemeColors {
  bgBase: string;
  bgElevated: string;
  bgHover: string;
  bgActive: string;
  borderDefault: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  accent: string; // HSL: "249 115 22" (orange)
  isDark: boolean;
  colors: ThemeColors;
}

// Built-in preset themes
export const presetThemes: ThemePreset[] = [
  {
    id: 'dark-default',
    name: 'Midnight',
    description: 'Default dark theme',
    accent: '249 115 22', // Orange
    isDark: true,
    colors: {
      bgBase: '10 10 10',
      bgElevated: '18 18 18',
      bgHover: '38 38 38',
      bgActive: '64 64 64',
      borderDefault: '38 38 38',
      borderSubtle: '28 28 28',
      textPrimary: '250 250 250',
      textSecondary: '163 163 163',
      textMuted: '115 115 115',
    },
  },
  {
    id: 'light-default',
    name: 'Daylight',
    description: 'Clean light theme',
    accent: '249 115 22', // Orange
    isDark: false,
    colors: {
      bgBase: '255 255 255',
      bgElevated: '249 250 251',
      bgHover: '243 244 246',
      bgActive: '229 231 235',
      borderDefault: '229 231 235',
      borderSubtle: '243 244 246',
      textPrimary: '17 24 39',
      textSecondary: '107 114 128',
      textMuted: '156 163 175',
    },
  },
  {
    id: 'dark-ocean',
    name: 'Deep Ocean',
    description: 'Dark blue tones',
    accent: '59 130 246', // Blue
    isDark: true,
    colors: {
      bgBase: '8 12 21',
      bgElevated: '15 23 42',
      bgHover: '30 41 59',
      bgActive: '51 65 85',
      borderDefault: '30 41 59',
      borderSubtle: '20 30 48',
      textPrimary: '248 250 252',
      textSecondary: '148 163 184',
      textMuted: '100 116 139',
    },
  },
  {
    id: 'dark-forest',
    name: 'Forest',
    description: 'Nature-inspired green',
    accent: '34 197 94', // Green
    isDark: true,
    colors: {
      bgBase: '5 10 8',
      bgElevated: '10 20 15',
      bgHover: '20 40 30',
      bgActive: '35 60 45',
      borderDefault: '20 40 30',
      borderSubtle: '15 30 22',
      textPrimary: '245 250 248',
      textSecondary: '156 175 165',
      textMuted: '100 120 110',
    },
  },
  {
    id: 'dark-purple',
    name: 'Nebula',
    description: 'Cosmic purple vibes',
    accent: '168 85 247', // Purple
    isDark: true,
    colors: {
      bgBase: '12 8 18',
      bgElevated: '20 15 30',
      bgHover: '35 28 50',
      bgActive: '55 45 75',
      borderDefault: '35 28 50',
      borderSubtle: '25 20 38',
      textPrimary: '250 248 252',
      textSecondary: '170 160 185',
      textMuted: '120 110 140',
    },
  },
  {
    id: 'dark-rose',
    name: 'Rosewood',
    description: 'Warm rose tones',
    accent: '244 63 94', // Rose
    isDark: true,
    colors: {
      bgBase: '15 10 12',
      bgElevated: '25 18 20',
      bgHover: '45 35 38',
      bgActive: '65 52 56',
      borderDefault: '45 35 38',
      borderSubtle: '32 25 28',
      textPrimary: '252 248 249',
      textSecondary: '180 165 170',
      textMuted: '130 118 122',
    },
  },
  {
    id: 'light-warm',
    name: 'Cream',
    description: 'Warm, easy on the eyes',
    accent: '249 115 22', // Orange
    isDark: false,
    colors: {
      bgBase: '255 253 248',
      bgElevated: '252 250 245',
      bgHover: '245 242 235',
      bgActive: '235 230 220',
      borderDefault: '235 230 220',
      borderSubtle: '245 242 235',
      textPrimary: '40 35 30',
      textSecondary: '100 90 80',
      textMuted: '150 140 130',
    },
  },
  {
    id: 'oled',
    name: 'OLED Black',
    description: 'True black for OLED screens',
    accent: '249 115 22', // Orange
    isDark: true,
    colors: {
      bgBase: '0 0 0',
      bgElevated: '12 12 12',
      bgHover: '28 28 28',
      bgActive: '48 48 48',
      borderDefault: '28 28 28',
      borderSubtle: '18 18 18',
      textPrimary: '255 255 255',
      textSecondary: '170 170 170',
      textMuted: '110 110 110',
    },
  },
];

// Accent color presets
export const accentColors = [
  { name: 'Orange', value: '249 115 22', hex: '#f97316' },
  { name: 'Blue', value: '59 130 246', hex: '#3b82f6' },
  { name: 'Green', value: '34 197 94', hex: '#22c55e' },
  { name: 'Purple', value: '168 85 247', hex: '#a855f7' },
  { name: 'Rose', value: '244 63 94', hex: '#f43f5e' },
  { name: 'Cyan', value: '6 182 212', hex: '#06b6d4' },
  { name: 'Yellow', value: '234 179 8', hex: '#eab308' },
  { name: 'Teal', value: '20 184 166', hex: '#14b8a6' },
];

export interface CustomTheme {
  presetId: string;
  customAccent?: string; // Optional custom accent override
}

export function getThemeById(id: string): ThemePreset | undefined {
  return presetThemes.find((t) => t.id === id);
}

export function applyTheme(preset: ThemePreset, customAccent?: string) {
  const root = document.documentElement;
  const accent = customAccent || preset.accent;

  // Apply dark/light class
  if (preset.isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Apply CSS variables
  root.style.setProperty('--bg-base', preset.colors.bgBase);
  root.style.setProperty('--bg-elevated', preset.colors.bgElevated);
  root.style.setProperty('--bg-hover', preset.colors.bgHover);
  root.style.setProperty('--bg-active', preset.colors.bgActive);
  root.style.setProperty('--border-default', preset.colors.borderDefault);
  root.style.setProperty('--border-subtle', preset.colors.borderSubtle);
  root.style.setProperty('--text-primary', preset.colors.textPrimary);
  root.style.setProperty('--text-secondary', preset.colors.textSecondary);
  root.style.setProperty('--text-muted', preset.colors.textMuted);

  // Apply accent color
  root.style.setProperty('--color-primary', accent);
  root.style.setProperty('--color-primary-rgb', accent.replace(/\s/g, ', '));
}

export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '249 115 22';
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

export function rgbToHex(rgb: string): string {
  const parts = rgb.split(' ').map(Number);
  if (parts.length !== 3) return '#f97316';
  return '#' + parts.map((x) => x.toString(16).padStart(2, '0')).join('');
}
