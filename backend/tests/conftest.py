import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
# Exercise legacy finance routers in regression tests. Production/docker leave this unset (410).
os.environ.setdefault("ALLOW_LEGACY_FINANCE", "1")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from auth import create_user
from database import SQLALCHEMY_DATABASE_URL, SessionLocal
from models import UserRole

if ":memory:" not in SQLALCHEMY_DATABASE_URL:
    raise RuntimeError(f"Tests must not run against a file database: {SQLALCHEMY_DATABASE_URL}")

TEST_PASSWORD = "correct-horse-battery-staple"


def seed_user(email: str = "user@example.com", role: UserRole = UserRole.user):
    db = SessionLocal()
    try:
        user = create_user(
            db,
            email=email,
            display_name=email.split("@")[0].title(),
            password=TEST_PASSWORD,
            role=role,
            must_change_password=False,
        )
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def authenticated_client(app, email: str = "user@example.com", role: UserRole = UserRole.user) -> TestClient:
    seed_user(email=email, role=role)
    client = TestClient(app)
    res = client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert res.status_code == 200, res.text
    client.headers.update({"X-CSRF-Token": res.json()["csrf_token"]})
    return client
