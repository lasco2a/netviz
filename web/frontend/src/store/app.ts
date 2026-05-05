import { create } from "zustand";

import * as api from "@/lib/api";
import { buildIndex, type SnapshotIndex } from "@/lib/snapshotIndex";
import type { DeviceDetail, MeUser, TreeSource } from "@/lib/types";

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
  selectedTreeNode: string | null; // tree node id (within current tree)
  selectedDeviceId: number | null;
  deviceDetail: DeviceDetail | null;
  loadingDetail: boolean;
  // Filters
  filters: { search: string; types: Set<string>; statuses: Set<number> };
  // View mode
  viewMode: "table" | "graph";
  showGhostEndpoints: boolean;

  // Actions
  checkSession: () => Promise<void>;
  doLogin: (u: string, p: string) => Promise<void>;
  doLogout: () => Promise<void>;
  loadSnapshot: () => Promise<void>;
  setTreeSource: (s: TreeSource) => void;
  setViewMode: (m: "table" | "graph") => void;
  toggleGhostEndpoints: () => void;
  selectTreeNode: (id: string | null) => void;
  selectDevice: (id: number | null) => Promise<void>;
  setSearch: (s: string) => void;
  toggleType: (t: string) => void;
  toggleStatus: (s: number) => void;
}

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
  filters: { search: "", types: new Set(), statuses: new Set() },
  viewMode: "table",
  showGhostEndpoints: false,

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
    set({ treeSource: s, selectedTreeNode: null });
  },

  setViewMode(m) {
    set({ viewMode: m });
  },

  toggleGhostEndpoints() {
    set({ showGhostEndpoints: !get().showGhostEndpoints });
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
  },

  toggleType(t) {
    const f = get().filters;
    const next = new Set(f.types);
    next.has(t) ? next.delete(t) : next.add(t);
    set({ filters: { ...f, types: next } });
  },

  toggleStatus(st) {
    const f = get().filters;
    const next = new Set(f.statuses);
    next.has(st) ? next.delete(st) : next.add(st);
    set({ filters: { ...f, statuses: next } });
  },
}));
