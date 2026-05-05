# netviz

Standalone network visualisation frontend backed by a periodic snapshot of an
Observium MariaDB database. Built to scale to 5 000+ devices on a real network
while keeping the UI responsive: the backend serves static JSON snapshots, and
the React frontend renders a filterable table + Cytoscape.js graph view.

```
┌─────────────┐    every 6 h      ┌──────────────┐     HTTPS       ┌──────────┐
│  Observium  │ ───────────────►  │   exporter   │ ──── writes ──► │ snapshot │
│  MariaDB    │                   │  (Python)    │                 │  *.json  │
└─────────────┘                   └──────────────┘                 └────┬─────┘
                                                                        │
                       ┌──────────────────────────────────────┐         │
                       │         FastAPI backend              │ ◄──────-┘
                       │  - JWT cookie auth (Observium hash)  │
                       │  - GET /snapshot.json (gated)        │
                       │  - GET /device/{id}.json (gated)     │
                       │  - SPA static hosting                │
                       └────────────────┬─────────────────────┘
                                        │
                                        ▼
                       ┌──────────────────────────────────────┐
                       │      React 18 + Vite frontend        │
                       │  - Tree picker (location/groups/...) │
                       │  - Virtualised DeviceTable           │
                       │  - Cytoscape.js GraphView (fcose)    │
                       │  - Cluster + collapse + filter chips │
                       └──────────────────────────────────────┘
```

## Quick start

```bash
# 1. clone or open this repository
cd /home/lasco/workspace/netviz

# 2. one-shot install (creates .venv, installs deps, copies .env.example)
./scripts/install.sh

# 3. edit .env (DB credentials, snapshot dir, session secret, port)
$EDITOR .env

# 4. generate the first snapshot
./scripts/snapshot-now.sh

# 5. build the frontend (so the backend can serve it)
cd web/frontend && npm run build && cd ../..

# 6. run the backend (development)
./scripts/dev-backend.sh
# open http://127.0.0.1:8080 — log in with any Observium account
```

For development with frontend hot reload run the backend on `:8080` (above) and
the Vite dev server on `:5173` in a second terminal:

```bash
./scripts/dev-frontend.sh
```

The Vite proxy forwards `/api`, `/snapshot.json`, `/device` to the backend.

## Production deploy (systemd --user)

```bash
./scripts/install-systemd.sh
sudo loginctl enable-linger "$USER"   # so units run when you're logged out
```

This installs three user units:

| Unit | Purpose |
|------|---------|
| `netviz-backend.service`  | FastAPI / uvicorn |
| `netviz-exporter.service` | one-shot snapshot rebuild |
| `netviz-exporter.timer`   | runs `netviz-exporter.service` 2 min after boot, then every 6 h |

```bash
systemctl --user status  netviz-backend.service
systemctl --user list-timers netviz-exporter.timer
journalctl  --user -u netviz-backend.service -f
```

## Configuration (`.env`)

| Var | Description |
|-----|-------------|
| `OBSERVIUM_DB_HOST` / `_PORT` / `_NAME` / `_USER` / `_PASS` | Observium DB connection. Read-only is enough. |
| `NETVIZ_SNAPSHOT_DIR`  | Directory for `snapshot.json` and `device/`. |
| `NETVIZ_HOST` / `NETVIZ_PORT` | Backend bind address (default `0.0.0.0:8080`). |
| `NETVIZ_SESSION_HOURS` | JWT cookie lifetime (default 8 h). |
| `NETVIZ_SESSION_SECRET` | HMAC secret for the JWT cookie. **Set me.** |
| `NETVIZ_MIN_USER_LEVEL` | Minimum Observium user level allowed to log in (0–10, 10=admin). Default 1. |
| `NETVIZ_DNS_ENABLED` | Toggle scheduled reverse-DNS lookups. Default `true`. |
| `NETVIZ_DNS_CACHE_TTL_DAYS` | Re-resolve cache entries older than this. Default 7. |

## Layout

