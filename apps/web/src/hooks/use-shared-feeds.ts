/**
 * Shared Feeds hooks — curated article collections
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeader } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

// ============ Types ============

export interface SharedFeed {
  id: number;
  title: string;
  description: string | null;
  item_count?: number;
  // snake_case from API
  share_code?: string;
  shareCode?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SharedFeedItem {
  id: number;
  shared_feed_id: number;
  entry_id: number;
  note: string | null;
  added_at: string;
  title?: string;
  url?: string;
  author?: string;
  published_at?: string;
  feed_title?: string;
}

// ============ API Functions ============

async function fetchSharedFeeds(): Promise<SharedFeed[]> {
  const res = await fetch(`${API_BASE}/api/shared-feeds`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.sharedFeeds || [];
}

async function createSharedFeedApi(params: {
  title: string;
  description?: string;
}): Promise<SharedFeed> {
  const res = await fetch(`${API_BASE}/api/shared-feeds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function deleteSharedFeedApi(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/shared-feeds/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function addItemApi(params: { sharedFeedId: number; entryId: string; note?: string }): Promise<SharedFeedItem> {
  const res = await fetch(`${API_BASE}/api/shared-feeds/${params.sharedFeedId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ entryId: params.entryId, note: params.note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function removeItemApi(params: { sharedFeedId: number; entryId: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/shared-feeds/${params.sharedFeedId}/items/${params.entryId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function fetchSharedFeedItems(sharedFeedId: number): Promise<SharedFeedItem[]> {
  const res = await fetch(`${API_BASE}/api/shared-feeds/${sharedFeedId}/items`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

async function fetchEntrySharedFeeds(entryId: string): Promise<Array<{ id: number; title: string; has_item: boolean }>> {
  const res = await fetch(`${API_BASE}/api/shared-feeds/entry/${entryId}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.feeds || [];
}

// ============ Hooks ============

export function useSharedFeeds() {
  return useQuery({
    queryKey: ['shared-feeds'],
    queryFn: fetchSharedFeeds,
  });
}

export function useCreateSharedFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSharedFeedApi,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shared-feeds'] }),
  });
}

export function useDeleteSharedFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSharedFeedApi,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shared-feeds'] }),
  });
}

export function useAddSharedFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addItemApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-feeds'] });
      qc.invalidateQueries({ queryKey: ['shared-feed-items'] });
      qc.invalidateQueries({ queryKey: ['entry-shared-feeds'] });
    },
  });
}

export function useRemoveSharedFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeItemApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-feeds'] });
      qc.invalidateQueries({ queryKey: ['shared-feed-items'] });
      qc.invalidateQueries({ queryKey: ['entry-shared-feeds'] });
    },
  });
}

export function useSharedFeedItems(sharedFeedId: number | null) {
  return useQuery({
    queryKey: ['shared-feed-items', sharedFeedId],
    queryFn: () => fetchSharedFeedItems(sharedFeedId!),
    enabled: !!sharedFeedId,
  });
}

export function useEntrySharedFeeds(entryId: string | null) {
  return useQuery({
    queryKey: ['entry-shared-feeds', entryId],
    queryFn: () => fetchEntrySharedFeeds(entryId!),
    enabled: !!entryId,
  });
}

export function getSharedFeedUrl(shareCode: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  return `${baseUrl}/api/shared-feeds/feed/${shareCode}.json`;
}

export function getSharedFeedPreviewUrl(shareCode: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  return `${baseUrl}/api/shared-feeds/feed/${shareCode}`;
}
