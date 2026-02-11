'use client';

import { useState } from 'react';
import { useExport, downloadBlob, type ExportFormat, type ExportType } from '@/hooks/use-exports';
import { useFeeds } from '@/hooks/use-feeds';
import { useCategories } from '@/hooks/use-categories';
import { Button } from '@feedglow/ui';
import { motion } from 'framer-motion';
import { t } from '@/lib/i18n';
import {
  Download,
  FileJson,
  FileText,
  Table,
  Loader2,
  Calendar,
  Filter,
  Check
} from 'lucide-react';

const EXPORT_TYPES: { value: ExportType; label: string; description: string }[] = [
  { value: 'articles', label: t('settings.export.allArticles'), description: t('settings.export.allArticlesDesc') },
  { value: 'starred', label: t('settings.export.starred'), description: t('settings.export.starredDesc') },
  { value: 'reading-history', label: t('settings.export.readingHistory'), description: t('settings.export.readingHistoryDesc') }
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: React.ReactNode }[] = [
  { value: 'json', label: 'JSON', icon: <FileJson className="w-5 h-5" /> },
  { value: 'markdown', label: 'Markdown', icon: <FileText className="w-5 h-5" /> },
  { value: 'csv', label: 'CSV', icon: <Table className="w-5 h-5" /> }
];

export function ExportSettings() {
  const { feeds = [] } = useFeeds();
  const { categories = [] } = useCategories();
  const exportMutation = useExport();

  const [exportType, setExportType] = useState<ExportType>('articles');
  const [format, setFormat] = useState<ExportFormat>('json');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedFeeds, setSelectedFeeds] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({
        type: exportType,
        format,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        feedIds: selectedFeeds.length > 0 ? selectedFeeds : undefined,
        categoryIds: selectedCategories.length > 0 ? selectedCategories : undefined
      });
      
      downloadBlob(result.blob, result.filename);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const toggleFeed = (feedId: number) => {
    setSelectedFeeds(prev => 
      prev.includes(feedId) 
        ? prev.filter(id => id !== feedId)
        : [...prev, feedId]
    );
  };

  const toggleCategory = (categoryId: number) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Download className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold">{t('settings.export.title')}</h2>
      </div>

      {/* Export Type Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">{t('settings.export.content')}</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {EXPORT_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => setExportType(type.value)}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                exportType === type.value
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="font-medium">{type.label}</div>
              <div className="text-sm text-zinc-500 mt-1">{type.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Format Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">{t('settings.export.format')}</label>
        <div className="flex gap-3">
          {FORMAT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFormat(opt.value)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${
                format === opt.value
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              {opt.icon}
              <span>{opt.label}</span>
              {format === opt.value && <Check className="w-4 h-4 text-orange-500 ml-1" />}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range */}
      <div>
        <label className="block text-sm font-medium mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {t('settings.export.dateRange')}
          </div>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-default surface-elevated text-[rgb(var(--text-primary))] [color-scheme:dark]"
          />
          <span className="text-muted">{t('settings.export.to')}</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-default surface-elevated text-[rgb(var(--text-primary))] [color-scheme:dark]"
          />
        </div>
      </div>

      {/* Advanced Filters */}
      <div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <Filter className="w-4 h-4" />
          {t('settings.export.advancedFilters')}
          <span className="text-xs">
            {(selectedFeeds.length > 0 || selectedCategories.length > 0) && 
              t('settings.export.selectedCount', { count: selectedFeeds.length + selectedCategories.length })
            }
          </span>
        </button>

        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 space-y-4"
          >
            {/* Feed Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('settings.export.filterByFeed')}</label>
              <div className="max-h-40 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg p-2">
                {feeds.map(feed => (
                  <label 
                    key={feed.id}
                    className="flex items-center gap-2 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFeeds.includes(feed.id)}
                      onChange={() => toggleFeed(feed.id)}
                      className="rounded border-zinc-300"
                    />
                    <span className="text-sm truncate">{feed.title}</span>
                  </label>
                ))}
                {feeds.length === 0 && (
                  <div className="text-sm text-zinc-500 p-2">{t('settings.export.noFeeds')}</div>
                )}
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('settings.export.filterByCategory')}</label>
              <div className="max-h-40 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg p-2">
                {categories.map(cat => (
                  <label 
                    key={cat.id}
                    className="flex items-center gap-2 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                      className="rounded border-zinc-300"
                    />
                    <span className="text-sm truncate">{cat.title}</span>
                  </label>
                ))}
                {categories.length === 0 && (
                  <div className="text-sm text-zinc-500 p-2">{t('settings.export.noCategories')}</div>
                )}
              </div>
            </div>

            {/* Clear Filters */}
            {(selectedFeeds.length > 0 || selectedCategories.length > 0) && (
              <button
                onClick={() => { setSelectedFeeds([]); setSelectedCategories([]); }}
                className="text-sm text-orange-600 hover:text-orange-700"
              >
                {t('settings.export.clearFilters')}
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* Export Button */}
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <Button
          onClick={handleExport}
          disabled={exportMutation.isPending}
          className="flex items-center gap-2"
          size="lg"
        >
          {exportMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Download className="w-5 h-5" />
          )}
          {t('settings.export.exportData')}
        </Button>

        {exportMutation.isSuccess && (
          <p className="text-sm text-green-600 dark:text-green-400 mt-2">
            ✓ {t('settings.export.success')}
          </p>
        )}

        {exportMutation.isError && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-2">
            ✗ {t('settings.export.failed')}
          </p>
        )}
      </div>
    </div>
  );
}
