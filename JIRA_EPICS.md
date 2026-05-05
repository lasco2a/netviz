# netviz – Jira Epics Reference

This file tracks Jira epics and stories for the netviz project.
Keep it up to date as new epics are created.

## Active Epics

| Key | Summary | Status | Due |
|-----|---------|--------|-----|
| [KAN-352](https://laurent2a.atlassian.net/browse/KAN-352) | netviz: Standalone Network Visualisation Tool for Observium | In Progress | 2026-06-30 |

---

## Stories & Tasks Under KAN-352

### Milestone 5 – Cytoscape Graph View

| Key | Summary | Type | Status | Due |
|-----|---------|------|--------|-----|
| [KAN-353](https://laurent2a.atlassian.net/browse/KAN-353) | Milestone 5: Cytoscape Graph View with Table/Graph Toggle | Story | Done | 2026-05-05 |
| [KAN-354](https://laurent2a.atlassian.net/browse/KAN-354) | Cytoscape config: fcose layout + Observium-palette styles | Subtask | Done | 2026-05-05 |
| [KAN-355](https://laurent2a.atlassian.net/browse/KAN-355) | GraphView component: elements builder, ghost endpoints, click handler | Subtask | Done | 2026-05-05 |
| [KAN-356](https://laurent2a.atlassian.net/browse/KAN-356) | Store: add viewMode and showGhostEndpoints state | Subtask | Done | 2026-05-05 |
| [KAN-357](https://laurent2a.atlassian.net/browse/KAN-357) | TopBar: Table/Graph segmented toggle control | Subtask | Done | 2026-05-05 |
| [KAN-358](https://laurent2a.atlassian.net/browse/KAN-358) | App.tsx: switch centre pane on viewMode | Subtask | Done | 2026-05-05 |
| [KAN-359](https://laurent2a.atlassian.net/browse/KAN-359) | TypeScript clean compile + production build verification | Subtask | Done | 2026-05-05 |

### Milestones 6–9 – Clustering, Tree-Map, DNS, Endpoints & Admin

| Key | Summary | Type | Status | Due |
|-----|---------|------|--------|-----|
| [KAN-360](https://laurent2a.atlassian.net/browse/KAN-360) | Milestones 6–9: Clustering, Tree-Map, DNS, Endpoints & Admin | Story | Done | 2026-05-05 |
| [KAN-361](https://laurent2a.atlassian.net/browse/KAN-361) | M6: Device clustering by tree + filter chips + search highlighting | Subtask | Done | 2026-05-05 |
| [KAN-362](https://laurent2a.atlassian.net/browse/KAN-362) | M7: Tree-graph hybrid view (collapse/expand clusters) + legend + auto-fit | Subtask | Done | 2026-05-05 |
| [KAN-363](https://laurent2a.atlassian.net/browse/KAN-363) | M8: systemd user units (backend + exporter + timer) + production README | Subtask | Done | 2026-05-05 |
| [KAN-364](https://laurent2a.atlassian.net/browse/KAN-364) | M9: ip_mac endpoints + reverse-DNS resolver + smart search + URL hash state + Tree-Map view + Help & Admin modals | Subtask | Done | 2026-05-05 |

### UI Polish & Admin Fixes

| Key | Summary | Type | Status | Due |
|-----|---------|------|--------|-----|
| [KAN-365](https://laurent2a.atlassian.net/browse/KAN-365) | UI Polish: Dark/Light Theme, Admin Fixes & Zoom Controls | Story | Done | 2026-05-05 |
| [KAN-366](https://laurent2a.atlassian.net/browse/KAN-366) | Dark/light theme: CSS custom properties, .dark class toggle, all components updated | Subtask | Done | 2026-05-05 |
| [KAN-367](https://laurent2a.atlassian.net/browse/KAN-367) | SQL query log: performance_schema.events_statements_history_long + rows_examined + source badge | Subtask | Done | 2026-05-05 |
| [KAN-368](https://laurent2a.atlassian.net/browse/KAN-368) | Panel collapse buttons: overlaid ‹/› toggles at top-right of each panel | Subtask | Done | 2026-05-05 |
| [KAN-369](https://laurent2a.atlassian.net/browse/KAN-369) | TopBar: Admin button moved to far-right corner, theme toggle button added | Subtask | Done | 2026-05-05 |
| [KAN-370](https://laurent2a.atlassian.net/browse/KAN-370) | IP filter search bug fix: d.ip added to deviceHaystack() in search.ts and search.py | Subtask | Done | 2026-05-05 |
| [KAN-371](https://laurent2a.atlassian.net/browse/KAN-371) | GraphView + TreeMapView: +/- zoom buttons overlay, default zoom step changed 15→50% | Subtask | Done | 2026-05-05 |
| [KAN-372](https://laurent2a.atlassian.net/browse/KAN-372) | Admin panel: inline confirmation dialogs for Refresh Snapshot and Run DNS | Subtask | Done | 2026-05-05 |
| [KAN-373](https://laurent2a.atlassian.net/browse/KAN-373) | TopBar: Share this link button — execCommand clipboard fallback + Copied! feedback | Subtask | Done | 2026-05-05 |

### M10 – Scheduler, Snapshot SQL Visibility & Admin Fixes

| Key | Summary | Type | Status | Due |
|-----|---------|------|--------|-----|
| TBD | M10: Admin Scheduler, Snapshot SQL Visibility & Auth/Polling Fixes | Story | Done | 2026-06-30 |
| TBD | Fix Vite proxy port misconfiguration (8080→8181) — resolved admin 401 auth errors | Subtask | Done | 2026-06-30 |
| TBD | Fix db.py duplicate function definitions — restore web-layer SQL logging | Subtask | Done | 2026-06-30 |
| TBD | Add snapshot SQL visibility: instrument exporter, new endpoint, admin panel section | Subtask | Done | 2026-06-30 |
| TBD | Add background scheduler: per-schedule DNS option, .schedule.json persistence | Subtask | Done | 2026-06-30 |
| TBD | Schedule UI in admin panel: time picker, DNS checkbox, enabled toggle, last run timestamp | Subtask | Done | 2026-06-30 |
| TBD | Fix admin panel polling: adaptive 30s idle / 1.5s while job running | Subtask | Done | 2026-06-30 |
| TBD | Fix crypto.randomUUID() crash in non-secure HTTP contexts | Subtask | Done | 2026-06-30 |

> **Note**: Jira tickets not yet created — Atlassian MCP was not connected during this session. Run session again with MCP to create tickets and update Confluence (page 41287785).

### Documentation

| Key | Summary | Type | Status | Due |
|-----|---------|------|--------|-----|
| [KAN-374](https://laurent2a.atlassian.net/browse/KAN-374) | Documentation: Observium DB Table Mapping & Confluence update | Story | Done | 2026-05-05 |
| [KAN-375](https://laurent2a.atlassian.net/browse/KAN-375) | README.md: add Observium database tables section (tables, columns, snapshot fields) | Subtask | Done | 2026-05-05 |
| [KAN-376](https://laurent2a.atlassian.net/browse/KAN-376) | Confluence: update netviz page with DB table docs, completed milestones, and recent fixes | Subtask | Done | 2026-05-05 |

---

## Confluence Documentation

| Page | Space | Link |
|------|-------|------|
| netviz – Network Visualisation Tool for Observium (KAN-352) | opencode | [Confluence Page](https://laurent2a.atlassian.net/wiki/spaces/opencode/pages/41287785) |

## GitHub

- Repo: **https://github.com/lasco2a/netviz**
- Branch `main` — production-ready, all milestones merged

---

*Last updated: 2026-05-06 | KAN-352 active | M10 committed, Jira tickets pending MCP reconnect*
