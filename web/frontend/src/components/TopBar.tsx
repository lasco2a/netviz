import { useState } from "react";
import { IconMoon, IconSun } from "@tabler/icons-react";

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
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const [copied, setCopied] = useState(false);

  async function shareLink() {
    const url = window.location.href;
    let ok = false;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        ok = true;
      } catch { /* fall through to execCommand */ }
    }
    if (!ok) {
      const el = document.createElement("input");
      el.value = url;
      el.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(el);
      el.select();
      try { ok = document.execCommand("copy"); } finally { document.body.removeChild(el); }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <header className="h-12 bg-obs-navy text-white flex items-center px-4">
      {/* ── left side — grows to fill available space ── */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="font-semibold text-base tracking-tight flex-shrink-0">netviz</div>
        <div className="inline-flex rounded border border-obs-navyLight overflow-hidden text-xs flex-shrink-0">
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
          <div className="text-xs text-obs-mute flex-shrink-0">
            {meta.device_count} dev &middot; {meta.edge_count} links
            {meta.endpoint_count != null && (
              <> &middot; {meta.endpoint_count} endpoints</>
            )}
          </div>
        )}
        <button
          onClick={shareLink}
          title="Copy shareable link to clipboard"
          className="text-xs text-obs-mute hover:text-white border border-obs-navyLight rounded px-2 py-0.5 flex-shrink-0"
        >
          {copied ? "Copied!" : "Share this link"}
        </button>
        <div className="text-xs flex-shrink-0">
          <span className="text-obs-mute">user </span>
          <span className="font-medium">{user?.username}</span>
          <button
            onClick={doLogout}
            className="ml-3 text-obs-blue hover:text-white text-xs"
          >
            sign out
          </button>
        </div>
      </div>

      {/* ── far-right corner — Theme + Admin + Help ── */}
      <div className="flex items-center gap-1 ml-4 flex-shrink-0">
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="text-obs-mute hover:text-white w-7 h-7 inline-flex items-center justify-center rounded border border-obs-navyLight"
        >
          {theme === "dark"
            ? <IconSun size={14} stroke={1.5} />
            : <IconMoon size={14} stroke={1.5} />}
        </button>
        {isAdmin && (
          <button
            onClick={() => setViewMode("admin")}
            title="Admin panel"
            className={`text-xs px-2 py-0.5 rounded border ${
              viewMode === "admin"
                ? "bg-obs-blue border-obs-blue text-white"
                : "border-obs-navyLight text-obs-mute hover:text-white"
            }`}
          >
            Admin
          </button>
        )}
        <button
          onClick={() => setHelpOpen("overview")}
          title="Help (?)"
          className="text-obs-mute hover:text-white text-base w-7 h-7 inline-flex items-center justify-center rounded border border-obs-navyLight"
        >
          ?
        </button>
      </div>
    </header>
  );
}
