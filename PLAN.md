# Ajaia — Collaborative Document Editor: Build Plan

**Assignment:** AI-Native Full Stack Developer take-home (Ajaia LLC)
**Timebox:** 4–6 hours of build time. Phase 1 ≈ 2.5h, Phase 2 ≈ 2.5h, Phase 3 only if time remains (≤1h).
**Candidate:** Aniruddh Laharia (aniruddh.laharia@gmail.com)

This document is a complete, self-contained spec. An engineer (or AI agent) should be able to execute it top-to-bottom without referring back to the original assignment brief.

---

## 1. Product Summary

A lightweight Google-Docs-inspired collaborative editor:

- Sign in with Google.
- Create, rename, edit, delete rich-text documents that autosave and persist.
- Upload `.txt` / `.md` / `.docx` files and turn them into editable documents.
- Share a document with another user by email; shared docs appear in the recipient's dashboard, visually distinct from owned docs.
- Deployed live: React frontend on Vercel, FastAPI backend on Render, Supabase for Postgres + Auth.

**Explicit non-goals (state these in README):** real-time co-editing (CRDT/OT), offline mode, comments/suggestions (unless Phase 3), granular org/team permissions, pixel-perfect Google Docs parity.

---

## 2. Tech Stack (fixed decisions — do not re-litigate)

| Concern | Choice | Rationale |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast setup, no SSR needed for this scope |
| Styling | Tailwind CSS | Speed; clean modern UI quickly |
| Editor | TipTap (StarterKit + Underline + Placeholder extensions) | Bold/italic/underline/headings/lists out of the box; stores clean JSON |
| Backend | **Python 3.11 + FastAPI** | All business logic, access control, and file parsing live here; typed request/response models via Pydantic |
| DB | Supabase Postgres, accessed from FastAPI via SQLAlchemy 2.0 (async) + asyncpg | Managed Postgres, free tier |
| Auth | Supabase Auth with Google OAuth (+ email/password fallback for reviewers). Frontend obtains JWT; FastAPI verifies it on every request | Real Google login with minimal code; backend stays stateless |
| File parsing | Server-side in FastAPI: `mammoth` (docx→HTML), `markdown` (md→HTML), plain-text passthrough | Centralizes validation; demonstrates backend file handling |
| Routing | react-router-dom v6 | `/login`, `/` (dashboard), `/doc/:id` (editor) |
| Tests | **pytest + httpx AsyncClient** (backend: permissions + import) — the required "meaningful automated test"; optional Vitest on frontend if time allows | Sharing/permission logic is the highest-value thing to test |
| Deployment | Vercel (frontend), **Render free tier** (FastAPI via Dockerfile or `uvicorn` start command), hosted Supabase | All free; reviewer-accessible URLs. Note in README: Render free tier cold-starts (~30s on first request) |

**Architecture in one sentence:** the frontend talks *only* to FastAPI (except for login, which goes through Supabase Auth); FastAPI verifies the Supabase JWT, enforces all ownership/sharing rules in code, and talks to Postgres with a privileged connection — so authorization lives in one auditable place: `deps.py` + `services/`.

### Auth flow detail

1. Frontend: `supabase-js` handles Google OAuth / email+password → yields `access_token` (JWT).
2. Every API call sends `Authorization: Bearer <token>`.
3. FastAPI dependency `get_current_user` verifies the JWT (HS256 with `SUPABASE_JWT_SECRET`, check `aud=authenticated` and `exp`), extracts `sub` (user id) and `email`, and upserts a `profiles` row on first sight (replaces DB trigger).
4. No sessions/cookies on the backend; fully stateless.

---

## 3. Data Model (SQL migration — run in Supabase SQL editor; keep in `backend/migrations/001_init.sql`)

RLS is **not** used — the backend connects with the service credentials and enforces access itself. Do not expose the Supabase service key or DB URL to the frontend; frontend only gets the anon key for Auth.

```sql
create table public.profiles (
  id uuid primary key,               -- = auth.users.id (from JWT sub)
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Untitled document',
  content jsonb not null default '{"type":"doc","content":[]}',  -- TipTap JSON
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  shared_with uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('viewer','editor')),
  created_at timestamptz default now(),
  unique (document_id, shared_with)
);

create index on public.documents (owner_id, updated_at desc);
create index on public.document_shares (shared_with);
```

