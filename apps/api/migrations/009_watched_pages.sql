-- Feature #9: Page Change Monitoring (Track Changes)

CREATE TABLE IF NOT EXISTS fg_watched_pages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES fg_users(id),
  url TEXT NOT NULL,
  title VARCHAR(500),
  css_selector TEXT,
  check_interval_minutes INTEGER DEFAULT 60,
  last_hash TEXT,
  last_content TEXT,
  last_checked_at TIMESTAMP,
  last_changed_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_watched_pages_user ON fg_watched_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_watched_pages_active ON fg_watched_pages(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS fg_page_changes (
  id SERIAL PRIMARY KEY,
  watched_page_id INTEGER NOT NULL REFERENCES fg_watched_pages(id) ON DELETE CASCADE,
  old_content TEXT,
  new_content TEXT,
  diff_html TEXT,
  detected_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_page_changes_page ON fg_page_changes(watched_page_id);
