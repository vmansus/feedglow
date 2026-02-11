-- Migration 008: Shared Feed Collections
-- Allows users to share tag/category feeds as public JSON Feeds

CREATE TABLE IF NOT EXISTS fg_shared_feeds (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES fg_users(id),
  share_code VARCHAR(32) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  scope_type VARCHAR(20) NOT NULL,   -- 'tag' or 'category'
  scope_id INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shared_feeds_user ON fg_shared_feeds(user_id);
CREATE INDEX idx_shared_feeds_code ON fg_shared_feeds(share_code);
