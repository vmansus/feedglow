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
    <div className="flex h-screen">
      {/* Icon Rail */}
      <aside className="w-14 border-r border-default surface-elevated flex flex-col items-center py-3 gap-1">
        {/* Logo */}
        <Link 
          href="/"
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mb-3 glow transition-transform hover:scale-105"
        >
          <span className="text-white font-bold text-sm">F</span>
        </Link>

        {/* Quick Nav */}
        <NavIconButton
          href="/for-you"
          icon={<Sparkles className="w-5 h-5" />}
          active={pathname === '/for-you'}
        />
        <NavIconButton
          href="/unread"
          icon={<Inbox className="w-5 h-5" />}
          active={pathname === '/unread'}
          badge={totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined}
        />
        <NavIconButton
          href="/all"
          icon={<Newspaper className="w-5 h-5" />}
          active={pathname === '/all'}
        />
        <NavIconButton
          href="/starred"
          icon={<Star className="w-5 h-5" />}
          active={pathname === '/starred'}
        />
        <NavIconButton
          href="/feeds/add"
          icon={<Plus className="w-5 h-5" />}
          active={pathname === '/feeds/add'}
        />

        <div className="h-px bg-[rgb(var(--border-default))] my-2 mx-2" />

        {/* Discovery & Analytics */}
        <NavIconButton
          href="/discover"
          icon={<Compass className="w-5 h-5" />}
          active={pathname === '/discover'}
        />
        <NavIconButton
          href="/knowledge"
          icon={<Network className="w-5 h-5" />}
          active={pathname === '/knowledge'}
        />
        <NavIconButton
          href="/stats"
          icon={<BarChart3 className="w-5 h-5" />}
          active={pathname === '/stats'}
        />

        <div className="flex-1" />

        {/* Settings */}
        <NavIconButton
          href="/settings"
          icon={<Settings className="w-5 h-5" />}
          active={pathname === '/settings'}
        />

        {/* Collapse Toggle */}
        <button
          onClick={toggleSidebar}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors mb-2"
          title={sidebarCollapsed ? 'Expand sidebar [' : 'Collapse sidebar ['}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="w-5 h-5" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </button>
      </aside>

      {/* Feed List Panel - collapsible */}
      {!sidebarCollapsed && (
      <aside className="w-56 border-r border-default surface-base flex flex-col">
        {/* Search */}
        <div className="p-2">
          <button
            onClick={openCommandPalette}
            className="w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-hover))] border border-default text-muted text-sm text-left flex items-center gap-2 hover:bg-[rgb(var(--bg-active))] hover:border-[rgb(var(--border-default))] transition-all"
          >
            <Search className="w-4 h-4" />
            <span>Search...</span>
            <span className="ml-auto text-xs bg-[rgb(var(--bg-active))] px-1.5 py-0.5 rounded">⌘K</span>
          </button>
        </div>

        {/* Categories */}
        {categories && categories.length > 0 && (
          <div className="px-2 pt-2">
            <div className="text-[10px] uppercase tracking-wider text-muted px-2 py-1.5">
              Categories
            </div>
            {categories.map((category) => (
              <FeedItem
                key={`cat-${category.id}`}
                href={`/category/${category.id}`}
                icon={<Folder className="w-4 h-4 text-orange-500" />}
                title={category.title}
                count={category.unreadCount}
                active={pathname === `/category/${category.id}`}
              />
            ))}
          </div>
        )}

        {/* Feeds */}
        <div className="flex-1 overflow-y-auto px-2 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-muted px-2 py-1.5">
            Feeds
          </div>
          {feeds?.map((feed) => (
            <FeedItem
              key={feed.id}
              href={`/feed/${feed.id}`}
              icon={
                feed.iconUrl ? (
                  <img src={feed.iconUrl} alt="" className="w-5 h-5 rounded" />
                ) : (
                  <div className={cn(
                    "w-5 h-5 rounded bg-gradient-to-br flex items-center justify-center text-[10px] font-bold text-white",
                    stringToColor(feed.title)
                  )}>
                    {feed.title.charAt(0).toUpperCase()}
                  </div>
                )
              }
              title={feed.title}
              count={feed.unreadCount}
              active={pathname === `/feed/${feed.id}`}
              hasNew={Boolean(feed.unreadCount && feed.unreadCount > 0)}
            />
          ))}
        </div>

        {/* User */}
        {user && (
          <div className="p-2 border-t border-default">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-medium">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.username}</p>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>
      )}
    </div>
  );
}

// Icon button for the rail
function NavIconButton({ 
  href, 
  icon, 
  active, 
  badge 
}: { 
  href: string; 
  icon: React.ReactNode; 
  active?: boolean;
  badge?: string | number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative w-9 h-9 rounded-lg flex items-center justify-center transition-all",
        active 
          ? "bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-primary))]" 
          : "text-muted hover:bg-[rgb(var(--bg-hover))] hover:text-[rgb(var(--text-primary))]"
      )}
    >
      {icon}
      {badge !== undefined && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-orange-500 rounded-full text-[10px] text-white font-medium flex items-center justify-center">
          {badge}
        </span>
      )}
    </Link>
  );
}

// Feed item in the list
function FeedItem({
  href,
  icon,
  title,
  count,
  active,
  hasNew,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  count?: number;
  active?: boolean;
  hasNew?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 transition-all",
        active 
          ? "bg-[rgb(var(--bg-hover))]" 
          : "hover:bg-[rgb(var(--bg-hover))]"
      )}
    >
      <div className="flex-shrink-0">{icon}</div>
      <span className={cn(
        "flex-1 text-sm truncate transition-colors",
        active ? "text-[rgb(var(--text-primary))]" : "text-secondary group-hover:text-[rgb(var(--text-primary))]"
      )}>
        {title}
      </span>
      {count !== undefined && count > 0 ? (
        <span className={cn(
          "text-xs font-medium",
          active ? "text-orange-500" : "text-muted"
        )}>
          {count}
        </span>
      ) : hasNew ? (
        <div className="w-2 h-2 rounded-full bg-orange-500" />
      ) : null}
    </Link>
  );
}
