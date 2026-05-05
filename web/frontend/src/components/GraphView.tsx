import { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";

import { cyStyle, fcoseLayout } from "@/lib/cytoscape-config";
import { useFilteredDeviceIds } from "@/lib/filters";
import { useApp } from "@/store/app";

// Hard cap on rendered ghost endpoints to keep the canvas usable on huge sites.
const MAX_GHOSTS = 1500;

export function GraphView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const index = useApp((s) => s.index);
  const selectedDeviceId = useApp((s) => s.selectedDeviceId);
  const selectDevice = useApp((s) => s.selectDevice);
  const showGhosts = useApp((s) => s.showGhostEndpoints);
  const visible = useFilteredDeviceIds();

  // Build elements from filtered devices + edges that connect two visible nodes.
  const elements: ElementDefinition[] = useMemo(() => {
    if (!index) return [];
    const els: ElementDefinition[] = [];
    for (const id of visible) {
      const d = index.byId.get(id);
      if (!d) continue;
      els.push({
        data: {
          id: `d${d.device_id}`,
          label: d.hostname,
          type: d.type ?? "",
          status: d.status,
          device_id: d.device_id,
        },
      });
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
        els.push({
          data: {
            id: gid,
            label: g.remote_hostname,
            ghost: true,
          },
        });
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
  }, [index, visible, showGhosts]);

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
      if (evt.target === cy) void selectDevice(null);
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [selectDevice]);

  // Sync elements -> cy and re-layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    if (elements.length) {
      cy.layout(fcoseLayout).run();
    }
  }, [elements]);

  // Highlight current selection.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$(":selected").unselect();
    if (selectedDeviceId != null) {
      const n = cy.getElementById(`d${selectedDeviceId}`);
      if (n.nonempty()) {
        n.select();
        cy.animate({ center: { eles: n }, duration: 250 });
      }
    }
  }, [selectedDeviceId, elements]);

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
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={showGhosts}
            onChange={() => useApp.getState().toggleGhostEndpoints()}
          />
          <span>ghosts</span>
        </label>
      </div>
    </div>
  );
}
