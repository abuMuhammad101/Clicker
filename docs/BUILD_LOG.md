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
