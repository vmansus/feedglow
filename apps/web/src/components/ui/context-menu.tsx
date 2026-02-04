'use client';

import { useState, useRef, useEffect, createContext, useContext, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@feedglow/ui';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
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

    // Calculate position, ensuring menu stays in viewport
    let x = e.clientX;
    let y = e.clientY;

    // Adjust if near right edge (assume menu width ~200px)
    if (x + 200 > window.innerWidth) {
      x = window.innerWidth - 210;
    }

    // Adjust if near bottom edge (assume menu height ~items.length * 36px)
    const estimatedHeight = items.filter(i => !i.divider).length * 36 + items.filter(i => i.divider).length * 9;
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideMenu();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu.isOpen]);

  return (
    <ContextMenuContext.Provider value={{ showMenu, hideMenu }}>
      {children}
      {menu.isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] py-1 bg-[rgb(var(--bg-elevated))] border border-default rounded-lg shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.items.map((item, i) => {
            if (item.divider) {
              return <div key={i} className="h-px bg-[rgb(var(--border-default))] my-1" />;
            }

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
                {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </ContextMenuContext.Provider>
  );
}
