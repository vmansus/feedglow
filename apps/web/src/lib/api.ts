/**
 * FeedGlow API Client
 */

import type {
  Feed,
  Entry,
  Category,
  EntriesResponse,
  SummaryResult,
} from '@feedglow/shared';
import { getAuthHeader, refreshToken, clearStoredAuth } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

// Prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const result = await refreshToken();
      return !!result;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// Convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Transform object keys from snake_case to camelCase
function transformKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map(item => transformKeys(item)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = snakeToCamel(key);
      result[camelKey] = transformKeys(value);
      // Keep original key as well for compatibility
      if (camelKey !== key) {
        result[key] = value;
      }
    }
    return result as T;
  }
  return obj as T;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    // Handle 401 - try refresh token before giving up
    if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        // Retry the original request with new token
        const retryRes = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
            ...options?.headers,
          },
        });
        if (retryRes.ok) {
          const data = await retryRes.json();
          return transformKeys<T>(data);
        }
      }
      // Refresh failed — force logout
      clearStoredAuth();
      window.location.href = '/login?expired=1';
      return new Promise(() => {});
    }
    
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return transformKeys<T>(data);
}

// ============ Feeds ============

export async function getFeeds(): Promise<Feed[]> {
  return request<Feed[]>('/api/feeds');
}

export async function getFeed(id: number): Promise<Feed> {
  return request<Feed>(`/api/feeds/${id}`);
}

export async function createFeed(url: string, categoryId?: number): Promise<Feed> {
  return request<Feed>('/api/feeds', {
    method: 'POST',
    body: JSON.stringify({ url, categoryId }),
  });
}

export async function deleteFeed(id: number): Promise<void> {
  await request(`/api/feeds/${id}`, { method: 'DELETE' });
}

export async function refreshFeed(id: number): Promise<void> {
  await request(`/api/feeds/${id}/refresh`, { method: 'POST' });
}

export async function refreshAllFeeds(): Promise<void> {
  await request('/api/feeds/refresh', { method: 'POST' });
}

export async function reorderFeed(feedId: number, categoryId?: number, position?: number): Promise<void> {
  await request('/api/feeds/reorder', { method: 'POST', body: JSON.stringify({ feedId, categoryId, position }) });
}

export async function reorderFeedsBatch(items: { feedId: number; categoryId?: number; position: number }[]): Promise<void> {
  await request('/api/feeds/reorder/batch', { method: 'POST', body: JSON.stringify({ items }) });
}

export interface FeedIconResponse {
  feedId: number;
  iconId: number;
  mimeType: string;
  dataUrl: string;
}

export async function getFeedIcon(feedId: number): Promise<FeedIconResponse | null> {
  try {
    return await request<FeedIconResponse>(`/api/feeds/${feedId}/icon`);
  } catch {
    return null;
  }
}

// Feed Analytics
export interface FeedStatsItem {
  feedId: number;
  title: string;
  siteUrl: string;
  totalEntries: number;
  unreadEntries: number;
  readRate: number;
  starredCount: number;
  avgReadingTime: number;
  lastPublishedAt: string | null;
  updatesPerWeek: number;
  parsing_error_count: number;
}

export interface FeedAnalyticsResponse {
  totalFeeds: number;
  totalEntries: number;
  mostActive: FeedStatsItem[];
  leastActive: FeedStatsItem[];
  mostRead: FeedStatsItem[];
  neverRead: FeedStatsItem[];
  unhealthy: FeedStatsItem[];
}

export async function getFeedAnalytics(): Promise<FeedAnalyticsResponse> {
  return request<FeedAnalyticsResponse>('/api/feeds/analytics');
}

// ============ Digest ============

export interface DigestEntry {
  id: number;
  title: string;
  feedTitle: string;
  summary?: string;
  url: string;
  publishedAt: string;
}

export interface DailyDigest {
  date: string;
  summary: string;
  highlights: DigestEntry[];
  stats: {
    totalArticles: number;
    readArticles: number;
    topCategories: { name: string; count: number }[];
  };
  generatedAt: string;
}

export async function getDigestToday(): Promise<DailyDigest | null> {
  try {
    return await request<DailyDigest>('/api/digest/today');
  } catch {
    return null;
  }
}

export async function getDigestByDate(date: string): Promise<DailyDigest | null> {
  try {
    return await request<DailyDigest>(`/api/digest/${date}`);
  } catch {
    return null;
  }
}

export async function generateDigest(): Promise<DailyDigest> {
  return request<DailyDigest>('/api/digest/generate', { method: 'POST' });
}

// ============ Backfill ============

export interface BackfillResult {
  feedId: number;
  siteUrl: string;
  discovered: number;
  fetched: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export async function backfillFeed(feedId: number, maxArticles?: number): Promise<BackfillResult> {
  return request(`/api/backfill/${feedId}`, {
    method: 'POST',
    body: JSON.stringify({ maxArticles: maxArticles || 50 }),
  });
}

export async function previewBackfill(feedId: number): Promise<{
  feedId: number;
  siteUrl: string;
  discovered: number;
  urls: { url: string; lastmod?: string }[];
}> {
  return request(`/api/backfill/${feedId}/preview`);
}

// ============ Entries ============

export type FeedType = 'article' | 'social' | 'notification' | 'picture' | 'video' | 'newsletter' | 'podcast';

export interface FeedTypeCounts {
  article: number;
  social: number;
  notification: number;
  picture: number;
  video: number;
  newsletter: number;
  podcast: number;
}

export interface GetEntriesParams {
  status?: 'unread' | 'read' | 'all';
  feedId?: number;
  categoryId?: number;
  feedType?: FeedType;
  starred?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getFeedTypeCounts(): Promise<FeedTypeCounts> {
  return request<FeedTypeCounts>('/api/feeds/type-counts');
}

export async function getPollingDefaults(): Promise<Record<string, number>> {
  return request<Record<string, number>>('/api/settings/polling');
}

export async function updatePollingDefaults(defaults: Record<string, number>): Promise<void> {
  await request('/api/settings/polling', {
    method: 'PUT',
    body: JSON.stringify(defaults),
  });
}

export async function getEntries(params?: GetEntriesParams): Promise<EntriesResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
  }
  const query = searchParams.toString();
  return request<EntriesResponse>(`/api/entries${query ? `?${query}` : ''}`);
}

