"""Thin DB helpers around mysql-connector-python.

The exporter creates a single connection per run; the web backend uses a tiny
pool. We keep this module deliberately small \u2014 no ORM.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator, Sequence

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
