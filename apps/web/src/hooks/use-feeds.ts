'use client';

import { t } from '@/lib/i18n';
/**
 * Feed hooks with React Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';

export function useFeeds() {
  const query = useQuery({
    queryKey: ['feeds'],
    queryFn: api.getFeeds,
  });
  
  return {
    // Defensive: ensure feeds is always an array or undefined
    feeds: Array.isArray(query.data) ? query.data : undefined,
    isLoading: query.isLoading,
    error: query.error,
    mutate: query.refetch,
  };
}

export function useFeed(id: number) {
  return useQuery({
    queryKey: ['feeds', id],
    queryFn: () => api.getFeed(id),
    enabled: !!id,
  });
}

export function useCreateFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ url, categoryId }: { url: string; categoryId?: number }) =>
      api.createFeed(url, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success('Feed added successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add feed');
    },
  });
}

export function useDeleteFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.deleteFeed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success('Feed deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete feed');
    },
  });
}

export function useRefreshFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.refreshFeed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      toast.success('Feed refreshed!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to refresh feed');
    },
  });
}

export function useRefreshAllFeeds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.refreshAllFeeds,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success('All feeds refreshed!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to refresh feeds');
    },
  });
}

export function useBackfillFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feedId: number) => api.backfillFeed(feedId),
    onSuccess: (result) => {
      if (result.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['entries'] });
        toast.success(t('hooks.backfilledArticles', { count: result.imported }));
      }
      // No sitemap or no new articles — stay silent (auto-triggered, not user action)
    },
    onError: () => {
      // Silent — auto-backfill failure is not user-facing
    },
  });
}

export function useExportOpml() {
  return useMutation({
    mutationFn: api.exportOpml,
    onSuccess: (blob) => {
      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'feedglow-subscriptions.opml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('OPML exported!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to export OPML');
    },
  });
}

export function useImportOpml() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.importOpml,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('OPML imported successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to import OPML');
    },
  });
}

export function useUpdateFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { categoryId?: number; title?: string; feed_type?: string; hide_globally?: boolean; polling_frequency?: number } }) =>
      api.updateFeed(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Feed updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update feed');
    },
  });
}

export function useUpdateFeedSettings() {
  const queryClient = useQueryClient();

  interface FeedSettings {
    crawler?: boolean;
    username?: string;
    password?: string;
    user_agent?: string;
    blocklist_rules?: string;
    keeplist_rules?: string;
    scraper_rules?: string;
    rewrite_rules?: string;
  }

  return useMutation({
    mutationFn: ({ feedId, settings }: { feedId: number; settings: FeedSettings }) =>
      api.updateFeedSettings(feedId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success('Feed settings updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update feed settings');
    },
  });
}
