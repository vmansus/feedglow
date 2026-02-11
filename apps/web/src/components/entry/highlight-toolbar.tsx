'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Highlighter, MessageSquarePlus } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { t } from '@/lib/i18n';
import type { TextSelectionInfo } from '@/hooks/use-text-selection';

const COLORS = [
  { name: 'yellow', bg: 'bg-yellow-400', ring: 'ring-yellow-500' },
  { name: 'green', bg: 'bg-green-400', ring: 'ring-green-500' },
  { name: 'blue', bg: 'bg-blue-400', ring: 'ring-blue-500' },
  { name: 'red', bg: 'bg-red-400', ring: 'ring-red-500' },
] as const;

type HighlightColor = (typeof COLORS)[number]['name'];

interface ExistingHighlight {
  id: number;
  text: string;
  note?: string | null;
  color: string;
  position_start?: number | null;
  position_end?: number | null;
}

interface HighlightToolbarProps {
  selection: TextSelectionInfo | null;
  existingHighlights?: ExistingHighlight[];
  onSave: (data: {
    text: string;
    note?: string;
    color: HighlightColor;
    positionStart: number;
    positionEnd: number;
    xpath: string;
  }) => void;
  onUpdateNote?: (id: number, note: string) => void;
  onDismiss: () => void;
}

export function HighlightToolbar({ selection, existingHighlights, onSave, onUpdateNote, onDismiss }: HighlightToolbarProps) {
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Check if selection overlaps with existing highlight
  const matchingHighlight = useMemo(() => {
    if (!selection || !existingHighlights?.length) return null;
    return existingHighlights.find(h => {
      // Check if selected text is within or contains an existing highlight
      if (h.text && selection.text.includes(h.text)) return true;
      if (h.text && h.text.includes(selection.text)) return true;
      // Check by position overlap
      if (h.position_start != null && h.position_end != null) {
        const overlap = selection.positionStart < h.position_end && selection.positionEnd > h.position_start;
        if (overlap) return true;
      }
      return false;
    });
  }, [selection, existingHighlights]);

  // Reset state when selection changes
  useEffect(() => {
    if (selection) {
      if (matchingHighlight) {
        // Existing highlight: auto-open note editor with existing note
        setShowNoteInput(true);
        setNote(matchingHighlight.note || '');
        setSelectedColor((matchingHighlight.color as HighlightColor) || 'yellow');
      } else {
        setSelectedColor('yellow');
        setShowNoteInput(false);
        setNote('');
      }
      setSaving(false);
    }
  }, [selection?.text]);

  // Focus note input when shown
  useEffect(() => {
    if (showNoteInput && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [showNoteInput]);

  if (!selection || !mounted) return null;

  // Position the toolbar above the selection, clamped to viewport
  const toolbarWidth = 260;
  const viewportWidth = window.innerWidth;
  const rawLeft = selection.rect.left + selection.rect.width / 2 - toolbarWidth / 2;
  const toolbarStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(rawLeft, viewportWidth - toolbarWidth - 8)),
    top: Math.max(8, selection.rect.top - (showNoteInput ? 180 : 52)),
    zIndex: 99999,
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (matchingHighlight && onUpdateNote) {
        // Update existing highlight's note
        await onUpdateNote(matchingHighlight.id, note.trim());
      } else {
        await onSave({
          text: selection.text,
          note: note.trim() || undefined,
          color: selectedColor,
          positionStart: selection.positionStart,
          positionEnd: selection.positionEnd,
          xpath: selection.xpath,
        });
      }
    } finally {
      setSaving(false);
      onDismiss();
    }
  };

  const handleQuickSave = async (color: HighlightColor) => {
    if (showNoteInput) {
      setSelectedColor(color);
      return;
    }
    setSelectedColor(color);
    setSaving(true);
    try {
      await onSave({
        text: selection.text,
        color,
        positionStart: selection.positionStart,
        positionEnd: selection.positionEnd,
        xpath: selection.xpath,
      });
    } finally {
      setSaving(false);
      onDismiss();
    }
  };

  const toolbar = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        style={toolbarStyle}
        className="pointer-events-auto"
        data-highlight-toolbar
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className={cn(
          "bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--border-default))] rounded-lg shadow-xl",
          showNoteInput ? "w-64" : ""
        )}>
          {/* Note input area */}
          {showNoteInput && (
            <div className="p-2 border-b border-[rgb(var(--border-default))]">
              <textarea
                ref={noteInputRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('entry.highlight.addNotePlaceholder')}
                className="w-full h-16 text-sm bg-transparent border border-[rgb(var(--border-default))] rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 text-[rgb(var(--text-primary))] placeholder:text-[rgb(var(--text-muted))]"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSave();
                  }
                  if (e.key === 'Escape') {
                    setShowNoteInput(false);
                    setNote('');
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2 mt-2">
                <span className="text-[10px] text-[rgb(var(--text-muted))] mr-auto">⌘+Enter</span>
                <button
                  onClick={() => { setShowNoteInput(false); setNote(''); }}
                  className="px-3 py-1 text-xs rounded-md bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] transition-colors"
                >
                  {t('action.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1 text-xs rounded-md bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {saving ? t('entry.highlight.saving') : t('action.save')}
                </button>
              </div>
            </div>
          )}

          {/* Main toolbar */}
          {matchingHighlight ? (
            /* Existing highlight mode: note-only, no color circles */
            <div className="flex items-center gap-1.5 p-2">
              <Highlighter className="w-3.5 h-3.5 text-orange-500 mr-0.5" />
              <span className="text-xs text-[rgb(var(--text-secondary))]">
                {matchingHighlight.note ? t('entry.highlight.editNote') : t('entry.highlight.addNote')}
              </span>
            </div>
          ) : (
            /* New highlight mode: color circles + note button */
            <div className="flex items-center gap-1.5 p-2">
              <Highlighter className="w-3.5 h-3.5 text-[rgb(var(--text-muted))] mr-0.5" />

              {COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handleQuickSave(color.name)}
                  className={cn(
                    'w-6 h-6 rounded-full transition-all hover:scale-110',
                    color.bg,
                    selectedColor === color.name && showNoteInput && `ring-2 ${color.ring} ring-offset-1 ring-offset-[rgb(var(--bg-elevated))]`
                  )}
                  title={color.name}
                />
              ))}

              <div className="w-px h-5 bg-[rgb(var(--border-default))] mx-1" />

              <button
                onClick={() => setShowNoteInput(!showNoteInput)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors',
                  showNoteInput
                    ? 'bg-orange-500/20 text-orange-500'
                    : 'hover:bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-muted))]'
                )}
                title={t('entry.highlight.addNote')}
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>{t('entry.highlight.note')}</span>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );

  // Use portal to escape any CSS transform stacking contexts (e.g. framer-motion)
  return createPortal(toolbar, document.body);
}


// Highlight rendering moved to bilingual-content.tsx
