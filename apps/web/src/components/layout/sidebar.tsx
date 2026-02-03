'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@feedglow/ui';
import { useFeeds, useCategories } from '@/hooks';

interface NavItemProps {
  href: string;
  icon: string;
  label: string;
  count?: number;
  active?: boolean;
}

function NavItem({ href, icon, label, count, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
        active
          ? 'bg-orange-100 text-orange-900 dark:bg-orange-900/20 dark:text-orange-100'
          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
      )}
    >
      <span className="text-lg">{icon}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded-full">
          {count}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: feeds } = useFeeds();
  const { data: categories } = useCategories();

  const totalUnread = feeds?.reduce((acc, feed) => acc + (feed.unreadCount || 0), 0) || 0;

  return (
    <aside className="w-64 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🌟</span>
          <span className="text-xl font-bold">
            Feed<span className="text-orange-500">Glow</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* Main sections */}
        <NavItem
          href="/unread"
          icon="📥"
          label="Unread"
          count={totalUnread}
          active={pathname === '/unread'}
        />
        <NavItem
          href="/all"
          icon="📰"
          label="All Articles"
          active={pathname === '/all'}
        />
        <NavItem
          href="/starred"
          icon="⭐"
          label="Starred"
          active={pathname === '/starred'}
        />

        {/* Divider */}
        <div className="my-4 border-t border-gray-200 dark:border-gray-800" />

        {/* Categories */}
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Categories
        </div>
        {categories?.map((category) => (
          <NavItem
            key={category.id}
            href={`/category/${category.id}`}
            icon="📁"
            label={category.title}
            count={category.unreadCount}
            active={pathname === `/category/${category.id}`}
          />
        ))}

        {/* Divider */}
        <div className="my-4 border-t border-gray-200 dark:border-gray-800" />

        {/* Feeds */}
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Feeds
        </div>
        {feeds?.slice(0, 10).map((feed) => (
          <NavItem
            key={feed.id}
            href={`/feed/${feed.id}`}
            icon={feed.iconUrl ? '🔗' : '📄'}
            label={feed.title}
            count={feed.unreadCount}
            active={pathname === `/feed/${feed.id}`}
          />
        ))}
        {feeds && feeds.length > 10 && (
          <Link
            href="/feeds"
            className="block px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            View all {feeds.length} feeds →
          </Link>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-1">
        <NavItem
          href="/feeds/add"
          icon="➕"
          label="Add Feed"
          active={pathname === '/feeds/add'}
        />
        <NavItem
          href="/settings"
          icon="⚙️"
          label="Settings"
          active={pathname === '/settings'}
        />
      </div>
    </aside>
  );
}
