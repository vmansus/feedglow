'use client';

import { ReactNode, useEffect, useState, useRef, useCallback } from 'react';
import { cn } from '@feedglow/ui';

interface ResizableLayoutProps {
  sidebar?: ReactNode;
  list: ReactNode;
  reader: ReactNode;
  listHeader?: ReactNode;
  defaultListSize?: number;
  minListSize?: number;
  maxListSize?: number;
}

export function ResizableLayout({
  list,
  reader,
  listHeader,
  defaultListSize = 384,
  minListSize = 280,
  maxListSize = 600,
}: ResizableLayoutProps) {
  const [listWidth, setListWidth] = useState(defaultListSize);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('feedglow-list-width');
    if (saved) {
      const width = parseInt(saved, 10);
      if (width >= minListSize && width <= maxListSize) {
        setListWidth(width);
      }
    }
  }, [minListSize, maxListSize]);

  useEffect(() => {
    if (!isResizing) {
      localStorage.setItem('feedglow-list-width', String(listWidth));
    }
  }, [listWidth, isResizing]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      setListWidth(Math.min(maxListSize, Math.max(minListSize, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minListSize, maxListSize]);

  return (
    <div ref={containerRef} className="flex h-full">
      {/* List Panel */}
      <div
        style={{ width: listWidth }}
        className="flex flex-col surface-base border-r border-default flex-shrink-0"
      >
        {listHeader && (
          <div className="sticky top-0 surface-base z-10 border-b border-default">
            {listHeader}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{list}</div>
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "w-1 cursor-col-resize transition-colors flex-shrink-0",
          isResizing 
            ? "bg-orange-500" 
            : "bg-[rgb(var(--border-default))] hover:bg-orange-400"
        )}
      />

      {/* Reader Panel */}
      <div className="flex-1 surface-elevated overflow-hidden">{reader}</div>

      {/* Overlay during resize */}
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  );
}
