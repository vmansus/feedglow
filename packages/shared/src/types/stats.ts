/**
 * Stats & Analytics Types — shared between frontend and backend
 */

export interface StatsSummary {
  totalRead: number;
  totalTime: number;
  currentStreak: number;
  longestStreak: number;
  articlesThisWeek: number;
  articlesLastWeek: number;
  averagePerDay: number;
}

export interface TopicStats {
  topic: string;
  count: number;
  percentage: number;
}

export interface DailyStats {
  date: string;
  count: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  target?: number;
}

export interface FeedStats {
  feedId: number;
  title: string;
  totalEntries: number;
  readEntries: number;
  avgReadingTime: number;
  lastPublishedAt: string | null;
  health: 'good' | 'stale' | 'dead';
}
