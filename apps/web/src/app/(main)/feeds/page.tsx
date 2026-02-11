'use client';

import Link from 'next/link';
import { useRef, useMemo } from 'react';
import { useFeeds, useCategories, useExportOpml, useImportOpml, getFeedIconUrl } from '@/hooks';
import { Plus, Rss, Folder, ExternalLink, RefreshCw, Download, Upload } from 'lucide-react';
import type { Feed, Category } from '@feedglow/shared';
import { t } from '@/lib/i18n';

interface CategoryNode {
  category: Category;
  children: CategoryNode[];
  feeds: Feed[];
}

function buildTree(categories: Category[], feeds: Feed[]): { roots: CategoryNode[]; uncategorized: Feed[] } {
  const catMap = new Map<number, CategoryNode>();
  for (const cat of categories) {
    catMap.set(cat.id, { category: cat, children: [], feeds: [] });
  }
  for (const feed of feeds) {
    if (feed.categoryId && catMap.has(feed.categoryId)) {
      catMap.get(feed.categoryId)!.feeds.push(feed);
    }
  }

  const roots: CategoryNode[] = [];
  for (const cat of categories) {
    const node = catMap.get(cat.id)!;
    const parentId = cat.parent_id;
    if (parentId && catMap.has(parentId)) {
      catMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort
  for (const node of catMap.values()) {
    node.children.sort((a, b) => (a.category.position ?? 0) - (b.category.position ?? 0));
  }
  roots.sort((a, b) => (a.category.position ?? 0) - (b.category.position ?? 0));

  const uncategorized = feeds.filter(f => !f.categoryId || !catMap.has(f.categoryId));
  return { roots, uncategorized };
}

export default function FeedsPage() {
  const { feeds, isLoading: feedsLoading, mutate: refreshFeeds } = useFeeds();
  const { categories, isLoading: categoriesLoading } = useCategories();
  const exportOpml = useExportOpml();
  const importOpml = useImportOpml();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = feedsLoading || categoriesLoading;

  const tree = useMemo(() => {
    if (!categories || !feeds) return { roots: [], uncategorized: [] };
    return buildTree(categories, feeds);
  }, [categories, feeds]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importOpml.mutate(file);
      e.target.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-[rgb(var(--text-muted))]" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">Feeds</h1>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => exportOpml.mutate()}
              disabled={exportOpml.isPending}
              className="p-2 text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors disabled:opacity-50"
              title="Export OPML"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={handleImportClick}
              disabled={importOpml.isPending}
              className="p-2 text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors disabled:opacity-50"
              title="Import OPML"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={() => refreshFeeds()}
              className="p-2 text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <Link
              href="/feeds/add"
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Feed
            </Link>
          </div>
        </div>

        {(!feeds || feeds.length === 0) ? (
          <div className="text-center py-12 bg-[rgb(var(--bg-hover))] rounded-lg">
            <Rss className="w-12 h-12 mx-auto text-[rgb(var(--text-muted))] mb-4" />
            <p className="text-[rgb(var(--text-muted))] mb-4">No feeds yet</p>
            <Link
              href="/feeds/add"
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
            >
              <Plus className="w-4 h-4" />
              Add your first feed
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {tree.roots.map(node => (
              <CategorySection key={node.category.id} node={node} depth={0} />
            ))}

            {tree.uncategorized.length > 0 && (
              <div className="rounded-lg border border-[rgb(var(--border-default))] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-[rgb(var(--bg-elevated))] border-b border-[rgb(var(--border-default))]">
                  <Rss className="w-4 h-4 text-[rgb(var(--text-muted))]" />
                  <span className="font-medium text-[rgb(var(--text-primary))]">{t('settings.opml.uncategorized')}</span>
                  <span className="text-sm text-[rgb(var(--text-muted))]">({tree.uncategorized.length})</span>
                </div>
                <div className="divide-y divide-[rgb(var(--border-default))]">
                  {tree.uncategorized.map(feed => (
                    <FeedItem key={feed.id} feed={feed} />
                  ))}
                </div>
              </div>
            )}

            <div className="text-center text-sm text-[rgb(var(--text-muted))] pt-4 pb-8">
              {t('page.feeds.feedCount', { count: feeds.length })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CategorySection({ node, depth }: { node: CategoryNode; depth: number }) {
  const totalFeeds = countFeeds(node);
  const totalUnread = countUnread(node);
  if (totalFeeds === 0) return null;

  return (
    <div
      className="rounded-lg border border-[rgb(var(--border-default))] overflow-hidden"
      style={depth > 0 ? { marginLeft: `${depth * 16}px` } : undefined}
    >
      {/* Category header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[rgb(var(--bg-elevated))] border-b border-[rgb(var(--border-default))]">
        <Folder className="w-4 h-4 text-orange-500" />
        <span className="font-medium text-[rgb(var(--text-primary))]">{node.category.title}</span>
        <span className="text-sm text-[rgb(var(--text-muted))]">({totalFeeds})</span>
        {totalUnread > 0 && (
          <span className="ml-auto px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-xs font-medium">
            {totalUnread}
          </span>
        )}
      </div>

      {/* Direct feeds */}
      {node.feeds.length > 0 && (
        <div className="divide-y divide-[rgb(var(--border-default))]">
          {node.feeds.map(feed => (
            <FeedItem key={feed.id} feed={feed} />
          ))}
        </div>
      )}

      {/* Child categories */}
      {node.children.length > 0 && (
        <div className="p-2 space-y-2 bg-[rgb(var(--bg-card))]">
          {node.children.map(child => (
            <CategorySection key={child.category.id} node={child} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function countFeeds(node: CategoryNode): number {
  let count = node.feeds.length;
  for (const child of node.children) {
    count += countFeeds(child);
  }
  return count;
}

function countUnread(node: CategoryNode): number {
  let count = node.feeds.reduce((sum, f) => sum + (f.unreadCount || 0), 0);
  for (const child of node.children) {
    count += countUnread(child);
  }
  return count;
}

const GRADIENT_COLORS = [
  'from-red-500 to-red-700', 'from-orange-500 to-orange-700', 'from-amber-500 to-amber-700',
  'from-emerald-500 to-emerald-700', 'from-teal-500 to-teal-700', 'from-cyan-500 to-cyan-700',
  'from-blue-500 to-blue-700', 'from-indigo-500 to-indigo-700', 'from-violet-500 to-violet-700',
  'from-purple-500 to-purple-700', 'from-fuchsia-500 to-fuchsia-700', 'from-pink-500 to-pink-700',
];

function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

function FeedItemIcon({ feed }: { feed: Feed }) {
  const profileImg = (feed as any).profileImageUrl;
  const iconUrl = profileImg || getFeedIconUrl(feed.id) || feed.iconUrl;
  if (iconUrl) {
    const needsProxy = iconUrl.includes('twimg.com') && !iconUrl.startsWith('/api/proxy');
    const src = needsProxy ? `/api/proxy/media?url=${encodeURIComponent(iconUrl)}` : iconUrl;
    return (
      <img src={src} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
    );
  }
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-gradient-to-br flex-shrink-0 ${stringToColor(feed.title)}`}>
      {feed.title.charAt(0).toUpperCase()}
    </div>
  );
}

function FeedItem({ feed }: { feed: Feed }) {
  return (
    <Link 
      href={`/feed/${feed.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-[rgb(var(--bg-hover))] transition-colors"
    >
      <FeedItemIcon feed={feed} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate text-[rgb(var(--text-primary))]">{feed.title}</div>
        <div className="text-sm text-[rgb(var(--text-muted))] truncate">{feed.siteUrl || feed.feedUrl}</div>
      </div>
      <div className="flex items-center gap-3 text-sm text-[rgb(var(--text-muted))]">
        {(feed.unreadCount ?? 0) > 0 && (
          <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-xs font-medium">
            {feed.unreadCount}
          </span>
        )}
        {feed.siteUrl && (
          <span
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(feed.siteUrl, '_blank');
            }}
            className="p-1 hover:text-[rgb(var(--text-primary))] cursor-pointer"
            title="Visit site"
          >
            <ExternalLink className="w-4 h-4" />
          </span>
        )}
      </div>
    </Link>
  );
}
