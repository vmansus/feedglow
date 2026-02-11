'use client';

import { ReactNode, useEffect, useState, useRef, useCallback } from 'react';
import { cn } from '@feedglow/ui';
import { useLayout } from '@/contexts/layout-context';
import { ChevronLeft } from 'lucide-react';
import { t } from '@/lib/i18n';

interface ResizableLayoutProps {
  sidebar?: ReactNode;
  list: ReactNode;
  reader: ReactNode;
  listHeader?: ReactNode;
  defaultListSize?: number;
  minListSize?: number;
  maxListSize?: number;
  selectedEntryId?: number | null;
  onClearSelection?: () => void;
}

export function ResizableLayout({
  list,
  reader,
  listHeader,
  defaultListSize = 384,
  minListSize = 280,
  maxListSize = 600,
  selectedEntryId,
  onClearSelection,
}: ResizableLayoutProps) {
  const [listWidth, setListWidth] = useState(defaultListSize);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { fullscreen } = useLayout();

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  // Mobile: show list or reader based on selection
  if (isMobile) {
    const showReader = selectedEntryId !== undefined && selectedEntryId !== null;
    
    return (
      <div className="flex flex-col h-full">
        {showReader ? (
          // Show reader with back button
          <div className="flex-1 flex flex-col surface-elevated overflow-hidden">
            {onClearSelection && (
              <div className="flex items-center gap-2 px-4 py-3 border-b border-default surface-base">
                <button
                  onClick={onClearSelection}
                  className="flex items-center gap-1 text-sm text-muted hover:text-[rgb(var(--text-primary))] transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                  {t('layout.backToList')}
                </button>
              </div>
            )}
            <div className="flex-1 overflow-hidden">{reader}</div>
          </div>
        ) : (
          // Show list
          <div className="flex-1 flex flex-col surface-base overflow-hidden">
            {listHeader && (
              <div className="sticky top-0 surface-base z-10 border-b border-default">
                {listHeader}
              </div>
            )}
            <div className="flex-1 overflow-y-auto">{list}</div>
          </div>
        )}
      </div>
    );
  }

  // Desktop: side-by-side layout
  return (
    <div ref={containerRef} className="flex h-full">
      {/* List Panel - hidden in fullscreen */}
      {!fullscreen && (
        <>
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
        </>
      )}

      {/* Reader Panel */}
      <div className="flex-1 surface-elevated overflow-hidden">{reader}</div>

      {/* Overlay during resize */}
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  );
}
