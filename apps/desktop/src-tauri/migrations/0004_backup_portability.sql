ALTER TABLE bookmarks ADD COLUMN updated_at TEXT;

UPDATE bookmarks
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE TRIGGER IF NOT EXISTS bookmarks_updated_at_required_insert
BEFORE INSERT ON bookmarks
FOR EACH ROW
WHEN NEW.updated_at IS NULL
BEGIN
    SELECT RAISE(ABORT, 'bookmarks.updated_at is required');
END;

CREATE TRIGGER IF NOT EXISTS bookmarks_updated_at_required_update
BEFORE UPDATE ON bookmarks
FOR EACH ROW
WHEN NEW.updated_at IS NULL
BEGIN
    SELECT RAISE(ABORT, 'bookmarks.updated_at is required');
END;
