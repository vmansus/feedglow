/**
 * Feed types - shared between web and API
 */

export interface Feed {
  id: string;
  title: string;
  url: string;
  siteUrl?: string;
  description?: string;
  iconUrl?: string;
  category?: Category;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  title: string;
  feedCount: number;
}

export interface Entry {
  id: string;
  feedId: string;
  title: string;
  url: string;
  author?: string;
  content: string;
  summary?: string;
  aiSummary?: string;
  aiTranslation?: string;
  status: 'unread' | 'read';
  starred: boolean;
  publishedAt: string;
  createdAt: string;
}

export interface GetFeedsResponse {
  feeds: Feed[];
  total: number;
}

export interface GetEntriesRequest {
  feedId?: string;
  categoryId?: string;
  status?: 'unread' | 'read' | 'all';
  starred?: boolean;
  limit?: number;
  offset?: number;
}

export interface GetEntriesResponse {
  entries: Entry[];
  total: number;
}

export interface CreateFeedRequest {
  url: string;
  categoryId?: string;
}

export interface UpdateEntryRequest {
  status?: 'unread' | 'read';
  starred?: boolean;
}

export interface AIProcessRequest {
  entryId: string;
  action: 'summarize' | 'translate';
  targetLanguage?: string;
}

export interface AIProcessResponse {
  entryId: string;
  result: string;
  model: string;
  tokensUsed: number;
}
