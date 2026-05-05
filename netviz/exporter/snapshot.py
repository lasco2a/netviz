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
import re
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

from netviz import db
from netviz.config import SNAPSHOT_DIR
from netviz.dns_resolver import load_cache as load_dns_cache
from netviz.exporter import trees


# ---------------------------------------------------------------------------
# Role classification
# ---------------------------------------------------------------------------

# Order matters: the first rule whose predicate matches wins.
_ROLE_RULES: list[tuple[str, callable]] = [
    (
        "firewall",
        lambda t, o, h: t == "firewall"
        or o in {"pix", "asa", "fortigate", "fortios", "paloalto", "junos-srx"},
    ),
    (
        "router",
        lambda t, o, h: o in {"iosxr", "junos", "vyos", "mikrotik", "unifi-udm"}
        or bool(re.search(r"\b(ASR|ISR|MX\d|UCG|EdgeRouter|Edge[- ]?Router)\b", h, re.I))
        or "Nexus 7" in h,
    ),
    (
        "wireless",
        lambda t, o, h: t == "wireless"
        or o in {"unifi", "airos", "aruba-wlc", "ruckus"}
        or bool(re.search(r"\b(AP\b|U7-|UAP-)", h, re.I)),
    ),
    (
        "server",
        lambda t, o, h: t == "server"
        or o in {"linux", "windows", "freebsd", "vmware", "esxi", "hpilo"},
    ),
    (
        "storage",
        lambda t, o, h: t == "storage"
        or o in {"qnap", "netapp", "emc", "synology", "freenas"},
    ),
    (
        "printer",
        lambda t, o, h: t == "printer"
        or o in {"generic-printer", "hpprinter", "ricoh", "xerox"},
    ),
    ("workstation", lambda t, o, h: t == "workstation"),
    ("power", lambda t, o, h: t == "power"),
    ("environment", lambda t, o, h: t == "environment"),
    # Default for type=="network" (and any leftover): assume switch.
    ("switch", lambda t, o, h: t == "network"),
]


def _classify_role(dev: dict[str, Any]) -> str:
    t = (dev.get("type") or "").lower()
    o = (dev.get("os") or "").lower()
    h = dev.get("hardware") or ""
    for role, pred in _ROLE_RULES:
        try:
            if pred(t, o, h):
                return role
        except Exception:
            continue
    return "unknown"


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


# `ip_mac` rows are the ARP/bridge entries Observium harvests from each
# device. They tie an IP+MAC to a switch port and we expose them as
# "endpoints": un-managed hosts hanging off our managed devices.
ENDPOINT_COLS = """
    mac_id, device_id, port_id, mac_ifIndex, mac_address, ip_address, ip_version
""".strip()


def _normalise_mac(raw: str | None) -> str:
    """Return a canonical lower-case ``aa:bb:cc:dd:ee:ff`` form.

    Observium stores MACs as 12 hex chars in `ip_mac.mac_address`. We accept
    that and a few common formats defensively.
    """
    if not raw:
        return ""
    s = "".join(ch for ch in raw if ch.isalnum()).lower()
    if len(s) != 12:
        return raw.lower()
    return ":".join(s[i : i + 2] for i in range(0, 12, 2))


_RUN_LOG: list[dict[str, Any]] = []


def _fetch(conn, sql: str) -> list[dict[str, Any]]:
    cur = conn.cursor(dictionary=True)
    try:
        t_mono = time.monotonic()
        cur.execute(sql)
        result = cur.fetchall()
        _RUN_LOG.append({
            "ts": time.time(),
            "sql": sql.strip(),
            "params": "",
            "duration_ms": round((time.monotonic() - t_mono) * 1000, 1),
            "rows": len(result),
        })
        return result
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


def _collect_endpoints(
    conn, device_ids: set[int]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Materialise the global endpoints array.

    De-dups on (mac, ip) so a host visible on multiple switch ports collapses
    to one row (we keep the first device/port we see). Joins each row with
    the DNS cache so the frontend doesn't need to know it exists.
    """
    rows = _fetch(
        conn,
        f"SELECT {ENDPOINT_COLS} FROM ip_mac WHERE ip_address <> ''",
    )
    dns = load_dns_cache()
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    resolved = 0
    for r in rows:
        ip = r.get("ip_address") or ""
        mac = _normalise_mac(r.get("mac_address"))
        if not ip:
            continue
        key = (mac, ip)
        if key in seen:
            continue
        seen.add(key)
        host_entry = dns.get(ip) or {}
        host = host_entry.get("hostname")
        if host:
            resolved += 1
        out.append(
            {
                "id": r["mac_id"],
                # Endpoints learned on a managed device we're not exporting are
                # still useful to the user as raw IP/MAC rows; preserve the
                # device_id even if it's outside our device set.
                "device_id": r["device_id"] if r["device_id"] in device_ids else None,
                "port_id": r["port_id"],
                "ifIndex": r.get("mac_ifIndex"),
                "mac": mac,
                "ip": ip,
                "ip_version": r.get("ip_version"),
                "hostname": host,
            }
        )
    return out, {"total": len(out), "resolved": resolved}


def build_snapshot(conn) -> dict[str, Any]:
    devices_raw = _fetch(conn, f"SELECT {DEVICE_COLS} FROM devices ORDER BY device_id")
    devices = [_row(d) for d in devices_raw]
    for d in devices:
        d["role"] = _classify_role(d)
    device_ids = {d["device_id"] for d in devices}

    role_counts: dict[str, int] = {}
    for d in devices:
        role_counts[d["role"]] = role_counts.get(d["role"], 0) + 1

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

    endpoints, ep_stats = _collect_endpoints(conn, device_ids)

    return {
        "meta": {
            "generated_at": int(time.time()),
            "device_count": len(devices),
            "edge_count": len(resolved_edges),
            "ghost_endpoint_count": len(ghost_endpoints),
            "endpoint_count": ep_stats["total"],
            "endpoint_resolved": ep_stats["resolved"],
            "role_counts": role_counts,
        },
        "devices": devices,
        "edges": resolved_edges,
        "ghost_endpoints": ghost_endpoints,
        "endpoints": endpoints,
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

        cur.execute(
            f"SELECT {ENDPOINT_COLS} FROM ip_mac WHERE device_id = %s AND ip_address <> ''",
            (device_id,),
        )
        endpoint_rows = cur.fetchall()
        dns = load_dns_cache()
        endpoints: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for r in endpoint_rows:
            ip = r.get("ip_address") or ""
            mac = _normalise_mac(r.get("mac_address"))
            key = (mac, ip)
            if key in seen:
                continue
            seen.add(key)
            endpoints.append(
                {
                    "id": r["mac_id"],
                    "port_id": r["port_id"],
                    "ifIndex": r.get("mac_ifIndex"),
                    "mac": mac,
                    "ip": ip,
                    "ip_version": r.get("ip_version"),
                    "hostname": (dns.get(ip) or {}).get("hostname"),
                }
            )

        return {
            "device": _row(device) | {"role": _classify_role(_row(device))},
            "ports": [_row(p) for p in ports],
            "neighbours": [_row(n) for n in neighbours],
            "processors": [_row(p) for p in processors],
            "mempools": [_row(m) for m in mempools],
            "endpoints": endpoints,
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
    global _RUN_LOG
    _RUN_LOG = []
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

        (out / ".exporter_sql.json").write_text(
            json.dumps(_RUN_LOG, ensure_ascii=False), encoding="utf-8"
        )

        return snapshot["meta"]
    finally:
        conn.close()
