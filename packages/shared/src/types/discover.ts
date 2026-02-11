/**
 * Discover Types — shared between frontend and backend
 */

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