---

## 4. Backend — FastAPI Structure & API Contract

```
backend/
  app/
    main.py            # FastAPI app, CORS (allow Vercel origin + localhost), routers
    config.py          # pydantic-settings: DATABASE_URL, SUPABASE_JWT_SECRET, ALLOWED_ORIGINS
    db.py              # async engine + session dependency
    models.py          # SQLAlchemy models: Profile, Document, DocumentShare
    schemas.py         # Pydantic: DocumentOut (with owner_email, my_role), DocumentCreate,
                       #   DocumentUpdate, ShareCreate, ShareOut
    deps.py            # get_current_user (JWT verify + profile upsert), get_db
    services/
      documents.py     # CRUD + access checks (get_doc_for_user returns doc + role or 403/404)
      sharing.py       # share by email, list shares, revoke
      importer.py      # file -> {title, tiptap_or_html_content}; validates ext + 5 MB limit
    routers/
      documents.py     # /api/documents CRUD
      shares.py        # /api/documents/{id}/shares
      imports.py       # /api/import (multipart upload)
  tests/
    conftest.py        # test app with SQLite (aiosqlite) or a test schema; auth override fixture
    test_permissions.py
    test_importer.py
  migrations/001_init.sql
  requirements.txt     # fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, pydantic-settings,
                       #   python-jose[cryptography] (or pyjwt), mammoth, markdown, python-multipart,
                       #   pytest, pytest-asyncio, httpx, aiosqlite
  Dockerfile           # or Render start command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Endpoints (all under `/api`, all require Bearer token; consistent error JSON `{"detail": ...}`)

| Method & path | Behavior |
|---|---|
| `GET /documents` | Owned + shared docs for current user. Each item: id, title, updated_at, owner_email, `access: "owner" \| "editor" \| "viewer"` |
| `POST /documents` | Create (optional title/content) → 201 |
| `GET /documents/{id}` | Full doc incl. content. 404 if no row **or** no access (don't leak existence) |
| `PATCH /documents/{id}` | Update title and/or content. Owner or editor only; viewer → 403. Bumps `updated_at` |
| `DELETE /documents/{id}` | Owner only → 204 |
| `GET /documents/{id}/shares` | Owner only: list shares with emails/roles |
| `POST /documents/{id}/shares` | Owner only. Body `{email, role}`. 404 "No user found with that email"; 400 if sharing with self; upsert on re-share (updates role) |
| `DELETE /documents/{id}/shares/{share_id}` | Owner only → 204 |
| `POST /import` | Multipart file. Accept `.txt`, `.md`, `.docx`; reject others (415) and >5 MB (413). Parses to HTML, creates a new document owned by caller, returns it |
| `GET /healthz` | Unauthenticated; for Render health check |

**Validation rules:** title ≤ 200 chars (Pydantic); content must be a JSON object (TipTap doc); role ∈ {viewer, editor}; email format checked. Global exception handler so unexpected errors return clean 500 JSON, not stack traces.

**Import note:** parser outputs HTML; the frontend loads a doc created via import by setting TipTap content from HTML (TipTap accepts HTML input and will store JSON on next save). Simplest correct path — document it.

---

## 5. Frontend Structure

```
frontend/src/
  lib/supabase.ts          # Supabase client (auth only)
  lib/api.ts               # fetch wrapper: attaches JWT, base URL from VITE_API_URL,
                           #   typed functions for every endpoint, throws ApiError with detail
  context/AuthContext.tsx  # session state, signInWithGoogle, signInWithPassword, signOut
  components/
    Editor.tsx             # TipTap instance (editable flag by role) + Toolbar
    Toolbar.tsx            # B / I / U / H1 / H2 / bullet / ordered list, active-state highlight
    DocCard.tsx            # title, updated_at, "Shared" badge + owner email when not owned
    ShareDialog.tsx        # email input, role select, current shares list, revoke
    UploadButton.tsx       # file input -> POST /api/import -> navigate to new doc
  pages/
    Login.tsx              # Google button + email/password fallback
    Dashboard.tsx          # "My documents" / "Shared with me" sections, New Doc, Upload
    DocumentPage.tsx       # editable title, editor, save-status, Share (owner), "View only" badge
  App.tsx                  # router + auth guard
