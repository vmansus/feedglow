/**
 * Watch API Client — Page Change Monitoring
 */

import { getAuthHeader } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

// ============ Types ============

export interface WatchedPage {
  id: number;
  userId: number;
  url: string;
  title: string | null;
  cssSelector: string | null;
  checkIntervalMinutes: number;
  lastHash: string | null;
  lastContent: string | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  isActive: boolean;
  createdAt: string;
  changeCount: number;
}

export interface PageChange {
  id: number;
  watchedPageId: number;
  oldContent: string | null;
  newContent: string | null;
  diffHtml: string | null;
  detectedAt: string;
}

export interface WatchedPagesResponse {
  items: WatchedPage[];
  total: number;
}

export interface PageChangesResponse {
  items: PageChange[];
  total: number;
}

export interface CheckResult {
  changed: boolean;
  error?: string;
}

// ============ Helpers ============

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function transformKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeys(item)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[snakeToCamel(key)] = transformKeys(value);
    }
    return result as T;
  }
  return obj as T;
}

function transformKeysToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[camelToSnake(key)] = value;
    }
  }
  return result;
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
    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('feedglow_token');
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?expired=1';
          return new Promise(() => {});
        }
      }
    }
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return transformKeys<T>(data);
}

// ============ API Functions ============

export async function getWatchedPages(): Promise<WatchedPagesResponse> {
  return request<WatchedPagesResponse>('/api/watch');
}

export async function createWatchedPage(input: {
  url: string;
  title?: string;
  cssSelector?: string;
  checkIntervalMinutes?: number;
}): Promise<WatchedPage> {
  return request<WatchedPage>('/api/watch', {
    method: 'POST',
    body: JSON.stringify(transformKeysToSnake(input as Record<string, unknown>)),
  });
}

export async function updateWatchedPage(
  id: number,
  input: {
    title?: string;
    cssSelector?: string | null;
    checkIntervalMinutes?: number;
    isActive?: boolean;
  }
): Promise<WatchedPage> {
  return request<WatchedPage>(`/api/watch/${id}`, {
    method: 'PUT',
    body: JSON.stringify(transformKeysToSnake(input as Record<string, unknown>)),
  });
}

export async function deleteWatchedPage(id: number): Promise<void> {
  await request<{ success: boolean }>(`/api/watch/${id}`, {
    method: 'DELETE',
  });
}

export async function getPageChanges(
  pageId: number,
  params?: { limit?: number; offset?: number }
): Promise<PageChangesResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return request<PageChangesResponse>(`/api/watch/${pageId}/changes${qs ? `?${qs}` : ''}`);
}

export async function triggerPageCheck(pageId: number): Promise<CheckResult> {
  return request<CheckResult>(`/api/watch/${pageId}/check`, {
    method: 'POST',
  });
}
