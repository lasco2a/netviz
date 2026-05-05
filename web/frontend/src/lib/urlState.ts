// Bidirectional sync between the zustand store and the URL hash.
//
// The URL hash carries the full UI state so links are shareable: search
// query, view mode, tree source, tree-node selection, treemap focus,
// selected device, type chips, status chips. Help anchors use a separate
// short hash (`#help=search`) so they don't collide with the JSON state.

import { useEffect } from "react";

import { useApp } from "@/store/app";

interface UrlState {
  q?: string;
  view?: string;
  tree?: string;
  treenode?: string;
  focus?: string;
  dev?: number;
  types?: string[];
  status?: number[];
  help?: string;
}

function readHash(): UrlState {
  const raw = window.location.hash.slice(1);
  if (!raw) return {};
  // Help-anchor shorthand: `#help=search`
  if (raw.startsWith("help=")) return { help: raw.slice("help=".length) };
  try {
    const params = new URLSearchParams(raw);
    const out: UrlState = {};
    for (const [k, v] of params) {
      if (k === "types") out.types = v.split(",").filter(Boolean);
      else if (k === "status") out.status = v.split(",").map(Number).filter((n) => !isNaN(n));
      else if (k === "dev") {
        const n = Number(v);
        if (!isNaN(n)) out.dev = n;
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
  if (state.types && state.types.length) params.set("types", state.types.join(","));
  if (state.status && state.status.length)
    params.set("status", state.status.join(","));
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
  if (u.types) for (const t of u.types) s.toggleType(t);
  if (u.status) for (const st of u.status) s.toggleStatus(st);
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
        view: s.viewMode,
        tree: s.treeSource,
        treenode: s.selectedTreeNode ?? undefined,
        focus: s.treeMapFocus ?? undefined,
        dev: s.selectedDeviceId ?? undefined,
        types: Array.from(s.filters.types),
        status: Array.from(s.filters.statuses),
      });
    });
    return unsub;
  }, []);
}

export function buildShareableUrl(): string {
  return window.location.href;
}
