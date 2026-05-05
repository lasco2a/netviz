"""Thin DB helpers around mysql-connector-python.

The exporter creates a single connection per run; the web backend uses a tiny
pool. We keep this module deliberately small — no ORM.
"""

from __future__ import annotations

import time
from collections import deque
from contextlib import contextmanager
from typing import Any, Iterator, NamedTuple, Sequence

import mysql.connector
from mysql.connector.pooling import MySQLConnectionPool

from netviz.config import DB

_POOL: MySQLConnectionPool | None = None


def _pool() -> MySQLConnectionPool:
    global _POOL
    if _POOL is None:
        _POOL = MySQLConnectionPool(
            pool_name="netviz",
            pool_size=4,
            host=DB.host,
            port=DB.port,
            user=DB.user,
            password=DB.password,
            database=DB.database,
            charset="utf8mb4",
            use_unicode=True,
            autocommit=True,
        )
    return _POOL


@contextmanager
def connection() -> Iterator[Any]:
    """Yield a pooled connection, returning it on exit."""
    conn = _pool().get_connection()
    try:
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# SQL query log (in-memory, last 100 entries, thread-safe via deque)
# ---------------------------------------------------------------------------

class SqlEntry(NamedTuple):
    ts: float          # wall-clock time (time.time())
    sql: str           # query string
    params: str        # repr of bound params
    duration_ms: float # execution + fetch time
    rows: int          # rows returned (-1 for fetch_one with no result)


_SQL_LOG: deque[SqlEntry] = deque(maxlen=100)


def get_sql_log() -> list[SqlEntry]:
    """Return a snapshot of the recent query log (newest last)."""
    return list(_SQL_LOG)


def _log(sql: str, params: Sequence[Any] | None, t0: float, rows: int) -> None:
    _SQL_LOG.append(SqlEntry(
        ts=time.time(),
        sql=sql.strip(),
        params=repr(params) if params else "",
        duration_ms=round((time.monotonic() - t0) * 1000, 1),
        rows=rows,
    ))


def fetch_all(sql: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    with connection() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            t0 = time.monotonic()
            cur.execute(sql, params or ())
            result = cur.fetchall()
            _log(sql, params, t0, len(result))
            return result
        finally:
            cur.close()


def fetch_one(sql: str, params: Sequence[Any] | None = None) -> dict[str, Any] | None:
    with connection() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            t0 = time.monotonic()
            cur.execute(sql, params or ())
            result = cur.fetchone()
            _log(sql, params, t0, 1 if result is not None else 0)
            return result
        finally:
            cur.close()


def direct_connection() -> Any:
    """Open a raw (non-pooled) connection. Used by the exporter for a single run."""
    return mysql.connector.connect(
        host=DB.host,
        port=DB.port,
        user=DB.user,
        password=DB.password,
        database=DB.database,
        charset="utf8mb4",
        use_unicode=True,
    )
    return _POOL


@contextmanager
def connection() -> Iterator[Any]:
    """Yield a pooled connection, returning it on exit."""
    conn = _pool().get_connection()
    try:
        yield conn
    finally:
        conn.close()


def fetch_all(sql: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    with connection() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute(sql, params or ())
            return cur.fetchall()
        finally:
            cur.close()


def fetch_one(sql: str, params: Sequence[Any] | None = None) -> dict[str, Any] | None:
    with connection() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute(sql, params or ())
            return cur.fetchone()
        finally:
            cur.close()


def direct_connection() -> Any:
    """Open a raw (non-pooled) connection. Used by the exporter for a single run."""
    return mysql.connector.connect(
        host=DB.host,
        port=DB.port,
        user=DB.user,
        password=DB.password,
        database=DB.database,
        charset="utf8mb4",
        use_unicode=True,
    )
