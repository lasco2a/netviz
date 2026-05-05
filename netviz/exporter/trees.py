"""Tree-structure builders.

Three independent tree sources, each producing the same JSON shape so the
frontend can swap between them at runtime:

    {
      "id":       "lon/dc-a",      # stable, slash-delimited path
      "name":     "DC-A",
      "device_ids": [11, 12, ...], # devices directly under this node (not descendants)
      "children": [ <node>, ... ],
    }

The frontend does the rollup (status counts etc.) at render time so we keep
the snapshot small and avoid re-exporting just to update counters.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable

# A "device summary" row as produced by exporter.snapshot.fetch_devices()
Device = dict[str, Any]


# ---------------------------------------------------------------------------
# 1. Location tree
# ---------------------------------------------------------------------------

_UNLOCATED = "Unlocated"


def _normalise_location(raw: str | None) -> list[str]:
    """Split `'London/DC-A/Core'` -> `['London', 'DC-A', 'Core']`.

    Empty / whitespace-only locations bucket under `Unlocated`.
    Tolerates `\\\\`, `>`, ` - ` separators commonly seen in real NMS data.
    """
    if not raw:
        return [_UNLOCATED]
    s = raw.strip()
    if not s:
        return [_UNLOCATED]
    # Normalise common separators to '/'.
    for sep in ("\\", ">", " - ", " > "):
        s = s.replace(sep, "/")
    parts = [p.strip() for p in s.split("/") if p.strip()]
    return parts or [_UNLOCATED]


def build_location_tree(devices: Iterable[Device]) -> dict[str, Any]:
    """Build a hierarchical tree from each device's `location` field."""
    root: dict[str, Any] = _empty_node("", "All locations")

    for d in devices:
        path = _normalise_location(d.get("location"))
        node = root
        crumbs: list[str] = []
        for part in path:
            crumbs.append(part)
            child = next((c for c in node["children"] if c["name"] == part), None)
            if child is None:
                child = _empty_node("/".join(crumbs), part)
                node["children"].append(child)
            node = child
        node["device_ids"].append(d["device_id"])

    _sort_tree(root)
    return root


# ---------------------------------------------------------------------------
# 2. Groups tree
# ---------------------------------------------------------------------------

def build_groups_tree(
    devices: Iterable[Device],
    groups: list[dict[str, Any]],
    assoc: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a flat (single-level) tree from Observium device groups.

    Observium groups don't nest, so we produce: root -> group -> [devices].
    Devices that belong to no group bucket under `Ungrouped`.
    """
    root = _empty_node("", "All groups")

    # group_id -> node
    by_id: dict[int, dict[str, Any]] = {}
    for g in groups:
        if g.get("entity_type") and g["entity_type"] != "device":
            continue
        gid = g["group_id"]
        node = _empty_node(f"g{gid}", g.get("group_name") or f"group {gid}")
        by_id[gid] = node
        root["children"].append(node)

    seen: set[int] = set()
    for a in assoc:
        node = by_id.get(a["group_id"])
        if not node:
            continue
        node["device_ids"].append(a["entity_id"])
        seen.add(a["entity_id"])

    ungrouped = [d["device_id"] for d in devices if d["device_id"] not in seen]
    if ungrouped:
        node = _empty_node("ungrouped", "Ungrouped")
        node["device_ids"] = ungrouped
        root["children"].append(node)

    _sort_tree(root)
    return root


# ---------------------------------------------------------------------------
# 3. Topology tree
# ---------------------------------------------------------------------------

def build_topology_tree(
    devices: Iterable[Device],
    edges: Iterable[tuple[int, int]],
) -> dict[str, Any]:
    """Build a tree by BFS from devices that look like 'roots'.

    Heuristic: a root is a device whose `type` is 'network' or 'firewall'
    and that has no incoming edges from another root candidate. We start BFS
    from every device of type `firewall` first, then from `network` devices
    with the largest fan-out, building a parent map.

    Devices unreachable from any root are placed under `Disconnected`.
    """
    devs = list(devices)
    by_id = {d["device_id"]: d for d in devs}

    # Adjacency (undirected for the purposes of spanning-tree).
    adj: dict[int, set[int]] = defaultdict(set)
    for a, b in edges:
        if a in by_id and b in by_id and a != b:
            adj[a].add(b)
            adj[b].add(a)

    # Pick roots: prefer firewalls, then highest-degree network devices.
    firewalls = [d["device_id"] for d in devs if d.get("type") == "firewall"]
    networks = sorted(
        (d["device_id"] for d in devs if d.get("type") == "network"),
        key=lambda i: -len(adj[i]),
    )
    seeds: list[int] = list(firewalls) + [n for n in networks if n not in firewalls]

    parent: dict[int, int | None] = {}
    order: list[int] = []
    visited: set[int] = set()

    for seed in seeds:
        if seed in visited:
            continue
        # BFS
        stack = [seed]
        parent[seed] = None
        visited.add(seed)
        order.append(seed)
        while stack:
            cur = stack.pop(0)
            for nxt in sorted(adj[cur]):
                if nxt in visited:
                    continue
                visited.add(nxt)
                parent[nxt] = cur
                order.append(nxt)
                stack.append(nxt)

    # Build the tree from `parent`.
    nodes_by_id: dict[int, dict[str, Any]] = {}

    def node_for(dev_id: int) -> dict[str, Any]:
        if dev_id in nodes_by_id:
            return nodes_by_id[dev_id]
        d = by_id[dev_id]
        n = _empty_node(f"d{dev_id}", _short_name(d))
        n["device_ids"] = [dev_id]
        nodes_by_id[dev_id] = n
        return n

    root = _empty_node("", "Topology")
    disconnected = _empty_node("disconnected", "Disconnected")

    for dev_id in order:
        n = node_for(dev_id)
        p = parent[dev_id]
        if p is None:
            root["children"].append(n)
        else:
            node_for(p)["children"].append(n)

    for d in devs:
        if d["device_id"] not in visited:
            disconnected["device_ids"].append(d["device_id"])
    if disconnected["device_ids"]:
        root["children"].append(disconnected)

    _sort_tree(root)
    return root


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _empty_node(node_id: str, name: str) -> dict[str, Any]:
    return {"id": node_id, "name": name, "device_ids": [], "children": []}


def _sort_tree(node: dict[str, Any]) -> None:
    node["children"].sort(key=lambda c: c["name"].lower())
    node["device_ids"].sort()
    for c in node["children"]:
        _sort_tree(c)


def _short_name(d: Device) -> str:
    h = d.get("sysName") or d.get("hostname") or f"device {d['device_id']}"
    return h.split(".")[0]
