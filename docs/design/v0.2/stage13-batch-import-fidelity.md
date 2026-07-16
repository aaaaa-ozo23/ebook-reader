# Stage 13.6 batch import fidelity

Batch import extends the approved bookshelf language without introducing a separate utility look.
The primary `Import book` action remains the fast single-file path; its split menu adds multi-file
and folder choices. Native file and folder drops reveal a restrained blurred overlay, then always
open the same review surface instead of importing silently.

The review surface uses warm paper, deep ink, teal selection and progress, amber focus, 44 px
targets, and the existing modal-to-mobile-sheet breakpoint. Each candidate keeps a stable status:
valid, duplicate, unsupported, missing, error, imported, repaired, or canceled. Reduced-motion
removes overlay and sheet travel while preserving immediate state feedback.

All entry points share the Rust import service. Folder traversal is capped at 32 levels and 10,000
items, accepts only EPUB/TXT/PDF, rejects links and Windows reparse paths, and verifies canonical
containment. Per-item commits preserve successful imports when another item fails.
