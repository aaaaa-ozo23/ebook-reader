CREATE TABLE IF NOT EXISTS book_cover_state (
  book_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'fallback')),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reader_cache (
  book_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (book_id, cache_key),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (3, 'reader_experience');
