"""Search query parser + matcher (Python side).

Mirrors ``web/frontend/src/lib/search.ts`` exactly. Both implementations are
verified against ``tests/search_cases.json`` so adding a feature here means
also updating the TS twin and the fixtures.

Token grammar (whitespace-separated, AND-combined):

    text:           plain substring, case-insensitive
    ipv4:           ``A.B.C.D``
    ipv4-cidr:      ``A.B.C.D/N`` where 0 <= N <= 32
    ipv4-range:     ``A.B.C.D-A.B.C.D`` or shorthand ``A.B.C.D-N`` (last octet)
    ipv6:           any string containing ``:`` and parseable by ``ipaddress``
    ipv6-cidr:      ``addr/N``
    mac:            12 hex chars with optional ``:``/``-`` separators

A device matches when *every* token matches at least one of:
  hostname, sysName, ip, type, os, location, port-MAC (TBD; ports not in
  snapshot). An endpoint matches when every token matches at least one of:
  ip, mac, hostname.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from typing import Any, Iterable

_MAC_HEX = re.compile(r"^[0-9a-f]{6,12}$")


@dataclass(frozen=True)
class Token:
    raw: str
    kind: str  # "text" | "ip" | "cidr" | "range" | "mac"
    # populated based on kind
    text: str | None = None
    ip_int: int | None = None
    ip_version: int | None = None
    cidr_net: ipaddress._BaseNetwork | None = None
    range_start: int | None = None
    range_end: int | None = None
    mac_hex: str | None = None


def _normalise_mac(raw: str) -> str:
    return "".join(ch for ch in raw if ch.isalnum()).lower()


def _parse_ipv4(s: str) -> int | None:
    try:
        return int(ipaddress.IPv4Address(s))
    except (ipaddress.AddressValueError, ValueError):
        return None


def _parse_token(raw: str) -> Token:
    s = raw.strip()
    if not s:
        return Token(raw=raw, kind="text", text="")

    # CIDR (v4 or v6)
    if "/" in s:
        try:
            net = ipaddress.ip_network(s, strict=False)
            return Token(raw=raw, kind="cidr", cidr_net=net)
        except ValueError:
            pass

    # IPv4 range: full or shorthand. Must contain a dot to disambiguate from MAC.
    if "-" in s and "." in s:
        left, _, right = s.partition("-")
        a = _parse_ipv4(left)
        if a is not None:
            b: int | None
            if "." in right:
                b = _parse_ipv4(right)
            else:
                try:
                    last = int(right)
                except ValueError:
                    last = -1
                if 0 <= last <= 255:
                    head = ".".join(left.split(".")[:3])
                    b = _parse_ipv4(f"{head}.{last}")
                else:
                    b = None
            if b is not None and a <= b:
                return Token(raw=raw, kind="range", range_start=a, range_end=b)

    # IPv4 exact
    if "." in s:
        v4 = _parse_ipv4(s)
        if v4 is not None:
            return Token(raw=raw, kind="ip", ip_int=v4, ip_version=4)

    # IPv6 exact
    if ":" in s:
        try:
            addr = ipaddress.IPv6Address(s)
            return Token(raw=raw, kind="ip", ip_int=int(addr), ip_version=6)
        except (ipaddress.AddressValueError, ValueError):
            pass

    # MAC: separator-form (``:`` or ``-``) or pure hex 6..12 chars (substring).
    hexed = _normalise_mac(s)
    if hexed and re.fullmatch(r"[0-9a-f]+", hexed):
        had_sep = ":" in s or "-" in s
        if had_sep and 6 <= len(hexed) <= 12:
            return Token(raw=raw, kind="mac", mac_hex=hexed)
        if not had_sep and 6 <= len(hexed) <= 12 and not s.isdigit():
            return Token(raw=raw, kind="mac", mac_hex=hexed)

    return Token(raw=raw, kind="text", text=s.lower())


_QUOTED = re.compile(r'"([^"]*)"|(\S+)')


def parse_query(q: str) -> list[Token]:
    """Tokenise. Double-quoted phrases stay together as a single text token."""
    out: list[Token] = []
    for m in _QUOTED.finditer(q):
        quoted, bare = m.group(1), m.group(2)
        if quoted is not None:
            t = quoted.strip()
            if t:
                out.append(Token(raw=quoted, kind="text", text=t.lower()))
        elif bare:
            out.append(_parse_token(bare))
    return out


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def _device_text_haystack(d: dict[str, Any]) -> str:
    parts = [
        d.get("hostname"),
        d.get("sysName"),
        d.get("ip"),
        d.get("type"),
        d.get("role"),
        d.get("os"),
        d.get("location"),
        d.get("vendor"),
        d.get("hardware"),
    ]
    return " ".join(str(p) for p in parts if p).lower()


def _ip_to_int(ip: str | None) -> tuple[int | None, int | None]:
    if not ip:
        return None, None
    try:
        addr = ipaddress.ip_address(ip)
        return int(addr), addr.version
    except ValueError:
        return None, None


def _token_matches_ip(tok: Token, ip_int: int | None, ip_version: int | None) -> bool:
    if ip_int is None:
        return False
    if tok.kind == "ip":
        return tok.ip_int == ip_int and tok.ip_version == ip_version
    if tok.kind == "cidr":
        net = tok.cidr_net
        if net is None or net.version != ip_version:
            return False
        return int(net.network_address) <= ip_int <= int(net.broadcast_address)
    if tok.kind == "range":
        if ip_version != 4:
            return False
        return tok.range_start <= ip_int <= tok.range_end  # type: ignore[operator]
    return False


def _token_matches_device(tok: Token, d: dict[str, Any], hay: str) -> bool:
    if tok.kind == "text":
        return bool(tok.text) and tok.text in hay
    if tok.kind in ("ip", "cidr", "range"):
        ip_int, v = _ip_to_int(d.get("ip"))
        return _token_matches_ip(tok, ip_int, v)
    if tok.kind == "mac":
        # devices don't carry a top-level mac in the snapshot; skip.
        return False
    return False


def _token_matches_endpoint(tok: Token, e: dict[str, Any]) -> bool:
    if tok.kind == "text":
        if not tok.text:
            return False
        host = (e.get("hostname") or "").lower()
        return tok.text in host
    if tok.kind in ("ip", "cidr", "range"):
        ip_int, v = _ip_to_int(e.get("ip"))
        return _token_matches_ip(tok, ip_int, v)
    if tok.kind == "mac":
        mac = _normalise_mac(e.get("mac") or "")
        return bool(tok.mac_hex) and tok.mac_hex in mac
    return False


def search(
    q: str,
    devices: Iterable[dict[str, Any]],
    endpoints: Iterable[dict[str, Any]],
    *,
    limit: int = 500,
) -> dict[str, list[int]]:
    tokens = parse_query(q)
    if not tokens:
        return {"devices": [], "endpoints": []}

    matched_devices: list[int] = []
    for d in devices:
        hay = _device_text_haystack(d)
        if all(_token_matches_device(t, d, hay) for t in tokens):
            matched_devices.append(d["device_id"])
            if len(matched_devices) >= limit:
                break

    matched_endpoints: list[int] = []
    for e in endpoints:
        if all(_token_matches_endpoint(t, e) for t in tokens):
            matched_endpoints.append(e["id"])
            if len(matched_endpoints) >= limit:
                break

    return {"devices": matched_devices, "endpoints": matched_endpoints}
