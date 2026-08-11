"""
The database under simultaneous requests.

`TestClient` sends one request at a time, so the rest of the suite cannot see
this class of failure: a connection opened on one worker thread and used on
another. That is not exotic — it is what happens as soon as two people use the
server at once, and it took a real server under load to find it the first time.

These tests drive a real uvicorn on a real port for that reason.
"""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.config import REPO_ROOT

BACKEND_DIR = REPO_ROOT / "backend"


def _free_port() -> int:
    """A port the operating system is not currently using."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


@pytest.fixture(scope="module")
def server(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """A real server on its own port, with its own database."""
    port = _free_port()
    workspace = tmp_path_factory.mktemp("concurrency")

    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port)],
        cwd=BACKEND_DIR,
        env={
            **os.environ,
            "DATABASE_PATH": str(workspace / "test.db"),
            "SECRET_KEY": "a-secret-key-long-enough-for-sha256",
            # Nothing is built during a test run, so the API serves itself.
            "STATIC_DIR": str(workspace / "no-frontend-build"),
        },
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    base_url = f"http://127.0.0.1:{port}"
    try:
        _wait_until_healthy(process, base_url)
        yield base_url
    finally:
        process.terminate()
        process.wait(timeout=10)


def _wait_until_healthy(process: subprocess.Popen[bytes], base_url: str) -> None:
    for _ in range(100):
        if process.poll() is not None:
            output = process.stdout.read().decode() if process.stdout else ""
            raise RuntimeError(f"The server exited before starting:\n{output}")
        try:
            urllib.request.urlopen(f"{base_url}/api/health", timeout=1).read()
            return
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(0.1)

    raise RuntimeError("The server did not start in time")


def _post(base_url: str, path: str, body: dict[str, str]) -> int:
    """The status of a POST, whether or not it was an error."""
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return int(response.status)
    except urllib.error.HTTPError as error:
        return int(error.code)


def _in_parallel(count: int, workers: int, call: object) -> Counter[int]:
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return Counter(pool.map(call, range(count)))  # type: ignore[arg-type]


def test_simultaneous_requests_do_not_fail(server: str) -> None:
    # Every one of these signs in to an account that does not exist, so 401 is
    # the right answer for all of them. A 500 means the database broke rather
    # than the credentials being wrong.
    codes = _in_parallel(
        200,
        32,
        lambda index: _post(
            server,
            "/api/auth/signin",
            {"email": f"nobody{index}@example.com", "password": "a-password"},
        ),
    )

    assert codes == Counter({401: 200})


def test_simultaneous_signups_all_succeed(server: str) -> None:
    codes = _in_parallel(
        50,
        16,
        lambda index: _post(
            server,
            "/api/auth/signup",
            {"email": f"user{index}@example.com", "password": "a-password"},
        ),
    )

    assert codes == Counter({201: 50})


def test_the_same_email_can_only_be_registered_once(server: str) -> None:
    # The insert enforces this, not a lookup beforehand, so two simultaneous
    # signups cannot both pass a check and then collide.
    codes = _in_parallel(
        8,
        8,
        lambda _: _post(
            server,
            "/api/auth/signup",
            {"email": "contested@example.com", "password": "a-password"},
        ),
    )

    assert codes[201] == 1
    assert codes[409] == 7
