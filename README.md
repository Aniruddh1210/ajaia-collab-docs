# Ajaia Docs — Collaborative Document Editor

A lightweight, Google-Docs-inspired collaborative editor built for the Ajaia
AI-Native Full Stack Developer assignment. Create rich-text documents, import
files, and share them with other users — with real authentication and
persistence.

- **Frontend:** React + Vite + TypeScript + Tailwind, TipTap editor
- **Backend:** Python + FastAPI (all authorization and file parsing)
- **Data/Auth:** Supabase (Postgres + email/password auth)

> **Live demo:** https://aniruddh1210.github.io/ajaia-collab-docs/
> **API:** https://ajaia-docs-api-7i56.onrender.com (Render free tier — the first
> request after idle may take ~30–60s to wake up)

---

## What it does

- **Email/password sign-in** (Supabase Auth); two reviewer accounts are seeded.
- **Create, rename, edit, and delete** documents in the browser
- **Rich text:** bold, italic, underline, H1–H3, bullet/numbered lists,
  blockquotes — via a TipTap toolbar
- **Autosave** with a debounced save indicator; documents persist across refresh
- **File import:** upload `.txt`, `.md`, or `.docx` (up to 5 MB) to create a new
  editable document
- **Sharing:** share a document with another user by email as **viewer**
  (read-only) or **editor** (can edit); owned vs. shared documents are visually
  separated on the dashboard
- **Real-time concurrent editing (CRDT):** the editor is backed by **Yjs**, synced
  over the Supabase Realtime WebSocket, so two or more people can edit the same
  document simultaneously and their changes **merge conflict-free** — plus live
  named cursors and presence avatars of who's in the document
- **AI writing assist (Gemini):** an **✨ AI** menu in the editor toolbar. Over a
  text selection: *Improve writing, Fix spelling & grammar, Make shorter/longer,
  Professional/Casual tone,* or a free-form *Custom instruction*. Over the whole
  document: *Summarize* (inserts a summary at the top) and *Continue writing*
  (appends). Every result opens a preview with **Accept / Discard / Regenerate**,
  so nothing changes the document until you approve it. The Gemini key lives only
  on the backend, so reviewers need no key of their own.
- **Export:** download any document as Markdown, or print/save as PDF

### Supported upload types

`.txt`, `.md` / `.markdown`, `.docx` — up to **5 MB**. Other types are rejected
with a clear message. Parsed content is sanitized to the subset of formatting
the editor supports.

---

## Test accounts (for reviewers)

Two seeded accounts let you test the sharing and live-collaboration flows:

| Email | Password |
|---|---|
| `reviewer1@ajaiadocs.app` | `Reviewer!2026` |
| `reviewer2@ajaiadocs.app` | `Reviewer!2026` |

Sign in as `reviewer1` (email/password), create a document, click **Share**, and
share it with `reviewer2@ajaiadocs.app`. Sign in as `reviewer2` (incognito
window) to see it under **Shared with me**.

> Note: you can only share with a user who has signed in at least once (their
> profile must exist). Both seeded accounts have already signed in.

---

## Architecture at a glance

```
React SPA  ──(JWT Bearer)──►  FastAPI  ──►  Supabase Postgres
   │                             │
   └── Supabase Auth (login) ────┘  verifies the JWT, enforces ALL
                                    ownership/sharing rules in code
```

The frontend talks to FastAPI for everything except login. FastAPI verifies the
Supabase-issued JWT on every request and enforces all access control in one
place (no Supabase RLS). See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full
rationale and tradeoffs.

---

## Local setup

### Prerequisites

- Python 3.11
- Node.js 18+
- A Supabase project (free tier)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run [`backend/migrations/001_init.sql`](./backend/migrations/001_init.sql).
3. **Auth → Providers:** enable **Email** (email/password sign-in).
4. Collect these values:
   - **Project URL** and **anon key** — Project Settings → API
   - **JWT secret** — Project Settings → API → JWT Settings
   - **Database URL** — Project Settings → Database → Connection string (URI)

### 2. Backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env       # then fill in the values
uvicorn app.main:app --reload
```

`.env`:

```
DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
SUPABASE_JWT_SECRET=your-jwt-secret
ALLOWED_ORIGINS=http://localhost:5173

# Optional — enables the AI writing assistant. Get a key from Google AI Studio
# (https://aistudio.google.com/apikey). Leave it unset to disable AI features;
# the rest of the app works unchanged and the ✨ AI menu simply returns a
# "not configured" message.
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3-flash-preview
```

> To run the backend without Supabase (SQLite, tables auto-created), just leave
> `DATABASE_URL` unset — it defaults to a local SQLite file. Auth still requires
> a valid Supabase JWT secret matching your frontend project.

Run the tests:

```bash
pytest
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

`.env.local`:

```
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:8000
```

Open http://localhost:5173.


## Deployment

The live deployment uses **Render** (backend) + **GitHub Pages** (frontend):

- **Backend (Render):** Docker web service from `backend/` (Dockerfile), root
  directory `backend`. Env vars: `DATABASE_URL` (Supabase transaction-pooler URL
  with the `postgresql+asyncpg://` scheme), `SUPABASE_URL`, `ALLOWED_ORIGINS`
  (the frontend origin), and `GEMINI_API_KEY` (for AI features). The root
  [`render.yaml`](./render.yaml) is a ready blueprint.
- **Frontend (GitHub Pages):** built with `VITE_BASE=/<repo>/`,
  `VITE_API_URL` (Render URL), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
  published to the `gh-pages` branch. A `404.html` copy of `index.html` handles
  SPA deep links. (A Vercel path also works — `frontend/vercel.json` is included.)

> The backend verifies Supabase's ES256 access tokens against the project's
> public JWKS (`SUPABASE_URL/auth/v1/.well-known/jwks.json`) — no shared secret
> needed. It falls back to an HS256 shared secret only when `SUPABASE_URL` is
> unset (used by the offline test suite).

---

## Deliberate scope cuts

To stay within the timebox, the following were intentionally **not** built (see
[SUBMISSION.md](./SUBMISSION.md) for what's next):

- Server-side persistence of the CRDT (Yjs) state — concurrent editing works
  live, but the durable store is TipTap JSON; persisting the Yjs doc would unlock
  version history and offline edits (see [SUBMISSION.md](./SUBMISSION.md)).
- Comments / suggestion mode
- Folders, search, and document organization
- Org/team-level permissions beyond per-document viewer/editor

## Repository layout

```
backend/    FastAPI app, tests, migration SQL, Dockerfile
frontend/   React + Vite SPA
PLAN.md     The phased build plan this project was executed from
```
