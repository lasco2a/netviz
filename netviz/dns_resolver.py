"""Reverse-DNS resolver for endpoint IPs.

Reads unique IPs from Observium's `ip_mac` table, performs reverse-DNS
lookups for any IP that is missing from the cache or whose entry is older
than ``NETVIZ_DNS_CACHE_TTL_DAYS`` (default 7), and writes the cache back to
``snapshot/dns_cache.json``.

The exporter consumes this cache when materialising the ``endpoints`` array,
so this script is intentionally **independent** of the exporter timer:
running it slow or not at all only stales the hostnames, never the topology.

Toggles
-------
- ``NETVIZ_DNS_ENABLED=false`` makes scheduled runs no-op (the daily timer
  short-circuits). The cache file is left untouched.
- ``--force`` from the CLI overrides ``NETVIZ_DNS_ENABLED`` (used by the
  admin "force refresh" button when the operator explicitly opts in).
- ``--no-dns`` skips lookups entirely; useful from the exporter wrapper to
  refresh device data without doing any DNS.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from netviz import db
from netviz.config import SNAPSHOT_DIR

CACHE_NAME = "dns_cache.json"
DEFAULT_TTL_DAYS = 7
DEFAULT_WORKERS = 32
LOOKUP_TIMEOUT_S = 1.0


def _ttl_seconds() -> int:
    days = int(os.environ.get("NETVIZ_DNS_CACHE_TTL_DAYS", str(DEFAULT_TTL_DAYS)))
    return max(1, days) * 86400


def _enabled_in_env() -> bool:
    val = os.environ.get("NETVIZ_DNS_ENABLED", "true").strip().lower()
    return val not in ("0", "false", "no", "off")


def _cache_path(out_dir: Path | None = None) -> Path:
    return (out_dir or SNAPSHOT_DIR).resolve() / CACHE_NAME


def load_cache(out_dir: Path | None = None) -> dict[str, dict[str, Any]]:
    p = _cache_path(out_dir)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:
        return {}


def save_cache(cache: dict[str, dict[str, Any]], out_dir: Path | None = None) -> None:
    p = _cache_path(out_dir)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), "utf-8")
    os.replace(tmp, p)


def _unique_ips() -> list[str]:
    rows = db.fetch_all("SELECT DISTINCT ip_address FROM ip_mac WHERE ip_address <> ''")
    return [r["ip_address"] for r in rows if r.get("ip_address")]


def _resolve_one(ip: str, timeout: float = LOOKUP_TIMEOUT_S) -> str | None:
    socket.setdefaulttimeout(timeout)
    try:
        host, _aliases, _addrs = socket.gethostbyaddr(ip)
        return host
    except (socket.herror, socket.gaierror, OSError):
        return None


def resolve(
    ips: list[str],
    workers: int = DEFAULT_WORKERS,
    timeout: float = LOOKUP_TIMEOUT_S,
) -> dict[str, str | None]:
    """Resolve a batch of IPs concurrently. Returns ``{ip: hostname_or_none}``."""
    out: dict[str, str | None] = {}
    if not ips:
        return out
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(_resolve_one, ip, timeout): ip for ip in ips}
        for fut in as_completed(futures):
            ip = futures[fut]
            try:
                out[ip] = fut.result()
            except Exception:
                out[ip] = None
    return out


def run(*, force: bool = False, no_dns: bool = False, out_dir: Path | None = None) -> dict[str, Any]:
    """Refresh the cache file. Returns a small summary block."""
    started = time.time()
    if not force and not _enabled_in_env():
        return {
            "skipped": True,
            "reason": "NETVIZ_DNS_ENABLED=false",
            "elapsed_s": 0.0,
        }
    if no_dns:
        return {"skipped": True, "reason": "--no-dns", "elapsed_s": 0.0}

    cache = load_cache(out_dir)
    ips = _unique_ips()
    ttl = _ttl_seconds()
    now = int(time.time())

    stale: list[str] = []
    for ip in ips:
        entry = cache.get(ip)
        if not entry or (now - int(entry.get("resolved_at", 0))) > ttl:
            stale.append(ip)

    resolved = resolve(stale)

    new_count = 0
    for ip, host in resolved.items():
        cache[ip] = {"hostname": host, "resolved_at": now}
        if host:
            new_count += 1

    # Trim entries for IPs that are no longer in ip_mac (keeps the file small).
    live = set(ips)
    for k in list(cache.keys()):
        if k not in live:
            cache.pop(k, None)

    save_cache(cache, out_dir)
    elapsed = time.time() - started
    return {
        "skipped": False,
        "total_ips": len(ips),
        "stale": len(stale),
        "newly_resolved": new_count,
        "cached": len(cache),
        "elapsed_s": round(elapsed, 2),
    }


def main() -> int:
    p = argparse.ArgumentParser(prog="netviz-dns")
    p.add_argument("--force", action="store_true", help="Run even if NETVIZ_DNS_ENABLED=false")
    p.add_argument("--no-dns", action="store_true", help="Skip lookups; exit immediately")
    p.add_argument("--out", type=Path, default=None, help="Override snapshot dir")
    args = p.parse_args()

    print(f"[netviz-dns] starting (force={args.force}, no_dns={args.no_dns})", flush=True)
    try:
        summary = run(force=args.force, no_dns=args.no_dns, out_dir=args.out)
    except Exception as exc:  # noqa: BLE001
        print(f"[netviz-dns] ERROR: {exc}", file=sys.stderr)
        return 1
    print(f"[netviz-dns] done {summary}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
