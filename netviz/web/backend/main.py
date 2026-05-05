"""FastAPI application: auth + gated snapshot files + SPA static hosting."""

from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from netviz.config import HOST, PORT, REPO_ROOT, SESSION_HOURS, SNAPSHOT_DIR
from netviz.web.backend import admin, auth, search as search_mod
from netviz import db

app = FastAPI(title="netviz", version="0.1.0", docs_url=None, redoc_url=None)

FRONTEND_DIST = REPO_ROOT / "web" / "frontend" / "dist"


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def current_user(request: Request) -> auth.User:
    token = request.cookies.get(auth.COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    try:
        return auth.decode_token(token)
    except auth.AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.post("/api/login")
async def login(request: Request, response: Response) -> dict:
    body = await request.json()
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username or not password:
        raise HTTPException(status_code=400, detail="username and password required")
    try:
        user = auth.authenticate(username, password)
    except auth.AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    token = auth.issue_token(user)
    response.set_cookie(
        key=auth.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_HOURS * 3600,
        path="/",
    )
    return {"username": user.username, "level": user.level}


@app.post("/api/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/me")
def me(user: auth.User = Depends(current_user)) -> dict:
    return {"username": user.username, "level": user.level}


# ---------------------------------------------------------------------------
# Snapshot files (gated)
# ---------------------------------------------------------------------------

def _safe_snapshot_path(rel: str) -> Path:
    """Resolve `rel` under SNAPSHOT_DIR, refusing path-escape attempts."""
    base = SNAPSHOT_DIR.resolve()
    target = (base / rel).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid path") from exc
    if not target.is_file():
        raise HTTPException(status_code=404, detail="not found")
    return target


@app.get("/snapshot.json")
def snapshot(_: auth.User = Depends(current_user)) -> FileResponse:
    return FileResponse(_safe_snapshot_path("snapshot.json"), media_type="application/json")


@app.get("/device/{device_id}.json")
def device(device_id: int, _: auth.User = Depends(current_user)) -> FileResponse:
    return FileResponse(
        _safe_snapshot_path(f"device/{device_id}.json"),
        media_type="application/json",
    )


# ---------------------------------------------------------------------------
# Search + config + admin
# ---------------------------------------------------------------------------

def _load_snapshot_cached() -> dict:
    """Read snapshot.json. Cheap; caching is left to the OS page cache."""
    p = SNAPSHOT_DIR / "snapshot.json"
    if not p.is_file():
        raise HTTPException(status_code=503, detail="snapshot not yet generated")
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/search")
def api_search(q: str = "", limit: int = 500, _: auth.User = Depends(current_user)) -> dict:
    if not q.strip():
        return {"devices": [], "endpoints": []}
    snap = _load_snapshot_cached()
    return search_mod.search(
        q,
        snap.get("devices", []),
        snap.get("endpoints", []),
        limit=max(1, min(limit, 5000)),
    )


@app.get("/api/config")
def api_config(_: auth.User = Depends(current_user)) -> dict:
    """Surface env + last-snapshot info for the UI (Help/Admin modals)."""
    try:
        snap = _load_snapshot_cached()
        meta = snap.get("meta", {})
    except HTTPException:
        meta = {}
    return {
        "dns": {
            "enabled": os.environ.get("NETVIZ_DNS_ENABLED", "true").lower()
            not in ("0", "false", "no", "off"),
            "ttl_days": int(os.environ.get("NETVIZ_DNS_CACHE_TTL_DAYS", "7")),
        },
        "snapshot": {
            "generated_at": meta.get("generated_at"),
            "device_count": meta.get("device_count", 0),
            "edge_count": meta.get("edge_count", 0),
            "endpoint_count": meta.get("endpoint_count", 0),
            "endpoint_resolved": meta.get("endpoint_resolved", 0),
        },
    }


def _require_admin(user: auth.User = Depends(current_user)) -> auth.User:
    if (user.level or 0) < 10:
        raise HTTPException(status_code=403, detail="admin required")
    return user


@app.post("/api/admin/refresh")
async def api_admin_refresh(
    request: Request, _: auth.User = Depends(_require_admin)
) -> dict:
    body = await request.json() if await request.body() else {}
    kind = body.get("kind", "exporter")
    if kind not in ("exporter", "dns"):
        raise HTTPException(status_code=400, detail="kind must be 'exporter' or 'dns'")
    dns_force = bool(body.get("dns_force", False))
    try:
        job = admin.start_refresh(kind, dns_force=dns_force)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True, "kind": job.kind, "started_at": int(job.started_at)}


@app.get("/api/admin/refresh/status")
def api_admin_refresh_status(_: auth.User = Depends(_require_admin)) -> dict:
    return admin.status()


@app.get("/api/admin/sql")
def api_admin_sql(_: auth.User = Depends(_require_admin)) -> dict:
    """Return the last 100 SQL queries executed by the web backend."""
    return {
        "entries": [
            {
                "ts": e.ts,
                "sql": e.sql,
                "params": e.params,
                "duration_ms": e.duration_ms,
                "rows": e.rows,
            }
            for e in db.get_sql_log()
        ]
    }


# ---------------------------------------------------------------------------
# Static frontend (only if a build exists)
# ---------------------------------------------------------------------------

class SpaStaticFiles(StaticFiles):
    """Serve a single-page app: fall back to index.html for client-side routes."""

    async def get_response(self, path: str, scope):  # type: ignore[override]
        # Never serve index.html for backend routes.
        if path.startswith(("api/", "snapshot.json", "device/")):
            raise StarletteHTTPException(status_code=404)
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise
        if getattr(response, "status_code", 200) == 404:
            return await super().get_response("index.html", scope)
        return response


if FRONTEND_DIST.exists():
    app.mount("/", SpaStaticFiles(directory=FRONTEND_DIST, html=True), name="spa")
else:
    @app.get("/")
    def _placeholder() -> JSONResponse:
        return JSONResponse(
            {
                "ok": True,
                "service": "netviz",
                "note": "Frontend not yet built. Run `npm run build` in web/frontend.",
            }
        )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run() -> None:
    import uvicorn
    uvicorn.run(
        "netviz.web.backend.main:app",
        host=HOST,
        port=PORT,
        log_level="info",
    )


if __name__ == "__main__":
    run()
