import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { 
  AIFilter, 
  CreateAIFilterInput, 
  UpdateAIFilterInput,
  AIFiltersResponse,
  EntryScore 
} from '@feedglow/shared';

// Re-export types for convenience
export type { AIFilter, CreateAIFilterInput, UpdateAIFilterInput, EntryScore };

export function useAIFilters() {
  return useQuery({
    queryKey: ['ai-filters'],
    queryFn: async () => {
      const res = await api.get('/ai/filters');
      if (!res.ok) return [];
      const data: AIFiltersResponse = await res.json();
      return data.filters || [];
    },
  });
}

export function useCreateAIFilter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (filter: CreateAIFilterInput) => {
      const res = await api.post('/ai/filters', filter);
      if (!res.ok) throw new Error('Failed to create filter');
      return res.json() as Promise<AIFilter>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-filters'] });
    },
  });
}

export function useUpdateAIFilter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateAIFilterInput & { id: string }) => {
      const res = await api.put(`/ai/filters/${id}`, updates);
      if (!res.ok) throw new Error('Failed to update filter');
      return res.json() as Promise<AIFilter>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-filters'] });
    },
  });
}

export function useDeleteAIFilter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/ai/filters/${id}`);
      if (!res.ok) throw new Error('Failed to delete filter');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-filters'] });
    },
  });
}

export function useScoreEntry() {
  return useMutation({
    mutationFn: async (entryId: number) => {
      const res = await api.post(`/ai/filters/score/${entryId}`);
      if (!res.ok) throw new Error('Failed to score entry');
      return res.json() as Promise<EntryScore>;
    },
  });
}
