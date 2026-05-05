import { useEffect, useState } from "react";

import * as api from "@/lib/api";
import { useApp } from "@/store/app";

type RefreshKind = "exporter" | "dns";

export function AdminModal() {
  const open = useApp((s) => s.adminOpen);
  const setOpen = useApp((s) => s.setAdminOpen);
  const [config, setConfig] = useState<api.ServerConfig | null>(null);
  const [status, setStatus] = useState<{ current: api.RefreshJob | null; last: api.RefreshJob | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Two-confirmation flow for forcing DNS while NETVIZ_DNS_ENABLED=false.
  const [dnsConfirm, setDnsConfirm] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.fetchConfig().then((c) => !cancelled && setConfig(c)).catch(() => {});
    const tick = () => {
      api.adminRefreshStatus().then((s) => !cancelled && setStatus(s)).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open]);

  if (!open) return null;

  async function trigger(kind: RefreshKind, dnsForce = false) {
    setError(null);
    try {
      await api.adminRefresh(kind, { dns_force: dnsForce });
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    }
  }

  const dnsEnabled = config?.dns.enabled ?? true;
  const cur = status?.current;
  const last = status?.last;
  const display = cur ?? last;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-8"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white rounded shadow-xl w-full max-w-3xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2 border-b border-obs-border flex items-center justify-between">
          <div className="font-semibold text-obs-navy">Admin</div>
          <button
            onClick={() => setOpen(false)}
            className="text-obs-mute hover:text-obs-navy text-sm"
          >
            close (Esc)
          </button>
        </div>
        <div className="p-4 space-y-4 text-sm">
          {error && (
            <div className="bg-obs-danger text-white text-xs px-2 py-1 rounded">{error}</div>
          )}
          <section>
            <div className="text-xs uppercase text-obs-mute mb-1">Snapshot</div>
            <div className="grid grid-cols-2 gap-y-1 text-xs">
              <div className="text-obs-mute">Generated</div>
              <div>
                {config?.snapshot.generated_at
                  ? new Date(config.snapshot.generated_at * 1000).toLocaleString()
                  : "\u2014"}
              </div>
              <div className="text-obs-mute">Devices / edges</div>
              <div>
                {config?.snapshot.device_count ?? 0} / {config?.snapshot.edge_count ?? 0}
              </div>
              <div className="text-obs-mute">Endpoints (resolved)</div>
              <div>
                {config?.snapshot.endpoint_count ?? 0} ({config?.snapshot.endpoint_resolved ?? 0})
              </div>
            </div>
            <button
              disabled={!!cur}
              onClick={() => trigger("exporter")}
              className="mt-2 px-3 py-1 text-xs bg-obs-blue text-white rounded disabled:opacity-50"
            >
              Refresh snapshot now
            </button>
          </section>

          <section>
            <div className="text-xs uppercase text-obs-mute mb-1">Reverse DNS</div>
            <div className="text-xs">
              Status: <strong>{dnsEnabled ? "enabled" : "disabled"}</strong>
              <span className="text-obs-mute">
                {" "}(TTL {config?.dns.ttl_days ?? 7} days)
              </span>
            </div>
            {dnsEnabled ? (
              <button
                disabled={!!cur}
                onClick={() => trigger("dns")}
                className="mt-2 px-3 py-1 text-xs bg-obs-blue text-white rounded disabled:opacity-50"
              >
                Run DNS resolver now
              </button>
            ) : (
              <div className="mt-2 space-y-2">
                {dnsConfirm === 0 && (
                  <button
                    onClick={() => setDnsConfirm(1)}
                    className="px-3 py-1 text-xs border border-obs-warn text-obs-warn rounded"
                  >
                    Override and run DNS now
                  </button>
                )}
                {dnsConfirm === 1 && (
                  <div className="p-2 border border-obs-warn rounded text-xs">
                    DNS is disabled in the environment. Run anyway?
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setDnsConfirm(2)}
                        className="px-2 py-0.5 bg-obs-warn text-white rounded"
                      >
                        Yes, continue
                      </button>
                      <button
                        onClick={() => setDnsConfirm(0)}
                        className="px-2 py-0.5 border border-obs-border rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {dnsConfirm === 2 && (
                  <div className="p-2 border border-obs-danger rounded text-xs">
                    Final confirmation: DNS lookups generate traffic and may
                    take a while. Proceed?
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={!!cur}
                        onClick={async () => {
                          await trigger("dns", true);
                          setDnsConfirm(0);
                        }}
                        className="px-2 py-0.5 bg-obs-danger text-white rounded disabled:opacity-50"
                      >
                        Run now
                      </button>
                      <button
                        onClick={() => setDnsConfirm(0)}
                        className="px-2 py-0.5 border border-obs-border rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section>
            <div className="text-xs uppercase text-obs-mute mb-1">Last job</div>
            {!display ? (
              <div className="text-xs text-obs-mute">no jobs yet</div>
            ) : (
              <div className="text-xs">
                <div>
                  <strong>{display.kind}</strong>{" "}
                  {display.running ? (
                    <span className="text-obs-warn">running\u2026</span>
                  ) : (
                    <span className={display.return_code === 0 ? "text-green-700" : "text-obs-danger"}>
                      exit {display.return_code}
                    </span>
                  )}
                </div>
                <pre className="mt-1 max-h-64 overflow-auto bg-obs-surface border border-obs-border rounded p-2 text-[11px] font-mono whitespace-pre-wrap">
                  {display.log.join("\n") || "(no output yet)"}
                </pre>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
