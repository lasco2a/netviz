// Search query parser + matcher.
//
// MUST stay in lockstep with `netviz/web/backend/search.py`. The shared
// fixtures at `tests/search_cases.json` exercise both sides.

import type { Device, Endpoint } from "./types";

export type Token =
  | { kind: "text"; raw: string; text: string }
  | { kind: "ip"; raw: string; ipBig: bigint; version: 4 | 6 }
  | { kind: "cidr"; raw: string; netStart: bigint; netEnd: bigint; version: 4 | 6 }
  | { kind: "range"; raw: string; start: number; end: number } // ipv4 only
  | { kind: "mac"; raw: string; hex: string };

const HEX_RE = /^[0-9a-f]+$/;

function normaliseMac(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i].toLowerCase();
    if ((c >= "0" && c <= "9") || (c >= "a" && c <= "f")) out += c;
  }
  return out;
}

function parseIPv4(s: string): number | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function parseIPv6(s: string): bigint | null {
  // RFC4291; supports `::` shorthand, no zone IDs.
  if (!s.includes(":")) return null;
  // Reject anything with invalid chars (allow only hex, ':', '.')
  if (!/^[0-9a-fA-F:.]+$/.test(s)) return null;

  // Handle embedded IPv4 (last group): ::ffff:1.2.3.4
  let str = s;
  const lastColon = str.lastIndexOf(":");
  if (str.indexOf(".") > lastColon) {
    const v4Part = str.slice(lastColon + 1);
    const v4 = parseIPv4(v4Part);
    if (v4 === null) return null;
    const hi = (v4 >>> 16) & 0xffff;
    const lo = v4 & 0xffff;
    str = str.slice(0, lastColon + 1) + hi.toString(16) + ":" + lo.toString(16);
  }

  const dbl = str.split("::");
  if (dbl.length > 2) return null;
  const head = dbl[0] === "" ? [] : dbl[0].split(":");
  const tail = dbl.length === 2 ? (dbl[1] === "" ? [] : dbl[1].split(":")) : [];
  if (dbl.length === 1 && head.length !== 8) return null;
  const total = head.length + tail.length;
  if (total > 8) return null;
  const fill = dbl.length === 2 ? new Array(8 - total).fill("0") : [];
  const groups = [...head, ...fill, ...tail];
  if (groups.length !== 8) return null;
  let out = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    out = (out << 16n) | BigInt(parseInt(g, 16));
  }
  return out;
}

function parseCIDR(s: string): Token | null {
  const slash = s.indexOf("/");
  if (slash < 0) return null;
  const addr = s.slice(0, slash);
  const bits = Number(s.slice(slash + 1));
  if (!Number.isInteger(bits) || bits < 0) return null;

  const v4 = parseIPv4(addr);
  if (v4 !== null && bits <= 32) {
    const mask = bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(32 - bits);
    const start = BigInt(v4) & mask;
    const end = start | ((1n << BigInt(32 - bits)) - 1n);
    return { kind: "cidr", raw: s, netStart: start, netEnd: end, version: 4 };
  }
  const v6 = parseIPv6(addr);
  if (v6 !== null && bits <= 128) {
    const mask = bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(128 - bits);
    const start = v6 & mask;
    const end = start | ((1n << BigInt(128 - bits)) - 1n);
    return { kind: "cidr", raw: s, netStart: start, netEnd: end, version: 6 };
  }
  return null;
}

