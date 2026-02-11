'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@feedglow/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useFeeds, useCategories, useDeleteFeed, useUpdateFeed, useMarkFeedAsRead, useMarkCategoryAsRead, useFeedIcons, useTags, getFeedIconUrl } from '@/hooks';
import { Tag } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useFeedType } from '@/contexts/feed-type-context';
import { SidebarTree } from './sidebar-tree';
import { FeedEditDialog } from '@/components/feed/feed-edit-dialog';
import { useCommandPalette } from '@/components/ui/command-palette';
import { useContextMenu } from '@/components/ui/context-menu';
import { 
  Newspaper, 
  Star, 
  Plus, 
  Settings, 
  LogOut, 
  Search,
  Inbox,
  Sparkles,
  Compass,
  BarChart3,
  Network,
  PanelLeftClose,
  PanelLeft,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  CalendarDays,
  Download,
  Trash2,
  Pencil,
  FolderInput,
  Copy,
  Rss,
  Highlighter,
  Eye,
} from 'lucide-react';
import { useLayout } from '@/contexts/layout-context';
import { t } from '@/lib/i18n';
import { refreshFeed, reorderFeed } from '@/lib/api';
import { FeedTypeBar } from './feed-type-bar';
import { useQueryClient } from '@tanstack/react-query';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { feeds: allFeeds } = useFeeds();
  const { selectedType } = useFeedType();
  useFeedIcons(allFeeds); // Preload icons for feeds with icon_id > 0
  const { categories } = useCategories();
  const { data: tags } = useTags();
  const { user, logout } = useAuth();
  const confirmDialog = useConfirm();
  const { open: openCommandPalette } = useCommandPalette();
  const { showMenu } = useContextMenu();
  const { sidebarCollapsed, toggleSidebar, fullscreen } = useLayout();
  
  const markFeedAsRead = useMarkFeedAsRead();
  const markCategoryAsRead = useMarkCategoryAsRead();
  const deleteFeed = useDeleteFeed();
  const updateFeed = useUpdateFeed();
  const queryClient = useQueryClient();

  // Edit dialog state
  const [editingFeedId, setEditingFeedId] = useState<number | null>(null);
  const editingFeed = editingFeedId ? allFeeds?.find(f => f.id === editingFeedId) : null;

  // Filter feeds by selected type
  const feeds = selectedType === 'all'
    ? allFeeds
    : allFeeds?.filter(f => f.feed_type === selectedType);

  const totalUnread = feeds?.reduce((acc, feed) => acc + (feed.unreadCount || 0), 0) || 0;

  // Context menu handlers
  const handleFeedContextMenu = useCallback((e: React.MouseEvent, feedId: number, feedTitle: string, feedUrl?: string) => {
    const feed = allFeeds?.find(f => f.id === feedId);
    const feedRssUrl = feed?.feedUrl || '';
    const currentCategoryId = feed?.categoryId;

    // Build category submenu as tree (respecting parent-child hierarchy)
    const allCats = categories || [];
    type CatMenuItem = { label: string; checked: boolean; depth: number; onClick: () => void };
    const buildCatTree = (parentId: number | null, depth: number): CatMenuItem[] => {
      return allCats
        .filter(c => (c.parent_id ?? null) === parentId)
        .flatMap(cat => [
          {
            label: cat.title,
            checked: cat.id === currentCategoryId,
            depth,
            onClick: () => {
              if (cat.id !== currentCategoryId) {
                updateFeed.mutate({ id: feedId, updates: { categoryId: cat.id } });
              }
            },
          },
          ...buildCatTree(cat.id, depth + 1),
        ]);
    };
    const categoryChildren = buildCatTree(null, 0);

    showMenu(e, [
      {
        label: t('sidebar.markAllAsRead'),
        icon: <CheckCircle className="w-4 h-4" />,
        onClick: () => markFeedAsRead.mutate({ feedId }),
      },
      {
        label: t('sidebar.edit'),
        icon: <Pencil className="w-4 h-4" />,
        onClick: () => setEditingFeedId(feedId),
      },
      {
        label: t('sidebar.unsubscribe'),
        icon: <Trash2 className="w-4 h-4" />,
        danger: true,
        onClick: async () => {
          const ok = await confirmDialog({
            title: t('sidebar.unsubscribe'),
            message: t('sidebar.unsubscribeConfirm', { title: feedTitle }),
            confirmText: t('sidebar.unsubscribe'),
            variant: 'danger',
          });
          if (ok) {
            deleteFeed.mutate(feedId, {
              onSuccess: () => {
                if (pathname === `/feed/${feedId}`) {
                  router.push('/feeds');
                }
              },
            });
          }
        },
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: t('sidebar.moveToCategory'),
        icon: <FolderInput className="w-4 h-4" />,
        onClick: () => {},
        children: categoryChildren,
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: t('sidebar.refresh'),
        icon: <RefreshCw className="w-4 h-4" />,
        onClick: () => {
          refreshFeed(feedId);
          toast.success(t('sidebar.refreshing'));
        },
      },
      {
        label: t('sidebar.openFeedInNewTab'),
        icon: <Rss className="w-4 h-4" />,
        shortcut: 'O',
        onClick: () => feedRssUrl && window.open(feedRssUrl, '_blank'),
        disabled: !feedRssUrl,
      },
      {
        label: t('sidebar.openSiteInNewTab'),
        icon: <ExternalLink className="w-4 h-4" />,
        shortcut: '⌘O',
        onClick: () => feedUrl && window.open(feedUrl, '_blank'),
        disabled: !feedUrl,
      },
      {
        label: t('sidebar.copyFeedUrl'),
        icon: <Copy className="w-4 h-4" />,
        shortcut: '⇧⌘C',
        onClick: () => {
          navigator.clipboard.writeText(feedRssUrl).then(() => toast.success(t('sidebar.copied')));
        },
        disabled: !feedRssUrl,
      },
    ]);
  }, [allFeeds, categories, showMenu, markFeedAsRead, deleteFeed, updateFeed, pathname, router]);

  const handleFeedMoved = useCallback((feedId: number, newCategoryId: number | null, newPosition: number) => {
    reorderFeed(feedId, newCategoryId ?? undefined, newPosition).then(() => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(t('sidebar.moved'));
    }).catch(() => {
      toast.error(t('sidebar.moveFailed'));
    });
  }, [queryClient]);

  const handleCategoryContextMenu = useCallback((e: React.MouseEvent, categoryId: number) => {
    showMenu(e, [
      {
        label: t('sidebar.markCategoryAsRead'),
        icon: <CheckCircle className="w-4 h-4" />,
        onClick: () => markCategoryAsRead.mutate({ categoryId }),
      },
    ]);
  }, [showMenu, markCategoryAsRead]);

  // Hide sidebar completely in fullscreen mode
  if (fullscreen) {
    return null;
  }

  return (
    <div className="flex h-full">
      {/* Icon Rail - always visible */}
      <aside className="w-14 border-r border-default surface-elevated flex flex-col items-center py-3 gap-1">
        {/* Logo */}
        <Link 
          href="/"
          className="w-9 h-9 rounded-xl overflow-hidden mb-3 transition-transform hover:scale-105"
        >
          <img src="/logo.png" alt="FeedGlow" className="w-full h-full object-cover" />
        </Link>

        {/* Quick Nav */}
        <NavIconButton
          href="/for-you"
          icon={<Sparkles className="w-5 h-5" />}
          active={pathname === '/for-you'}
        />
        <NavIconButton
          href="/digest"
          icon={<CalendarDays className="w-5 h-5" />}
          active={pathname === '/digest'}
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
          href="/saved"
          icon={<Download className="w-5 h-5" />}
          active={pathname === '/saved'}
        />
        <NavIconButton
          href="/highlights"
          icon={<Highlighter className="w-5 h-5" />}
          active={pathname === '/highlights'}
        />
        <NavIconButton
          href="/watch"
          icon={<Eye className="w-5 h-5" />}
          active={pathname === '/watch'}
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
        {/* Feed Type Bar - only when expanded */}
        {!sidebarCollapsed && <FeedTypeBar />}

        {/* Scrollable middle: Search + Tree + Tags */}
        <div className="flex-1 overflow-y-auto min-h-0">
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

          {/* Tree: Categories + Feeds */}
          {!sidebarCollapsed && categories && feeds && (
            <div className="pt-1">
              <SidebarTree
                categories={categories}
                feeds={feeds || []}
                onFeedContextMenu={handleFeedContextMenu}
                onCategoryContextMenu={handleCategoryContextMenu}
                onFeedMoved={handleFeedMoved}
              />
            </div>
          )}

          {/* Collapsed: Feed icons only */}
          {sidebarCollapsed && feeds && feeds.length > 0 && (
            <div className="flex flex-col items-center gap-1 pt-2">
              {feeds.map(feed => (
                <CollapsedFeedIcon key={feed.id} feed={feed} />
              ))}
            </div>
          )}

          {/* Tags */}
          {tags && Array.isArray(tags) && tags.length > 0 && (
            <div className={cn("pt-2", sidebarCollapsed ? "px-1" : "px-2")}>
              {!sidebarCollapsed && (
                <div className="text-[10px] uppercase tracking-wider text-muted px-2 py-1.5">
                  Tags
                </div>
              )}
              {tags.slice(0, 10).map((tag: { id: string; name: string; count?: number }) => (
                <FeedItem
                  key={`tag-${tag.id}`}
                  href={`/tag/${encodeURIComponent(tag.name)}`}
                  icon={<Tag className="w-4 h-4 text-orange-400" />}
                  title={`#${tag.name}`}
                  count={tag.count}
                  active={pathname === `/tag/${encodeURIComponent(tag.name)}`}
                  collapsed={sidebarCollapsed}
                />
              ))}
              {tags.length > 10 && !sidebarCollapsed && (
                <Link
                  href="/tags"
                  className="block px-2 py-1 text-xs text-muted hover:text-orange-500 transition-colors"
                >
                  {t('sidebar.viewAllTags', { count: tags.length })}
                </Link>
              )}
            </div>
          )}
        </div>

        {/* User & Collapse Toggle - pinned to bottom */}
        <div className="flex-shrink-0 p-2 border-t border-default">
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

      {/* Feed Edit Dialog */}
      {editingFeed && (
        <FeedEditDialog feed={editingFeed} onClose={() => setEditingFeedId(null)} />
      )}
    </div>
  );
}

