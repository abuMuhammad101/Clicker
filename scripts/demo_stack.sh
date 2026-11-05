#!/usr/bin/env bash
# Start (or stop) the demo stack for one journey on Linux or macOS. The Windows equivalent is demo-stack.ps1.
#
#   scripts/demo_stack.sh water        # water board:    API :8200, app :5273, database clicker_demo
#   scripts/demo_stack.sh clearance    # clearing agency: API :8201, app :5274, database clicker_port
#   scripts/demo_stack.sh both         # both at once (different ports; the rehearsal uses this)
#   scripts/demo_stack.sh stop
#
# Needs DEMO_DATABASE_SERVER in .env, backend/.venv and frontend/node_modules. Logs: $CLICKER_STACK_LOGS
# (default /tmp/clicker-stack). Waits until each API answers before returning.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
logs="${CLICKER_STACK_LOGS:-/tmp/clicker-stack}"; mkdir -p "$logs"
server="$(sed -n 's/^DEMO_DATABASE_SERVER=//p' .env | tail -1 | tr -d '\r')"
[ -n "$server" ] || { echo "Set DEMO_DATABASE_SERVER in .env." >&2; exit 1; }

stop() {
  for port in 8200 8201 5273 5274; do
    pids="$(lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null || true)"
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
}

start() { # journey database api web
  local journey=$1 db=$2 api=$3 web=$4
  DATABASE_URL="$server/$db" CLICKER_JOURNEY="$journey" \
    CORS_ALLOWED_ORIGINS="http://localhost:$web,http://127.0.0.1:$web" \
    CSRF_TRUSTED_ORIGINS="http://localhost:$web,http://127.0.0.1:$web" \
    nohup backend/.venv/bin/python backend/manage.py runserver "127.0.0.1:$api" --noreload > "$logs/api-$journey.log" 2>&1 &
  VITE_API_URL="http://localhost:$api/api" \
    nohup npm --prefix frontend run dev -- --port "$web" --strictPort --host 127.0.0.1 > "$logs/web-$journey.log" 2>&1 &
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "http://127.0.0.1:$api/api/auth/me/" && curl -s -o /dev/null "http://127.0.0.1:$web/" && { echo "$journey: http://localhost:$web (API :$api, $db)"; return; }
    sleep 1
  done
  echo "$journey did not come up; see $logs" >&2; exit 1
}

case "${1:-}" in
  water) stop; start water clicker_demo 8200 5273 ;;
  clearance) stop; start clearance clicker_port 8201 5274 ;;
  both) stop; start water clicker_demo 8200 5273; start clearance clicker_port 8201 5274 ;;
  stop) stop ;;
  *) echo "usage: $0 water|clearance|both|stop" >&2; exit 2 ;;
esac