```
netviz/
├── netviz/                  # Python package
│   ├── config.py            # env loader
│   ├── db.py                # connection helpers
│   ├── exporter/            # snapshot builder
│   │   ├── snapshot.py
│   │   ├── trees.py
│   │   └── __main__.py      # `python -m netviz.exporter`
│   └── web/backend/         # FastAPI app
│       ├── auth.py
│       └── main.py
├── snapshot/                # output of the exporter (gitignored)
│   ├── snapshot.json
│   └── device/<id>.json
├── web/frontend/            # React/Vite app
│   ├── src/
│   │   ├── components/      # TopBar, FilterBar, DeviceTable, GraphView, ...
│   │   ├── lib/             # types, api client, cytoscape config, filters
│   │   └── store/app.ts     # zustand store
│   └── dist/                # built bundle (served by backend)
├── scripts/                 # bootstrap + dev scripts
└── systemd/                 # user-level units (timer + services)
```

## Authentication

netviz reuses Observium's `users` table directly. Login validates the supplied
password against the existing bcrypt hash (`$2y$…`) using the `bcrypt`
library; on success the backend mints a JWT and stores it in an HttpOnly
cookie. No new credentials, no user duplication.

Users below `NETVIZ_MIN_USER_LEVEL` are rejected.

## Snapshot contents

`snapshot.json`:

| Field | Notes |
|-------|-------|
| `meta` | `generated_at`, `device_count`, `edge_count`, `ghost_endpoint_count` |
| `devices[]` | Hostname, IP, vendor, hardware, status, type, location, ... |
| `edges[]` | Resolved neighbour pairs (deduplicated, undirected) |
| `ghost_endpoints[]` | Neighbours whose remote device is not in Observium (rendered as ghost nodes) |
| `trees` | `{ location, groups, topology }` — three independent trees |

Each device additionally gets a `device/<id>.json` file with ports, neighbours,
processors and mempools.

Writes are atomic: the exporter writes to a temp file and renames over the
target, and per-device files go into a sibling `device.new/` directory that
replaces `device/` only after the full set is on disk. The backend never reads
a partial snapshot.

## Frontend features

- **Tree picker**: switch between location / groups / topology. Selecting a
  node filters the table and graph to that subtree.
- **Filter chips**: role and status (up/down) chips with live counts.
- **Search** (always server-side, debounced 250 ms). Tokens are AND-ed:
  - free text: matches hostname, sysName, IP, role, location, hardware, ifAlias
  - quoted phrase: `"rack a"`
  - IPv4/IPv6 exact, CIDR (`10.0.0.0/8`, `2001:db8::/32`)
  - IPv4 range full or last-octet shorthand: `10.1.1.10-10.1.1.50`, `10.1.1.10-50`
  - MAC: any of `aa:bb:cc:dd:ee:ff`, `aa-bb-cc-dd-ee-ff`, `aabbccddeeff`,
    OUI prefix `aabbcc`
  - Matches devices **and** endpoints; chips intersect on the device side.
- **Endpoints**: IP/MAC entries learned from Observium's `ip_mac` table.
  Visible in the device drawer with a `→` link to the managed device when an
  endpoint IP matches another device. Reverse-DNS hostnames are populated by a
  separate timer (see below).
- **Tree-Map**: explorable map view; drill from root → tree node → device →
  endpoints; click breadcrumb to escape.
- **URL state**: search query, view, tree, focus, drawer device and active
  chips persist in the hash (`roles=` replaces old `types=`; old bookmarks
  with `types=` are still accepted). Use the **Copy link** button to share a deep-link.
- **Help (?)**: opens an in-app help modal — also addressable via
  `#help=search`, `#help=endpoints`, etc.
- **Admin (⚙)**: visible to Observium users with `level >= 10`. Force a
  snapshot rebuild or reverse-DNS refresh; status panel tails the last
  ~200 lines of the running job.
- **Device drawer**: facts, ports, neighbours, processors, mempools,
  endpoints.
