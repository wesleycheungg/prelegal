"""
Liveness, for the start scripts to poll.

The database is rebuilt during startup, before uvicorn begins accepting
connections, so a reply here already implies the schema is in place and there is
nothing further worth checking.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
