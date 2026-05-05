import { useApp } from "@/store/app";

// Returns the set of device ids visible after applying the active filters.
//
// Pipeline (intersected): tree-node descendants ∩ type chips ∩ status chips ∩
// server search results (when query non-empty).
export function useFilteredDeviceIds(): Set<number> {
  const index = useApp((s) => s.index);
  const treeSource = useApp((s) => s.treeSource);
  const selectedTreeNode = useApp((s) => s.selectedTreeNode);
  const filters = useApp((s) => s.filters);
  const searchResult = useApp((s) => s.searchResult);

  if (!index) return new Set();

  let candidate: Iterable<number>;
  if (selectedTreeNode) {
    candidate =
      index.treeDescendants[`${treeSource}:${selectedTreeNode}`] ?? new Set<number>();
  } else {
    candidate = index.byId.keys();
  }

  const out = new Set<number>();
  for (const id of candidate) {
    const d = index.byId.get(id);
    if (!d) continue;
    if (filters.roles.size && !filters.roles.has(d.role)) continue;
    if (filters.statuses.size && !filters.statuses.has(d.status)) continue;
    if (searchResult && !searchResult.devices.has(id)) continue;
    out.add(id);
  }
  return out;
}
