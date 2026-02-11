'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Loader2, X, TrendingUp, Globe, ChevronDown, MessageCircle, Code, Newspaper, Smartphone, Coins, Gamepad2, Clapperboard, BookOpen, Palette, PenTool, Video, Image, GraduationCap, ShoppingCart, Landmark, FileText, CloudSun, Flame, RefreshCw, Package, type LucideIcon } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import { getConfig } from '@/lib/api';
import type { RSSHubRoute, RSSHubNamespace } from '@/lib/api';
import { FeedPreviewPanel } from '@/components/discover/feed-preview-panel';
import { t } from '@/lib/i18n';

// Category mapping for fallback
const CATEGORY_MAP: Record<string, { name: string; Icon: LucideIcon; color: string }> = {
  'social-media': { name: t('settings.polling.social'), Icon: MessageCircle, color: '#3B82F6' },
  'programming': { name: t('rsshub.programming'), Icon: Code, color: '#10B981' },
  'traditional-media': { name: t('rsshub.traditional'), Icon: Newspaper, color: '#6366F1' },
  'new-media': { name: t('rsshub.newMedia'), Icon: Smartphone, color: '#8B5CF6' },
  'finance': { name: t('rsshub.finance'), Icon: Coins, color: '#F59E0B' },
  'game': { name: t('rsshub.gaming'), Icon: Gamepad2, color: '#EF4444' },
  'anime': { name: t('rsshub.anime'), Icon: Clapperboard, color: '#EC4899' },
  'reading': { name: t('settings.general.reading'), Icon: BookOpen, color: '#14B8A6' },
  'design': { name: t('rsshub.design'), Icon: Palette, color: '#F97316' },
  'blog': { name: t('rsshub.blog'), Icon: PenTool, color: '#06B6D4' },
  'multimedia': { name: t('rsshub.multimedia'), Icon: Video, color: '#A855F7' },
  'picture': { name: t('settings.polling.picture'), Icon: Image, color: '#D946EF' },
  'university': { name: t('rsshub.university'), Icon: GraduationCap, color: '#0EA5E9' },
  'study': { name: t('rsshub.study'), Icon: BookOpen, color: '#22D3EE' },
  'shopping': { name: t('rsshub.shopping'), Icon: ShoppingCart, color: '#FB923C' },
  'government': { name: t('rsshub.government'), Icon: Landmark, color: '#64748B' },
  'journal': { name: t('rsshub.journal'), Icon: FileText, color: '#84CC16' },
  'forecast': { name: t('rsshub.forecast'), Icon: CloudSun, color: '#38BDF8' },
  'bbs': { name: t('rsshub.bbs'), Icon: MessageCircle, color: '#A3E635' },
  'popular': { name: t('rsshub.popular'), Icon: Flame, color: '#F43F5E' },
  'program-update': { name: t('rsshub.programUpdate'), Icon: RefreshCw, color: '#94A3B8' },
  'other': { name: t('rsshub.otherCategory'), Icon: Package, color: '#9CA3AF' },
};

const LANGUAGE_OPTIONS = [
  { value: 'all', label: t('discover.allLanguages') },
  { value: 'zh-CN', label: t('settings.general.langZhCN') },
  { value: 'en', label: 'English' },
  { value: 'ja', label: t('settings.general.langJa') },
];

const SORT_OPTIONS = [
  { value: 'popular', label: t('discover.sortByPopularity') },
  { value: 'name', label: t('discover.sortByName') },
];

