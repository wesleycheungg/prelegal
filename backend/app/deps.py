"""
The dependencies routes share: settings, a database connection, and the
signed-in user.

`get_current_user` is the seam every future authenticated route hangs off — the
saved documents and chat history in the roadmap need exactly this and nothing
more.
"""

import sqlite3
from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status

from app import db
from app.config import Settings, get_settings
from app.security import read_session_token

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_connection(settings: SettingsDep) -> Iterator[sqlite3.Connection]:
    yield from db.session(settings.database_path)


ConnectionDep = Annotated[sqlite3.Connection, Depends(get_connection)]


def get_current_user(
    request: Request, settings: SettingsDep, connection: ConnectionDep
) -> dict[str, Any]:
    """
    The signed-in user, or a 401.

    A token naming a user who no longer exists is treated as no token at all,
    which is the normal case here rather than an exotic one: the database is
    rebuilt on every start while the cookie in the browser outlives it.
    """
    unauthenticated = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in"
    )

    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise unauthenticated

    user_id = read_session_token(token, settings.secret_key)
    if user_id is None:
        raise unauthenticated

    user = db.find_user_by_id(connection, user_id)
    if user is None:
        raise unauthenticated

    return user


CurrentUserDep = Annotated[dict[str, Any], Depends(get_current_user)]
