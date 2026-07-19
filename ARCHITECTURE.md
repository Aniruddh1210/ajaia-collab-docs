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
in-flight changes when the tab closes. The autosave is the durable path;
in-session convergence between concurrent editors is handled by the CRDT below.

## Real-time collaboration (CRDT)

The editor is backed by **Yjs**, a CRDT. Instead of broadcasting document
snapshots (which can't merge two people editing the same spot), each keystroke is
a small conflict-free operation. This is the difference between "collaboration
indicators" and *actual* concurrent editing: two people can type in the same
paragraph at the same time and both edits survive, converging to the same result
on every screen.

- **TipTap `Collaboration` + `CollaborationCaret`** bind the editor to a shared
  `Y.Doc` and render each peer's live caret/selection with their name and colour
  (via Yjs "awareness"); StarterKit's history is disabled so Yjs owns undo/redo.
- **Transport — a custom `SupabaseYProvider`** (`frontend/src/lib/yprovider.ts`):
  a ~90-line provider that ships Yjs document updates and awareness over the
  Supabase Realtime WebSocket (peer-to-peer broadcast, no dedicated sync server).
  On join it requests peers' state and offers its own; both are idempotent CRDT
  merges. This was validated headlessly: two peers inserting at the same position
  concurrently converge to identical text with no lost edits.
- **Persistence boundary.** The durable store stays TipTap JSON in Postgres
  (autosaved by editors). A live session seeds the shared `Y.Doc` from the last
  save via a single elected seeder, and the editor mounts after a brief sync
  window so a late joiner binds to already-synced content. The Yjs state itself is
  not yet persisted server-side — doing so (a `bytea` column) is the next step and
  would add durable history and offline edits.

## AI writing assist

The editor has an **✨ AI** menu backed by Gemini. Three design choices matter:

- **The key is server-side, always.** The browser never sees the Gemini key. The
  frontend calls `POST /api/ai/assist` (JWT-authenticated like everything else)
  and FastAPI (`services/ai.py`) makes the Gemini call. This keeps the secret out
  of the client bundle and means reviewers need no key of their own.
- **A closed set of actions, not free-form prompting.** The client can only pick
  from nine fixed actions (`improve`, `fix`, `shorten`, `lengthen`,
  `professional`, `casual`, `custom`, `summarize`, `continue`). Each maps to a
  server-owned system instruction; the user's text is data, not the prompt. This
  bounds behaviour and cost, and makes the feature easy to reason about. `custom`
  still lets the user supply an instruction, but it's applied to their selection
  under the same guardrails.
- **Nothing changes the document until the user accepts.** Results render in a
  preview with **Accept / Discard / Regenerate**. Selection actions replace the
  original range; `summarize` inserts at the top; `continue` appends. The AI is a
  suggestion engine, never an autonomous editor.

**Model & latency.** Default model is `gemini-3-flash-preview` with
`thinkingLevel: low` — a deliberate tradeoff: full thinking gave noticeably better
prose but ~18s latency, while low thinking lands ~5–8s with quality that's still
strong for editing tasks. The service caps input length, sets a bounded output
budget, and **retries once** on transient upstream errors (5xx, and the empty-body
404s these preview models occasionally return). Rate limits, safety blocks, and
truncation map to clear 4xx/502 responses rather than surfacing raw provider
errors. If no key is configured the endpoint returns 503 and the app is otherwise
unaffected.

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
5. **Stretch features, cheapest-first** — Markdown/PDF export, role-based
   sharing, then real-time collaboration indicators (presence, live cursors,
   live sync) and AI writing assist.

## What I deprioritized and why

- **Server-side persistence of the CRDT state:** conflict-free concurrent editing
  is shipped, but the durable store is TipTap JSON, not the Yjs binary state.
  Persisting the latter (for durable history/offline) was deferred to keep the
  backend schema simple.
- **Comments, folders, search, org roles:** breadth that would dilute depth. The
  assignment explicitly rewards deliberate scope cuts.
