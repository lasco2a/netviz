import { useApp } from "@/store/app";

export function DeviceDrawer() {
  const id = useApp((s) => s.selectedDeviceId);
  const detail = useApp((s) => s.deviceDetail);
  const loading = useApp((s) => s.loadingDetail);
  const select = useApp((s) => s.selectDevice);

  if (id == null) {
    return (
      <div className="h-full bg-white border-l border-obs-border p-4 text-obs-mute text-sm">
        Select a device to see details.
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="h-full bg-white border-l border-obs-border p-4 text-obs-mute text-sm">
        Loading device {id}\u2026
      </div>
    );
  }

  const d = detail.device;
  return (
    <div className="h-full bg-white border-l border-obs-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-obs-border">
        <div className="font-semibold text-obs-navy truncate">{d.hostname}</div>
        <button
          onClick={() => select(null)}
          className="text-obs-mute hover:text-obs-navy text-sm"
        >
          \u00D7
        </button>
      </div>
      <div className="overflow-auto flex-1 p-4 space-y-4">
        <Facts d={d} />
        <Section title={`Ports (${detail.ports.length})`}>
          <PortsList ports={detail.ports} />
        </Section>
        <Section title={`Neighbours (${detail.neighbours.length})`}>
          <NeighboursList rows={detail.neighbours} />
        </Section>
        {detail.endpoints && detail.endpoints.length > 0 && (
          <Section title={`Endpoints (${detail.endpoints.length})`}>
            <EndpointsList rows={detail.endpoints} />
          </Section>
        )}
        {(detail.processors.length > 0 || detail.mempools.length > 0) && (
          <Section title="Health">
            {detail.processors.map((p) => (
              <Bar
                key={p.processor_id}
                label={p.processor_descr}
                value={p.processor_usage}
              />
            ))}
            {detail.mempools.map((m) => (
              <Bar
                key={m.mempool_id}
                label={m.mempool_descr}
                value={m.mempool_perc}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Facts({ d }: { d: import("@/lib/types").Device }) {
  const rows: [string, string | number | null][] = [
    ["IP", d.ip],
    ["sysName", d.sysName],
    ["Type", d.type],
    ["OS", d.os],
    ["Hardware", d.hardware],
    ["Vendor", d.vendor],
    ["Location", d.location],
    ["Uptime", d.uptime ? `${Math.floor(d.uptime / 86400)}d` : null],
    ["Status", d.status === 1 ? "up" : "down"],
    ["Last polled", d.last_polled],
  ];
  return (
    <div className="text-xs grid grid-cols-[110px_1fr] gap-y-1 gap-x-3">
      {rows.map(([k, v]) => (
        <DefRow key={k} k={k} v={v ?? "\u2014"} />
      ))}
    </div>
  );
}

function DefRow({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <div className="text-obs-mute">{k}</div>
      <div className="font-mono break-all">{v}</div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-obs-mute mb-1">{title}</div>
      <div className="border border-obs-border rounded">{children}</div>
    </div>
  );
}

function PortsList({ ports }: { ports: import("@/lib/types").Port[] }) {
  if (!ports.length) {
    return <div className="p-2 text-xs text-obs-mute">no ports</div>;
  }
  return (
    <div className="max-h-64 overflow-auto text-xs font-mono">
      {ports.map((p) => (
        <div
          key={p.port_id}
          className="flex items-center px-2 py-0.5 border-b border-obs-border/50 last:border-b-0"
        >
          <div className="w-10 text-obs-mute">{String(p.ifIndex ?? "")}</div>
          <div className="flex-1 truncate">{p.ifName ?? p.ifDescr}</div>
          <div className="w-12 text-right">
            <span
              className={
                p.ifOperStatus === "up"
                  ? "text-green-700"
                  : p.ifOperStatus === "down"
                    ? "text-red-700"
                    : "text-obs-mute"
              }
            >
              {p.ifOperStatus ?? "?"}
            </span>
          </div>
          <div className="w-20 text-right">
            {p.ifHighSpeed ? `${p.ifHighSpeed}M` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function NeighboursList({ rows }: { rows: import("@/lib/types").NeighbourRow[] }) {
  if (!rows.length) {
    return <div className="p-2 text-xs text-obs-mute">no neighbours</div>;
  }
  return (
    <div className="max-h-64 overflow-auto text-xs font-mono">
      {rows.map((n) => (
        <div
          key={n.neighbour_id}
          className="flex items-center px-2 py-0.5 border-b border-obs-border/50 last:border-b-0"
        >
          <div className="w-12 text-obs-mute">{n.protocol ?? ""}</div>
          <div className="flex-1 truncate">{n.remote_hostname}</div>
          <div className="w-24 truncate text-obs-mute">{n.remote_port}</div>
        </div>
      ))}
    </div>
  );
}

function EndpointsList({ rows }: { rows: import("@/lib/types").Endpoint[] }) {
  const deviceIdByIp = useApp((s) => s.index?.deviceIdByIp);
  const select = useApp((s) => s.selectDevice);
  if (!rows.length) {
    return <div className="p-2 text-xs text-obs-mute">no endpoints</div>;
  }
  return (
    <div className="max-h-64 overflow-auto text-xs font-mono">
      {rows.map((e) => {
        const linkedId = deviceIdByIp?.get(e.ip);
        return (
          <div
            key={e.id}
            className="flex items-center px-2 py-0.5 border-b border-obs-border/50 last:border-b-0"
          >
            <div className="w-32 truncate">{e.ip}</div>
            <div className="w-40 truncate text-obs-mute">{e.mac}</div>
            <div className="flex-1 truncate">{e.hostname ?? ""}</div>
            {linkedId != null && linkedId !== e.device_id && (
              <button
                title="Open managed device with this IP"
                onClick={() => select(linkedId)}
                className="ml-2 text-obs-blue hover:underline"
              >
                \u2192
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const colour = v > 80 ? "bg-obs-danger" : v > 60 ? "bg-obs-warn" : "bg-obs-blue";
  return (
    <div className="px-2 py-1 border-b border-obs-border/50 last:border-b-0">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate">{label}</span>
        <span className="font-mono text-obs-mute ml-2">{v}%</span>
      </div>
      <div className="h-1.5 bg-obs-surface mt-1 rounded">
        <div className={`h-full rounded ${colour}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
