/**
 * PostgreSQL Database Client
 */

import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || 
      'postgres://feedglow:feedglow_prod_2026@localhost:5432/feedglow';
    
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
      base_url TEXT,
      model VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
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

  console.log('[DB] Migrations complete');
}
