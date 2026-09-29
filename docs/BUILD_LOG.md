# Build Log

One entry per working session, written before closing the laptop.

This exists because of the two-machine problem. When you sit down at the other
machine days later, this is what tells you where you were.

**Format**

```
## YYYY-MM-DD | machine | duration

- What I did
- What is broken or half-finished right now
- The next single action when I sit down again
- Anything decided that belongs in the Notion Decision Log
```

The third line is the important one. Always write it, even when the session
ended badly. Especially then.

---

## Entries

## 2026-09-08 | office | ~1.5h

- Scaffolded `backend/`: Django 6.1.1 + DRF 3.18.1 + django-environ + psycopg 3
  (binary) in a venv, all installed clean on Python 3.14.4 with no
  compatibility issues.
- `config/settings.py` now reads `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, and
  `DATABASE_URL` from the repo-root `.env` via django-environ — nothing
  hardcoded.
- Built the `core` app: `Country` (name, code — uppercased on save) and
  `Contact` (every field from the CLAUDE.md spec: type selection, self-FK
  `parent` with `on_delete=PROTECT`, `clean()` validation for
  parent-must-be-company / no self-parent / no cycles, `display_name`
  property implementing the company/person-with-parent/person-without rule).
- Migrated against Neon — `core_contact` and `core_country` confirmed to
  exist via a direct `information_schema.tables` query, not just Django's
  say-so.
- Registered both models in Django Admin (list displays, filters, search,
  autocomplete on `parent`/`country` per the spec's list/search defaults).
- Added a `seed` management command: 20 countries, 10 contacts, including
  Acme Corp with two child people and Globex with one, plus one archived
  company (`active=False`) to exercise that path.
- `git init`'d the repo, added `origin` → `abuMuhammad101/Clicker` (this
  folder is now that repo, per Hassan's confirmation).
- Dev server runs clean (`manage.py check` passes 0 issues); confirmed the
  admin login page renders at `localhost:8000/admin/`.

- Half-finished: no superuser created yet — that's an interactive step
  (setting a password) left to Hassan on purpose, not automated. Admin is
  otherwise fully wired and ready the moment one exists.

- **Next single action:** run `cd backend && .venv\Scripts\python.exe manage.py createsuperuser`,
  log into `/admin/`, and eyeball the seeded Contacts/Countries — confirm the
  parent/child hierarchy and archived company look right before touching
  anything else. After that, Phase 1 step 3 (schema endpoint) is next.

- Decisions for the Notion Decision Log: none beyond what CLAUDE.md already
  specifies — `parent`/`country` FKs use `PROTECT`, matching the "restricted
  when referenced" rule; model-level cycle/parent-type validation lives in
  `Contact.clean()`, which Django Admin calls automatically but a future DRF
  serializer will need to call explicitly (`full_clean()` or a serializer
  `validate()`) — worth remembering when step 3 builds the schema endpoint.

## 2026-09-08 | office | duration unknown

_Backfilled 2026-09-29 from commit `33d36f8` — this entry was never written
at the time. Reconstructed from the commit message and the code as it
stands; no memory of the session itself, so no duration._

- Built Phase 1 step 3: `/api/schema/<app_label>/<model_name>/`, a generic
  endpoint that turns any registered Django model into the JSON shape the
  frontend will consume. Base field type, required-ness, choices, and FK
  target are all introspected straight from Django's own field classes —
  the engine (`backend/schema/engine.py`) has no per-model branching.
- The one per-module hook: an optional `Schema` inner class on the model,
  used for the handful of things Django can't infer — `field_types`
  (phone vs. plain text, since Django only sees `CharField`),
  `visible_when` (conditional visibility — job_title/tax_id/website
  switching on Contact.type), `domains` (restricts the `parent` picker to
  companies), and list-view defaults (columns, sort, default filter, search
  fields).
- Fixed two label bugs the engine surfaced by running it for real: `tax_id`
  rendered as "Tax Id" (`str.title()` mangling an intentional acronym) and
  `street2` as "Street2". Switched label generation to sentence case and
  added an explicit `verbose_name` for `street2`.
- Verified against both `Contact` and `Country`, plus a nonexistent model
  name to confirm a clean 404 instead of a crash.

- Half-finished: nothing broken, but the engine has known gaps — see the
  two open items logged in today's (2026-09-29) entry below. They were
  decided as trade-offs during this session but never written down until
  now.

- **Next single action (historical):** Phase 1 step 4 — React app fetching
  this schema. Already done as of the following commit.

## 2026-09-08 | office | duration unknown

_Backfilled 2026-09-29 from commit `e00b62e` — same gap as above._

- Built Phase 1 step 4: Vite + React + TypeScript scaffold in `frontend/`,
  stripped of the default template's demo content (spinning logos, counter
  button, its own CSS variables that collided with `tokens.css`).
- `types/schema.ts` mirrors the backend engine's JSON shape; `lib/api.ts` is
  a small typed fetch client. A `schema-viewer` feature fetches and renders
  the live schema for both Contact and Country as a table — proof the
  connection works end to end, not a form/list renderer (that's steps 5-6).
- `vite.config.ts` points `envDir` at the repo-root `.env` (one shared
  config file, not duplicated per app) and allows serving `tokens.css` from
  outside the `frontend/` root — **this is the arrangement flagged as an
  open item today**, see below.
- Backend: added `django-cors-headers` so the Vite dev server
  (`localhost:5173`) can call the API — explicit origin allow-list, not
  allow-all.
- Loaded the actual IBM Plex Sans/Mono font files via Google Fonts —
  `tokens.css` declared the typeface but nothing was serving it, so it was
  silently falling back to system fonts. Verified via `document.fonts` that
  both families actually load, not just resolve in CSS.

- Half-finished: same engine gaps as above (field grouping, `help_text`),
  plus the `tokens.css`-outside-`frontend/`-root arrangement, which works
  for local dev but not for a host that treats `frontend/` as its deploy
  root.

- **Next single action (historical):** Phase 1 step 5 — field components
  for the registry types Contacts needs. Not started as of this backfill;
  see today's entry.

- Decisions for the Notion Decision Log: `tokens.css` stays at the repo
  root as the single source of truth rather than being copied into
  `frontend/` — flagged today as needing a build-command fix before deploy,
  not a redesign.

## 2026-09-29 | office | orientation session

- Away for a few weeks; this session was re-orientation and environment
  verification only, no new feature work, per instruction.
- Read CLAUDE.md, this log, and the last three commits. Confirmed actual
  state matches the commit history: Phase 1 steps 1-4 are done (scaffold,
  Admin, schema endpoint, React fetching it). Steps 5-7 (field components,
  form/list renderer, Product model) are not started.
- Backfilled the two entries above — the schema-endpoint and
  frontend-scaffold sessions existed only as commits until now.
- Verified the environment from scratch rather than assuming weeks-old
  state was still good:
  - Python 3.14.4, Node v24.18.0, npm 11.16.0 — unchanged.
  - `.env` still has all five keys populated (didn't print values).
  - `backend/.venv` and `frontend/node_modules` both present and healthy —
    `pip check` clean, `npm ls` clean, no drift.
  - Neon: cold-started as expected (scaled to zero after weeks idle) — the
    first query was slow, not an error. `showmigrations core` confirms all
    three migrations are applied on the actual database, not just recorded
    locally.
  - Both dev servers started and the full chain was verified live: schema
    endpoint → CORS → frontend fetch → rendered table, no console errors.
- **Port conflict, not a bug:** port 8000 was held by a different Claude
  Code session's dev server. Asked Hassan before working around it —
  confirmed Clicker's backend has no OAuth callback or webhook that needs
  8000 specifically. Backend is running on **8001** this session only;
  `.env` (`VITE_API_URL`) and `.claude/launch.json` are pointed at 8001 with
  a comment explaining why. Change both back to 8000 next session if it's
  free — this was never a Clicker design decision, just today's port
  availability.

- Half-finished: nothing new. Same two engine/deploy gaps as before,
  formalized as open items below instead of living only in Hassan's head.

- **Next single action:** Phase 1 step 5 — field components for the
  registry types Contacts needs (text, longtext, boolean, selection,
  many_to_one, email, phone, url — the 8 types Contact already exercises).
  Before starting the **form renderer** in step 6, resolve the two open
  items below first, since the form renderer is what would need them.

- **Open items (not yet scheduled, tracked here so they're not only in
  Hassan's head):**
  1. **Schema engine has no field grouping and drops Django's `help_text`.**
     `backend/schema/engine.py`'s `_field_schema()` reads type, label,
     required, choices, and FK target off the Django field, but never reads
     `field.help_text`, and there's no concept of a field belonging to a
     section (e.g. "Address", "Contact info" — the fieldsets already used
     in `core/admin.py`'s `ContactAdmin` have no schema equivalent). Must be
     fixed before the form renderer (step 6) is built, since the form
     renderer is what would consume both.
  2. **`tokens.css` lives at the repo root; Vite reads it from outside
     `frontend/`.** Works for local dev (`vite.config.ts`'s `server.fs.allow`
     handles it), but a deploy host configured with `frontend/` as its root
     directory won't see a file one level above it. Solvable with a build
     command change (e.g. copy the file in as a prebuild step, or point the
     host's root at the repo root instead) — not a redesign, just needs to
     be handled deliberately at deploy time instead of discovered as a
     broken build.

- Decisions for the Notion Decision Log: none new — today was verification
  and documentation catch-up, not design work.
