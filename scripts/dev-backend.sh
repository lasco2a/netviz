#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source .venv/bin/activate
exec uvicorn netviz.web.backend.main:app --host 0.0.0.0 --port 8080 --reload --reload-dir netviz
