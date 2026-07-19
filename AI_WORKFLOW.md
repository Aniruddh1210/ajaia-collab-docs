# AI-Native Workflow Note

This project was built AI-natively. Below is an honest account of which tools I
used, where they materially sped me up, what I changed or rejected, and — most
importantly — how I verified the result rather than trusting it.

## Tools used

- **Claude Code** (Anthropic's CLI agent) as the primary pair-programmer:
  scaffolding the FastAPI backend and React frontend, drafting the SQLAlchemy
  models, TipTap wiring, and the pytest permission matrix, and drafting these
  docs.
- **Claude** for planning: turning the open-ended brief into the phased build
  plan in `PLAN.md` before any code was written.

## Where AI materially sped up the work

- **Boilerplate that's tedious but not hard:** the FastAPI router/service/schema
  layering, Pydantic models, the typed `api.ts` fetch wrapper, the auth context,
  and the Tailwind component markup. This is where most of the raw time savings
  were.
- **The permission-matrix tests:** enumerating owner/editor/viewer/stranger ×
  read/edit/delete/share is mechanical; AI generated the full matrix quickly and
  I refined the assertions.
- **Cross-dialect plumbing:** a UUID/JSON type decorator that works on both
  Postgres (real DB) and SQLite (tests) — the kind of thing that's quick to
  generate but slow to remember the exact API for.

## What I changed or rejected

I did not accept AI output uncritically. Concrete examples from this build:

1. **Rejected the Python version the environment offered.** The first dependency
   install targeted Python 3.14, and `pydantic-core`/`greenlet` failed to compile
   (no wheels yet, Rust build errors). Rather than pin ancient versions or hack
   around it, I pinned the project to **Python 3.11**, which the plan already
   specified. Verified with a clean reinstall.

2. **Caught a bug the tests missed by running the real server.** The pytest suite
   passed green — but the tests create tables via a fixture. When I ran the actual
   `uvicorn` server against a fresh database, every authenticated request returned
   **500** because nothing created the tables. I added a startup hook that runs
   `create_all` for local SQLite (Postgres uses the migration SQL). This is the
   clearest example of *why I verify beyond "tests pass."*

3. **Reworked the file-import design.** The initial instinct was to have the
   backend convert uploaded files straight into TipTap JSON. Writing an
   HTML→ProseMirror converter in Python is fragile and easy to get subtly wrong.
   I changed it so the backend returns **sanitized HTML** and the frontend
   converts it with TipTap's *own* parser (`generateJSON`) — guaranteeing the
   output matches the editor schema. Same result, far less risk.

4. **Tightened correctness details AI glossed over:** normalizing emails to
   lowercase everywhere so share-by-email can't miss on case; returning **404
   instead of 403** for inaccessible documents so existence isn't leaked;
   re-queuing a failed autosave payload so a network blip doesn't silently drop
   edits.

5. **Probed the AI provider before committing to it, instead of trusting the
   happy path.** For the Gemini writing assistant I ran the API directly with the
   provided key before writing a line of feature code. That surfaced three things
   the "obvious" implementation would have gotten wrong: (a) the default
   `gemini-2.0-flash` returns **429 with a free-tier limit of 0** on this key — so
   I discovered which models the key can actually reach; (b) Gemini 3 models are
   *thinking* models, and full thinking meant **~18s latency** — unacceptable
   inline, so I settled on `thinkingLevel: low` (~5–8s) as a measured
   quality/latency tradeoff rather than a guess; (c) the preview models
   intermittently return **empty-body 404s**, which I handle with a single retry.
   The `_extract_text` parser also had to skip thought-signature parts that carry
   no text. None of this is visible from the docs — it came from testing the real
   surface first.

## How I verified correctness, UX, and reliability

- **Automated:** 24 pytest cases covering the full access-control matrix
  (owner/editor/viewer/stranger), import validation (type, size, sanitization),
  and the AI endpoint (with the Gemini call mocked at the network boundary so the
  suite runs offline and deterministically), run against the real ASGI app.
- **Live integration smoke test:** started the actual server and exercised
  create → rename → list → import → 415/404 error paths with `curl` and a
  hand-minted JWT — which is exactly what surfaced the missing-tables bug above.
- **Type safety:** the frontend builds clean through `tsc` (strict) + Vite.
- **Manual UX pass:** the two-account sharing flow (owner shares → recipient sees
  it under "Shared with me" → viewer is read-only, editor can edit) is the
  primary thing I walk through by hand, since it's the feature most worth getting
  right.
- **Security-minded review:** I read every line of the auth dependency and
  access-control services myself, because that's where an AI mistake would be
  most costly.

## Takeaway

AI removed the mechanical cost of building — but the judgment calls (RLS vs. a
real backend, 404-vs-403, the import conversion strategy) and the verification
(running the real server, not just the tests) were mine. That's the split I'd
want in a production setting.
