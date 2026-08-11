"""The check the start scripts poll before reporting the server ready."""

from fastapi.testclient import TestClient


def test_reports_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
