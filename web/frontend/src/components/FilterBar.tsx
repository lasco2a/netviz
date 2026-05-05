import { useMemo } from "react";

import { iconComponentFor, roleLabel } from "@/lib/deviceIcon";
import { useFilteredDeviceIds } from "@/lib/filters";
import type { DeviceRole } from "@/lib/types";
import { useApp } from "@/store/app";

// Compact strip of role and status chips below the TopBar.
// Counts reflect what's visible after the *other* filters (tree + search) are
// applied, so the user can see how many devices each chip would match.
export function FilterBar() {
  const index = useApp((s) => s.index);
  const filters = useApp((s) => s.filters);
  const toggleRole = useApp((s) => s.toggleRole);
  const toggleStatus = useApp((s) => s.toggleStatus);
  const visible = useFilteredDeviceIds();

  const { roleCounts, statusCounts } = useMemo(() => {
    const rc = new Map<DeviceRole, number>();
    const sc = new Map<number, number>();
    if (!index) return { roleCounts: rc, statusCounts: sc };
    for (const d of index.raw.devices) {
      rc.set(d.role, (rc.get(d.role) ?? 0) + 1);
      sc.set(d.status, (sc.get(d.status) ?? 0) + 1);
    }
    return { roleCounts: rc, statusCounts: sc };
  }, [index]);

  if (!index) return null;

  const sortedRoles = Array.from(roleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-obs-surface border-b border-obs-border text-xs flex-wrap">
      <span className="text-obs-mute">visible: <strong className="text-obs-text">{visible.size.toLocaleString()}</strong></span>
      <div className="h-4 w-px bg-obs-border" />
      <span className="text-obs-mute">status:</span>
      {[1, 0].map((st) => {
        const active = filters.statuses.has(st);
        const c = statusCounts.get(st) ?? 0;
        return (
          <Chip
            key={st}
            active={active}
            onClick={() => toggleStatus(st)}
            color={st === 1 ? "green" : "red"}
            label={st === 1 ? "up" : "down"}
            count={c}
          />
        );
      })}
      <div className="h-4 w-px bg-obs-border" />
      <span className="text-obs-mute">role:</span>
      {sortedRoles.map(([r, c]) => {
        const active = filters.roles.has(r);
        const Icon = iconComponentFor(r);
        return (
          <Chip
            key={r}
            active={active}
            onClick={() => toggleRole(r)}
            label={roleLabel(r)}
            count={c}
            icon={<Icon size={12} stroke={1.8} />}
          />
        );
      })}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  color,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: "green" | "red";
  icon?: React.ReactNode;
}) {
  const palette = active
    ? color === "green"
      ? "bg-green-600 text-white border-green-700"
      : color === "red"
        ? "bg-red-600 text-white border-red-700"
        : "bg-obs-blue text-white border-obs-blue"
    : "bg-white text-obs-text border-obs-border hover:bg-obs-surface";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${palette}`}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{label}</span>
      <span className={active ? "opacity-80" : "text-obs-mute"}>{count}</span>
    </button>
  );
}
