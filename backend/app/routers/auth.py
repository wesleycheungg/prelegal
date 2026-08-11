"""
Sign up, sign in, sign out, and who am I.

There is no interface for any of this yet, and this ticket adds none: the point
is that the account a saved agreement will hang off already exists, and that the
database is exercised by something real rather than merely created.

The session cookie is HttpOnly, so the token is unreadable from JavaScript, and
SameSite=Lax, so it does not ride along on cross-site requests.
"""

import sqlite3
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field, field_validator

from app import db
from app.deps import ConnectionDep, CurrentUserDep, SettingsDep
from app.security import (
    ABSENT_USER_HASH,
    MAX_PASSWORD_BYTES,
    create_session_token,
    hash_password,
    is_hashable_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    email: EmailStr
    # A floor, not a policy. The ceiling is checked below instead of with
    # `max_length`, which counts characters.
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def within_bcrypt_limit(cls, password: str) -> str:
        """
        Reject a password bcrypt would refuse, so it is a 422 and not a 500.

        The limit is in bytes, and `max_length` counts characters: 72 emoji pass
        a character check and are 288 bytes.
        """
        if not is_hashable_password(password):
            raise ValueError(
                f"Password must be at most {MAX_PASSWORD_BYTES} bytes; "
                "accented and non-Latin characters take more than one each."
            )
        return password


class UserPublic(BaseModel):
    """A user as the API describes them, which never includes the hash."""

    id: int
    email: str
    created_at: str


def _start_session(
    response: Response, user: dict[str, Any], settings: SettingsDep
) -> None:
    token = create_session_token(
        user["id"], settings.secret_key, settings.session_max_age_seconds
    )
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )


@router.post("/signup", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def signup(
    credentials: Credentials,
    response: Response,
    connection: ConnectionDep,
    settings: SettingsDep,
) -> dict[str, Any]:
    """Register, and sign in as the new user."""
    try:
        user = db.create_user(
            connection, credentials.email, hash_password(credentials.password)
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email is already registered",
        ) from exc

    _start_session(response, user, settings)
    return user


@router.post("/signin", response_model=UserPublic)
def signin(
    credentials: Credentials,
    response: Response,
    connection: ConnectionDep,
    settings: SettingsDep,
) -> dict[str, Any]:
    user = db.find_user_by_email(connection, credentials.email)

    # One message for an unknown address and for a wrong password, so the reply
    # cannot be used to find out which addresses are registered. The hash is
    # checked even when there is no user, so the time taken cannot either.
    correct = verify_password(
        credentials.password,
        user["password_hash"] if user else ABSENT_USER_HASH,
    )

    if user is None or not correct:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    _start_session(response, user, settings)
    return user


@router.post("/signout", status_code=status.HTTP_204_NO_CONTENT)
def signout(response: Response, settings: SettingsDep) -> None:
    """
    Clear the session cookie.

    Deliberately succeeds when nobody is signed in: the caller wants to end up
    signed out, and they already are.
    """
    response.delete_cookie(settings.session_cookie_name, path="/")


@router.get("/me", response_model=UserPublic)
def me(user: CurrentUserDep) -> dict[str, Any]:
    return user
