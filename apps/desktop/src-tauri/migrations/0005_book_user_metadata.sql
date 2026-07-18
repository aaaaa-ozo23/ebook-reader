CREATE TABLE IF NOT EXISTS book_user_metadata (
  book_id TEXT PRIMARY KEY,
  user_title TEXT,
  title_updated_at TEXT,
  user_author TEXT,
  author_updated_at TEXT,
  user_cover_path TEXT,
  cover_updated_at TEXT,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (5, 'book_user_metadata');