- **Graph view**: Cytoscape.js with switchable layouts. Click a node to open the drawer.
  - **Layout dropdown** in the toolbar — choose between Force (fcose), Pyramid
    (dagre top-down, the default), Horizontal (dagre LR), Breadth-first, Circle,
    Concentric (sphere-like, ranked by degree), Grid and ELK (layered). The
    selection is persisted in the URL hash via `layout=`.
  - **Double-click** a device node to zoom in 15 % (incremental, capped at 4×)
    centred on it and highlight its direct neighbours (+ ghost endpoints) in
    green. Double-click another node to move the highlight; click empty canvas
    to clear it.
  - **Ghost endpoints** toggle (capped at 1 500 per view).
  - **Cluster by tree** toggle: wraps device nodes in compound parents derived
    from the top-level tree node. Only available with the Force layout —
    enabling it from another layout snaps back to Force.
  - **Collapse**: when clustering is on, render only one node per cluster with
    weighted summary edges between clusters — true tree-graph hybrid.
  - Built-in legend overlay.

## Device roles

The exporter classifies every device into one of eleven roles using an ordered
rule table in `netviz/exporter/snapshot.py`. The role is stored as
`device.role` in the snapshot and is used for icons in every view.

| Role | Icon | Classification rule |
|------|------|---------------------|
| `firewall` | ShieldHalf | sysDescr / hostname contains *firewall*, *asa*, *pix*, *fortigate*, *checkpoint*, *palo* |
| `router` | Router | type=`network` + sysDescr / hostname contains *router*, *rtr*, *gw*, *gateway*, *junos*, *vyos*, *mikrotik* |
| `wireless` | AccessPoint | type=`wireless`, or sysDescr contains *access point*, *ap*, *airos* |
| `server` | Server | type=`server`, `linux`, `windows`, or `esxi` |
| `storage` | Database | type=`storage` or sysDescr contains *nas*, *san*, *netapp*, *synology* |
| `printer` | Printer | type=`printer` or sysDescr contains *print* |
| `workstation` | Desktop | type=`workstation` or sysDescr contains *workstation*, *desktop*, *laptop* |
| `power` | Bolt | type=`power` or sysDescr contains *ups*, *pdu* |
| `environment` | Temperature | type=`environment` or sysDescr contains *sensor*, *climate* |
| `switch` | Network | type=`network` (default for network devices not matched above) |
| `unknown` | DeviceUnknown | everything else |

Role icons appear in: **Graph view** nodes, **Tree-Map** leaves, **Device table**
hostname column, **Device drawer** header, and **Filter Bar** role chips.

## Reverse-DNS resolver

A separate timer (`netviz-dns.timer`, daily) runs `python -m netviz.dns_resolver`
which reads `snapshot/snapshot.json`, performs reverse lookups for IP addresses
not seen recently, and writes `snapshot/dns_cache.json`. The next exporter run
joins the cache into `endpoints[].hostname`.

| Var | Description |
|-----|-------------|
| `NETVIZ_DNS_ENABLED` | Disable scheduled lookups (`false` = no-op). Default `true`. |
| `NETVIZ_DNS_CACHE_TTL_DAYS` | Re-resolve entries older than N days. Default 7. |

When `NETVIZ_DNS_ENABLED=false`, the in-app Admin panel can still trigger a
one-off run after two confirmation prompts.

## Roadmap

- [x] Milestone 1 – exporter MVP
- [x] Milestone 2 – per-device files + groups/topology trees
- [x] Milestone 3 – FastAPI backend with auth
- [x] Milestone 4 – frontend skeleton (login, TopBar, tree, table, drawer)
- [x] Milestone 5 – Cytoscape graph view
- [x] Milestone 6 – clustering + filter chips + search highlighting
- [x] Milestone 7 – tree-graph hybrid (collapse) + legend + auto-fit
- [x] Milestone 8 – systemd units + cron timer + README
- [x] Milestone 9 – endpoints (`ip_mac`) + DNS resolver + smart search + URL state + Tree-Map + Help/Admin

## Tracking

Project tracking lives in Jira (`KAN`) and Confluence (`opencode`). See
[`JIRA_EPICS.md`](JIRA_EPICS.md) for the live list of epics, stories, and
subtasks.
