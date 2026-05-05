import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from "cytoscape";

import {
  cyStyle,
  GRAPH_LAYOUTS,
  GRAPH_LAYOUT_LABELS,
  layoutOptionsFor,
} from "@/lib/cytoscape-config";
import { iconUrlFor } from "@/lib/deviceIcon";
import { useFilteredDeviceIds } from "@/lib/filters";
import type { TreeNode } from "@/lib/types";
import { useApp } from "@/store/app";

// Hard cap on rendered ghost endpoints to keep the canvas usable on huge sites.
const MAX_GHOSTS = 1500;

export function GraphView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const index = useApp((s) => s.index);
  const treeSource = useApp((s) => s.treeSource);
  const selectedDeviceId = useApp((s) => s.selectedDeviceId);
  const selectDevice = useApp((s) => s.selectDevice);
  const showGhosts = useApp((s) => s.showGhostEndpoints);
  const clusterMode = useApp((s) => s.clusterMode);
  const setClusterMode = useApp((s) => s.setClusterMode);
  const collapseClusters = useApp((s) => s.collapseClusters);
  const toggleCollapse = useApp((s) => s.toggleCollapseClusters);
  const graphLayout = useApp((s) => s.graphLayout);
  const setGraphLayout = useApp((s) => s.setGraphLayout);

  // Zoom step for double-click. Kept as local view state (not URL-persisted).
  const [zoomStep, setZoomStep] = useState(15); // percent, e.g. 15 => ×1.15
  const zoomStepRef = useRef(zoomStep);
  zoomStepRef.current = zoomStep;
  const search = useApp((s) => s.filters.search);
  const visible = useFilteredDeviceIds();

  // Map device_id -> top-level tree-node id (used for clustering).
  // Built from the active tree's root children: each child becomes a cluster.
  const deviceClusters: Map<number, { id: string; label: string }> | null =
    useMemo(() => {
      if (!index || clusterMode !== "tree") return null;
      const root = index.raw.trees[treeSource];
      if (!root) return null;
      const m = new Map<number, { id: string; label: string }>();
      for (const child of root.children) {
        const all = collectDeviceIds(child);
        const cid = `c:${treeSource}:${child.id}`;
        for (const did of all) {
          if (!m.has(did)) m.set(did, { id: cid, label: child.name });
        }
      }
      return m;
    }, [index, treeSource, clusterMode]);

  // Build elements from filtered devices + edges between visible nodes.
  const elements: ElementDefinition[] = useMemo(() => {
    if (!index) return [];

    // Collapsed cluster mode: render only one node per cluster + summary edges.
    if (clusterMode === "tree" && collapseClusters && deviceClusters) {
      const counts = new Map<string, { label: string; count: number }>();
      for (const id of visible) {
        const c = deviceClusters.get(id);
        if (!c) continue;
        const e = counts.get(c.id) ?? { label: c.label, count: 0 };
        e.count += 1;
        counts.set(c.id, e);
      }
      const els: ElementDefinition[] = [];
      for (const [cid, { label, count }] of counts) {
        els.push({
          data: { id: cid, label: `${label} (${count})`, collapsed: true, count },
        });
      }
      // Aggregate edges by (clusterA, clusterB).
      const edgeWeights = new Map<string, number>();
      for (const e of index.raw.edges) {
        if (!visible.has(e.a) || !visible.has(e.b)) continue;
        const ca = deviceClusters.get(e.a)?.id;
        const cb = deviceClusters.get(e.b)?.id;
        if (!ca || !cb || ca === cb) continue;
        const key = ca < cb ? `${ca}|${cb}` : `${cb}|${ca}`;
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
      }
      let i = 0;
      for (const [key, weight] of edgeWeights) {
        const [a, b] = key.split("|");
        els.push({
          data: { id: `se${i++}`, source: a, target: b, summary: true, weight },
        });
      }
      return els;
    }

    const els: ElementDefinition[] = [];
    const usedClusters = new Set<string>();

    for (const id of visible) {
      const d = index.byId.get(id);
      if (!d) continue;
      const cluster = deviceClusters?.get(d.device_id);
      const data: Record<string, unknown> = {
        id: `d${d.device_id}`,
        label: d.hostname,
        type: d.type ?? "",
        role: d.role ?? "unknown",
        iconUrl: iconUrlFor(d.role),
        status: d.status,
        device_id: d.device_id,
      };
      if (cluster) {
        data.parent = cluster.id;
        usedClusters.add(cluster.id);
      }
      els.push({ data });
    }

    // Compound parent nodes — must be added with the same ids referenced above.
    if (deviceClusters) {
      const seen = new Map<string, string>();
      for (const { id, label } of deviceClusters.values()) {
        if (!seen.has(id)) seen.set(id, label);
      }
      for (const cid of usedClusters) {
        els.push({
          data: { id: cid, label: seen.get(cid) ?? cid, cluster: true },
        });
      }
    }

    for (const e of index.raw.edges) {
      if (visible.has(e.a) && visible.has(e.b)) {
        els.push({
          data: { id: `e${e.id}`, source: `d${e.a}`, target: `d${e.b}` },
        });
      }
    }

    if (showGhosts) {
      let count = 0;
      for (const g of index.raw.ghost_endpoints) {
        if (!visible.has(g.device_id)) continue;
        if (count++ >= MAX_GHOSTS) break;
        const gid = `g${g.id}`;
        const cluster = deviceClusters?.get(g.device_id);
        const data: Record<string, unknown> = {
          id: gid,
          label: g.remote_hostname,
          ghost: true,
        };
        if (cluster) data.parent = cluster.id;
        els.push({ data });
        els.push({
          data: {
            id: `ge${g.id}`,
            source: `d${g.device_id}`,
            target: gid,
            ghost: true,
          },
        });
      }
    }
    return els;
  }, [index, visible, showGhosts, deviceClusters, clusterMode, collapseClusters]);

  // Initialise cytoscape once.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: cyStyle,
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 4,
      elements: [],
    });
    cy.on("tap", "node", (evt) => {
      const did = evt.target.data("device_id");
      if (typeof did === "number") void selectDevice(did);
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        void selectDevice(null);
        cy.elements().removeClass("neighbour neighbour-edge dblclick-target");
      }
    });
    cy.on("dblclick", "node", (evt) => {
      const node = evt.target as NodeSingular;
      // Clear previous highlight then apply new one.
      cy.elements().removeClass("neighbour neighbour-edge dblclick-target");
      node.addClass("dblclick-target");
      const hood = node.openNeighborhood();
      hood.nodes().addClass("neighbour");
      hood.edges().addClass("neighbour-edge");
      // Zoom in by the configured step, centred on the clicked node.
      const factor = 1 + zoomStepRef.current / 100;
      const nextZoom = Math.min(cy.zoom() * factor, 4);
      cy.animate({
        zoom: { level: nextZoom, position: node.position() },
        duration: 250,
        easing: "ease-in-out-cubic",
      });
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [selectDevice]);

  // Sync elements -> cy.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
  }, [elements]);

  // Run / re-run layout when elements OR layout selection changes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.elements().length === 0) return;
    const layout = cy.layout(layoutOptionsFor(graphLayout, cy));
    layout.one("layoutstop", () => cy.fit(undefined, 30));
    layout.run();
  }, [elements, graphLayout]);

  // Highlight current selection (no viewport move — keeps user's zoom/pan).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$(":selected").unselect();
    if (selectedDeviceId != null) {
      const n = cy.getElementById(`d${selectedDeviceId}`);
      if (n.nonempty()) n.select();
    }
  }, [selectedDeviceId, elements]);

  // Search highlighting: dim non-matches, mark matches.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !index) return;
    const q = search.trim().toLowerCase();
    cy.batch(() => {
      cy.elements().removeClass("dim match");
      if (!q) return;
      const matchIds = new Set<string>();
      for (const d of index.raw.devices) {
        const hay = [d.hostname, d.sysName, d.ip, d.location, d.hardware]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (hay.includes(q)) matchIds.add(`d${d.device_id}`);
      }
      cy.nodes().forEach((n) => {
        if (n.data("cluster")) return;
        if (matchIds.has(n.id())) n.addClass("match");
        else n.addClass("dim");
      });
      cy.edges().addClass("dim");
    });
  }, [search, index, elements]);

  if (!index) {
    return <div className="p-6 text-obs-mute text-sm">No snapshot loaded.</div>;
  }
  const visibleEdges = elements.filter((e) => "source" in (e.data as object))
    .length;
  const visibleNodes = elements.length - visibleEdges;

  return (
    <div className="relative h-full w-full bg-white">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute top-2 left-2 bg-white/90 border border-obs-border rounded px-2 py-1 text-[11px] text-obs-text shadow-sm flex items-center gap-3">
        <span>
          {visibleNodes} nodes &middot; {visibleEdges} edges
        </span>
        <label className="flex items-center gap-1">
          <span className="text-obs-mute">layout</span>
          <select
            className="border border-obs-border rounded px-1 py-0.5 bg-white text-obs-text text-[11px]"
            value={graphLayout}
            onChange={(e) =>
              setGraphLayout(e.target.value as typeof graphLayout)
            }
          >
            {GRAPH_LAYOUTS.map((k) => (
              <option key={k} value={k}>
                {GRAPH_LAYOUT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={showGhosts}
            onChange={() => useApp.getState().toggleGhostEndpoints()}
          />
          <span>ghosts</span>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-obs-mute">zoom step</span>
          <input
            type="number"
            min={1}
            max={200}
            step={1}
            value={zoomStep}
            onChange={(e) => {
              const v = Math.max(1, Math.min(200, Number(e.target.value)));
              if (!isNaN(v)) setZoomStep(v);
            }}
            className="w-12 border border-obs-border rounded px-1 py-0.5 bg-white text-obs-text text-[11px] text-right"
          />
          <span className="text-obs-mute">%</span>
        </label>
        <label
          className={
            "flex items-center gap-1 " +
            (graphLayout === "fcose" ? "cursor-pointer" : "opacity-50 cursor-not-allowed")
          }
          title={
            graphLayout === "fcose"
              ? undefined
              : "Cluster mode requires the Force layout"
          }
        >
          <input
            type="checkbox"
            disabled={graphLayout !== "fcose"}
            checked={clusterMode === "tree"}
            onChange={(e) => setClusterMode(e.target.checked ? "tree" : "off")}
          />
          <span>cluster by tree</span>
        </label>
        {clusterMode === "tree" && (
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={collapseClusters}
              onChange={() => toggleCollapse()}
            />
            <span>collapse</span>
          </label>
        )}
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-2 right-2 bg-white/95 border border-obs-border rounded px-3 py-2 text-[10px] text-obs-text shadow-sm space-y-1 leading-tight">
      <div className="font-semibold text-obs-mute uppercase tracking-wide text-[9px] mb-1">
        Legend
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full bg-[#3aa0e6]" />
        <span>device (up)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full bg-[#3aa0e6] ring-2 ring-[#d9534f]" />
        <span>device (down)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rotate-45 bg-[#d9534f]" />
        <span>firewall</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 bg-[#5cb85c]" style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }} />
        <span>wireless</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-[#cbd2da]" />
        <span>ghost endpoint</span>
      </div>
    </div>
  );
}

function collectDeviceIds(n: TreeNode, out: Set<number> = new Set()): Set<number> {
  for (const id of n.device_ids) out.add(id);
  for (const c of n.children) collectDeviceIds(c, out);
  return out;
}