```

Autosave: 800ms debounce on content/title change → `PATCH`; "Saving… / Saved / Retry" indicator; flush on unmount/`beforeunload`.

---

## 6. Phases

### Phase 1 — Core MVP (must all work before touching Phase 2)

Goal: sign in → create → edit rich text → autosave → refresh → still there.

1. **Supabase:** create project, run migration SQL, enable Google provider (OAuth client in Google Cloud Console, redirect URLs for localhost + Vercel) and email/password. Seed two reviewer accounts: `reviewer1@ajaia-demo.test` / `reviewer2@ajaia-demo.test` (passwords in README).
2. **Backend skeleton:** FastAPI app, config, CORS, DB engine, models, `get_current_user` JWT verification, `/healthz`. Verify a real frontend token decodes correctly.
3. **Documents CRUD** endpoints (owner-only for now) with Pydantic validation.
4. **Frontend scaffold:** Vite + TS + Tailwind, AuthContext, Login page, route guard.
5. **Dashboard (basic):** list, create → navigate, rename, delete with confirm.
6. **Editor page:** TipTap + full toolbar, editable title, autosave with status indicator.

**Acceptance check:** two browser profiles each log in, create docs, format text (bold/italic/underline/headings/lists), refresh, see only their own docs.

### Phase 2 — Required features, polish, quality (completes every assignment requirement)

1. **Sharing:** shares endpoints + access-role logic in `GET/PATCH` document routes; ShareDialog; dashboard "Shared with me" section; read-only editor for viewers.
2. **File upload:** `/api/import` with mammoth/markdown parsing, size/type limits; UploadButton with progress + error toasts. UI states "Supports .txt, .md, .docx up to 5 MB".
3. **UI polish:** Docs-like layout — top nav (logo, avatar, sign out), centered white "page" editor on gray background, card-grid dashboard, toasts, loading skeletons, empty states, reasonable mobile behavior.
4. **Validation & error handling:** everything in §4 plus frontend 404/no-access page and save-retry on network failure.
5. **Tests (pytest — the highest-value deliverable to demo engineering quality):**
   - `test_permissions.py`: owner can read/update/delete; non-shared user gets 404; viewer can read but PATCH → 403; editor can PATCH but DELETE → 403; share-by-unknown-email → 404.
   - `test_importer.py`: md/txt produce expected HTML; `.exe` rejected 415; oversize rejected 413.
6. **Deploy:** Render (backend, env vars: `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `ALLOWED_ORIGINS`) + Vercel (frontend, `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; SPA rewrite). Update Supabase redirect URLs. Verify Google login + sharing on live URLs.
7. **Docs:** README, ARCHITECTURE.md, AI_WORKFLOW.md, SUBMISSION.md (see §8).

**Acceptance check:** on the live URL, reviewer1 shares a doc with reviewer2 as editor; reviewer2 sees it under "Shared with me" and edits it; as viewer, gets read-only. A `.docx` upload becomes an editable doc.

### Phase 3 — Optional stretch (only if core is deployed and docs are done; pick ONE)

1. **Export to Markdown/PDF** (cheapest, most demoable): TipTap HTML → turndown for `.md` download; PDF via `window.print()` + print CSS.
2. **Role-based permission polish:** role switching in ShareDialog, clean read-only affordances (mostly built in Phase 2 — finishing it counts).
3. **Version history (lite):** `document_versions` table, snapshot every ~2 min of active editing via backend, list + restore endpoints + UI.
4. **Presence indicators:** Supabase Realtime channel per doc, "Also viewing: <avatar>" (indicators only, no co-editing merge).

---

## 7. Deliverables Checklist (all mandatory)

- [ ] Source code (Google Drive folder + ideally a GitHub link)
- [ ] `README.md` — local setup for backend **and** frontend, env vars, supported file types, test accounts
- [ ] `ARCHITECTURE.md` — what was prioritized and why
- [ ] `AI_WORKFLOW.md` — AI tools note
- [ ] `SUBMISSION.md` — what's included / working / incomplete / next 2–4 hours
- [ ] Live product URL (Vercel) — note Render cold-start caveat
- [ ] Text file with walkthrough video URL (3–5 min, unlisted Loom/YouTube)
- [ ] Screenshots or demo GIF
- [ ] Reviewer credentials: the two seeded accounts, so sharing is testable without Google login

## 8. Written Deliverable Templates

### README.md must cover
Overview (1 para) · live URL + cold-start note · test credentials (both reviewers) · features · supported upload types & limits · local setup: backend (`python -m venv`, `pip install -r requirements.txt`, `.env` values, `uvicorn app.main:app --reload`) and frontend (`npm i`, `.env.local`, `npm run dev`) · Supabase setup (migration SQL + auth providers) · `pytest` · deliberate scope cuts.

### ARCHITECTURE.md talking points
- Three-tier: React SPA → FastAPI → Supabase Postgres; Supabase Auth issues JWTs, FastAPI verifies them statelessly — **all authorization lives in one auditable backend layer** (chosen over Supabase RLS so business logic is explicit, testable with pytest, and demonstrates backend design).
- TipTap JSON as storage format — preserves structure losslessly, avoids HTML-sanitization pitfalls, queryable.
- 404-instead-of-403 for inaccessible docs — doesn't leak document existence.
- Server-side file parsing — validation and limits enforced centrally, not trusting the client.
- Deprioritized and why: real-time co-editing (highest complexity, lowest demo value in the timebox), comments, folders/search, org-level permissions.

### AI_WORKFLOW.md talking points (be specific and honest)
- Tools used: Claude (Claude Code) for planning, FastAPI scaffolding, permission-matrix tests, docs drafting; list any others actually used.
- Where AI materially sped things up: endpoint + Pydantic boilerplate, TipTap toolbar wiring, JWT verification dependency, test scaffolding.
- What was changed/rejected: **record real examples during the build — do not fabricate.** (Likely candidates: tightening an over-permissive access check, fixing an autosave race where a stale debounce fired after navigation, correcting JWT audience validation.)
- Verification: pytest permission matrix, manual two-account walkthrough of every sharing permutation on the live deployment, line-by-line review of AI-written auth and SQL code.

### SUBMISSION.md structure
Contents list → live URL + credentials → video URL → **What works** → **What's partial/incomplete** (honest) → **Next 2–4 hours** (e.g. version history, comments, e2e Playwright test, websocket presence).

### Walkthrough video script (3–5 min)
1. 0:00 — Google login; dashboard tour (owned vs shared sections). *(30s)*
2. 0:30 — Create doc, rename, demo every formatting control, refresh to prove persistence. *(60s)*
3. 1:30 — Upload `.docx` → editable doc; mention supported types/limits. *(30s)*
4. 2:00 — Share with reviewer2 (editor), switch to incognito as reviewer2, edit; flip to viewer, show read-only. *(60s)*
5. 3:00 — Architecture in 30s: React+TipTap → FastAPI (all authz + parsing) → Supabase Postgres/Auth. *(30s)*
6. 3:30 — Deliberate cuts + next steps; AI workflow: where it helped, what I overrode, how I verified. *(60s)*

---

## 9. Execution Order & Time Budget

| # | Task | Est. |
|---|---|---|
| 1 | Supabase project + migration + Google OAuth + seeded reviewers | 30m |
| 2 | FastAPI skeleton: config, CORS, DB, JWT auth dep, healthz | 30m |
| 3 | Documents CRUD API + frontend scaffold/auth/guard | 45m |
| 4 | Dashboard + editor + toolbar + autosave | 60m |
| 5 | Sharing (API + dialog + shared-with-me + read-only) | 45m |
| 6 | File import endpoint + upload UI | 30m |
| 7 | UI polish, validation, error/empty/loading states | 40m |
| 8 | pytest suite | 30m |
| 9 | Deploy (Render + Vercel) + live verification | 30m |
| 10 | README / ARCHITECTURE / AI_WORKFLOW / SUBMISSION + screenshots | 40m |
| 11 | Record video, assemble Drive folder | 30m |
| — | Phase 3 stretch (optional) | ≤60m |

**Rule:** if running behind at step 5, cut UI polish before cutting sharing; cut Phase 3 entirely before cutting any test/deploy/doc deliverable. A deployed, documented app with honest scope notes beats a feature-rich local-only one.
