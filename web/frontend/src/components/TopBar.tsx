import { useApp } from "@/store/app";

export function TopBar() {
  const user = useApp((s) => s.user);
  const doLogout = useApp((s) => s.doLogout);
  const meta = useApp((s) => s.index?.raw.meta);
  const search = useApp((s) => s.filters.search);
  const setSearch = useApp((s) => s.setSearch);
  const viewMode = useApp((s) => s.viewMode);
  const setViewMode = useApp((s) => s.setViewMode);

  return (
    <header className="h-12 bg-obs-navy text-white flex items-center px-4 gap-4">
      <div className="font-semibold text-base tracking-tight">netviz</div>
      <div className="inline-flex rounded border border-obs-navyLight overflow-hidden text-xs">
        {(["table", "graph"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`px-3 py-1 ${
              viewMode === m
                ? "bg-obs-blue text-white"
                : "text-obs-mute hover:text-white"
            }`}
          >
            {m === "table" ? "Table" : "Graph"}
          </button>
        ))}
      </div>
      <input
        placeholder="Search hostname, IP, location\u2026"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="flex-1 max-w-md bg-obs-navyDark border border-obs-navyLight rounded px-2 py-1 text-sm placeholder-obs-mute focus:outline-none focus:border-obs-blue"
      />
      {meta && (
        <div className="text-xs text-obs-mute">
          {meta.device_count} devices &middot; {meta.edge_count} links &middot;{" "}
          generated{" "}
          {new Date(meta.generated_at * 1000).toLocaleString(undefined, {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </div>
      )}
      <div className="text-xs">
        <span className="text-obs-mute">user </span>
        <span className="font-medium">{user?.username}</span>
        <button
          onClick={doLogout}
          className="ml-3 text-obs-blue hover:text-white text-xs"
        >
          sign out
        </button>
      </div>
    </header>
  );
}
