CREATE UNIQUE INDEX IF NOT EXISTS idx_books_file_hash_unique
ON books (file_hash);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (2, 'unique_books_file_hash');
