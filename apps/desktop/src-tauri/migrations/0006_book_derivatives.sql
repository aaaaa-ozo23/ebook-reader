CREATE TABLE IF NOT EXISTS book_derivatives (
  book_id TEXT PRIMARY KEY,
  format TEXT NOT NULL CHECK (format = 'epub'),
  path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  converter_id TEXT NOT NULL,
  converter_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_book_derivatives_path
ON book_derivatives(path);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (6, 'book_derivatives');