export async function getEntry(id: number): Promise<Entry> {
  return request<Entry>(`/api/entries/${id}`);
}

export async function markAsRead(id: number): Promise<void> {
  await request(`/api/entries/${id}/read`, { method: 'POST' });
}

export async function markAsUnread(id: number): Promise<void> {
  await request(`/api/entries/${id}/unread`, { method: 'POST' });
}

export async function toggleBookmark(id: number): Promise<void> {
  await request(`/api/entries/${id}/bookmark`, { method: 'POST' });
}

export async function updateEntriesStatus(
  entryIds: number[],
  status: 'read' | 'unread'
): Promise<void> {
  await request('/api/entries/status', {
    method: 'PUT',
    body: JSON.stringify({ entryIds, status }),
  });
}

// ============ Batch Mark Read ============

export async function markFeedAsRead(feedId: number, before?: string): Promise<void> {
  await request(`/api/feeds/${feedId}/mark-read`, {
    method: 'POST',
    body: JSON.stringify({ before }),
  });
}

export async function markCategoryAsRead(categoryId: number, before?: string): Promise<void> {
  await request(`/api/categories/${categoryId}/mark-read`, {
    method: 'POST',
    body: JSON.stringify({ before }),
  });
}

export async function markAllAsRead(): Promise<void> {
  await request('/api/entries/mark-all-read', { method: 'POST' });
}

export async function batchMarkRead(entryIds: (number | string)[]): Promise<void> {
  await request('/api/entries/mark-read', {
    method: 'POST',
    body: JSON.stringify({ entryIds }),
  });
}

// ============ Search ============

export interface SearchParams {
  q: string;
  feedId?: number;
  categoryId?: number;
  status?: 'read' | 'unread';
  starred?: boolean;
  before?: string;
  after?: string;
  limit?: number;
  offset?: number;
}

export async function searchEntries(params: SearchParams): Promise<EntriesResponse> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  });
  return request<EntriesResponse>(`/api/entries/search?${searchParams.toString()}`);
}

export async function searchMyFeeds(q: string): Promise<Feed[]> {
  return request<Feed[]>(`/api/feeds/search?q=${encodeURIComponent(q)}`);
}

// ============ Tags ============

export interface Tag {
  id: string;
  name: string;
  color?: string;
  entryCount?: number;
  isAI?: boolean;
}

export async function getTags(): Promise<Tag[]> {
  return request<Tag[]>('/api/tags');
}

export async function createTag(name: string, color?: string): Promise<Tag> {
  return request<Tag>('/api/tags', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  });
}

export async function updateTag(id: string, data: { name?: string; color?: string }): Promise<Tag> {
  return request<Tag>(`/api/tags/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTag(id: string): Promise<void> {
  await request(`/api/tags/${id}`, { method: 'DELETE' });
}

export async function getEntriesByTag(tagName: string): Promise<EntriesResponse> {
  return request<EntriesResponse>(`/api/tags/entries/${encodeURIComponent(tagName)}`);
}

export async function addTagToEntry(entryId: number, tagName: string): Promise<void> {
  await request(`/api/entries/${entryId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tagName }),
  });
}

export async function removeTagFromEntry(entryId: number, tagId: string): Promise<void> {
  await request(`/api/entries/${entryId}/tags/${tagId}`, { method: 'DELETE' });
}

// ============ Share ============

export interface ShareResult {
  code: string;
  url: string;
}

interface ShareApiResponse {
  shareCode: string;
  shareUrl: string;
  alreadyShared?: boolean;
}

export async function shareEntry(entryId: number): Promise<ShareResult> {
  const result = await request<ShareApiResponse>(`/api/shared/${entryId}`, { method: 'POST' });
  // Convert to absolute URL (page is at /shared/:code, API returns /shared/view/:code)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    code: result.shareCode,
    url: `${baseUrl}/shared/${result.shareCode}`,
  };
}

export async function unshareEntry(entryId: number): Promise<void> {
  await request(`/api/shared/${entryId}`, { method: 'DELETE' });
}

export async function getSharedEntry(code: string): Promise<Entry> {
  return request<Entry>(`/api/shared/view/${code}`);
}

// ============ AI Features ============

export async function summarizeEntry(id: number): Promise<SummaryResult> {
  return request<SummaryResult>(`/api/entries/${id}/summarize`, {
    method: 'POST',
  });
}

// Batch translate paragraphs (simple API)
export async function translateParagraphs(
  paragraphs: string[],
  language: string = 'zh-CN'
): Promise<string[]> {
  const result = await request<{ translations: string[] }>('/api/entries/translate', {
    method: 'POST',
    body: JSON.stringify({ paragraphs, language }),
  });
  return result.translations;
}

export async function generateTags(id: number): Promise<string[]> {
  const result = await request<{ tags: string[] }>(`/api/entries/${id}/tags`, {
    method: 'POST',
  });
  return result.tags;
}

// ============ Categories ============

export async function getCategories(): Promise<Category[]> {
  return request<Category[]>('/api/categories');
}

export async function createCategory(title: string, parentId?: number): Promise<Category> {
  return request<Category>('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ title, parentId }),
  });
}

export async function deleteCategory(id: number): Promise<void> {
  await request(`/api/categories/${id}`, { method: 'DELETE' });
}

