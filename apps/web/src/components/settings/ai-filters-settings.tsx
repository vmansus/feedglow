'use client';

import { useState } from 'react';
import {
  useAIFilters,
  useCreateAIFilter,
  useUpdateAIFilter,
  useDeleteAIFilter,
  type AIFilter
} from '@/hooks/use-ai-filters';
import { Button } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Sparkles,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Ban,
  Check
} from 'lucide-react';

type FilterType = 'include' | 'exclude' | 'boost' | 'bury';

const FILTER_TYPES: { value: FilterType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'boost', label: t('settings.aiFilters.boost'), icon: <TrendingUp className="w-4 h-4" />, description: t('settings.aiFilters.boostDesc') },
  { value: 'bury', label: t('settings.aiFilters.bury'), icon: <TrendingDown className="w-4 h-4" />, description: t('settings.aiFilters.buryDesc') },
  { value: 'include', label: t('settings.aiFilters.include'), icon: <Check className="w-4 h-4" />, description: t('settings.aiFilters.includeDesc') },
  { value: 'exclude', label: t('settings.aiFilters.exclude'), icon: <Ban className="w-4 h-4" />, description: t('settings.aiFilters.excludeDesc') }
];

const SENTIMENT_OPTIONS = [
  { value: '', label: t('settings.aiFilters.sentimentAny') },
  { value: 'positive', label: t('settings.aiFilters.sentimentPositive') },
  { value: 'negative', label: t('settings.aiFilters.sentimentNegative') },
  { value: 'neutral', label: t('settings.aiFilters.sentimentNeutral') }
];

