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
| S-5 | Passed (4 Nov): oldest-first allocation, locked posted bills, one bill per connection (tests); Journey A walked through as Manager, Billing officer, Cashier and Recovery officer on the local database; slowest screen 122 ms. **Neon not seeded**: the demo runs on local Postgres (see Demo machine). |
| S-6 | Passed (4 Nov), nothing cut: Journey B on its own database (`clicker_port`), the invoice drafts itself at gate-out (one bill, also under a race), team page and View as role (equality test over every role and model), lakh grouping, statement header, second approver above Rs 1 crore, bulk Assign owner. |
| S-7 | Next. Re-measure on the demo laptop in S-7 (the timings below the Demo machine steps were taken in the cloud container). |

## Demo machine

The demo runs on the laptop it is presented from, on a **local Postgres**, not Neon: no network, no latency, nothing shared. **There are two demos and two databases**: the water board (`clicker_demo`) and the clearing agency, Harbour Gate Clearing (`clicker_port`). They never share a database (contacts are shared, so a port owner would otherwise see federal ministries), and each backend exposes only its own journey's models and roles (`CLICKER_JOURNEY`). Setting a laptop up from nothing takes about **3 minutes of computer time** (measured: database 1 s, migrate 6 s, seed 170 s) plus the installs. Do it on the machine you will present from, then again the evening before, to prove it.

**Linux or macOS: one script.** With Postgres running, `backend/.venv` and `frontend/node_modules` installed, and `DEMO_DATABASE_SERVER` in `.env`, `scripts/demo_setup.sh` creates `clicker_demo` and `clicker_port` (`--fresh` drops them first), migrates, seeds both journeys and prints each one's headline numbers. It creates a `.env` with a generated `SECRET_KEY` if there is none. Cloud run, fresh databases: **227 s** (water 216 s, clearing agency 11 s, migrations included). It ends by printing the two commands that run each journey on its own ports; on Windows keep using the steps below and `scripts\demo-stack.ps1 water|clearance`, which switches journeys in a few seconds.

**Linux or macOS, from nothing** (needs Git, Python 3.12 or newer, Node 20 or newer, and a Postgres you can create databases in; the Windows steps below download one that needs no installer):

```bash
git clone https://github.com/abuMuhammad101/Clicker.git && cd Clicker
python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt
npm --prefix frontend install
# Postgres: macOS `brew install postgresql@17 && brew services start postgresql@17`; Debian or Ubuntu `sudo apt install postgresql`.
# Put its address in .env (add `user:password@` if your server asks for one), with a secret key:
printf 'DEMO_DATABASE_SERVER=postgresql://postgres@127.0.0.1:5432\nSECRET_KEY=%s\nDEBUG=True\nALLOWED_HOSTS=localhost,127.0.0.1\n' \
  "$(backend/.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(50))')" > .env
scripts/demo_setup.sh          # about 4 minutes, prints each journey's headline numbers
scripts/demo_stack.sh clearance    # http://localhost:5274 ; water: http://localhost:5273
```

`scripts/demo_stack.sh` waits until the app answers, and `scripts/rehearse.sh` runs both journeys end to end through the browser from a fresh seed (about 5 minutes, exits non-zero on any failure; it needs Playwright, which is not a project dependency: once, in the repo folder, `npm install --no-save playwright && npx playwright install chromium`).

**Timings, cloud (measured 4 Nov in the build container, local Postgres with fsync off, median of 7). Re-measure on the demo laptop in S-7.**

| Screen | cloud |
| --- | --- |
| Jobs by stage (list + group headers) | 140 ms |
| Demurrage at risk | 43 ms |
| A job record with schema and activity | 95 ms |
| That job's two related lists | 59 ms |
| Water: Bills, Aging view | 96 ms |
| Water: a statement's five related lists | 119 ms |

You need Git, Python 3.12 or newer, and Node 20 or newer (this laptop: Python 3.14, Node 24). All commands are PowerShell, run from the repo folder unless they say otherwise.

**1. Get the code and its dependencies**

```powershell
git clone https://github.com/abuMuhammad101/Clicker.git
cd Clicker
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd frontend; npm install; cd ..
```

**2. A local Postgres that needs no installer, no admin rights and no service.** (Skip this block if Postgres 17 or newer is already installed: create a database called `clicker_demo` in it and change the port in step 3.) This one keeps its data safe on a crash, which a presentation laptop should.

