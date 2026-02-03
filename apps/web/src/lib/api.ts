/**
 * FeedGlow API Client
 */

import type {
  Feed,
  Entry,
  Category,
  EntriesResponse,
  SummaryResult,
  TranslationResult,
} from '@feedglow/shared';
import { getAuthHeader } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

// ============ Entries ============

export interface GetEntriesParams {
  status?: 'unread' | 'read' | 'all';
  feedId?: number;
  categoryId?: number;
  starred?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
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

// ============ AI Features ============

export async function summarizeEntry(id: number): Promise<SummaryResult> {
  return request<SummaryResult>(`/api/entries/${id}/summarize`, {
    method: 'POST',
  });
}

export async function translateEntry(
  id: number,
  language: string = 'zh-CN'
): Promise<TranslationResult> {
  return request<TranslationResult>(`/api/entries/${id}/translate`, {
    method: 'POST',
    body: JSON.stringify({ language }),
  });
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

export async function createCategory(title: string): Promise<Category> {
  return request<Category>('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function deleteCategory(id: number): Promise<void> {
  await request(`/api/categories/${id}`, { method: 'DELETE' });
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
