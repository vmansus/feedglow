/**
 * Notification Types — shared between API and Web
 */

export type NotificationTriggerType = 'new_article' | 'keyword' | 'feed' | 'category';
export type NotificationChannel = 'push' | 'email' | 'webhook' | 'telegram' | 'discord';

export interface NotificationTriggers {
  type: NotificationTriggerType;
  feedId?: number;
  categoryId?: number;
  keywords?: string[];
}

export interface NotificationChannels {
  push?: boolean;
  email?: boolean;
  discord?: boolean;
  webhook?: string;
  telegram?: string;
  channelIds?: number[];
}

export interface NotificationSchedule {
  type: 'immediate' | 'digest';
  digestTime?: string; // HH:mm format
}

export interface NotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggers: NotificationTriggers;
  channels: NotificationChannels;
  schedule?: NotificationSchedule;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationRuleInput {
  name: string;
  enabled?: boolean;
  triggers: NotificationTriggers;
  channels: NotificationChannels;
  schedule?: NotificationSchedule;
}

export interface UpdateNotificationRuleInput {
  name?: string;
  enabled?: boolean;
  triggers?: NotificationTriggers;
  channels?: NotificationChannels;
  schedule?: NotificationSchedule;
}

export interface NotificationRulesResponse {
  rules: NotificationRule[];
}

export interface TestNotificationResult {
  success: boolean;
  message?: string;
}
