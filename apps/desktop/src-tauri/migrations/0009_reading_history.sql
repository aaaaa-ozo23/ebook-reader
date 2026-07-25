CREATE TABLE IF NOT EXISTS reading_history_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cleared_at TEXT
);

INSERT OR IGNORE INTO reading_history_preferences (id, enabled, updated_at)
VALUES (1, 1, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_heartbeat_at TEXT NOT NULL,
  active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  final_progress REAL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reading_sessions_book_started
ON reading_sessions(book_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_reading_sessions_started
ON reading_sessions(started_at DESC);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (9, 'reading_history');
