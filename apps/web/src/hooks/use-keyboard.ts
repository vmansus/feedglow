'use client';

import { useHotkeys } from 'react-hotkeys-hook';
import { useCallback, useState } from 'react';
import type { Entry } from '@feedglow/shared';

interface UseKeyboardNavigationOptions {
  entries: Entry[];
  selectedId?: number;
  onSelect: (entry: Entry) => void;
  onOpen?: (entry: Entry) => void;
  onClose?: () => void;
  onToggleStar?: (entry: Entry) => void;
  onToggleRead?: (entry: Entry) => void;
  enabled?: boolean;
}

export function useKeyboardNavigation({
  entries,
  selectedId,
  onSelect,
  onOpen,
  onClose,
  onToggleStar,
  onToggleRead,
  enabled = true,
}: UseKeyboardNavigationOptions) {
  const [showHelp, setShowHelp] = useState(false);

  const currentIndex = entries.findIndex((e) => e.id === selectedId);

  const selectNext = useCallback(() => {
    if (entries.length === 0) return;
    const nextIndex = currentIndex < entries.length - 1 ? currentIndex + 1 : currentIndex;
    onSelect(entries[nextIndex]);
  }, [entries, currentIndex, onSelect]);

  const selectPrev = useCallback(() => {
    if (entries.length === 0) return;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
    onSelect(entries[prevIndex]);
  }, [entries, currentIndex, onSelect]);

  const openSelected = useCallback(() => {
    if (selectedId && onOpen) {
      const entry = entries.find((e) => e.id === selectedId);
      if (entry) onOpen(entry);
    }
  }, [entries, selectedId, onOpen]);

  const toggleStar = useCallback(() => {
    if (selectedId && onToggleStar) {
      const entry = entries.find((e) => e.id === selectedId);
      if (entry) onToggleStar(entry);
    }
  }, [entries, selectedId, onToggleStar]);

  const toggleRead = useCallback(() => {
    if (selectedId && onToggleRead) {
      const entry = entries.find((e) => e.id === selectedId);
      if (entry) onToggleRead(entry);
    }
  }, [entries, selectedId, onToggleRead]);

  useHotkeys('j, down', selectNext, { enabled, preventDefault: true }, [selectNext]);
  useHotkeys('k, up', selectPrev, { enabled, preventDefault: true }, [selectPrev]);
  useHotkeys('enter, o', openSelected, { enabled, preventDefault: true }, [openSelected]);
  useHotkeys('escape', () => onClose?.(), { enabled }, [onClose]);
  useHotkeys('s', toggleStar, { enabled, preventDefault: true }, [toggleStar]);
  useHotkeys('m', toggleRead, { enabled, preventDefault: true }, [toggleRead]);
  useHotkeys('shift+/', () => setShowHelp((v) => !v), { enabled }, []);

  return {
    showHelp,
    setShowHelp,
    shortcuts: [
      { key: 'j / ↓', description: 'Next article' },
      { key: 'k / ↑', description: 'Previous article' },
      { key: 'Enter / o', description: 'Open article' },
      { key: 'Esc', description: 'Close reader' },
      { key: 's', description: 'Toggle star' },
      { key: 'm', description: 'Toggle read' },
      { key: '?', description: 'Show shortcuts' },
    ],
  };
}
