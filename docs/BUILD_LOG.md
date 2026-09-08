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
