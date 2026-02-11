'use client';

import { t } from '@/lib/i18n';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, MessageCircle, Image, Video, Newspaper } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { useUpdateFeed, useCategories } from '@/hooks';
import { getFeedIconUrl } from '@/hooks';
import type { Feed, FeedType } from '@feedglow/shared';
// Bell removed — notify_on_update moved to notification rules

const FEED_TYPES: { value: FeedType; label: string; icon: React.ReactNode }[] = [
  { value: 'article', label: t('feed.typeArticle'), icon: <FileText className="w-5 h-5" /> },
  { value: 'social', label: t('feed.typeSocial'), icon: <MessageCircle className="w-5 h-5" /> },
  { value: 'picture', label: t('feed.typePicture'), icon: <Image className="w-5 h-5" /> },
  { value: 'video', label: t('feed.typeVideo'), icon: <Video className="w-5 h-5" /> },
  { value: 'notification', label: t('feed.typeNotification'), icon: <Newspaper className="w-5 h-5" /> },
];

interface FeedEditDialogProps {
  feed: Feed;
  onClose: () => void;
}

export function FeedEditDialog({ feed, onClose }: FeedEditDialogProps) {
  const [title, setTitle] = useState(feed.title);
  const [categoryId, setCategoryId] = useState(feed.categoryId);
  const [feedType, setFeedType] = useState<FeedType>(feed.feed_type || 'article');
  const [pollingFrequency, setPollingFrequency] = useState(feed.polling_frequency || 60);
  // notify_on_update removed — use notification rules in settings instead

  const updateFeed = useUpdateFeed();
  const { categories } = useCategories();
  const iconUrl = getFeedIconUrl(feed.id) || feed.iconUrl;

  const handleSave = () => {
    const updates: Record<string, unknown> = {};
    if (title !== feed.title) updates.title = title;
    if (categoryId !== feed.categoryId) updates.categoryId = categoryId;
    if (feedType !== feed.feed_type) updates.feed_type = feedType;
    if (pollingFrequency !== (feed.polling_frequency || 60)) updates.polling_frequency = pollingFrequency;
    // notify_on_update removed — managed via notification rules

    if (Object.keys(updates).length > 0) {
      updateFeed.mutate({ id: feed.id, updates: updates as any });
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="surface-elevated rounded-xl border border-default max-w-md w-full mx-4 shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-default">
            <h3 className="text-base font-semibold">{t('feed.editTitle')}</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Feed Info */}
            <div className="flex items-start gap-3">
              {iconUrl ? (
                <img src={iconUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {feed.title.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{feed.title}</p>
                <p className="text-xs text-muted truncate">{feed.feedUrl}</p>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('feed.titleLabel')}</label>
              <p className="text-xs text-muted mb-2">{t('feed.titleHint')}</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={feed.title}
                className="w-full px-3 py-2 text-sm border border-default rounded-lg bg-[rgb(var(--bg-base))] text-[rgb(var(--text-primary))] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('feed.categoryLabel')}</label>
              <p className="text-xs text-muted mb-2">{t('feed.categoryHint')}</p>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-default rounded-lg bg-[rgb(var(--bg-base))] text-[rgb(var(--text-primary))] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all appearance-none"
              >
                <option value={0}>{t('feed.uncategorized')}</option>
                {(() => {
                  const allCats = categories || [];
                  const buildOptions = (parentId: number | null, depth: number): React.ReactNode[] => {
                    return allCats
                      .filter(c => (c.parent_id ?? null) === parentId)
                      .flatMap(cat => {
                        const indent = depth > 0 ? '　'.repeat(depth) + '└ ' : '';
                        return [
                          <option key={cat.id} value={cat.id}>{indent}{cat.title}</option>,
                          ...buildOptions(cat.id, depth + 1),
                        ];
                      });
                  };
                  return buildOptions(null, 0);
                })()}
              </select>
            </div>

            {/* Polling Frequency */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('feed.refreshRate')}</label>
              <p className="text-xs text-muted mb-2">{t('feed.refreshRateHint')}</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={240}
                  step={5}
                  value={pollingFrequency}
                  onChange={(e) => setPollingFrequency(Number(e.target.value))}
                  className="flex-1 accent-orange-500"
                />
                <span className="text-sm font-mono w-16 text-right">
                  {pollingFrequency >= 60 ? `${pollingFrequency / 60}h` : `${pollingFrequency}min`}
                </span>
              </div>
            </div>

            {/* View Type */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('feed.viewLabel')}</label>
              <div className="grid grid-cols-5 gap-1 p-1 bg-[rgb(var(--bg-hover))] rounded-lg">
                {FEED_TYPES.map(type => (
                  <button
                    key={type.value}
                    onClick={() => setFeedType(type.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2 px-1 rounded-md text-xs transition-all",
                      feedType === type.value
                        ? "bg-[rgb(var(--bg-elevated))] text-orange-500 shadow-sm"
                        : "text-muted hover:text-[rgb(var(--text-secondary))]"
                    )}
                  >
                    {type.icon}
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Notification hint */}
          </div>

          {/* Footer */}
          <div className="flex gap-2 justify-end px-5 py-4 border-t border-default">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-default rounded-lg hover:bg-[rgb(var(--bg-hover))] transition-colors"
            >
              {t('action.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={updateFeed.isPending}
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {updateFeed.isPending ? t('feed.updating') : t('feed.updateBtn')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
