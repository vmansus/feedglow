import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';

// Re-export types from api for convenience
export type { DigestEntry, DailyDigest } from '@/lib/api';

export function useDigest(date?: string) {
  return useQuery({
    queryKey: ['digest', date || 'today'],
    queryFn: () => date ? api.getDigestByDate(date) : api.getDigestToday(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useGenerateDigest() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => api.generateDigest(),
    onSuccess: (data) => {
      queryClient.setQueryData(['digest', 'today'], data);
      queryClient.setQueryData(['digest', data.date], data);
    },
  });
}
