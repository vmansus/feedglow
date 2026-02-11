/**
 * FeedGlow Shared Types
 * Shared between API, Web, and Mobile
 */

// ============ Feed Types ============

export interface FeedIcon {
  feed_id: number;
  icon_id: number;
}

export type FeedType = 'article' | 'social' | 'notification' | 'picture' | 'video';

export interface Feed {
  id: number;
  title: string;
  siteUrl: string;
  feedUrl: string;
  feed_type: FeedType;
  polling_frequency: number;
  categoryId: number;
  categoryTitle: string;
  iconUrl?: string;
  icon?: FeedIcon;
  /** RSS channel image (e.g. Twitter profile pic) */
  profileImageUrl?: string;
  disabled: boolean;
  unreadCount?: number;
  lastCheckedAt: string;
  position?: number;
}

export interface Category {
  id: number;
  title: string;
  parent_id: number | null;
  position?: number;
  feedCount?: number;
  unreadCount?: number;
}

// ============ Entry Types ============

export interface TranslationParagraph {
  original: string;
  translated: string;
}

export interface EntryTranslation {
  language: string;
  title: string;
  translatedTitle?: string;
  content: string;
  summary?: string;
  paragraphs?: TranslationParagraph[];
}

export interface Enclosure {
  url: string;
  mime_type: string;
  mimeType?: string;
  size: number | string;
}

export interface Entry {
  id: number;
  feedId: number;
  feedTitle: string;
  feedIconUrl?: string;
  /** RSS channel image (e.g. Twitter profile pic) */
  feedProfileImageUrl?: string;
  feedType?: FeedType;
  title: string;
  url: string;
  author: string;
  content: string;
  publishedAt: string;
  readingTime: number;
  status: 'unread' | 'read';
  starred: boolean;
  // Media enclosures (podcast audio, video, etc.)
  enclosures?: Enclosure[];
  // AI-generated fields
  summary?: string;
  keyPoints?: string[];
  translation?: EntryTranslation;
  tags?: string[];
  hasFullContent?: boolean;
}

export interface EntriesResponse {
  total: number;
  entries: Entry[];
  hasMore: boolean;
}

// ============ User Types ============

export interface User {
  id: number;
  username: string;
  email?: string;
  isAdmin: boolean;
  settings: UserSettings;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  defaultView: 'unread' | 'all' | 'starred';
  autoSummarize: boolean;
  autoTranslate: boolean;
  translateLanguage: string;
  entriesPerPage: number;
}

// ============ API Response Types ============

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: 'ok' | 'error';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// ============ AI Types ============

export interface SummaryResult {
  entryId: number;
  summary: string;
  keyPoints: string[];
  readingTime: number;
  tokens: number;
}

export interface TranslationResult {
  entryId: number;
  title: string;
  translatedTitle: string;
  paragraphs: TranslationParagraph[];
  summary?: string;
  tokens?: number;
}

// ============ Webhook Types ============

export interface WebhookPayload {
  eventType: 'new_entries' | 'save_entry';
  feed: {
    id: number;
    title: string;
  };
  entries: Array<{
    id: number;
    title: string;
    url: string;
  }>;
}
