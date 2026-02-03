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

  return res.json();
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

// ============ Health ============

export async function healthCheck(): Promise<{ status: string; miniflux: string }> {
  return request('/health');
}
