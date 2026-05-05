import { create } from "zustand";

import * as api from "@/lib/api";
import { buildIndex, type SnapshotIndex } from "@/lib/snapshotIndex";
import type { DeviceDetail, DeviceRole, MeUser, TreeSource } from "@/lib/types";

export interface SearchResult {
  devices: Set<number>;
  endpoints: Set<number>;
}

interface AppState {
  // Auth
  user: MeUser | null;
  authChecked: boolean;
  // Snapshot
  index: SnapshotIndex | null;
  loadingSnapshot: boolean;
  snapshotError: string | null;
  // UI selection
  treeSource: TreeSource;
  selectedTreeNode: string | null;
  selectedDeviceId: number | null;
  deviceDetail: DeviceDetail | null;
  loadingDetail: boolean;
  // Filters
  filters: { search: string; roles: Set<DeviceRole>; statuses: Set<number> };
  // Search (always server-side when query non-empty)
  searchResult: SearchResult | null;
  searchPending: boolean;
  searchError: string | null;
  // View mode
  viewMode: "table" | "graph" | "treemap";
  treeMapFocus: string | null;
  showGhostEndpoints: boolean;
  clusterMode: "off" | "tree";
  collapseClusters: boolean;
  // Modals
  helpOpen: string | null; // null = closed; otherwise section anchor
  adminOpen: boolean;

  // Actions
  checkSession: () => Promise<void>;
  doLogin: (u: string, p: string) => Promise<void>;
  doLogout: () => Promise<void>;
  loadSnapshot: () => Promise<void>;
  setTreeSource: (s: TreeSource) => void;
  setViewMode: (m: "table" | "graph" | "treemap") => void;
  setTreeMapFocus: (id: string | null) => void;
  toggleGhostEndpoints: () => void;
  setClusterMode: (m: "off" | "tree") => void;
  toggleCollapseClusters: () => void;
  selectTreeNode: (id: string | null) => void;
  selectDevice: (id: number | null) => Promise<void>;
  setSearch: (s: string) => void;
  toggleRole: (r: DeviceRole) => void;
  toggleStatus: (s: number) => void;
  setHelpOpen: (id: string | null) => void;
  setAdminOpen: (open: boolean) => void;
}

// Module-scoped controller so successive setSearch() calls cancel in-flight
// requests. Keeping this outside zustand avoids type gymnastics.
let _searchAborter: AbortController | null = null;
let _searchTimer: ReturnType<typeof setTimeout> | null = null;
const SEARCH_DEBOUNCE_MS = 250;

export const useApp = create<AppState>((set, get) => ({
  user: null,
  authChecked: false,
  index: null,
  loadingSnapshot: false,
  snapshotError: null,
  treeSource: "location",
  selectedTreeNode: null,
  selectedDeviceId: null,
  deviceDetail: null,
  loadingDetail: false,
  filters: { search: "", roles: new Set(), statuses: new Set() },
  searchResult: null,
  searchPending: false,
  searchError: null,
  viewMode: "table",
  treeMapFocus: null,
  showGhostEndpoints: false,
  clusterMode: "off",
  collapseClusters: false,
  helpOpen: null,
  adminOpen: false,

  async checkSession() {
    try {
      const u = await api.me();
      set({ user: u, authChecked: true });
    } catch {
      set({ user: null, authChecked: true });
    }
  },

  async doLogin(username, password) {
    const u = await api.login(username, password);
    set({ user: u });
  },

  async doLogout() {
    await api.logout();
    set({
      user: null,
      index: null,
      selectedDeviceId: null,
      deviceDetail: null,
      selectedTreeNode: null,
    });
  },

  async loadSnapshot() {
    if (get().loadingSnapshot) return;
    set({ loadingSnapshot: true, snapshotError: null });
    try {
      const snap = await api.fetchSnapshot();
      set({ index: buildIndex(snap), loadingSnapshot: false });
    } catch (e) {
      set({
        loadingSnapshot: false,
        snapshotError: e instanceof Error ? e.message : "snapshot failed",
      });
    }
  },

  setTreeSource(s) {
    set({ treeSource: s, selectedTreeNode: null, treeMapFocus: null });
  },

  setViewMode(m) {
    set({ viewMode: m });
  },

  setTreeMapFocus(id) {
    set({ treeMapFocus: id });
  },

  toggleGhostEndpoints() {
    set({ showGhostEndpoints: !get().showGhostEndpoints });
  },

  setClusterMode(m) {
    set({ clusterMode: m });
  },

  toggleCollapseClusters() {
    set({ collapseClusters: !get().collapseClusters });
  },

  selectTreeNode(id) {
    set({ selectedTreeNode: id });
  },

  async selectDevice(id) {
    set({ selectedDeviceId: id, deviceDetail: null });
    if (id == null) return;
    set({ loadingDetail: true });
    try {
      const d = await api.fetchDevice(id);
      set({ deviceDetail: d, loadingDetail: false });
    } catch {
      set({ loadingDetail: false });
    }
  },

  setSearch(s) {
    set({ filters: { ...get().filters, search: s } });
    // Cancel any pending fetch.
    if (_searchTimer) clearTimeout(_searchTimer);
    if (_searchAborter) _searchAborter.abort();

    const trimmed = s.trim();
    if (!trimmed) {
      set({ searchResult: null, searchPending: false, searchError: null });
      return;
    }
    set({ searchPending: true, searchError: null });
    _searchTimer = setTimeout(async () => {
      const aborter = new AbortController();
      _searchAborter = aborter;
      try {
        const res = await api.search(trimmed, aborter.signal);
        // Stale check: if the user typed again the trimmed value will differ.
        if (get().filters.search.trim() !== trimmed) return;
        set({
          searchResult: {
            devices: new Set(res.devices),
            endpoints: new Set(res.endpoints),
          },
          searchPending: false,
        });
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        set({
          searchPending: false,
          searchError: e instanceof Error ? e.message : "search failed",
        });
      }
    }, SEARCH_DEBOUNCE_MS);
  },

  toggleRole(r) {
    const f = get().filters;
    const next = new Set(f.roles);
    next.has(r) ? next.delete(r) : next.add(r);
    set({ filters: { ...f, roles: next } });
  },

  toggleStatus(st) {
    const f = get().filters;
    const next = new Set(f.statuses);
    next.has(st) ? next.delete(st) : next.add(st);
    set({ filters: { ...f, statuses: next } });
  },

  setHelpOpen(id) {
    set({ helpOpen: id });
  },

  setAdminOpen(open) {
    set({ adminOpen: open });
  },
}));
