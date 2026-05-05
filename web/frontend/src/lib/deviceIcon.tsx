// Maps device roles to Tabler icon components, role labels, and Cytoscape
// data-URI strings (rendered once per role at module load).

import type { Icon } from "@tabler/icons-react";
import {
  IconNetwork,
  IconRouter,
  IconShieldHalfFilled,
  IconAccessPoint,
  IconServer,
  IconDatabase,
  IconPrinter,
  IconDeviceDesktop,
  IconBolt,
  IconTemperature,
  IconDeviceUnknown,
} from "@tabler/icons-react";

// Vite raw imports of the same set as plain SVG strings, used to build
// data-URIs for Cytoscape node `background-image`.
import switchSvg from "@tabler/icons/outline/network.svg?raw";
import routerSvg from "@tabler/icons/outline/router.svg?raw";
import firewallSvg from "@tabler/icons/outline/shield-half.svg?raw";
import wirelessSvg from "@tabler/icons/outline/access-point.svg?raw";
import serverSvg from "@tabler/icons/outline/server.svg?raw";
import storageSvg from "@tabler/icons/outline/database.svg?raw";
import printerSvg from "@tabler/icons/outline/printer.svg?raw";
import workstationSvg from "@tabler/icons/outline/device-desktop.svg?raw";
import powerSvg from "@tabler/icons/outline/bolt.svg?raw";
import environmentSvg from "@tabler/icons/outline/temperature.svg?raw";
import unknownSvg from "@tabler/icons/outline/device-unknown.svg?raw";

import type { DeviceRole } from "@/lib/types";

type IconCmp = Icon;

const COMPONENT: Record<DeviceRole, IconCmp> = {
  switch: IconNetwork,
  router: IconRouter,
  firewall: IconShieldHalfFilled,
  wireless: IconAccessPoint,
  server: IconServer,
  storage: IconDatabase,
  printer: IconPrinter,
  workstation: IconDeviceDesktop,
  power: IconBolt,
  environment: IconTemperature,
  unknown: IconDeviceUnknown,
};

const RAW: Record<DeviceRole, string> = {
  switch: switchSvg,
  router: routerSvg,
  firewall: firewallSvg,
  wireless: wirelessSvg,
  server: serverSvg,
  storage: storageSvg,
  printer: printerSvg,
  workstation: workstationSvg,
  power: powerSvg,
  environment: environmentSvg,
  unknown: unknownSvg,
};

const LABEL: Record<DeviceRole, string> = {
  switch: "Switch",
  router: "Router",
  firewall: "Firewall",
  wireless: "Wireless",
  server: "Server",
  storage: "Storage",
  printer: "Printer",
  workstation: "Workstation",
  power: "Power",
  environment: "Environment",
  unknown: "Unknown",
};

export function iconComponentFor(role: DeviceRole | null | undefined): IconCmp {
  return COMPONENT[(role ?? "unknown") as DeviceRole] ?? IconDeviceUnknown;
}

export function roleLabel(role: DeviceRole | null | undefined): string {
  return LABEL[(role ?? "unknown") as DeviceRole] ?? "Unknown";
}

const URL_CACHE = new Map<DeviceRole, string>();

function buildDataUri(role: DeviceRole): string {
  // Replace currentColor with our navy and force stroke-width to 1.6 so the
  // glyphs read at small sizes when scaled down by Cytoscape.
  const recoloured = RAW[role]
    .replace(/stroke="currentColor"/g, 'stroke="#1f2d3d"')
    .replace(/stroke-width="2"/g, 'stroke-width="1.6"');
  return `data:image/svg+xml;utf8,${encodeURIComponent(recoloured)}`;
}

export function iconUrlFor(role: DeviceRole | null | undefined): string {
  const r = (role ?? "unknown") as DeviceRole;
  let url = URL_CACHE.get(r);
  if (!url) {
    url = buildDataUri(r);
    URL_CACHE.set(r, url);
  }
  return url;
}
