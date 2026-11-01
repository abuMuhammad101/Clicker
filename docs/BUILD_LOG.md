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

## 2026-09-29 | office | field components session

- Resolved open item 1 above: `backend/schema/engine.py` now emits a
  `groups` key (an ordered list of `{label, fields}`) alongside `fields`,
  and passes through Django's `help_text`. Two defined fallbacks, not one
  silent one — a model with no `groups` declared gets a single
  `{label: null}` group (Country proves this path); a model that declares
  groups but misses a field gets that field appended to a trailing,
  visibly-labelled "Ungrouped" group rather than vanishing. `Contact.Schema`
  now declares Identity / Communication / Address / Classification,
  covering all 20 fields. Verified against the real JSON for both models,
  not just read the code.
- Installed Tailwind v4 + shadcn/ui (Radix primitives) in `frontend/` and
  rewrote the generated theme layer to reference `tokens.css`'s existing
  shadcn bridge instead of shadcn's own default palette. Caught two real
  bugs doing it, not cosmetic ones: shadcn's default init maps Tailwind's
  neutral "accent" hover-surface slot straight to our ink-violet brand
  `--accent` (every hover state would've rendered bright violet); and
  Tailwind's radius theme keys are unprefixed and collide by name with
  `tokens.css`'s own `--radius-sm/-md/-lg` — referencing them directly is a
  CSS custom-property self-reference (a cycle, resolves to nothing per
  spec), fixed with new same-value aliases in `tokens.css`'s bridge block.
- Added `GET /api/data/<app_label>/<model_name>/search/` — a minimal,
  generic search endpoint the many_to_one picker needs and nothing else
  had yet. Reuses the schema engine's own `search_fields`/`display_field`,
  domain filters are exact-match against known field names only.
- Built all 8 registry field components Contacts uses — text, longtext,
  selection, boolean, email, phone, url, many_to_one — form component and
  list cell for each, all 8 CLAUDE.md states. Gallery at `/gallery`
  (dev-only, not part of the schema-driven app) renders every
  type/state combination side by side; that page was the actual
  deliverable, not the components in isolation.
- Two more real density bugs found by actually verifying against computed
  styles, not eyeballing: stock shadcn controls come in at 32px (Tailwind's
  own `h-8`) against our 30px `--control-height`, and — separately — render
  body text at 12px, not 13px, because shadcn's `text-base md:text-sm`
  resolves through `tokens.css`'s own `--text-sm` at desktop width instead
  of `--text-base` (which `tokens.css`'s own comment says is explicitly for
  "form inputs"). Both fixed with one small unlayered CSS rule targeting
  shadcn's stable `data-slot` hooks — cascade layers mean unlayered CSS
  always beats Tailwind's layered utilities, so it's a single global rule,
  not a per-component fight.
- many_to_one verified against live Neon data in the browser, not stubbed:
  the gallery's "search open" demo shows real Contact rows, correctly
  filtered to companies only via the schema's own `domain` declaration.

- Half-finished: nothing broken. Open item 2 below (tokens.css deploy path)
  is still open — untouched this session.

- **Next single action:** Phase 1 step 6 — the form renderer, now that the
  schema carries grouping and the field components exist to render into
  it. List renderer after that.

- Open items carried forward:
  1. ~~Schema engine has no field grouping and drops help_text~~ — resolved
     this session.
  2. `tokens.css` lives at the repo root; a deploy host with `frontend/` as
     its root directory won't see it. Still needs a build-command decision
     before the first real deploy — not urgent while everything is local.

- Decisions for the Notion Decision Log: shadcn's own default color/radius
  variables are never used as-is anywhere in Clicker — every shadcn
  component's theme must resolve through `tokens.css`'s bridge, including
  new alias variables added there specifically to avoid CSS custom-property
  self-reference. Worth stating explicitly since it's easy for a future
  `shadcn add` to reintroduce shadcn's own defaults by accident.

## 2026-09-30 | second machine (D:\projects\Clicker) | setup session

- Fresh clone, set up from scratch. No feature work, per instruction.
- Installed Python via the Windows Python install manager, which pulled
  3.14.7 (office is 3.14.4). Node 24.19, npm 11.17, git 2.55 were already
  present.
- Created repo-root `.env`: `DATABASE_URL` pasted from the password manager,
  and a fresh dev `SECRET_KEY` that deliberately doesn't match the office
  machine.
- Backend: `.venv` created, `requirements.txt` installed clean. Ran
  `migrate --plan` first as a dry run: all 4 `core` migrations were already
  applied, then `migrate` said "No migrations to apply". That confirms both
  machines point at the same Neon database.
- Frontend: `npm install` added 425 packages with 0 vulnerabilities.
- Verified end to end: `/api/schema/core/contact/` returns 20 fields and
  `/country/` returns 3, and the frontend fetches both. The ink violet
  accent comes through from `tokens.css`, and `document.fonts` shows IBM
  Plex Sans 400/500/600 and Plex Mono 400 actually loaded, not a fallback.
  `/gallery` renders, and the many_to_one company search hits live Neon data.
- Fixed `.claude/launch.json`: it had the office machine's absolute paths
  (`E:\Projects\clicker-starter\...`), so it couldn't start anything here.
  The paths are now repo-relative and work on both machines.
- **Port conflict again, machine-local only:** other apps on this machine
  hold 8000 and 5173. This session ran on 8001/5174 without changing any
  committed config. The workaround is a gitignored repo-root `.env.local`
  (`VITE_API_URL=http://localhost:8001/api`); the servers were started on
  the alternate ports by hand. Delete `.env.local` here once 8000 is free.

- Half-finished: nothing. Open item 2 (tokens.css deploy path) is still
  open and untouched.

- **Next single action:** Phase 1 step 6, the form renderer. Unchanged from
  the previous entry.

- Decisions for the Notion Decision Log: none.

## 2026-09-30 | second machine | step 6a: form renderer

- Generic record API at `/api/data/<app>/<model>/` (list, create) and
  `/<pk>/` (retrieve, PATCH). Records come back as an envelope:
  `{id, display, values, labels}`. A many_to_one value is a bare id, and
  its human label sits in `labels`, so the value has the same shape on read
  and write. There's no per-model serializer; one is built from the model
  at request time.
- `Contact.clean()` now runs on every API save: the serializer builds the
  would-be record and calls `full_clean()`. Verified that a person as
  parent and a self-parent are both rejected with 400s keyed by field.
- Only models that declare a `Schema` class are served (data, search and
  schema endpoints). Without that gate the generic API would have exposed
  `auth.User` with password hashes.
- The schema engine now leaves the auto-created `id` out of form groups; the
  form header shows it as `#5` in Plex Mono. Removed `id` from
  `Contact.Schema.groups` to match.
- Form renderer at `/<app>/<model>/<id>` (and `/new`). It handles sections,
  help text, required markers, live `visible_when`, picker domains, a
  two-stage loading state, an error state with retry, and server errors
  mapped to fields. Errors on hidden fields go to a banner so nothing is
  swallowed. A type with no form component renders a visible notice.
  Country's form works with zero code.
- many_to_one picker gained a Clear option (optional relations only) and
  remembers the label of what was just picked.

- Half-finished: nothing. Save/discard/dirty state is step 6c by design.

- **Next single action:** Phase 1 step 6b, the list renderer.

- Open items:
  2. `tokens.css` deploy path. Still open, unchanged.
  3. **The API has no authentication.** Anyone who can reach the backend
     can read and write records. Fine while it only runs locally; must be
     wired to Django auth before the first deploy. Deferred deliberately by
     Hassan on 2026-09-30.

- Decisions for the Notion Decision Log: hidden (`visible_when`) fields
  keep their values and are still saved, matching Odoo; pending Hassan's
  confirmation, along with dropping the phone placeholder and one vs. two
  form columns.

## 2026-09-30 | second machine | step 6b: list renderer

- List renderer at `/<app>/<model>` on TanStack Table v9 (headless: sort
  state, column sizing, resizing) plus TanStack Virtual. Columns come from
  `list_display` in order, each cell from a list-cell registry that mirrors
  the form registry. Default sort from `list_sort`; header click toggles
  asc/desc (never "unsorted"). Search is debounced and runs server-side
  across `search_fields`. Column resize by dragging the header edge;
  double-click resets it. Clicking a row opens the form (ctrl/cmd-click
  opens a new tab; links inside cells still work). Empty (no records vs. no
  matches), loading, and error states. The Country list works with zero
  code.
- Backend list endpoint gained `?q=` and `?ordering=`. Text sorts
  case-insensitively; empty values sort last in both directions; a
  many_to_one sorts by its target's `Meta.ordering` (country by name, not
  id); the pk is always the final tiebreaker so offset windows never skip
  or duplicate rows.
- Verified density against computed styles: 34px rows, 32px header,
  11px headers, 12px Plex Sans cells, hairline borders, no striping.
  Verified virtualisation with 5,000 synthetic rows served from an
  in-browser fetch stub (nothing written to Neon): 32 DOM rows, a
  170,000px scroll height, and a jump to row 3,000 fetched only the two
  pages covering it.
- The form header's model name now links back to the list.

- Half-finished: nothing. Going back from a form to a list starts at the
  top (plain page loads, no client-side routing yet). Default list filters
  (`list_filter_defaults`, e.g. `active = true`) aren't applied yet, since
  there is no filter UI to turn them off, so archived records still show.

- **Next single action:** Phase 1 step 6c, save/discard behaviour, dirty
  state and unsaved-changes warnings in the form.

- Decisions for the Notion Decision Log: continuous virtualised scroll with
  windowed fetching instead of pagination. Written to the Notion Decision
  Log on 2026-09-30.

## 2026-09-30 | second machine | 6a/6b decisions applied

- **Hidden fields keep their values; hidden means not applicable.** The
  visibility rule moved to one shared function (`frontend/src/lib/visibility.ts`)
  used by the form and the list renderer. A list cell for a field that
  doesn't apply to its row shows "—", whatever is stored. No current
  Contact list column has `visible_when`, so that path is in place but not
  exercised by today's data.
