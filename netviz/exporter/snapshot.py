"""Snapshot writer.

Reads the Observium MariaDB and writes a small set of JSON files representing
the parts of the network needed by the frontend. The output is designed to be
served directly by static file routes.

Layout:

    SNAPSHOT_DIR/
      snapshot.json          # devices summary + edges + 3 trees + meta
      device/<id>.json       # per-device drill-down (ports, processors, mempools, neighbours)

`snapshot.json` is produced atomically (temp file + rename) so the backend
never observes a half-written file.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

from netviz import db
from netviz.config import SNAPSHOT_DIR
from netviz.exporter import trees


# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

# Columns kept lean: only what the graph + tables + filters need.
DEVICE_COLS = """
    device_id, hostname, sysName, ip, location, `type`, os, hardware, vendor,
    `status`, status_type, `ignore`, disabled, uptime, last_polled, sysDescr,
    purpose, asset_tag
""".strip()

PORT_COLS = """
    port_id, device_id, ifIndex, ifName, ifDescr, ifAlias, ifType,
    ifSpeed, ifHighSpeed, ifMtu, ifOperStatus, ifAdminStatus, ifPhysAddress,
    ifVlan, ifInOctets_rate, ifOutOctets_rate, `ignore`, disabled, deleted,
    port_label, port_label_short
""".strip()

NEIGHBOUR_COLS = """
    neighbour_id, device_id, port_id, remote_device_id, remote_port_id,
    active, protocol, remote_hostname, remote_port, remote_platform,
    remote_address
""".strip()


def _fetch(conn, sql: str) -> list[dict[str, Any]]:
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(sql)
        return cur.fetchall()
    finally:
        cur.close()


# ---------------------------------------------------------------------------
# Snapshot building
# ---------------------------------------------------------------------------

def _serialise(value: Any) -> Any:
    """Make MySQL row values JSON-safe (datetime -> ISO, bytes -> str)."""
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        try:
            return value.decode("utf-8", errors="replace")
        except Exception:
            return None
    # datetime, date, time, Decimal all support __str__ but we want ISO for dates.
    cls = value.__class__.__name__
    if cls in ("datetime", "date", "time"):
        return value.isoformat()
    if cls == "Decimal":
        return float(value)
    return value


def _row(d: dict[str, Any]) -> dict[str, Any]:
    return {k: _serialise(v) for k, v in d.items()}


def build_snapshot(conn) -> dict[str, Any]:
    devices_raw = _fetch(conn, f"SELECT {DEVICE_COLS} FROM devices ORDER BY device_id")
    devices = [_row(d) for d in devices_raw]

    neighbours_raw = _fetch(
        conn,
        f"SELECT {NEIGHBOUR_COLS} FROM neighbours ORDER BY neighbour_id",
    )
    neighbours = [_row(n) for n in neighbours_raw]

    # Build edge list for the graph (resolved + unresolved as separate sets).
    resolved_edges: list[dict[str, Any]] = []
    ghost_endpoints: list[dict[str, Any]] = []

    seen_pairs: set[tuple[int, int]] = set()
    for n in neighbours:
        a = n["device_id"]
        b = n["remote_device_id"]
        if a is None:
            continue
        if b is not None:
            # de-dup undirected pair
            pair = (a, b) if a <= b else (b, a)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            resolved_edges.append(
                {
                    "id": n["neighbour_id"],
                    "a": a,
                    "b": b,
                    "a_port": n["port_id"],
                    "b_port": n["remote_port_id"],
                    "protocol": n["protocol"],
                }
            )
        else:
            ghost_endpoints.append(
                {
                    "id": n["neighbour_id"],
                    "device_id": a,
                    "port_id": n["port_id"],
                    "remote_hostname": n["remote_hostname"],
                    "remote_port": n["remote_port"],
                    "platform": n["remote_platform"],
                    "protocol": n["protocol"],
                }
            )

    # Trees
    edge_pairs = [(e["a"], e["b"]) for e in resolved_edges]
    tree_location = trees.build_location_tree(devices)

    # Groups (best-effort \u2014 tables may be empty)
    try:
        groups = _fetch(conn, "SELECT group_id, group_name, entity_type FROM groups")
        assoc = _fetch(
            conn,
            "SELECT group_id, entity_id FROM groups_assoc WHERE entity_id IS NOT NULL",
        )
    except Exception:
        groups, assoc = [], []
    tree_groups = trees.build_groups_tree(devices, groups, assoc)

    tree_topology = trees.build_topology_tree(devices, edge_pairs)

    return {
        "meta": {
            "generated_at": int(time.time()),
            "device_count": len(devices),
            "edge_count": len(resolved_edges),
            "ghost_endpoint_count": len(ghost_endpoints),
        },
        "devices": devices,
        "edges": resolved_edges,
        "ghost_endpoints": ghost_endpoints,
        "trees": {
            "location": tree_location,
            "groups": tree_groups,
            "topology": tree_topology,
        },
    }


def build_device_detail(conn, device_id: int) -> dict[str, Any]:
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(f"SELECT {DEVICE_COLS} FROM devices WHERE device_id = %s", (device_id,))
        device = cur.fetchone()
        if not device:
            return {}

        cur.execute(
            f"SELECT {PORT_COLS} FROM ports WHERE device_id = %s ORDER BY ifIndex+0, ifIndex",
            (device_id,),
        )
        ports = cur.fetchall()

        cur.execute(
            f"SELECT {NEIGHBOUR_COLS} FROM neighbours WHERE device_id = %s",
            (device_id,),
        )
        neighbours = cur.fetchall()

        cur.execute(
            "SELECT processor_id, processor_type, processor_descr, processor_usage, "
            "processor_polled FROM processors WHERE device_id = %s",
            (device_id,),
        )
        processors = cur.fetchall()

        cur.execute(
            "SELECT mempool_id, mempool_descr, mempool_perc, mempool_used, mempool_total, "
            "mempool_polled FROM mempools WHERE device_id = %s",
            (device_id,),
        )
        mempools = cur.fetchall()

        return {
            "device": _row(device),
            "ports": [_row(p) for p in ports],
            "neighbours": [_row(n) for n in neighbours],
            "processors": [_row(p) for p in processors],
            "mempools": [_row(m) for m in mempools],
        }
    finally:
        cur.close()


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

def _atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except FileNotFoundError:
            pass
        raise


def write_snapshot(out_dir: Path | None = None) -> dict[str, Any]:
    """Run the full export. Returns the meta block."""
    out = (out_dir or SNAPSHOT_DIR).resolve()
    out.mkdir(parents=True, exist_ok=True)

    conn = db.direct_connection()
    try:
        snapshot = build_snapshot(conn)
        _atomic_write_json(out / "snapshot.json", snapshot)

        # Per-device files. Write to a fresh `device.new/` dir then swap.
        new_dir = out / "device.new"
        if new_dir.exists():
            shutil.rmtree(new_dir)
        new_dir.mkdir(parents=True)
        for d in snapshot["devices"]:
            detail = build_device_detail(conn, d["device_id"])
            _atomic_write_json(new_dir / f"{d['device_id']}.json", detail)

        old_dir = out / "device"
        backup_dir = out / "device.old"
        if old_dir.exists():
            if backup_dir.exists():
                shutil.rmtree(backup_dir)
            os.rename(old_dir, backup_dir)
        os.rename(new_dir, old_dir)
        if backup_dir.exists():
            shutil.rmtree(backup_dir)

        return snapshot["meta"]
    finally:
        conn.close()
