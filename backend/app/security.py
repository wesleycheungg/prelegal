"""
Password hashing and session tokens.

Sessions are JSON Web Tokens carried in an HttpOnly cookie: the server keeps no
session table, so signing in is a single insert-free operation and signing out
is just clearing the cookie. The trade is that a token cannot be revoked before
it expires — acceptable while every user it could name is discarded on the next
restart, and worth revisiting once accounts outlive the process.

`bcrypt` is called directly rather than through `passlib`, which is unmaintained
and raises `AttributeError` against bcrypt 4.1 and later.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

ALGORITHM = "HS256"

# bcrypt truncates silently at 72 bytes, so a longer password would be accepted
# at signup and then match any other password sharing its first 72 bytes.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """
    Check a password, returning False rather than raising on a malformed hash.

    A stored hash that bcrypt cannot parse means a corrupt row, not a correct
    password, and a sign-in attempt should not become a 500 either way.
    """
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_session_token(user_id: int, secret_key: str, max_age_seconds: int) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + timedelta(seconds=max_age_seconds),
        },
        secret_key,
        algorithm=ALGORITHM,
    )


def read_session_token(token: str, secret_key: str) -> int | None:
    """
    The user id a token names, or None if it is expired, forged or malformed.

    Every failure is the same answer on purpose: the caller's only useful
    response to any of them is to ask the user to sign in again.
    """
    try:
        claims: dict[str, Any] = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
        return int(claims["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        return None
