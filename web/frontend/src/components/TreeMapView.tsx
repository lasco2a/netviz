import { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";

import { cyStyle, dagreLayout, treeMapStyle } from "@/lib/cytoscape-config";
import { iconUrlFor } from "@/lib/deviceIcon";
import { useFilteredDeviceIds } from "@/lib/filters";
import type { TreeNode } from "@/lib/types";
import { useApp } from "@/store/app";

// Cap on how many device leaves are rendered when focus has no further branches.
const MAX_LEAF_DEVICES = 60;
// Cap on endpoints rendered around a device focus.
const MAX_ENDPOINTS = 80;

interface TreeMeta {
  byId: Map<string, TreeNode>;
  parentOf: Map<string, string | null>; // null for root
}

function buildTreeMeta(root: TreeNode): TreeMeta {
  const byId = new Map<string, TreeNode>();
  const parentOf = new Map<string, string | null>();
  const walk = (n: TreeNode, parent: string | null) => {
    byId.set(n.id, n);
    parentOf.set(n.id, parent);
    for (const c of n.children) walk(c, n.id);
  };
  walk(root, null);
  return { byId, parentOf };
}

export function TreeMapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const index = useApp((s) => s.index);
  const treeSource = useApp((s) => s.treeSource);
  const focus = useApp((s) => s.treeMapFocus);
  const setFocus = useApp((s) => s.setTreeMapFocus);
  const visible = useFilteredDeviceIds();

  const root = index?.raw.trees[treeSource] ?? null;

  const meta = useMemo(() => (root ? buildTreeMeta(root) : null), [root]);

  // Detect device-focus (synthetic id "dev:<id>"), independent of tree.
  const devFocusId = useMemo<number | null>(() => {
    if (!focus || !focus.startsWith("dev:")) return null;
    const n = Number(focus.slice(4));
    return Number.isFinite(n) ? n : null;
  }, [focus]);

  // Resolve current focus node (default: root). Null when device-focus is active.
  const focusNode = useMemo<TreeNode | null>(() => {
    if (devFocusId !== null) return null;
    if (!root || !meta) return null;
    if (focus && meta.byId.has(focus)) return meta.byId.get(focus)!;
    return root;
  }, [root, meta, focus, devFocusId]);

  // Breadcrumb chain root -> focus (or device-focus appended to its tree path).
  const breadcrumb = useMemo<Array<{ id: string | null; name: string }>>(() => {
    if (!root || !meta) return [];
    if (devFocusId !== null && index) {
      const dev = index.byId.get(devFocusId);
      const name = dev?.hostname ?? `device ${devFocusId}`;
      // Best-effort: show just Root › <device> (we don't track which tree node
      // we came from; user can use breadcrumb root link to escape).
      return [
        { id: null, name: root.name || "Root" },
        { id: `dev:${devFocusId}`, name },
      ];
    }
    if (!focusNode) return [];
    const chain: Array<{ id: string | null; name: string }> = [];
    let cur: TreeNode | undefined = focusNode;
    while (cur) {
      chain.unshift({ id: cur.id === root.id ? null : cur.id, name: cur.name || "Root" });
      const p = meta.parentOf.get(cur.id);
      cur = p ? meta.byId.get(p) : undefined;
    }
    return chain;
  }, [focusNode, meta, root, devFocusId, index]);

  // Build cytoscape elements for current focus level.
  const { elements, leafMode, hiddenLeafCount } = useMemo(() => {
    if (!index) {
      return { elements: [] as ElementDefinition[], leafMode: false, hiddenLeafCount: 0 };
    }

    // Device-focus mode: render device + its endpoints.
    if (devFocusId !== null) {
      const dev = index.byId.get(devFocusId);
      const els: ElementDefinition[] = [];
      const focusKey = `tm:dev:${devFocusId}`;
      const eps = index.endpointsByDevice.get(devFocusId) ?? [];
      const shown = eps.slice(0, MAX_ENDPOINTS);
      const hidden = eps.length - shown.length;

      els.push({
        data: {
          id: focusKey,
          label: `${dev?.hostname ?? `device ${devFocusId}`}  (${eps.length} endpoints)`,
          tmFocus: true,
          iconUrl: dev ? iconUrlFor(dev.role) : undefined,
        },
      });
      for (let i = 0; i < shown.length; i++) {
        const ep = shown[i];
        const linkedDev = ep.ip ? index.deviceIdByIp.get(ep.ip) : undefined;
        const isLinked = typeof linkedDev === "number" && linkedDev !== devFocusId;
        const eid = `tmep:${i}`;
        const label = ep.hostname ?? ep.ip ?? ep.mac ?? `ep ${i}`;
        els.push({
          data: {
            id: eid,
            label,
            tmEndpoint: true,
            tmEndpointLinked: isLinked || undefined,
            ip: ep.ip,
            mac: ep.mac,
            linkedDev: isLinked ? linkedDev : undefined,
          },
        });
        els.push({ data: { id: `tme:${i}`, source: focusKey, target: eid, tmTree: true } });
      }
      if (hidden > 0) {
        els.push({
          data: { id: "tm:more", label: `+${hidden} more endpoints`, tmMore: true },
        });
        els.push({ data: { id: "tmle:more", source: focusKey, target: "tm:more", tmTree: true } });
      }
      return { elements: els, leafMode: true, hiddenLeafCount: hidden };
    }

    if (!focusNode) {
      return { elements: [] as ElementDefinition[], leafMode: false, hiddenLeafCount: 0 };
    }
    const els: ElementDefinition[] = [];
    const focusKey = `tm:${focusNode.id}`;

    // Visible-device count under focus (respects active filters).
    const focusSubtree =
      index.treeDescendants[`${treeSource}:${focusNode.id}`] ?? new Set<number>();
    let focusCount = 0;
    for (const id of focusSubtree) if (visible.has(id)) focusCount++;

    els.push({
      data: {
        id: focusKey,
        label: `${focusNode.name || "Root"}  (${focusCount})`,
        tmFocus: true,
      },
    });

    if (focusNode.children.length > 0) {
      // Show direct children as cluster pills.
      for (const child of focusNode.children) {
        const sub =
          index.treeDescendants[`${treeSource}:${child.id}`] ?? new Set<number>();
        let count = 0;
        for (const id of sub) if (visible.has(id)) count++;
        if (count === 0) continue; // filtered out entirely
        const cid = `tm:${child.id}`;
        els.push({
          data: {
            id: cid,
            label: `${child.name}  (${count})`,
            tmCluster: true,
            count,
            treeId: child.id,
            hasChildren: child.children.length > 0,
          },
        });
        els.push({
          data: { id: `tme:${child.id}`, source: focusKey, target: cid, tmTree: true },
        });
      }

      // Sibling overlay edges from underlying neighbour data.
      // Map device -> visible child cluster id under focus.
      const dev2child = new Map<number, string>();
      for (const child of focusNode.children) {
        const cid = `tm:${child.id}`;
        const sub =
          index.treeDescendants[`${treeSource}:${child.id}`] ?? new Set<number>();
        for (const did of sub) {
          if (!visible.has(did)) continue;
          if (!dev2child.has(did)) dev2child.set(did, cid);
        }
      }
      const weights = new Map<string, number>();
      for (const e of index.raw.edges) {
        const ca = dev2child.get(e.a);
        const cb = dev2child.get(e.b);
        if (!ca || !cb || ca === cb) continue;
        const key = ca < cb ? `${ca}|${cb}` : `${cb}|${ca}`;
        weights.set(key, (weights.get(key) ?? 0) + 1);
      }
      let i = 0;
      for (const [key, weight] of weights) {
        const [a, b] = key.split("|");
        els.push({
          data: {
            id: `tmo:${i++}`,
            source: a,
            target: b,
            tmOverlay: true,
            weight,
          },
        });
      }
      return { elements: els, leafMode: false, hiddenLeafCount: 0 };
    }

    // Leaf mode: focus has no children → show device leaves up to MAX_LEAF_DEVICES.
    const allDevs: number[] = [];
    for (const id of focusSubtree) if (visible.has(id)) allDevs.push(id);
    const shown = allDevs.slice(0, MAX_LEAF_DEVICES);
    const hidden = allDevs.length - shown.length;

    for (const did of shown) {
      const d = index.byId.get(did);
      if (!d) continue;
      const lid = `tml:${did}`;
      els.push({
        data: {
          id: lid,
          label: d.hostname,
          tmLeaf: true,
          status: d.status,
          device_id: did,
          iconUrl: iconUrlFor(d.role),
        },
      });
      els.push({
        data: { id: `tmle:${did}`, source: focusKey, target: lid, tmTree: true },
      });
    }
    if (hidden > 0) {
      els.push({
        data: {
          id: "tm:more",
          label: `+${hidden} more — open in Table`,
          tmMore: true,
        },
      });
      els.push({
        data: { id: "tmle:more", source: focusKey, target: "tm:more", tmTree: true },
      });
    }
    return { elements: els, leafMode: true, hiddenLeafCount: hidden };
  }, [index, focusNode, treeSource, visible, devFocusId]);

  // Init cy once.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: [...cyStyle, ...treeMapStyle],
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 4,
      elements: [],
    });
    cy.on("tap", "node", (evt) => {
      const n = evt.target;
      const state = useApp.getState();
      if (n.data("tmCluster")) {
        const tid = n.data("treeId");
        if (tid) state.setTreeMapFocus(tid);
      } else if (n.data("tmEndpoint")) {
        const linked = n.data("linkedDev");
        if (typeof linked === "number") {
          state.setTreeMapFocus(`dev:${linked}`);
        } else {
          // No managed device — open current device drawer for context.
          const f = state.treeMapFocus;
          if (f && f.startsWith("dev:")) {
            const did = Number(f.slice(4));
            if (Number.isFinite(did)) void state.selectDevice(did);
          }
        }
      } else if (n.data("tmLeaf")) {
        const did = n.data("device_id");
        if (typeof did !== "number") return;
        const epCount = state.index?.endpointsByDevice.get(did)?.length ?? 0;
        if (epCount > 0) {
          state.setTreeMapFocus(`dev:${did}`);
        } else {
          void state.selectDevice(did);
        }
      } else if (n.data("tmMore")) {
        const f = state.treeMapFocus;
        if (f && f.startsWith("dev:")) return; // endpoints "+N more": no-op
        state.selectTreeNode(f);
        state.setViewMode("table");
      } else if (n.data("tmFocus")) {
        const f = state.treeMapFocus;
        if (!f) return;
        if (f.startsWith("dev:")) {
          // Device focus: tap focus → return to root tree view.
          state.setTreeMapFocus(null);
          return;
        }
        const r = state.index?.raw.trees[state.treeSource];
        if (!r) return;
        const parentId = (() => {
          const stack: Array<{ n: TreeNode; p: string | null }> = [
            { n: r, p: null },
          ];
          while (stack.length) {
            const { n, p } = stack.pop()!;
            if (n.id === f) return p;
            for (const c of n.children) stack.push({ n: c, p: n.id });
          }
          return null;
        })();
        state.setTreeMapFocus(parentId);
      }
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Sync elements + layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    if (elements.length) {
      const layout = cy.layout(dagreLayout);
      layout.one("layoutstop", () => cy.fit(undefined, 40));
      layout.run();
    }
  }, [elements]);

  if (!index) {
    return <div className="p-6 text-obs-mute text-sm">No snapshot loaded.</div>;
  }
  if (!root) {
    return <div className="p-6 text-obs-mute text-sm">Tree not available.</div>;
  }

  function zoomBy(factor: number) {
    const cy = cyRef.current;
    if (!cy) return;
    const next = Math.min(Math.max(cy.zoom() * factor, cy.minZoom()), cy.maxZoom());
    cy.animate({
      zoom: { level: next, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } },
      duration: 150,
      easing: "ease-in-out-cubic",
    });
  }

  return (
    <div className="relative h-full w-full bg-obs-card flex flex-col">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-obs-border bg-obs-surface text-xs">
        {breadcrumb.map((n, i) => (
          <span key={`${n.id ?? "root"}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-obs-mute">›</span>}
            <button
              className={`px-1.5 py-0.5 rounded hover:bg-obs-surface ${
                i === breadcrumb.length - 1
                  ? "font-semibold text-obs-navy"
                  : "text-obs-blue hover:underline"
              }`}
              onClick={() => setFocus(n.id)}
            >
              {n.name}
            </button>
          </span>
        ))}
        {focus !== null && (
          <button
            className="ml-auto text-obs-mute hover:text-obs-navy"
            onClick={() => setFocus(null)}
          >
            reset
          </button>
        )}
      </div>
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {leafMode && elements.length <= 1 && (
          <div className="absolute inset-0 flex items-center justify-center text-obs-mute text-sm">
            no devices match current filters
          </div>
        )}
        <div className="absolute top-2 left-2 bg-obs-card/90 border border-obs-border rounded px-2 py-1 text-[11px] text-obs-text shadow-sm">
          {leafMode
            ? `${elements.filter((e) => (e.data as { tmLeaf?: boolean }).tmLeaf).length} devices${hiddenLeafCount ? ` (+${hiddenLeafCount} hidden)` : ""}`
            : `${focusNode?.children.length ?? 0} children — click to drill down`}
        </div>
        <div className="absolute bottom-3 left-2 flex flex-col gap-1">
          <button
            className="w-7 h-7 flex items-center justify-center bg-obs-card/90 border border-obs-border rounded text-obs-mute hover:text-obs-text hover:border-obs-blue shadow-sm transition-colors text-sm"
            onClick={() => zoomBy(1.5)}
            title="Zoom in (50%)"
          >+</button>
          <button
            className="w-7 h-7 flex items-center justify-center bg-obs-card/90 border border-obs-border rounded text-obs-mute hover:text-obs-text hover:border-obs-blue shadow-sm transition-colors text-sm"
            onClick={() => zoomBy(1 / 1.5)}
            title="Zoom out (50%)"
          >−</button>
        </div>
      </div>
    </div>
  );
}