```powershell
$d = "$env:LOCALAPPDATA\clicker-demo-pg"; New-Item -ItemType Directory -Force $d
curl.exe -L -o "$d\pg.zip" https://get.enterprisedb.com/postgresql/postgresql-18.3-1-windows-x64-binaries.zip
tar.exe -xf "$d\pg.zip" -C $d --exclude "pgsql/pgAdmin 4" --exclude pgsql/doc --exclude pgsql/symbols --exclude pgsql/StackBuilder --exclude pgsql/include
& "$d\pgsql\bin\initdb.exe" -D "$d\data" -U postgres --auth=trust --encoding=UTF8 --locale=C
Add-Content "$d\data\postgresql.conf" "listen_addresses = '127.0.0.1'`nport = 5434"
& "$d\pgsql\bin\pg_ctl.exe" -D "$d\data" -l "$d\server.log" start
& "$d\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5434 -U postgres -c "create database clicker_demo"
& "$d\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5434 -U postgres -c "create database clicker_port"
```

It listens on this machine only (`127.0.0.1`) and holds only demo data, so it has no password. **After every reboot, start it again** with the `pg_ctl ... start` line. Do that before opening the app.

**3. Tell the app about it.** Create `.env` in the repo folder (it is never committed):

```powershell
$key = backend\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(50))"
@"
DATABASE_URL=postgresql://postgres@127.0.0.1:5434/clicker_demo
SECRET_KEY=$key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
VITE_API_URL=http://localhost:8200/api
CORS_ALLOWED_ORIGINS=http://localhost:5273,http://127.0.0.1:5273
CSRF_TRUSTED_ORIGINS=http://localhost:5273,http://127.0.0.1:5273
DEMO_DATABASE_SERVER=postgresql://postgres@127.0.0.1:5434
"@ | Set-Content .env -Encoding utf8
```

Do **not** set `CLICKER_LAB`: the demo runs without the test-only lab models.

**4. Build the database and fill it**

```powershell
# the water board
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:5434/clicker_demo"; $env:CLICKER_JOURNEY = "water"
backend\.venv\Scripts\python.exe backend\manage.py migrate
backend\.venv\Scripts\python.exe backend\manage.py seed_demo --journey water --confirm clicker_demo

# the clearing agency (a second database; about 15 seconds)
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:5434/clicker_port"; $env:CLICKER_JOURNEY = "clearance"
backend\.venv\Scripts\python.exe backend\manage.py migrate
backend\.venv\Scripts\python.exe backend\manage.py seed_demo --journey clearance --confirm clicker_port
```

`CLICKER_JOURNEY` must match the journey: it decides which roles exist, and the seed refuses to run without it, or into a database that already holds the other journey.

`--confirm` must repeat the database's name, so it can never write somewhere you didn't mean. It prints no passwords. It ends with a line like `outstanding Rs 314.4 crore; 163.3 crore (52%) is more than 180 days overdue…` and `Done.`

It is **idempotent**: running it again adds nothing. Run it again and it adds whatever the calendar has moved on by (a new month's billing run, this week's payments); but for demo morning use a fresh seed (see below), not a re-run or a rebase.

**5. Run it: one command, either journey** (switching takes a few seconds; it stops whichever journey was running)

```powershell
scripts\demo-stack.ps1 water        # http://localhost:5273  (API :8200, database clicker_demo)
scripts\demo-stack.ps1 clearance    # http://localhost:5274  (API :8201, database clicker_port)
```

It reads `DEMO_DATABASE_SERVER` from `.env`, starts the backend with `CLICKER_JOURNEY` and `DATABASE_URL` for that journey, and the frontend with `VITE_API_URL` pointing at the right backend.

**On the morning of the demo, reset with a fresh seed, not a rebase.** `scripts/demo_setup.sh --fresh` (Linux, macOS, Git Bash) drops and rebuilds both databases; on Windows follow `docs/DEMO_RESET.md`, which has the PowerShell commands. A fresh seed is the only reset that makes everything consistent with today, including the activity trail. `seed_demo ... --rebase-dates` still exists and moves every calendar date by the days since the seed, but **it does not move the activity trail** (it keeps its real times, so the trail reads "3 days ago" beside records dated today) and it prints a warning saying so. Use it only to nudge a database you cannot reseed.

**6. Who can sign in.** The seed creates seven fictional staff (all of them in `.env` as `DEMO_PASSWORD_<NAME>`, generated, never printed):

| Sign in as | Role | Use it to show |
| --- | --- | --- |
| `ayesha.khan` | Manager | everything; approving a write-off |
| `bilal.ahmed`, `sana.malik` | Billing officer | bills, billing runs, requesting a reduction |
| `imran.siddiqui` | Cashier | posting a payment and watching it allocate |
| `farhan.raza`, `nida.hussain` | Recovery officer | only their own cases |
| `zainab.qureshi` | Auditor | reads everything, changes nothing |

The clearing agency's five (Harbour Gate Clearing (demo)):

| Sign in as | Role | Use it to show |
| --- | --- | --- |
| `hamza.farooqui` | Owner | the gate-out of JOB-2026-0007 and its drafted invoice; **View as role** (user menu) |
| `mehwish.rauf` | Coordinator | Jobs by stage, Demurrage at risk |
| `sadia.anwar` | Documentation | stages up to Assessed, and no money anywhere |
| `rashid.baloch` | Field agent | only his own jobs; another's is "not available" |
| `ibrahim.qazi` | Accounts | approving disbursements, posting the invoice |

The water board also has a second Manager, `tariq.mehmood`, who completes any reduction above Rs 1 crore.

To get the **same passwords on two machines**, copy the seven `DEMO_PASSWORD_…` lines from one `.env` into the other **before** step 4; the seed uses what it finds there and generates only what is missing. Otherwise open `.env` and read them there.

**7. Check it** (30 seconds)

```powershell
backend\.venv\Scripts\python.exe backend\manage.py measure_demo --user ayesha.khan
```

prints how long the Bills aging view and a consumer's statement take (on the build laptop: about 100 ms and 160 ms). For the clearing agency add `--journey clearance` (Jobs by stage about 110 ms; a job record with its related lists about 160 ms). If any request fails, the database isn't seeded.

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
