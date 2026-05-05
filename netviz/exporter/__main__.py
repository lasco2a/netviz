"""CLI entry point for the snapshot exporter.

Usage:
    python -m netviz.exporter            # one-shot run, writes to SNAPSHOT_DIR
    python -m netviz.exporter --out /tmp # override output dir
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from netviz.exporter.snapshot import write_snapshot


def main() -> int:
    p = argparse.ArgumentParser(prog="netviz-export")
    p.add_argument("--out", type=Path, default=None, help="Override snapshot dir")
    args = p.parse_args()

    started = time.time()
    print(f"[netviz-export] starting (out={args.out or '<env>'})", flush=True)
    try:
        meta = write_snapshot(args.out)
    except Exception as exc:  # noqa: BLE001
        print(f"[netviz-export] ERROR: {exc}", file=sys.stderr)
        return 1
    elapsed = time.time() - started
    print(
        f"[netviz-export] done in {elapsed:.2f}s "
        f"(devices={meta['device_count']}, edges={meta['edge_count']}, "
        f"ghost={meta['ghost_endpoint_count']})",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
