import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from auth import create_user
from database import SessionLocal
from models import UserRole

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
