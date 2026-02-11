'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Sparkles, Play, Clock, X, ChevronDown, ChevronRight, Loader2, Bell, Link2 } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import type { AITask, AITaskRun } from '@/lib/api';
import { useFeeds, useCategories } from '@/hooks';
import { t, getLocale } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

// Schedule type options
const SCHEDULE_TYPES = [
  { value: 'once', label: t('settings.aiTasks.scheduleOnce') },
  { value: 'daily', label: t('settings.aiTasks.scheduleDaily') },
  { value: 'weekly', label: t('settings.aiTasks.scheduleWeekly') },
  { value: 'monthly', label: t('settings.aiTasks.scheduleMonthly') },
];

const DAYS_OF_WEEK = [
  { value: 0, label: t('settings.aiTasks.daySun') },
  { value: 1, label: t('settings.aiTasks.dayMon') },
  { value: 2, label: t('settings.aiTasks.dayTue') },
  { value: 3, label: t('settings.aiTasks.dayWed') },
  { value: 4, label: t('settings.aiTasks.dayThu') },
  { value: 5, label: t('settings.aiTasks.dayFri') },
  { value: 6, label: t('settings.aiTasks.daySat') },
];

interface TaskEditorProps {
  task?: AITask;
  onSave: (task: Omit<AITask, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

function TaskEditor({ task, onSave, onCancel }: TaskEditorProps) {
  const { feeds } = useFeeds();
  // Categories can be added later for category-based filtering
  useCategories();
  
  const [name, setName] = useState(task?.name || '');
  const [prompt, setPrompt] = useState(task?.prompt || '');
  const [scheduleType, setScheduleType] = useState<'once' | 'daily' | 'weekly' | 'monthly'>(
    task?.schedule.type || 'daily'
  );
  const [date, setDate] = useState(task?.schedule.date || '');
  const [timeOfDay, setTimeOfDay] = useState(task?.schedule.timeOfDay || '08:00');
  const [dayOfWeek, setDayOfWeek] = useState(task?.schedule.dayOfWeek ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(task?.schedule.dayOfMonth ?? 1);
  
  const [notifyChannels, setNotifyChannels] = useState<('app' | 'webhook')[]>(
    task?.options.notifyChannels || ['app']
  );
  const [webhookUrl, setWebhookUrl] = useState(task?.options.webhookUrl || '');
  const [selectedFeeds, setSelectedFeeds] = useState<number[]>(task?.options.feedIds || []);
  // Category selection can be added later
  // const [selectedCategories, setSelectedCategories] = useState<number[]>(task?.options.categoryIds || []);
  const [onlyUnread, setOnlyUnread] = useState(task?.options.onlyUnread ?? true);
  const [maxEntries, setMaxEntries] = useState(task?.options.maxEntries || 50);
  const [enabled, setEnabled] = useState(task?.enabled ?? true);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error(t('settings.aiTasks.enterName'));
      return;
    }
    if (!prompt.trim()) {
      toast.error(t('settings.aiTasks.enterPrompt'));
      return;
    }
    if (scheduleType === 'once' && !date) {
      toast.error(t('settings.aiTasks.selectDate'));
      return;
    }
    if (notifyChannels.includes('webhook') && !webhookUrl) {
      toast.error(t('settings.aiTasks.enterWebhookUrl'));
      return;
    }

    onSave({
      name: name.trim(),
      prompt: prompt.trim(),
      schedule: {
        type: scheduleType,
        ...(scheduleType === 'once' && { date }),
        ...(scheduleType !== 'once' && { timeOfDay }),
        ...(scheduleType === 'weekly' && { dayOfWeek }),
        ...(scheduleType === 'monthly' && { dayOfMonth }),
      },
      options: {
        notifyChannels,
        ...(notifyChannels.includes('webhook') && { webhookUrl }),
        ...(selectedFeeds.length > 0 && { feedIds: selectedFeeds }),
        // Category filtering can be added later
        onlyUnread,
        maxEntries,
      },
      enabled,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[rgb(var(--bg-elevated))] rounded-xl border border-default max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-default">
          <h2 className="text-lg font-semibold">
            {task ? t('settings.aiTasks.editTask') : t('settings.aiTasks.createTask')}
          </h2>
          <button onClick={onCancel} className="p-2 hover:bg-[rgb(var(--bg-hover))] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.aiTasks.taskName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.aiTasks.taskNamePlaceholder')}
              maxLength={50}
              className="w-full px-4 py-2.5 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.aiTasks.prompt')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('settings.aiTasks.prompt')}
              rows={4}
              maxLength={2000}
              className="w-full px-4 py-2.5 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none resize-none"
            />
            <p className="text-xs text-muted mt-1 text-right">{prompt.length}/2000</p>
          </div>

          {/* Schedule */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.aiTasks.schedule')}</label>
            <div className="flex gap-2 flex-wrap">
              {SCHEDULE_TYPES.map(type => (
                <button
                  key={type.value}
                  onClick={() => setScheduleType(type.value as any)}
                  className={cn(
                    "px-4 py-2 rounded-lg border text-sm transition-colors",
                    scheduleType === type.value
                      ? "border-orange-500 bg-orange-500/10"
                      : "border-default hover:border-[rgb(var(--text-muted))]"
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2 items-center">
              {scheduleType === 'once' && (
                <input
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                />
              )}

              {scheduleType === 'daily' && (
                <input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                />
              )}

              {scheduleType === 'weekly' && (
                <>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                  >
                    {DAYS_OF_WEEK.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                  />
                </>
              )}

              {scheduleType === 'monthly' && (
                <>
                  <select
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{t('settings.aiTasks.dayOfMonthLabel', { day: d })}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                  />
                </>
              )}
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.aiTasks.scope')}</label>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyUnread}
                    onChange={(e) => setOnlyUnread(e.target.checked)}
                    className="rounded border-default"
                  />
                  <span className="text-sm">{t('settings.aiTasks.onlyUnread')}</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{t('settings.aiTasks.maxArticles')}</span>
                  <input
                    type="number"
                    value={maxEntries}
                    onChange={(e) => setMaxEntries(Number(e.target.value))}
                    min={1}
                    max={200}
                    className="w-20 px-2 py-1 rounded border border-default text-sm text-center"
                  />
                  <span className="text-sm">{t('settings.aiTasks.articlesUnit')}</span>
                </div>
              </div>

              {/* Feed selection */}
              {feeds && feeds.length > 0 && (
                <div>
                  <p className="text-xs text-muted mb-1">{t('settings.aiTasks.limitFeeds')}</p>
                  <div className="flex flex-wrap gap-1">
                    {feeds.map(feed => (
                      <button
                        key={feed.id}
                        onClick={() => {
                          setSelectedFeeds(prev => 
                            prev.includes(feed.id) 
                              ? prev.filter(id => id !== feed.id)
                              : [...prev, feed.id]
                          );
                        }}
                        className={cn(
                          "px-2 py-1 rounded text-xs transition-colors",
                          selectedFeeds.includes(feed.id)
                            ? "bg-orange-500/20 text-orange-500"
                            : "bg-[rgb(var(--bg-base))] text-muted hover:text-[rgb(var(--text-secondary))]"
                        )}
                      >
                        {feed.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notification */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.aiTasks.notification')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setNotifyChannels(prev => 
                    prev.includes('app') 
                      ? prev.filter(c => c !== 'app')
                      : [...prev, 'app']
                  );
                }}
                className={cn(
                  "px-4 py-2 rounded-lg border text-sm transition-colors",
                  notifyChannels.includes('app')
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-default"
                )}
              >
                <Bell className="w-4 h-4 inline mr-1" /> {t('settings.aiTasks.appNotification')}
              </button>
              <button
                onClick={() => {
                  setNotifyChannels(prev => 
                    prev.includes('webhook') 
                      ? prev.filter(c => c !== 'webhook')
                      : [...prev, 'webhook']
                  );
                }}
                className={cn(
                  "px-4 py-2 rounded-lg border text-sm transition-colors",
                  notifyChannels.includes('webhook')
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-default"
                )}
              >
                <Link2 className="w-4 h-4 inline mr-1" /> Webhook
              </button>
            </div>
            {notifyChannels.includes('webhook') && (
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://..."
                className="mt-2 w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default text-sm"
              />
            )}
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm">{t('settings.aiTasks.enableTask')}</span>
            <button
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                enabled ? "bg-orange-500" : "bg-[rgb(var(--bg-active))]"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform",
                enabled ? "translate-x-6" : "translate-x-0.5"
              )} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-default">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-default rounded-lg hover:bg-[rgb(var(--bg-hover))]"
          >
            {t('settings.common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            {t('settings.common.save')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Format schedule description
function formatSchedule(task: AITask): string {
  const { schedule } = task;
  switch (schedule.type) {
    case 'once':
      return schedule.date ? t('settings.aiTasks.onceAt', { date: format(new Date(schedule.date), 'yyyy/MM/dd HH:mm') }) : t('settings.aiTasks.oncePending');
    case 'daily':
      return t('settings.aiTasks.dailyAt', { time: schedule.timeOfDay || '08:00' });
    case 'weekly':
      return t('settings.aiTasks.weeklyAt', { day: DAYS_OF_WEEK.find(d => d.value === schedule.dayOfWeek)?.label || t('settings.aiTasks.dayMon'), time: schedule.timeOfDay || '08:00' });
    case 'monthly':
      return t('settings.aiTasks.monthlyAt', { day: schedule.dayOfMonth || 1, time: schedule.timeOfDay || '08:00' });
    default:
      return t('settings.aiTasks.unknown');
  }
}

// Task card with expandable history
function TaskCard({ 
  task, 
  onEdit, 
  onDelete, 
  onToggle,
  onRun,
}: { 
  task: AITask; 
  onEdit: () => void; 
  onDelete: () => void;
  onToggle: () => void;
  onRun: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  
  // Fetch runs when expanded
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['ai-task-runs', task.id],
    queryFn: () => api.getAITaskRuns(task.id),
    enabled: expanded,
  });

  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      task.enabled ? "border-default bg-[rgb(var(--bg-base))]" : "border-default bg-[rgb(var(--bg-base))] opacity-60"
    )}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-[rgb(var(--text-primary))] truncate">{task.name}</h3>
            </div>
            <p className="text-xs text-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatSchedule(task)}
              {task.lastRunAt && (
                <span className="ml-2">
                  · {t('settings.aiTasks.lastRun')} {formatDistanceToNow(new Date(task.lastRunAt), { addSuffix: true })}
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Run now */}
            <button
              onClick={onRun}
              className="p-1.5 text-muted hover:text-orange-500 hover:bg-orange-500/10 rounded-lg"
              title={t('settings.aiTasks.runNow')}
            >
              <Play className="w-4 h-4" />
            </button>
            
            {/* Toggle */}
            <button
              onClick={onToggle}
              className={cn(
                "w-10 h-5 rounded-full transition-colors relative",
                task.enabled ? "bg-orange-500" : "bg-[rgb(var(--bg-active))]"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform",
                task.enabled ? "translate-x-5" : "translate-x-0.5"
              )} />
            </button>
            
            {/* Edit */}
            <button
              onClick={onEdit}
              className="p-1.5 text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded-lg"
            >
              <Pencil className="w-4 h-4" />
            </button>
            
            {/* Delete */}
            <button
              onClick={onDelete}
              className="p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-muted hover:text-[rgb(var(--text-secondary))] flex items-center gap-1"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {t('settings.aiTasks.runHistory')}
        </button>
      </div>

      {/* Runs history */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-default overflow-hidden"
          >
            <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
              {runsLoading ? (
                <div className="text-center py-4 text-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                </div>
              ) : runs.length === 0 ? (
                <p className="text-center py-4 text-muted text-sm">{t('settings.aiTasks.noRuns')}</p>
              ) : (
                runs.map((run: AITaskRun) => (
                  <div key={run.id} className="p-3 rounded bg-[rgb(var(--bg-hover))] text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted">
                        {format(new Date(run.createdAt), 'yyyy/MM/dd HH:mm', { locale: getLocale() === 'zh' ? zhCN : undefined })}
                      </span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        run.status === 'completed' ? "bg-green-500/20 text-green-500" :
                        run.status === 'failed' ? "bg-red-500/20 text-red-500" :
                        "bg-yellow-500/20 text-yellow-500"
                      )}>
                        {run.status === 'completed' ? t('settings.aiTasks.statusCompleted') : run.status === 'failed' ? t('settings.aiTasks.statusFailed') : t('settings.aiTasks.statusRunning')}
                      </span>
                    </div>
                    {run.result && (
                      <p className="text-secondary line-clamp-3">{run.result}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-xs text-muted">
                      <span>📄 {t('settings.aiTasks.articlesLabel', { count: run.entriesProcessed })}</span>
                      <span>🪙 {run.tokensUsed} tokens</span>
                      <span>⏱️ {(run.durationMs / 1000).toFixed(1)}s</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AITasksSettings() {
  const confirmDialog = useConfirm();
  const queryClient = useQueryClient();
  const [editingTask, setEditingTask] = useState<AITask | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['ai-tasks'],
    queryFn: api.getAITasks,
  });

  // Create task
  const createTask = useMutation({
    mutationFn: api.createAITask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tasks'] });
      setIsCreating(false);
      toast.success(t('settings.aiTasks.taskCreated'));
    },
    onError: () => toast.error(t('settings.sharedFeeds.createFailed')),
  });

  // Update task
  const updateTask = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<AITask>) => 
      api.updateAITask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tasks'] });
      setEditingTask(null);
      toast.success(t('settings.aiTasks.taskUpdated'));
    },
    onError: () => toast.error(t('settings.filterRules.updateFailed')),
  });

  // Delete task
  const deleteTask = useMutation({
    mutationFn: api.deleteAITask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tasks'] });
      toast.success(t('settings.aiTasks.taskDeleted'));
    },
    onError: () => toast.error(t('settings.telegram.removeFailed')),
  });

  // Run task
  const runTask = useMutation({
    mutationFn: api.runAITask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tasks'] });
      toast.success(t('settings.aiTasks.taskStarted'));
    },
    onError: () => toast.error(t('settings.aiTasks.runFailed')),
  });

  const handleSave = (data: Omit<AITask, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingTask) {
      updateTask.mutate({ id: editingTask.id, ...data });
    } else {
      createTask.mutate(data);
    }
  };

  const handleToggle = (task: AITask) => {
    updateTask.mutate({ id: task.id, enabled: !task.enabled });
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: t('settings.aiTasks.confirmDelete'), variant: 'danger', confirmText: t('common.delete') }); if (ok) {
      deleteTask.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-[rgb(var(--text-primary))]">{t('settings.aiTasks.title')}</h3>
          <p className="text-sm text-muted mt-0.5">
            {t('settings.aiTasks.desc')}
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          {t('settings.aiTasks.createTask')}
        </button>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted">{t('settings.common.loading')}</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t('settings.aiTasks.empty')}</p>
          <p className="text-sm mt-1">{t('settings.aiTasks.emptyDesc')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task: AITask) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={() => setEditingTask(task)}
              onDelete={() => handleDelete(task.id)}
              onToggle={() => handleToggle(task)}
              onRun={() => runTask.mutate(task.id)}
            />
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <AnimatePresence>
        {(isCreating || editingTask) && (
          <TaskEditor
            task={editingTask || undefined}
            onSave={handleSave}
            onCancel={() => {
              setIsCreating(false);
              setEditingTask(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
