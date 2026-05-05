import { useEffect, useState } from "react";

import * as api from "@/lib/api";

type RefreshKind = "exporter" | "dns";

export function AdminPanel() {
  const [config, setConfig] = useState<api.ServerConfig | null>(null);
  const [status, setStatus] = useState<{
    current: api.RefreshJob | null;
    last: api.RefreshJob | null;
  } | null>(null);
  const [sqlLog, setSqlLog] = useState<api.SqlEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dnsConfirm, setDnsConfirm] = useState<0 | 1 | 2>(0);

  // Load config once.
  useEffect(() => {
    api.fetchConfig().then(setConfig).catch(() => {});
  }, []);

  // Poll refresh status every 1.5 s.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      api.adminRefreshStatus()
        .then((s) => { if (!cancelled) setStatus(s); })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Poll SQL log every 2 s.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      api.fetchSqlLog()
        .then((entries) => { if (!cancelled) setSqlLog(entries); })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

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
    <div className="h-full overflow-auto bg-white p-4 flex flex-col gap-6 text-sm">
      <h2 className="text-base font-semibold text-obs-navy">Admin</h2>

      {error && (
        <div className="bg-obs-danger text-white text-xs px-2 py-1 rounded">
          {error}
        </div>
      )}

      {/* ── Snapshot ───────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-obs-mute">
          Snapshot
        </div>
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
          <span className="text-obs-mute">Generated</span>
          <span>
            {config?.snapshot.generated_at
              ? new Date(config.snapshot.generated_at * 1000).toLocaleString()
              : "—"}
          </span>
          <span className="text-obs-mute">Devices / edges</span>
          <span>
            {config?.snapshot.device_count ?? 0} /{" "}
            {config?.snapshot.edge_count ?? 0}
          </span>
          <span className="text-obs-mute">Endpoints (resolved)</span>
          <span>
            {config?.snapshot.endpoint_count ?? 0} (
            {config?.snapshot.endpoint_resolved ?? 0})
          </span>
        </div>
        <button
          disabled={!!cur}
          onClick={() => trigger("exporter")}
          className="px-3 py-1 text-xs bg-obs-blue text-white rounded disabled:opacity-50 hover:bg-obs-navy"
        >
          Refresh snapshot now
        </button>
      </section>

      {/* ── Reverse DNS ────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-obs-mute">
          Reverse DNS
        </div>
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
            className="px-3 py-1 text-xs bg-obs-blue text-white rounded disabled:opacity-50 hover:bg-obs-navy"
          >
            Run DNS resolver now
          </button>
        ) : (
          <div className="space-y-2">
            {dnsConfirm === 0 && (
              <button
                onClick={() => setDnsConfirm(1)}
                className="px-3 py-1 text-xs border border-obs-warn text-obs-warn rounded"
              >
                Override and run DNS now
              </button>
            )}
            {dnsConfirm === 1 && (
              <div className="p-2 border border-obs-warn rounded text-xs space-y-2">
                <p>DNS is disabled in the environment. Run anyway?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDnsConfirm(2)}
                    className="px-2 py-0.5 bg-obs-warn text-white rounded text-xs"
                  >
                    Yes, continue
                  </button>
                  <button
                    onClick={() => setDnsConfirm(0)}
                    className="px-2 py-0.5 border border-obs-border rounded text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {dnsConfirm === 2 && (
              <div className="p-2 border border-obs-danger rounded text-xs space-y-2">
                <p>
                  Final confirmation: DNS lookups generate traffic. Proceed?
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={!!cur}
                    onClick={async () => {
                      await trigger("dns", true);
                      setDnsConfirm(0);
                    }}
                    className="px-2 py-0.5 bg-obs-danger text-white rounded text-xs disabled:opacity-50"
                  >
                    Run now
                  </button>
                  <button
                    onClick={() => setDnsConfirm(0)}
                    className="px-2 py-0.5 border border-obs-border rounded text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Last job log ───────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-obs-mute">
          Last job
        </div>
        {!display ? (
          <div className="text-xs text-obs-mute">no jobs yet</div>
        ) : (
          <div className="text-xs">
            <div>
              <strong>{display.kind}</strong>{" "}
              {display.running ? (
                <span className="text-obs-warn">running…</span>
              ) : (
                <span
                  className={
                    display.return_code === 0
                      ? "text-green-700"
                      : "text-obs-danger"
                  }
                >
                  exit {display.return_code}
                </span>
              )}
            </div>
            <pre className="mt-1 max-h-48 overflow-auto bg-obs-surface border border-obs-border rounded p-2 text-[11px] font-mono whitespace-pre-wrap">
              {display.log.join("\n") || "(no output yet)"}
            </pre>
          </div>
        )}
      </section>

      {/* ── SQL query log ──────────────────────────────────────── */}
      <section className="space-y-2 flex-1 min-h-0 flex flex-col">
        <div className="text-xs font-semibold uppercase tracking-wide text-obs-mute">
          SQL query log{" "}
          <span className="normal-case font-normal text-obs-mute">
            (last {sqlLog.length} / 100, live)
          </span>
        </div>
        {sqlLog.length === 0 ? (
          <div className="text-xs text-obs-mute">no queries yet</div>
        ) : (
          <div className="overflow-auto border border-obs-border rounded text-[11px] font-mono flex-1">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-obs-surface text-obs-mute text-[10px] uppercase">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold border-b border-obs-border w-[90px]">
                    Time
                  </th>
                  <th className="px-2 py-1 text-right font-semibold border-b border-obs-border w-[54px]">
                    ms
                  </th>
                  <th className="px-2 py-1 text-right font-semibold border-b border-obs-border w-[40px]">
                    rows
                  </th>
                  <th className="px-2 py-1 text-left font-semibold border-b border-obs-border">
                    SQL
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...sqlLog].reverse().map((e, i) => (
                  <tr
                    key={i}
                    className="border-b border-obs-border/50 hover:bg-obs-surface/70"
                  >
                    <td className="px-2 py-0.5 text-obs-mute whitespace-nowrap">
                      {new Date(e.ts * 1000).toLocaleTimeString()}
                    </td>
                    <td
                      className={`px-2 py-0.5 text-right ${
                        e.duration_ms > 200
                          ? "text-obs-danger font-semibold"
                          : e.duration_ms > 50
                          ? "text-obs-warn"
                          : "text-obs-mute"
                      }`}
                    >
                      {e.duration_ms}
                    </td>
                    <td className="px-2 py-0.5 text-right text-obs-mute">
                      {e.rows}
                    </td>
                    <td className="px-2 py-0.5 text-obs-text break-all">
                      <span title={e.params || undefined}>
                        {e.sql.length > 200
                          ? e.sql.slice(0, 200) + "…"
                          : e.sql}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
