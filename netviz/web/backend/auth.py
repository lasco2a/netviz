"""Authentication helpers.

Validates credentials against Observium's `users` table. Observium stores
passwords using PHP's `password_hash()` (bcrypt, `$2y$` prefix).

A successful login mints a short signed JWT delivered as an HttpOnly cookie.
The token is stateless: no server-side session store. Logout simply clears
the cookie.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import bcrypt
import jwt

from netviz import db
from netviz.config import MIN_USER_LEVEL, SESSION_HOURS, SESSION_SECRET

COOKIE_NAME = "netviz_session"
JWT_ALGO = "HS256"


@dataclass(frozen=True)
class User:
    user_id: int
    username: str
    level: int


class AuthError(Exception):
    """Raised on login failure or invalid token."""


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def authenticate(username: str, password: str) -> User:
    row = db.fetch_one(
        "SELECT user_id, username, password, level, type "
        "FROM users WHERE username = %s",
        (username,),
    )
    if not row:
        raise AuthError("invalid credentials")
    if row.get("type") not in (None, "", "mysql"):
        # Don't try to validate LDAP/RADIUS users locally.
        raise AuthError("user is not a local Observium account")

    stored = row.get("password") or ""
    # PHP's password_hash() emits `$2y$...`; the `bcrypt` C library accepts
    # both `$2y$` and `$2b$` directly, so we hand the hash through unchanged.
    try:
        ok = bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
    except (ValueError, TypeError):
        ok = False
    if not ok:
        raise AuthError("invalid credentials")

    if row["level"] < MIN_USER_LEVEL:
        raise AuthError(
            f"user level {row['level']} is below required minimum {MIN_USER_LEVEL}"
        )

    return User(user_id=row["user_id"], username=row["username"], level=row["level"])


# ---------------------------------------------------------------------------
# JWT cookie
# ---------------------------------------------------------------------------

def issue_token(user: User) -> str:
    now = int(time.time())
    payload = {
        "sub": user.username,
        "uid": user.user_id,
        "lvl": user.level,
        "iat": now,
        "exp": now + SESSION_HOURS * 3600,
    }
    return jwt.encode(payload, SESSION_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> User:
    try:
        payload = jwt.decode(token, SESSION_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError as exc:
        raise AuthError(str(exc)) from exc
    return User(user_id=payload["uid"], username=payload["sub"], level=payload["lvl"])
