/**
 * Reading Statistics Service
 * Analytics and insights about reading habits
 */

import { loadUserProfile, type ReadEvent, type ActionEvent } from './user-events.js';

// Stats summary
export interface StatsSummary {
  today: {
    articlesRead: number;
    timeSpent: number;  // seconds
  };
  thisWeek: {
    articlesRead: number;
    timeSpent: number;
    avgPerDay: number;
  };
  thisMonth: {
    articlesRead: number;
    timeSpent: number;
  };
  allTime: {
    articlesRead: number;
    timeSpent: number;
    feedsRead: number;
  };
}

// Topic distribution
export interface TopicStats {
  topic: string;
  count: number;
  percentage: number;
  timeSpent: number;
}

// Trend data point
export interface TrendPoint {
  date: string;  // YYYY-MM-DD
  articlesRead: number;
  timeSpent: number;
}

// Reading streak
export interface StreakInfo {
  current: number;      // current streak in days
  longest: number;      // longest streak ever
  lastReadDate: string; // YYYY-MM-DD
}

// Achievement
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: number;
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-read', name: 'First Steps', description: 'Read your first article', icon: '📖' },
  { id: 'streak-7', name: 'Week Warrior', description: '7-day reading streak', icon: '🔥' },
  { id: 'streak-30', name: 'Monthly Master', description: '30-day reading streak', icon: '🏆' },
  { id: 'articles-100', name: 'Century Reader', description: 'Read 100 articles', icon: '💯' },
  { id: 'articles-500', name: 'Knowledge Seeker', description: 'Read 500 articles', icon: '🧠' },
  { id: 'time-1h', name: 'Deep Diver', description: 'Spend 1 hour reading in a day', icon: '🤿' },
  { id: 'feeds-10', name: 'Diverse Reader', description: 'Read from 10 different feeds', icon: '🌐' },
];

/**
 * Get stats summary
 */
export async function getStatsSummary(userId: number): Promise<StatsSummary> {
  const profile = await loadUserProfile(userId);
  const readEvents = profile.events.filter(e => e.type === 'read') as ReadEvent[];

  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  const monthStart = todayStart - 29 * 24 * 60 * 60 * 1000;

  // Today
  const todayEvents = readEvents.filter(e => e.timestamp >= todayStart);
  const today = {
    articlesRead: todayEvents.length,
    timeSpent: todayEvents.reduce((sum, e) => sum + e.duration, 0),
  };

  // This week
  const weekEvents = readEvents.filter(e => e.timestamp >= weekStart);
  const thisWeek = {
    articlesRead: weekEvents.length,
    timeSpent: weekEvents.reduce((sum, e) => sum + e.duration, 0),
    avgPerDay: Math.round(weekEvents.length / 7 * 10) / 10,
  };

  // This month
  const monthEvents = readEvents.filter(e => e.timestamp >= monthStart);
  const thisMonth = {
    articlesRead: monthEvents.length,
    timeSpent: monthEvents.reduce((sum, e) => sum + e.duration, 0),
  };

  // All time
  const uniqueFeeds = new Set(readEvents.map(e => e.feedId));
  const allTime = {
    articlesRead: readEvents.length,
    timeSpent: readEvents.reduce((sum, e) => sum + e.duration, 0),
    feedsRead: uniqueFeeds.size,
  };

  return { today, thisWeek, thisMonth, allTime };
}

/**
 * Get topic distribution (based on feed categories)
 */
