import cytoscape from "cytoscape";
// No types ship with cytoscape-fcose / dagre / elk.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import fcose from "cytoscape-fcose";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import dagre from "cytoscape-dagre";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import elk from "cytoscape-elk";

cytoscape.use(fcose);
cytoscape.use(dagre);
cytoscape.use(elk);

// Visual styles. Designed to match the Observium navy/blue palette.
export const cyStyle: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      "background-color": "#ffffff",
      "background-opacity": 1,
      "border-width": 1,
      "border-color": "#1f2d3d",
      label: "data(label)",
      "font-size": 9,
      "font-family": "Helvetica Neue, Tahoma, sans-serif",
      color: "#1f2d3d",
      "text-valign": "bottom",
      "text-margin-y": 4,
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.85,
      "text-background-padding": "2px",
      "text-background-shape": "roundrectangle",
      width: 22,
      height: 22,
    },
  },
  {
    // Devices with a role-icon: render the SVG as the node's background.
    selector: "node[iconUrl]",
    style: {
      "background-image": "data(iconUrl)",
      "background-fit": "contain",
      "background-clip": "none",
      "background-image-opacity": 1,
      shape: "roundrectangle",
    },
  },
  {
    selector: "node[?ghost]",
    style: {
      "background-color": "#cbd2da",
      "background-image": "none",
      "border-width": 0,
      width: 8,
      height: 8,
      "font-size": 8,
      color: "#7a8694",
      shape: "ellipse",
    },
  },
  {
    selector: 'node[status = 0]',
    style: {
      "border-color": "#d9534f",
      "border-width": 2,
      "background-image-opacity": 0.55,
    },
  },
  {
    selector: "node:selected",
    style: { "border-color": "#f0ad4e", "border-width": 3 },
  },
  // Compound parents (clusters) are styled as soft frames with their label
  // pinned to the top so they read like swim-lanes in the canvas.
  {
    selector: "node[?cluster]",
    style: {
      "background-color": "#eef3f8",
      "background-opacity": 0.6,
      "border-color": "#9aaab8",
      "border-width": 1,
      "border-style": "dashed",
      shape: "roundrectangle",
      label: "data(label)",
      "text-valign": "top",
      "text-halign": "center",
      "text-margin-y": -4,
      "font-size": 10,
      "font-weight": "bold",
      color: "#1f2d3d",
      "text-background-opacity": 0,
      padding: "12px",
      "z-index": 0,
    },
  },
  // Dim class is toggled by GraphView during search to fade non-matches.
  {
    selector: ".dim",
    style: { opacity: 0.15, "text-opacity": 0.2 },
  },
  {
    selector: ".match",
    style: { "border-color": "#f0ad4e", "border-width": 3 },
  },
  // Double-click neighbour highlight. Rules placed after status/dim/match so
  // the green colour wins on neighbour nodes regardless of their status.
  {
    selector: "node.neighbour",
    style: {
      "border-color": "#3aa55c",
      "border-width": 3,
      "background-color": "#e6f5ec",
    },
  },
  {
    selector: "node.dblclick-target",
    style: {
      "border-color": "#1f8a3d",
      "border-width": 4,
      "background-color": "#c9ecdb",
    },
  },
  {
    selector: "edge.neighbour-edge",
    style: {
      "line-color": "#3aa55c",
      width: 2.5,
    },
  },
  // Collapsed cluster: rendered as a single solid summary node carrying the
  // device count. Used when the user enables "collapse" in tree-cluster mode.
  {
    selector: "node[?collapsed]",
    style: {
      "background-color": "#1f2d3d",
      "border-color": "#1f2d3d",
      "border-width": 1,
      shape: "roundrectangle",
      label: "data(label)",
      color: "#ffffff",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 11,
      "font-weight": "bold",
      "text-background-opacity": 0,
      width: "mapData(count, 1, 200, 40, 110)",
      height: "mapData(count, 1, 200, 28, 60)",
    },
  },
  // Weighted aggregate edges between collapsed clusters.
  {
    selector: "edge[?summary]",
    style: {
      "line-color": "#3aa0e6",
      width: "mapData(weight, 1, 50, 1, 8)",
      opacity: 0.8,
      "curve-style": "bezier",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#7a8694",
      "curve-style": "bezier",
      opacity: 0.7,
    },
  },
  {
    selector: 'edge[?ghost]',
    style: { "line-style": "dashed", "line-color": "#cbd2da" },
  },
];

