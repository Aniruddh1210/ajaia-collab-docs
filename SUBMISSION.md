# Submission

**Candidate:** Aniruddh Laharia (aniruddh.laharia@gmail.com)
**Assignment:** Ajaia — AI-Native Full Stack Developer

## What's included

| Item | Location |
|---|---|
| Source code | This repository (`backend/`, `frontend/`) |
| README with setup/run instructions | [README.md](./README.md) |
| Architecture note | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| AI workflow note | [AI_WORKFLOW.md](./AI_WORKFLOW.md) |
| Build plan (phased) | [PLAN.md](./PLAN.md) |
| Automated tests | `backend/tests/` (15 pytest cases) |
| Database migration | `backend/migrations/001_init.sql` |
| Deployment config | `backend/render.yaml`, `backend/Dockerfile`, `frontend/vercel.json` |

## Links

- **Live app (GitHub Pages):** https://aniruddh1210.github.io/ajaia-collab-docs/
- **API (Render):** https://ajaia-docs-api-7i56.onrender.com — free tier; first
  request after idle may take ~30–60s to wake up
- **GitHub repo:** https://github.com/Aniruddh1210/ajaia-collab-docs
- **Walkthrough video:** _<add Loom/YouTube URL>_ (also in `VIDEO.txt`)

## Reviewer credentials

Sign in with **email/password** (Google login is wired but not configured on the
live site — see README).

| Email | Password |
|---|---|
| `reviewer1@ajaiadocs.app` | `Reviewer!2026` |
| `reviewer2@ajaiadocs.app` | `Reviewer!2026` |

To test sharing: sign in as `reviewer1`, create/open a document, click **Share**,
share with `reviewer2@ajaiadocs.app`. In an incognito window, sign in as
`reviewer2` and open **Shared with me**.

---

## What works (end to end)

- Google sign-in + email/password auth
- Create, rename, edit, delete documents
- Rich-text editing: bold, italic, underline, H1–H3, bullet/numbered lists,
  blockquote
- Debounced autosave with a save-status indicator; persists across refresh
- File import: `.txt`, `.md`, `.docx` (≤ 5 MB) → new editable document; invalid
  types/sizes rejected with clear messages; uploaded HTML is sanitized
- Sharing by email with **viewer** and **editor** roles; re-sharing updates the
  role; owner can revoke
- Owned vs. **Shared with me** clearly separated on the dashboard; viewers get a
  read-only editor with a "View only" badge
- Access control enforced in the backend (owner-only delete, editor-can-edit,
  viewer-read-only, 404 for non-shared docs) — covered by tests
- Export to Markdown and print/Save-as-PDF
- Error handling: toasts, empty/loading states, no-access page, network-failure
  save retry

## What's partial or incomplete

- **Concurrent editing is last-write-wins.** There's no operational transform or
  CRDT, so two people editing the same document simultaneously can overwrite each
  other. Sharing and permissions are complete; live co-editing is not.
- **Sharing requires the recipient to have signed in once** (their profile must
  exist before they can be found by email). Surfaced clearly in the share dialog.
- **No email notifications** when a document is shared — it simply appears in the
  recipient's dashboard.
- **Frontend has no unit tests** — the meaningful automated tests are on the
  backend, where the access-control logic (the riskiest surface) lives.

## What I'd build next with another 2–4 hours

1. **Real-time presence + soft-locking:** a Supabase Realtime channel per
   document showing who else is viewing, plus a "someone else is editing" warning
   to mitigate last-write-wins before committing to full CRDT.
2. **Document version history:** snapshot on significant saves, with a
   list-and-restore UI (schema already isolates content cleanly).
3. **Comments / suggestion mode** anchored to text ranges.
4. **Playwright end-to-end test** covering the two-account sharing flow through
   the real UI.
5. **Frontend polish:** code-splitting to shrink the JS bundle, and optimistic
   updates on the dashboard.
