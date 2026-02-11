'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Palette, Sparkles, Sun, Moon } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { useTheme } from '@/contexts/theme-context';
import { presetThemes, accentColors, hexToRgb, rgbToHex, type ThemePreset } from '@/lib/themes';

export function ThemeSettings() {
  const { presetId, customAccent, setPreset, setAccent } = useTheme();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customHex, setCustomHex] = useState(customAccent ? rgbToHex(customAccent) : '#f97316');

  const currentPreset = presetThemes.find((t) => t.id === presetId);
  const currentAccent = customAccent || currentPreset?.accent || '249 115 22';

  const handleCustomAccent = (hex: string) => {
    setCustomHex(hex);
    setAccent(hexToRgb(hex));
  };

  const resetAccent = () => {
    setAccent(null);
    setCustomHex(currentPreset?.accent ? rgbToHex(currentPreset.accent) : '#f97316');
  };

  return (
    <div className="space-y-8">
      {/* Theme Presets */}
      <div>
        <h3 className="text-sm font-medium text-[rgb(var(--text-primary))] mb-4 flex items-center gap-2">
          <Palette className="w-4 h-4 text-muted" />
          Theme
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {presetThemes.map((preset) => (
            <ThemeCard
              key={preset.id}
              preset={preset}
              isSelected={presetId === preset.id}
              onClick={() => setPreset(preset.id)}
              accent={currentAccent}
            />
          ))}
        </div>
      </div>

      {/* Accent Color */}
      <div>
        <h3 className="text-sm font-medium text-[rgb(var(--text-primary))] mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted" />
          Accent Color
        </h3>
        <div className="flex flex-wrap gap-3 items-center">
          {accentColors.map((color) => (
            <button
              key={color.name}
              onClick={() => {
                setAccent(color.value);
                setCustomHex(color.hex);
              }}
              className={cn(
                'w-9 h-9 rounded-full transition-all relative',
                currentAccent === color.value && 'ring-2 ring-offset-2 ring-offset-[rgb(var(--bg-base))]'
              )}
              style={{ 
                backgroundColor: color.hex,
                boxShadow: currentAccent === color.value 
                  ? `0 0 15px ${color.hex}80, 0 0 0 2px ${color.hex}` 
                  : 'none',
              }}
              title={color.name}
            >
              {currentAccent === color.value && (
                <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow" />
              )}
            </button>
          ))}
          
          {/* Custom color button */}
          <button
            onClick={() => setShowCustomPicker(!showCustomPicker)}
            className={cn(
              'w-9 h-9 rounded-full border-2 border-dashed transition-all flex items-center justify-center',
              showCustomPicker 
                ? 'border-[rgb(var(--text-primary))] bg-[rgb(var(--bg-hover))]' 
                : 'border-[rgb(var(--border-default))] hover:border-[rgb(var(--text-muted))]'
            )}
            title="Custom color"
          >
            <span className="text-lg">+</span>
          </button>

          {/* Reset button */}
          {customAccent && (
            <button
              onClick={resetAccent}
              className="text-xs text-muted hover:text-[rgb(var(--text-primary))] transition-colors ml-2"
            >
              Reset
            </button>
          )}
        </div>

        {/* Custom color picker */}
        <AnimatePresence>
          {showCustomPicker && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[rgb(var(--bg-elevated))] border border-default">
                <input
                  type="color"
                  value={customHex}
                  onChange={(e) => handleCustomAccent(e.target.value)}
                  className="w-12 h-12 rounded-lg cursor-pointer border-0 bg-transparent"
                />
                <div className="flex-1">
                  <label className="text-xs text-muted block mb-1">Hex</label>
                  <input
                    type="text"
                    value={customHex}
                    onChange={(e) => {
                      const hex = e.target.value;
                      if (/^#[0-9a-f]{6}$/i.test(hex)) {
                        handleCustomAccent(hex);
                      } else {
                        setCustomHex(hex);
                      }
                    }}
                    placeholder="#f97316"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-[rgb(var(--bg-hover))] border border-default focus:outline-none focus:border-[rgb(var(--color-primary))] text-[rgb(var(--text-primary))] font-mono"
                  />
                </div>
                <div
                  className="w-16 h-12 rounded-lg"
                  style={{ 
                    backgroundColor: customHex,
                    boxShadow: `0 0 20px ${customHex}40`
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface ThemeCardProps {
  preset: ThemePreset;
  isSelected: boolean;
  onClick: () => void;
  accent: string;
}

function ThemeCard({ preset, isSelected, onClick, accent }: ThemeCardProps) {
  const accentRgb = accent.replace(/\s/g, ', ');
  
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'relative rounded-xl overflow-hidden border-2 transition-all text-left',
        isSelected
          ? 'border-[rgb(var(--color-primary))]'
          : 'border-[rgb(var(--border-default))] hover:border-[rgb(var(--text-muted))]'
      )}
      style={{
        boxShadow: isSelected ? `0 0 20px rgba(${accentRgb}, 0.3)` : 'none',
      }}
    >
      {/* Preview */}
      <div
        className="h-16 p-2 flex flex-col gap-1"
        style={{ backgroundColor: `rgb(${preset.colors.bgBase})` }}
      >
        {/* Mini sidebar */}
        <div className="flex gap-1.5 h-full">
          <div 
            className="w-4 rounded"
            style={{ backgroundColor: `rgb(${preset.colors.bgElevated})` }}
          />
          <div className="flex-1 flex flex-col gap-1">
            <div 
              className="h-2 w-3/4 rounded"
              style={{ backgroundColor: `rgb(${preset.colors.bgHover})` }}
            />
            <div 
              className="h-2 w-1/2 rounded"
              style={{ backgroundColor: `rgb(${preset.colors.bgHover})` }}
            />
          </div>
          <div 
            className="w-1 rounded"
            style={{ 
              backgroundColor: `rgb(${preset.accent})`,
              boxShadow: `0 0 6px rgba(${preset.accent.replace(/\s/g, ', ')}, 0.5)`
            }}
          />
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5 bg-[rgb(var(--bg-elevated))]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[rgb(var(--text-primary))]">
            {preset.name}
          </span>
          {preset.isDark ? (
            <Moon className="w-3 h-3 text-muted" />
          ) : (
            <Sun className="w-3 h-3 text-muted" />
          )}
        </div>
        <p className="text-[10px] text-muted mt-0.5 truncate">
          {preset.description}
        </p>
      </div>

      {/* Selected check */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ 
            backgroundColor: `rgb(${accent})`,
            boxShadow: `0 0 10px rgba(${accentRgb}, 0.5)`
          }}
        >
          <Check className="w-3 h-3 text-white" />
        </motion.div>
      )}
    </motion.button>
  );
}
