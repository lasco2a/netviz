import { useEffect } from "react";

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
import { useApp } from "@/store/app";

const SECTIONS: Array<{ id: string; label: string; body: React.ReactNode }> = [
  {
    id: "overview",
    label: "Overview",
    body: (
      <div className="space-y-2">
        <p>
          netviz visualises your Observium-managed network. Three views are
          available from the top bar:
        </p>
        <ul className="list-disc ml-5 space-y-1">
          <li>
            <strong>Table</strong> — sortable list of devices.
          </li>
          <li>
            <strong>Graph</strong> — physical/logical neighbour graph.
          </li>
          <li>
            <strong>Tree-Map</strong> — hierarchical drill-down by location,
            group or topology.
          </li>
        </ul>
        <p>
          The left tree filters by location/group/topology. Status and role
          chips (under the top bar) further narrow what's visible.
        </p>
        <p>
          <strong>Graph layouts</strong> — the dropdown in the Graph toolbar
          switches between Force, Pyramid (default), Horizontal, Breadth-first,
          Circle, Concentric (sphere-like), Grid and ELK (layered). Cluster-by-tree
          is only available with the Force layout.
        </p>
        <p>
          <strong>Graph interaction</strong> — single-click a device to open
          its drawer. Double-click to zoom in 15 % on it and highlight its
          direct neighbours (including ghost endpoints) in green. Click on
          empty canvas to clear the highlight.
        </p>
      </div>
    ),
  },
  {
    id: "search",
    label: "Search syntax",
    body: (
      <div className="space-y-2 text-sm">
        <p>The search box accepts space-separated tokens (AND-combined):</p>
        <table className="w-full text-xs border border-obs-border">
          <tbody>
            <Row k="plain text" v="case-insensitive substring on hostname / location / role / type / OS" />
            <Row k='"quoted phrase"' v="text including spaces, e.g. " ex='"rack a"' />
            <Row k="IPv4 / IPv6" v="exact match against device IP" ex="10.1.1.5  ::1" />
            <Row k="CIDR" v="range match (v4 or v6)" ex="10.1.1.0/24" />
            <Row k="IPv4 range" v="full or last-octet shorthand" ex="10.1.1.10-50" />
            <Row k="MAC" v="6-12 hex chars, with or without ‘:’/‘-’ separators" ex="aabbcc, de:ad:be:ef:00:01" />
          </tbody>
        </table>
        <p className="text-obs-mute">
          Searches run on the server and match both managed devices and
          endpoints (IP/MAC pairs harvested from <code>ip_mac</code>).
        </p>
      </div>
    ),
  },
  {
    id: "endpoints",
    label: "Endpoints & DNS",
    body: (
      <div className="space-y-2 text-sm">
        <p>
          Endpoints are un-managed hosts (printers, laptops, phones) learned
          via ARP/bridge tables on your switches. They are stored separately
          from managed devices but appear in search results, in the device
          drawer (under their parent switch), and as the third drill-down
          level in the Tree-Map view.
        </p>
        <p>
          Reverse DNS for endpoint IPs runs daily as a separate timer
          (<code>netviz-dns.timer</code>) and writes a cache file consumed by
          the snapshot exporter. Set <code>NETVIZ_DNS_ENABLED=false</code> to
          disable scheduled lookups.
        </p>
      </div>
    ),
  },
  {
    id: "roles",
    label: "Roles & icons",
    body: (
      <div className="space-y-2 text-sm">
        <p>
          Every device is automatically classified into one of eleven roles by
          the snapshot exporter. The role drives the icon shown in every view
          and can be used in the search box (e.g. <code>router</code>).
        </p>
        <table className="w-full text-xs border border-obs-border">
          <thead>
            <tr className="bg-obs-surface text-obs-mute">
              <th className="px-2 py-1 text-left w-8"></th>
              <th className="px-2 py-1 text-left w-28">Role</th>
              <th className="px-2 py-1 text-left">Matched when…</th>
            </tr>
          </thead>
          <tbody>
            <RoleRow icon={<IconShieldHalfFilled size={14} stroke={1.6} />} role="firewall" rule='sysDescr/hostname ∋ firewall, asa, pix, fortigate, checkpoint, palo' />
            <RoleRow icon={<IconRouter size={14} stroke={1.6} />} role="router" rule='type=network + sysDescr/hostname ∋ router, rtr, gw, gateway, junos, vyos, mikrotik' />
            <RoleRow icon={<IconAccessPoint size={14} stroke={1.6} />} role="wireless" rule='type=wireless, or sysDescr ∋ access point, ap, airos' />
            <RoleRow icon={<IconServer size={14} stroke={1.6} />} role="server" rule='type ∈ {server, linux, windows, esxi}' />
            <RoleRow icon={<IconDatabase size={14} stroke={1.6} />} role="storage" rule='type=storage, or sysDescr ∋ nas, san, netapp, synology' />
            <RoleRow icon={<IconPrinter size={14} stroke={1.6} />} role="printer" rule='type=printer, or sysDescr ∋ print' />
            <RoleRow icon={<IconDeviceDesktop size={14} stroke={1.6} />} role="workstation" rule='type=workstation, or sysDescr ∋ workstation, desktop, laptop' />
            <RoleRow icon={<IconBolt size={14} stroke={1.6} />} role="power" rule='type=power, or sysDescr ∋ ups, pdu' />
            <RoleRow icon={<IconTemperature size={14} stroke={1.6} />} role="environment" rule='type=environment, or sysDescr ∋ sensor, climate' />
            <RoleRow icon={<IconNetwork size={14} stroke={1.6} />} role="switch" rule='type=network (default for network devices not matched above)' />
            <RoleRow icon={<IconDeviceUnknown size={14} stroke={1.6} />} role="unknown" rule='everything else' />
          </tbody>
        </table>
        <p className="text-obs-mute">
          Use the <strong>role:</strong> chips in the filter bar to show only
          devices of a specific role.
        </p>
      </div>
    ),
  },
  {
    id: "url",
    label: "Sharing links",
    body: (
      <div className="space-y-2 text-sm">
        <p>
          The URL hash carries the full UI state: search query, view, tree
          source, selected node, treemap focus, selected device, and active
          chip filters. Click <strong>Copy link</strong> in the top bar to
          share the exact view you're seeing.
        </p>
      </div>
    ),
  },
];

