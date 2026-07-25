CREATE TABLE IF NOT EXISTS library_search_books (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  reader_hash TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'indexing', 'ready', 'no-text', 'failed')),
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  error_code TEXT,
  indexed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS library_search_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  reader_hash TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  location_json TEXT NOT NULL,
  location_label TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  UNIQUE(book_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_library_search_chunks_book
ON library_search_chunks(book_id, chunk_index);

CREATE VIRTUAL TABLE IF NOT EXISTS library_search_fts USING fts5(
  normalized_text,
  content='library_search_chunks',
  content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS library_search_chunks_ai AFTER INSERT ON library_search_chunks BEGIN
  INSERT INTO library_search_fts(rowid, normalized_text)
  VALUES (new.id, new.normalized_text);
END;

CREATE TRIGGER IF NOT EXISTS library_search_chunks_ad AFTER DELETE ON library_search_chunks BEGIN
  INSERT INTO library_search_fts(library_search_fts, rowid, normalized_text)
  VALUES ('delete', old.id, old.normalized_text);
END;

CREATE TRIGGER IF NOT EXISTS library_search_chunks_au AFTER UPDATE ON library_search_chunks BEGIN
  INSERT INTO library_search_fts(library_search_fts, rowid, normalized_text)
  VALUES ('delete', old.id, old.normalized_text);
  INSERT INTO library_search_fts(rowid, normalized_text)
  VALUES (new.id, new.normalized_text);
END;

CREATE TRIGGER IF NOT EXISTS library_search_books_insert AFTER INSERT ON books BEGIN
  INSERT OR REPLACE INTO library_search_books(book_id, reader_hash, state, updated_at)
  VALUES (new.id, new.file_hash, 'pending', CURRENT_TIMESTAMP);
END;

CREATE TRIGGER IF NOT EXISTS library_search_books_source_update
AFTER UPDATE OF file_hash ON books BEGIN
  DELETE FROM library_search_chunks WHERE book_id = new.id;
  INSERT INTO library_search_books(book_id, reader_hash, state, chunk_count, error_code, indexed_at, updated_at)
  VALUES (new.id, new.file_hash, 'pending', 0, NULL, NULL, CURRENT_TIMESTAMP)
  ON CONFLICT(book_id) DO UPDATE SET
    reader_hash=excluded.reader_hash,
    state='pending',
    chunk_count=0,
    error_code=NULL,
    indexed_at=NULL,
    updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS library_search_books_path_update
AFTER UPDATE OF library_path ON books BEGIN
  DELETE FROM library_search_chunks WHERE book_id = new.id;
  INSERT INTO library_search_books(book_id, reader_hash, state, chunk_count, error_code, indexed_at, updated_at)
  VALUES (new.id, new.file_hash, 'pending', 0, NULL, NULL, CURRENT_TIMESTAMP)
  ON CONFLICT(book_id) DO UPDATE SET
    reader_hash=excluded.reader_hash,
    state='pending',
    chunk_count=0,
    error_code=NULL,
    indexed_at=NULL,
    updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS library_search_derivative_insert
AFTER INSERT ON book_derivatives BEGIN
  DELETE FROM library_search_chunks WHERE book_id = new.book_id;
  INSERT INTO library_search_books(book_id, reader_hash, state, chunk_count, error_code, indexed_at, updated_at)
  VALUES (new.book_id, new.file_hash, 'pending', 0, NULL, NULL, CURRENT_TIMESTAMP)
  ON CONFLICT(book_id) DO UPDATE SET
    reader_hash=excluded.reader_hash,
    state='pending',
    chunk_count=0,
    error_code=NULL,
    indexed_at=NULL,
    updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS library_search_derivative_update
AFTER UPDATE OF file_hash, path ON book_derivatives BEGIN
  DELETE FROM library_search_chunks WHERE book_id = new.book_id;
  UPDATE library_search_books SET
    reader_hash=new.file_hash,
    state='pending',
    chunk_count=0,
    error_code=NULL,
    indexed_at=NULL,
    updated_at=CURRENT_TIMESTAMP
  WHERE book_id = new.book_id;
END;

CREATE TRIGGER IF NOT EXISTS library_search_derivative_delete
AFTER DELETE ON book_derivatives BEGIN
  DELETE FROM library_search_chunks WHERE book_id = old.book_id;
  UPDATE library_search_books SET
    state='pending',
    chunk_count=0,
    error_code=NULL,
    indexed_at=NULL,
    updated_at=CURRENT_TIMESTAMP
  WHERE book_id = old.book_id;
END;

INSERT OR IGNORE INTO library_search_books(book_id, reader_hash, state, updated_at)
SELECT
  books.id,
  COALESCE(book_derivatives.file_hash, books.file_hash),
  'pending',
  CURRENT_TIMESTAMP
FROM books
LEFT JOIN book_derivatives ON book_derivatives.book_id = books.id;

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (8, 'library_search');
