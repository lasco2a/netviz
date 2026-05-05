import { useEffect, useRef, useState } from "react";

import * as api from "@/lib/api";

type RefreshKind = "exporter" | "dns";

function genId(): string {
  try { return crypto.randomUUID(); } catch { /* fall through */ }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fmtLastRun(ts: number | null): string {
  if (!ts) return "never";
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `today ${time}`;
  if (isYesterday) return `yesterday ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` ${time}`;
}

export function AdminPanel() {
  const [config, setConfig] = useState<api.ServerConfig | null>(null);
  const [status, setStatus] = useState<{
    current: api.RefreshJob | null;
    last: api.RefreshJob | null;
  } | null>(null);
  const [exporterSql, setExporterSql] = useState<api.SqlEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dnsConfirm, setDnsConfirm] = useState<0 | 1 | 2>(0);
  const [snapConfirm, setSnapConfirm] = useState(false);
  const [dnsEnabledConfirm, setDnsEnabledConfirm] = useState(false);
  const [triggered, setTriggered] = useState<string | null>(null);

  // Schedule state
  const [schedule, setSchedule] = useState<api.ScheduleEntry[]>([]);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // Load config once.
  useEffect(() => {
    api.fetchConfig().then(setConfig).catch(() => {});
  }, []);

  // Load schedule once.
  useEffect(() => {
    api.fetchSchedule().then(setSchedule).catch(() => {});
  }, []);

  // Adaptive status polling:
  //   • idle  → 30 s (catches scheduler-triggered jobs)
  //   • running → 1.5 s (live progress)
  //   • job just finished → fetch exporter SQL once
  const wasRunningRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const s = await api.adminRefreshStatus();
        if (cancelled) return;
        setStatus(s);
        const isRunning = s.current !== null;
        if (wasRunningRef.current && !isRunning) {
          // Job just finished — refresh exporter SQL.
          api.fetchExporterSql()
            .then(({ entries }) => { if (!cancelled) setExporterSql(entries); })
            .catch(() => {});
        }
        wasRunningRef.current = isRunning;
        setTimeout(tick, isRunning ? 1500 : 30000);
      } catch {
        if (!cancelled) setTimeout(tick, 30000);
      }
    };

    // Initial fetch on mount.
    api.fetchExporterSql()
      .then(({ entries }) => { if (!cancelled) setExporterSql(entries); })
      .catch(() => {});
    tick();

    return () => { cancelled = true; };
  }, []);

  async function trigger(kind: RefreshKind, dnsForce = false) {
    setError(null);
    try {
      await api.adminRefresh(kind, { dns_force: dnsForce });
      wasRunningRef.current = true; // ensure next tick uses fast polling
      setTriggered(kind);
      setTimeout(() => setTriggered(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    }
  }

  // ── Schedule helpers ─────────────────────────────────────────────────────

  function addScheduleEntry() {
    setSchedule((prev) => [
      ...prev,
      { id: genId(), time: "00:00", dns: false, enabled: true, last_run_at: null },
    ]);
    setScheduleDirty(true);
  }

  function updateEntry(id: string, patch: Partial<api.ScheduleEntry>) {
    setSchedule((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setScheduleDirty(true);
  }

  function removeEntry(id: string) {
    setSchedule((prev) => prev.filter((e) => e.id !== id));
    setScheduleDirty(true);
  }

  async function saveSchedule() {
    setScheduleSaving(true);
    setScheduleError(null);
    setScheduleSaved(false);
    try {
      const saved = await api.saveSchedule(schedule);
      setSchedule(saved);
      setScheduleDirty(false);
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 2000);
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : "save failed");
    } finally {
      setScheduleSaving(false);
    }
  }

  const dnsEnabled = config?.dns.enabled ?? true;
  const cur = status?.current;
  const last = status?.last;
  const display = cur ?? last;

  return (
    <div className="h-full overflow-auto bg-obs-card p-4 flex flex-col gap-6 text-sm">
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
        {!snapConfirm ? (
          <button
            disabled={!!cur}
            onClick={() => setSnapConfirm(true)}
            className="px-3 py-1 text-xs bg-obs-blue text-white rounded disabled:opacity-50 hover:bg-obs-navy"
          >
            Refresh snapshot now
          </button>
        ) : (
          <div className="p-2 border border-obs-warn rounded text-xs space-y-2">
            <p>Re-run the Observium exporter and reload snapshot data. Continue?</p>
            <div className="flex gap-2">
              <button
                disabled={!!cur}
                onClick={async () => { await trigger("exporter"); setSnapConfirm(false); }}
                className="px-2 py-0.5 bg-obs-blue text-white rounded text-xs disabled:opacity-50"
              >
                Run now
              </button>
              <button
                onClick={() => setSnapConfirm(false)}
                className="px-2 py-0.5 border border-obs-border rounded text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {triggered === "exporter" && (
          <p className="text-xs text-obs-accent mt-1">Job started — see Last job for progress.</p>
        )}
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
          <>
            {!dnsEnabledConfirm ? (
              <button
                disabled={!!cur}
                onClick={() => setDnsEnabledConfirm(true)}
                className="px-3 py-1 text-xs bg-obs-blue text-white rounded disabled:opacity-50 hover:bg-obs-navy"
              >
                Run DNS resolver now
              </button>
            ) : (
              <div className="p-2 border border-obs-warn rounded text-xs space-y-2">
                <p>Run reverse DNS lookups for all endpoints. Continue?</p>
                <div className="flex gap-2">
                  <button
                    disabled={!!cur}
                    onClick={async () => { await trigger("dns"); setDnsEnabledConfirm(false); }}
                    className="px-2 py-0.5 bg-obs-blue text-white rounded text-xs disabled:opacity-50"
                  >
                    Run now
                  </button>
                  <button
                    onClick={() => setDnsEnabledConfirm(false)}
                    className="px-2 py-0.5 border border-obs-border rounded text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {triggered === "dns" && (
              <p className="text-xs text-obs-accent mt-1">Job started — see Last job for progress.</p>
            )}
          </>
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
            {triggered === "dns" && (
              <p className="text-xs text-obs-accent mt-1">Job started — see Last job for progress.</p>
            )}
          </div>
        )}
      </section>

      {/* ── Schedule ───────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-obs-mute">
          Schedule
        </div>

        {schedule.length === 0 && (
          <div className="text-xs text-obs-mute">no schedules configured</div>
        )}

        <div className="space-y-1">
          {schedule.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-center gap-3 text-xs py-1 ${
                entry.enabled ? "" : "opacity-50"
              }`}
            >
              {/* Enabled toggle */}
              <input
                type="checkbox"
                checked={entry.enabled}
                onChange={(e) => updateEntry(entry.id, { enabled: e.target.checked })}
                title="Enabled"
                className="cursor-pointer"
              />

              {/* Time picker */}
              <input
                type="time"
                value={entry.time}
                onChange={(e) => updateEntry(entry.id, { time: e.target.value })}
                className="bg-obs-surface border border-obs-border rounded px-1 py-0.5 text-xs text-obs-text w-[90px]"
              />

              {/* DNS checkbox */}
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={entry.dns}
                  onChange={(e) => updateEntry(entry.id, { dns: e.target.checked })}
                />
                <span className="text-obs-mute">include DNS</span>
              </label>

              {/* Last run */}
              <span className="text-obs-mute flex-1">
                Last run: {fmtLastRun(entry.last_run_at)}
              </span>

              {/* Delete */}
              <button
                onClick={() => removeEntry(entry.id)}
                className="text-obs-mute hover:text-obs-danger px-1"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={addScheduleEntry}
            className="px-2 py-0.5 text-xs border border-obs-border rounded hover:bg-obs-surface"
          >
            + Add schedule
          </button>

          {scheduleDirty && (
            <button
              onClick={saveSchedule}
              disabled={scheduleSaving}
              className="px-2 py-0.5 text-xs bg-obs-blue text-white rounded disabled:opacity-50 hover:bg-obs-navy"
            >
              {scheduleSaving ? "Saving…" : "Save"}
            </button>
          )}

          {scheduleSaved && (
            <span className="text-xs text-obs-accent">Saved</span>
          )}
          {scheduleError && (
            <span className="text-xs text-obs-danger">{scheduleError}</span>
          )}
        </div>
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
                      ? "text-obs-accent"
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

      {/* ── Last snapshot SQL ──────────────────────────────────── */}
      {exporterSql.length > 0 && (
        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-obs-mute">
            Last snapshot SQL{" "}
            <span className="normal-case font-normal text-obs-mute">
              ({exporterSql.length} queries)
            </span>
          </div>
          <div className="overflow-auto border border-obs-border rounded text-[11px] font-mono">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-obs-surface text-obs-mute text-[10px] uppercase">
                <tr>
                  <th className="px-2 py-1 text-right font-semibold border-b border-obs-border w-[54px]">ms</th>
                  <th className="px-2 py-1 text-right font-semibold border-b border-obs-border w-[50px]">rows</th>
                  <th className="px-2 py-1 text-left font-semibold border-b border-obs-border">SQL</th>
                </tr>
              </thead>
              <tbody>
                {exporterSql.map((e, i) => (
                  <tr key={i} className="border-b border-obs-border/50 hover:bg-obs-surface/70">
                    <td className={`px-2 py-0.5 text-right ${e.duration_ms > 200 ? "text-obs-danger font-semibold" : e.duration_ms > 50 ? "text-obs-warn" : "text-obs-mute"}`}>
                      {e.duration_ms}
                    </td>
                    <td className="px-2 py-0.5 text-right text-obs-mute">{e.rows}</td>
                    <td className="px-2 py-0.5 text-obs-text break-all">
                      {e.sql.length > 200 ? e.sql.slice(0, 200) + "…" : e.sql}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  );
}
