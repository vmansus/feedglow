'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TextSelectionInfo {
  text: string;
  positionStart: number;
  positionEnd: number;
  xpath: string;
  rect: DOMRect;
}

/**
 * Hook to detect text selection within a container element.
 * Once a selection is captured, it persists until explicitly cleared
 * (prevents toolbar from disappearing when textarea steals focus).
 */
export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelectionInfo | null>(null);
  const hasSelection = useRef(false);

  const getXPath = useCallback((node: Node, container: HTMLElement): string => {
    const parts: string[] = [];
    let current: Node | null = node;
    while (current && current !== container) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const el = current as Element;
        const tagName = el.tagName.toLowerCase();
        const siblings = el.parentNode
          ? Array.from(el.parentNode.children).filter((c) => c.tagName === el.tagName)
          : [];
        const index = siblings.indexOf(el) + 1;
        parts.unshift(siblings.length > 1 ? `${tagName}[${index}]` : tagName);
      }
      current = current.parentNode;
    }
    return parts.length > 0 ? '/' + parts.join('/') : '/';
  }, []);

  const getOffsetInContainer = useCallback(
    (node: Node, offset: number, container: HTMLElement): number => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      while (walker.nextNode()) {
        if (walker.currentNode === node) {
          return charCount + offset;
        }
        charCount += (walker.currentNode.textContent || '').length;
      }
      return charCount;
    },
    []
  );

  const handleSelectionChange = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      // Don't auto-clear if we already have a captured selection.
      // This prevents the toolbar from disappearing when textarea
      // steals focus or the user moves their mouse.
      // Selection is only cleared via explicit clearSelection().
      return;
    }

    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();

    if (!text || text.length < 2) return;

    // Make sure selection is within our container
    if (!container.contains(range.commonAncestorContainer)) return;

    // Skip selections within [data-no-highlight] zones (e.g. AI Summary)
    const ancestor = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (ancestor?.closest('[data-no-highlight]')) return;

    const rect = range.getBoundingClientRect();
    const positionStart = getOffsetInContainer(range.startContainer, range.startOffset, container);
    const positionEnd = getOffsetInContainer(range.endContainer, range.endOffset, container);
    const xpath = getXPath(range.startContainer, container);

    hasSelection.current = true;
    setSelection({
      text,
      positionStart,
      positionEnd,
      xpath,
      rect,
    });
  }, [containerRef, getOffsetInContainer, getXPath]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // Also clear on mousedown outside toolbar (on the content area)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // If clicking on a highlight-toolbar element or a <mark>, don't clear
      const target = e.target as HTMLElement;
      if (target.closest('[data-highlight-toolbar]')) return;
      if (target.closest('mark[data-highlight-id]')) return;

      // If we have a selection and user clicks elsewhere, clear it
      if (hasSelection.current) {
        // Small delay to let new selection happen first
        setTimeout(() => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) {
            hasSelection.current = false;
            setSelection(null);
          }
        }, 100);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const clearSelection = useCallback(() => {
    hasSelection.current = false;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  // Allow programmatic selection (e.g. clicking on a highlight)
  const setManualSelection = useCallback((info: TextSelectionInfo) => {
    hasSelection.current = true;
    setSelection(info);
  }, []);

  return { selection, clearSelection, setManualSelection };
}
