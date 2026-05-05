import cytoscape from "cytoscape";
// No types ship with cytoscape-fcose.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import fcose from "cytoscape-fcose";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import dagre from "cytoscape-dagre";

cytoscape.use(fcose);
cytoscape.use(dagre);

// Visual styles. Designed to match the Observium navy/blue palette.
export const cyStyle: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      "background-color": "#3aa0e6",
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
      width: 18,
      height: 18,
    },
  },
  {
    selector: 'node[type = "firewall"]',
    style: { "background-color": "#d9534f", shape: "diamond", width: 22, height: 22 },
  },
  {
    selector: 'node[type = "wireless"]',
    style: { "background-color": "#5cb85c", shape: "round-triangle" },
  },
  {
    selector: 'node[type = "storage"]',
    style: { "background-color": "#7a8694", shape: "roundrectangle" },
  },
  {
    selector: "node[?ghost]",
    style: {
      "background-color": "#cbd2da",
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
    style: { "border-color": "#d9534f", "border-width": 2 },
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
    selector: "node[?tmLeaf]",
    style: {
      "background-color": "#eef3f8",
      "border-color": "#3aa0e6",
      "border-width": 1,
      shape: "roundrectangle",
      label: "data(label)",
      color: "#1f2d3d",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 9,
      "text-background-opacity": 0,
      width: "label",
      height: 22,
      padding: "6px",
    },
  },
  {
    selector: 'node[?tmLeaf][status = 0]',
    style: { "border-color": "#d9534f", "border-width": 2 },
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
