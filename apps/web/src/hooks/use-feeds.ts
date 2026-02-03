/**
 * Feed hooks with React Query
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';

export function useFeeds() {
  const query = useQuery({
    queryKey: ['feeds'],
    queryFn: api.getFeeds,
  });
  
  return {
    feeds: query.data,
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
    onError: () => {
      toast.error('Failed to delete feed');
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
    onError: () => {
      toast.error('Failed to refresh feed');
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
    onError: () => {
      toast.error('Failed to refresh feeds');
    },
  });
}
