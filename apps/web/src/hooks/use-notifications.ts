'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';
import type {
  NotificationRule,
  CreateNotificationRuleInput,
  UpdateNotificationRuleInput,
  NotificationRulesResponse,
  TestNotificationResult,
} from '@feedglow/shared';

// Re-export types for convenience
export type { NotificationRule, CreateNotificationRuleInput, UpdateNotificationRuleInput };

export function useNotificationRules() {
  return useQuery({
    queryKey: ['notification-rules'],
    queryFn: async () => {
      const res = await api.get('/notifications/rules');
      if (!res.ok) return [];
      const data: NotificationRulesResponse = await res.json();
      return data.rules || [];
    },
  });
}

export function useCreateNotificationRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rule: CreateNotificationRuleInput) => {
      const res = await api.post('/notifications/rules', rule);
      if (!res.ok) throw new Error('Failed to create rule');
      return res.json() as Promise<NotificationRule>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
  });
}

export function useUpdateNotificationRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateNotificationRuleInput & { id: string }) => {
      const res = await api.put(`/notifications/rules/${id}`, updates);
      if (!res.ok) throw new Error('Failed to update rule');
      return res.json() as Promise<NotificationRule>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
  });
}

export function useDeleteNotificationRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/notifications/rules/${id}`);
      if (!res.ok) throw new Error('Failed to delete rule');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
  });
}

export function useTestNotification() {
  return useMutation({
    mutationFn: async (): Promise<TestNotificationResult> => {
      const res = await api.post('/notifications/test');
      if (!res.ok) return { success: false, message: t('settings.notifications.testFailed') };
      return res.json();
    },
  });
}
