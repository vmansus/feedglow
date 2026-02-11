'use client';

import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { Feed } from '@feedglow/shared';

// Cache icons in memory across renders
const iconCache = new Map<number, string>();

export function useFeedIcons(feeds: Feed[] | undefined) {
  // Get list of feed IDs that have icons (icon_id > 0) and aren't cached
  const feedsWithIcons = feeds?.filter(
    (f) => f.icon?.icon_id && f.icon.icon_id > 0 && !iconCache.has(f.id)
  ) || [];

  return useQuery({
    queryKey: ['feed-icons', feedsWithIcons.map(f => f.id).join(',')],
    queryFn: async () => {
      // Fetch all icons in parallel
      const results = await Promise.all(
        feedsWithIcons.map(async (feed) => {
          const icon = await api.getFeedIcon(feed.id);
          if (icon?.dataUrl) {
            iconCache.set(feed.id, icon.dataUrl);
          }
          return { feedId: feed.id, dataUrl: icon?.dataUrl || null };
        })
      );
      return results;
    },
    enabled: feedsWithIcons.length > 0,
    staleTime: Infinity, // Icons rarely change
    gcTime: Infinity,
  });
}

// Get icon from cache
export function getFeedIconUrl(feedId: number): string | undefined {
  return iconCache.get(feedId);
}
