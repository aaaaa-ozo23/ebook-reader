CREATE TABLE IF NOT EXISTS custom_fonts (
  id TEXT PRIMARY KEY,
  family_name TEXT NOT NULL,
  style_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_hash TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
  family_alias TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_fonts_family
ON custom_fonts(family_name COLLATE NOCASE, style_name COLLATE NOCASE);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (7, 'custom_fonts');
