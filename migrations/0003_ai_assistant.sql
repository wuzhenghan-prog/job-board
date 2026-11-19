ALTER TABLE ai_settings ADD COLUMN assistant_daily_limit INTEGER NOT NULL DEFAULT 50;

CREATE TABLE assistant_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  document_ids TEXT NOT NULL DEFAULT '[]',
  web_search_enabled INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE assistant_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('streaming', 'completed', 'stopped', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 1,
  replaces_message_id TEXT REFERENCES assistant_messages(id) ON DELETE SET NULL,
  request_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE UNIQUE INDEX idx_assistant_messages_request
  ON assistant_messages(request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE assistant_message_citations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES assistant_messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('opportunity', 'document', 'web')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE assistant_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('resume', 'job', 'project', 'interview', 'other')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  storage_key TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE assistant_chunks (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('opportunity', 'document')),
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE assistant_chunks_fts USING fts5(
  content,
  content='assistant_chunks',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER assistant_chunks_ai AFTER INSERT ON assistant_chunks BEGIN
  INSERT INTO assistant_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER assistant_chunks_ad AFTER DELETE ON assistant_chunks BEGIN
  INSERT INTO assistant_chunks_fts(assistant_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER assistant_chunks_au AFTER UPDATE ON assistant_chunks BEGIN
  INSERT INTO assistant_chunks_fts(assistant_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO assistant_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TABLE assistant_usage (
  day TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_assistant_conversations_updated ON assistant_conversations(updated_at DESC);
CREATE INDEX idx_assistant_messages_conversation ON assistant_messages(conversation_id, created_at);
CREATE INDEX idx_assistant_citations_message ON assistant_message_citations(message_id, sort_order);
CREATE INDEX idx_assistant_documents_enabled ON assistant_documents(enabled, updated_at DESC);
CREATE INDEX idx_assistant_chunks_source ON assistant_chunks(source_type, source_id);
