# Submission

**Candidate:** Aniruddh Laharia (aniruddh.laharia@gmail.com)
**Assignment:** Ajaia — AI-Native Full Stack Developer

## What's included

| Item | Location |
|---|---|
| Source code | `backend/` (FastAPI) and `frontend/` (React) |
| README with setup/run instructions | [README.md](./README.md) |
| Architecture note | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| AI workflow note | [AI_WORKFLOW.md](./AI_WORKFLOW.md) |
| Build plan (phased) | [PLAN.md](./PLAN.md) |
| Automated tests | `backend/tests/` (24 pytest cases) |
| Database migration | `backend/migrations/001_init.sql` |
| Deployment config | root `render.yaml`, `backend/Dockerfile`, `frontend/vercel.json` |

## Links

- **Live app (GitHub Pages):** https://aniruddh1210.github.io/ajaia-collab-docs/
- **API (Render):** https://ajaia-docs-api-7i56.onrender.com — free tier; the first
  request after idle may take ~30–60s to wake up
- **GitHub repo:** https://github.com/Aniruddh1210/ajaia-collab-docs
- **Walkthrough video:** _<paste your YouTube/Loom URL here>_ (also in `VIDEO.txt`)

## Reviewer credentials

Sign in with **email + password** (the app uses email/password auth).

| Email | Password |
|---|---|
| `reviewer1@ajaiadocs.app` | `Reviewer!2026` |
| `reviewer2@ajaiadocs.app` | `Reviewer!2026` |

**To test sharing / live collaboration:** sign in as `reviewer1`, create/open a
document, click **🔗 Share**, and share with `reviewer2@ajaiadocs.app` as Editor.
In a second browser (or incognito) sign in as `reviewer2`, open it under **Shared
with me**, and type in both windows at once — edits merge live and you'll see each
other's named cursor.

---

## What works (end to end, verified on the live deployment)

- **Auth:** email/password sign-up and sign-in (Supabase Auth); the backend
  verifies the Supabase JWT against the project's public JWKS.
- **Documents:** create, rename, edit, delete; debounced autosave with a
  save-status indicator; persists across refresh.
- **Rich text:** bold, italic, underline, H1–H3, bullet/numbered lists, blockquote
  (TipTap).
- **File import:** upload `.txt`, `.md`, `.docx` (≤ 5 MB) → new editable document;
  invalid types/sizes rejected; uploaded HTML is sanitized server-side.
- **Sharing:** share by email with **viewer** (read-only) or **editor** roles;
  re-sharing updates the role; owner can revoke. Owned vs. **Shared with me** are
  separated on the dashboard; viewers get a read-only editor with a "View only"
  badge.
- **Access control (backend-enforced, tested):** owner-only delete,
  editor-can-edit, viewer read-only, and **404 (not 403)** for non-shared docs so
  existence isn't leaked.
- **Real-time concurrent editing (CRDT):** the editor is backed by **Yjs**, synced
  over the Supabase Realtime WebSocket. Two or more people can edit the **same
  document at the same time** and their edits **merge conflict-free** — not
  last-write-wins. Includes **live named cursors/selections** and **presence
  avatars** of who's in the document.
- **AI writing assistant (Gemini, server-side key):** an **✨ AI** menu with
  selection actions (improve, fix grammar, shorten, lengthen, professional/casual
  tone, custom instruction) and whole-document actions (summarize, continue
  writing). Every result previews with **Accept / Discard / Regenerate** before it
  touches the document. The Gemini key lives only on the backend, so reviewers need
  no key of their own.
- **Export:** download as Markdown, or print / Save-as-PDF.
- **Extras:** light/dark theme toggle; toasts, loading/empty states, no-access
  page, and network-failure save retry.

## What's partial or has a caveat (honest)

- **AI is subject to the Gemini key's free-tier daily quota.** The endpoint works,
  but the key is on a free tier with a low daily limit; heavy or rapid use returns a
  clear "rate limited" message until the quota resets (**midnight Pacific Time**).
  Enabling billing on the Gemini key removes this ceiling. The model is
  `gemini-3.1-flash-lite` (chosen for speed; the older stable flash-lite models are
  blocked on this key).
- **CRDT durability.** The durable store is TipTap JSON in Postgres (autosaved);
  each live session seeds the shared Yjs doc from the last save. The common flows
  are clean; a rare edge case — two people opening a brand-new, never-edited doc
  within the same half-second — can leave a stray blank line that heals on the next
  edit. Persisting the Yjs state server-side would remove this (see below).
- **Sharing requires the recipient to have signed in once** (their profile must
  exist before they can be found by email) — surfaced in the share dialog.
- **No email notifications** on share — the doc simply appears in the recipient's
  dashboard.
- **Automated tests are backend-only** (the access-control logic, the riskiest
  surface); there are no frontend unit tests.

## What I'd build next with another 2–4 hours

1. **Persist the Yjs document state server-side** (a `bytea` column) so the CRDT
   history is durable across sessions — this also unlocks reliable **offline edits**
   and **version history**, and removes the seeding edge case above.
2. **AI quota + UX:** move the key to a billed tier for headroom, and stream AI
   responses token-by-token instead of waiting for the full result.
3. **Comments / suggestion mode** anchored to text ranges.
4. **Playwright end-to-end test** driving the two-account live-collaboration flow
   through the real UI.
5. **Bundle polish:** code-split the editor/Yjs/AI chunks to shrink initial load.
