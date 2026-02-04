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
    onMutate: async (entryId: number) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['entries'] });

      // Snapshot previous value
      const previousEntries = queryClient.getQueriesData({ queryKey: ['entries'] });

      // Optimistically update all entry caches
      queryClient.setQueriesData({ queryKey: ['entries'] }, (old: any) => {
        if (!old) return old;
        if (old.entries) {
          return {
            ...old,
            entries: old.entries.map((entry: any) =>
              entry.id === entryId ? { ...entry, starred: !entry.starred } : entry
            ),
          };
        }
        return old;
      });

      return { previousEntries };
    },
    onError: (_err, _entryId, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        context.previousEntries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error('Failed to update bookmark');
    },
    onSuccess: () => {
      toast.success('Bookmark updated');
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['entries'] });
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
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update entries');
    },
  });
}

// Batch mark read
export function useMarkFeedAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ feedId, before }: { feedId: number; before?: string }) =>
      api.markFeedAsRead(feedId, before),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success('已全部标记为已读');
    },
    onError: (error: Error) => {
      toast.error(error.message || '标记失败');
    },
  });
}

export function useMarkCategoryAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ categoryId, before }: { categoryId: number; before?: string }) =>
      api.markCategoryAsRead(categoryId, before),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('分类已全部标记为已读');
    },
    onError: (error: Error) => {
      toast.error(error.message || '标记失败');
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('全部已标记为已读');
    },
    onError: (error: Error) => {
      toast.error(error.message || '标记失败');
    },
  });
}

// Search
export function useSearchEntries(params: api.SearchParams | null) {
  return useQuery({
    queryKey: ['entries', 'search', params],
    queryFn: () => api.searchEntries(params!),
    enabled: !!params?.q,
  });
}

// Tags
export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
  });
}

export function useAddTagToEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, tagName }: { entryId: number; tagName: string }) =>
      api.addTagToEntry(entryId, tagName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success('标签已添加');
    },
    onError: (error: Error) => {
      toast.error(error.message || '添加标签失败');
    },
  });
}

export function useRemoveTagFromEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, tagId }: { entryId: number; tagId: string }) =>
      api.removeTagFromEntry(entryId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

// Share
export function useShareEntry() {
  return useMutation({
    mutationFn: api.shareEntry,
    onError: (error: Error) => {
      toast.error(error.message || '分享失败');
    },
  });
}

export function useUnshareEntry() {
  return useMutation({
    mutationFn: api.unshareEntry,
    onSuccess: () => {
      toast.success('已取消分享');
    },
    onError: (error: Error) => {
      toast.error(error.message || '操作失败');
    },
  });
}

// AI Features - Full content with caching
export function useFullContent(entryId: number, enabled: boolean = false) {
  return useQuery({
    queryKey: ['fullContent', entryId],
    queryFn: () => api.fetchFullContent(entryId),
    enabled: enabled && !!entryId,
    staleTime: Infinity, // Never refetch automatically - content doesn't change
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
  });
}

export function useFetchFullContent() {
  return useMutation({
    mutationFn: api.fetchFullContent,
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to fetch full content');
    },
  });
}

export function useSummarize() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.summarizeEntry,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['entries', data.entryId] });
      toast.success('Summary generated!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate summary');
    },
  });
}

// Simple batch translation
export function useTranslateParagraphs() {
  return useMutation({
    mutationFn: ({ paragraphs, language }: { paragraphs: string[]; language?: string }) =>
      api.translateParagraphs(paragraphs, language),
    onError: (error: Error) => {
      toast.error(error.message || '翻译失败');
    },
  });
}

export function useGenerateTags() {
  return useMutation({
    mutationFn: api.generateTags,
    onSuccess: () => {
      toast.success('Tags generated!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate tags');
    },
  });
}

// P0: Ranked entries for "For You" page
export function useRankedEntries() {
  return useQuery({
    queryKey: ['entries', 'ranked'],
    queryFn: api.getRankedEntries,
  });
}

// P0: Record read events for personalization
export function useRecordReadEvent() {
  return useMutation({
    mutationFn: api.recordReadEvent,
    // Silent - no toast
  });
}

// P0: Record action events (bookmark, share, etc)
export function useRecordActionEvent() {
  return useMutation({
    mutationFn: api.recordActionEvent,
    // Silent - no toast
  });
}
