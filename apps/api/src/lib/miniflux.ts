/**
 * Miniflux API Client
 * https://miniflux.app/docs/api.html
 */

// Custom error class for better error handling
export class MinifluxError extends Error {
  constructor(
    public status: number,
    message: string,
    public endpoint?: string
  ) {
    super(message);
    this.name = 'MinifluxError';
  }
}

export interface MinifluxConfig {
  baseUrl: string;
  apiKey: string;
}

export interface Feed {
  id: number;
  user_id: number;
  feed_url: string;
  site_url: string;
  title: string;
  checked_at: string;
  next_check_at: string;
  etag_header: string;
  last_modified_header: string;
  parsing_error_message: string;
  parsing_error_count: number;
  scraper_rules: string;
  rewrite_rules: string;
  crawler: boolean;
  blocklist_rules: string;
  keeplist_rules: string;
  urlrewrite_rules: string;
  user_agent: string;
  cookie: string;
  username: string;
  password: string;
  disabled: boolean;
  no_media_player: boolean;
  ignore_http_cache: boolean;
  allow_self_signed_certificates: boolean;
  fetch_via_proxy: boolean;
  hide_globally: boolean;
  category: Category;
  icon?: FeedIcon;
}

export interface Category {
  id: number;
  title: string;
  user_id: number;
  hide_globally: boolean;
}

export interface FeedIcon {
  feed_id: number;
  icon_id: number;
}

export interface Entry {
  id: number;
  user_id: number;
  feed_id: number;
  status: 'unread' | 'read' | 'removed';
  hash: string;
  title: string;
  url: string;
  comments_url: string;
  published_at: string;
  created_at: string;
  changed_at: string;
  content: string;
  author: string;
  share_code: string;
  starred: boolean;
  reading_time: number;
  enclosures: Enclosure[];
  feed: Feed;
  tags: string[];
}

export interface Enclosure {
  id: number;
  user_id: number;
  entry_id: number;
  url: string;
  mime_type: string;
  size: number;
  media_progression: number;
}

export interface EntriesFilter {
  status?: 'unread' | 'read' | 'removed';
  offset?: number;
  limit?: number;
  order?: 'id' | 'status' | 'published_at' | 'category_title' | 'category_id';
  direction?: 'asc' | 'desc';
  before?: number;
  after?: number;
  before_entry_id?: number;
  after_entry_id?: number;
  starred?: boolean;
  search?: string;
  category_id?: number;
}

export interface EntriesResponse {
  total: number;
  entries: Entry[];
}

export interface DiscoverResponse {
  url: string;
  title: string;
  type: string;
}

export class MinifluxClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: MinifluxConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'X-Auth-Token': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new MinifluxError(res.status, error, path);
    }

    // Handle empty responses (204 No Content)
    const text = await res.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text);
  }

  // ============ Feeds ============

  async getFeeds(): Promise<Feed[]> {
    return this.request('GET', '/feeds');
  }

  async getFeed(id: number): Promise<Feed> {
    return this.request('GET', `/feeds/${id}`);
  }

  async createFeed(feedUrl: string, categoryId: number): Promise<Feed> {
    return this.request('POST', '/feeds', {
      feed_url: feedUrl,
      category_id: categoryId,
    });
  }

  async updateFeed(id: number, updates: Partial<Feed>): Promise<Feed> {
    return this.request('PUT', `/feeds/${id}`, updates);
  }

  async deleteFeed(id: number): Promise<void> {
    await this.request('DELETE', `/feeds/${id}`);
  }

  async refreshFeed(id: number): Promise<void> {
    await this.request('PUT', `/feeds/${id}/refresh`);
  }

  async refreshAllFeeds(): Promise<void> {
    await this.request('PUT', '/feeds/refresh');
  }

  async discoverFeeds(url: string): Promise<DiscoverResponse[]> {
    return this.request('POST', '/discover', { url });
  }

  // ============ Entries ============

  async getEntries(filter?: EntriesFilter): Promise<EntriesResponse> {
    const params = new URLSearchParams();
    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const query = params.toString();
    return this.request('GET', `/entries${query ? `?${query}` : ''}`);
  }

  async getFeedEntries(
    feedId: number,
    filter?: EntriesFilter
  ): Promise<EntriesResponse> {
    const params = new URLSearchParams();
    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const query = params.toString();
    return this.request(
      'GET',
      `/feeds/${feedId}/entries${query ? `?${query}` : ''}`
    );
  }

  async getEntry(id: number): Promise<Entry> {
    return this.request('GET', `/entries/${id}`);
  }

  async updateEntryStatus(
    entryIds: number[],
    status: 'read' | 'unread'
  ): Promise<void> {
    await this.request('PUT', '/entries', {
      entry_ids: entryIds,
      status,
    });
  }

  async toggleEntryBookmark(id: number): Promise<void> {
    await this.request('PUT', `/entries/${id}/bookmark`);
  }

  async saveEntry(id: number): Promise<void> {
    // Save to third-party service (if configured)
    await this.request('POST', `/entries/${id}/save`);
  }

  // ============ Categories ============

  async getCategories(): Promise<Category[]> {
    return this.request('GET', '/categories');
  }

  async createCategory(title: string): Promise<Category> {
    return this.request('POST', '/categories', { title });
  }

  async updateCategory(id: number, title: string): Promise<Category> {
    return this.request('PUT', `/categories/${id}`, { title });
  }

  async deleteCategory(id: number): Promise<void> {
    await this.request('DELETE', `/categories/${id}`);
  }

  // ============ User ============

  async getMe(): Promise<{ id: number; username: string; is_admin: boolean }> {
    return this.request('GET', '/me');
  }

  // ============ Health ============

  async healthcheck(): Promise<'OK'> {
    const res = await fetch(`${this.baseUrl}/healthcheck`);
    return res.text() as Promise<'OK'>;
  }
}

// Singleton instance (for backward compatibility / webhook etc)
let defaultClient: MinifluxClient | null = null;

/**
 * Get default Miniflux client from environment variables
 * Used for webhooks and unauthenticated endpoints
 */
export function getMinifluxClient(): MinifluxClient {
  if (!defaultClient) {
    const baseUrl = process.env.MINIFLUX_URL;
    const apiKey = process.env.MINIFLUX_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error(
        'MINIFLUX_URL and MINIFLUX_API_KEY environment variables are required'
      );
    }

    defaultClient = new MinifluxClient({ baseUrl, apiKey });
  }
  return defaultClient;
}

/**
 * Create Miniflux client from user credentials (from JWT context)
 */
export function createMinifluxClient(config: MinifluxConfig): MinifluxClient {
  return new MinifluxClient(config);
}