export const fcoseLayout: cytoscape.LayoutOptions = {
  name: "fcose",
  // @ts-expect-error fcose options are typed loosely
  quality: "default",
  randomize: false,
  animate: false,
  nodeSeparation: 60,
  idealEdgeLength: 80,
  nodeRepulsion: 4500,
};

// Top-down hierarchical layout for the Tree-Map view.
export const dagreLayout: cytoscape.LayoutOptions = {
  name: "dagre",
  // @ts-expect-error dagre options are typed loosely
  rankDir: "TB",
  nodeSep: 40,
  rankSep: 110,
  edgeSep: 20,
  fit: true,
  padding: 30,
  animate: false,
};

// ---------------------------------------------------------------------------
// GraphView layout presets
// ---------------------------------------------------------------------------

export type GraphLayout =
  | "fcose"
  | "dagre-tb"
  | "dagre-lr"
  | "bfs"
  | "circle"
  | "concentric"
  | "grid"
  | "elk";

export const GRAPH_LAYOUTS: GraphLayout[] = [
  "fcose",
  "dagre-tb",
  "dagre-lr",
  "bfs",
  "circle",
  "concentric",
  "grid",
  "elk",
];

export const GRAPH_LAYOUT_LABELS: Record<GraphLayout, string> = {
  fcose: "Force",
  "dagre-tb": "Pyramid",
  "dagre-lr": "Horizontal",
  bfs: "Breadth-first",
  circle: "Circle",
  concentric: "Concentric (sphere-like)",
  grid: "Grid",
  elk: "ELK (layered)",
};

// Pick a sensible BFS root: the cytoscape-selected node, else the highest-degree
// node, else the first one. Returned as a single-element selector array (the
// shape `breadthfirst.roots` expects).
function bfsRoots(cy: cytoscape.Core): string[] | undefined {
  const sel = cy.nodes(":selected").first();
  if (sel.nonempty()) return [`#${sel.id()}`];
  let best: cytoscape.NodeSingular | null = null;
  let bestDeg = -1;
  cy.nodes().forEach((n) => {
    if (n.data("ghost") || n.data("cluster")) return;
    const d = n.degree(true);
    if (d > bestDeg) {
      bestDeg = d;
      best = n;
    }
  });
  if (best) return [`#${(best as cytoscape.NodeSingular).id()}`];
  const first = cy.nodes().first();
  return first.nonempty() ? [`#${first.id()}`] : undefined;
}

// Build cytoscape layout options for the given preset. `cy` is required for
// presets that need to inspect the graph (e.g. BFS root selection).
export function layoutOptionsFor(
  name: GraphLayout,
  cy: cytoscape.Core,
): cytoscape.LayoutOptions {
  switch (name) {
    case "fcose":
      return fcoseLayout;
    case "dagre-tb":
      return {
        name: "dagre",
        // @ts-expect-error dagre options are typed loosely
        rankDir: "TB",
        nodeSep: 40,
        rankSep: 80,
        edgeSep: 15,
        fit: true,
        padding: 30,
        animate: false,
      };
    case "dagre-lr":
      return {
        name: "dagre",
        // @ts-expect-error dagre options are typed loosely
        rankDir: "LR",
        nodeSep: 25,
        rankSep: 100,
        edgeSep: 12,
        fit: true,
        padding: 30,
        animate: false,
      };
    case "bfs":
      return {
        name: "breadthfirst",
        directed: true,
        spacingFactor: 1.2,
        roots: bfsRoots(cy),
        padding: 30,
        fit: true,
        animate: false,
      };
    case "circle":
      return {
        name: "circle",
        padding: 30,
        fit: true,
        animate: false,
        spacingFactor: 1.2,
      };
    case "concentric":
      return {
        name: "concentric",
        padding: 30,
        fit: true,
        animate: false,
        concentric: (n: cytoscape.NodeSingular) => n.degree(true) ?? 0,
        levelWidth: () => 4,
        minNodeSpacing: 30,
      };
    case "grid":
      return {
        name: "grid",
        padding: 30,
        fit: true,
        animate: false,
        avoidOverlapPadding: 12,
      };
    case "elk":
      return {
        name: "elk",
        // @ts-expect-error elk options are typed loosely
        elk: {
          algorithm: "layered",
          "elk.direction": "DOWN",
          "elk.spacing.nodeNode": 30,
          "elk.layered.spacing.nodeNodeBetweenLayers": 60,
        },
        fit: true,
        padding: 30,
        animate: false,
      };
  }
}

