/**
 * PostgreSQL Database Client
 */

import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || 
      'postgres://feedglow:feedglow@localhost:5432/feedglow';
    
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client:', err.message);
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string, 
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

export async function getClient(): Promise<pg.PoolClient> {
  const pool = getPool();
  return pool.connect();
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  console.log('[DB] Running migrations...');
  
  await query(`
    CREATE TABLE IF NOT EXISTS fg_user_settings (
      user_id INTEGER PRIMARY KEY,
      provider VARCHAR(50) NOT NULL DEFAULT 'openai',
      api_key_encrypted TEXT,
      api_keys_json JSONB DEFAULT '{}',
      base_url TEXT,
      model VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: add api_keys_json column if not exists
  await query(`
    ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS api_keys_json JSONB DEFAULT '{}'
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS fg_user_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type VARCHAR(20) NOT NULL,
      entry_id INTEGER NOT NULL,
      feed_id INTEGER NOT NULL,
      timestamp BIGINT NOT NULL,
      duration INTEGER DEFAULT 0,
      scroll_depth REAL DEFAULT 0,
      action VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_events_user ON fg_user_events(user_id)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_events_user_type ON fg_user_events(user_id, type)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_events_timestamp ON fg_user_events(user_id, timestamp)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS fg_reading_preferences (
      user_id INTEGER PRIMARY KEY,
      font_size VARCHAR(20) DEFAULT 'medium',
      font_family VARCHAR(50) DEFAULT 'system',
      line_height REAL DEFAULT 1.6,
      content_width VARCHAR(20) DEFAULT 'medium',
      theme VARCHAR(20) DEFAULT 'system',
      auto_mark_read BOOLEAN DEFAULT true,
      auto_mark_read_delay INTEGER DEFAULT 3,
      show_images BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS fg_reading_progress (
      user_id INTEGER NOT NULL,
      entry_id INTEGER NOT NULL,
      progress REAL DEFAULT 0,
      scroll_position INTEGER DEFAULT 0,
      time_spent INTEGER DEFAULT 0,
      finished BOOLEAN DEFAULT false,
      last_read_at BIGINT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, entry_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS fg_knowledge_nodes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      entry_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      feed_id INTEGER NOT NULL,
      feed_title TEXT,
      published_at TEXT,
      tags TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, entry_id)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_knodes_user ON fg_knowledge_nodes(user_id)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS fg_knowledge_edges (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      source_entry_id INTEGER NOT NULL,
      target_entry_id INTEGER NOT NULL,
      type VARCHAR(20) NOT NULL,
      weight REAL DEFAULT 0.5,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, source_entry_id, target_entry_id, type)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_kedges_user ON fg_knowledge_edges(user_id)
  `);

  // ============ P0: Tags ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_tags (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(7) DEFAULT '#6366f1',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, name)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_tags_user ON fg_tags(user_id)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS fg_entry_tags (
      user_id INTEGER NOT NULL,
      entry_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL REFERENCES fg_tags(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, entry_id, tag_id)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_entry_tags_user ON fg_entry_tags(user_id)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_entry_tags_tag ON fg_entry_tags(tag_id)
  `);

  // ============ P0: Shares ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_shares (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      entry_id INTEGER NOT NULL,
      share_code VARCHAR(32) NOT NULL UNIQUE,
      title TEXT,
      content TEXT,
      url TEXT,
      author TEXT,
      feed_title TEXT,
      published_at TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, entry_id)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_shares_code ON fg_shares(share_code)
  `);

  // Migration: add enable_summary and enable_translation to fg_user_settings
  await query(`ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS enable_summary BOOLEAN DEFAULT TRUE`);
  await query(`ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS enable_translation BOOLEAN DEFAULT TRUE`);

  // Migration: add platform_credentials JSONB column for platform auth (Twitter etc.)
  await query(`ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS platform_credentials JSONB DEFAULT '{}'`);

  // ============ P1: Digests ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_digests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date VARCHAR(10) NOT NULL,
      summary TEXT,
      highlights TEXT,
      category_summaries TEXT,
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, date)
    )
  `);

  // ============ P1: Notification Rules ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_notification_rules (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name VARCHAR(200),
      enabled BOOLEAN DEFAULT true,
      triggers JSONB NOT NULL DEFAULT '{"type":"new_article"}',
      channels JSONB NOT NULL DEFAULT '{"push":true}',
      schedule JSONB DEFAULT '{"type":"immediate"}',
      feed_id INTEGER,
      keyword VARCHAR(500),
      channel VARCHAR(50),
      webhook_url TEXT,
      telegram_chat_id VARCHAR(100),
      discord_webhook_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_notif_rules_user ON fg_notification_rules(user_id)
  `);

  // Migration: add JSONB columns if missing
  await query(`ALTER TABLE fg_notification_rules ADD COLUMN IF NOT EXISTS triggers JSONB NOT NULL DEFAULT '{"type":"new_article"}'`);
  await query(`ALTER TABLE fg_notification_rules ADD COLUMN IF NOT EXISTS channels JSONB NOT NULL DEFAULT '{"push":true}'`);
  await query(`ALTER TABLE fg_notification_rules ADD COLUMN IF NOT EXISTS schedule JSONB DEFAULT '{"type":"immediate"}'`);

  // ============ P2: Integrations ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_integrations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      service VARCHAR(50) NOT NULL,
      enabled BOOLEAN DEFAULT true,
      config TEXT DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, service)
    )
  `);

  // ============ P2: AI Filters ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_ai_filters (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name VARCHAR(200) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type VARCHAR(20) NOT NULL DEFAULT 'boost',
      criteria JSONB NOT NULL DEFAULT '{}',
      score INTEGER NOT NULL DEFAULT 50,
      action VARCHAR(20) NOT NULL DEFAULT 'highlight',
      tag_name VARCHAR(100),
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_ai_filters_user ON fg_ai_filters(user_id)
  `);

  // Migration: add new columns if they don't exist
  await query(`ALTER TABLE fg_ai_filters ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'boost'`);
  await query(`ALTER TABLE fg_ai_filters ADD COLUMN IF NOT EXISTS criteria JSONB NOT NULL DEFAULT '{}'`);
  await query(`ALTER TABLE fg_ai_filters ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 50`);
  await query(`ALTER TABLE fg_ai_filters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

  // ============ P2: Fever API Auth ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_fever_auth (
      user_id INTEGER PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      api_key_hash VARCHAR(32) NOT NULL,
      miniflux_url TEXT NOT NULL,
      miniflux_api_key TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_fever_hash ON fg_fever_auth(api_key_hash)
  `);

  // ============ P1: Media Progress (Podcast) ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_media_progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      entry_id INTEGER NOT NULL,
      position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      completed BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, entry_id)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_media_user ON fg_media_progress(user_id)
  `);

  // ============ P1: Retention Policies ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_retention_policies (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      feed_id INTEGER DEFAULT 0,
      keep_days INTEGER NOT NULL DEFAULT 30,
      keep_starred BOOLEAN DEFAULT TRUE,
      keep_unread BOOLEAN DEFAULT TRUE,
      keep_min_count INTEGER DEFAULT 0,
      action VARCHAR(20) DEFAULT 'mark_read',
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, feed_id)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_retention_user ON fg_retention_policies(user_id)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS fg_retention_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      processed_feeds INTEGER DEFAULT 0,
      affected_entries INTEGER DEFAULT 0,
      marked_read INTEGER DEFAULT 0,
      removed INTEGER DEFAULT 0,
      skipped_starred INTEGER DEFAULT 0,
      skipped_unread INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ============ Backfill Entries ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_backfill_entries (
      id SERIAL PRIMARY KEY,
      feed_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      content TEXT,
      author VARCHAR(255) DEFAULT '',
      published_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) DEFAULT 'unread',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_backfill_feed ON fg_backfill_entries(feed_id)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_fg_backfill_published ON fg_backfill_entries(feed_id, published_at DESC)
  `);

  // ============ Feed Engine: Self-owned tables (replacing Miniflux) ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email VARCHAR(255) UNIQUE,
      is_admin BOOLEAN DEFAULT FALSE,
      language VARCHAR(10) DEFAULT 'zh-CN',
      timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_users_email ON fg_users(email)');

  await query(`
    CREATE TABLE IF NOT EXISTS fg_categories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES fg_users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      position INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, title)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_categories_user ON fg_categories(user_id)');

  // Migration: add parent_id for tree structure
  await query(`ALTER TABLE fg_categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES fg_categories(id) ON DELETE SET NULL`);

  await query(`
    CREATE TABLE IF NOT EXISTS fg_feeds (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES fg_users(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES fg_categories(id) ON DELETE SET NULL,
      feed_url TEXT NOT NULL,
      site_url TEXT,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      icon_type VARCHAR(50),
      icon_data TEXT,
      etag VARCHAR(255),
      last_modified VARCHAR(255),
      polling_frequency INTEGER DEFAULT 60,
      next_check_at TIMESTAMPTZ DEFAULT NOW(),
      checked_at TIMESTAMPTZ,
      parsing_error_count INTEGER DEFAULT 0,
      parsing_error_message TEXT,
      crawler BOOLEAN DEFAULT FALSE,
      user_agent TEXT,
      cookie TEXT,
      username VARCHAR(255),
      password VARCHAR(255),
      scraper_rules TEXT,
      rewrite_rules TEXT,
      blocklist_rules TEXT,
      keeplist_rules TEXT,
      disabled BOOLEAN DEFAULT FALSE,
      entry_count INTEGER DEFAULT 0,
      feed_type VARCHAR(20) DEFAULT 'article',
      position INTEGER DEFAULT 0,
      profile_image_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, feed_url)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_feeds_user ON fg_feeds(user_id)');

  // Migration: add feed_type, position, profile_image_url to fg_feeds
  await query(`ALTER TABLE fg_feeds ADD COLUMN IF NOT EXISTS feed_type VARCHAR(20) DEFAULT 'article'`);
  await query(`ALTER TABLE fg_feeds ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0`);
  await query(`ALTER TABLE fg_feeds ADD COLUMN IF NOT EXISTS profile_image_url TEXT`);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_feeds_next_check ON fg_feeds(next_check_at) WHERE disabled = FALSE');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_feeds_category ON fg_feeds(category_id)');

  await query(`
    CREATE TABLE IF NOT EXISTS fg_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      feed_id INTEGER NOT NULL REFERENCES fg_feeds(id) ON DELETE CASCADE,
      hash VARCHAR(64) NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      content TEXT,
      author VARCHAR(255) DEFAULT '',
      status VARCHAR(20) DEFAULT 'unread',
      starred BOOLEAN DEFAULT FALSE,
      published_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      changed_at TIMESTAMPTZ DEFAULT NOW(),
      reading_time INTEGER DEFAULT 0,
      word_count INTEGER DEFAULT 0,
      enclosure_url TEXT,
      enclosure_type VARCHAR(100),
      enclosure_size BIGINT DEFAULT 0,
      uuid UUID DEFAULT gen_random_uuid(),
      summary TEXT,
      key_points JSONB,
      image_url TEXT,
      is_duplicate BOOLEAN DEFAULT FALSE,
      UNIQUE(feed_id, hash)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_entries_user_status ON fg_entries(user_id, status)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_entries_uuid ON fg_entries(uuid)');

  // Migration: add uuid, summary, key_points, image_url, is_duplicate to fg_entries
  await query(`ALTER TABLE fg_entries ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid()`);
  await query(`ALTER TABLE fg_entries ADD COLUMN IF NOT EXISTS summary TEXT`);
  await query(`ALTER TABLE fg_entries ADD COLUMN IF NOT EXISTS key_points JSONB`);
  await query(`ALTER TABLE fg_entries ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await query(`ALTER TABLE fg_entries ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE`);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_entries_feed ON fg_entries(feed_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_entries_published ON fg_entries(user_id, published_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_entries_starred ON fg_entries(user_id, starred) WHERE starred = TRUE');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_entries_user_feed_status ON fg_entries(user_id, feed_id, status)');

  // Migration: add content_hash column for entry update detection
  await query(`ALTER TABLE fg_entries ADD COLUMN IF NOT EXISTS content_hash VARCHAR(32)`);

  // AI Actions rule engine
  await query(`
    CREATE TABLE IF NOT EXISTS fg_action_rules (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      conditions JSONB NOT NULL DEFAULT '[]',
      actions JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_action_rules_user ON fg_action_rules(user_id, enabled)');

  // Entry metadata (AI summaries, translations, etc.)
  await query(`
    CREATE TABLE IF NOT EXISTS fg_entry_metadata (
      id SERIAL PRIMARY KEY,
      entry_id INTEGER NOT NULL,
      key VARCHAR(100) NOT NULL,
      value JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(entry_id, key)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_entry_metadata_entry ON fg_entry_metadata(entry_id)');

  // Notifications (for action-triggered notifications)
  await query(`
    CREATE TABLE IF NOT EXISTS fg_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'action',
      title TEXT NOT NULL,
      body TEXT,
      entry_id INTEGER,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_notifications_user ON fg_notifications(user_id, read, created_at DESC)');

  // AI Tasks (scheduled AI analysis)
  await query(`
    CREATE TABLE IF NOT EXISTS fg_ai_tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      prompt TEXT NOT NULL,
      schedule JSONB NOT NULL,
      options JSONB DEFAULT '{"notifyChannels":["in_app"]}',
      enabled BOOLEAN DEFAULT TRUE,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      last_result TEXT,
      run_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_ai_tasks_user ON fg_ai_tasks(user_id, enabled)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_ai_tasks_next_run ON fg_ai_tasks(next_run_at) WHERE enabled = TRUE');

  // AI Task run history
  await query(`
    CREATE TABLE IF NOT EXISTS fg_ai_task_runs (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES fg_ai_tasks(id) ON DELETE CASCADE,
      result TEXT,
      entries_used INTEGER DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_ai_task_runs_task ON fg_ai_task_runs(task_id, created_at DESC)');

  // ============ Collections (dynamic, DB-backed) ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_collections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      icon_emoji VARCHAR(10) DEFAULT '📦',
      is_public BOOLEAN DEFAULT TRUE,
      position INTEGER DEFAULT 0,
      source VARCHAR(50) DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_collections_user ON fg_collections(user_id)');
  await query('ALTER TABLE fg_collections ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT \'manual\'');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_fg_collections_title_user ON fg_collections(user_id, title)');

  await query(`
    CREATE TABLE IF NOT EXISTS fg_collection_feeds (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES fg_collections(id) ON DELETE CASCADE,
      feed_url TEXT NOT NULL,
      title VARCHAR(500) NOT NULL,
      site_url TEXT,
      description TEXT DEFAULT '',
      category VARCHAR(100) DEFAULT '',
      language VARCHAR(10) DEFAULT '',
      position INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(collection_id, feed_url)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_collection_feeds_col ON fg_collection_feeds(collection_id)');

  // ============ Saved Items (Read Later / Clipper) ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_saved_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      title VARCHAR(1000) NOT NULL,
      description TEXT DEFAULT '',
      content TEXT DEFAULT '',
      thumbnail TEXT,
      source VARCHAR(50) DEFAULT 'manual',
      source_id VARCHAR(100),
      is_read BOOLEAN DEFAULT FALSE,
      is_archived BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, url)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_saved_items_user ON fg_saved_items(user_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_saved_items_url ON fg_saved_items(user_id, url)');

  // ============ Feed Sources (external recommendation sources) ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_feed_sources (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      source_id VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      format VARCHAR(20) DEFAULT 'auto',
      enabled BOOLEAN DEFAULT TRUE,
      is_builtin BOOLEAN DEFAULT FALSE,
      feed_count INTEGER DEFAULT 0,
      last_sync TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, source_id)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_feed_sources_user ON fg_feed_sources(user_id)');

  // ============ P3: Article Deduplication ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_entry_duplicates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      entry_id INTEGER NOT NULL REFERENCES fg_entries(id) ON DELETE CASCADE,
      duplicate_of INTEGER NOT NULL REFERENCES fg_entries(id) ON DELETE CASCADE,
      match_type VARCHAR(20) NOT NULL,
      similarity REAL DEFAULT 1.0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(entry_id, duplicate_of)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_entry_dupes_entry ON fg_entry_duplicates(entry_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_entry_dupes_duplicate_of ON fg_entry_duplicates(duplicate_of)');
  await query('CREATE INDEX IF NOT EXISTS idx_entry_dupes_user ON fg_entry_duplicates(user_id)');

  // Add dedup_settings column to fg_user_settings
  await query(`ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS dedup_settings JSONB DEFAULT NULL`);

  // Migration: add custom_css and polling_defaults to fg_user_settings
  await query(`ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS custom_css TEXT DEFAULT ''`);
  await query(`ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS polling_defaults JSONB DEFAULT '{}'`);

  // ============ Auth: Refresh Tokens ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES fg_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      device_info TEXT,
      ip_address TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_refresh_tokens_user ON fg_refresh_tokens(user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_refresh_tokens_hash ON fg_refresh_tokens(token_hash)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_refresh_tokens_expires ON fg_refresh_tokens(expires_at)');

  // ============ Auth: Invite Codes ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_invites (
      id SERIAL PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      created_by INTEGER REFERENCES fg_users(id),
      used_by INTEGER REFERENCES fg_users(id),
      used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_invites_code ON fg_invites(code)');

  // ============ P2: Newsletter Addresses ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_newsletter_addresses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES fg_users(id) ON DELETE CASCADE,
      feed_id INTEGER REFERENCES fg_feeds(id) ON DELETE CASCADE,
      address VARCHAR(255) NOT NULL UNIQUE,
      label VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_newsletter_user ON fg_newsletter_addresses(user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_newsletter_addr ON fg_newsletter_addresses(address)');

  // ============ P2: Highlights ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_highlights (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES fg_users(id) ON DELETE CASCADE,
      entry_id INTEGER NOT NULL REFERENCES fg_entries(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      note TEXT,
      color VARCHAR(20) DEFAULT 'yellow',
      position_start INTEGER,
      position_end INTEGER,
      xpath TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_highlights_user ON fg_highlights(user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_highlights_entry ON fg_highlights(entry_id)');

  // ============ P2: Shared Feeds (Curated Collections) ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_shared_feeds (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES fg_users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      scope VARCHAR(50),
      slug VARCHAR(100) UNIQUE,
      is_public BOOLEAN DEFAULT TRUE,
      item_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_shared_feeds_user ON fg_shared_feeds(user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_fg_shared_feeds_slug ON fg_shared_feeds(slug)');

  await query(`
    CREATE TABLE IF NOT EXISTS fg_shared_feed_items (
      id SERIAL PRIMARY KEY,
      shared_feed_id INTEGER NOT NULL REFERENCES fg_shared_feeds(id) ON DELETE CASCADE,
      entry_id INTEGER NOT NULL REFERENCES fg_entries(id) ON DELETE CASCADE,
      note TEXT,
      sort_order INTEGER DEFAULT 0,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(shared_feed_id, entry_id)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_shared_feed_items_feed ON fg_shared_feed_items(shared_feed_id)');

  // ============ P2: Watched Pages (Web Change Monitor) ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_watched_pages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES fg_users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      title VARCHAR(255),
      check_interval INTEGER DEFAULT 3600,
      last_checked_at TIMESTAMPTZ,
      last_hash TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_watched_pages_user ON fg_watched_pages(user_id)');

  await query(`
    CREATE TABLE IF NOT EXISTS fg_page_changes (
      id SERIAL PRIMARY KEY,
      watched_page_id INTEGER NOT NULL REFERENCES fg_watched_pages(id) ON DELETE CASCADE,
      diff TEXT,
      old_hash TEXT,
      new_hash TEXT,
      detected_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_page_changes_page ON fg_page_changes(watched_page_id)');

  // ============ Twitter Token Refresh Log ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_twitter_refresh_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      status VARCHAR(20) NOT NULL,
      message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: add transcript_url to fg_entries for Podcasting 2.0 <podcast:transcript>
  await query(`ALTER TABLE fg_entries ADD COLUMN IF NOT EXISTS transcript_url TEXT`);
  await query(`ALTER TABLE fg_entries ADD COLUMN IF NOT EXISTS transcript_type VARCHAR(50)`);

  // ============ Podcast Transcripts ============

  await query(`
    CREATE TABLE IF NOT EXISTS fg_transcripts (
      id SERIAL PRIMARY KEY,
      entry_id INTEGER NOT NULL,
      segments JSONB NOT NULL DEFAULT '[]',
      source_url TEXT,
      source VARCHAR(20) DEFAULT 'webpage',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(entry_id)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_fg_transcripts_entry ON fg_transcripts(entry_id)');

  console.log('[DB] Migrations complete');
}
