/**
 * Entry hooks with React Query
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
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
      toast.success('Marked as unread');
    },
  });
}

export function useToggleBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.toggleBookmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      toast.success('Bookmark updated');
    },
    onError: () => {
      toast.error('Failed to update bookmark');
    },
  });
}

export function useUpdateEntriesStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryIds, status }: { entryIds: number[]; status: 'read' | 'unread' }) =>
      api.updateEntriesStatus(entryIds, status),
    onSuccess: (_, { entryIds, status }) => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success(`${entryIds.length} entries marked as ${status}`);
    },
    onError: () => {
      toast.error('Failed to update entries');
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
      toast.success('Summary generated!');
    },
    onError: () => {
      toast.error('Failed to generate summary');
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
      toast.success('Translation complete!');
    },
    onError: () => {
      toast.error('Failed to translate');
    },
  });
}

export function useGenerateTags() {
  return useMutation({
    mutationFn: api.generateTags,
    onSuccess: () => {
      toast.success('Tags generated!');
    },
    onError: () => {
      toast.error('Failed to generate tags');
    },
  });
}
