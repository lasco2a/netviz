import cytoscape from "cytoscape";
// No types ship with cytoscape-fcose.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

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
