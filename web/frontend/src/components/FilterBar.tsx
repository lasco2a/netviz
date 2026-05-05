import { useMemo } from "react";

import { useFilteredDeviceIds } from "@/lib/filters";
import { useApp } from "@/store/app";

// Compact strip of type and status chips below the TopBar.
// Counts reflect what's visible after the *other* filters (tree + search) are
// applied, so the user can see how many devices each chip would match.
export function FilterBar() {
  const index = useApp((s) => s.index);
  const filters = useApp((s) => s.filters);
  const toggleType = useApp((s) => s.toggleType);
  const toggleStatus = useApp((s) => s.toggleStatus);
  const visible = useFilteredDeviceIds();

  const { typeCounts, statusCounts } = useMemo(() => {
    const tc = new Map<string, number>();
    const sc = new Map<number, number>();
    if (!index) return { typeCounts: tc, statusCounts: sc };
    // Iterate union of currently-visible AND filtered-out-by-chips devices so
    // chip counts don't disappear when the user toggles them on.
    for (const d of index.raw.devices) {
      const t = d.type ?? "unknown";
      tc.set(t, (tc.get(t) ?? 0) + 1);
      sc.set(d.status, (sc.get(d.status) ?? 0) + 1);
    }
    return { typeCounts: tc, statusCounts: sc };
  }, [index]);

  if (!index) return null;

  const sortedTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12); // cap chip count to keep the bar tidy

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
      <span className="text-obs-mute">type:</span>
      {sortedTypes.map(([t, c]) => {
        const active = filters.types.has(t);
        return (
          <Chip
            key={t}
            active={active}
            onClick={() => toggleType(t)}
            label={t}
            count={c}
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
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: "green" | "red";
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
      <span>{label}</span>
      <span className={active ? "opacity-80" : "text-obs-mute"}>{count}</span>
    </button>
  );
}
