# Clicker

A framework that generates business applications from model definitions.

Define a model. Get an API, a list view, a form view, filters, and permissions.
No screen is designed twice.

## Setup

```bash
git clone https://github.com/abuMuhammad101/Clicker.git
cd Clicker
cp .env.example .env    # fill in DATABASE_URL and SECRET_KEY
./setup.sh
```

## Fast tests (local Postgres)

The app always uses Neon. Tests can run against a local Postgres instead:
the full backend suite takes about 10 seconds there, against about 12
minutes over the internet to Neon. Set `TEST_DATABASE_URL` in `.env`; when
it's unset, tests fall back to Neon.

**Docker**, if installed:

```bash
docker run -d --name clicker-test-pg -p 127.0.0.1:5433:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:18 -c fsync=off -c synchronous_commit=off -c full_page_writes=off
```

**Windows without Docker** (no admin rights, no service; PowerShell):

```powershell
$d = "$env:LOCALAPPDATA\clicker-pg"; New-Item -ItemType Directory -Force $d
curl.exe -L -o "$d\pg18.zip" https://get.enterprisedb.com/postgresql/postgresql-18.3-1-windows-x64-binaries.zip
tar.exe -xf "$d\pg18.zip" -C $d --exclude "pgsql/pgAdmin 4" --exclude pgsql/doc --exclude pgsql/symbols --exclude pgsql/StackBuilder --exclude pgsql/include
& "$d\pgsql\bin\initdb.exe" -D "$d\data" -U postgres --auth=trust --encoding=UTF8 --locale=C
Add-Content "$d\data\postgresql.conf" "listen_addresses = '127.0.0.1'`nport = 5433`nfsync = off`nsynchronous_commit = off`nfull_page_writes = off"
& "$d\pgsql\bin\pg_ctl.exe" -D "$d\data" -l "$d\server.log" start
```

After a restart, start it again with the last line. Either way, then add to
`.env`:

```
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres
```

It listens on 127.0.0.1 only and holds nothing but the scratch database each
test run creates and drops, which is why it has no password and durability
is switched off.

## Documentation

Architecture, module specs, decisions, and the master plan live in Notion.
`CLAUDE.md` carries the working context for development sessions.

## Status

Phase 1 — building the schema-to-UI engine. Nothing is production ready.