- **No placeholders that look like data.** Removed the default placeholders
  from PhoneField (`+1 555 123 4567`), EmailField (`name@example.com`) and
  UrlField (`https://example.com`). Format hints moved to `help_text` on
  `Contact.phone`, `.mobile` and `.website`; migration
  `core.0005_phone_website_help_text` is a no-op at the SQL level and is
  applied on Neon. **Pull before migrating on the office machine.** The
  remaining placeholders ("Search…", "Select…") are instructions, not data.
- **Forms are one column, left-aligned.** Sheet width is label column + gap
  + `--form-field-max-width` + padding, from tokens (652px today). The width
  to the right is reserved for related content later, not for stretching
  fields or adding a second column.

- Half-finished: nothing.

- **Next single action:** Phase 1 step 6c, save/discard behaviour, dirty
  state and unsaved-changes warnings in the form.

- ⛔ **HARD BLOCKER: nothing gets deployed to a public URL until Phase 2
  auth exists.** The API has no authentication: anyone who can reach the
  backend can read and write every exposed record. This replaces open item
  3 above. It is not a "before deploy" reminder; it is a gate, and it
  applies to demo deploys and "just for a day" deploys too.

- Open items: 2. `tokens.css` deploy path (unchanged).

- Decisions for the Notion Decision Log: "hidden fields keep their values;
  hidden means not applicable" written to Notion on 2026-09-30. Placeholder
  and single-column rules are recorded here and in code comments; they
  are conventions, not reversible bets.

## 2026-10-01 | office | resequenced: step 7 before 6c

Hassan resequenced the build order after the previous entry was written:
**Phase 1 step 7 (the Product model, zero-frontend-change test) now comes
before step 6c (save/discard, dirty state).** Step 7 is the Phase 1 exit
criterion and a test, not a build — if it surfaces a renderer problem,
better to find it before 6c adds more form-renderer complexity on top of a
possibly-wrong foundation. Recorded here per instruction; the previous
entry's "next single action" (6c) is superseded by this one.

## 2026-10-01 | office | step 7: Product, the zero-frontend-change test

**Result: the architecture passed. Zero frontend files touched — confirmed
with `git status` after, not just intended.** Two real bugs surfaced and
were fixed, both backend-only, documented below rather than glossed over.

- New `catalog` app, `Product` model: name, sku (unique), type (selection:
  goods/service), description (longtext), sales_price (decimal), cost
  (decimal), active (boolean, default true), supplier (many_to_one →
  `core.Contact`, cross-app), barcode (text), weight (decimal).
  `Schema` class: four groups (Identity, Pricing, Logistics,
  Classification), `list_display`, `list_sort`, `search_fields`, and
  `domains = {'supplier': {'is_vendor': True}}` — the first domain on a
  boolean field; every prior domain (`Contact.parent`) filtered on a
  string selection field instead.
- Migrated and seeded 15 real products (hardware, packaging, and services,
  one archived) via `catalog`'s own `seed_products` management command.
- **Bug 1, found before writing any Product code:** `manage.py seed` ran
  `core`'s seed command, not `catalog`'s — Django resolves management
  commands by name across all installed apps, and `core`'s `seed` wins the
  naming collision silently. Renamed catalog's command to `seed_products`
  rather than touch the established `core` one.
- **Bug 2, found by testing the boolean domain filter before trusting it:**
  `backend/data/views.py`'s domain-filter code passed raw query-string
  values straight into `.filter(**filters)`. That's fine for a string field
  (`?type=company`) but `Contact.objects.filter(is_vendor='true')` — the
  literal string, lowercase, exactly what `String(true)` produces on the
  frontend — raises `ValidationError: "true" value must be either True or
  False`, not a silent miscoercion. Reproduced with a direct shell call
  before changing anything, fixed with one small per-field-type coercion
  function, reproduced the live HTTP request afterward to confirm the fix
  (`GET .../search/?is_vendor=true` → 200, two correct vendors). This is a
  backend implementation gap, not a schema design failure — the schema
  JSON (`domain: {"is_vendor": true}`) was always a reasonable shape; nothing
  about it needed to change.
- Opened both `/catalog/product` (list) and `/catalog/product/<id>` (form)
  in the browser with the frontend completely untouched. Verified, not
  assumed: the cross-app FK target (`{app_label: "core", model: "contact"}`)
  resolved and labelled correctly, the supplier picker's vendor-only domain
  filter worked through the real UI (not just a direct API hit — opened the
  picker, saw exactly Globex Industries and Sofia Almeida, nothing else),
  grouping, selection choices, boolean checkbox, and search/sort on the
  list all rendered with zero frontend code specific to Product. Console
  and network clean on both pages.
- **The one honest gap: `decimal` has no form component or list cell.**
  Not "built but unexercised" as assumed going in — checking
  `frontend/src/fields/registry.tsx` and `listRegistry.tsx` directly showed
  it was never built; Contact never needed it, so nobody had. `sales_price`,
  `cost`, and `weight` show the registry's own designed fallback: the list
  column reads "decimal?" in red, the form field reads "No form component
  for type 'decimal' yet." — visible and legible, not a blank space or a
  crash. This is the generic-type-registry safety net working exactly as
  built, not a schema or renderer design failure: nothing about Product
  required editing the renderer *for Product* — the gap is in the
  type-component library, which was always going to need a decimal
  component for some future model, independent of this one. Deliberately
  not built this session — the instruction was zero frontend changes, and
  that includes filling this gap without being asked.

- Half-finished: `sales_price`, `cost`, and `weight` are visible-but-broken
  on every Product record until `DecimalField`/`DecimalListCell` exist.
  Right-alignment and tabular figures are already half-wired
  (`NUMERIC_TYPES` in `listRegistry.tsx` already includes `'decimal'`) —
  only the components themselves are missing.

- **Next single action:** Hassan's call — build `DecimalField` +
  `DecimalListCell` (closes the one gap this test found) before 6c, or
  proceed to 6c with the three decimal fields intentionally left showing
  the fallback. Either way, Phase 1's exit criteria are met: a new model
  got working form and list views with no React edits, 8+ field types
  render correctly, and one many_to_one relationship (two, counting the
  cross-app one) works end to end.

- ⛔ Hard blocker unchanged: no public deploy until Phase 2 auth exists.

- Open items: 2. `tokens.css` deploy path (unchanged). New: 4. `decimal`
  has no form component or list cell — see above.

- Decisions for the Notion Decision Log: Phase 1's core bet — schema-first,
  zero-frontend-edits-per-module — holds under a real second model with a
  cross-app relationship and a field type never exercised before. Worth
  recording as the thesis validation, not just a build note.

## 2026-10-01 | office | decimal field component

Closed the one gap step 7 found. `DecimalField` + `DecimalListCell`, same
8-state pattern as the other 7 types, plus two extra demo rows (negative,
zero-not-empty) the other types didn't need.

- Backend: `schema/engine.py` now emits `max_digits`/`decimal_places` on
  every decimal field's schema entry — precision and scale come from the
  Django field, never guessed by the component.
- `formatDecimalDisplay`/`isValidDecimalInput`/`parseDecimalInput` in
  `fields/decimal/decimalFormat.ts`, shared by both components. Typing
  keeps a raw, unformatted local buffer (`1234.5`) separate from the
  committed `value`; losing focus swaps to the formatted display
  (`1,234.50`) computed fresh from `value`, not from what was typed — the
  same split tokens.css's readonly-vs-disabled rule already demanded
  elsewhere, applied to a new axis (editing vs. display, not editable vs.
  not). An invalid keystroke is rejected outright (the regex/digit-count
  check runs before any state update), not accepted and corrected after.
  Negative values get `--danger` text color once committed; empty renders
  as nothing (the FieldShell "—" convention), zero renders as "0.00" —
  distinct, on purpose, since an unset cost isn't a cost of zero.
- Right-alignment and tabular figures: `text-right tabular-nums` on the
  form input, the existing `list-cell--numeric` modifier (built in step 5,
  unused until now) on the list cell. The list renderer's own
  `isNumericType` already right-aligns the column/header — the component
  doesn't depend on that, so it also looks correct standalone in the
  gallery, which has no such wrapper.
