# Demo sprint: investor demo, Saturday 7 November 2026

Seven sessions. Every session ends with a **binary gate**: it passes or it doesn't, and a session doesn't start until the one before it has passed (or its failure has been cut, using the order below).

Clicker is an Odoo **replacement**, never a "replica". Clean-room: Odoo's docs and behaviour may be read, its source never.

## Sessions

| # | Scope | Gate (binary) |
| --- | --- | --- |
| **S-1** | Security foundation: base model with audit fields, one enforcement point (`data/access.py`), permissions through the schema (model + field rules, Groups), write allowlist, filter/sort/search on readable fields only, append-only audit log, login throttling, production settings behind `CLICKER_ENV`, sign-in providers endpoint, Manager and Clerk roles | Backend tests pass including denial tests (Clerk: `tax_id` read-only, PATCH to it rejected, products 404 and absent from registry, unreadable filter/sort refused, one audit row per write, 6th failed login locked); `tsc -b` passes; `check --deploy` passes with the production flag; Clerk and Manager verified in the browser; `pip-audit` and `npm audit` run |
| **S-2** | Field types `date`, `integer`, `currency` (PKR); computed read-only fields; `one_to_many` related lists inside a form | Each new type renders in all 8 states in the gallery; a computed field is read-only in schema and API (a write to it is rejected); a related list shows a parent's children and opens them through `RecordRef` |
| **S-3** | Workflow states declared in the `Schema` (states, transitions, who may run them), enforced server-side; create / archive / empty / error states; concurrency-safe document numbering; reductions need an approver who isn't the requester | A transition the user lacks is refused by the API and absent from their schema; two concurrent creates never get the same number (test); a requester approving their own reduction is refused (test) |
| **S-4** | Filter bar, saved views, group-by with sums, summary strip of database aggregates, board view | Filters accept only readable fields (S-1 rule holds); group sums equal a database aggregate (test); a saved view survives reload and another machine |
| **S-5** | Shared invoicing and receivables core (Bills, Payments with oldest-first allocation, Adjustments); Journey A: water utility bulk billing and recovery (Connections, Tariffs, Recovery cases) | A payment allocates oldest-first (test); a posted bill can't be edited, only reversed (test); bulk billing for a tariff produces one bill per connection; Journey A runs end to end in the browser |
| **S-6** | Journey B: Karachi port clearing agency (Jobs with stages and a demurrage countdown, Containers, Disbursements; the invoice drafts itself at gate-out); team and roles page with "View as role" | Gate-out drafts exactly one invoice (test); "View as role" shows exactly what that role's schema allows, using the same permission function as the API; Journey B runs end to end in the browser |
| **S-7** | Freeze and rehearse | Two full rehearsals without a code change; `check --deploy`, `pip-audit`, `npm audit` clean; nothing new merged |

## Status (3 Nov 2026)

| # | Gate |
| --- | --- |
| S-1 | Passed (30 Oct) |
| S-2 | Passed (30 Oct; review fixes 1 Nov) |
| S-3 | Passed (1 Nov); screenshots completed 3 Nov |
| S-4 | Passed (3 Nov): filters on readable fields only, group sums equal a database aggregate (tests), a saved view survives reload (browser) and lives in the shared database, so it follows to the other machine. **Board view cut** (to the Parking Lot). |
| S-5 | Next |

## Cut order, if behind

Cut **whole items, in this order**, never half-build one. Cut items go to the Notion Parking Lot.

1. Command palette
2. Printable bill
3. Automation-rules UI
4. File field
5. Optimistic locking
6. Setup checklist
7. Team page
8. Board view

**Never cut security.** S-1's rules hold for every later session; nothing ships that bypasses them to save time.

## Hooks S-1 leaves for later sessions

- **Server-owned fields** (`created_*`, `updated_*`, and later workflow state, computed fields, company) are never in a client's writable set.
- **The permission check takes a user**, never `request.user` implicitly, so "View as role" (S-6) calls the same function with a stand-in user.
- **Record rules and tenancy** plug into `data/access.py`'s `scoped_queryset()`; it is the only place a queryset for a user is built.
- **The audit log** feeds the per-record activity timeline (S-4/S-6) through `GET /api/data/<app>/<model>/<id>/history/`.