function parseToken(raw: string): Token {
  const s = raw.trim();
  if (!s) return { kind: "text", raw, text: "" };

  if (s.includes("/")) {
    const cidr = parseCIDR(s);
    if (cidr) return cidr;
  }

  // IPv4 range with `.` (disambiguates from MAC dashes).
  if (s.includes("-") && s.includes(".")) {
    const dash = s.indexOf("-");
    const left = s.slice(0, dash);
    const right = s.slice(dash + 1);
    const a = parseIPv4(left);
    if (a !== null) {
      let b: number | null = null;
      if (right.includes(".")) {
        b = parseIPv4(right);
      } else if (/^\d+$/.test(right)) {
        const last = Number(right);
        if (last >= 0 && last <= 255) {
          const head = left.split(".").slice(0, 3).join(".");
          b = parseIPv4(`${head}.${last}`);
        }
      }
      if (b !== null && a <= b) {
        return { kind: "range", raw, start: a, end: b };
      }
    }
  }

  // IPv4 exact
  if (s.includes(".")) {
    const v4 = parseIPv4(s);
    if (v4 !== null) {
      return { kind: "ip", raw, ipBig: BigInt(v4), version: 4 };
    }
  }

  // IPv6 exact
  if (s.includes(":")) {
    const v6 = parseIPv6(s);
    if (v6 !== null) {
      return { kind: "ip", raw, ipBig: v6, version: 6 };
    }
  }

  // MAC: with separators or pure hex 6..12.
  const hex = normaliseMac(s);
  if (hex && HEX_RE.test(hex)) {
    const hadSep = s.includes(":") || s.includes("-");
    if (hadSep && hex.length >= 6 && hex.length <= 12) {
      return { kind: "mac", raw, hex };
    }
    if (!hadSep && hex.length >= 6 && hex.length <= 12 && !/^\d+$/.test(s)) {
      return { kind: "mac", raw, hex };
    }
  }

  return { kind: "text", raw, text: s.toLowerCase() };
}

const QUOTED_RE = /"([^"]*)"|(\S+)/g;

export function parseQuery(q: string): Token[] {
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  QUOTED_RE.lastIndex = 0;
  while ((m = QUOTED_RE.exec(q))) {
    if (m[1] !== undefined) {
      const t = m[1].trim();
      if (t) out.push({ kind: "text", raw: m[1], text: t.toLowerCase() });
    } else if (m[2]) {
      out.push(parseToken(m[2]));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function deviceHaystack(d: Device): string {
  return [d.hostname, d.sysName, d.ip, d.type, d.role, d.os, d.location, d.vendor, d.hardware]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function ipToBig(ip: string | null): { big: bigint; version: 4 | 6 } | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const v6 = parseIPv6(ip);
    if (v6 !== null) return { big: v6, version: 6 };
  }
  const v4 = parseIPv4(ip);
  if (v4 !== null) return { big: BigInt(v4), version: 4 };
  return null;
}

function tokenMatchesIp(tok: Token, ip: { big: bigint; version: 4 | 6 } | null): boolean {
  if (!ip) return false;
  if (tok.kind === "ip") return tok.version === ip.version && tok.ipBig === ip.big;
  if (tok.kind === "cidr") {
    return tok.version === ip.version && ip.big >= tok.netStart && ip.big <= tok.netEnd;
  }
  if (tok.kind === "range") {
    return ip.version === 4 && Number(ip.big) >= tok.start && Number(ip.big) <= tok.end;
  }
  return false;
}

export function matchesDevice(tokens: Token[], d: Device, hayCache?: string): boolean {
  if (!tokens.length) return false;
  const hay = hayCache ?? deviceHaystack(d);
  const ip = ipToBig(d.ip);
  for (const t of tokens) {
    if (t.kind === "text") {
      if (!t.text || !hay.includes(t.text)) return false;
    } else if (t.kind === "mac") {
      return false; // devices have no top-level mac in the snapshot
    } else if (!tokenMatchesIp(t, ip)) {
      return false;
    }
  }
  return true;
}

export function matchesEndpoint(tokens: Token[], e: Endpoint): boolean {
  if (!tokens.length) return false;
  const ip = ipToBig(e.ip);
  const macHex = normaliseMac(e.mac);
  const host = (e.hostname ?? "").toLowerCase();
  for (const t of tokens) {
    if (t.kind === "text") {
      if (!t.text || !host.includes(t.text)) return false;
    } else if (t.kind === "mac") {
      if (!macHex.includes(t.hex)) return false;
    } else if (!tokenMatchesIp(t, ip)) {
      return false;
    }
  }
  return true;
}

export function searchLocal(
  q: string,
  devices: Device[],
  endpoints: Endpoint[],
  limit = 500,
): { devices: number[]; endpoints: number[] } {
  const tokens = parseQuery(q);
  if (!tokens.length) return { devices: [], endpoints: [] };
  const dOut: number[] = [];
  for (const d of devices) {
    if (matchesDevice(tokens, d)) {
      dOut.push(d.device_id);
      if (dOut.length >= limit) break;
    }
  }
  const eOut: number[] = [];
  for (const e of endpoints) {
    if (matchesEndpoint(tokens, e)) {
      eOut.push(e.id);
      if (eOut.length >= limit) break;
    }
  }
  return { devices: dOut, endpoints: eOut };
}
