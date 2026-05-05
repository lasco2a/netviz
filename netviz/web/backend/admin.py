"""Admin operations: trigger snapshot/DNS refresh as a subprocess.

Single in-memory mutex so two concurrent refresh requests can't trample each
other. Output streams are captured to ``snapshot/.refresh.log`` for the
admin modal to tail.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from netviz.config import SNAPSHOT_DIR


@dataclass
class Job:
    kind: str  # "exporter" | "dns"
    started_at: float
    pid: int | None = None
    finished_at: float | None = None
    return_code: int | None = None
    log: deque[str] = field(default_factory=lambda: deque(maxlen=200))
    error: str | None = None


_lock = threading.Lock()
_current: Job | None = None
_last: Job | None = None


def _log_path() -> Path:
    return SNAPSHOT_DIR / ".refresh.log"


def _run_subprocess(job: Job, args: list[str], extra_env: dict[str, str] | None = None) -> None:
    global _current, _last
    log_file = _log_path()
    log_file.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    try:
        with log_file.open("a", encoding="utf-8") as fh:
            fh.write(f"\n--- {job.kind} started {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
            proc = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                text=True,
                bufsize=1,
            )
            job.pid = proc.pid
            assert proc.stdout is not None
            for line in proc.stdout:
                line = line.rstrip("\n")
                job.log.append(line)
                fh.write(line + "\n")
                fh.flush()
            proc.wait()
            job.return_code = proc.returncode
            fh.write(f"--- exit={proc.returncode} ---\n")
    except Exception as exc:  # noqa: BLE001
        job.error = str(exc)
        job.return_code = -1
    finally:
        job.finished_at = time.time()
        with _lock:
            _last = job
            _current = None


def start_refresh(kind: str, *, dns_force: bool = False) -> Job:
    """Kick off a refresh job. Raises ``RuntimeError`` if one is already running."""
    global _current
    with _lock:
        if _current is not None:
            raise RuntimeError("a refresh is already in progress")
        job = Job(kind=kind, started_at=time.time())
        _current = job

    py = sys.executable
    if kind == "exporter":
        args = [py, "-m", "netviz.exporter"]
        env = None
    elif kind == "dns":
        args = [py, "-m", "netviz.dns_resolver"]
        if dns_force:
            args.append("--force")
        env = None
    else:
        with _lock:
            _current = None
        raise ValueError(f"unknown kind: {kind}")

    threading.Thread(
        target=_run_subprocess,
        args=(job, args, env),
        daemon=True,
        name=f"netviz-refresh-{kind}",
    ).start()
    return job


def status() -> dict[str, Any]:
    with _lock:
        cur = _current
        last = _last

    def _serialise(job: Job | None) -> dict[str, Any] | None:
        if job is None:
            return None
        return {
            "kind": job.kind,
            "started_at": int(job.started_at),
            "finished_at": int(job.finished_at) if job.finished_at else None,
            "running": job.finished_at is None,
            "return_code": job.return_code,
            "pid": job.pid,
            "error": job.error,
            "log": list(job.log),
        }

    return {"current": _serialise(cur), "last": _serialise(last)}