export async function getTopicStats(
  userId: number,
  feedCategories: Record<number, string>
): Promise<TopicStats[]> {
  const profile = await loadUserProfile(userId);
  const readEvents = profile.events.filter(e => e.type === 'read') as ReadEvent[];

  // Group by category
  const topicData = new Map<string, { count: number; timeSpent: number }>();

  for (const event of readEvents) {
    const topic = feedCategories[event.feedId] || 'Uncategorized';
    const current = topicData.get(topic) || { count: 0, timeSpent: 0 };
    current.count++;
    current.timeSpent += event.duration;
    topicData.set(topic, current);
  }

  const total = readEvents.length || 1;

  return Array.from(topicData.entries())
    .map(([topic, data]) => ({
      topic,
      count: data.count,
      percentage: Math.round(data.count / total * 100),
      timeSpent: data.timeSpent,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get reading trends over time
 */
export async function getTrends(
  userId: number,
  days: number = 30
): Promise<TrendPoint[]> {
  const profile = await loadUserProfile(userId);
  const readEvents = profile.events.filter(e => e.type === 'read') as ReadEvent[];

  // Initialize all days
  const trends: TrendPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const dateStr = date.toISOString().split('T')[0];
    const dayStart = date.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const dayEvents = readEvents.filter(e => e.timestamp >= dayStart && e.timestamp < dayEnd);

    trends.push({
      date: dateStr,
      articlesRead: dayEvents.length,
      timeSpent: dayEvents.reduce((sum, e) => sum + e.duration, 0),
    });
  }

  return trends;
}

/**
 * Get reading streak info
 */
export async function getStreakInfo(userId: number): Promise<StreakInfo> {
  const profile = await loadUserProfile(userId);
  const readEvents = profile.events.filter(e => e.type === 'read') as ReadEvent[];

  if (readEvents.length === 0) {
    return { current: 0, longest: 0, lastReadDate: '' };
  }

  // Get unique reading days
  const readDays = new Set<string>();
  for (const event of readEvents) {
    const date = new Date(event.timestamp).toISOString().split('T')[0];
    readDays.add(date);
  }

  const sortedDays = Array.from(readDays).sort().reverse();
  const lastReadDate = sortedDays[0];

  // Calculate current streak
  let currentStreak = 0;
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Check if streak is still active (read today or yesterday)
  if (sortedDays[0] === today || sortedDays[0] === yesterday) {
    currentStreak = 1;
    let checkDate = new Date(sortedDays[0]);

    for (let i = 1; i < sortedDays.length; i++) {
      checkDate.setDate(checkDate.getDate() - 1);
      const checkStr = checkDate.toISOString().split('T')[0];

      if (sortedDays[i] === checkStr) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 1;

  const chronologicalDays = Array.from(readDays).sort();
  for (let i = 1; i < chronologicalDays.length; i++) {
    const prev = new Date(chronologicalDays[i - 1]);
    const curr = new Date(chronologicalDays[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000);

    if (diffDays === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  return {
    current: currentStreak,
    longest: longestStreak,
    lastReadDate,
  };
}

/**
 * Get unlocked achievements
 */
export async function getAchievements(userId: number): Promise<Achievement[]> {
  const profile = await loadUserProfile(userId);
  const readEvents = profile.events.filter(e => e.type === 'read') as ReadEvent[];
  const streak = await getStreakInfo(userId);

  const unlocked: Achievement[] = [];

  // First read
  if (readEvents.length >= 1) {
    unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === 'first-read')!, unlockedAt: readEvents[0].timestamp });
  }

  // Streak achievements
  if (streak.longest >= 7) {
    unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === 'streak-7')! });
  }
  if (streak.longest >= 30) {
    unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === 'streak-30')! });
  }

  // Article count achievements
  if (readEvents.length >= 100) {
    unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === 'articles-100')! });
  }
  if (readEvents.length >= 500) {
    unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === 'articles-500')! });
  }

  // Time achievement (1 hour in a day)
  const dayTimes = new Map<string, number>();
  for (const event of readEvents) {
    const date = new Date(event.timestamp).toISOString().split('T')[0];
    dayTimes.set(date, (dayTimes.get(date) || 0) + event.duration);
  }
  if (Array.from(dayTimes.values()).some(t => t >= 3600)) {
    unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === 'time-1h')! });
  }

  // Diverse reader (10 feeds)
  const uniqueFeeds = new Set(readEvents.map(e => e.feedId));
  if (uniqueFeeds.size >= 10) {
    unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === 'feeds-10')! });
  }

  return unlocked;
}

/**
 * Get all available achievements with unlock status
 */
export async function getAllAchievements(userId: number): Promise<(Achievement & { unlocked: boolean })[]> {
  const unlocked = await getAchievements(userId);
  const unlockedIds = new Set(unlocked.map(a => a.id));

  return ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: unlockedIds.has(a.id),
    unlockedAt: unlocked.find(u => u.id === a.id)?.unlockedAt,
  }));
}
