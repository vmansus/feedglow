'use client';

import { t } from '@/lib/i18n';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, BookOpen, Clock, Flame, Trophy, TrendingUp, Calendar, Zap, Rss, Loader2 } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { FeedAnalytics } from '@/components/stats/feed-analytics';
import { api } from '@/lib/api';

interface StatsSummary {
  totalRead: number;
  totalTime: number; // seconds from API
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
  timeSpent: number;
}

interface TrendPoint {
  date: string;
  articlesRead: number;
  timeSpent: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
  progress?: number;
  target?: number;
}

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'feeds'>('overview');
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [topicData, setTopicData] = useState<TopicStats[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [achievementData, setAchievementData] = useState<Achievement[]>([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const [summaryRes, topicsRes, trendsRes, achievementsRes] = await Promise.all([
          api.get('/stats/summary'),
          api.get('/stats/topics'),
          api.get(`/stats/trends?days=${timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 365}`),
          api.get('/stats/achievements/all'),
        ]);

        if (summaryRes.ok) {
          const data = await summaryRes.json();
          setStats(data);
        }

        if (topicsRes.ok) {
          const data = await topicsRes.json();
          setTopicData(data.topics || []);
        }

        if (trendsRes.ok) {
          const data = await trendsRes.json();
          setTrendData(data.trends || []);
        }

        if (achievementsRes.ok) {
          const data = await achievementsRes.json();
          setAchievementData(data.achievements || []);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [timeRange]);

  // Get daily data for chart (last 7 days of trend data)
  const dailyData = trendData.slice(-7).map(t => {
    const date = new Date(t.date);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      date: dayNames[date.getDay()],
      count: t.articlesRead,
    };
  });

  const weekChange = stats && stats.articlesLastWeek > 0 
    ? Math.round(((stats.articlesThisWeek - stats.articlesLastWeek) / stats.articlesLastWeek) * 100)
    : 0;

  // Format time from seconds to hours and minutes
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center surface-base">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <p className="text-muted">{t('stats.loadingStats')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto surface-base">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div 
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center"
              style={{ boxShadow: '0 0 25px rgba(249, 115, 22, 0.4)' }}
            >
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">{t('stats.title')}</h1>
              <p className="text-sm text-muted">{t('stats.subtitle')}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === 'overview'
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              )}
            >
              <TrendingUp className="w-4 h-4" />
              {t('stats.overview')}
            </button>
            <button
              onClick={() => setActiveTab('feeds')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === 'feeds'
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              )}
            >
              <Rss className="w-4 h-4" />
              {t('stats.feedAnalysis')}
            </button>
          </div>
        </div>

        {activeTab === 'feeds' ? (
          <FeedAnalytics />
        ) : (
          <>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            label={t('stats.articlesRead')}
            value={(stats?.totalRead || 0).toLocaleString()}
            color="orange"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label={t('stats.readingTime')}
            value={formatTime(stats?.totalTime || 0)}
            color="blue"
          />
          <StatCard
            icon={<Flame className="w-5 h-5" />}
            label={t('stats.currentStreak')}
            value={t('stats.days', { n: stats?.currentStreak || 0 })}
            subtext={t('stats.longestStreak', { n: stats?.longestStreak || 0 })}
            color="red"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label={t('stats.weeklyReading')}
            value={(stats?.articlesThisWeek || 0).toString()}
            subtext={weekChange !== 0 ? t('stats.vsLastWeek', { change: `${weekChange >= 0 ? '+' : ''}${weekChange}` }) : ''}
            subtextColor={weekChange >= 0 ? 'green' : 'red'}
            color="green"
          />
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-2 mb-6">
          {([
            { key: 'week', label: t('stats.thisWeek') },
            { key: 'month', label: t('stats.thisMonth') },
            { key: 'year', label: t('stats.thisYear') },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTimeRange(key)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                timeRange === key 
                  ? 'bg-orange-500 text-white' 
                  : 'text-secondary hover:bg-[rgb(var(--bg-hover))]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Activity Chart */}
          <div className="surface-elevated rounded-xl border border-default p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold text-[rgb(var(--text-primary))]">{t('stats.dailyActivity')}</h3>
            </div>
            {dailyData.length > 0 ? (
              <div className="flex items-end justify-between h-32 gap-2">
                {dailyData.map((day, i) => {
                  const maxCount = Math.max(...dailyData.map(d => d.count), 1);
                  const height = (day.count / maxCount) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ delay: i * 0.05, duration: 0.3 }}
                        className="w-full bg-gradient-to-t from-orange-500 to-orange-400 rounded-t"
                        style={{ minHeight: day.count > 0 ? '4px' : '2px' }}
                      />
                      <span className="text-xs text-muted">{day.date}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-muted">
                {t('stats.noReadingRecords')}
              </div>
            )}
          </div>

          {/* Topics Distribution */}
          <div className="surface-elevated rounded-xl border border-default p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold text-[rgb(var(--text-primary))]">{t('stats.popularCategories')}</h3>
            </div>
            {topicData.length > 0 ? (
              <div className="space-y-3">
                {topicData.slice(0, 5).map((topic, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[rgb(var(--text-primary))]">{topic.topic}</span>
                      <span className="text-muted">{t('stats.articleCount', { count: topic.count })}</span>
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
            ) : (
              <div className="h-32 flex items-center justify-center text-muted">
                {t('stats.noCategoryData')}
              </div>
            )}
          </div>
        </div>

        {/* Achievements */}
        <div className="surface-elevated rounded-xl border border-default p-6">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-[rgb(var(--text-primary))]">{t('stats.achievements')}</h3>
          </div>
          {achievementData.length > 0 ? (
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
                    {achievement.description}
                  </p>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted">
              {t('stats.startReadingAchievements')}
            </div>
          )}
        </div>
        </>
        )}
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
