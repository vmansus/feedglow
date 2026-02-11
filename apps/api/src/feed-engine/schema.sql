-- FeedGlow Feed Engine - Database Schema
-- Replaces Miniflux tables with fg_ prefixed self-owned tables

-- ============ Users ============
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
);

CREATE INDEX IF NOT EXISTS idx_fg_users_email ON fg_users(email);

-- ============ Categories ============
CREATE TABLE IF NOT EXISTS fg_categories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES fg_users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, title)
);

CREATE INDEX IF NOT EXISTS idx_fg_categories_user ON fg_categories(user_id);

-- ============ Feeds ============
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
  -- Polling config
  polling_frequency INTEGER DEFAULT 60,        -- minutes
  next_check_at TIMESTAMPTZ DEFAULT NOW(),
  checked_at TIMESTAMPTZ,
  -- Error tracking
  parsing_error_count INTEGER DEFAULT 0,
  parsing_error_message TEXT,
  -- Advanced settings
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
  -- Stats
  entry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, feed_url)
);

CREATE INDEX IF NOT EXISTS idx_fg_feeds_user ON fg_feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_fg_feeds_next_check ON fg_feeds(next_check_at) WHERE disabled = FALSE;
CREATE INDEX IF NOT EXISTS idx_fg_feeds_category ON fg_feeds(category_id);

-- ============ Entries ============
CREATE TABLE IF NOT EXISTS fg_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  feed_id INTEGER NOT NULL REFERENCES fg_feeds(id) ON DELETE CASCADE,
  hash VARCHAR(64) NOT NULL,             -- SHA256 of url or guid
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT,
  author VARCHAR(255) DEFAULT '',
  status VARCHAR(20) DEFAULT 'unread',   -- unread, read, removed
  starred BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  -- Extracted metadata
  reading_time INTEGER DEFAULT 0,        -- minutes
  word_count INTEGER DEFAULT 0,
  -- Media
  enclosure_url TEXT,
  enclosure_type VARCHAR(100),
  enclosure_size BIGINT DEFAULT 0,
  UNIQUE(feed_id, hash)
);

CREATE INDEX IF NOT EXISTS idx_fg_entries_user_status ON fg_entries(user_id, status);
CREATE INDEX IF NOT EXISTS idx_fg_entries_feed ON fg_entries(feed_id);
CREATE INDEX IF NOT EXISTS idx_fg_entries_published ON fg_entries(user_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_fg_entries_starred ON fg_entries(user_id, starred) WHERE starred = TRUE;
CREATE INDEX IF NOT EXISTS idx_fg_entries_user_feed_status ON fg_entries(user_id, feed_id, status);