// Tree-Map specific styles.
export const treeMapStyle: cytoscape.StylesheetStyle[] = [
  {
    selector: "node[?tmFocus]",
    style: {
      "background-color": "#1f2d3d",
      "border-color": "#1f2d3d",
      "border-width": 1,
      shape: "roundrectangle",
      label: "data(label)",
      color: "#ffffff",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 12,
      "font-weight": "bold",
      "text-background-opacity": 0,
      width: "label",
      height: 32,
      padding: "10px",
    },
  },
  {
    selector: "node[?tmCluster]",
    style: {
      "background-color": "#3aa0e6",
      "border-color": "#1f2d3d",
      "border-width": 1,
      shape: "roundrectangle",
      label: "data(label)",
      color: "#ffffff",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 11,
      "font-weight": "bold",
      "text-background-opacity": 0,
      width: "mapData(count, 1, 500, 60, 160)",
      height: 30,
      padding: "8px",
    },
  },
  {
    // Tree-map device leaf: same geometry as graph nodes (small icon + label
    // below). Inherits width/height/text-valign/font-size from the base node
    // style and gets the role icon via the shared `node[iconUrl]` rule.
    selector: "node[?tmLeaf]",
    style: {
      "background-color": "#eef3f8",
      "border-color": "#3aa0e6",
      "border-width": 1,
      shape: "roundrectangle",
    },
  },
  {
    // tmFocus device may carry an icon when focused on a device.
    selector: "node[?tmFocus][iconUrl]",
    style: {
      "background-image": "data(iconUrl)",
      "background-fit": "none",
      "background-width": "18px",
      "background-height": "18px",
      "background-position-x": "8px",
      "background-position-y": "50%",
      "background-clip": "none",
      padding: "10px 10px 10px 28px",
    },
  },
  {
    selector: "node[?tmEndpoint]",
    style: {
      "background-color": "#fff8e1",
      "border-color": "#c9a227",
      "border-width": 1,
      shape: "ellipse",
      label: "data(label)",
      color: "#5b4500",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 9,
      "text-background-opacity": 0,
      width: "label",
      height: 20,
      padding: "5px",
    },
  },
  {
    selector: "node[?tmEndpointLinked]",
    style: {
      "background-color": "#e6f3fb",
      "border-color": "#3aa0e6",
      "border-width": 2,
      color: "#1f2d3d",
    },
  },
  {
    selector: "node[?tmMore]",
    style: {
      "background-color": "#ffffff",
      "border-color": "#7a8694",
      "border-width": 1,
      "border-style": "dashed",
      shape: "roundrectangle",
      label: "data(label)",
      color: "#7a8694",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 10,
      "font-style": "italic",
      "text-background-opacity": 0,
      width: "label",
      height: 22,
      padding: "6px",
    },
  },
  {
    selector: "edge[?tmTree]",
    style: {
      width: 1.5,
      "line-color": "#9aaab8",
      "target-arrow-color": "#9aaab8",
      "target-arrow-shape": "triangle",
      "curve-style": "taxi",
      "taxi-direction": "vertical",
      "taxi-turn": 30,
      opacity: 0.85,
    },
  },
  {
    selector: "edge[?tmOverlay]",
    style: {
      width: "mapData(weight, 1, 30, 1, 5)",
      "line-color": "#f0ad4e",
      "line-style": "dashed",
      "curve-style": "unbundled-bezier",
      "control-point-distances": [-30],
      "control-point-weights": [0.5],
      opacity: 0.55,
    },
  },
];
