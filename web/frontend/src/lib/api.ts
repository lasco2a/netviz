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
