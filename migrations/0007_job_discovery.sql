CREATE TABLE job_discovery_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  target_titles TEXT NOT NULL DEFAULT '[]',
  category_ids TEXT NOT NULL DEFAULT '[]',
  locations TEXT NOT NULL DEFAULT '[]',
  remote_allowed INTEGER NOT NULL DEFAULT 0,
  salary_floor_k INTEGER,
  experience_level TEXT NOT NULL DEFAULT '',
  include_keywords TEXT NOT NULL DEFAULT '[]',
  exclude_keywords TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE job_discovery_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  candidate_count INTEGER NOT NULL DEFAULT 0,
  recommendation_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE job_recommendations (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES job_discovery_runs(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  source_domain TEXT NOT NULL,
  source_title TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  salary TEXT,
  salary_min_k REAL,
  salary_max_k REAL,
  salary_known INTEGER NOT NULL DEFAULT 0,
  category_name TEXT,
  responsibilities TEXT NOT NULL DEFAULT '[]',
  requirements TEXT NOT NULL DEFAULT '[]',
  hard_abilities TEXT NOT NULL DEFAULT '[]',
  general_abilities TEXT NOT NULL DEFAULT '[]',
  experience_requirements TEXT NOT NULL DEFAULT '[]',
  match_level TEXT NOT NULL CHECK (match_level IN ('high', 'medium', 'low')),
  match_score INTEGER NOT NULL DEFAULT 0,
  match_strengths TEXT NOT NULL DEFAULT '[]',
  match_gaps TEXT NOT NULL DEFAULT '[]',
  match_evidence TEXT NOT NULL DEFAULT '[]',
  missing_fields TEXT NOT NULL DEFAULT '[]',
  source_posted_at TEXT,
  source_valid_through TEXT,
  state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'saved', 'ignored')),
  saved_opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  discovered_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_discovery_runs_created ON job_discovery_runs(created_at DESC);
CREATE INDEX idx_recommendations_state_discovered
  ON job_recommendations(state, discovered_at DESC);
CREATE INDEX idx_recommendations_expires
  ON job_recommendations(expires_at);
