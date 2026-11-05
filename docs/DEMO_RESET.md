# Demo morning: reset, start, sign in

One page. Reset either journey in under five minutes, start the stack, open the right sign-in. Setting a laptop up from nothing is a different page: **Demo machine** in `docs/DEMO_SPRINT.md`.

**Reset with a fresh seed, never a rebase.** A fresh seed makes every date, every "3 days ago" and every total consistent with today. `--rebase-dates` moves dates but not the activity trail, and says so.

**Order matters for time.** The water board's seed takes about **216 seconds**; the clearing agency's about **11 seconds**. Start the water one first and do everything else while it runs.

## Windows (the demo laptop)

Run from the repo folder, in PowerShell. Two windows, so the two seeds run side by side (they are separate databases and never touch each other).

**0. Postgres is up?** (after a reboot it is not)

```powershell
$d = "$env:LOCALAPPDATA\clicker-demo-pg"
& "$d\pgsql\bin\pg_ctl.exe" -D "$d\data" status
# "no server running"? start it:
& "$d\pgsql\bin\pg_ctl.exe" -D "$d\data" -l "$d\server.log" start
```

**1. Stop whatever is running, in both windows' favour**

```powershell
Get-NetTCPConnection -LocalPort 8200,8201,5273,5274 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

**2. Window A: the water board, first (about 216 s)**

```powershell
$psql = "$env:LOCALAPPDATA\clicker-demo-pg\pgsql\bin\psql.exe"
& $psql -h 127.0.0.1 -p 5434 -U postgres -c "drop database if exists clicker_demo with (force)"
& $psql -h 127.0.0.1 -p 5434 -U postgres -c "create database clicker_demo"
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:5434/clicker_demo"; $env:CLICKER_JOURNEY = "water"
backend\.venv\Scripts\python.exe backend\manage.py migrate --verbosity 0
backend\.venv\Scripts\python.exe backend\manage.py seed_demo --journey water --confirm clicker_demo
```

**3. Window B: the clearing agency, second (about 11 s)**

```powershell
$psql = "$env:LOCALAPPDATA\clicker-demo-pg\pgsql\bin\psql.exe"
& $psql -h 127.0.0.1 -p 5434 -U postgres -c "drop database if exists clicker_port with (force)"
& $psql -h 127.0.0.1 -p 5434 -U postgres -c "create database clicker_port"
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:5434/clicker_port"; $env:CLICKER_JOURNEY = "clearance"
backend\.venv\Scripts\python.exe backend\manage.py migrate --verbosity 0
backend\.venv\Scripts\python.exe backend\manage.py seed_demo --journey clearance --confirm clicker_port
```

**4. Start the journey you are showing first** (a few seconds; it stops the other one)

```powershell
scripts\demo-stack.ps1 clearance      # http://localhost:5274   (or: water, http://localhost:5273)
```

Only the journey you are about to present has to be reset and started. If you show both, do the second one's reset while the first is being presented.

## Linux or macOS

```bash
scripts/demo_setup.sh --fresh              # both journeys, water first: about 227 s in all
scripts/demo_setup.sh --fresh --only clearance     # just the clearing agency: about 13 s
scripts/demo_stack.sh clearance            # http://localhost:5274  (or: water, http://localhost:5273; both: "both")
```

## What "healthy" looks like

Each seed ends with its headline numbers and `Done.`. If these are not what you see, reset again before doing anything else.

**Water board** (the figures move a little with the calendar):

```
outstanding Rs 313.3 crore; 163.6 crore (52%) is more than 180 days overdue, 95% of that from federal bodies and military installations
2518 bills, 1185 payments (80.7 crore), 13 adjustments, 95 recovery cases
logins: ayesha.khan (Manager), tariq.mehmood (Manager), bilal.ahmed (Billing officer), sana.malik (Billing officer), imran.siddiqui (Cashier), farhan.raza (Recovery officer), nida.hussain (Recovery officer), zainab.qureshi (Auditor); passwords are in .env
```

**Clearing agency** (these are exact; the story depends on them):

```
42 jobs: Booked 2, Documents in 2, GD filed 3, Assessed 8, Duty paid 7, Examined 6, Released 2, Gate-out 2, Closed 9, Cancelled 1
28 containers; 17 still inside the port
demurrage: 2 accruing (Rs 1,14,000.00 so far), 3 on their last 0 to 2 days, 0 with 3 to 5 days, 12 comfortable
live gate-out: JOB-2026-0007 (Makran Machinery Importers (demo)) is Released: invoice will be Rs 17,10,500.00 with 3 disbursements, 1 left out until approved
Accounts: 7 disbursements waiting for approval (Rs 10,45,500.00); 10 posted invoices (Rs 1,92,66,000.00), Rs 1,22,00,100.00 received in 6 payments
```

And on screen, signed in: Jobs by stage reads **Open jobs 32, At risk 5, To be invoiced Rs 53.1 lakh**; the water board's aging view reads **Outstanding Rs 313 crore**.

## Open the right sign-in

| Journey | Address | Sign in as | To show |
| --- | --- | --- | --- |
| Clearing agency | `http://localhost:5274` | `hamza.farooqui` (Owner) | the gate-out of JOB-2026-0007; View as role (user menu) |
| | | `mehwish.rauf` (Coordinator) | Jobs by stage, Demurrage at risk |
| | | `rashid.baloch` (Field agent) | only his own jobs |
| | | `ibrahim.qazi` (Accounts) | approving disbursements |
| Water board | `http://localhost:5273` | `ayesha.khan` (Manager) | the aging view, a statement, approving a write-off |
| | | `imran.siddiqui` (Cashier) | posting a payment |
| | | `bilal.ahmed` (Billing officer) | requesting a write-off |
| | | `farhan.raza` (Recovery officer) | only his own cases |

