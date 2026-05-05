// Tiny fetch helpers. Cookies are sent automatically (same origin via Vite proxy
// in dev, same origin in prod).

import type { DeviceDetail, MeUser, Snapshot } from "./types";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(res.status, detail || res.statusText);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function login(username: string, password: string): Promise<MeUser> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return jsonOrThrow<MeUser>(res);
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST" });
}

export async function me(): Promise<MeUser> {
  const res = await fetch("/api/me");
  return jsonOrThrow<MeUser>(res);
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch("/snapshot.json");
  return jsonOrThrow<Snapshot>(res);
}

export async function fetchDevice(id: number): Promise<DeviceDetail> {
  const res = await fetch(`/device/${id}.json`);
  return jsonOrThrow<DeviceDetail>(res);
}

export interface SearchResult {
  devices: number[];
  endpoints: number[];
}

export async function search(q: string, signal?: AbortSignal): Promise<SearchResult> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  return jsonOrThrow<SearchResult>(res);
}

export interface ServerConfig {
  dns: { enabled: boolean; ttl_days: number };
  snapshot: {
    generated_at: number | null;
    device_count: number;
    edge_count: number;
    endpoint_count: number;
    endpoint_resolved: number;
  };
}

export async function fetchConfig(): Promise<ServerConfig> {
  const res = await fetch("/api/config");
  return jsonOrThrow<ServerConfig>(res);
}

export interface RefreshJob {
  kind: string;
  started_at: number;
  finished_at: number | null;
  running: boolean;
  return_code: number | null;
  pid: number | null;
  error: string | null;
  log: string[];
}

export async function adminRefresh(
  kind: "exporter" | "dns",
  opts: { dns_force?: boolean } = {},
): Promise<{ ok: boolean; kind: string; started_at: number }> {
  const res = await fetch("/api/admin/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, ...opts }),
  });
  return jsonOrThrow(res);
}

export async function adminRefreshStatus(): Promise<{
  current: RefreshJob | null;
  last: RefreshJob | null;
}> {
  const res = await fetch("/api/admin/refresh/status");
  return jsonOrThrow(res);
}

export interface SqlEntry {
  ts: number;
  sql: string;
  params: string;
  duration_ms: number;
  rows: number;
  rows_examined?: number;
}

export async function fetchExporterSql(): Promise<{ entries: SqlEntry[] }> {
  const res = await fetch("/api/admin/exporter-sql");
  return jsonOrThrow<{ entries: SqlEntry[] }>(res);
}

export interface ScheduleEntry {
  id: string;
  time: string;        // "HH:MM"
  dns: boolean;
  enabled: boolean;
  last_run_at: number | null;  // Unix timestamp, written by scheduler
}

export async function fetchSchedule(): Promise<ScheduleEntry[]> {
  const res = await fetch("/api/admin/schedule");
  const data = await jsonOrThrow<{ entries: ScheduleEntry[] }>(res);
  return data.entries;
}

export async function saveSchedule(entries: ScheduleEntry[]): Promise<ScheduleEntry[]> {
  const res = await fetch("/api/admin/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entries),
  });
  const data = await jsonOrThrow<{ entries: ScheduleEntry[] }>(res);
  return data.entries;
}
