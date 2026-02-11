-- Telegram notification support
-- Run this on production PostgreSQL before deploying

-- Bot config (encrypted token, username)
ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT;
ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS telegram_bot_username TEXT;

-- User Telegram binding
ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE fg_user_settings ADD COLUMN IF NOT EXISTS telegram_notifications BOOLEAN DEFAULT false;

-- Per-feed notification toggle
ALTER TABLE fg_feeds ADD COLUMN IF NOT EXISTS notify_on_update BOOLEAN DEFAULT false;

-- Temporary binding codes
CREATE TABLE IF NOT EXISTS fg_telegram_bindings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES fg_users(id),
  bind_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);
