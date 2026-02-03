/**
 * Entry hooks with React Query
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { GetEntriesParams } from '@/lib/api';

export function useEntries(params?: GetEntriesParams) {
  return useQuery({
    queryKey: ['entries', params],
    queryFn: () => api.getEntries(params),
  });
}

export function useEntry(id: number) {
  return useQuery({
    queryKey: ['entries', id],
    queryFn: () => api.getEntry(id),
    enabled: !!id,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
  });
}

export function useMarkAsUnread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.markAsUnread,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
  });
}

export function useToggleBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.toggleBookmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });
}

export function useUpdateEntriesStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryIds, status }: { entryIds: number[]; status: 'read' | 'unread' }) =>
      api.updateEntriesStatus(entryIds, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
  });
}

// AI Features
export function useSummarize() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.summarizeEntry,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['entries', data.entryId] });
    },
  });
}

export function useTranslate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, language }: { id: number; language?: string }) =>
      api.translateEntry(id, language),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['entries', data.entryId] });
    },
  });
}

export function useGenerateTags() {
  return useMutation({
    mutationFn: api.generateTags,
  });
}
