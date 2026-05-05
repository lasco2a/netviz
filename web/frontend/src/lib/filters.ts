import { useApp } from "@/store/app";
import type { Device } from "@/lib/types";

// Returns the set of device ids visible after applying the active filters.
export function useFilteredDeviceIds(): Set<number> {
  const index = useApp((s) => s.index);
  const treeSource = useApp((s) => s.treeSource);
  const selectedTreeNode = useApp((s) => s.selectedTreeNode);
  const filters = useApp((s) => s.filters);

  if (!index) return new Set();

  let candidate: Iterable<number>;
  if (selectedTreeNode) {
    candidate =
      index.treeDescendants[`${treeSource}:${selectedTreeNode}`] ?? new Set<number>();
  } else {
    candidate = index.byId.keys();
  }

  const search = filters.search.trim().toLowerCase();
  const out = new Set<number>();
  for (const id of candidate) {
    const d = index.byId.get(id);
    if (!d) continue;
    if (filters.types.size && !filters.types.has(d.type ?? "")) continue;
    if (filters.statuses.size && !filters.statuses.has(d.status)) continue;
    if (search && !matchesSearch(d, search)) continue;
    out.add(id);
  }
  return out;
}

function matchesSearch(d: Device, q: string): boolean {
  return (
    (d.hostname ?? "").toLowerCase().includes(q) ||
    (d.sysName ?? "").toLowerCase().includes(q) ||
    (d.ip ?? "").toLowerCase().includes(q) ||
    (d.location ?? "").toLowerCase().includes(q) ||
    (d.hardware ?? "").toLowerCase().includes(q)
  );
}
