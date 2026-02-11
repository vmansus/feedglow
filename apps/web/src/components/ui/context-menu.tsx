'use client';

import { useState, useRef, useEffect, createContext, useContext, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@feedglow/ui';
import { ChevronRight, Check } from 'lucide-react';

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  /** Submenu items — renders as expandable on hover */
  children?: ContextMenuItem[];
  /** Show a checkmark (for current selection) */
  checked?: boolean;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Indentation depth (for tree display) */
  depth?: number;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface ContextMenuContextValue {
  showMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  hideMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

export function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error('useContextMenu must be used within ContextMenuProvider');
  return ctx;
}

// ---- Submenu Item ----
function SubMenuItem({
  item,
  onClose,
  parentRight,
  parentTop,
  index,
}: {
  item: ContextMenuItem;
  onClose: () => void;
  parentRight: number;
  parentTop: number;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), 120);
  };

  const handleLeave = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  // Calculate submenu position
  const rect = itemRef.current?.getBoundingClientRect();
  const subX = parentRight;
  const subY = rect ? rect.top : parentTop + index * 36;

  return (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div
        className={cn(
          "w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors cursor-default",
          "text-secondary hover:bg-[rgb(var(--bg-hover))] hover:text-[rgb(var(--text-primary))]"
        )}
      >
        {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
        <span className="flex-1">{item.label}</span>
        <ChevronRight className="w-3.5 h-3.5 text-muted" />
      </div>

      {/* Submenu */}
      {open && item.children && item.children.length > 0 && createPortal(
        <div
          data-context-menu
          className="fixed z-[60] min-w-[160px] py-1 bg-[rgb(var(--bg-elevated))] border border-default rounded-lg shadow-xl animate-in fade-in-0 slide-in-from-left-1 duration-100"
          style={{
            left: Math.min(subX + 4, window.innerWidth - 200),
            top: Math.min(subY, window.innerHeight - item.children.length * 36 - 20),
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {item.children.map((child, ci) => {
            if (child.divider) {
              return <div key={ci} className="h-px bg-[rgb(var(--border-default))] my-1" />;
            }
            const depthPadding = (child.depth || 0) * 16;
            return (
              <button
                key={ci}
                onClick={() => {
                  if (!child.disabled) {
                    child.onClick();
                    onClose();
                  }
                }}
                disabled={child.disabled}
                className={cn(
                  "w-full py-2 text-sm text-left flex items-center gap-2 transition-colors",
                  child.disabled
                    ? "text-muted cursor-not-allowed"
                    : child.danger
                      ? "text-red-500 hover:bg-red-500/10"
                      : "text-secondary hover:bg-[rgb(var(--bg-hover))] hover:text-[rgb(var(--text-primary))]"
                )}
                style={{ paddingLeft: `${12 + depthPadding}px`, paddingRight: '12px' }}
              >
                {child.checked ? (
                  <Check className="w-4 h-4 text-orange-500 flex-shrink-0" />
                ) : (
                  <span className="w-4 h-4 flex-shrink-0" />
                )}
                {child.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const showMenu = (e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();

    let x = e.clientX;
    let y = e.clientY;

    // Adjust if near right edge (menu ~220px + potential submenu ~200px)
    if (x + 220 > window.innerWidth) {
      x = window.innerWidth - 230;
    }

    // Adjust if near bottom edge
    const visibleItems = items.filter(i => !i.divider);
    const estimatedHeight = visibleItems.length * 36 + items.filter(i => i.divider).length * 9 + 8;
    if (y + estimatedHeight > window.innerHeight) {
      y = window.innerHeight - estimatedHeight - 10;
    }

    setMenu({ isOpen: true, x, y, items });
  };

  const hideMenu = () => {
    setMenu(prev => ({ ...prev, isOpen: false }));
  };

  // Click outside to close
  useEffect(() => {
    if (!menu.isOpen) return;

    const handleClick = (e: MouseEvent) => {
      // Check if click is inside any context menu (including submenus)
      const target = e.target as HTMLElement;
      if (target.closest('[data-context-menu]')) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        hideMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideMenu();
    };

    // Use setTimeout to avoid closing from the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu.isOpen]);

  const menuWidth = 220;

  return (
    <ContextMenuContext.Provider value={{ showMenu, hideMenu }}>
      {children}
      {menu.isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          data-context-menu
          className="fixed z-50 py-1 bg-[rgb(var(--bg-elevated))] border border-default rounded-lg shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ left: menu.x, top: menu.y, minWidth: `${menuWidth}px` }}
        >
          {menu.items.map((item, i) => {
            if (item.divider) {
              return <div key={i} className="h-px bg-[rgb(var(--border-default))] my-1" />;
            }

            // Item with submenu
            if (item.children && item.children.length > 0) {
              return (
                <SubMenuItem
                  key={i}
                  item={item}
                  onClose={hideMenu}
                  parentRight={menu.x + menuWidth}
                  parentTop={menu.y}
                  index={i}
                />
              );
            }

            // Regular item
            return (
              <button
                key={i}
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick();
                    hideMenu();
                  }
                }}
                disabled={item.disabled}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors",
                  item.disabled 
                    ? "text-muted cursor-not-allowed" 
                    : item.danger 
                      ? "text-red-500 hover:bg-red-500/10" 
                      : "text-secondary hover:bg-[rgb(var(--bg-hover))] hover:text-[rgb(var(--text-primary))]"
                )}
              >
                {item.checked ? (
                  <Check className="w-4 h-4 text-orange-500 flex-shrink-0" />
                ) : item.icon ? (
                  <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>
                ) : null}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="text-xs text-muted ml-4">{item.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </ContextMenuContext.Provider>
  );
}