export function AIFiltersSettings() {
  const confirmDialog = useConfirm();
  const { data: filters = [], isLoading } = useAIFilters();
  const createFilter = useCreateAIFilter();
  const updateFilter = useUpdateAIFilter();
  const deleteFilter = useDeleteAIFilter();

  const [expandedFilter, setExpandedFilter] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFilter, setNewFilter] = useState<Partial<AIFilter>>({
    name: '',
    type: 'boost',
    criteria: {},
    score: 50,
    enabled: true
  });

  const handleCreateFilter = async () => {
    if (!newFilter.name) return;
    
    await createFilter.mutateAsync({
      name: newFilter.name,
      description: newFilter.description,
      type: newFilter.type as FilterType,
      criteria: newFilter.criteria || {},
      score: newFilter.score || 50,
      enabled: true
    });
    
    setNewFilter({
      name: '',
      type: 'boost',
      criteria: {},
      score: 50,
      enabled: true
    });
    setShowNewForm(false);
  };

  const handleToggleFilter = async (filter: AIFilter) => {
    await updateFilter.mutateAsync({
      id: filter.id,
      enabled: !filter.enabled
    });
  };

  const handleDeleteFilter = async (id: string) => {
    const ok = await confirmDialog({ message: t('settings.aiFilters.confirmDelete'), variant: 'danger', confirmText: t('common.delete') }); if (ok) {
      await deleteFilter.mutateAsync(id);
    }
  };

  const handleScoreChange = async (filter: AIFilter, score: number) => {
    await updateFilter.mutateAsync({
      id: filter.id,
      score
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold">{t('settings.aiFilters.title')}</h2>
        </div>
        <Button
          size="sm"
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('settings.notifications.addRule')}
        </Button>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        {t('settings.aiFilters.desc')}
      </p>

      {/* New Filter Form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border border-orange-300 dark:border-orange-800 rounded-lg overflow-hidden"
          >
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 space-y-4">
              <h3 className="font-medium">{t('settings.aiFilters.newRule')}</h3>
              
              {/* Rule Name */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('settings.notifications.ruleName')}</label>
                <input
                  type="text"
                  value={newFilter.name || ''}
                  onChange={(e) => setNewFilter({ ...newFilter, name: e.target.value })}
                  placeholder={t('settings.aiFilters.ruleNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('settings.sharedFeeds.descriptionOptional')}</label>
                <input
                  type="text"
                  value={newFilter.description || ''}
                  onChange={(e) => setNewFilter({ ...newFilter, description: e.target.value })}
                  placeholder={t('settings.aiFilters.descriptionPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              {/* Filter Type */}
              <div>
                <label className="block text-sm font-medium mb-2">{t('settings.aiFilters.ruleType')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {FILTER_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setNewFilter({ ...newFilter, type: type.value })}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-all ${
                        newFilter.type === type.value
                          ? 'border-orange-500 bg-white dark:bg-zinc-900'
                          : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                      }`}
                    >
                      <span className={newFilter.type === type.value ? 'text-orange-500' : 'text-zinc-400'}>
                        {type.icon}
                      </span>
                      <div>
                        <div className="font-medium text-sm">{type.label}</div>
                        <div className="text-xs text-zinc-500">{type.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Keywords */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('settings.notifications.keywordsComma')}</label>
                <input
                  type="text"
                  value={newFilter.criteria?.keywords?.join(', ') || ''}
                  onChange={(e) => setNewFilter({
                    ...newFilter,
                    criteria: {
                      ...newFilter.criteria,
                      keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    }
                  })}
                  placeholder={t('settings.aiFilters.keywords')}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              {/* Topics */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('settings.aiFilters.topics')}</label>
                <input
                  type="text"
                  value={newFilter.criteria?.topics?.join(', ') || ''}
                  onChange={(e) => setNewFilter({
                    ...newFilter,
                    criteria: {
                      ...newFilter.criteria,
                      topics: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    }
                  })}
                  placeholder={t('settings.aiFilters.topics')}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              {/* Sentiment */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('settings.aiFilters.sentiment')}</label>
                <select
                  value={newFilter.criteria?.sentiment || ''}
                  onChange={(e) => setNewFilter({
                    ...newFilter,
                    criteria: {
                      ...newFilter.criteria,
                      sentiment: e.target.value as 'positive' | 'negative' | 'neutral' | undefined
                    }
                  })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                >
                  {SENTIMENT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Score Slider */}
              {(newFilter.type === 'boost' || newFilter.type === 'bury') && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {t('settings.aiFilters.impactStrength', { score: newFilter.score ?? 0 })}
                  </label>
                  <input
                    type="range"
                    min={newFilter.type === 'bury' ? -100 : 0}
                    max={newFilter.type === 'bury' ? 0 : 100}
                    value={newFilter.score || 0}
                    onChange={(e) => setNewFilter({ ...newFilter, score: Number(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{newFilter.type === 'bury' ? t('settings.aiFilters.strongBury') : t('settings.aiFilters.slightBoost')}</span>
                    <span>{newFilter.type === 'bury' ? t('settings.aiFilters.slightBury') : t('settings.aiFilters.strongBoost')}</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  onClick={handleCreateFilter}
                  disabled={!newFilter.name || createFilter.isPending}
                >
                  {createFilter.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {t('settings.aiFilters.createRule')}
                </Button>
                <Button variant="outline" onClick={() => setShowNewForm(false)}>
                  {t('settings.common.cancel')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing Filters */}
      <div className="space-y-3">
        {filters.map(filter => {
          const isExpanded = expandedFilter === filter.id;
          const typeInfo = FILTER_TYPES.find(t => t.value === filter.type);
          
          return (
            <motion.div
              key={filter.id}
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
              layout
            >
              <div 
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                onClick={() => setExpandedFilter(isExpanded ? null : filter.id)}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleFilter(filter); }}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      filter.enabled ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span 
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        filter.enabled ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={filter.enabled ? 'text-orange-500' : 'text-zinc-400'}>
                        {typeInfo?.icon}
                      </span>
                      <span className="font-medium">{filter.name}</span>
                    </div>
                    <div className="text-sm text-zinc-500">
                      {filter.criteria.keywords?.length 
                        ? `${t('settings.aiFilters.keywordsLabel')} ${filter.criteria.keywords.slice(0, 3).join(', ')}${filter.criteria.keywords.length > 3 ? '...' : ''}`
                        : filter.description || typeInfo?.description
                      }
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${
                    filter.score > 0 ? 'text-green-600' : filter.score < 0 ? 'text-red-600' : 'text-zinc-500'
                  }`}>
                    {filter.score > 0 ? '+' : ''}{filter.score}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-zinc-400" />
                  )}
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <div className="p-4 space-y-4">
                      {/* Score Adjustment */}
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          {t('settings.aiFilters.impactStrength', { score: filter.score })}
                        </label>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          value={filter.score}
                          onChange={(e) => handleScoreChange(filter, Number(e.target.value))}
                          className="w-full"
                        />
                      </div>

                      {/* Criteria Summary */}
                      {filter.criteria.keywords?.length && (
                        <div className="text-sm">
                          <span className="font-medium">{t('settings.notifications.keywordsLabel')}</span>{' '}
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {filter.criteria.keywords.join(', ')}
                          </span>
                        </div>
                      )}
                      {filter.criteria.topics?.length && (
                        <div className="text-sm">
                          <span className="font-medium">{t('settings.aiFilters.topicsLabel')}</span>{' '}
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {filter.criteria.topics.join(', ')}
                          </span>
                        </div>
                      )}
                      {filter.criteria.sentiment && (
                        <div className="text-sm">
                          <span className="font-medium">{t('settings.aiFilters.sentimentLabel')}</span>{' '}
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {SENTIMENT_OPTIONS.find(s => s.value === filter.criteria.sentiment)?.label}
                          </span>
                        </div>
                      )}

                      <div className="text-sm text-zinc-500">
                        {t('settings.aiFilters.createdAt')} {new Date(filter.createdAt).toLocaleDateString()}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteFilter(filter.id)}
                        className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t('settings.notifications.deleteRule')}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {filters.length === 0 && !showNewForm && (
        <div className="text-center py-12 text-zinc-500">
          <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>{t('settings.filterRules.empty')}</p>
          <p className="text-sm mt-1">{t('settings.aiFilters.emptyDesc')}</p>
        </div>
      )}
    </div>
  );
}
