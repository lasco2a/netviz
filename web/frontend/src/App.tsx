import { useEffect, useRef, useState } from "react";

import { AdminPanel } from "@/components/AdminPanel";
import { DeviceDrawer } from "@/components/DeviceDrawer";
import { DeviceTable } from "@/components/DeviceTable";
import { FilterBar } from "@/components/FilterBar";
import { GraphView } from "@/components/GraphView";
import { HelpModal } from "@/components/HelpModal";
import { LocationTree } from "@/components/LocationTree";
import { Login } from "@/components/Login";
import { TopBar } from "@/components/TopBar";
import { TreeMapView } from "@/components/TreeMapView";
import { hydrateFromHash, useUrlSync } from "@/lib/urlState";
import { useApp } from "@/store/app";

// Panel size constraints (px).
const LEFT_DEFAULT = 260;
const RIGHT_DEFAULT = 360;
const LEFT_MIN = 140;
const LEFT_MAX = 500;
const RIGHT_MIN = 200;
const RIGHT_MAX = 580;
const COLLAPSED_W = 28; // width of the collapsed strip with the expand button

export function App() {
  const checkSession = useApp((s) => s.checkSession);
  const authChecked = useApp((s) => s.authChecked);
  const user = useApp((s) => s.user);
  const loadSnapshot = useApp((s) => s.loadSnapshot);
  const index = useApp((s) => s.index);
  const loadingSnapshot = useApp((s) => s.loadingSnapshot);
  const snapshotError = useApp((s) => s.snapshotError);
  const viewMode = useApp((s) => s.viewMode);
  const theme = useApp((s) => s.theme);

  // Keep the <html> class in sync with the theme so Tailwind's dark: variants
  // and CSS variable overrides both activate correctly.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Panel resize state.
  const [leftW, setLeftW] = useState(LEFT_DEFAULT);
  const [rightW, setRightW] = useState(RIGHT_DEFAULT);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const dragRef = useRef<{
    side: "left" | "right";
    startX: number;
    startW: number;
  } | null>(null);

  // Wire up drag-to-resize on the window so it works even if the mouse leaves
  // the handle div during a fast drag.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = e.clientX - d.startX;
      if (d.side === "left") {
        setLeftW(Math.max(LEFT_MIN, Math.min(LEFT_MAX, d.startW + delta)));
      } else {
        setRightW(Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, d.startW - delta)));
      }
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (side: "left" | "right", e: React.MouseEvent) => {
    dragRef.current = {
      side,
      startX: e.clientX,
      startW: side === "left" ? leftW : rightW,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  useEffect(() => { checkSession(); }, [checkSession]);

  useEffect(() => {
    if (user && !index && !loadingSnapshot) loadSnapshot();
  }, [user, index, loadingSnapshot, loadSnapshot]);

  useEffect(() => {
    if (index) hydrateFromHash();
  }, [index]);
  useUrlSync();

  if (!authChecked) {
    return <div className="p-6 text-obs-mute text-sm">Checking session…</div>;
  }
  if (!user) return <Login />;

  const showSidePanels = viewMode !== "admin";

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      {index && <FilterBar />}
      {snapshotError && (
        <div className="bg-obs-danger text-white text-xs px-4 py-1">
          Snapshot error: {snapshotError}
        </div>
      )}

      <main className="flex-1 flex min-h-0">
        {/* ── LEFT PANEL ───────────────────────────────────────────── */}
        {showSidePanels && (
          <>
            {leftCollapsed ? (
              <CollapsedStrip
                side="left"
                onExpand={() => setLeftCollapsed(false)}
              />
            ) : (
              <div
                className="flex-shrink-0 overflow-hidden relative"
                style={{ width: leftW }}
              >
                <LocationTree />
                <button
                  className="absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center bg-obs-card/80 border border-obs-border rounded text-[10px] text-obs-mute hover:text-obs-navy hover:border-obs-blue transition-colors"
                  onClick={() => setLeftCollapsed(true)}
                  title="Collapse left panel"
                >
                  ‹
                </button>
              </div>
            )}

            {/* left drag handle */}
            {!leftCollapsed && (
              <DragHandle
                side="left"
                onDragStart={(e) => startDrag("left", e)}
              />
            )}
          </>
        )}

        {/* ── CENTER ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {viewMode === "admin" ? (
            <AdminPanel />
          ) : loadingSnapshot && !index ? (
            <div className="p-6 text-obs-mute text-sm">Loading snapshot…</div>
          ) : viewMode === "graph" ? (
            <GraphView />
          ) : viewMode === "treemap" ? (
            <TreeMapView />
          ) : (
            <DeviceTable />
          )}
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────────── */}
        {showSidePanels && (
          <>
            {/* right drag handle */}
            {!rightCollapsed && (
              <DragHandle
                side="right"
                onDragStart={(e) => startDrag("right", e)}
              />
            )}

            {rightCollapsed ? (
              <CollapsedStrip
                side="right"
                onExpand={() => setRightCollapsed(false)}
              />
            ) : (
              <div
                className="flex-shrink-0 overflow-hidden relative"
                style={{ width: rightW }}
              >
                <DeviceDrawer />
                <button
                  className="absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center bg-obs-card/80 border border-obs-border rounded text-[10px] text-obs-mute hover:text-obs-navy hover:border-obs-blue transition-colors"
                  onClick={() => setRightCollapsed(true)}
                  title="Collapse right panel"
                >
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <HelpModal />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

interface DragHandleProps {
  side: "left" | "right";
  onDragStart: (e: React.MouseEvent) => void;
}

function DragHandle({ onDragStart }: DragHandleProps) {
  return (
    <div
      className="flex-shrink-0 w-2 cursor-col-resize relative group flex items-center justify-center bg-obs-surface hover:bg-obs-blue/10 border-x border-obs-border/50 transition-colors"
      onMouseDown={onDragStart}
    >
      {/* visible grip line */}
      <div className="w-px h-10 bg-obs-border group-hover:bg-obs-blue transition-colors" />
    </div>
  );
}

interface CollapsedStripProps {
  side: "left" | "right";
  onExpand: () => void;
}

function CollapsedStrip({ side, onExpand }: CollapsedStripProps) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center bg-obs-surface border-r border-obs-border cursor-pointer hover:bg-obs-blue/10 transition-colors"
      style={{ width: COLLAPSED_W }}
      onClick={onExpand}
      title={side === "left" ? "Expand left panel" : "Expand right panel"}
    >
      <span className="text-obs-mute text-sm select-none">
        {side === "left" ? "›" : "‹"}
      </span>
    </div>
  );
}
