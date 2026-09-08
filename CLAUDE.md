# Clicker

Modular business application platform. An open reinterpretation of the Odoo model, built schema-first.

Full documentation lives in Notion. This file is the working context for Claude Code sessions and should be enough to work from without it.

---

## What this is

Clicker is **not** a suite of business apps. It is a framework that generates business apps from model definitions.

A module author defines data models. The platform derives the API, the list views, the form views, the search filters, and the permissions from those definitions. Adding a module means declaring models and refining generated views — never building screens.

## The loop

```
Model definition (Django)
  → Schema endpoint (JSON)
    → Renderer (React)
      → Form view + List view
```

A module author touches only the first box. Everything else is derived.

## The law

**If a change requires editing the renderer to support a specific module, the schema design is wrong.**

If you find yourself writing `if (model === 'contact')` anywhere in the frontend, stop and fix the schema instead. This rule is the entire product. Violating it once is how this becomes forty hand-built apps.

---

## Stack

| Layer | Choice |
| --- | --- |
| Database | PostgreSQL via Neon (cloud, shared across machines) |
| Backend | Django + Django REST Framework |
| Frontend | React + shadcn/ui + lucide-react |
| Tables | TanStack Table (headless) |
| Auth | Django built-in |
| Hosting | Cloudflare Pages / Vercel (frontend), Render (backend) — later |

Target: zero recurring cost through the first investor demo.

---

## Working model

**Claude produces, Hassan judges.**

Hassan is a product designer, new to backend work. He is the design authority and the decision-maker; he is not the person who should be writing specifications for Claude to implement.

- Claude drafts everything with real values: tokens, components, schema formats, migrations, content rules.
- Hassan reacts to running output, not to proposals.
- Do not end a turn by assigning Hassan production work. If something needs deciding, draft it and let him correct it.
- Explain backend terminology when it comes up. Do not assume familiarity with Django, ORM, or REST conventions.

**The one exception:** density and visual craft are the product thesis and Hassan's call. Competent defaults are what every AI-built product looks like. Push him to be hard on the output.

---

## Current state

**Phase 1 — The Machine.** Nothing is built yet. The repo starts here.

### Phase 1 exit criteria
- [ ] Adding a Django model produces working form and list views with **no React edits**
- [ ] At least 8 field types render correctly in all their states
- [ ] One `many_to_one` relationship works end to end

