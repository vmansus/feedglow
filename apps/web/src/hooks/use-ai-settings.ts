'use client';

import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';

export function useAISettings() {
  return useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => api.getAISettings(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
