import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ServiceInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  configFields: {
    name: string;
    type: 'text' | 'password' | 'url';
    label: string;
    required: boolean;
    placeholder?: string;
  }[];
}

export interface Integration {
  service: string;
  enabled: boolean;
  config: Record<string, string>;
  lastSyncAt?: string;
}

export function useServices() {
  return useQuery({
    queryKey: ['integration-services'],
    queryFn: async () => {
      const res = await api.get('/integrations/services');
      if (!res.ok) throw new Error('Failed to fetch services');
      const data = await res.json();
      return Array.isArray(data) ? data : (data.services || []) as ServiceInfo[];
    },
    staleTime: Infinity, // Services don't change
  });
}

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await api.get('/integrations');
      if (!res.ok) throw new Error('Failed to fetch integrations');
      const data = await res.json();
      return Array.isArray(data) ? data : (data.integrations || []) as Integration[];
    },
  });
}

export function useIntegration(service: string) {
  return useQuery({
    queryKey: ['integrations', service],
    queryFn: async () => {
      const res = await api.get(`/integrations/${service}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch integration');
      }
      return res.json() as Promise<Integration>;
    },
    enabled: !!service,
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ service, config, enabled }: { service: string; config?: Record<string, string>; enabled?: boolean }) => {
      const res = await api.put(`/integrations/${service}`, { config, enabled });
      if (!res.ok) throw new Error('Failed to update integration');
      return res.json() as Promise<Integration>;
    },
    onSuccess: (_, { service }) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', service] });
    },
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (service: string) => {
      const res = await api.delete(`/integrations/${service}`);
      if (!res.ok) throw new Error('Failed to delete integration');
    },
    onSuccess: (_, service) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', service] });
    },
  });
}

export function useSaveToService() {
  return useMutation({
    mutationFn: async ({ service, entryId }: { service: string; entryId: number | string }) => {
      const res = await api.post(`/integrations/${service}/save/${entryId}`);
      if (!res.ok) throw new Error('Failed to save to service');
      return res.json();
    },
  });
}

export function useTestIntegration() {
  return useMutation({
    mutationFn: async (service: string) => {
      const res = await api.post(`/integrations/${service}/test`);
      if (!res.ok) throw new Error('Integration test failed');
      return res.json() as Promise<{ success: boolean; message?: string }>;
    },
  });
}
