'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@feedglow/ui';
import { ChevronRight, Folder } from 'lucide-react';
import { getFeedIconUrl } from '@/hooks';
import type { Feed, Category } from '@feedglow/shared';
import { t } from '@/lib/i18n';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';

function stringToColor(str: string) {
  const colors = [
    'from-red-500 to-red-700', 'from-orange-500 to-orange-700', 'from-amber-500 to-amber-700',
    'from-emerald-500 to-emerald-700', 'from-teal-500 to-teal-700', 'from-cyan-500 to-cyan-700',
    'from-blue-500 to-blue-700', 'from-indigo-500 to-indigo-700', 'from-violet-500 to-violet-700',
    'from-purple-500 to-purple-700', 'from-fuchsia-500 to-fuchsia-700', 'from-pink-500 to-pink-700',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

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

  const uncategorized: Feed[] = [];
  for (const feed of feeds) {
    if (feed.categoryId && catMap.has(feed.categoryId)) {
      catMap.get(feed.categoryId)!.feeds.push(feed);
    } else {
      uncategorized.push(feed);
    }
  }

  const roots: CategoryNode[] = [];
  for (const node of catMap.values()) {
    const parentId = node.category.parent_id;
    if (parentId && catMap.has(parentId)) {
      catMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  roots.sort((a, b) => (a.category.position ?? 0) - (b.category.position ?? 0));
  for (const node of catMap.values()) {
    node.children.sort((a, b) => (a.category.position ?? 0) - (b.category.position ?? 0));
    node.feeds.sort((a, b) => ((a as any).position ?? 0) - ((b as any).position ?? 0));
  }
  uncategorized.sort((a, b) => ((a as any).position ?? 0) - ((b as any).position ?? 0));

  return { roots, uncategorized };
}

function getTotalUnread(node: CategoryNode): number {
  let count = node.feeds.reduce((sum, f) => sum + (f.unreadCount || 0), 0);
  for (const child of node.children) {
    count += getTotalUnread(child);
  }
  return count;
}

// ---- Feed Icon ----
function FeedIcon({ feed }: { feed: Feed }) {
  // Newsletter feeds get a mail icon
  if ((feed as any).feed_type === 'newsletter' || (feed as any).feedType === 'newsletter') {
    return (
      <div className="w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 text-orange-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        </svg>
      </div>
    );
  }
  // Prefer profileImageUrl (real avatar e.g. Twitter profile pic) over icon (favicon)
  const profileImg = (feed as any).profileImageUrl;
  const iconUrl = profileImg || getFeedIconUrl(feed.id) || feed.iconUrl;
  if (iconUrl) {
    const needsProxy = iconUrl.includes('twimg.com') && !iconUrl.startsWith('/api/proxy');
    const src = needsProxy ? `/api/proxy/media?url=${encodeURIComponent(iconUrl)}` : iconUrl;
    return <img src={src} alt="" className="w-[18px] h-[18px] rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div className={cn(
      "w-[18px] h-[18px] rounded flex items-center justify-center text-[9px] font-bold text-white bg-gradient-to-br flex-shrink-0",
      stringToColor(feed.title)
    )}>
      {feed.title.charAt(0).toUpperCase()}
    </div>
  );
}

// ---- Draggable Feed Item ----
function DraggableFeed({ 
  feed, depth, onContextMenu 
}: { 
  feed: Feed; 
  depth: number; 
  onContextMenu?: (e: React.MouseEvent, feedId: number, feedTitle: string, feedUrl?: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `feed-${feed.id}`,
    data: { type: 'feed', feed },
  });

  const pathname = usePathname();
  const isActive = pathname === `/feed/${feed.id}`;
  const pl = 8 + (depth + 1) * 16;

  return (
    <div
      ref={setNodeRef}
      style={{ paddingLeft: `${pl}px` }}
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 mx-1.5 rounded-md transition-colors group",
        isDragging ? "opacity-30" : "",
        isActive ? "bg-[rgb(var(--bg-hover))]" : "hover:bg-[rgb(var(--bg-hover))]"
      )}
      onContextMenu={(e) => onContextMenu?.(e, feed.id, feed.title, feed.siteUrl)}
      {...attributes}
      {...listeners}
    >
      <Link href={`/feed/${feed.id}`} className="flex items-center gap-2 flex-1 min-w-0" onClick={(e) => isDragging && e.preventDefault()}>
        <FeedIcon feed={feed} />
        <span className={cn(
          "flex-1 text-[12px] truncate transition-colors",
          isActive ? "text-[rgb(var(--text-primary))]" : "text-[rgb(var(--text-secondary))] group-hover:text-[rgb(var(--text-primary))]"
        )}>
          {feed.title}
        </span>
      </Link>
      {(feed.unreadCount || 0) > 0 && (
        <span className={cn(
          "text-[11px] font-medium",
          isActive ? "text-orange-500" : "text-muted"
        )}>{feed.unreadCount}</span>
      )}
    </div>
  );
}

