'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, BookOpen, Clock, Flame, Trophy, TrendingUp, Calendar, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@feedglow/ui';
import * as api from '@/lib/api';

interface StatsSummary {
  totalRead: number;
  totalTime: number; // minutes
  currentStreak: number;
  longestStreak: number;
  articlesThisWeek: number;
  articlesLastWeek: number;
  averagePerDay: number;
}

interface TopicStats {
  topic: string;
  count: number;
  percentage: number;
}

interface DailyStats {
  date: string;
  count: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  target?: number;
}

export default function StatsPage() {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');

  const { data: summary } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: () => api.getStatsSummary(),
  });

  const { data: topics } = useQuery({
    queryKey: ['stats', 'topics', timeRange],
    queryFn: () => api.getTopicStats(timeRange),
  });

  const { data: trends } = useQuery({
    queryKey: ['stats', 'trends', timeRange],
    queryFn: () => api.getTrendStats(timeRange),
  });

  const { data: achievements } = useQuery({
    queryKey: ['stats', 'achievements'],
    queryFn: () => api.getAchievements(),
  });

  // Default data for development/demo
  const defaultStats: StatsSummary = {
    totalRead: 247,
    totalTime: 1840,
    currentStreak: 7,
    longestStreak: 14,
    articlesThisWeek: 32,
    articlesLastWeek: 28,
    averagePerDay: 4.5,
  };
  const stats: StatsSummary = summary?.totalRead !== undefined ? summary : defaultStats;

  const topicData: TopicStats[] = topics?.topics || [
    { topic: 'Technology', count: 89, percentage: 36 },
    { topic: 'Science', count: 52, percentage: 21 },
    { topic: 'Business', count: 41, percentage: 17 },
    { topic: 'Design', count: 33, percentage: 13 },
    { topic: 'Other', count: 32, percentage: 13 },
  ];

  const dailyData: DailyStats[] = trends?.daily || [
    { date: 'Mon', count: 5 },
    { date: 'Tue', count: 3 },
    { date: 'Wed', count: 7 },
    { date: 'Thu', count: 4 },
    { date: 'Fri', count: 6 },
    { date: 'Sat', count: 2 },
    { date: 'Sun', count: 5 },
  ];

  const defaultAchievements: Achievement[] = [
    { id: '1', name: 'First Steps', description: 'Read your first article', icon: '👶', unlocked: true, unlockedAt: '2024-01-15' },
    { id: '2', name: 'Bookworm', description: 'Read 100 articles', icon: '📚', unlocked: true, unlockedAt: '2024-02-01' },
    { id: '3', name: 'On Fire', description: '7-day reading streak', icon: '🔥', unlocked: true, unlockedAt: '2024-02-10' },
    { id: '4', name: 'Scholar', description: 'Read 500 articles', icon: '🎓', unlocked: false, progress: 247, target: 500 },
    { id: '5', name: 'Marathon', description: '30-day reading streak', icon: '🏃', unlocked: false, progress: 7, target: 30 },
    { id: '6', name: 'Polymath', description: 'Read from 10 different topics', icon: '🧠', unlocked: false, progress: 5, target: 10 },
  ];

  const achievementData = achievements?.achievements || defaultAchievements;

  const weekChange = stats.articlesLastWeek > 0 
    ? Math.round(((stats.articlesThisWeek - stats.articlesLastWeek) / stats.articlesLastWeek) * 100)
    : 100;

  return (
    <div className="h-full overflow-y-auto surface-base">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center"
              style={{ boxShadow: '0 0 25px rgba(249, 115, 22, 0.4)' }}
            >
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">Reading Stats</h1>
              <p className="text-sm text-muted">Track your reading progress</p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            label="Articles Read"
            value={stats.totalRead.toLocaleString()}
            color="orange"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Reading Time"
            value={`${Math.floor(stats.totalTime / 60)}h ${stats.totalTime % 60}m`}
            color="blue"
          />
          <StatCard
            icon={<Flame className="w-5 h-5" />}
            label="Current Streak"
            value={`${stats.currentStreak} days`}
            subtext={`Best: ${stats.longestStreak} days`}
            color="red"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="This Week"
            value={stats.articlesThisWeek.toString()}
            subtext={`${weekChange >= 0 ? '+' : ''}${weekChange}% vs last week`}
            subtextColor={weekChange >= 0 ? 'green' : 'red'}
            color="green"
          />
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-2 mb-6">
          {(['week', 'month', 'year'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                timeRange === range 
                  ? 'bg-orange-500 text-white' 
                  : 'text-secondary hover:bg-[rgb(var(--bg-hover))]'
              )}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Activity Chart */}
          <div className="surface-elevated rounded-xl border border-default p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold text-[rgb(var(--text-primary))]">Daily Activity</h3>
            </div>
            <div className="flex items-end justify-between h-32 gap-2">
              {dailyData.map((day, i) => {
                const maxCount = Math.max(...dailyData.map(d => d.count));
                const height = (day.count / maxCount) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ delay: i * 0.05, duration: 0.3 }}
                      className="w-full bg-gradient-to-t from-orange-500 to-orange-400 rounded-t"
                      style={{ minHeight: '4px' }}
                    />
                    <span className="text-xs text-muted">{day.date}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Topics Distribution */}
          <div className="surface-elevated rounded-xl border border-default p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold text-[rgb(var(--text-primary))]">Top Topics</h3>
            </div>
            <div className="space-y-3">
              {topicData.map((topic, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[rgb(var(--text-primary))]">{topic.topic}</span>
                    <span className="text-muted">{topic.count} articles</span>
                  </div>
                  <div className="h-2 bg-[rgb(var(--bg-hover))] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${topic.percentage}%` }}
                      transition={{ delay: i * 0.1, duration: 0.5 }}
                      className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Achievements */}
        <div className="surface-elevated rounded-xl border border-default p-6">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-[rgb(var(--text-primary))]">Achievements</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {achievementData.map((achievement) => (
              <motion.div
                key={achievement.id}
                whileHover={{ scale: 1.05 }}
                className={cn(
                  'p-4 rounded-xl text-center transition-all',
                  achievement.unlocked 
                    ? 'bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/30'
                    : 'bg-[rgb(var(--bg-hover))] border border-default opacity-60'
                )}
              >
                <div className={cn(
                  'text-3xl mb-2',
                  !achievement.unlocked && 'grayscale'
                )}>
                  {achievement.icon}
                </div>
                <h4 className="text-sm font-medium text-[rgb(var(--text-primary))] mb-1">
                  {achievement.name}
                </h4>
                <p className="text-xs text-muted">
                  {achievement.unlocked 
                    ? achievement.description 
                    : `${achievement.progress}/${achievement.target}`}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  icon, 
  label, 
  value, 
  subtext,
  subtextColor,
  color 
}: { 
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  subtextColor?: 'green' | 'red';
  color: 'orange' | 'blue' | 'red' | 'green';
}) {
  const colors = {
    orange: 'from-orange-500 to-orange-600',
    blue: 'from-blue-500 to-blue-600',
    red: 'from-red-500 to-red-600',
    green: 'from-green-500 to-green-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-elevated rounded-xl border border-default p-4"
    >
      <div className={cn(
        'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white mb-3',
        colors[color]
      )}>
        {icon}
      </div>
      <p className="text-sm text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-[rgb(var(--text-primary))]">{value}</p>
      {subtext && (
        <p className={cn(
          'text-xs mt-1',
          subtextColor === 'green' ? 'text-green-500' : subtextColor === 'red' ? 'text-red-500' : 'text-muted'
        )}>
          {subtext}
        </p>
      )}
    </motion.div>
  );
}
