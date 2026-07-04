import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from conftest import authenticated_client
from main import Base, app, engine, market_data
from models import UserRole


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    market_data.clear_memory_cache()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def test_health_is_public():
    client = TestClient(app)
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_finance_api_requires_login():
    client = TestClient(app)
    r = client.get("/api/transactions/")
    assert r.status_code == 401


def test_login_me_and_logout():
    client = authenticated_client(app, email="login@example.com")
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "login@example.com"

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200
    assert client.get("/api/transactions/").status_code == 401


def test_mutations_require_csrf_header():
    client = authenticated_client(app, email="csrf@example.com")
    client.headers.pop("X-CSRF-Token", None)
    r = client.post(
        "/api/transactions/",
        json={"date": "2026-01-01", "type": "income", "category": "Salary", "amount": 1},
    )
    assert r.status_code == 403


def test_admin_can_create_user_and_user_cannot_access_admin():
    admin = authenticated_client(app, email="admin@example.com", role=UserRole.admin)
    created = admin.post(
        "/api/admin/users",
        json={
            "email": "new@example.com",
            "display_name": "New User",
            "role": "user",
            "password": "new-user-password",
            "must_change_password": True,
        },
    )
    assert created.status_code == 200
    assert created.json()["email"] == "new@example.com"

    normal = authenticated_client(app, email="normal@example.com")
    assert normal.get("/api/admin/users").status_code == 403


def test_inactive_user_cannot_login():
    admin = authenticated_client(app, email="admin2@example.com", role=UserRole.admin)
    created = admin.post(
        "/api/admin/users",
        json={
            "email": "disabled@example.com",
            "display_name": "Disabled",
            "role": "user",
            "password": "disabled-password",
        },
    ).json()
    admin.patch(f"/api/admin/users/{created['id']}", json={"is_active": False})

    client = TestClient(app)
    r = client.post("/api/auth/login", json={"email": "disabled@example.com", "password": "disabled-password"})
    assert r.status_code == 401


def test_admin_can_delete_user_and_owned_data_is_removed():
    admin = authenticated_client(app, email="owner-admin@example.com", role=UserRole.admin)
    created = admin.post(
        "/api/admin/users",
        json={
            "email": "delete-me@example.com",
            "display_name": "Delete Me",
            "role": "user",
            "password": "delete-me-password",
            "must_change_password": False,
        },
    ).json()

    # Delete the created account after giving it data through its own session.
    login = TestClient(app)
    res = login.post("/api/auth/login", json={"email": "delete-me@example.com", "password": "delete-me-password"})
    assert res.status_code == 200
    login.headers.update({"X-CSRF-Token": res.json()["csrf_token"]})
    tx = login.post(
        "/api/transactions/",
        json={"date": "2026-01-01", "type": "income", "category": "Salary", "amount": 100},
    )
    assert tx.status_code == 200

    delete = admin.delete(f"/api/admin/users/{created['id']}")
    assert delete.status_code == 200
    assert all(u["email"] != "delete-me@example.com" for u in admin.get("/api/admin/users").json())

    db = next(__import__("database").get_db())
    try:
        from models import Transaction, User
        assert db.query(User).filter(User.email == "delete-me@example.com").first() is None
        assert db.query(Transaction).filter(Transaction.user_id == created["id"]).count() == 0
    finally:
        db.close()


def test_admin_cannot_delete_self_or_final_admin():
    admin = authenticated_client(app, email="solo-admin@example.com", role=UserRole.admin)
    me = admin.get("/api/auth/me").json()["user"]
    assert admin.delete(f"/api/admin/users/{me['id']}").status_code == 400

    second = admin.post(
        "/api/admin/users",
        json={
            "email": "second-admin@example.com",
            "display_name": "Second Admin",
            "role": "admin",
            "password": "second-admin-password",
        },
    ).json()
    assert admin.delete(f"/api/admin/users/{second['id']}").status_code == 200


def test_admin_can_delete_inactive_admin_when_another_admin_is_active():
    admin = authenticated_client(app, email="active-admin@example.com", role=UserRole.admin)
    inactive_admin = admin.post(
        "/api/admin/users",
        json={
            "email": "inactive-admin@example.com",
            "display_name": "Inactive Admin",
            "role": "admin",
            "password": "inactive-admin-password",
        },
    ).json()

    disable = admin.patch(f"/api/admin/users/{inactive_admin['id']}", json={"is_active": False})
    assert disable.status_code == 200

    delete = admin.delete(f"/api/admin/users/{inactive_admin['id']}")
    assert delete.status_code == 200
    assert all(u["email"] != "inactive-admin@example.com" for u in admin.get("/api/admin/users").json())


def test_public_signup_creates_normal_user_after_admin_exists():
    authenticated_client(app, email="setup-admin@example.com", role=UserRole.admin)
    client = TestClient(app)
    res = client.post(
        "/api/auth/signup",
        json={"email": "signup@example.com", "display_name": "Signup User", "password": "signup-password"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "signup@example.com"
    assert body["user"]["role"] == "user"
    assert client.get("/api/auth/me").status_code == 200


def test_signup_refuses_to_create_first_account():
    client = TestClient(app)
    res = client.post(
        "/api/auth/signup",
        json={"email": "first@example.com", "display_name": "First", "password": "first-password"},
    )
    assert res.status_code == 409
