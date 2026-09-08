#!/usr/bin/env bash
# Clicker — one-command setup. Run on a fresh clone, on either machine.
set -e

echo "→ Checking prerequisites"
command -v python3 >/dev/null || { echo "✗ Python 3 not found"; exit 1; }
command -v node >/dev/null || { echo "✗ Node not found"; exit 1; }
echo "  python $(python3 --version 2>&1 | cut -d' ' -f2), node $(node --version)"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠  Created .env from template. Fill in DATABASE_URL and SECRET_KEY before continuing."
  exit 1
fi

if [ -d backend ]; then
  echo "→ Backend"
  cd backend
  [ -d .venv ] || python3 -m venv .venv
  source .venv/bin/activate
  pip install -q --upgrade pip
  [ -f requirements.txt ] && pip install -q -r requirements.txt
  python manage.py migrate
  deactivate
  cd ..
fi

if [ -d frontend ]; then
  echo "→ Frontend"
  cd frontend && npm install --silent && cd ..
fi

echo "✓ Ready."
echo "  Backend:  cd backend && source .venv/bin/activate && python manage.py runserver"
echo "  Frontend: cd frontend && npm run dev"
