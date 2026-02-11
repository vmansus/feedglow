'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Loader2, ExternalLink, X, ChevronLeft, ChevronRight, TrendingUp, MessageCircle, Code, Newspaper, Smartphone, Coins, Gamepad2, Clapperboard, BookOpen, Palette, PenTool, Video, Image, GraduationCap, ShoppingCart, Landmark, FileText, CloudSun, Flame, RefreshCw, Package, Rss, type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import Link from 'next/link';
import * as api from '@/lib/api';
import { getConfig } from '@/lib/api';
import type { RSSHubRoute, RSSHubCategory, RSSHubPopularRoute } from '@/lib/api';
import { t } from '@/lib/i18n';

// Category mapping (fallback if API not ready)
const CATEGORY_MAP: Record<string, { name: string; Icon: LucideIcon; color: string }> = {
  'social-media': { name: t('rsshub.social'), Icon: MessageCircle, color: '#3B82F6' },
  'programming': { name: t('rsshub.programming'), Icon: Code, color: '#10B981' },
  'traditional-media': { name: t('rsshub.traditional'), Icon: Newspaper, color: '#6366F1' },
  'new-media': { name: t('rsshub.newMedia'), Icon: Smartphone, color: '#8B5CF6' },
  'finance': { name: t('rsshub.finance'), Icon: Coins, color: '#F59E0B' },
  'game': { name: t('rsshub.gaming'), Icon: Gamepad2, color: '#EF4444' },
  'anime': { name: t('rsshub.anime'), Icon: Clapperboard, color: '#EC4899' },
  'reading': { name: t('rsshub.reading'), Icon: BookOpen, color: '#14B8A6' },
  'design': { name: t('rsshub.design'), Icon: Palette, color: '#F97316' },
  'blog': { name: t('rsshub.blog'), Icon: PenTool, color: '#06B6D4' },
  'multimedia': { name: t('rsshub.multimedia'), Icon: Video, color: '#A855F7' },
  'picture': { name: t('rsshub.picture'), Icon: Image, color: '#D946EF' },
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

// Parameter input modal
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

        <div className="p-6 space-y-4">
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
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-default rounded-lg hover:bg-[rgb(var(--bg-hover))]"
          >
            {t('action.cancel')}
          </button>
          <button
            onClick={handleSubscribe}
            className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('discover.addSubscription')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Route card with view count and features
function RouteCard({
  route,
  onSubscribe,
  onPreview,
  subscribing,
  showNamespace = false,
}: {
  route: RSSHubRoute | RSSHubPopularRoute;
  onSubscribe: (url: string) => void;
  onPreview?: (url: string, name?: string) => void;
  subscribing: boolean;
  showNamespace?: boolean;
}) {
  const [showParams, setShowParams] = useState(false);
  const hasParams = route.parameters && route.parameters.length > 0;
  const popularRoute = route as RSSHubPopularRoute;
  
  // Use feedUrl from API (already contains correct instance) or fallback to example/path
  const previewUrl = route.feedUrl || route.example || route.path;

  const handleSubscribeClick = () => {
    if (hasParams) {
      setShowParams(true);
    } else {
      onSubscribe(previewUrl);
    }
  };

  const handleCardClick = () => {
    if (onPreview) {
      onPreview(previewUrl, route.name);
    }
  };

  return (
    <>
      <div 
        onClick={handleCardClick}
        className="surface-elevated rounded-xl border border-default p-4 transition-all hover:border-orange-500/30 hover:shadow-lg hover:shadow-orange-500/5 cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {showNamespace && popularRoute.namespaceName && (
              <p className="text-xs text-muted mb-1">{popularRoute.namespaceName}</p>
            )}
            <h3 className="font-medium text-[rgb(var(--text-primary))]">
              {route.name}
            </h3>
            {route.description && (
              <p className="text-sm text-muted line-clamp-2 mt-1">
                {route.description}
              </p>
            )}
            <code className="text-xs text-orange-400/70 mt-2 block truncate">
              {route.path}
            </code>
            
            {/* Features & view count */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {route.view !== undefined && route.view > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-orange-500/10 text-orange-400 rounded">
                  <TrendingUp className="w-3 h-3" />
                  {route.view}
                </span>
              )}
              {route.features?.map(feature => (
                <span 
                  key={feature}
                  className="px-2 py-0.5 text-xs bg-[rgb(var(--bg-hover))] text-muted rounded"
                >
                  {feature.replace('support', '')}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSubscribeClick();
            }}
            disabled={subscribing}
            className="flex-shrink-0 p-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
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

// Category card (Folo style)
function CategoryCard({ category }: { category: RSSHubCategory }) {
  // Try to use lucide icon from CATEGORY_MAP, fallback to Rss
  const catMeta = CATEGORY_MAP[category.id];
  const CategoryIcon = catMeta?.Icon || Rss;
  
  return (
    <Link href={`/discover/rsshub/${category.id}`}>
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="rounded-xl p-5 cursor-pointer transition-all relative overflow-hidden"
        style={{ 
          background: `linear-gradient(135deg, ${category.color}15, ${category.color}30)`,
          borderColor: `${category.color}30`,
        }}
      >
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(circle at top right, ${category.color}40, transparent 70%)`,
          }}
        />
        <div className="relative">
          <CategoryIcon className="w-8 h-8" style={{ color: category.color }} />
          <h3 className="font-bold mt-2 text-[rgb(var(--text-primary))]">{category.name}</h3>
          <p className="text-sm opacity-60 mt-0.5">{t('discover.subscriptionCount', { count: category.count })}</p>
        </div>
      </motion.div>
    </Link>
  );
}

// Popular routes horizontal scroll
function PopularRoutesScroll({
  routes,
  onSubscribe,
  onPreview,
  subscribing,
}: {
  routes: RSSHubPopularRoute[];
  onSubscribe: (url: string) => void;
  onPreview?: (url: string, name?: string) => void;
  subscribing: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    }
  };

  if (routes.length === 0) return null;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-orange-500" />
          <h2 className="font-semibold">{t('discover.popularRoutes')}</h2>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => scroll('left')}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--bg-hover))] text-muted"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--bg-hover))] text-muted"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {routes.map((route, i) => (
          <motion.div
            key={route.path + i}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex-shrink-0 w-72"
          >
            <RouteCard
              route={route}
              onSubscribe={onSubscribe}
              onPreview={onPreview}
              subscribing={subscribing}
              showNamespace
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

interface RSSHubDiscoverProps {
  onPreview?: (url: string, name?: string) => void;
}

export function RSSHubDiscover({ onPreview }: RSSHubDiscoverProps = {}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [language, setLanguage] = useState('all');
  const queryClient = useQueryClient();

  // Fetch categories
  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ['rsshub', 'categories'],
    queryFn: api.getRSSHubCategories,
    retry: false,
    // Fallback to hardcoded categories if API not ready
    placeholderData: {
      categories: Object.entries(CATEGORY_MAP).map(([id, data]) => ({
        id,
        name: data.name,
        nameEn: id,
        count: Math.floor(Math.random() * 200) + 20,
        color: data.color,
      })),
    },
  });

  // Fetch popular routes
  const { data: popularData, isLoading: loadingPopular } = useQuery({
    queryKey: ['rsshub', 'popular', language],
    queryFn: () => api.getPopularRSSHubRoutes({ 
      lang: language !== 'all' ? language : undefined,
      limit: 20,
    }),
    retry: false,
  });

  // Search
  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['rsshub', 'search', searchQuery, language],
    queryFn: () => api.searchRSSHubRoutes(searchQuery, {
      lang: language !== 'all' ? language : undefined,
    }),
    enabled: searchQuery.length > 1,
    retry: false,
  });

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

  const categories = categoriesData?.categories || [];
  const popularRoutes = popularData?.routes || [];
  const searchRoutes = searchResults?.routes || [];

  return (
    <div className="space-y-8">
      {/* Search + Language filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('discover.searchRsshub')}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-[rgb(var(--bg-elevated))] border border-default text-[rgb(var(--text-primary))] placeholder-muted focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
          {searching && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted animate-spin" />
          )}
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="px-4 py-3 rounded-xl bg-[rgb(var(--bg-elevated))] border border-default text-[rgb(var(--text-primary))] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
        >
          {LANGUAGE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Search results */}
      {searchQuery.length > 1 ? (
        <div>
          <h2 className="font-semibold mb-4">{t('discover.searchResults')}</h2>
          {searching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            </div>
          ) : searchRoutes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {searchRoutes.map((route, i) => (
                <motion.div
                  key={route.path + i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <RouteCard
                    route={route}
                    onSubscribe={(url) => subscribeMutation.mutate(url)}
                    onPreview={onPreview}
                    subscribing={subscribeMutation.isPending}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>{t('discover.noRouteFound')}</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Popular routes horizontal scroll */}
          {!loadingPopular && popularRoutes.length > 0 && (
            <PopularRoutesScroll
              routes={popularRoutes}
              onSubscribe={(url) => subscribeMutation.mutate(url)}
              onPreview={onPreview}
              subscribing={subscribeMutation.isPending}
            />
          )}

          {/* Category grid */}
          <div>
            <h2 className="font-semibold mb-4">{t('discover.browseCategories')}</h2>
            {loadingCategories ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="h-28 rounded-xl bg-[rgb(var(--bg-hover))] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {categories.map((cat, i) => (
                  <motion.div
                    key={cat.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <CategoryCard category={cat} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* RSSHub info */}
      <div className="p-4 rounded-xl bg-[rgb(var(--bg-elevated))] border border-default">
        <div className="flex items-start gap-3">
          <Rss className="w-6 h-6 text-orange-500 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-[rgb(var(--text-primary))]">{t('discover.aboutRsshub')}</p>
            <p className="text-muted mt-1">
              {t('discover.rsshubDesc')}
            </p>
            <a 
              href="https://docs.rsshub.app" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-orange-500 hover:underline mt-2"
            >
              {t('discover.viewDocs')} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
