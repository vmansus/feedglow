'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@feedglow/ui';
import { useFeeds, useCategories } from '@/hooks';
import { useAuth } from '@/contexts/auth-context';
import { useCommandPalette } from '@/components/ui/command-palette';
import { 
  Newspaper, 
  Star, 
  Plus, 
  Settings, 
  LogOut, 
  Search,
  Folder,
  Inbox,
  Sparkles,
  Compass,
  BarChart3,
  Network,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react';
import { useLayout } from '@/contexts/layout-context';

// Generate consistent color from string
function stringToColor(str: string): string {
  const colors = [
    'from-orange-500 to-red-500',
    'from-purple-500 to-pink-500',
    'from-blue-500 to-cyan-500',
    'from-green-500 to-emerald-500',
    'from-yellow-500 to-orange-500',
    'from-indigo-500 to-purple-500',
    'from-pink-500 to-rose-500',
    'from-teal-500 to-green-500',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Sidebar() {
  const pathname = usePathname();
  const { feeds } = useFeeds();
  const { categories } = useCategories();
  const { user, logout } = useAuth();
  const { open: openCommandPalette } = useCommandPalette();
  const { sidebarCollapsed, toggleSidebar, fullscreen } = useLayout();

  const totalUnread = feeds?.reduce((acc, feed) => acc + (feed.unreadCount || 0), 0) || 0;

  // Hide sidebar completely in fullscreen mode
  if (fullscreen) {
    return null;
  }

  return (
    <aside className={cn(
      "h-screen border-r border-default surface-elevated flex flex-col transition-all duration-200",
      sidebarCollapsed ? "w-14" : "w-56"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center gap-2 p-3 border-b border-default",
        sidebarCollapsed ? "justify-center" : "justify-between"
      )}>
        {/* Logo */}
        <Link 
          href="/"
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center glow transition-transform hover:scale-105 flex-shrink-0"
        >
          <span className="text-white font-bold text-sm">F</span>
        </Link>

        {/* Search - only when expanded */}
        {!sidebarCollapsed && (
          <button
            onClick={openCommandPalette}
            className="flex-1 px-2 py-1.5 rounded-lg bg-[rgb(var(--bg-hover))] text-muted text-xs text-left flex items-center gap-2 hover:bg-[rgb(var(--bg-active))] transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1">Search...</span>
            <span className="text-[10px] bg-[rgb(var(--bg-active))] px-1 py-0.5 rounded">⌘K</span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="p-2">
        <NavItem
          href="/for-you"
          icon={<Sparkles className="w-4 h-4" />}
          label="For You"
          active={pathname === '/for-you'}
          collapsed={sidebarCollapsed}
        />
        <NavItem
          href="/unread"
          icon={<Inbox className="w-4 h-4" />}
          label="Unread"
          active={pathname === '/unread'}
          collapsed={sidebarCollapsed}
          badge={totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined}
        />
        <NavItem
          href="/all"
          icon={<Newspaper className="w-4 h-4" />}
          label="All"
          active={pathname === '/all'}
          collapsed={sidebarCollapsed}
        />
        <NavItem
          href="/starred"
          icon={<Star className="w-4 h-4" />}
          label="Starred"
          active={pathname === '/starred'}
          collapsed={sidebarCollapsed}
        />
        <NavItem
          href="/feeds/add"
          icon={<Plus className="w-4 h-4" />}
          label="Add Feed"
          active={pathname === '/feeds/add'}
          collapsed={sidebarCollapsed}
        />

        <div className="h-px bg-[rgb(var(--border-default))] my-2" />

        <NavItem
          href="/discover"
          icon={<Compass className="w-4 h-4" />}
          label="Discover"
          active={pathname === '/discover'}
          collapsed={sidebarCollapsed}
        />
        <NavItem
          href="/knowledge"
          icon={<Network className="w-4 h-4" />}
          label="Knowledge"
          active={pathname === '/knowledge'}
          collapsed={sidebarCollapsed}
        />
        <NavItem
          href="/stats"
          icon={<BarChart3 className="w-4 h-4" />}
          label="Stats"
          active={pathname === '/stats'}
          collapsed={sidebarCollapsed}
        />
      </div>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <div className="px-2">
          {!sidebarCollapsed && (
            <div className="text-[10px] uppercase tracking-wider text-muted px-2 py-1.5">
              Categories
            </div>
          )}
          {sidebarCollapsed && <div className="h-px bg-[rgb(var(--border-default))] my-2" />}
          {categories.map((category) => (
            <NavItem
              key={`cat-${category.id}`}
              href={`/category/${category.id}`}
              icon={<Folder className="w-4 h-4 text-orange-500" />}
              label={category.title}
              active={pathname === `/category/${category.id}`}
              collapsed={sidebarCollapsed}
              count={category.unreadCount}
            />
          ))}
        </div>
      )}

      {/* Feeds */}
      <div className="flex-1 overflow-y-auto px-2 pt-2">
        {!sidebarCollapsed && (
          <div className="text-[10px] uppercase tracking-wider text-muted px-2 py-1.5">
            Feeds
          </div>
        )}
        {sidebarCollapsed && categories && categories.length > 0 && (
          <div className="h-px bg-[rgb(var(--border-default))] my-2" />
        )}
        {feeds?.map((feed) => (
          <NavItem
            key={feed.id}
            href={`/feed/${feed.id}`}
            icon={
              feed.iconUrl ? (
                <img src={feed.iconUrl} alt="" className="w-5 h-5 rounded flex-shrink-0" />
              ) : (
                <div className={cn(
                  "w-5 h-5 rounded bg-gradient-to-br flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0",
                  stringToColor(feed.title)
                )}>
                  {feed.title.charAt(0).toUpperCase()}
                </div>
              )
            }
            label={feed.title}
            active={pathname === `/feed/${feed.id}`}
            collapsed={sidebarCollapsed}
            count={feed.unreadCount}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-default">
        <NavItem
          href="/settings"
          icon={<Settings className="w-4 h-4" />}
          label="Settings"
          active={pathname === '/settings'}
          collapsed={sidebarCollapsed}
        />

        {/* Collapse Toggle */}
        <button
          onClick={toggleSidebar}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors",
            sidebarCollapsed && "justify-center"
          )}
          title={sidebarCollapsed ? 'Expand sidebar [' : 'Collapse sidebar ['}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>

        {/* User */}
        {user && (
          <div className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-lg mt-1",
            sidebarCollapsed && "justify-center"
          )}>
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0">
              {user.username.charAt(0).toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-sm truncate">{user.username}</span>
                <button
                  onClick={logout}
                  className="p-1 text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

// Unified nav item component
function NavItem({ 
  href, 
  icon, 
  label,
  active, 
  collapsed,
  badge,
  count,
}: { 
  href: string; 
  icon: React.ReactNode; 
  label: string;
  active?: boolean;
  collapsed?: boolean;
  badge?: string | number;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 transition-all",
        collapsed && "justify-center",
        active 
          ? "bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-primary))]" 
          : "text-secondary hover:bg-[rgb(var(--bg-hover))] hover:text-[rgb(var(--text-primary))]"
      )}
      title={collapsed ? label : undefined}
    >
      <div className="flex-shrink-0">{icon}</div>
      {!collapsed && (
        <>
          <span className="flex-1 text-sm truncate">{label}</span>
          {count !== undefined && count > 0 && (
            <span className={cn(
              "text-xs font-medium",
              active ? "text-orange-500" : "text-muted"
            )}>
              {count}
            </span>
          )}
        </>
      )}
      {badge !== undefined && (
        <span className={cn(
          "min-w-[16px] h-4 px-1 bg-orange-500 rounded-full text-[10px] text-white font-medium flex items-center justify-center",
          collapsed ? "absolute -top-1 -right-1" : ""
        )}>
          {badge}
        </span>
      )}
    </Link>
  );
}