- Verified against the real Product form, not just the gallery: a
  `form_input`-driven edit (gallery's own typed-keystroke test doesn't
  register in this session's hidden browser pane — isolated by confirming
  the *validation logic* directly, then switching to `form_input`, which
  triggers the framework's real value setter) went through the actual
  save button, PATCHed Neon, and read back correctly on a fresh fetch.
  Restored the original seed value afterward — no lasting change to demo
  data.
- Confirmed directly: no "No form component for type 'decimal' yet." text
  anywhere on the Product form, no "decimal?" text anywhere in the Product
  list. `sales_price`/`cost`/`weight` render, edit, and save correctly.

- Half-finished: nothing. `integer`, `date`, `datetime`, `currency`
  deliberately not built — no model uses them yet, per instruction.

- **Next single action:** Phase 1 step 6c — save/discard behaviour, dirty
  state, unsaved-changes warnings. Nothing left blocking it; step 7's one
  finding is closed.

- ⛔ Hard blocker unchanged: no public deploy until Phase 2 auth exists.

- Open items: 2. `tokens.css` deploy path (unchanged). 4 (decimal gap) is
  now resolved — removed from the open list.

- Decisions for the Notion Decision Log: none new.

## 2026-10-01 | office | step 6c: save/discard and dirty state

Generic throughout — nothing model-specific, verified on both Contact and
Product per instruction.

- **Field-level dirty tracking**, derived fresh on every render by comparing
  current values against a `baseline` (the loaded record, or a new record's
  schema defaults) — not a remembered "was this ever touched" flag. That's
  what makes reverting a field to its original value clean again for free,
  with no special-case code: the comparison just stops finding a difference.
  A small ink-violet dot on the label (`FieldShell`'s existing
  required-asterisk slot, same pattern) marks a dirty field — threaded
  through `FieldProps` and all 9 field components, since the dot lives in
  each component's own `FieldShell` call, not in a wrapper the form renderer
  could apply from outside.
- **Save/Discard** both disabled while clean, Save shows "Saving…" in
  flight. On success, `values` *and* the dirty-comparison `baseline` reset
  from the server's response (not from what was sent) — a computed or
  server-normalised field can legitimately differ from the request.
  Discard asks for confirmation (count-aware: "The field you changed" vs.
  "The N fields you changed") before reverting to baseline.
- **Unsaved-changes interception, two different mechanisms on purpose**:
  `beforeunload` for genuine browser-level unload (tab close, reload, typed
  URL, back/forward) — no modern browser allows customising that dialog's
  text, so there's no point trying for anything richer. The one in-app
  link (the breadcrumb back to the list) gets its own click-intercepted,
  three-option dialog instead: Cancel, Discard & leave, Save & leave — the
  save option awaits the real save and only navigates on success, staying
  put with errors visible on failure, same as a plain failed save.
- **Create**: the route (`/<app>/<model>/new` → `FormRenderer` with no
  `recordId`) already existed from step 6a, but nothing linked to it — the
  list had no way to reach it. Added a "New {model}" button to the list
  toolbar. An untouched new form is clean by construction (baseline =
  schema defaults, same comparison as any other form), so Save/Discard stay
  disabled and leaving prompts nothing, with no create-specific logic
  anywhere.
- **Bug found and fixed while testing, not assumed correct from reading the
  code:** shadcn's `AlertDialogAction` does not auto-dismiss on click —
  unlike `Cancel`, which closes via the dialog's own controlled
  `open`/`onOpenChange`, `Action` leaves closing entirely to the consumer
  (sensible once you consider it's meant for actions that might be async
  and might fail, like this session's own Save & leave). The plain Discard
  confirmation assumed the same auto-dismiss and silently didn't close.
  Fixed by having `discard()` close its own dialog explicitly.
- Verified live end to end on both models, not just read the diff: clean
  on load, dirty on edit, clean again on revert-to-original, full
  create→save→clean→URL-updates-to-/core/contact/13 cycle, a save that
  intentionally fails (blanked a required `name`) correctly staying dirty
  with the input preserved and the field-level error shown, and all three
  choices in the leave-while-dirty dialog (Cancel stays with edits intact;
  Discard & leave navigates after reverting; Save & leave PATCHes first,
  confirmed via a direct fetch of the record, *then* navigates).

- **Honest gap in this session's verification, not papered over:** the
  Discard and leave dialogs' visual close *animation* couldn't be confirmed
  in this environment — `animationend` never fired even with the keyframe
  present and correctly configured and the tab fronted, which blocked
  Radix's animation-driven unmount from completing, independent of the
  `discard()` fix (confirmed separately: `data-state` flips to `"closed"`
  correctly, the application state is provably right, only the exit
  transition's completion is unconfirmed). Worth Hassan clicking Discard
  once himself to confirm the dialog actually closes smoothly on screen.
- Left two test contacts in Neon from this session's verification (ids
  visible via `/core/contact` — one named for the dirty-state test). Not
  cleaned up: there's still no delete endpoint (by design, from step 6a —
  archiving is the intended path). Harmless, same category as "Sarah".

- Half-finished: nothing in scope. Optimistic updates, concurrent-edit
  detection, autosave, draft persistence all explicitly out of scope per
  instruction — not started.

- **Next single action:** Hassan's call. Phase 1's three exit criteria are
  all met as of step 7 (zero-frontend-change model, 9 field types across
  their states, two many_to_one relationships including a cross-app one) —
  Phase 1 could be considered done, or there's room for more Phase 1
  polish before calling it. Worth a decision, not an assumption.

- ⛔ Hard blocker unchanged: no public deploy until Phase 2 auth exists.

- Open items: 2. `tokens.css` deploy path (unchanged).

- Decisions for the Notion Decision Log: none new.

## 2026-10-01 | second machine | Phase 2 step 2a: authentication

- **Django session auth, locked by default.** `REST_FRAMEWORK` now requires
  an authenticated user on every API view; only `/api/auth/login/` and
  `/api/auth/csrf/` opt out. A custom `SessionAuthentication`
  (`accounts/authentication.py`) declares a challenge so anonymous requests
  get **401**, not DRF's default 403. That's how the frontend tells "sign in
  again" from "not allowed".
- New `accounts` app with four endpoints: `csrf/` (public), `login/`
  (public, CSRF-enforced against login-CSRF, one generic error for any bad
  credential), `logout/` (ends the session server-side) and `me/` (401 or
  the user). The CSRF token travels in JSON, so both cookies are httpOnly.
  Sessions have a 12-hour *idle* timeout (`SESSION_SAVE_EVERY_REQUEST`).
  Cookies are `Secure` whenever `DEBUG` is off. CORS allows credentials;
  CSRF trusted origins default to the CORS origins.
- Verified with Django's test client (CSRF checks on): every schema, data
  and search endpoint gives 401 logged out, including Product. Login
  without a CSRF token gets 403, a wrong password and an unknown user get
  the same 400, and a correct login sets an httpOnly + SameSite=Lax cookie
  and rotates the CSRF token. A write without the CSRF header gets 403;
  after logout, 401 again.
- **Frontend:** `AuthProvider` checks `/auth/me/` once per load. Every route
  except `/login` is gated: anonymous visitors go to
  `/login?next=<path>` and come back there after signing in (`next` only
  accepts same-app paths, so it isn't an open redirect; verified with
  `next=https://evil.example`). The login screen reuses `TextField` and
  `FieldShell`; the password is a password-type `Input` in a `FieldShell`,
  since password isn't a registry type. The card narrows the existing
  `--form-label-width` / `--form-field-max-width` tokens locally instead of
  adding a layout. New `TopBar` (44px, `--topbar-height`) with the user's
  name and Sign out; list and form pages now size to the area under it.
- **Session expiry mid-task:** any 401 after sign-in opens a
  non-dismissable "Your session has ended" prompt *over* the current page.
  The username is fixed, focus goes to the password, and "Use another
  account" is available. Nothing navigates or unmounts. Verified live: with
  an unsaved City edit, I deleted the session server-side and pressed Save.
  The prompt appeared, the edit survived, the form banner said why it
  wasn't saved, re-signing in closed the prompt, and Save then went
  through. (Emma's city was reverted afterwards.)
- **Test account:** `dev-verify` (not staff, not superuser), created for
  verifying the logged-in path. Its credentials live only in this
  machine's `.env` (`DEV_TEST_USERNAME`/`DEV_TEST_PASSWORD`, shape in
  `.env.example`). Deactivate it before any deployed environment shares
  this database.
- Deleted this machine's `.env.local`: ports 8000/5173 were free again.
- **Note: each machine signs its own sessions.** The two machines use
  different `SECRET_KEY`s against one shared database, so a session from
  one machine is unreadable on the other ("Session data corrupted" in
  logs). Harmless: sign in separately on each machine.

- Half-finished: nothing in scope. Password reset, registration, SSO, MFA,
  remember-me were explicitly out of scope; not started. Login has no rate
  limiting yet.

- **Next single action:** Hassan signs in as `Hassan` at
  `localhost:5173/login` and judges the login card, the top bar, and the
  session-expired prompt by eye. None of them could be screenshotted this
  session.

- ⛔ **Hard blocker, updated.** The original blocker (no authentication) is
  resolved by this step. A public deploy still requires: (1) a custom
  domain so frontend and API are the same site, since the session cookie
  won't cross from `*.pages.dev` to `*.onrender.com`; (2) login rate
  limiting; (3) `dev-verify` deactivated on any database a deploy uses.

- Open items: 2. `tokens.css` deploy path (unchanged).

- Decisions for the Notion Decision Log: "Session authentication over JWT",
  written to Notion on 2026-10-01, including the same-site deployment
  consequence.

## 2026-10-02 | second machine | Phase 2 step 2b: module registry and app shell

- **Registry endpoint** `GET /api/registry/` (signed-in only) returns the
  installed apps that have at least one exposed model, and those models
  (`model`, `label`, `label_singular`, `route`). It's built by
  `build_registry()` in `schema/engine.py` from Django's app registry,
  using the same opt-in rule as the API (a `Schema` class), so auth,
  sessions and admin never appear. Apps keep `INSTALLED_APPS` order; models
  within an app are alphabetical by label (no ordering metadata until a
  module needs it). Module display names come from each app's own
  `AppConfig.verbose_name`: `core` → "Contacts", `catalog` → "Catalog".
- **Proved generated, not hand-written:** no file in `src/shell`, `src/lib`,
  `App.tsx` or `features/auth` names a module or model. Uninstalling
  `catalog` via an in-memory settings override removes the Catalog group
  from the registry, and restoring it brings it back, with no file
  changes.
- **App shell** (`src/shell/`): full-height sidebar generated from the
  registry and grouped by app, collapsible between `--sidebar-width` and
  `--sidebar-width-collapsed`. The choice is remembered per browser; the
  sidebar starts collapsed below 1100px if no choice was saved. The top bar
  (`--topbar-height`) has breadcrumbs (module › model › record name), the
  user, and Sign out. The record name comes from the form via a small
  page-label context; everything else is derived from the URL and the
  registry. Both renderers render inside the shell; `/` opens the first
  registered model, and a registry miss shows "Nothing here".
- **Client-side navigation** (`lib/router.ts`, `lib/Link.tsx`, ~120 lines,
  no dependency): `navigate()`, `useLocation()`, a `<Link>` that keeps
  cmd/middle-click working, and `useNavigationBlocker()`. 6c's
  unsaved-changes dialog now intercepts *every* in-app navigation (sidebar,
  breadcrumbs, the form's own link, browser back/forward) and continues to
  wherever the user was actually going. Verified: an edited product plus a
  sidebar click opened the dialog with the edit intact, and "Discard &
  leave" went to Contacts (not the product list) without saving.
- Verified live, signed in: Contacts → Countries → Products → a product →
  Back, all in one page load (a `window` marker survived every step).
  Breadcrumbs and the active link are correct at each step; collapse
  measures 48px; at 1024px with the sidebar expanded there's no horizontal
  overflow and the form fits.
- **Routes moved:** `/gallery` → `/dev/gallery`, and the schema viewer
  (was `/`) → `/dev/schema`. Neither is in the nav.

- Half-finished: nothing in scope. Global search, favourites, recents,
  dashboard and notifications were out of scope and are absent (no search
  affordance either).

- **Next single action:** Hassan judges the shell by eye (sidebar density,
  active state, collapsed state, breadcrumbs) at `localhost:5173`. No
  screenshots were possible this session either.

- **Gap for Hassan:** collapsed, a model shows its initial, and Contacts
  and Countries are both "C". Proper fix: an icon per model as `Schema`
  metadata (e.g. `Schema.icon = 'users'`, a lucide name), which the
  registry would pass through. Not added, because it's a schema-format
  decision.
- Also open: the form header's own "Contacts" link now duplicates the
  breadcrumb. Kept for now; candidate for removal.

- ⛔ Deploy blocker unchanged (see 2a): custom same-site domain, login
  rate limiting, `dev-verify` deactivated.

- Open items: 2. `tokens.css` deploy path (unchanged).

- Decisions for the Notion Decision Log: a small hand-written router
  instead of react-router. React-router's navigation blocking needs its
  data-router setup, which is more to integrate than the ~120 lines this
  needed; revisit if routes grow nested layouts or data loading. Not yet
  written to Notion.

## 2026-10-02 | office | surfaces contract: RecordRef, intent layer, peek

Step 7 made new modules free; this makes new surfaces free. Two commits on
purpose, so the proof can be read off the diff: `2ea931d` makes the
renderers container-agnostic and adds the primitives; `e644810` ships peek.

- **Primitives (`src/records/`).** `paths.ts` is the only place a record URL
  is built. `openRecord(model, id, { surface })` is the one intent function;
  containers `registerSurface()`. `RecordRef` is a real `<a href>` that emits
  an intent instead of navigating (cmd/ctrl/shift/middle-click keep the
  browser's own behaviour). Surfaces: `page`, `peek` implemented; `tab`,
  `split` reserved. An unregistered surface falls back to `page`. Proven:
  a `tab` surface registered after the fact receives the intent with no
  caller changed.
- **Everything that pointed at a record now goes through it:** the
  many_to_one list cell, the picker's readonly value, a new open affordance
  beside the picker, the list's "New" button, list row clicks. (Before this,
  neither the m2o cell nor the picker pointed anywhere at all.)

### The assumptions found, and what happened to each

FormRenderer assumed, and no longer does:
1. It owned the window title (`document.title`). Now `onLabelChange`; the
   page container sets the title. This was also a live bug waiting for peek:
   a drawer's form would have retitled the page behind it.
2. It owned the breadcrumb, via a context imported from `shell/` (a feature
   importing from the shell). Same replacement.
3. It wrapped itself in page chrome (`.form-page`: padding, sunken ground,
   min-height). Moved to the page container (`.record-page`).
4. Its sheet look (border, radius, width cap) was hard-wired. Now defaults
   that a container themes through `--form-sheet-border/-radius/-max-width`.
5. Its header linked to the model's list page. Now plain text; the shell's
   breadcrumb is the navigation.
6. It assumed navigation == leaving the form. **Kept, abstracted:** the
   form still calls `useNavigationBlocker`, and the router now asks the
   container what "leaving" means. The renderer's call is unchanged.
7. It was always editable. **The one capability added:** `mode: 'edit' |
   'view'`, because a read-only-first container needs it.
8. Kept deliberately: `beforeunload` (it's about the document, not the
   container) and the form flowing in whatever scroll container it's given.

ListRenderer assumed, and no longer does: `document.title` (→ `onLabelChange`);
`recordUrl()` (it built URLs) and `navigate()`/`window.open()` on row click
(→ `openRecord`, "a record is a page" is no longer its decision); the
hard-coded `/new` link. Kept and now documented: it fills its container's
height. Found and not an issue: no global keyboard handlers in either
renderer (only the search box's own Escape and a row's own Enter).

### The proof, stated plainly

- **Peek commit: 0 files in `features/form-renderer` or `features/list-
  renderer`** (`git show --stat e644810 -- <both>` is empty). It touches
  `lib/router.ts`, `shell/AppShell.tsx` (mount point), `records/RecordRef.tsx`
  (a type fix) and four new files under `src/surfaces/`.
- **But the whole job did change the renderers**, in the first commit: part
  3 asked for that, and the finding behind it is that they weren't
  container-agnostic. Peek itself also *needed* one renderer capability
  (`mode: 'view'`), which I added in that first commit rather than hide.
  Both are real, so I'm reporting both.

### Decisions (documented in code too)

- **One live view per record.** `openRecord` asks every surface whether it
  already holds the record and reveals that view instead of opening a
  second, whatever surface was asked for: an already-stacked record pops
  back to it; the record the page shows reveals the page. `takeover`
  (peek's "open as full page") is the deliberate exception, a move not an
  open. `new` is never held.
- **Peek state lives in the URL** (`?peek=core.country.3&peek=...`): back
  closes it, reload reopens it, and closing is a navigation, so every
  unsaved-changes guard applies unchanged. The contract for future
  containers: any change that can drop a mounted screen goes through
  `navigate()`.
- **Router guards are scoped and chained.** A layer is left when it closes,
  the page when it changes, so opening a peek over a dirty page is not
  blocked and a dirty page keeps its state. Blockers are asked innermost
  first, and a confirmed blocker lets the navigation carry on to the next
  one instead of overriding all of them, so confirming "Discard & leave" in
  a peek no longer throws away the page behind it unasked.
- Escape closes the whole peek; the back arrow closes one layer. Depth cap
  3; past it a new peek replaces the top layer. Lower layers stay mounted
  but hidden. Edit is one-way (back to view with unsaved edits would strand
  them). Open-as-page is cmd/ctrl+Enter, scoped to the drawer.

### Findings and gaps — read these

- **Verification gap: I could not drive the live drawer.** The API now
  requires a session and this machine has none; creating a test account in
  the shared Neon database was declined, so nothing signed-in was exercised.
  What *was* verified, in the running dev app against the real modules and
  real React hooks: intent routing, dedupe, fallback and late registration;
  the URL stack (cap, junk, other params preserved); the scope rule; and the
  router chain with two dirty screens (innermost first, carries on after one
  confirmation, only navigates when all are satisfied). `tsc -b`, lint
  (same 6 old warnings) and a production build are clean. **Not verified:**
  that the drawer renders, that Escape/back/open-as-page behave on screen,
  and the form inside a layer. Hassan: please open a Contact, click a
  Country, and try Edit / Esc / Open as page.
- **Stale views.** `useRecordWindow` (and the form) never refetch, so a record
  edited in a peek leaves the list or form behind it showing old data (a
  country renamed in a peek still reads the old name in the Contacts list).
  Fixing it means the renderers subscribing to a record-changed signal, which
  is a renderer change, so I did not do it here. This is the surfaces
  contract's real open problem.
- **The earlier "TSC_OK" results were vacuous.** `npx tsc --noEmit` checks
  nothing in this repo (the root tsconfig has `files: []` and only project
  references); `tsc -b` is the real check, and it caught a real error in
  this session's code. Every earlier session's type-check claim from me
  should be read with that in mind; `tsc -b` is clean now across the whole
  tree.
- History: closing a peek replaces its history entry, so Back after closing
  lands on a duplicate of the page (one dead press).

- Half-finished: nothing in scope. Open-records tab bar, split view and
  command palette untouched, as asked.

- **Next single action:** Hassan exercises the peek by hand (above), and
  decides whether the stale-view problem gets a record-changed signal before
  more containers are added.

- Open items: `tokens.css` deploy path (unchanged); sidebar icons for
  collapsed state (from 2b).

---

## 2026-10-02 — Phase 2, step 2b: registry icons, shell, save bar, Recents

### What already existed (built on the other machine, found on pull)

Registry endpoint without icons, a registry-generated sidebar, a narrow rail
showing initials, a top bar and the router. I built only the delta below
instead of redoing it.

### What this session added

- **Registry `icon`.** A model declares `icon = 'users'` (a lucide name,
  kebab-case) on its `Schema`; `build_registry()` passes it through, or null.
  The frontend renders it with lucide's dynamic icon and falls back to a
  generic box for absent or unknown names. Declared on Country (`globe`),
  Contact (`users`), Product (`package`) as a judgement call, not a design.
  A new module appears in the nav with no frontend edit.
- **Sidebar.** Sections per app with collapsible headers; fold state saved
  per user on the server; the section holding the current view auto-expands;
  the collapsed sidebar is an icon rail (tokens `--sidebar-width` /
  `--sidebar-width-collapsed`). Active = selected surface + accent text +
  medium weight; hover = hover surface only.
- **Top bar.** Breadcrumbs left, user menu with Sign out right, centre empty.
- **Contextual save bar.** When a form is dirty the *surface's* header turns
  into "Unsaved changes | Discard | Save". The page uses the top bar, a peek
  drawer uses its own header, independently (both can be dirty at once).
  Renderer capability added, deliberately: `FormRenderer` gained
  `onStateChange` (emits `{dirty, saving, save, discard}`) and
  `actions='inline'|'external'`; the container draws the bar. Discard still
  confirms inside the form.
- **Recents is home (`/`).** Model, display name, module, when; rows are
  `RecordRef`s. Backend: new `userstate` app with `RecordView` (user,
  content type, object id, timestamp; upserted on every record-detail GET,
  so no surface can forget to record a view) and `UserPreference` (keyed
  JSON per user, 8 KB cap) behind `/api/recents/` and
  `/api/preferences/<key>/`. 14 backend tests.

### Decisions

- `RecordView` is keyed by content type + object id with one row per
  (user, record) and a timestamp. That shape is meant to serve the
  open-records strip later (what is open / recently open) without a
  migration. **Not yet written to the Notion Decision Log**; needs doing.
- Preferences are one generic keyed-JSON table, not a column per setting.

### Findings and gaps — read these

- **No real sign-in was possible.** Creating a test account in the shared
  Neon database was declined, so nothing was verified against a live login.
  Instead the real app (`main.tsx`, real components) was booted against a
  stubbed `fetch` serving real schema/record fixtures (harness deleted, it
  held real data). Verified there: Recents landing and row click → record;
  moving between Contacts, Countries, Products inside the shell; nav
  generated from the registry (icons, groups); section collapse, auto-expand
  and preference writes; rail width; page save bar (dirty → bar, Discard
  confirm, Save PATCH, restoring the value clears it); peek save bar (own
  header, independent of a dirty page behind it, Save PATCHes only the peek's
  record); user menu shows Sign out. Backend: 14 tests pass; `tsc -b`, lint
  (same 6 old warnings) and build clean.
- **Not verified:** the real session/CSRF round trip, the real server
  persisting preferences, any visual check (the browser pane was hidden, so
  no screenshots, no transitions). Sign-out was not clicked.
- Bundle grew: `lucide-react/dynamic` pulls in every icon as lazy chunks.
  Fine for now; revisit if load time matters.
- The Neon test DB (`test_neondb`) wouldn't tear down through the pooler; I
  dropped it by hand. Expect that on every test run on this setup.
- Sidebar icons for the collapsed rail: done here.

- Half-finished: nothing in scope. Command palette, global search, pinning,
  configurable items, dashboard untouched, as asked.

- **Next single action:** Hassan signs in, lands on Recents, edits a contact
  and a peeked country, and judges the save bar and rail density by eye.

---

## 2026-10-22 | office | design polish pass: audit and system proposal (checkpoint 1)

Stopped at checkpoint 1 on purpose: nothing in `tokens.css` or the app's
styling has changed. Build (step 3) has not started.

- **Audit** (`docs/DESIGN_AUDIT.md`, screenshots in `docs/design/before/`):
  32 findings, worst first. The structure and the token discipline are
  sound. What reads unfinished: three screens leave 40–60% of the canvas empty
  at 1440 (Recents, form, list's dead strip); the list **overflows and clips
  its last column at 1024**; the same word appears three times in the
  wayfinding; headers are in capitals; no dark mode; **control borders are
  1.31:1 (fail WCAG 1.4.11)**; the peek is 652px, a split view, and the
  page's Save/Discard are unreachable while it's open and both are dirty;
  hardcoded `bg-black/10`, `duration-100`, `rounded-xl` live in the shadcn
  files; fonts come from Google's CDN at runtime.
- **System proposal** (`docs/DESIGN_SYSTEM.md`, rendered live at
  `/dev/proposal`, tokens in `frontend/src/gallery/proposal.css`, scoped, not
  applied): three typefaces (Plex / Inter / Geist) and three greeting serifs,
  a light and dark OKLCH palette with contrast numbers, radius / elevation /
  focus / motion token sets, and a per-component decision table.
- **`docs/DESIGN_REFERENCES.md` is honest about a gap:** no Mobbin MCP was
  available and every Mobbin link returned 403, so **I have not seen any
  reference screens**. The table rests on the brief's descriptions, tagged
  `(brief)`. The "find what I haven't" research is not done.
- **Method and limits.** No sign-in exists on this machine and I did not
  create one. The real app was run against a stubbed API with fixtures read
  from the ORM (git-excluded, `frontend/public/__design/`, holds real
  records). Screenshots are 800px wide, so I could not judge the fonts apart
  by eye; I said so rather than pick on looks. Motion was not observable in
  this pane; the motion section is from reading CSS. Fixed ports for this
  pass: API 8200, web 5273, via new `design-backend` / `design-frontend`
  launch configs that override env per process, so `.env` and the usual
  8000/5173 setup are untouched.
- **Found along the way:** my first captures ran without the font `<link>`s
  (the harness page replaces `index.html`) and used a fallback face; discarded
  and redone. The earlier "Street 2 label in blue" I thought I saw was that
  artefact, not a bug.

- Half-finished: nothing. Built, deliberately: the proposal page and docs
  only.
- **Next single action:** Hassan opens `/dev/proposal` and answers the five
  decisions at the top of `docs/DESIGN_SYSTEM.md` (typeface, row height, ⌘K
  in or out, dark-mode switch, accent). Build starts from tokens after that.
- Open items: Mobbin access for the references; the Decision Log entries
  from 2b are still not in Notion.

---

## 2026-10-22 | office | design polish pass: build, micro-interactions (checkpoint 2)

Decisions from Hassan at checkpoint 1: Inter; keep 34px rows; ⌘K out; dark
mode as tokens; accent unchanged. Built in the planned order, one concern per
commit (tokens, fields, list, form, shell, peek, save bar, Recents, sign-in,
micro-interactions, record-changed signal).

- **Tokens** (`tokens.css`): Inter (self-hosted via `@fontsource-variable`),
  Plex Mono kept for identifiers, Instrument Serif for the greeting only;
  violet-cast neutral ramp; light and dark (`[data-theme]` on `<html>`,
  following the system); `--border-control` (3:1); drawer and toast shadows;
  motion set 100/160/240 plus ease-out/in and travel distances, zeroed under
  reduced motion; `.theme-light` / `.theme-dark` scopes. shadcn's hardcoded
  scrim, `duration-100` and `shadow-md` now route through tokens; shadcn radii
  remapped (sm 4, md 6, lg 8, xl 12).
- **Fields:** empty fields say "Set mobile…" (registry-wide), errors carry an
  icon, disabled stays legible, decimals recede in list cells, the picker
  shows key hints and a skeleton while searching instead of a spinner.
- **List:** columns fit the viewport (the last column was clipped at 1024),
  type-based starting widths, type icons in headers, row click opens a peek,
  the open record's row is marked, hover shows a cell pencil and an
  open-as-page arrow, one tab stop with arrow/Home/End/PageUp/PageDown, Enter
  opens, F2 edits the first editable cell, inline edit for text-like and
  number types with optimistic update and rollback, a ghosted empty state.
- **Form:** sheet centred on the page (left-aligned before; the earlier
  reservation of the right side for related content is superseded, and
  nothing has used that space), sentence-case section labels, the leave guard
  now names the fields you changed.
- **Shell:** ground canvas, brand mark (a placeholder tile and ring for
  Hassan to replace), styled rail tooltips, avatar initial, one crumb per
  name ("Contacts › Contacts" is now "Contacts"), offline banner, toasts.
- **Peek:** 480px, starts under the top bar so the page's own Save stays
  reachable, short slide, close stays while dirty, focus returns to the row.
- **Save bar:** shows how many fields changed, arrives with a short settle.
- **Recents:** serif, time-aware greeting; centred column; ghosted empty state.
- **Sign-in:** wordmark, 360px card, stacked labels, show-password.
- **Record-changed signal** (`records/changes.ts`): saving anywhere updates
  lists that show the record and relation labels in open forms. **This
  retires the "stale views" open problem** logged by the surfaces contract; it
  became necessary the moment a row click opened a peek.

### Findings and gaps — read these

- **Nothing that moves was watched moving**, and there was no real session.
  See `docs/DESIGN_VERIFY.md` for the exact list. Hassan: sign in, open a
  record from the list, edit a cell, edit in the peek, and watch it.
- `SchemaViewer.tsx` hardcodes `core.contact` and `core.country`: a
  pre-existing violation of the law (dev-only). Not touched. Should be fixed.
- `ListRenderer` now names the `peek` surface for row clicks (allowed by the
  contract, falls back to page). A one-line change if Hassan prefers otherwise.
- Not built, from the brief: selection and bulk-action bar, prev/next in the
  breadcrumb, date picker (no date field exists to put it on), currency
  prefix, a manual theme switch, Undo wired to a real destructive action (none
  exists; the toast supports it and the gallery shows it).
- The Mobbin research is still not done (see `DESIGN_REFERENCES.md`).
- The 2b Decision Log entries are still not in Notion.

- Half-finished: nothing in scope.
- **Next single action:** Hassan signs in at `localhost:5273` and judges, by eye
  and by watching: Recents, a list row opened as a peek, an inline edit, the two
  save bars, and dark mode (set the OS to dark).

### What I'd do next, ranked (not done)

1. Your sign-in pass, then fix whatever the eye catches. Highest value: it
   closes every "not verified" above.
2. Fix `SchemaViewer`'s hardcoded model list (the law).
3. Selection and a bulk-action bar in the list (the row-selected tokens exist).
4. Prev/next record in the breadcrumb, using the list order already loaded.
5. Get real Mobbin access and validate the reference table.
6. A manual light/dark switch in the user menu, stored as a preference.
7. Currency prefix and a date picker, when the first module needs them.
8. Replace the placeholder brand mark.

---

## 2026-10-22 | office | design pass: Hassan's first review (8 notes)

Hassan signed in and reviewed the real app. Each note, and what changed:

1. **Save in a peek returns to view.** `PeekHost` drops the layer from edit mode when an existing record saves (a new record still moves to its real URL as before).
2. **Inconsistent spacing.** The drawer's bar, title, section labels and fields now share one left edge (`--form-pad-x`, set by the container; the form reads it). The sidebar gets space between Recent and the first section.
3. **Collapsed rail opens on hover, with resistance.** `useHoverIntent`: the pointer must rest 320ms (mouse only, no button held) to open, and be away 260ms to close; keyboard focus opens it at once. It floats over the page (a slot holds the rail's 48px in the layout) so nothing reflows. The toggle now means "pin open".
4. **Drawer content.** Read-only forms are a quiet label/value list (help text and the required mark hidden when viewing, Yes/No as a mark and a word, model icon in the header). Editing in the drawer is stacked.
5. **Main screens.** The table is a card on the ground. Search is a tinted well that takes the accent outline and more width on focus, with a "/" hint and a "/" shortcut. New table controls: row density (compact / default / comfortable, the existing tokens), a column chooser, reload. Density and hidden columns are per-user server preferences (`list.<app>.<model>`).
6. **Inline edit had no visible save.** The editor now states its two ways out under the cell, Cancel (Esc) and Save (Enter), and a saved edit raises "City updated · Undo". Clicks inside the editor no longer open the row's peek.
7. **Skeletons.** The shadcn skeleton was invisible on the ground and only pulsed. It is now a visible base with a sweeping highlight (`--skeleton-*` tokens), still under reduced motion; Recents' loading state is a table-shaped skeleton. CLAUDE.md records the one exception to "nothing animates on its own".
8. **Form.** Fields are stacked, in two columns once the sheet is wide enough (a container query on the sheet), long text spans both, a checkbox reads as "[ ] Active". The layout is owned by the form through custom properties; containers only choose width and padding. Also from Hassan's screenshots: "Set SKU…" keeps acronyms, decimals show `0.00` instead of a right-aligned sentence, the picker no longer pushes its open arrow outside its column.

### Findings and gaps

- **"Explore Mobbin" was not possible.** The links still return 403 and there is no Mobbin tool in this session. The drawer, form and table controls are designed from the principles in `DESIGN_REFERENCES.md` and the screens as Hassan described them; they have not been checked against real examples. Pasting Mobbin screenshots would let me do that.
- **Table filters were not built.** The list API has no filter parameter, so a filter control would need a backend change first. Hassan should decide whether that is wanted.
- **Not verified:** the hover-intent delay felt with a real mouse, any transition or the skeleton sweep (the pane does not run them), the Columns popover's look beyond one frame, the form at 1024, and the drawer's edit mode at the new gutter.
- The vite dev server reloads the whole page on most edits, which resets the stub; every check re-booted it.

### Drawer, second pass (Hassan: "still not well designed, make it look anchored")

- Structure: a fixed bar (what this is, close), a **pinned identity header** (a 36px accent tile with the module icon, the record's name, `Contacts #1`), a scrolling body, and a **pinned footer** (Open as page on the left; Edit, or Done while editing, on the right). While a form is dirty the bar carries Save/Discard instead and the footer steps out of the way.
- Reading a record: each section is a card on the ground with a row per field and hairlines between. Edit mode stays stacked on white.
- Renderer capability added, as a prop: `FormRenderer` takes `leading` (a node shown before the title) and honours `--form-header-position` so a container can pin the header. The icon comes from the registry in the container; the form knows nothing about it.
- Verified in the pane: header stays pinned after scrolling 300px, footer shows Edit then Done, dirty state swaps the bar and removes the footer. Not verified: edit mode's look at the new structure (the screenshot glitched), any motion, the drawer at 1024.

---

## 2026-10-30 | office | S-1: security foundation

Sprint plan now lives in `docs/DEMO_SPRINT.md` (sessions, gates, cut order).
Fixes all six findings from the review of `f2f7924`. One concern per commit,
except B and C (the enforcement point and the permission model it enforces
are one change).

### What was built

- **A. `foundation` app, `ClickerModel`.** `created_at`, `updated_at`,
  `created_by`, `updated_by`, all `editable=False`, set only by the data
  layer. Contact, Country, Product moved onto it. The timestamps also have a
  database default, so the other machine (old code) can still insert rows
  before it pulls. Existing rows got `created_at` = migration time and no
  creator: that's not their real history.
- **B. One enforcement point: `data/access.py`.** `scoped_queryset(user,
  model, action)`, `get_record`, `readable_fields`, `writable_fields`. Every
  list, detail, search, create, update, history and the Recents list goes
  through it. A source-scanning test fails if a view reaches for a model's
  manager directly. Record rules and tenancy plug in at one marked line.
- **C. Permissions through the schema.** `build_schema(model, user)` returns
  only readable fields, flags `read_only` / `read_only_on_create`, lists
  `actions`; the API enforces the same `field_access` answer. Unseen model or
  record: 404. Visible but not allowed: 403. Registry and Recents show only
  what the user may view. A relation is hidden if its target model is.
- **D. Write allowlist.** POST/PATCH accept only writable fields; any other
  key (unknown, hidden, read-only, server-owned, `id`) gets the same field
  error and nothing is saved.
- **E. Readable-only filter, sort, search.** A sort or filter on an unreadable
  or unknown field is a 400 with the same message; search skips unreadable
  fields.
- **F. Audit log.** `AuditEntry`: actor (+ username snapshot), time, IP,
  content type, record id, action, changed fields with before/after. Written
  inside the same `transaction.atomic()` as the change, with the row locked.
  Append-only three ways: model `save`/`delete`, queryset `update`/`delete`,
  and a Postgres trigger refusing UPDATE/DELETE. Admin read-only. `GET
  /api/data/<app>/<model>/<pk>/history/` (needs view on the record; changes
  to fields the reader can't read are stripped; IP not exposed). **No
  back-filled history for existing records.**
- **G. Login throttling (django-axes).** Per username+IP pair: five failures
  get the usual uniform message, the sixth attempt (right password or not) is
  a 429 for 15 minutes. Why axes, not DRF throttling: DRF throttles count
  *requests* in a cache (per-process unless a shared cache is set up) and know
  nothing of failure vs success; axes counts *failed authentications* in the
  database, so every worker agrees, a success resets the count, and it hooks
  into Django's `authenticate()` that a future SSO backend will also use.
  Not per IP alone (one office NAT would lock itself out), not per username
  alone (anyone could lock a colleague out). The client IP comes from one
  function shared with the audit log (`foundation.audit.client_ip`).
- **H. Production settings behind `CLICKER_ENV=production`, not DEBUG.** SSL
  redirect, HSTS one year with subdomains, proxy SSL header, secure cookies,
  SMTP email, and it refuses to start with DEBUG on or no ALLOWED_HOSTS.
  Absolute session lifetime 24h from sign-in (all environments), on top of the
  12h idle timeout. HSTS preload deliberately off (W021 silenced, reason in
  settings). Flags in `.env.example`.
- **I. `GET /api/auth/providers/`** → `[{"id": "password", "label": "Username
  and password"}]`. The login screen renders from it (form for `password`, a
  button to `/api/auth/<id>/start/` for anything else). Grepped: nothing
  assumes username = email (email is only a display detail in the user menu).
- **J. Roles.** Manager (every permission on every exposed model) and Clerk,
  as Groups, re-applied after every migrate from `Schema.default_grants`.
  `manage.py seed_roles` also creates this machine's Clerk test user from
  `DEV_CLERK_USERNAME` / `DEV_CLERK_PASSWORD`, refuses staff/superuser/Manager
  accounts, prints no credentials.
- **K. CLAUDE.md: "Security rules: the third law".**
- **Frontend (permission plumbing only):** read-only and create-time flags
  honoured; a record the user can't update opens read-only and the drawer
  shows no Edit; New and inline edit only with the create/update actions; a
  plain "isn't available" state for a 404 record or list; the lockout message
  shown on sign-in.

### Decisions, one line each

- **Field rules shape: `Schema.restricted_fields = ['tax_id']`.** One name
  per sensitive field; the two permissions (`core.view_contact_tax_id`,
  `core.change_contact_tax_id`) are derived and created automatically, so
  they're grantable through Groups and admin like any Django permission and a
  codename is never typed twice. Unlisted fields follow the model's grant:
  per-field permissions for every field would be 60+ checkboxes nobody
  maintains. A system check fails startup if a listed field doesn't exist.
- **Role grants live on each model's Schema (`default_grants`)**, so a new
  module brings its own roles and `foundation/roles.py` never names a model.
- **The two built-in groups are code-owned**: re-applied on every migrate, so
  a hand edit to Manager or Clerk in admin won't survive. Other groups are
  untouched. S-6's roles page decides whether that changes.
- **Audit users are PROTECTed**: a user with history can't be deleted, only
  deactivated.
- **Every save writes an audit row**, even one that changed nothing (someone
  did save); the row's `changes` is then empty.
- **Tests use Neon's direct (non-pooled) endpoint**, derived in settings by
  dropping `-pooler` from the host when running `manage.py test`; the app
  keeps the pooled one. The scratch test database now drops cleanly; no
  `--keepdb` needed. (Full suite: ~8.5 minutes, network-bound.)

### Definition of done

1. **Pass.** Backend suite: 73 tests OK, including every denial test the gate
   names (`foundation/test_roles.py`, `data/tests.py`, `foundation/test_audit.py`,
   `accounts/tests.py`). The "field the Clerk can't read" in the sort/filter
   test is a server-owned field (`created_by`): with today's grants a Clerk
   reads every Contact field, and a hidden field is also covered by
   `data.tests.ReadableFieldsOnlyTests`.
2. **Pass.** `npx tsc -b`.
3. **Pass.** `check --deploy` with `CLICKER_ENV=production DEBUG=False
   ALLOWED_HOSTS=…`: no issues (1 silenced: W021, preload, on purpose).
4. **Pass, against a local copy, not Neon.** Screenshots in `docs/security/`.
   Clerk: no Products in the sidebar, Tax ID read-only on a contact,
   `/catalog/product` shows "Nothing here". Manager: Products present, Tax ID
   edited and saved, history shows the before/after. I have no credentials for
   any Neon account and created none there; the check ran the real API and
   frontend on 8200/5273 against a throwaway local SQLite database with two
   generated test users (git-ignored `backend/.scratch/`; the served copy of
   the passwords was deleted after). To repeat it on Neon: fill
   `DEV_CLERK_USERNAME`/`DEV_CLERK_PASSWORD` in `.env`, run `manage.py
   seed_roles`, sign in.
5. **Run.** `pip-audit`: three DRF CVEs, fixed by 3.18.2, now clean. `npm
   audit`: 12 found, `npm audit fix` left 3 low-severity, all inside the
   shadcn CLI (a code generator, not in the shipped bundle); the fix is a
   breaking shadcn change, so not taken.

Migrations applied to the shared Neon database (axes tables, audit columns,
`AuditEntry`, the trigger). Roles there: Manager 14 permissions, Clerk 4.

### Findings and gaps

- **`dev-verify` (the other machine's test user) now sees nothing**: it has
  no group. Deny by default working as intended. Put it in Clerk or Manager in
  admin if it's still used, or deactivate it.
- **Hassan's own account is a superuser**, so it can do everything with or
  without a group.
- A user with `add` but not `change` would see the right flags on a new record
  but the form keeps create-time flags after its first save until reloaded.
  No role has that combination today.
- A picker domain filter on a field the user can't read now fails (400)
  instead of being ignored; no current domain hits that.
- `visible_when` conditions on a field the user can't read aren't adjusted.
- `SchemaViewer.tsx`'s hardcoded model list (the law) is still open.
- Delete has no endpoint, so `actions.delete` is reported but unused.

- Half-finished: nothing.
- **Next single action:** S-2 — add the `date`, `integer` and `currency` (PKR)
  field types with all eight states in the gallery, starting from the schema
  engine's type mapping.

### Decide before S-3 (Hassan's calls)

1. **Who may approve reductions** (credit notes, write-offs, discounts), and is
   there an amount above which a second approver is needed?
2. **Clerk's real scope**: should a Clerk create contacts (today: no), archive
   them, see tax IDs (today: read-only)?
3. **Which workflow transitions are role-gated** in the demo journeys (e.g.
   only a Manager posts a bill; a Clerk drafts).
4. **Should Manager and Clerk stay code-defined**, or become editable in S-6's
   roles page?
5. **Absolute session length**: 24 hours from sign-in is the default; shorter
   for the demo?

## 2026-10-30 | office | S-2: field types and data shapes for billing

The engine now has the types a billing ERP needs, built once so every module
in S-5 and S-6 gets them free. No business modules yet. The backend landed as
one commit (`16e03ec`: the parts share `engine.py`, `access.py` and the
serializers); the frontend as two (field types, then related lists and
filters).

### What was built

- **Part 0, Hassan's S-1 decisions.** Clerk may create contacts, may not
  archive them (`active` restricted) or change `tax_id`; reads `credit_limit`
  but can't change it. `dev-verify` gets Manager in `seed_roles`. Reductions:
  one Manager, never their own request; the second-approver threshold is a
  setting (`CLICKER_REDUCTION_SECOND_APPROVER_THRESHOLD = None`, no limit) for
  S-3 to read. `DEV_CLERK_USERNAME`/`DEV_CLERK_PASSWORD` written to this
  machine's `.env` (generated, never printed); `seed_roles` run on Neon:
  Manager 18 permissions, Clerk 7.
- **Part 1, relation scope.** A link's id is always readable; it is
  *writable* only if the user can view the target model, and a written id must
  exist in `scoped_queryset(user, target, 'view')`. Forbidden and nonexistent
  ids get the same field error ("Choose a record from the list."). The label
  is fetched through the target's scope too; when it can't be, the envelope
  says `restricted: {field: true}` and the UI shows a muted "Restricted", not
  a link.
- **Part 2, types.**
  - `date`: typed day-first (`30/10/2026`, `30-10-26`, `30 oct`, `today`,
    `yesterday`, `tomorrow`), stored ISO, shown "30 Oct 2026". Picker with
    presets Today / Yesterday / Start of month / End of month; arrows move a
    day or a week, PageUp/PageDown a month, Enter picks, Esc closes. Min/max
    come from the model's validators.
  - `datetime`: read-only, "30 Oct 2026, 14:05" in the organisation's time
    zone; the record header shows "Updated 3 minutes ago by …", the exact time
    on hover.
  - `integer`: right-aligned, tabular, thousands separators, no spinner,
    min/max from validators.
  - `currency`: declared per field in `Schema.field_types`; PKR from one
    setting (`CLICKER_CURRENCY`); "Rs 1,245,000.00", paisa muted, a minus sign
    and never red; a compact lakh/crore formatter for summaries ("Rs 12.4
    lakh", "Rs 6,870 crore"). Decimals travel as strings end to end: Python
    `Decimal` → JSON string → TS string → BigInt for maths. No float anywhere.
    Applied to `Product.sales_price`/`cost` and `Contact.credit_limit`.
  - `TIME_ZONE = 'Asia/Karachi'`. It now matters: "today", "overdue" and any
    date computed on the server depend on it. `/api/auth/me` sends the
    currency and time zone so the browser formats with the same ones.
- **Part 3, computed fields.** `Schema.computed = {'margin': {'label',
  'type', 'expression': F('sales_price') - F('cost')}}`. The scoping function
  annotates them, so they sort, filter and aggregate in the database. Never in
  the write allowlist, never audited, hidden when any field they derive from
  is unreadable. The UI marks them with Σ and a tooltip ("Calculated: Sales
  price − Cost") generated from the expression. Today-dependent values are
  supported with `days_since('field')` (tested with a mocked today, not used
  by any model yet).
- **Part 4, related lists and list filters.** `Schema.related_lists =
  [{'relation': 'children', 'label': 'People', 'columns': [...]}]`. The form
  renders each with the ordinary `ListRenderer`, embedded and filtered to the
  record: count in the header, the first 10 rows, then "View all 37" to the
  full list with the filter on. Shown only if the user can view the target and
  read the link; Add only with add permission and a writable link, and it
  opens the new record in a peek with the link prefilled and locked. Generic
  list filter `?field=value` (exact match, readable fields only, else 400).
  Proved with a company's People and Products supplied.
- **Part 5, Contact commercial terms.** `payment_terms_days` (integer,
  default 30, max 365), `credit_limit` (currency, optional, ≥ 0),
  `customer_since` (date, optional), in a "Commercial" group. Additive
  migration with a database default, applied to Neon. Seed values for Acme,
  Globex, Northwind and Marcus (only where empty).

### Decisions, one line each

- **Currency is declared, not inferred** (`field_types = {'sales_price':
  'currency'}`): a `DecimalField` can be a quantity or a rate; only the author
  knows it's money.
- **Computed fields are database expressions, not Python properties**, so
  sorting and filtering by margin happens in Postgres across all rows, not on
  one page of them.
- **A computed field's description is generated from its expression**, so the
  tooltip can't drift from the maths.
- **Related lists name the reverse relation** (`children`) and the engine
  finds the link field and target from it: one word for the author, nothing
  to keep in sync.
- **Prefill travels in the URL** (`/core/contact/new?parent=4`, or inside the
  peek param), so a prefilled new record survives a reload and opens in any
  surface; the form locks prefilled fields.
- **Renderer capabilities added as props, as the second law asks:**
  `ListRenderer` gets `filter`, `columns`, `variant: 'embedded'`, `maxRows`,
  `onTotal`, `onClearFilter`; `FormRenderer` gets `prefill`; field components
  get `restricted` and `computed`. No container-specific code inside them.
- **The column chooser now offers every readable field**, not only the
  declared columns, with "Reset to default": needed to show `customer_since`
  in the list without making it a default column.
- **A list refetches when a record it doesn't hold changes**, so a related
  list's count updates after Add (a partial answer to stale views).
- **"Restricted" is muted, not italic**: italics clipped at 13px in a cell.

### Definition of done

1. **Pass.** Backend suite: 101 tests OK, including the S-2 denials: linking
   to a record outside the user's scope (same error as a nonexistent one),
   label withheld and flagged restricted, computed field not writable and not
   audited, computed field hidden when its source is restricted, list filter
   on an unreadable field refused, Clerk cannot archive or change
   `tax_id`/`credit_limit`, related list hidden from a user who can't see the
   target.
2. **Pass.** `npx tsc -b`; `npm run build`; lint shows only the six earlier
   warnings.
3. **Pass.** Gallery: all 8 states for date (plus the open picker), integer
   and currency; datetime display; the calculated mark; a restricted link.
   `docs/design/s2/gallery-{1440,1024}-{light,dark}-*.jpg`.
4. **Pass, against a local copy, not Neon** (same method as S-1: the real API
   and frontend on 8200/5273, a throwaway SQLite database, generated users,
   the served password file deleted after). `docs/design/s2/1-…` to `6-…`:
   Globex shows People and Products supplied; Add from People opens the peek
   with Parent locked to "Globex Industries"; products sort by margin; margin
   shows the Σ mark; a date typed day-first and one picked from a preset.
5. **Pass.** Typing "30/10/2026" saved `2026-10-30` (read back from the API)
   and the contacts list shows "30 Oct 2026".

### Findings and gaps

- **Product seed prices are tiny for PKR** (they were written as dollars), so
  prices and margins read as a few rupees. Reseed with rupee-scale prices before the demo.
- **A person's display name includes the parent's name** ("Person (Company)").
  Once record rules exist, that leaks a company name to someone who can see
  the person but not the company. Fix alongside record rules.
- **The integer empty placeholder is "0"**, which reads like a value. Should
  be blank or "—"; small, left for Hassan's eye.
- **A Clerk can't set `tax_id` on create** (restricted for change, and create
  counts as change). Matches the decision literally; may not be what's wanted
  when a Clerk adds a company.
- **The date picker sits tight against the right edge at 1024.** It fits, with
  no margin. Align it to the input's end if it bothers.
- **Datetime has only a read-only state.** An editable datetime (a meeting
  time) needs its own states designed first.
- **Stale views remain** for records a list *does* hold (edited in a peek over
  that list): the list refetches only for records it doesn't know.
- `SchemaViewer.tsx`'s hardcoded model list (the law) is still open.

- Half-finished: nothing.
- **Next single action:** S-3 — draft the workflow-state schema (states,
  transitions, who may run each) on a throwaway model, starting from Hassan's
  answers below.

### Decide before S-3 (Hassan's calls)

1. **Invoice states:** Draft → Posted → Paid, plus Cancelled? Is "Partially
   paid" a state or just a balance?
2. **Who runs each transition:** may a Clerk post an invoice, or only draft
   it? Who may cancel a posted one?
3. **Reductions (credit notes, write-offs):** Draft → Requested → Approved /
   Rejected → Applied? The approver is a Manager, never the requester.
4. **Can a posted document be edited at all**, or only reversed with a credit
   note? (The usual ERP answer: reversed only.)
5. **Is "Overdue" a state or a computed flag** from the due date and today? (I
   would make it computed: nobody should have to move an invoice into Overdue.)


## 2026-11-01 | second machine | S-2 review fixes (before S-3)

Three fixes from Hassan's review of S-2, one commit each, with tests.

- **1. Product seed in rupees** (`5944ba7`). The catalogue was priced in
  dollars, so it read as a few rupees. `seed_products` now holds Pakistani
  B2B prices in PKR (A4 paper carton Rs 9,500; mesh office chair Rs 38,000;
  1.5-ton inverter AC Rs 245,000; freight, customs, storage and an annual
  maintenance contract as services), every cost below its price. It now
  **updates by SKU** instead of only creating (that is why the dollar prices
  had stuck): re-running reprices in place and deletes nothing, and a
  supplier is only chosen when a product is first created. New goods carry
  valid EAN-13 barcodes on Pakistan's 896 prefix. **Run on Neon:** 15 updated,
  6 created, 21 total. Tests in `backend/catalog/tests.py` (4). Seed writes
  bypass the audit log, as S-2's seeds did.
- **2. Empty never looks like data** (`fb0a623`). Integer, decimal and
  currency share `DecimalField`, whose placeholder was `0` / `0.00`; it is
  now the shared "Set <label>…" prompt, left-aligned, and an empty currency
  box hides its "Rs". The selection field's "Select …" became "Set …" too.
  A real zero shows "0" / "Rs 0.00". **Interpretation to check:** read-only
  places (the peek's view mode, a read-only form, list cells) show the muted
  "—" for empty, not the prompt: a prompt is an instruction and there is
  nothing to act on there, and "Set city…" down a list column would undo the
  density rules. CLAUDE.md's content rules now say so ("A placeholder must
  never look like data"). **Vitest added** (`npm test`; dev dependency only):
  rendered-HTML tests for empty vs zero in field, read-only value and list
  cell. Gallery section "empty vs zero" at `/dev/gallery`; screenshots
  `docs/design/s2/empty-vs-zero-1440-{light,dark}.jpg`.
- **3. Write-once field access** (`daea6f2`). A third grant level for a
  restricted field, beside view and change: **`add_<model>_<field>`, set it
  when creating a record, read-only after.** Declared like the others: the
  field stays in `restricted_fields`, the role gets the codename in
  `default_grants`; the permission row is created automatically after
  migrate. `field_access` returns `CREATE_ONLY`; `writable_fields(user, model,
  'add')` includes it and `'change'` doesn't, so POST accepts it and PATCH
  refuses it by name. `build_schema(model, user, mode=None)`: without a mode
  it still sends both `read_only_on_create` and `read_only` (what the form
  uses); `mode='create'|'edit'` collapses `read_only` to that mode, and
  `/api/schema/...?mode=` passes it (anything else is a 400). A write-once
  field carries `write_once.note`, "Set when the record is created. Ask a
  Manager to change it.", built from whichever roles hold the change grant.
  Applied: Clerk gets `add_contact_tax_id`; Manager keeps full write; the
  Clerk's `credit_limit` and `active` stay read-only on create. In the UI the
  field shows a small lock beside its label (the same pattern as the Σ mark)
  with that note as its tooltip, in the create form while still editable and
  read-only afterwards. **Applied on Neon** (`migrate` + `seed_roles`).
  Tests: `backend/foundation/test_write_once.py` (13: Clerk creates with a
  tax ID, accepted and audited; Clerk PATCH refused by name, no audit row;
  Manager PATCH accepted, audited with before/after; schema in both modes;
  the unknown mode refused) and `frontend/src/fields/writeOnce.test.tsx` (3).
  Browser-checked as a real Clerk: editable with the lock on a new company,
  read-only with the lock on Acme; `docs/design/s2/write-once-clerk-*.jpg`.

- Verification: backend **117 tests pass** (12 minutes against Neon's test
  database); frontend 12 Vitest tests pass; `tsc -b` clean.
- New on this machine: `dev-clerk-home`, a Clerk-role test account
  (`DEV_CLERK_*` in this machine's `.env`, generated). Separate from the
  office machine's Clerk account on purpose: `seed_roles` resets the
  password of the account it's given.
- `npm audit`: 6 findings (2 low, 4 moderate), all inside the `shadcn` CLI's
  dependency tree (`deepmerge`, `minimatch`); none ship in the bundle, none
  came from Vitest.

- Half-finished: nothing.
- **Next single action:** S-3, draft the workflow-state schema (see the next
  entry).

- Decisions for the Notion Decision Log: write-once as a third field-grant
  level (`add_` on the field), reusable for bill, connection and
  bill-of-lading numbers in S-5/S-6.

## 2026-11-01 | second machine | S-3 (backend): workflow states, numbering, approvals

The engine for S-3, drafted on a throwaway model. No UI yet: that's the
second half of S-3.

- **Hassan hasn't answered the five S-3 questions,** so these are my drafted
  answers, built into the lab model. Correct any of them and the change is
  data in `Schema`, not code:
  1. **States:** Draft → Posted, plus Cancelled. Paid, Partially paid and
     Overdue are *computed* from payments and the due date, never stored.
  2. **Who:** a Clerk drafts and posts; only a Manager cancels.
  3. **Reductions** (credit notes, write-offs, discounts): Draft → Requested
     → Approved / Rejected. The approver needs the grant **and** must not be
     the requester, whatever their role.
  4. **Posted documents are never edited, only reversed** (a credit note
     against them).
  5. **Overdue is computed**, in the organisation's time zone (Karachi).

- **Workflow, declared in the Schema** (`foundation/workflow.py`):
  `Schema.workflow = {'field', 'locked', 'transitions': {name: {label, from,
  to, confirm?, records_actor?, not_by?}}}`. The state field must be
  `editable=False` (checked at startup), so nothing but a transition moves
  it. Each transition is its own permission, `<transition>_<model>` ("Can
  post invoice"), created after migrate and handed out through
  `default_grants` like any other.
- **The schema** carries `workflow: {field, states, locked, transitions}`,
  with **only the transitions this user holds**: one they lack isn't in it at
  all. Each record's envelope carries `workflow: {available, locked}`, which
  is what this user can do to *this* record now (granted, right state, not
  barred). The state field and document number are now in the schema as
  read-only fields; other server-owned fields (audit stamps, the requester)
  stay out.
- **Running one:** `POST /api/data/<app>/<model>/<pk>/transitions/<name>/`
  (`data/transitions.py`). It answers in a fixed order, so each answer means
  one thing: **404** for an invisible record or unknown transition; **403**
  for no grant; **409** for the wrong state ("this lab document is
  Posted"); **403** for `not_by` ("You are this lab document's requester, so
  someone else has to do this."). The state change, the actor stamp and the
  audit entry (new action `transition`, shown as "Moved") commit together
  under a row lock.
- **Locked states refuse edits:** a PATCH to a posted record is a 409, "This
  … is Posted, so it can't be edited."
- **Document numbers** (`foundation/numbering.py`): `Schema.numbering =
  {'field', 'prefix', 'digits'}` gives `INV-2026-00001`, restarting each year.
  One `Sequence` row per model and year, locked with `SELECT … FOR UPDATE`
  inside the creating transaction: a second create waits for the first to
  commit, and a refused create gives its number back (no gaps from
  validation errors).
- **The lab:** `backend/workflowlab/`, `LabDocument`, installed **only while
  tests run**. It has a migration because the test database is built by
  migrating; Neon never sees the table and nobody's sidebar shows it.
- **Applied on Neon:** `foundation.0003` (the sequence table).

- Gate, all tested (`backend/workflowlab/tests.py`, 21 tests):
  - a transition the user lacks is refused by the API (403) and absent from
    their schema: the Clerk can't cancel or approve;
  - two concurrent creates never get the same number: 8 threads with their
    own connections, released together, 24 creates, 24 distinct numbers with
    no gaps;
  - a requester approving (or rejecting) their own reduction is refused, and
    another Manager's approval goes through and is audited.
- Verification: full backend suite (see below).

- Half-finished: S-3's UI. The renderer doesn't show a state badge,
  transition buttons or a locked form yet.
- **Next single action:** S-3 UI, generically from `schema.workflow` and the
  envelope's `available`: a state badge in the record header, the available
  transitions as buttons in the save-bar area (with `confirm` as a dialog),
  and a locked record drawn read-only with the reason. Then the create /
  archive / empty / error states the sprint lists.

- Decisions for the Notion Decision Log: workflow transitions are
  per-transition grants declared in the Schema; posted documents are
  reversed, never edited; numbering by a locked per-year sequence row.

## 2026-11-01 | second machine | S-3 UI (in progress) and fast tests

- **Fast tests:** `TEST_DATABASE_URL` points tests at a local Postgres 18
  (README, "Fast tests"); MD5 hasher in tests only. Suite: 138 tests in
  10.4s locally vs 963s on Neon.
- **Backend:** workflows declare `path`, `tones`, per-transition `hint`;
  a transition that hands work to an approver gets "This goes to a Manager
  for approval." Envelope `workflow` has `available`, `locked`,
  `locked_reason`, `waiting` (who can act, in words). Exit states carry
  `after`. `Schema.archive_field` (Contact, Product): archive is an edit of
  that field, offered only to who may write it; archived records leave lists
  and pickers unless `?active=false`. Lab split into `LabBill` and
  `LabAdjustment`; `CLICKER_LAB=1` installs it in development (applied on
  Neon, seeded with `manage.py seed_lab --manager dev-verify --clerk
  dev-clerk-home`). Note: the office machine's migrate (without the flag)
  strips lab permissions from Manager; set CLICKER_LAB=1 there too.
- **Frontend:** `WorkflowBar` (stepper, next step in words, one primary
  button, never a disabled button: a sentence says whose step it is),
  `StatusChip`, `StatePanel` (empty, no match, archived-empty, error, 403,
  404), archive confirm naming the record + archived notice + Restore + Undo
  toast, list "Archived" switch, state chips and mono numbers in cells,
  "Assigned when saved" on a new record's number, 403 on /new without the
  create grant. Gallery section "workflow / archive / states" at the top of
  /dev/gallery. Tests: backend 149, frontend 19.
- Screenshots so far (Clerk, light): `docs/design/s3/`.

- Half-finished: Manager-view and dark-mode screenshots. Signing the browser
  pane in needs a person: reading a stored test password was (rightly)
  blocked.
- **Next single action:** sign the browser pane in as `dev-verify`, then
  capture at 1440 light and dark: gallery #workflow and #states, an
  adjustment requested by the Clerk (Approve/Reject), one the Manager
  requested (waiting), contact archive confirm, archived contact, and the
  dark versions of the Clerk screens. Then Hassan judges before S-4.
