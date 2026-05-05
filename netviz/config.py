"""Configuration loaded from environment / .env file.

Loaded once at import time. Importing modules should access values via the
module-level constants below (e.g. `from netviz.config import DB`).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# .env lives at repo root; resolve relative to this file.
_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env")


def _env(key: str, default: str | None = None, *, required: bool = False) -> str:
    val = os.environ.get(key, default)
    if required and not val:
        raise RuntimeError(f"Required env var {key} is unset")
    return val or ""


@dataclass(frozen=True)
class DBConfig:
    host: str
    port: int
    user: str
    password: str
    database: str


DB = DBConfig(
    host=_env("OBSERVIUM_DB_HOST", "127.0.0.1"),
    port=int(_env("OBSERVIUM_DB_PORT", "3306")),
    user=_env("OBSERVIUM_DB_USER", required=True),
    password=_env("OBSERVIUM_DB_PASS", required=True),
    database=_env("OBSERVIUM_DB_NAME", "observium"),
)

SNAPSHOT_DIR = Path(
    _env("NETVIZ_SNAPSHOT_DIR", str(_REPO_ROOT / "snapshot"))
).resolve()

HOST = _env("NETVIZ_HOST", "0.0.0.0")
PORT = int(_env("NETVIZ_PORT", "8080"))
SESSION_SECRET = _env("NETVIZ_SESSION_SECRET", "dev-secret-change-me")
SESSION_HOURS = int(_env("NETVIZ_SESSION_HOURS", "8"))
MIN_USER_LEVEL = int(_env("NETVIZ_MIN_USER_LEVEL", "1"))

REPO_ROOT = _REPO_ROOT
