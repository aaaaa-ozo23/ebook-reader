# Local library and in-book search

Ebook Reader searches locally. Neither queries nor extracted book text are sent to a
server.

## Search scopes

- `Ctrl+F` searches the currently open book and keeps its format-specific locator.
- `Ctrl+Shift+F` opens whole-library search from the bookshelf.
- Library results include effective title/author metadata and available book text, grouped by
  book. At most 100 results are returned for one query.

TXT results preserve character offsets. EPUB, MOBI and AZW3 results preserve spine/href identity
and are resolved to an exact EPUB range when the book opens. PDF results preserve page identity
and the occurrence within that page. PDF files without a searchable text layer report that OCR
is unavailable instead of returning invented matches.

## Multilingual matching

Book and library search share compatibility normalization, Unicode-aware case folding,
combining-mark handling and whitespace normalization while retaining a map to the original
UTF-16 or UTF-8 span. This allows highlights, excerpts and saved locators to describe the same
source text for CJK text without spaces, Latin accents and combining forms, German sharp s,
Turkish dotted I, Arabic and other scripts.

EPUB matching operates on DOM text ranges and can cross adjacent inline elements. PDF text items
are reconstructed using their geometry, so adjacent glyph fragments are not separated by
fabricated spaces.

## Local index lifecycle

Schema migration `0008_library_search.sql` stores per-book index status, source chunks and a
SQLite FTS5 trigram index. Import, repair, restore, derivative changes and removal invalidate or
remove the affected cache; effective title and author overrides are queried live. The index is keyed by the effective reader hash and can
be canceled, cleared or rebuilt without changing books, progress, bookmarks or annotations. A
failure or no-text PDF affects only that book.

The index is a machine-local derived cache. It is intentionally excluded from `.erbackup`
archives; restored books are indexed again from their verified local reader files.
