import { useEffect } from "react";

import { AdminModal } from "@/components/AdminModal";
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

export function App() {
  const checkSession = useApp((s) => s.checkSession);
  const authChecked = useApp((s) => s.authChecked);
  const user = useApp((s) => s.user);
  const loadSnapshot = useApp((s) => s.loadSnapshot);
  const index = useApp((s) => s.index);
  const loadingSnapshot = useApp((s) => s.loadingSnapshot);
  const snapshotError = useApp((s) => s.snapshotError);
  const viewMode = useApp((s) => s.viewMode);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (user && !index && !loadingSnapshot) {
      loadSnapshot();
    }
  }, [user, index, loadingSnapshot, loadSnapshot]);

  // Hydrate URL state once we have the snapshot (so device selection etc. can
  // resolve). Subsequent store changes are written back via useUrlSync.
  useEffect(() => {
    if (index) hydrateFromHash();
  }, [index]);
  useUrlSync();

  if (!authChecked) {
    return <div className="p-6 text-obs-mute text-sm">Checking session\u2026</div>;
  }
  if (!user) return <Login />;

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      {index && <FilterBar />}
      {snapshotError && (
        <div className="bg-obs-danger text-white text-xs px-4 py-1">
          Snapshot error: {snapshotError}
        </div>
      )}
      <main className="flex-1 grid grid-cols-[260px_1fr_360px] min-h-0">
        <LocationTree />
        {loadingSnapshot && !index ? (
          <div className="p-6 text-obs-mute text-sm">Loading snapshot\u2026</div>
        ) : viewMode === "graph" ? (
          <GraphView />
        ) : viewMode === "treemap" ? (
          <TreeMapView />
        ) : (
          <DeviceTable />
        )}
        <DeviceDrawer />
      </main>
      <HelpModal />
      <AdminModal />
    </div>
  );
}
