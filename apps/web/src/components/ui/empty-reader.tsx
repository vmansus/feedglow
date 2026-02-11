'use client';

import { motion } from 'framer-motion';
import { t } from '@/lib/i18n';

const shortcuts = [
  { key: 'J / K', descKey: 'emptyReader.prevNext' },
  { key: 'V', descKey: 'emptyReader.openOriginal' },
  { key: 'S', descKey: 'emptyReader.star' },
  { key: 'F', descKey: 'emptyReader.fullscreen' },
];

export function EmptyReader() {
  return (
    <motion.div
      key="empty-reader"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-center h-full"
    >
      <div className="text-center max-w-xs">
        {/* Logo mark */}
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/20">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400/80">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>

        <p className="text-sm text-muted/60 mb-6">{t('emptyReader.selectArticle')}</p>

        {/* Shortcuts */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {shortcuts.map(s => (
            <div key={s.key} className="flex items-center gap-2 text-xs text-muted/40">
              <kbd className="px-1.5 py-0.5 min-w-[2rem] text-center bg-[rgb(var(--bg-hover))]/50 rounded text-muted/50 font-mono text-[10px]">
                {s.key}
              </kbd>
              <span>{t(s.descKey)}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
