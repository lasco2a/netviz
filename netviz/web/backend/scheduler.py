"""Background scheduler: fire snapshot (and optionally DNS) at configured times.

Schedule is persisted to SNAPSHOT_DIR/.schedule.json and reloaded on every save.
The scheduler loop wakes every 60 s, checks whether the current HH:MM matches
any enabled entry, and fires jobs accordingly.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from datetime import datetime
from typing import Any

from netviz.config import SNAPSHOT_DIR
from netviz.web.backend import admin

log = logging.getLogger(__name__)

_SCHEDULE_FILE = SNAPSHOT_DIR / ".schedule.json"
_lock = threading.Lock()
_schedule: list[dict[str, Any]] = []


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def load() -> list[dict[str, Any]]:
    """Return current in-memory schedule (does not re-read disk)."""
    with _lock:
        return list(_schedule)


def _normalise(entries: list[Any]) -> list[dict[str, Any]]:
    out = []
    for e in entries:
        if not isinstance(e, dict):
            continue
        out.append({
            "id": str(e.get("id") or uuid.uuid4()),
            "time": str(e.get("time", "00:00")),
            "dns": bool(e.get("dns", False)),
            "enabled": bool(e.get("enabled", True)),
            "last_run_at": e.get("last_run_at"),  # float | None
        })
    return out


def reload_from_disk() -> None:
    """Re-read schedule file and update in-memory state."""
    global _schedule
    if not _SCHEDULE_FILE.exists():
        with _lock:
            _schedule = []
        return
    try:
        raw = json.loads(_SCHEDULE_FILE.read_text(encoding="utf-8"))
        entries = _normalise(raw if isinstance(raw, list) else [])
        with _lock:
            _schedule = entries
    except Exception:
        log.exception("Failed to load schedule from disk")


def save(incoming: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge incoming entries (preserving last_run_at), write to disk, reload."""
    global _schedule
    with _lock:
        existing_lra = {e["id"]: e.get("last_run_at") for e in _schedule}

    normalised = _normalise(incoming)
    for e in normalised:
        # Preserve last_run_at — the frontend never controls this field.
        e["last_run_at"] = existing_lra.get(e["id"])

    _SCHEDULE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _SCHEDULE_FILE.write_text(
        json.dumps(normalised, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with _lock:
        _schedule = normalised
    return normalised


def _write_last_run(entry_id: str) -> None:
    """Stamp last_run_at on a single entry and flush to disk."""
    global _schedule
    now = time.time()
    with _lock:
        for e in _schedule:
            if e["id"] == entry_id:
                e["last_run_at"] = now
                break
        snapshot = list(_schedule)
    try:
        _SCHEDULE_FILE.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except Exception:
        log.exception("Failed to persist last_run_at for entry %s", entry_id)


# ---------------------------------------------------------------------------
# Job execution (called from scheduler thread)
# ---------------------------------------------------------------------------

def _run_entry(entry: dict[str, Any]) -> None:
    """Fire snapshot for one schedule entry; optionally chain DNS after."""
    entry_id = entry["id"]
    run_dns = entry["dns"]
    log.info("Scheduler: firing snapshot (entry=%s dns=%s)", entry_id, run_dns)

    try:
        admin.start_refresh("exporter")
    except RuntimeError:
        log.info("Scheduler: skipped entry %s — job already running", entry_id)
        return

    _write_last_run(entry_id)

    if not run_dns:
        return

    # Wait up to 10 minutes for snapshot to finish, then fire DNS.
    for _ in range(120):
        time.sleep(5)
        s = admin.status()
        if s["current"] is not None:
            continue
        last = s.get("last") or {}
        if last.get("return_code") == 0:
            log.info("Scheduler: snapshot done, firing DNS (entry=%s)", entry_id)
            try:
                admin.start_refresh("dns")
            except RuntimeError:
                log.warning("Scheduler: could not start DNS — another job running")
        else:
            log.warning(
                "Scheduler: snapshot exited non-zero, skipping DNS (entry=%s)", entry_id
            )
        return

    log.warning("Scheduler: timed out waiting for snapshot (entry=%s)", entry_id)


# ---------------------------------------------------------------------------
# Scheduler loop
# ---------------------------------------------------------------------------

def _scheduler_loop() -> None:
    # Track per-entry last-fired wall time to prevent double-fire within same minute.
    _last_fired: dict[str, float] = {}

    while True:
        time.sleep(60)
        now_hhmm = datetime.now().strftime("%H:%M")
        now_ts = time.time()

        with _lock:
            entries = list(_schedule)

        for entry in entries:
            if not entry.get("enabled"):
                continue
            if entry.get("time") != now_hhmm:
                continue
            if now_ts - _last_fired.get(entry["id"], 0) < 300:
                continue  # already fired within the last 5 minutes

            _last_fired[entry["id"]] = now_ts
            threading.Thread(
                target=_run_entry,
                args=(dict(entry),),
                daemon=True,
                name=f"netviz-sched-{entry['id'][:8]}",
            ).start()


def start() -> None:
    """Load schedule from disk and start the background scheduler thread."""
    reload_from_disk()
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="netviz-scheduler")
    t.start()
    log.info("Scheduler started (%d entries loaded)", len(_schedule))
