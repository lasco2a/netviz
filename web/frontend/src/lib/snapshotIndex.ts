// In-memory snapshot index. Built once after fetch; consumed by graph + table.

import type { Device, Edge, Snapshot, TreeNode } from "./types";

export interface SnapshotIndex {
  raw: Snapshot;
  byId: Map<number, Device>;
  // Adjacency: for each device, list of (neighbourId, edge).
  adjacency: Map<number, Array<{ other: number; edge: Edge }>>;
  // Pre-flattened device-id sets per tree node id, including descendants.
  treeDescendants: Record<string, Set<number>>;
}

export function buildIndex(s: Snapshot): SnapshotIndex {
  const byId = new Map<number, Device>();
  for (const d of s.devices) byId.set(d.device_id, d);

  const adjacency = new Map<number, Array<{ other: number; edge: Edge }>>();
  for (const e of s.edges) {
    if (!adjacency.has(e.a)) adjacency.set(e.a, []);
    if (!adjacency.has(e.b)) adjacency.set(e.b, []);
    adjacency.get(e.a)!.push({ other: e.b, edge: e });
    adjacency.get(e.b)!.push({ other: e.a, edge: e });
  }

  const treeDescendants: Record<string, Set<number>> = {};
  for (const treeName of Object.keys(s.trees) as Array<keyof typeof s.trees>) {
    walkTree(s.trees[treeName], (node, descendantIds) => {
      treeDescendants[`${treeName}:${node.id}`] = descendantIds;
    });
  }

  return { raw: s, byId, adjacency, treeDescendants };
}

// Post-order traversal that yields each node together with the union of all
// device_ids in its subtree.
function walkTree(
  node: TreeNode,
  visit: (n: TreeNode, descendants: Set<number>) => void,
): Set<number> {
  const all = new Set<number>(node.device_ids);
  for (const c of node.children) {
    for (const id of walkTree(c, visit)) all.add(id);
  }
  visit(node, all);
  return all;
}