The password for each is `DEMO_PASSWORD_<NAME>` in `.env` (for example `DEMO_PASSWORD_AYESHA_KHAN`). Copy one without showing it on the screen:

```powershell
(Select-String -Path .env -Pattern '^DEMO_PASSWORD_HAMZA_FAROOQUI=').Line.Split('=', 2)[1] | Set-Clipboard
```

(Linux or macOS: `sed -n 's/^DEMO_PASSWORD_HAMZA_FAROOQUI=//p' .env | pbcopy`, or `xclip -selection clipboard`.) Sessions last 36 hours on a demo machine, so one sign-in in the morning lasts the day.

## The tour, the welcome and the sign-in screen (S-8)

- **Help (the ? in the top bar) > Take the tour** runs a 8 to 9 step tour of the journey you are in, as the role you are signed in as (a role sees only the steps about what it may see). Next, Back, Skip tour, Esc, and the arrow keys work; Esc puts it down and Help then says "Pick up the tour". Nothing starts by itself.
- The tour and the welcome are remembered **per person on the server**. A fresh seed (`demo_setup.sh --fresh`) forgets them, so after a reset everyone is new again: the welcome note shows once more, and the tour starts from step 1.
- Step 6 of the clearing agency tour waits for the gate-out: press **Gate out** on the highlighted job, confirm, and the tour moves on to the invoice that drafted itself. If you press Next instead, that step is skipped and the tour carries on.
- **Signed out on purpose?** The sign-in screen says "You've been signed out." once. Five wrong passwords for one name lock that name for 15 minutes ("Too many attempts. Try again in N minutes."); a fresh seed clears the lock.
- **Light, dark or the system's:** the user menu (your name, top right) has a Theme choice. It is per browser, so check it on the laptop you present from.

## If something is off

- **A page says it can't reach the API:** the stack is not running. Run step 4 again.
- **Sign-in is refused for the right password:** the database was reset after `.env` was written and the passwords differ; the seed reuses `DEMO_PASSWORD_*` lines it finds in `.env`, so this only happens if `.env` was replaced. Read the password again from `.env`.
- **Locked out after typing it wrong six times:** wait 15 minutes, or reset (a fresh database forgets the lock).
- **JOB-2026-0007 is already gated out** (someone rehearsed): reset the clearing agency, 11 seconds.
- **Slow first screen:** the very first request after a reset warms Postgres; reload once.
