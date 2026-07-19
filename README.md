# Ajaia Docs — Collaborative Document Editor

A lightweight, Google-Docs-inspired collaborative editor built for the Ajaia
AI-Native Full Stack Developer assignment. Create rich-text documents, import
files, and share them with other users — with real authentication and
persistence.

- **Frontend:** React + Vite + TypeScript + Tailwind, TipTap editor
- **Backend:** Python + FastAPI (all authorization and file parsing)
- **Data/Auth:** Supabase (Postgres + Google/email auth)

> **Live demo:** _<add Vercel URL here>_
> **API:** _<add Render URL here>_ (free tier — the first request after idle may
> take ~30–60s to wake up)

---

## What it does

- **Google sign-in** (plus email/password as a fallback for reviewers)
- **Create, rename, edit, and delete** documents in the browser
- **Rich text:** bold, italic, underline, H1–H3, bullet/numbered lists,
  blockquotes — via a TipTap toolbar
- **Autosave** with a debounced save indicator; documents persist across refresh
- **File import:** upload `.txt`, `.md`, or `.docx` (up to 5 MB) to create a new
  editable document
- **Sharing:** share a document with another user by email as **viewer**
  (read-only) or **editor** (can edit); owned vs. shared documents are visually
  separated on the dashboard
- **Export:** download any document as Markdown, or print/save as PDF

### Supported upload types

`.txt`, `.md` / `.markdown`, `.docx` — up to **5 MB**. Other types are rejected
with a clear message. Parsed content is sanitized to the subset of formatting
the editor supports.

---

## Test accounts (for reviewers)

Two seeded accounts let you test the sharing flow without Google login:

| Email | Password |
|---|---|
| `reviewer1@ajaia-demo.test` | _<add password>_ |
| `reviewer2@ajaia-demo.test` | _<add password>_ |

Sign in as `reviewer1`, create a document, click **Share**, and share it with
`reviewer2@ajaia-demo.test`. Sign in as `reviewer2` (incognito window) to see it
under **Shared with me**.

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
3. **Auth → Providers:** enable **Email** and **Google** (see
   [Google OAuth setup](#google-oauth-setup) below).
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

---

## Google OAuth setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create an OAuth
   2.0 Client ID (Web application).
2. Add authorized redirect URI:
   `https://PROJECT.supabase.co/auth/v1/callback`.
3. In Supabase **Auth → Providers → Google**, paste the client ID and secret.
4. In Supabase **Auth → URL Configuration**, add your site URLs
   (`http://localhost:5173` and your Vercel URL) to the redirect allow-list.

---

## Deployment

- **Backend (Render):** deploy `backend/` as a Docker web service (see
  [`backend/render.yaml`](./backend/render.yaml)). Set `DATABASE_URL`,
  `SUPABASE_JWT_SECRET`, and `ALLOWED_ORIGINS` (your Vercel URL).
- **Frontend (Vercel):** import the repo, set the project root to `frontend/`,
  and add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL`
  (your Render URL). `vercel.json` handles SPA routing.
- Update the Supabase redirect allow-list with the deployed frontend URL.

---

## Deliberate scope cuts

To stay within the timebox, the following were intentionally **not** built (see
[SUBMISSION.md](./SUBMISSION.md) for what's next):

- Real-time collaborative editing (CRDT/OT) — highest complexity, lowest demo
  value in the timebox. Sharing + access control is fully working; concurrent
  edits are last-write-wins.
- Comments / suggestion mode
- Folders, search, and document organization
- Org/team-level permissions beyond per-document viewer/editor

## Repository layout

```
backend/    FastAPI app, tests, migration SQL, Dockerfile
frontend/   React + Vite SPA
PLAN.md     The phased build plan this project was executed from
```
