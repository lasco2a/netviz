import { useApp } from "@/store/app";

export function TopBar() {
  const user = useApp((s) => s.user);
  const doLogout = useApp((s) => s.doLogout);
  const meta = useApp((s) => s.index?.raw.meta);
  const search = useApp((s) => s.filters.search);
  const setSearch = useApp((s) => s.setSearch);
  const searchPending = useApp((s) => s.searchPending);
  const viewMode = useApp((s) => s.viewMode);
  const setViewMode = useApp((s) => s.setViewMode);
  const setHelpOpen = useApp((s) => s.setHelpOpen);
  const isAdmin = (user?.level ?? 0) >= 10;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* clipboard blocked; ignore */
    }
  }

  return (
    <header className="h-12 bg-obs-navy text-white flex items-center px-4 gap-4">
      <div className="font-semibold text-base tracking-tight">netviz</div>
      <div className="inline-flex rounded border border-obs-navyLight overflow-hidden text-xs">
        {(["table", "graph", "treemap"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`px-3 py-1 ${
              viewMode === m
                ? "bg-obs-blue text-white"
                : "text-obs-mute hover:text-white"
            }`}
          >
            {m === "table" ? "Table" : m === "graph" ? "Graph" : "Tree-Map"}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => setViewMode("admin")}
            className={`px-3 py-1 ${
              viewMode === "admin"
                ? "bg-obs-blue text-white"
                : "text-obs-mute hover:text-white"
            }`}
          >
            Admin
          </button>
        )}
      </div>
      <div className="relative flex-1 max-w-md">
        <input
          placeholder='Search: hostname, 10.1.1.0/24, "rack a", aabbcc\u2026'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-obs-navyDark border border-obs-navyLight rounded px-2 py-1 text-sm placeholder-obs-mute focus:outline-none focus:border-obs-blue"
        />
        {searchPending && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-obs-mute">
            \u2026
          </span>
        )}
      </div>
      {meta && (
        <div className="text-xs text-obs-mute">
          {meta.device_count} dev &middot; {meta.edge_count} links
          {meta.endpoint_count != null && (
            <> &middot; {meta.endpoint_count} endpoints</>
          )}
        </div>
      )}
      <button
        onClick={copyLink}
        title="Copy shareable link"
        className="text-xs text-obs-mute hover:text-white border border-obs-navyLight rounded px-2 py-0.5"
      >
        Copy link
      </button>
      <button
        onClick={() => setHelpOpen("overview")}
        title="Help (?)"
        className="text-obs-mute hover:text-white text-base w-7 h-7 inline-flex items-center justify-center rounded border border-obs-navyLight"
      >
        ?
      </button>
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
