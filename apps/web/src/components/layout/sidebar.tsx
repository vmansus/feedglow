'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@feedglow/ui';
import { useFeeds, useCategories, useMarkFeedAsRead, useMarkCategoryAsRead } from '@/hooks';
import { useAuth } from '@/contexts/auth-context';
import { useCommandPalette } from '@/components/ui/command-palette';
import { useContextMenu } from '@/components/ui/context-menu';
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
  PanelLeft,
  CheckCircle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { useLayout } from '@/contexts/layout-context';
import { refreshFeed } from '@/lib/api';

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
  const { showMenu } = useContextMenu();
  const { sidebarCollapsed, toggleSidebar, fullscreen } = useLayout();
  
  const markFeedAsRead = useMarkFeedAsRead();
  const markCategoryAsRead = useMarkCategoryAsRead();

  const totalUnread = feeds?.reduce((acc, feed) => acc + (feed.unreadCount || 0), 0) || 0;

  // Context menu handlers
  const handleFeedContextMenu = (e: React.MouseEvent, feedId: number, _feedTitle: string, feedUrl?: string) => {
    showMenu(e, [
      {
        label: '全部标记为已读',
        icon: <CheckCircle className="w-4 h-4" />,
        onClick: () => markFeedAsRead.mutate({ feedId }),
      },
      {
        label: '刷新',
        icon: <RefreshCw className="w-4 h-4" />,
        onClick: () => refreshFeed(feedId),
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: '访问网站',
        icon: <ExternalLink className="w-4 h-4" />,
        onClick: () => feedUrl && window.open(feedUrl, '_blank'),
        disabled: !feedUrl,
      },
    ]);
  };

  const handleCategoryContextMenu = (e: React.MouseEvent, categoryId: number) => {
    showMenu(e, [
      {
        label: '标记分类为已读',
        icon: <CheckCircle className="w-4 h-4" />,
        onClick: () => markCategoryAsRead.mutate({ categoryId }),
      },
    ]);
  };

  // Hide sidebar completely in fullscreen mode
  if (fullscreen) {
    return null;
  }

  return (
    <div className="flex h-screen">
      {/* Icon Rail - always visible */}
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

        <div className="h-px w-6 bg-[rgb(var(--border-default))] my-2" />

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
      </aside>

      {/* Feed List Panel - collapsible to icons only */}
      <aside className={cn(
        "border-r border-default surface-base flex flex-col transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-56"
      )}>
        {/* Search - only when expanded */}
        {!sidebarCollapsed && (
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
        )}

        {/* Categories */}
        {categories && categories.length > 0 && (
          <div className={cn("pt-2", sidebarCollapsed ? "px-1" : "px-2")}>
            {!sidebarCollapsed && (
              <div className="text-[10px] uppercase tracking-wider text-muted px-2 py-1.5">
                Categories
              </div>
            )}
            {categories.map((category) => (
              <FeedItem
                key={`cat-${category.id}`}
                href={`/category/${category.id}`}
                icon={<Folder className="w-5 h-5 text-orange-500" />}
                title={category.title}
                count={category.unreadCount}
                active={pathname === `/category/${category.id}`}
                collapsed={sidebarCollapsed}
                onContextMenu={(e) => handleCategoryContextMenu(e, category.id)}
              />
            ))}
          </div>
        )}

        {/* Feeds */}
        <div className={cn("flex-1 overflow-y-auto pt-2", sidebarCollapsed ? "px-1" : "px-2")}>
          {!sidebarCollapsed && (
            <div className="text-[10px] uppercase tracking-wider text-muted px-2 py-1.5">
              Feeds
            </div>
          )}
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
              collapsed={sidebarCollapsed}
              onContextMenu={(e) => handleFeedContextMenu(e, feed.id, feed.title, feed.siteUrl)}
            />
          ))}
        </div>

        {/* User & Collapse Toggle */}
        <div className="p-2 border-t border-default">
          {/* Collapse Toggle */}
          <button
            onClick={toggleSidebar}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors mb-1",
              sidebarCollapsed && "justify-center"
            )}
            title={sidebarCollapsed ? 'Expand [' : 'Collapse ['}
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
              "flex items-center gap-2 px-2 py-1.5 rounded-lg",
              sidebarCollapsed && "justify-center"
            )}>
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <>
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
                </>
              )}
            </div>
          )}
        </div>
      </aside>
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

// Feed item in the list - supports collapsed mode
function FeedItem({
  href,
  icon,
  title,
  count,
  active,
  hasNew,
  collapsed,
  onContextMenu,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  count?: number;
  active?: boolean;
  hasNew?: boolean;
  collapsed?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 transition-all",
        collapsed && "justify-center px-1",
        active 
          ? "bg-[rgb(var(--bg-hover))]" 
          : "hover:bg-[rgb(var(--bg-hover))]"
      )}
      title={collapsed ? title : undefined}
      onContextMenu={onContextMenu}
    >
      <div className="flex-shrink-0">{icon}</div>
      {!collapsed && (
        <>
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
        </>
      )}
    </Link>
  );
}
