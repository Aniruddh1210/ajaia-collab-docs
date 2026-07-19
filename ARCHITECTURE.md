# Architecture Note

This document explains what I prioritized, the key design decisions, and the
tradeoffs I made under the timebox.

## The one big decision: authorization lives in FastAPI, not in the database

The most consequential architectural choice was **where access control lives**.
Supabase offers Row Level Security (RLS), which would let the frontend talk to
Postgres directly with per-row policies. I deliberately chose **not** to use RLS
and instead route everything through a FastAPI backend that:

1. Verifies the Supabase-issued JWT on every request (stateless — no sessions).
2. Enforces every ownership and sharing rule in Python.
3. Talks to Postgres with privileged credentials.

```
React SPA ──(Authorization: Bearer <supabase JWT>)──► FastAPI ──► Postgres
     │                                                    │
     └──────────── Supabase Auth (login only) ────────────┘
```

**Why this over RLS:**

- **One auditable place for authorization.** All the rules — owner-only delete,
  editor-can-edit, viewer-read-only, 404-not-403 — live in
  `services/documents.py` and `services/sharing.py`. A reviewer can read the
  logic top to bottom instead of reconstructing it from SQL policies.
- **Testable.** The permission matrix is covered by a pytest suite
  (`tests/test_permissions.py`) that exercises the real HTTP layer. RLS is much
  harder to unit-test.
- **It's the assignment's spirit.** The role is full-stack; demonstrating real
  backend design (auth middleware, service layer, validation) is more valuable
  here than leaning on a BaaS to do it invisibly.

**The tradeoff:** more code than a pure-Supabase app, and the backend is a
second thing to deploy. For this scope that's a worthwhile price for clarity and
testability.

## Access-control model

| Relationship | Read | Edit | Delete | Manage shares |
|---|---|---|---|---|
| Owner | ✓ | ✓ | ✓ | ✓ |
| Editor (shared) | ✓ | ✓ | ✗ | ✗ |
| Viewer (shared) | ✓ | ✗ | ✗ | ✗ |
| No relationship | 404 | 404 | 404 | 403 |

**404, not 403, for documents you can't access.** Returning 403 would confirm a
document exists. Returning 404 for both "doesn't exist" and "not shared with
you" avoids leaking existence — a small but real information-disclosure concern.

## Data model

Three tables (`backend/migrations/001_init.sql`):

- `profiles` — mirrors `auth.users`, keyed by the JWT `sub`. Populated lazily:
  the auth dependency upserts a profile on each user's first authenticated
  request. This is what lets us **resolve users by email when sharing** without
  exposing an enumerable user directory.
- `documents` — `owner_id`, `title`, and `content` as **JSONB**.
- `document_shares` — `(document_id, shared_with, role)`, unique per pair so
  re-sharing updates the role instead of duplicating.

**Why store TipTap JSON, not HTML.** The editor's native format is a ProseMirror
JSON document. Persisting that verbatim means formatting and structure round-trip
losslessly, there's no HTML sanitization to get wrong on the way back in, and the
content is queryable if we ever need it. Uploaded files are the one place HTML
appears — and it's sanitized and converted to JSON immediately (see below).

## File import

The backend parses uploads (`services/importer.py`):

- `.docx` → HTML via `mammoth`
- `.md` → HTML via `python-markdown`
- `.txt` → paragraphs
- Output is **sanitized with `bleach`** to the tag subset the editor understands
  (strips scripts, styles, unknown tags), then returned as `{title, html}`.

The **frontend** converts that HTML to TipTap JSON using the editor's own parser
(`@tiptap/html` `generateJSON`) and creates the document. Using TipTap's parser
rather than writing an HTML→ProseMirror converter in Python guarantees the result
matches the editor schema exactly — the most reliable path with the least code.

Validation (type, 5 MB size limit, empty-file) happens server-side so it can't be
bypassed by the client.

## Autosave

Edits debounce for 800ms, then `PATCH` the document. The pending payload and
timer are held in refs to avoid stale-closure bugs, and a failed save re-queues
its payload so the next change retries it. A `beforeunload` handler flushes
in-flight changes when the tab closes. Concurrent edits are last-write-wins — a
deliberate cut (see the real-time note in the README).

## Frontend structure

Standard React SPA: `AuthContext` wraps Supabase auth and exposes the session; a
typed `api.ts` attaches the JWT to every call and normalizes errors into an
`ApiError`; pages are guarded by a `RequireAuth` route wrapper. TipTap provides
the editor; Tailwind provides a clean, Docs-like layout.

## What I prioritized, in order

1. **A working core loop** — sign in, create, edit rich text, autosave, persist.
2. **Correct access control** — the feature most likely to be probed, and the
   one with real security implications. Built with tests first.
3. **File import and sharing UX** — the two other required surfaces.
4. **Polish and error handling** — toasts, empty/loading states, 404 page,
   validation.
5. **One stretch feature** — Markdown/PDF export, because it's cheap and
   demoable.

## What I deprioritized and why

- **Real-time co-editing:** the single biggest effort sink; a convincing version
  needs CRDT/OT and websocket infrastructure that would consume the whole
  timebox and still be fragile. Sharing and permissions deliver most of the
  "collaborative" value.
- **Comments, folders, search, org roles:** breadth that would dilute depth. The
  assignment explicitly rewards deliberate scope cuts.
