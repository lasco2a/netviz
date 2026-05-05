// Bidirectional sync between the zustand store and the URL hash.
//
// The URL hash carries the full UI state so links are shareable: search
// query, view mode, tree source, tree-node selection, treemap focus,
// selected device, role chips, status chips. Help anchors use a separate
// short hash (`#help=search`) so they don't collide with the JSON state.
// `types=` is accepted on read for backwards compat with old bookmarks.

import { useEffect } from "react";

import { useApp } from "@/store/app";
import {
  GRAPH_LAYOUTS,
  type GraphLayout,
} from "@/lib/cytoscape-config";
import { DEVICE_ROLES, type DeviceRole } from "@/lib/types";

interface UrlState {
  q?: string;
  view?: string;
  tree?: string;
  treenode?: string;
  focus?: string;
  dev?: number;
  roles?: DeviceRole[];
  status?: number[];
  layout?: GraphLayout;
  help?: string;
}

const ROLE_SET = new Set<string>(DEVICE_ROLES);
const LAYOUT_SET = new Set<string>(GRAPH_LAYOUTS);
const DEFAULT_LAYOUT: GraphLayout = "dagre-tb";

function readHash(): UrlState {
  const raw = window.location.hash.slice(1);
  if (!raw) return {};
  // Help-anchor shorthand: `#help=search`
  if (raw.startsWith("help=")) return { help: raw.slice("help=".length) };
  try {
    const params = new URLSearchParams(raw);
    const out: UrlState = {};
    // Accept both `roles=` (new) and legacy `types=` for shareable URL compat.
    const rolesRaw = params.get("roles") ?? params.get("types");
    if (rolesRaw) {
      out.roles = rolesRaw
        .split(",")
        .filter((s) => ROLE_SET.has(s)) as DeviceRole[];
    }
    for (const [k, v] of params) {
      if (k === "roles" || k === "types") continue;
      if (k === "status")
        out.status = v.split(",").map(Number).filter((n) => !isNaN(n));
      else if (k === "dev") {
        const n = Number(v);
        if (!isNaN(n)) out.dev = n;
      } else if (k === "layout") {
        if (LAYOUT_SET.has(v)) out.layout = v as GraphLayout;
      } else (out as Record<string, unknown>)[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeHash(state: UrlState): void {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.view && state.view !== "table") params.set("view", state.view);
  if (state.tree && state.tree !== "location") params.set("tree", state.tree);
  if (state.treenode) params.set("treenode", state.treenode);
  if (state.focus) params.set("focus", state.focus);
  if (state.dev != null) params.set("dev", String(state.dev));
  if (state.roles && state.roles.length) params.set("roles", state.roles.join(","));
  if (state.status && state.status.length)
    params.set("status", state.status.join(","));
  if (state.layout && state.layout !== DEFAULT_LAYOUT)
    params.set("layout", state.layout);
  const next = params.toString();
  const target = next ? `#${next}` : "";
  if (window.location.hash !== target) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}${target}`);
  }
}

// Read the hash on first mount and apply it. Idempotent.
export function hydrateFromHash(): void {
  const u = readHash();
  if (u.help) {
    useApp.getState().setHelpOpen(u.help);
    return;
  }
  const s = useApp.getState();
  if (u.q != null) s.setSearch(u.q);
  if (u.view === "table" || u.view === "graph" || u.view === "treemap") s.setViewMode(u.view);
  if (u.tree === "location" || u.tree === "groups" || u.tree === "topology") {
    // setTreeSource clears node+focus; re-apply them after.
    s.setTreeSource(u.tree);
  }
  if (u.treenode) s.selectTreeNode(u.treenode);
  if (u.focus) s.setTreeMapFocus(u.focus);
  if (u.dev != null) s.selectDevice(u.dev);
  if (u.roles) for (const r of u.roles) s.toggleRole(r);
  if (u.status) for (const st of u.status) s.toggleStatus(st);
  if (u.layout) s.setGraphLayout(u.layout);
}

// React hook: subscribes to store changes and writes them back to the hash.
export function useUrlSync(): void {
  useEffect(() => {
    const unsub = useApp.subscribe((s) => {
      // Skip writes while the help modal is showing the anchor form.
      if (s.helpOpen) {
        const target = `#help=${s.helpOpen}`;
        if (window.location.hash !== target) {
          history.replaceState(null, "", `${window.location.pathname}${window.location.search}${target}`);
        }
        return;
      }
      writeHash({
        q: s.filters.search,
        // Don't persist the admin view — it's a transient panel.
        view: s.viewMode === "admin" ? "table" : s.viewMode,
        tree: s.treeSource,
        treenode: s.selectedTreeNode ?? undefined,
        focus: s.treeMapFocus ?? undefined,
        dev: s.selectedDeviceId ?? undefined,
        roles: Array.from(s.filters.roles),
        status: Array.from(s.filters.statuses),
        layout: s.graphLayout,
      });
    });
    return unsub;
  }, []);
}

export function buildShareableUrl(): string {
  return window.location.href;
}