// Collapsed feed icon with tooltip
function CollapsedFeedIcon({ feed }: { feed: { id: number; title: string; iconUrl?: string; profileImageUrl?: string; unreadCount?: number } }) {
  const pathname = usePathname();
  const isActive = pathname === `/feed/${feed.id}`;
  const profileImg = feed.profileImageUrl;
  const rawIconUrl = profileImg || getFeedIconUrl(feed.id) || feed.iconUrl;
  const iconUrl = rawIconUrl?.includes('twimg.com') && !rawIconUrl.startsWith('/api/proxy')
    ? `/api/proxy/media?url=${encodeURIComponent(rawIconUrl)}`
    : rawIconUrl;

  const colors = [
    'from-red-500 to-red-700', 'from-orange-500 to-orange-700', 'from-amber-500 to-amber-700',
    'from-emerald-500 to-emerald-700', 'from-teal-500 to-teal-700', 'from-cyan-500 to-cyan-700',
    'from-blue-500 to-blue-700', 'from-indigo-500 to-indigo-700', 'from-violet-500 to-violet-700',
    'from-purple-500 to-purple-700', 'from-fuchsia-500 to-fuchsia-700', 'from-pink-500 to-pink-700',
  ];
  let hash = 0;
  for (let i = 0; i < feed.title.length; i++) {
    hash = feed.title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorClass = colors[Math.abs(hash) % colors.length];

  return (
    <Link
      href={`/feed/${feed.id}`}
      className={cn(
        "relative w-9 h-9 rounded-lg flex items-center justify-center transition-all",
        isActive
          ? "bg-[rgb(var(--bg-hover))] ring-1 ring-orange-500/40"
          : "hover:bg-[rgb(var(--bg-hover))]"
      )}
      title={feed.title}
    >
      {iconUrl ? (
        <img src={iconUrl} alt="" className="w-5 h-5 rounded object-cover" />
      ) : (
        <div className={cn(
          "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br",
          colorClass
        )}>
          {feed.title.charAt(0).toUpperCase()}
        </div>
      )}
      {(feed.unreadCount || 0) > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 bg-orange-500 rounded-full text-[9px] text-white font-medium flex items-center justify-center">
          {(feed.unreadCount || 0) > 99 ? '·' : feed.unreadCount}
        </span>
      )}
    </Link>
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