export async function updateCategory(id: number, title: string): Promise<Category> {
  return request<Category>(`/api/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export async function updateFeed(id: number, updates: { categoryId?: number; title?: string; feed_type?: string; hide_globally?: boolean; notify_on_update?: boolean; polling_frequency?: number }): Promise<Feed> {
  return request<Feed>(`/api/feeds/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export interface FeedSettingsUpdate {
  crawler?: boolean;
  username?: string;
  password?: string;
  user_agent?: string;
  blocklist_rules?: string;
  keeplist_rules?: string;
  scraper_rules?: string;
  rewrite_rules?: string;
}

export async function updateFeedSettings(id: number, settings: FeedSettingsUpdate): Promise<Feed> {
  return request<Feed>(`/api/feeds/${id}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

// ============ AI Settings ============

export type AIProvider = 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'custom';

export interface AISettingsResponse {
  provider: AIProvider;
  apiKeyMasked?: string;
  hasApiKey: boolean;
  baseUrl?: string;
  model?: string;
  enableSummary: boolean;
  enableTranslation: boolean;
  updatedAt: string;
  availableProviders: {
    id: AIProvider;
    name: string;
    needsApiKey: boolean;
    needsBaseUrl: boolean;
  }[];
  defaultModels: Record<AIProvider, string>;
  defaultBaseUrls: Record<AIProvider, string>;
}

export interface AISettingsUpdate {
  provider?: AIProvider;
  apiKey?: string;
  clearApiKey?: boolean;
  baseUrl?: string;
  model?: string;
  enableSummary?: boolean;
  enableTranslation?: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export async function getAISettings(): Promise<AISettingsResponse> {
  return request<AISettingsResponse>('/api/settings/ai');
}

export async function updateAISettings(settings: AISettingsUpdate): Promise<{ success: boolean; settings: AISettingsResponse }> {
  return request('/api/settings/ai', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function testAIConnection(params: {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<TestConnectionResult> {
  return request('/api/settings/ai/test', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ============ Platform Credentials ============

export interface PlatformCredentialsResponse {
  twitter?: {
    hasAuthToken: boolean;
    authTokenMasked?: string;
    hasUsername: boolean;
    usernameMasked?: string;
    hasPassword: boolean;
    hasAuthSecret: boolean;
    hasPhoneOrEmail: boolean;
    phoneOrEmailMasked?: string;
    hasProxy: boolean;
    proxyMasked?: string;
  };
}

export interface PlatformCredentialsInput {
  twitter?: {
    authToken?: string;
    username?: string;
    password?: string;
    authSecret?: string;
    phoneOrEmail?: string;
    proxy?: string;
  };
}

export async function getPlatformCredentials(): Promise<PlatformCredentialsResponse> {
  return request<PlatformCredentialsResponse>('/api/settings/platform');
}

export async function updatePlatformCredentials(data: PlatformCredentialsInput): Promise<{
  success: boolean;
  credentials: PlatformCredentialsResponse;
  rsshub: { success: boolean; message: string };
  test?: { success: boolean; message: string } | null;
}> {
  return request('/api/settings/platform', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function testPlatformConnection(platform: string): Promise<{ success: boolean; message: string }> {
  return request('/api/settings/platform/test', {
    method: 'POST',
    body: JSON.stringify({ platform }),
  });
}

// ============ Twitter Token Auto-Refresh ============

export interface TwitterTokenHealth {
  healthy: boolean;
  stale: boolean;
  message: string;
  latestTweetAge?: number;
}

export interface TwitterRefreshResult {
  success: boolean;
  message: string;
  newToken?: string;
}

export interface TwitterRefreshLogEntry {
  success: boolean;
  message: string;
  createdAt: string;
}

export async function getTwitterTokenHealth(): Promise<TwitterTokenHealth> {
  return request<TwitterTokenHealth>('/api/settings/platform/twitter/health');
}

export async function triggerTwitterTokenRefresh(): Promise<TwitterRefreshResult> {
  return request<TwitterRefreshResult>('/api/settings/platform/twitter/refresh', {
    method: 'POST',
  });
}

export async function getTwitterRefreshHistory(): Promise<{ history: TwitterRefreshLogEntry[] }> {
  return request<{ history: TwitterRefreshLogEntry[] }>('/api/settings/platform/twitter/refresh-history');
}

export async function verifyTOTPSecret(secret: string): Promise<{ success: boolean; message: string; code?: string }> {
  return request('/api/settings/platform/twitter/verify-totp', {
    method: 'POST',
    body: JSON.stringify({ secret }),
  });
}

// ============ Full-text Content ============

export interface ExtractedContent {
  entryId: number;
  originalUrl: string;
  title: string;
  content: string;
  excerpt: string;
  byline?: string;
  siteName?: string;
  length: number;
  cached: boolean;
}

export async function fetchFullContent(id: number): Promise<ExtractedContent> {
  return request<ExtractedContent>(`/api/entries/${id}/content`);
}

// ============ OPML ============

export async function exportOpml(): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/opml/export`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.blob();
}

export async function importOpml(file: File): Promise<{ success: boolean; message: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/opml/import`, {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
    },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ============ Health ============

export async function healthCheck(): Promise<{ status: string; miniflux: string }> {
  return request('/health');
}

// ============ P0: Ranked Entries (For You) ============

export interface RankedEntriesResponse {
  entries: import('@feedglow/shared').Entry[];
  total: number;
  algorithm: string;
}

export async function getRankedEntries(): Promise<RankedEntriesResponse> {
  return request<RankedEntriesResponse>('/api/entries/ranked');
}

// ============ P0: Read Events (Personalization) ============

export interface ReadEvent {
  entryId: number;
  feedId?: number;
  duration: number; // seconds
  completed?: boolean;
  scrollDepth?: number; // 0-100
}

export async function recordReadEvent(event: ReadEvent): Promise<{ success: boolean }> {
  return request('/api/events/read', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export interface ActionEvent {
  entryId: number;
  action: 'bookmark' | 'share' | 'like' | 'dislike';
}

export async function recordActionEvent(event: ActionEvent): Promise<{ success: boolean }> {
  return request('/api/events/action', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

// ============ P0: Chat (AI Q&A) ============

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: string;
  relatedEntries?: { id: number; title: string; relevance: number }[];
}

// Note: For streaming, use EventSource directly in the component
export async function chatWithEntry(entryId: number, message: string, history?: ChatMessage[]): Promise<ChatResponse> {
  return request(`/api/entries/${entryId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  });
}

// ============ P1: Discover ============

export interface DiscoverFeed {
  id: string;
  title: string;
  description?: string;
  url: string;
  siteUrl?: string;
  iconUrl?: string;
  category?: string;
  subscribers?: number;
  isSubscribed?: boolean;
}

export interface DiscoverResponse {
  feeds: DiscoverFeed[];
  total: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  iconEmoji: string;
  feeds: DiscoverFeed[];
}

export interface CollectionsResponse {
  collections: Collection[];
}

export async function getRecommendedFeeds(): Promise<DiscoverResponse> {
  const data = await request<{ recommendations: DiscoverFeed[]; basedOn: number }>('/api/discover/recommended');
  return {
    feeds: Array.isArray(data?.recommendations) ? data.recommendations : [],
    total: data?.recommendations?.length || 0,
  };
}

export async function getTrendingFeeds(): Promise<DiscoverResponse> {
  const data = await request<{ trending: DiscoverFeed[] }>('/api/discover/trending');
  return {
    feeds: Array.isArray(data?.trending) ? data.trending : [],
    total: data?.trending?.length || 0,
  };
}

export async function getFeedCollections(): Promise<CollectionsResponse> {
  return request<CollectionsResponse>('/api/discover/collections');
}

export async function searchFeeds(query: string): Promise<DiscoverResponse> {
  return request<DiscoverResponse>(`/api/discover/search?q=${encodeURIComponent(query)}`);
}

export async function subscribeFeed(url: string): Promise<{ success: boolean; feed?: Feed }> {
  return request('/api/feeds', {
    method: 'POST',
    body: JSON.stringify({ feedUrl: url }),
  });
}

// ============ Retention Policy ============

export interface RetentionPolicy {
  feedId: number;
  keepDays: number;
  keepUnread: boolean;
  keepStarred: boolean;
  maxEntries: number;
}

export async function getRetentionPolicies(): Promise<RetentionPolicy[]> {
  return request<RetentionPolicy[]>('/api/retention');
}

export async function updateRetentionPolicy(policy: RetentionPolicy): Promise<RetentionPolicy> {
  return request<RetentionPolicy>('/api/retention', {
    method: 'PUT',
    body: JSON.stringify(policy),
  });
}

export async function updateFeedRetentionPolicy(feedId: number, policy: RetentionPolicy): Promise<RetentionPolicy> {
  return request<RetentionPolicy>(`/api/retention/${feedId}`, {
    method: 'PUT',
    body: JSON.stringify(policy),
  });
}

// ============ Podcast Progress ============

export interface PodcastProgress {
  entryId: number;
  position: number;
  duration: number;
  updatedAt: string;
}

export async function getPodcastProgress(entryId: number | string): Promise<PodcastProgress | null> {
  try {
    return await request<PodcastProgress>(`/api/podcast/progress/${entryId}`);
  } catch {
    return null;
  }
}

export async function savePodcastProgress(entryId: number | string, position: number, duration: number): Promise<void> {
  return request<void>(`/api/podcast/progress/${entryId}`, {
    method: 'POST',
    body: JSON.stringify({ position, duration }),
  });
}

export async function getPodcastFeeds(): Promise<Feed[]> {
  return request<Feed[]>('/api/podcast/feeds');
}

// ============ Podcast Transcripts ============

export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

export interface TranscriptData {
  segments: TranscriptSegment[];
  source: 'webpage' | 'srt' | 'vtt' | 'json';
  url: string;
}

export async function getTranscript(entryId: number | string): Promise<TranscriptData | null> {
  try {
    const data = await request<TranscriptData>(`/api/podcast/transcript/${entryId}`);
    if (!data || !data.segments || data.segments.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

// ============ RSSHub Discovery ============

export interface RSSHubRoute {
  name: string;
  path: string;
  description?: string;
  example?: string;
  parameters?: {
    name: string;
    description?: string;
    required?: boolean;
    default?: string;
  }[];
  maintainer?: string[];
  category?: string;
  view?: number;
  features?: string[];
  feedUrl?: string;
  siteUrl?: string;
  iconUrl?: string;
}

export interface RSSHubCategory {
  id: string;
  name: string;
  nameEn: string;
  emoji?: string;  // Optional - we use lucide icons instead
  count: number;
  color: string;
}

export interface RSSHubNamespace {
  id: string;
  name: string;
  url: string;
  lang?: string;
  routeCount: number;
  totalViews?: number;
  routes: RSSHubRoute[];
}

export interface RSSHubRoutesResponse {
  routes: RSSHubRoute[];
  total?: number;
}

export interface RSSHubCategoriesResponse {
  categories: RSSHubCategory[];
}

export interface RSSHubCategoryDetailResponse {
  category: RSSHubCategory;
  namespaces: RSSHubNamespace[];
  total: number;
  hasMore: boolean;
}

export interface RSSHubPopularRoute extends RSSHubRoute {
  namespace: string;
  namespaceName: string;
  url: string;
  lang?: string;
}

export interface RSSHubPopularResponse {
  routes: RSSHubPopularRoute[];
}

// Get all categories with counts
export async function getRSSHubCategories(): Promise<RSSHubCategoriesResponse> {
  const data = await request<RSSHubCategory[] | RSSHubCategoriesResponse>('/api/discover/rsshub/categories');
  // API returns array directly, normalize to { categories: [...] }
  if (Array.isArray(data)) {
    return { categories: data };
  }
  return data as RSSHubCategoriesResponse;
}

// Get category detail with namespaces
export async function getRSSHubCategoryDetail(
  categoryId: string,
  params?: { lang?: string; sort?: string; limit?: number; offset?: number }
): Promise<RSSHubCategoryDetailResponse> {
  const searchParams = new URLSearchParams();
  if (params?.lang) searchParams.set('lang', params.lang);
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return request<RSSHubCategoryDetailResponse>(`/api/discover/rsshub/category/${categoryId}${query}`);
}

// Search RSSHub routes (enhanced)
export async function searchRSSHubRoutes(
  query: string,
  params?: { lang?: string; category?: string; limit?: number }
): Promise<RSSHubRoutesResponse> {
  const searchParams = new URLSearchParams({ q: query });
  if (params?.lang) searchParams.set('lang', params.lang);
  if (params?.category) searchParams.set('category', params.category);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  return request<RSSHubRoutesResponse>(`/api/discover/rsshub/search?${searchParams.toString()}`);
}

// Get popular routes (with real view data)
export async function getPopularRSSHubRoutes(
  params?: { category?: string; lang?: string; limit?: number }
): Promise<RSSHubPopularResponse> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);
  if (params?.lang) searchParams.set('lang', params.lang);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return request<RSSHubPopularResponse>(`/api/discover/rsshub/popular${query}`);
}

// Alias for getRSSHubPopularRoutes
export const getRSSHubPopularRoutes = getPopularRSSHubRoutes;

// ============ P2: Stats ============

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

export interface TopicsResponse {
  topics: TopicStats[];
}

export interface DailyStats {
  date: string;
  count: number;
}

export interface TrendsResponse {
  daily: DailyStats[];
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

export interface AchievementsResponse {
  achievements: Achievement[];
}

export async function getStatsSummary(): Promise<StatsSummary> {
  return request<StatsSummary>('/api/stats/summary');
}

export async function getTopicStats(range: 'week' | 'month' | 'year'): Promise<TopicsResponse> {
  return request<TopicsResponse>(`/api/stats/topics?range=${range}`);
}

export async function getTrendStats(range: 'week' | 'month' | 'year'): Promise<TrendsResponse> {
  return request<TrendsResponse>(`/api/stats/trends?range=${range}`);
}

export async function getAchievements(): Promise<AchievementsResponse> {
  return request<AchievementsResponse>('/api/stats/achievements');
}

// ============ P2: Knowledge Graph ============

export interface GraphNode {
  id: string;
  label: string;
  type: 'article' | 'topic' | 'feed';
  size?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: 'similar' | 'same_topic' | 'references';
}

export interface GraphResponse {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface RelatedEntry {
  entry: {
    id: number;
    title: string;
    feedId: number;
    feedTitle?: string;
    publishedAt: string;
    tags?: string[];
  };
  type: 'similar' | 'same-topic' | 'same-feed' | 'reference';
  weight: number;
}

export interface RelatedEntriesResponse {
  entryId: number;
  related: RelatedEntry[];
}

export async function getKnowledgeGraph(topic?: string): Promise<GraphResponse> {
  const query = topic ? `?topic=${encodeURIComponent(topic)}` : '';
  return request<GraphResponse>(`/api/knowledge/graph${query}`);
}

export async function getRelatedEntries(entryId: number | string): Promise<RelatedEntriesResponse> {
  return request<RelatedEntriesResponse>(`/api/knowledge/related/${entryId}`);
}

// ============ Notifications ============

export interface Notification {
  id: string;
  type: 'ai_action' | 'ai_task' | 'system';
  title: string;
  message?: string;
  entryId?: number;
  taskId?: string;
  read: boolean;
  createdAt: string;
}

export async function getNotifications(params?: { unread?: boolean; limit?: number; offset?: number }): Promise<Notification[]> {
  const searchParams = new URLSearchParams();
  if (params?.unread) searchParams.set('unread', 'true');
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return request<Notification[]>(`/api/notifications${query}`);
}

export async function getNotificationCount(): Promise<{ count: number }> {
  const result = await request<{ unread: number }>('/api/notifications/count');
  return { count: result.unread };
}

export async function getNotification(id: string): Promise<Notification> {
  return request<Notification>(`/api/notifications/${id}`);
}

export async function markNotificationRead(id: string): Promise<void> {
  return request<void>(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<void> {
  return request<void>('/api/notifications/read-all', { method: 'PATCH' });
}

export async function deleteNotification(id: string): Promise<void> {
  return request<void>(`/api/notifications/${id}`, { method: 'DELETE' });
}

export async function clearReadNotifications(): Promise<void> {
  return request<void>('/api/notifications', { method: 'DELETE' });
}

// ============ AI Actions ============

export interface AIAction {
  id: string;
  name: string;
  conditions: AIActionCondition[];
  actions: AIActionType[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AIActionCondition {
  field: string;
  operator: string;
  value: string;
}

export type AIActionType = 
  | { type: 'summarize' }
  | { type: 'translate'; language: string }
  | { type: 'fetch_full' }
  | { type: 'star' }
  | { type: 'mark_read' }
  | { type: 'block' }
  | { type: 'webhook'; url: string }
  | { type: 'notify' };

export async function getAIActions(): Promise<AIAction[]> {
  return request<AIAction[]>('/api/actions');
}

export async function createAIAction(action: Omit<AIAction, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIAction> {
  return request<AIAction>('/api/actions', {
    method: 'POST',
    body: JSON.stringify(action),
  });
}

export async function updateAIAction(id: string, action: Partial<AIAction>): Promise<AIAction> {
  return request<AIAction>(`/api/actions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(action),
  });
}

export async function deleteAIAction(id: string): Promise<void> {
  return request<void>(`/api/actions/${id}`, { method: 'DELETE' });
}

export async function testAIAction(entries: any[]): Promise<any> {
  return request<any>('/api/actions/test', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

// ============ AI Tasks ============

export interface AITask {
  id: string;
  name: string;
  prompt: string;
  schedule: {
    type: 'once' | 'daily' | 'weekly' | 'monthly';
    date?: string;
    timeOfDay?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
  options: {
    notifyChannels: ('app' | 'webhook')[];
    webhookUrl?: string;
    feedIds?: number[];
    categoryIds?: number[];
    onlyUnread?: boolean;
    maxEntries?: number;
  };
  enabled: boolean;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AITaskRun {
  id: string;
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  entriesProcessed: number;
  tokensUsed: number;
  durationMs: number;
  createdAt: string;
}

export async function getAITasks(): Promise<AITask[]> {
  return request<AITask[]>('/api/ai/tasks');
}

export async function createAITask(task: Omit<AITask, 'id' | 'createdAt' | 'updatedAt'>): Promise<AITask> {
  return request<AITask>('/api/ai/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

export async function updateAITask(id: string, task: Partial<AITask>): Promise<AITask> {
  return request<AITask>(`/api/ai/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(task),
  });
}

export async function deleteAITask(id: string): Promise<void> {
  return request<void>(`/api/ai/tasks/${id}`, { method: 'DELETE' });
}

export async function runAITask(id: string): Promise<AITaskRun> {
  return request<AITaskRun>(`/api/ai/tasks/${id}/run`, { method: 'POST' });
}

export async function getAITaskRuns(taskId: string): Promise<AITaskRun[]> {
  return request<AITaskRun[]>(`/api/ai/tasks/${taskId}/runs`);
}

// ============ Feed Preview ============

export interface FeedPreviewItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string;
  thumbnail: string | null;
  author: string | null;
}

export interface FeedPreview {
  feedUrl: string;
  title: string;
  description: string;
  siteUrl: string;
  language: string | null;
  iconUrl: string | null;
  items: FeedPreviewItem[];
  fetchedAt: number;
  cached: boolean;
}

export interface FeedPreviewFull extends FeedPreview {
  total: number;
  hasMore: boolean;
}

export async function getFeedPreview(feedUrl: string, limit: number = 3): Promise<FeedPreview> {
  const encodedUrl = encodeURIComponent(feedUrl);
  return request<FeedPreview>(`/api/discover/preview?url=${encodedUrl}&limit=${limit}`);
}

export async function getFeedPreviewFull(
  feedUrl: string, 
  options: { limit?: number; offset?: number } = {}
): Promise<FeedPreviewFull> {
  const { limit = 20, offset = 0 } = options;
  const encodedUrl = encodeURIComponent(feedUrl);
  return request<FeedPreviewFull>(`/api/discover/preview/full?url=${encodedUrl}&limit=${limit}&offset=${offset}`);
}

export async function clearFeedPreviewCache(): Promise<{ success: boolean; cleared: number }> {
  return request<{ success: boolean; cleared: number }>('/api/discover/preview/clear-cache', {
    method: 'POST',
  });
}

// ============ Saved Items (Clipper) ============

export interface SavedItem {
  id: number;
  userId: number;
  url: string;
  title: string;
  description: string;
  content: string;
  thumbnail: string | null;
  source: 'twitter' | 'extension' | 'manual';
  sourceId: string | null;
  isRead: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedItemsResponse {
  items: SavedItem[];
  total: number;
}

export interface CreateSavedItemRequest {
  url: string;
  title?: string;
  description?: string;
  content?: string;
  source?: 'twitter' | 'extension' | 'manual';
  sourceId?: string;
}

export async function getSavedItems(params?: {
  limit?: number;
  offset?: number;
  unread?: boolean;
  source?: string;
  search?: string;
}): Promise<SavedItemsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.unread) searchParams.set('unread', 'true');
  if (params?.source) searchParams.set('source', params.source);
  if (params?.search) searchParams.set('search', params.search);
  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return request<SavedItemsResponse>(`/api/saved${query}`);
}

export async function getSavedItem(id: number): Promise<SavedItem> {
  return request<SavedItem>(`/api/saved/${id}`);
}

export async function createSavedItem(item: CreateSavedItemRequest): Promise<SavedItem> {
  return request<SavedItem>('/api/saved', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function updateSavedItem(id: number, updates: {
  title?: string;
  description?: string;
  isRead?: boolean;
  isArchived?: boolean;
}): Promise<SavedItem> {
  return request<SavedItem>(`/api/saved/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteSavedItem(id: number): Promise<void> {
  return request<void>(`/api/saved/${id}`, { method: 'DELETE' });
}

export async function bulkDeleteSavedItems(ids: number[]): Promise<{ deleted: number }> {
  return request<{ deleted: number }>('/api/saved/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function summarizeSavedItem(id: number): Promise<SummaryResult> {
  return request<SummaryResult>('/api/saved/summarize', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

// Generic API wrapper for hooks
export const api = {
  get: (path: string, options?: RequestInit) => 
    fetch(`${API_BASE}/api${path}`, {
      ...options,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
        ...options?.headers,
      },
    }),
  
  post: <T>(path: string, body?: T, options?: RequestInit) =>
    fetch(`${API_BASE}/api${path}`, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  
  put: <T>(path: string, body?: T, options?: RequestInit) =>
    fetch(`${API_BASE}/api${path}`, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  
  delete: (path: string, options?: RequestInit) =>
    fetch(`${API_BASE}/api${path}`, {
      ...options,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
        ...options?.headers,
      },
    }),
};

// ============ Dedup ============

export interface DuplicateInfo {
  id: number;
  entryId: number;
  duplicateOf: number;
  matchType: 'url' | 'title' | 'content';
  similarity: number;
  createdAt: string;
  originalTitle?: string;
  originalUrl?: string;
  originalFeedTitle?: string;
}

export interface DedupSettings {
  enabled: boolean;
  strategies: ('url' | 'title' | 'content')[];
  action: 'mark_read' | 'hide' | 'mark_only';
}

export async function getEntryDuplicates(entryId: number | string): Promise<{ entryId: number; duplicates: DuplicateInfo[] }> {
  return request(`/api/entries/${entryId}/duplicates`);
}

export async function checkDuplicates(): Promise<{ checked: number; duplicatesFound: number }> {
  return request('/api/entries/check-duplicates', { method: 'POST' });
}

export async function getDedupSettings(): Promise<DedupSettings> {
  return request<DedupSettings>('/api/entries/dedup-settings');
}

export async function updateDedupSettings(settings: Partial<DedupSettings>): Promise<{ success: boolean; settings: DedupSettings }> {
  return request('/api/entries/dedup-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ============ Config ============

export interface AppConfig {
  rsshubUrl: string;
}

let _configCache: AppConfig | null = null;

export async function getConfig(): Promise<AppConfig> {
  // Check localStorage first (user preference)
  if (typeof window !== 'undefined') {
    const localRsshubUrl = localStorage.getItem('rsshubUrl');
    if (localRsshubUrl) {
      return { rsshubUrl: localRsshubUrl };
    }
  }
  
  // Then check cache
  if (_configCache) return _configCache;
  
  // Fetch from server
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (res.ok) {
      _configCache = await res.json();
      return _configCache!;
    }
  } catch {
    // Ignore fetch errors
  }
  
  // Fallback to default
  return { rsshubUrl: 'https://rsshub.app' };
}

// ============ Feed Sources ============

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  format: 'opml' | 'csv' | 'json' | 'auto';
  enabled: boolean;
  isBuiltin: boolean;
  lastSync?: string;
  feedCount?: number;
}

export interface ExternalFeed {
  title: string;
  feedUrl: string;
  siteUrl?: string;
  description?: string;
  category?: string;
  tags?: string[];
  source: string;
  iconUrl?: string;
}

export async function getFeedSources(): Promise<FeedSource[]> {
  const data = await request<{ sources: FeedSource[] }>('/api/feed-sources');
  return data.sources || [];
}

export async function addFeedSource(source: { name: string; url: string; format?: string }): Promise<FeedSource> {
  const data = await request<{ source: FeedSource }>('/api/feed-sources', {
    method: 'POST',
    body: JSON.stringify(source),
  });
  return data.source;
}

export async function updateFeedSource(id: string, updates: { enabled?: boolean; name?: string; url?: string }): Promise<void> {
  await request(`/api/feed-sources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteFeedSource(id: string): Promise<void> {
  await request(`/api/feed-sources/${id}`, { method: 'DELETE' });
}

export async function getExternalFeeds(options: { limit?: number; offset?: number; category?: string } = {}): Promise<{
  feeds: ExternalFeed[];
  total: number;
  sources: string[];
  fetchedAt: string;
  hasMore: boolean;
}> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.category) params.set('category', options.category);
  
  return request(`/api/feed-sources/feeds?${params}`);
}

export async function refreshFeedSources(): Promise<void> {
  await request('/api/feed-sources/refresh', { method: 'POST' });
}

export interface SourceHealth {
  id: string;
  name: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  statusCode?: number;
  feedCount?: number;
  responseTime?: number;
  error?: string;
  lastChecked: string;
}

export interface SourcesHealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  sources: SourceHealth[];
  checkedAt: string;
}

export async function checkFeedSourcesHealth(): Promise<SourcesHealthReport> {
  return request('/api/feed-sources/health');
}

export interface FeedSourceCategory {
  id: string;
  name: string;
  feedCount: number;
  icon?: string;
}

export async function getFeedSourceCategories(): Promise<{ categories: FeedSourceCategory[] }> {
  return request('/api/feed-sources/categories');
}

export async function getFeedsFromCategory(sourceId: string): Promise<{ feeds: ExternalFeed[]; source: string }> {
  return request(`/api/feed-sources/category/${encodeURIComponent(sourceId)}`);
}

// ============ Telegram ============

export async function getTelegramBotConfig(): Promise<{ configured: boolean; botUsername?: string; maskedToken?: string }> {
  return request('/api/telegram/bot-config');
}

export async function saveTelegramBotConfig(botToken: string): Promise<{ success: boolean; error?: string }> {
  return request('/api/telegram/bot-config', {
    method: 'PUT',
    body: JSON.stringify({ botToken }),
  });
}

export async function removeTelegramBotConfig(): Promise<{ success: boolean }> {
  return request('/api/telegram/bot-config', { method: 'DELETE' });
}

export async function getTelegramStatus(): Promise<{ bound: boolean; chatId?: string; notificationsEnabled: boolean }> {
  return request('/api/telegram/status');
}

export async function bindTelegram(): Promise<{ bindCode: string; deepLink: string }> {
  return request('/api/telegram/bind', { method: 'POST' });
}

export async function unbindTelegram(): Promise<{ success: boolean }> {
  return request('/api/telegram/unbind', { method: 'DELETE' });
}

export async function toggleTelegramNotifications(enabled: boolean): Promise<{ success: boolean; enabled: boolean }> {
  return request('/api/telegram/toggle', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

// Discord Webhook config
export async function getDiscordConfig(): Promise<{ configured: boolean; webhookUrl?: string | null; enabled: boolean }> {
  return request('/api/notifications/discord');
}

export async function saveDiscordWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
  return request('/api/notifications/discord', {
    method: 'PUT',
    body: JSON.stringify({ webhookUrl }),
  });
}

export async function deleteDiscordWebhook(): Promise<{ success: boolean }> {
  return request('/api/notifications/discord', { method: 'DELETE' });
}

export async function toggleDiscordNotifications(enabled: boolean): Promise<{ success: boolean; enabled: boolean }> {
  return request('/api/notifications/discord/toggle', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

// ============ Notification Channels ============

export interface NotificationChannel {
  id: number;
  type: 'telegram' | 'discord';
  name: string;
  config: any;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

export async function getNotificationChannels(): Promise<{ channels: NotificationChannel[] }> {
  return request('/api/notification-channels');
}

export async function createNotificationChannel(data: { type: string; name: string; config: any }): Promise<NotificationChannel> {
  return request('/api/notification-channels', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNotificationChannel(id: number, data: { name?: string; enabled?: boolean }): Promise<{ success: boolean }> {
  return request(`/api/notification-channels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteNotificationChannel(id: number): Promise<{ success: boolean }> {
  return request(`/api/notification-channels/${id}`, { method: 'DELETE' });
}

export async function bindTelegramChannel(id: number): Promise<{ bindCode: string; deepLink: string }> {
  return request(`/api/notification-channels/${id}/bind`, { method: 'POST' });
}

export async function getTelegramChannelStatus(id: number): Promise<{ bound: boolean; chatId?: string }> {
  return request(`/api/notification-channels/${id}/status`);
}

export async function unbindTelegramChannel(id: number): Promise<{ success: boolean }> {
  return request(`/api/notification-channels/${id}/unbind`, { method: 'POST' });
}

// Filter Rules
export interface FilterRule {
  id: number;
  user_id: number;
  name: string | null;
  match_target: string;
  match_type: string;
  pattern: string;
  action: string;
  action_value: string | null;
  scope: string;
  scope_id: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function getFilterRules(): Promise<{ filters: FilterRule[] }> {
  return request('/api/filters');
}

export async function createFilterRule(data: {
  name?: string; matchTarget?: string; matchType?: string; pattern: string;
  action?: string; actionValue?: string; scope?: string; scopeId?: number; enabled?: boolean;
}): Promise<FilterRule> {
  return request('/api/filters', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateFilterRule(id: number, data: Partial<{
  name: string; matchTarget: string; matchType: string; pattern: string;
  action: string; actionValue: string; scope: string; scopeId: number; enabled: boolean;
}>): Promise<FilterRule> {
  return request(`/api/filters/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteFilterRule(id: number): Promise<{ success: boolean }> {
  return request(`/api/filters/${id}`, { method: 'DELETE' });
}

// ============ Highlights ============

export interface Highlight {
  id: number;
  user_id: number;
  entry_id: number;
  text: string;
  note: string | null;
  color: string;
  position_start: number | null;
  position_end: number | null;
  xpath: string | null;
  created_at: string;
  updated_at: string;
  entry_title?: string;
  entry_url?: string;
  feed_title?: string;
}

export async function getHighlights(entryId?: number | string, savedItemId?: number): Promise<Highlight[]> {
  const params = savedItemId ? `?savedItemId=${savedItemId}` : entryId ? `?entryId=${entryId}` : '';
  return request(`/api/highlights${params}`).then((d: any) => d.highlights);
}

export async function createHighlight(data: {
  entryId?: number | string; savedItemId?: number;
  text: string; note?: string; color?: string;
  positionStart?: number; positionEnd?: number; xpath?: string;
}): Promise<Highlight> {
  return request('/api/highlights', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateHighlight(id: number, data: { note?: string; color?: string }): Promise<Highlight> {
  return request(`/api/highlights/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteHighlight(id: number): Promise<void> {
  return request(`/api/highlights/${id}`, { method: 'DELETE' });
}

// ============ Newsletter Subscriptions ============

export interface NewsletterSubscription {
  id: number;
  userId: number;
  feedId: number;
  address: string;
  fullAddress: string;
  senderFilter: string | null;
  feedTitle: string;
  categoryId: number | null;
  categoryTitle: string | null;
  entryCount: number;
  createdAt: string;
}

export async function getNewsletterSubscriptions(): Promise<NewsletterSubscription[]> {
  return request('/api/newsletter/subscriptions');
}

export async function createNewsletterSubscription(data: {
  name: string;
  categoryId?: number;
  senderFilter?: string;
}): Promise<NewsletterSubscription> {
  return request('/api/newsletter/subscriptions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNewsletterSubscription(
  id: number,
  data: { name?: string; categoryId?: number | null; senderFilter?: string | null }
): Promise<void> {
  return request(`/api/newsletter/subscriptions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteNewsletterSubscription(id: number): Promise<void> {
  return request(`/api/newsletter/subscriptions/${id}`, { method: 'DELETE' });
}

// ============ Reading Progress ============

export interface ReadingProgressData {
  entryId: number;
  progress: number;
  scrollPosition: number;
  timeSpent: number;
  finished: boolean;
  lastReadAt: number;
}

export async function getReadingProgress(entryId: number | string): Promise<ReadingProgressData | null> {
  try {
    const result = await request<{ progress: ReadingProgressData | null }>(`/api/entries/${entryId}/progress`);
    return result.progress || null;
  } catch {
    return null;
  }
}

export async function getReadingProgressBatch(entryIds: (number | string)[]): Promise<Record<string, { progress: number; finished: boolean }>> {
  if (entryIds.length === 0) return {};
  const ids = entryIds.join(',');
  const result = await request<{ progress: Record<string, { progress: number; finished: boolean }> }>(`/api/entries/progress/batch?ids=${ids}`);
  return result.progress || {};
}

export async function saveReadingProgress(entryId: number | string, data: {
  progress: number;
  scrollPosition: number;
  timeSpent: number;
  finished: boolean;
}): Promise<void> {
  await request(`/api/entries/${entryId}/progress`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ============ Google News ============

export interface GoogleNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
}

export async function searchGoogleNews(query: string, hl?: string): Promise<{ query: string; items: GoogleNewsItem[] }> {
  const params = new URLSearchParams({ q: query });
  if (hl) params.set('hl', hl);
  return request(`/api/google-news/search?${params}`);
}

export async function fetchGoogleNewsArticle(url: string): Promise<{
  url: string;
  originalUrl: string;
  title: string;
  content: string;
  excerpt: string;
}> {
  return request(`/api/google-news/article?url=${encodeURIComponent(url)}`);
}

export async function findSourceFeed(source: string, articleUrl?: string): Promise<{
  feeds: { url: string; title: string }[];
  source: string;
  domain?: string;
}> {
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  if (articleUrl) params.set('url', articleUrl);
  return request(`/api/google-news/find-feed?${params}`);
}

// ============ Custom CSS ============

export async function getCustomCss(): Promise<{ css: string }> {
  return request('/api/settings/custom-css');
}

export async function updateCustomCss(css: string): Promise<{ success: boolean; css: string }> {
  return request('/api/settings/custom-css', {
    method: 'PUT',
    body: JSON.stringify({ css }),
  });
}

export async function changePassword(params: { currentPassword: string; newPassword: string }): Promise<any> {
  return request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