function Row({ k, v, ex }: { k: string; v: string; ex?: string }) {
  return (
    <tr className="border-b border-obs-border last:border-b-0">
      <td className="px-2 py-1 font-mono text-obs-navy w-40">{k}</td>
      <td className="px-2 py-1">
        {v}
        {ex && <span className="ml-1 text-obs-mute">e.g. <code>{ex}</code></span>}
      </td>
    </tr>
  );
}

function RoleRow({ icon, role, rule }: { icon: React.ReactNode; role: string; rule: string }) {
  return (
    <tr className="border-b border-obs-border last:border-b-0">
      <td className="px-2 py-1 text-obs-navy">{icon}</td>
      <td className="px-2 py-1 font-mono text-obs-navy">{role}</td>
      <td className="px-2 py-1 text-obs-mute">{rule}</td>
    </tr>
  );
}

export function HelpModal() {
  const open = useApp((s) => s.helpOpen);
  const setOpen = useApp((s) => s.setHelpOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  const active = SECTIONS.find((s) => s.id === open) ?? SECTIONS[0];

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-stretch justify-center p-8"
      onClick={() => setOpen(null)}
    >
      <div
        className="bg-white rounded shadow-xl w-full max-w-4xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2 border-b border-obs-border flex items-center justify-between">
          <div className="font-semibold text-obs-navy">Help</div>
          <button
            onClick={() => setOpen(null)}
            className="text-obs-mute hover:text-obs-navy text-sm"
          >
            close (Esc)
          </button>
        </div>
        <div className="flex-1 grid grid-cols-[180px_1fr] min-h-0">
          <nav className="border-r border-obs-border p-2 text-sm space-y-1 overflow-auto">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setOpen(s.id)}
                className={`block w-full text-left px-2 py-1 rounded ${
                  s.id === active.id
                    ? "bg-obs-blue text-white"
                    : "text-obs-text hover:bg-obs-surface"
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="overflow-auto p-4 text-sm">{active.body}</div>
        </div>
      </div>
    </div>
  );
}
