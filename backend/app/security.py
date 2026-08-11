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

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

ALGORITHM = "HS256"

# bcrypt refuses a password longer than this, counted in UTF-8 bytes rather than
# characters — 72 emoji are 288 bytes. Callers must reject an over-long password
# themselves; reaching `hash_password` with one is a 500.
MAX_PASSWORD_BYTES = 72


def is_hashable_password(password: str) -> bool:
    """Whether bcrypt will accept this password rather than raising."""
    return len(password.encode()) <= MAX_PASSWORD_BYTES


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """
    Check a password, returning False rather than raising.

    A stored hash bcrypt cannot parse means a corrupt row, and a password too
    long for bcrypt cannot be the one that was stored. Neither is a correct
    password, and neither should turn a sign-in attempt into a 500.
    """
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


# Compared against when no user matches, so that sign-in takes about as long
# whether or not the address is registered. Without it, the fast path gives away
# which addresses exist, however carefully the replies are kept identical.
ABSENT_USER_HASH = hash_password(secrets.token_urlsafe(16))


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
