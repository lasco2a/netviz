#!/usr/bin/env bash
# Bootstrap a local netviz environment.
# Idempotent: re-running upgrades dependencies in place.

set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="$PWD"
VENV="$ROOT/.venv"

if [[ ! -d "$VENV" ]]; then
    echo "[netviz] creating virtualenv at $VENV"
    python3 -m venv "$VENV"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet -e .

# Frontend deps (skip silently if no package.json yet)
if [[ -f "$ROOT/web/frontend/package.json" ]]; then
    echo "[netviz] installing frontend deps"
    (cd "$ROOT/web/frontend" && npm install --silent)
fi

# .env bootstrap
if [[ ! -f "$ROOT/.env" ]]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    echo "[netviz] wrote .env (review credentials before running the exporter)"
fi

echo "[netviz] install complete"
echo "       - one-shot snapshot:  ./scripts/snapshot-now.sh"
echo "       - dev backend:        ./scripts/dev-backend.sh"
echo "       - dev frontend:       ./scripts/dev-frontend.sh"
