import { useMemo, useState } from "react";

import type { TreeNode, TreeSource } from "@/lib/types";
import { useApp } from "@/store/app";

const SOURCES: { value: TreeSource; label: string }[] = [
  { value: "location", label: "Location" },
  { value: "groups", label: "Groups" },
  { value: "topology", label: "Topology" },
];

export function LocationTree() {
  const index = useApp((s) => s.index);
  const treeSource = useApp((s) => s.treeSource);
  const setTreeSource = useApp((s) => s.setTreeSource);
  const selected = useApp((s) => s.selectedTreeNode);
  const select = useApp((s) => s.selectTreeNode);

  const root = index?.raw.trees[treeSource] ?? null;

  return (
    <div className="h-full flex flex-col bg-white border-r border-obs-border">
      <div className="px-3 py-2 border-b border-obs-border flex items-center gap-2">
        <span className="text-xs text-obs-mute">Tree</span>
        <select
          value={treeSource}
          onChange={(e) => setTreeSource(e.target.value as TreeSource)}
          className="text-xs border border-obs-border rounded px-1 py-0.5 bg-white"
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {selected && (
          <button
            className="ml-auto text-xs text-obs-blue hover:underline"
            onClick={() => select(null)}
          >
            clear
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto py-1 text-sm">
        {root ? (
          <TreeBranch node={root} depth={0} />
        ) : (
          <div className="p-3 text-obs-mute text-xs">no data</div>
        )}
      </div>
    </div>
  );
}

function TreeBranch({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const selected = useApp((s) => s.selectedTreeNode);
  const select = useApp((s) => s.selectTreeNode);
  const treeSource = useApp((s) => s.treeSource);
  const index = useApp((s) => s.index);

  const total = useMemo(
    () =>
      index?.treeDescendants[`${treeSource}:${node.id}`]?.size ??
      node.device_ids.length,
    [index, treeSource, node],
  );

  const isLeaf = node.children.length === 0;
  const isSelected = selected === node.id;
  const isRoot = depth === 0;

  return (
    <div>
      <div
        className={`flex items-center pr-2 py-0.5 cursor-pointer hover:bg-obs-surface ${
          isSelected ? "bg-blue-50 border-l-2 border-obs-blue" : ""
        }`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => {
          if (!isRoot) select(isSelected ? null : node.id);
        }}
      >
        {!isLeaf ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
            className="w-4 h-4 flex items-center justify-center text-obs-mute hover:text-obs-navy"
          >
            {open ? "\u25BE" : "\u25B8"}
          </button>
        ) : (
          <span className="w-4 h-4 inline-block" />
        )}
        <span className="flex-1 truncate">{node.name || "(root)"}</span>
        <span className="text-xs text-obs-mute ml-2">{total}</span>
      </div>
      {open &&
        node.children.map((c) => (
          <TreeBranch key={c.id} node={c} depth={depth + 1} />
        ))}
    </div>
  );
}
