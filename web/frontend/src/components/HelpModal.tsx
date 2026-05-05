import { useEffect } from "react";

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
          The left tree filters by location/group/topology. Status and type
          chips (under the top bar) further narrow what's visible.
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
            <Row k="plain text" v="case-insensitive substring on hostname / location / type / OS" />
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
