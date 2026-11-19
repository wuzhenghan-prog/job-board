CREATE TABLE IF NOT EXISTS login_attempts (
  source_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);