// Parameter modal
function ParameterModal({
  route,
  onClose,
  onSubscribe,
}: {
  route: RSSHubRoute;
  onClose: () => void;
  onSubscribe: (url: string) => void;
}) {
  const [params, setParams] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    route.parameters?.forEach(p => {
      if (p.default) defaults[p.name] = p.default;
    });
    return defaults;
  });

  // Get configured RSSHub instance
  const { data: config } = useQuery({
    queryKey: ['app-config'],
    queryFn: getConfig,
    staleTime: Infinity,
  });
  
  const configuredInstance = config?.rsshubUrl?.replace(/^https?:\/\//, '') || 'rsshub.app';
  const [instance, setInstance] = useState('rsshub.app');
  
  // Update instance when config loads
  useEffect(() => {
    if (configuredInstance && instance === 'rsshub.app') {
      setInstance(configuredInstance);
    }
  }, [configuredInstance]);

  // Build instances list with configured instance first
  const INSTANCES = [
    configuredInstance,
    ...['rsshub.app', 'rsshub.rssforever.com', 'rsshub.moeyy.cn'].filter(i => i !== configuredInstance),
  ];

  const buildUrl = () => {
    let path = route.path;
    route.parameters?.forEach(p => {
      const value = params[p.name] || '';
      path = path.replace(`:${p.name}`, value);
    });
    path = path.replace(/\/:[^/]+\?/g, '');
    return `https://${instance}${path}`;
  };

  const handleSubscribe = () => {
    const missingRequired = route.parameters?.filter(
      p => p.required !== false && !params[p.name] && !p.name.endsWith('?')
    );
    if (missingRequired && missingRequired.length > 0) {
      toast.error(t('discover.fillRequired', { params: missingRequired.map(p => p.name).join(', ') }));
      return;
    }
    onSubscribe(buildUrl());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[rgb(var(--bg-elevated))] rounded-xl border border-default max-w-md w-full overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-default">
          <h2 className="text-lg font-semibold">{t('discover.subscribeTitle', { name: route.name })}</h2>
          <button onClick={onClose} className="p-2 hover:bg-[rgb(var(--bg-hover))] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {route.description && (
            <p className="text-sm text-muted">{route.description}</p>
          )}

          {route.parameters && route.parameters.length > 0 && (
            <div className="space-y-3">
              {route.parameters.map(param => (
                <div key={param.name}>
                  <label className="text-sm text-muted mb-1 block">
                    {param.name.replace('?', '')}
                    {param.required !== false && !param.name.endsWith('?') && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {param.description && (
                    <p className="text-xs text-muted mb-1">{param.description}</p>
                  )}
                  <input
                    type="text"
                    value={params[param.name] || ''}
                    onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                    placeholder={param.default || param.name}
                    className="w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="text-sm text-muted mb-1 block">{t('settings.feedAdvanced.rsshubInstance')}</label>
            <select
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
            >
              {INSTANCES.map(inst => (
                <option key={inst} value={inst}>{inst}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-muted mb-1 block">{t('discover.previewUrl')}</label>
            <code className="block p-2 rounded bg-[rgb(var(--bg-base))] text-xs text-orange-400 break-all">
              {buildUrl()}
            </code>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-default">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-default rounded-lg hover:bg-[rgb(var(--bg-hover))]">
            {t('settings.common.cancel')}
          </button>
          <button onClick={handleSubscribe} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t('discover.addSubscription')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Route item in namespace
function RouteItem({
  route,
  onSubscribe,
  onPreview,
  subscribing,
}: {
  route: RSSHubRoute;
  onSubscribe: (url: string) => void;
  onPreview?: (url: string, name?: string) => void;
  subscribing: boolean;
}) {
  const [showParams, setShowParams] = useState(false);
  const hasParams = route.parameters && route.parameters.length > 0;
  
  // Use feedUrl from API (already contains correct instance) or fallback to example/path
  const previewUrl = route.feedUrl || route.example || route.path;

  const handleSubscribeClick = () => {
    if (hasParams) {
      setShowParams(true);
    } else {
      onSubscribe(previewUrl);
    }
  };

  return (
    <>
      <div 
        onClick={() => onPreview?.(previewUrl, route.name)}
        className="flex items-start gap-3 p-3 rounded-lg bg-[rgb(var(--bg-base))] border border-default hover:border-orange-500/30 transition-all cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm">{route.name}</h4>
          <code className="text-xs text-muted block mt-1 truncate">{route.path}</code>
          {route.parameters && route.parameters.length > 0 && (
            <p className="text-xs text-muted mt-1">
              {t('discover.params', { params: route.parameters.map(p => p.name.replace('?', '')).join(', ') })}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {route.view !== undefined && route.view > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-orange-500/10 text-orange-400 rounded">
                <TrendingUp className="w-2.5 h-2.5" />
                {route.view}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSubscribeClick();
          }}
          disabled={subscribing}
          className="flex-shrink-0 px-3 py-1.5 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
        >
          {t('settings.categories.subscriptions')}
        </button>
      </div>

      <AnimatePresence>
        {showParams && (
          <ParameterModal
            route={route}
            onClose={() => setShowParams(false)}
            onSubscribe={onSubscribe}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// Namespace accordion
function NamespaceCard({
  namespace,
  onSubscribe,
  onPreview,
  subscribing,
}: {
  namespace: RSSHubNamespace;
  onSubscribe: (url: string) => void;
  onPreview?: (url: string, name?: string) => void;
  subscribing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="surface-elevated rounded-xl border border-default overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-4 hover:bg-[rgb(var(--bg-hover))] transition-colors"
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center flex-shrink-0">
          <img 
            src={`https://www.google.com/s2/favicons?domain=${namespace.url}&sz=32`}
            alt=""
            className="w-6 h-6"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        
        <div className="flex-1 text-left min-w-0">
          <h3 className="font-semibold truncate">{namespace.name}</h3>
          <p className="text-sm text-muted">{namespace.url}</p>
        </div>
        
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right text-sm">
            <p className="font-medium">{t('discover.routeCount', { count: namespace.routeCount })}</p>
            {namespace.totalViews !== undefined && namespace.totalViews > 0 && (
              <p className="text-muted text-xs">{t('discover.viewCount', { count: namespace.totalViews })}</p>
            )}
          </div>
          <ChevronDown className={cn(
            "w-5 h-5 text-muted transition-transform",
            expanded && "rotate-180"
          )} />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-default overflow-hidden"
          >
            <div className="p-4 space-y-2">
              {namespace.routes.map((route, i) => (
                <RouteItem
                  key={route.path + i}
                  route={route}
                  onSubscribe={onSubscribe}
                  onPreview={onPreview}
                  subscribing={subscribing}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function RSSHubCategoryPage() {
  const params = useParams();
  const categoryId = params.categoryId as string;
  const queryClient = useQueryClient();
  
  const [language, setLanguage] = useState('all');
  const [sort, setSort] = useState('popular');
  const [previewFeed, setPreviewFeed] = useState<{ url: string; name?: string } | null>(null);

  const categoryMeta = CATEGORY_MAP[categoryId] || { name: categoryId, Icon: Package, color: '#6B7280' };
  const CategoryIcon = categoryMeta.Icon;

  // Fetch category detail - temporarily using simple useQuery
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['rsshub', 'category', categoryId, language, sort],
    queryFn: () => api.getRSSHubCategoryDetail(categoryId, {
      lang: language !== 'all' ? language : undefined,
      sort,
      limit: 50,
      offset: 0,
    }),
    retry: false,
  });
  
  // Fake infinite query interface for compatibility
  const data = rawData ? { pages: [rawData] } : undefined;
  const hasNextPage = false;
  const isFetchingNextPage = false;
  const fetchNextPage = () => Promise.resolve();

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: (feedUrl: string) => api.subscribeFeed(feedUrl),
    onSuccess: () => {
      toast.success(t('discover.subscribeSuccess'));
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('discover.subscribeFailed'));
    },
  });

  const category = data?.pages?.[0]?.category;
  const allNamespaces = data?.pages?.flatMap(page => page?.namespaces || []) || [];

  return (
    <div className="h-full overflow-y-auto surface-base">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/discover"
            className="p-2 -ml-2 hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${categoryMeta.color}30, ${categoryMeta.color}50)` }}
          >
            <CategoryIcon className="w-6 h-6" style={{ color: categoryMeta.color }} />
          </div>
          <div>
            <h1 className="text-xl font-bold">{category?.name || categoryMeta.name}</h1>
            <p className="text-sm text-muted">{t('discover.subscriptionCount', { count: category?.count || allNamespaces.length })}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-4 py-2 rounded-lg bg-[rgb(var(--bg-elevated))] border border-default text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          >
            {LANGUAGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-4 py-2 rounded-lg bg-[rgb(var(--bg-elevated))] border border-default text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-2">{t('discover.loadFailed')}</p>
            <p className="text-sm text-muted">{t('discover.categoryNoData')}</p>
            <Link
              href="/discover"
              className="inline-flex items-center gap-1 text-orange-500 mt-4 hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('discover.backToDiscoverPage')}
            </Link>
          </div>
        ) : allNamespaces.length > 0 ? (
          <>
            <div className="space-y-4">
              {allNamespaces.map((ns, i) => (
                <motion.div
                  key={ns.id + i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <NamespaceCard
                    namespace={ns}
                    onSubscribe={(url) => subscribeMutation.mutate(url)}
                    onPreview={(url, name) => setPreviewFeed({ url, name })}
                    subscribing={subscribeMutation.isPending}
                  />
                </motion.div>
              ))}
            </div>

            {/* Load more */}
            {hasNextPage && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="px-6 py-2 rounded-lg bg-[rgb(var(--bg-elevated))] border border-default hover:bg-[rgb(var(--bg-hover))] transition-colors flex items-center gap-2"
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t('discover.loadMore')
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-muted">
            <Globe className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>{t('discover.categoryEmpty')}</p>
          </div>
        )}
      </div>

      {/* Feed Preview Panel */}
      <FeedPreviewPanel
        feedUrl={previewFeed?.url || null}
        feedName={previewFeed?.name}
        onClose={() => setPreviewFeed(null)}
        onSubscribe={(url) => subscribeMutation.mutate(url)}
        subscribing={subscribeMutation.isPending}
        subscribed={subscribeMutation.isSuccess}
      />
    </div>
  );
}