// ---- Drag Preview ----
function DragPreview({ feed }: { feed: Feed }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-md bg-[rgb(var(--bg-elevated))] border border-default shadow-lg opacity-90 w-48 cursor-grabbing">
      <FeedIcon feed={feed} />
      <span className="flex-1 text-[12px] text-[rgb(var(--text-primary))] truncate font-medium">
        {feed.title}
      </span>
    </div>
  );
}

// ---- Droppable Category ----
interface TreeCategoryProps {
  node: CategoryNode;
  depth: number;
  onFeedContextMenu?: (e: React.MouseEvent, feedId: number, feedTitle: string, feedUrl?: string) => void;
  onCategoryContextMenu?: (e: React.MouseEvent, categoryId: number) => void;
}

function TreeCategory({ node, depth, onFeedContextMenu, onCategoryContextMenu }: TreeCategoryProps) {
  const [expanded, setExpanded] = useState(true);
  const pathname = usePathname();
  const totalUnread = getTotalUnread(node);
  const isActive = pathname === `/category/${node.category.id}`;
  const pl = 8 + depth * 16;

  const { setNodeRef, isOver } = useDroppable({
    id: `category-${node.category.id}`,
    data: { type: 'category', categoryId: node.category.id },
  });

  return (
    <div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex items-center gap-1.5 py-1.5 px-2 mx-1.5 rounded-md cursor-pointer transition-colors group",
          isActive ? "bg-[rgb(var(--bg-hover))]" : "hover:bg-[rgb(var(--bg-hover))]",
          isOver && "ring-2 ring-orange-500/60 bg-orange-500/10"
        )}
        style={{ paddingLeft: `${pl}px` }}
        onClick={() => setExpanded(!expanded)}
        onContextMenu={(e) => onCategoryContextMenu?.(e, node.category.id)}
      >
        <ChevronRight className={cn(
          "w-3.5 h-3.5 text-muted transition-transform flex-shrink-0",
          expanded && "rotate-90"
        )} />
        <Folder className={cn(
          "w-4 h-4 flex-shrink-0 transition-colors",
          isOver ? "text-orange-500" : "text-muted"
        )} />
        <Link
          href={`/category/${node.category.id}`}
          className="flex-1 text-[13px] text-[rgb(var(--text-secondary))] truncate hover:text-[rgb(var(--text-base))]"
          onClick={(e) => e.stopPropagation()}
        >
          {node.category.title}
        </Link>
        {totalUnread > 0 && (
          <span className="text-[11px] text-muted font-medium">{totalUnread}</span>
        )}
      </div>

      {expanded && (
        <>
          {node.children.map(child => (
            <TreeCategory
              key={child.category.id}
              node={child}
              depth={depth + 1}
              onFeedContextMenu={onFeedContextMenu}
              onCategoryContextMenu={onCategoryContextMenu}
            />
          ))}
          {node.feeds.map(feed => (
            <DraggableFeed
              key={feed.id}
              feed={feed}
              depth={depth + 1}
              onContextMenu={onFeedContextMenu}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ---- Main Tree ----
interface SidebarTreeProps {
  categories: Category[];
  feeds: Feed[];
  onFeedContextMenu?: (e: React.MouseEvent, feedId: number, feedTitle: string, feedUrl?: string) => void;
  onCategoryContextMenu?: (e: React.MouseEvent, categoryId: number) => void;
  onFeedMoved?: (feedId: number, newCategoryId: number | null, newPosition: number) => void;
}

export function SidebarTree({ categories, feeds, onFeedContextMenu, onCategoryContextMenu, onFeedMoved }: SidebarTreeProps) {
  const { roots, uncategorized } = useMemo(
    () => buildTree(categories || [], feeds || []),
    [categories, feeds]
  );

  const [activeFeed, setActiveFeed] = useState<Feed | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'feed') {
      setActiveFeed(data.feed);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveFeed(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type !== 'feed' || overData?.type !== 'category') return;

    const feedId = activeData.feed.id;
    const currentCategoryId = activeData.feed.categoryId || null;
    const targetCategoryId = overData.categoryId as number;

    // Only move if category actually changed
    if (currentCategoryId !== targetCategoryId) {
      onFeedMoved?.(feedId, targetCategoryId, 0);
    }
  }, [onFeedMoved]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveFeed(null)}
    >
      <div className="py-1">
        {roots.map(node => (
          <TreeCategory
            key={node.category.id}
            node={node}
            depth={0}
            onFeedContextMenu={onFeedContextMenu}
            onCategoryContextMenu={onCategoryContextMenu}
          />
        ))}
        
        {uncategorized.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wider text-muted px-4 py-1">
              {t('sidebar.uncategorized')}
            </div>
            {uncategorized.map(feed => (
              <DraggableFeed
                key={feed.id}
                feed={feed}
                depth={-1}
                onContextMenu={onFeedContextMenu}
              />
            ))}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeFeed && <DragPreview feed={activeFeed} />}
      </DragOverlay>
    </DndContext>
  );
}
