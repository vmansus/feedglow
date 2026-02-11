-- Migration 007: Article Highlights
-- Feature: Allow users to highlight text in articles and add notes

CREATE TABLE IF NOT EXISTS fg_highlights (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES fg_users(id),
  entry_id INTEGER NOT NULL REFERENCES fg_entries(id),
  text TEXT NOT NULL,
  note TEXT,
  color VARCHAR(20) DEFAULT 'yellow',
  position_start INTEGER,
  position_end INTEGER,
  xpath TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_highlights_user ON fg_highlights(user_id);
CREATE INDEX IF NOT EXISTS idx_highlights_entry ON fg_highlights(user_id, entry_id);