### Build order
1. Django project scaffold, `Country` and `Contact` models
2. Django Admin running locally, as a reference for the pattern (never shipped as Clicker's UI)
3. Schema endpoint returning model structure as JSON
4. React app fetching schema
5. Field components for the registry types Contacts needs
6. Form renderer, then list renderer
7. Add a `Product` model — its screens must appear with zero frontend changes

Step 7 is the investor demo.

---

## Contacts module spec (the first slice)

One `Contact` model holds both people and companies. **Not** two models — every other module would then need polymorphic references.

### Contact

| Field | Type | Required | Visible when |
| --- | --- | --- | --- |
| name | text | Yes | Always |
| type | selection (`person` \| `company`) | Yes | Always, default `person` |
| parent | many_to_one → Contact | No | Always |
| job_title | text | No | type = person |
| tax_id | text | No | type = company |
| active | boolean | Yes | Always, default true |
| email | email | No | Always |
| phone | phone | No | Always |
| mobile | phone | No | Always |
| website | url | No | type = company |
| street, street2, city, state, zip | text | No | Always |
| country | many_to_one → Country | No | Always |
| is_customer | boolean | No | Always |
| is_vendor | boolean | No | Always |
| notes | longtext | No | Always |
| tags | many_to_many → Tag | No | **Stretch — cut if Phase 1 runs long** |

### Country
`name` (text, required), `code` (text, required, unique, uppercase ISO-2). Seeded, not user-created.

### Behaviour
- **Display name:** company → `name`. Person with parent → `name (parent.name)`. Person without → `name`.
- **Hierarchy:** the company is the parent, the person is the child. `parent` must be `type = company`, may not be self, may not form a cycle.
- **List defaults:** columns `name, type, email, phone, city, country`; sort `name` asc; filter `active = true`.
- **Search:** `name, email, phone, tax_id`.
- **Delete:** restricted when referenced. Archiving via `active = false` is the intended path. An ERP that lets you delete a customer with historical invoices is broken.
- **Conditional visibility:** driven by schema, never by frontend logic. This is the one genuinely new renderer capability Contacts demands, and every later module needs it.

### Explicitly out of scope for v0
Multiple addresses. Commercial-entity resolution (the computed lookup to the topmost parent company — needed before invoicing, deferred because computed fields are a Phase 3 schema problem). Avatars and logos. Import, export, dedupe, merge. Activity timeline. Bank details, payment terms, credit limits. Industry, employee count, and other CRM enrichment. Multi-company isolation. Salutations. Language and timezone.

When something feels missing during the build, check this list first. If it's here, it was a decision.

---

## Field type registry

Every field in every module must be one of these. Adding a type is deliberate and requires designing all its states first.

`text` · `longtext` · `integer` · `decimal` · `boolean` · `date` · `datetime` · `selection` · `many_to_one` · `one_to_many` · `many_to_many` · `email` · `phone` · `url` · `currency` · `binary`

Each type has **two** components, not one:
- **Form component** — the labelled input where editing happens
- **List cell** — compact read-only display inside a table row

### States every type needs
`default` · `focused` · `filled` · `disabled` · `readonly` · `error` · `required-and-empty` · `loading`

- Readonly ≠ disabled. Disabled means not editable right now; readonly means never editable by this user. They look different.
- Loading matters for anything that fetches — principally the pickers.
- Required-and-empty is not an error state.

### What shadcn does not give us
`many_to_one` (schema-driven target model, async search, display-name rule, domain filtering, create-new path), `many_to_many` (multi-select, chip overflow), `currency`, `phone` masking, `binary`. The `many_to_one` picker is the hardest and most important component in the system.

### Content rules
The renderer composes screens without a designer present. Every component needs a defined answer for content it has never seen: very long values, very long labels, absent values, min/max column widths. Decide it in the component — there is no screen-level place to decide it.

---

## Design system

Tokens live in `tokens.css` and are the source of truth. Never hardcode a colour, spacing value, radius, or control height.

- **Typeface:** IBM Plex Sans (UI), IBM Plex Mono (record identifiers and codes **only** — not labels, not headings)
- **Body size:** 13px. List cells 12px. Column headers 11px.
- **Accent:** ink violet `#4a3fcf`. Chosen because green/amber/red carry data meaning in status chips and the accent must not compete with them.
- **Row height:** 34px default, 28px compact, 42px comfortable
- **Control height:** 30px default
- **No zebra striping.** Hairline row borders.
- **Tabular figures** on all numeric columns.
- **No shadows on cards.** Borders only — shadows cost vertical space and read as consumer software.
- **Motion only in response to user action.** Nothing animates on its own. Respect `prefers-reduced-motion`.

`tokens.css` contains a shadcn bridge at the bottom mapping Clicker tokens onto shadcn's variable names, so copied-in components inherit density and palette automatically.

### Density is the thesis
ERP users are power users in this software all day. The instinct toward generous consumer spacing is wrong here. Target: Odoo's information density with contemporary craft.

### UX reference set
Attio (closest analogue — user-definable records, effectively schema-driven), Twenty (open-source, inspectable), Linear (density with craft), Retool and Airtable (field-type vocabulary).

Monday.com for table **mechanics only** — column type awareness, inline cell editing, status chips, footer summaries, grouped rows, column reorder/resize. Not its visual language.

**Not** a reference: task managers and consumer productivity apps. Their density and field variety are an order of magnitude below an ERP's.

### Atomic design stops at organisms
Atoms, molecules, organisms apply. **Templates and pages do not exist in this system** — the renderer generates them from schema. If a "Contacts page template" is ever being designed, the thesis has been abandoned upstream. What replaces those tiers is the schema format: the layout system, expressed as data.

---

## Legal and IP

**Clean-room implementation.** Odoo Community is LGPLv3. Read Odoo's docs and observe its behaviour; never read or copy its source into Clicker. Derived code creates licensing obligations that surface in investor technical due diligence.

**Machine separation.** Hassan has a full-time product design job. All Clicker code stays on his personal machine. Employment IP assignment clauses commonly cover work created on company equipment or time, and an ownership cloud kills funding rounds.

---

## Two-machine workflow

Hassan works across an office machine and a home machine.

- **GitHub is the source of truth.** Push at the end of every session without exception, even mid-thought, even broken. A `wip:` commit on a branch is fine.
- **Neon is the shared dev database.** One cloud database, both machines connect to it. No divergent local data, no migration drift.
- **`.env` is never committed.** The connection string lives in a password manager. `.env.example` shows the shape.
- **Update `docs/BUILD_LOG.md` before closing the laptop.** What was done, what is half-finished, and the next single action. The third one matters most.

---

## Scope discipline

This is a part-time side project alongside a full-time job. Assume roughly 6–10 focused hours per week.

Framework work produces nothing visible for weeks. The temptation during that stretch is to build something satisfying instead of something structural, and the satisfying things are almost always stretch scope.

- Stretch scope is cut **first and completely**. Never half-built.
- Cut items, never quality. Quality is the entire thesis against Odoo.
- Cut items go to the Notion Parking Lot, not the bin.
- Do not build stretch scope early because it feels better than the hard part.

---

## Conventions

- Python: `snake_case`, Django defaults, `black` formatting
- React: functional components, TypeScript, colocated by feature
- Field names in models match field names in schema JSON exactly — no translation layer
- Migrations are committed, always
- One logical change per commit, present-tense messages
