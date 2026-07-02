import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient

from app import create_app


def test_openapi_disabled_when_env_set(monkeypatch):
    monkeypatch.setenv("DISABLE_OPENAPI", "1")
    app = create_app()
    client = TestClient(app)
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/docs").status_code == 404