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
- **Filter chips**: type and status (up/down) chips with live counts.
- **Search**: hostname, sysName, IP, location, hardware. In the graph view,
  matches are highlighted and non-matches are dimmed.
- **Device table**: virtualised; click a row to open the drawer.
- **Device drawer**: facts, ports (with ifAlias / speed / oper status),
  neighbours, processors, mempools (with utilisation bars).
- **Graph view**: Cytoscape.js + fcose. Click a node to open the drawer.
  - **Ghost endpoints** toggle (capped at 1 500 per view).
  - **Cluster by tree** toggle: wraps device nodes in compound parents derived
    from the top-level tree node.
  - **Collapse**: when clustering is on, render only one node per cluster with
    weighted summary edges between clusters — true tree-graph hybrid.
  - Built-in legend overlay.

## Roadmap

- [x] Milestone 1 – exporter MVP
- [x] Milestone 2 – per-device files + groups/topology trees
- [x] Milestone 3 – FastAPI backend with auth
- [x] Milestone 4 – frontend skeleton (login, TopBar, tree, table, drawer)
- [x] Milestone 5 – Cytoscape graph view
- [x] Milestone 6 – clustering + filter chips + search highlighting
- [x] Milestone 7 – tree-graph hybrid (collapse) + legend + auto-fit
- [x] Milestone 8 – systemd units + cron timer + README

## Tracking

Project tracking lives in Jira (`KAN`) and Confluence (`opencode`). See
[`JIRA_EPICS.md`](JIRA_EPICS.md) for the live list of epics, stories, and
subtasks.
