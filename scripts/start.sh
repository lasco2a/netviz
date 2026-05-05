#!/usr/bin/env bash
# Start netviz in production mode.
# - Rebuilds the frontend bundle if the source is newer than dist/.
# - Runs the exporter if snapshot.json is missing or older than 6 h.
# - Launches the FastAPI backend on $NETVIZ_HOST:$NETVIZ_PORT (default 0.0.0.0:8080).

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

# ── 1. Python venv ──────────────────────────────────────────────────────────
if [[ ! -f "$ROOT/.venv/bin/activate" ]]; then
    echo "[netviz] venv not found — run ./scripts/install.sh first" >&2
    exit 1
fi
# shellcheck disable=SC1091
source "$ROOT/.venv/bin/activate"

# Load .env so NETVIZ_HOST / NETVIZ_PORT are available in this shell too
if [[ -f "$ROOT/.env" ]]; then
    set -o allexport
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +o allexport
fi

HOST="${NETVIZ_HOST:-0.0.0.0}"
PORT="${NETVIZ_PORT:-8080}"

# ── 2. Frontend build ────────────────────────────────────────────────────────
DIST="$ROOT/web/frontend/dist/index.html"
SRC="$ROOT/web/frontend/src"

need_build=0
if [[ ! -f "$DIST" ]]; then
    echo "[netviz] dist not found — building frontend"
    need_build=1
elif [[ -n "$(find "$SRC" -newer "$DIST" -name '*.ts' -o -name '*.tsx' -o -name '*.css' 2>/dev/null | head -1)" ]]; then
    echo "[netviz] source newer than dist — rebuilding frontend"
    need_build=1
fi

if (( need_build )); then
    (cd "$ROOT/web/frontend" && npm run build)
fi

# ── 3. Snapshot ───────────────────────────────────────────────────────────────
SNAP="$ROOT/snapshot/snapshot.json"
SIX_HOURS=21600   # seconds

need_snapshot=0
if [[ ! -f "$SNAP" ]]; then
    echo "[netviz] snapshot.json not found — running exporter"
    need_snapshot=1
else
    age=$(( $(date +%s) - $(date -r "$SNAP" +%s) ))
    if (( age > SIX_HOURS )); then
        echo "[netviz] snapshot.json is $(( age / 3600 ))h old — refreshing"
        need_snapshot=1
    fi
fi

if (( need_snapshot )); then
    python -m netviz.exporter
fi

# ── 4. Launch backend ─────────────────────────────────────────────────────────
# Check the port is free before trying to bind.
if lsof -ti "tcp:${PORT}" &>/dev/null; then
    echo "[netviz] error: port ${PORT} is already in use" >&2
    echo "         Either free the port or set a different NETVIZ_PORT in .env" >&2
    exit 1
fi

echo "[netviz] starting on http://${HOST}:${PORT}"
exec uvicorn netviz.web.backend.main:app --host "$HOST" --port "$PORT" --log-level info
