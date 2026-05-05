import { useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import { useFilteredDeviceIds } from "@/lib/filters";
import { iconComponentFor, roleLabel } from "@/lib/deviceIcon";
import type { Device } from "@/lib/types";
import { useApp } from "@/store/app";

export function DeviceTable() {
  const index = useApp((s) => s.index);
  const selected = useApp((s) => s.selectedDeviceId);
  const select = useApp((s) => s.selectDevice);
  const ids = useFilteredDeviceIds();

  const rows = useMemo(() => {
    if (!index) return [] as Device[];
    const out: Device[] = [];
    for (const id of ids) {
      const d = index.byId.get(id);
      if (d) out.push(d);
    }
    out.sort((a, b) => (a.hostname ?? "").localeCompare(b.hostname ?? ""));
    return out;
  }, [index, ids]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 26,
    overscan: 12,
  });

  return (
    <div className="h-full flex flex-col bg-obs-card">
      <div className="flex items-center px-3 py-2 border-b border-obs-border text-xs text-obs-mute">
        <span>{rows.length.toLocaleString()} devices</span>
      </div>
      <div className="flex px-3 py-1 border-b border-obs-border bg-obs-surface text-xs font-medium text-obs-mute uppercase tracking-wide">
        <div className="w-12">id</div>
        <div className="flex-1 min-w-0">hostname</div>
        <div className="w-32">ip</div>
        <div className="w-28">type</div>
        <div className="w-44 truncate">hardware</div>
        <div className="w-44 truncate">location</div>
        <div className="w-20 text-right">status</div>
      </div>
      <div ref={parentRef} className="flex-1 overflow-auto font-mono text-xs">
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((vi) => {
            const d = rows[vi.index];
            const isSelected = selected === d.device_id;
            return (
              <div
                key={d.device_id}
                onClick={() => select(d.device_id)}
                className={`absolute left-0 right-0 flex items-center px-3 py-1 border-b border-obs-border/50 cursor-pointer hover:bg-obs-surface ${
                  isSelected ? "bg-obs-blue/10" : ""
                }`}
                style={{ top: vi.start, height: vi.size }}
              >
                <div className="w-12 text-obs-mute">{d.device_id}</div>
                <div className="flex-1 min-w-0 truncate flex items-center gap-1.5">
                  {(() => {
                    const Icon = iconComponentFor(d.role);
                    const dim = d.status === 0 ? "opacity-60" : "";
                    return (
                      <Icon
                        size={14}
                        stroke={1.6}
                        className={`shrink-0 text-obs-navy ${dim}`}
                      />
                    );
                  })()}
                  <span className="truncate">{d.hostname}</span>
                </div>
                <div className="w-32 truncate">{d.ip ?? ""}</div>
                <div className="w-28 truncate">{roleLabel(d.role)}</div>
                <div className="w-44 truncate">{d.hardware ?? ""}</div>
                <div className="w-44 truncate">{d.location ?? ""}</div>
                <div className="w-20 text-right">
                  <StatusBadge status={d.status} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  const label = status === 1 ? "up" : "down";
  const cls =
    status === 1
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${cls}`}>
      {label}
    </span>
  );
}
