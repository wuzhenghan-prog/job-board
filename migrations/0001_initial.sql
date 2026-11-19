PRAGMA foreign_keys = ON;

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  company TEXT,
  title TEXT NOT NULL,
  location TEXT,
  category_id TEXT NOT NULL REFERENCES categories(id),
  stage TEXT NOT NULL CHECK (
    stage IN ('to_evaluate', 'preparing', 'submitted', 'interviewing', 'offer', 'closed')
  ),
  responsibilities TEXT NOT NULL DEFAULT '[]',
  requirements TEXT NOT NULL DEFAULT '[]',
  hard_abilities TEXT NOT NULL DEFAULT '[]',
  general_abilities TEXT NOT NULL DEFAULT '[]',
  experience_requirements TEXT NOT NULL DEFAULT '[]',
  match_level TEXT CHECK (match_level IN ('high', 'medium', 'low')),
  match_strengths TEXT NOT NULL DEFAULT '[]',
  match_gaps TEXT NOT NULL DEFAULT '[]',
  match_evidence TEXT NOT NULL DEFAULT '[]',
  deadline TEXT,
  source_url TEXT,
  notes TEXT,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE opportunity_images (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE extraction_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'processing', 'awaiting_review', 'confirmed', 'failed')
  ),
  category_name TEXT NOT NULL,
  result TEXT,
  error TEXT,
  image_count INTEGER NOT NULL,
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE extraction_images (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE interview_rounds (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  round_type TEXT NOT NULL,
  scheduled_at TEXT,
  result TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE status_history (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  previous_stage TEXT,
  new_stage TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  summary TEXT NOT NULL,
  skills TEXT NOT NULL DEFAULT '[]',
  experiences TEXT NOT NULL DEFAULT '[]',
  strengths TEXT NOT NULL DEFAULT '[]',
  gaps TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 30,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_usage (
  day TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE access_code (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE login_attempts (
  source_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO categories (id, name, sort_order, created_at, updated_at)
VALUES
  ('research', '研发', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('product', '产品', 2, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('project', '项目管理', 3, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('operations', '运营', 4, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('data', '数据', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('design', '设计', 6, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('sales', '销售', 7, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('other', '其他', 8, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

CREATE INDEX idx_opportunities_category ON opportunities(category_id);
CREATE INDEX idx_opportunities_stage ON opportunities(stage);
CREATE INDEX idx_opportunities_updated ON opportunities(updated_at);
CREATE INDEX idx_opportunity_images_opportunity ON opportunity_images(opportunity_id);
CREATE INDEX idx_extraction_images_job ON extraction_images(job_id);
CREATE INDEX idx_interview_rounds_opportunity ON interview_rounds(opportunity_id);
CREATE INDEX idx_status_history_opportunity ON status_history(opportunity_id);
