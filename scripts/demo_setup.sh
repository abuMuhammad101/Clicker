#!/usr/bin/env bash
# Build both demo databases from nothing and seed both journeys.
#
#   scripts/demo_setup.sh            # uses DEMO_DATABASE_SERVER from .env
#   scripts/demo_setup.sh --fresh    # drops clicker_demo and clicker_port first
#
# For a fresh Linux or macOS machine that already has Postgres running (see the
# "Demo machine" section of docs/DEMO_SPRINT.md) and the repo's dependencies installed
# (backend/.venv and frontend/node_modules). Windows uses the PowerShell steps there and
# scripts/demo-stack.ps1 to switch journeys.
#
# Needs in .env: DEMO_DATABASE_SERVER (e.g. postgresql://postgres@127.0.0.1:5433), SECRET_KEY.
# If .env does not exist it is created with a generated SECRET_KEY. Nothing secret is printed;
# the seed writes its generated demo passwords into .env (never committed).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
python="$root/backend/.venv/bin/python"
[ -x "$python" ] || { echo "Missing backend/.venv: python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt" >&2; exit 1; }

if [ ! -f .env ]; then
  umask 077
  printf 'SECRET_KEY=%s\nDEBUG=True\nALLOWED_HOSTS=localhost,127.0.0.1\n' \
    "$("$python" -c 'import secrets; print(secrets.token_urlsafe(50))')" > .env
  echo "Created .env (add DEMO_DATABASE_SERVER to it, then run this again)." >&2
fi
server="$(sed -n 's/^DEMO_DATABASE_SERVER=//p' .env | tail -1 | tr -d '\r')"
[ -n "$server" ] || { echo "Set DEMO_DATABASE_SERVER in .env (see .env.example)." >&2; exit 1; }
command -v psql >/dev/null || { echo "psql not found: install the Postgres client tools." >&2; exit 1; }

fresh=0; [ "${1:-}" = "--fresh" ] && fresh=1
start=$SECONDS

# journey  database
for pair in "water clicker_demo" "clearance clicker_port"; do
  set -- $pair; journey=$1; db=$2
  step=$SECONDS
  if [ $fresh = 1 ]; then psql "$server/postgres" -qc "drop database if exists $db with (force)"; fi
  if ! psql "$server/postgres" -Atc "select 1 from pg_database where datname='$db'" | grep -q 1; then
    psql "$server/postgres" -qc "create database $db"
  fi
  export DATABASE_URL="$server/$db" CLICKER_JOURNEY="$journey"
  echo "== $journey on $db =="
  "$python" backend/manage.py migrate --verbosity 0
  "$python" backend/manage.py seed_demo --journey "$journey" --confirm "$db" | tail -n 12
  echo "-- $journey: $((SECONDS - step)) s"
done
unset DATABASE_URL CLICKER_JOURNEY

echo
echo "Both demos are ready in $((SECONDS - start)) s."
echo "Switch journeys on Windows with scripts\\demo-stack.ps1 water|clearance."
echo "On Linux or macOS, for the water board (API :8200, app :5273):"
echo "  DATABASE_URL=$server/clicker_demo CLICKER_JOURNEY=water CORS_ALLOWED_ORIGINS=http://localhost:5273 backend/.venv/bin/python backend/manage.py runserver 8200"
echo "  VITE_API_URL=http://localhost:8200/api npm --prefix frontend run dev -- --port 5273 --strictPort"
echo "and the clearing agency (API :8201, app :5274): same, with clicker_port, clearance, 8201, 5274."
