/**
 * Category hooks with React Query
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';

export function useCategories() {
  const query = useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories,
  });
  
  return {
    // Defensive: ensure categories is always an array or undefined
    categories: Array.isArray(query.data) ? query.data : undefined,
    isLoading: query.isLoading,
    error: query.error,
    mutate: query.refetch,
  };
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ title, parentId }: { title: string; parentId?: number }) => api.createCategory(title, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => api.updateCategory(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}
