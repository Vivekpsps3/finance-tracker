"""Smoke test: me-backend CSRF gate. Run with SQLITE_PATH=:memory: from apps/me/backend."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ["SQLITE_PATH"] = ":memory:"

import passwordless  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402
from app import app  # noqa: E402

passwordless.ensure_schema()
session = passwordless.create_user_and_session(
    "kiosk", "unused-key", {"kdf_salt_b64": "x", "kdf_iterations": 1, "wrapped_private_key_b64": "y"}
)
client = TestClient(app)
cookies = {passwordless.COOKIE: session["token"]}

# GET with session: no CSRF needed
r = client.get("/api/bootstrap", cookies=cookies)
assert r.status_code == 200, (r.status_code, r.text)

# GET without session: 401
assert client.get("/api/bootstrap").status_code == 401

# POST without CSRF header: 403
r = client.post("/api/auth/logout", cookies=cookies)
assert r.status_code == 403, (r.status_code, r.text)

# POST with wrong CSRF header: 403
r = client.post("/api/auth/logout", cookies=cookies, headers={"X-CSRF-Token": "nope"})
assert r.status_code == 403, (r.status_code, r.text)

# POST with correct CSRF header: passes the gate (whatever the handler returns, not 401/403)
r = client.post("/api/auth/logout", cookies=cookies, headers={"X-CSRF-Token": session["csrf"]})
assert r.status_code not in (401, 403), (r.status_code, r.text)

# Public auth endpoints stay CSRF-exempt
r = client.post("/api/auth/passwordless/lookup", json={"username": "ghost"})
assert r.status_code == 200, (r.status_code, r.text)

print("me-backend CSRF smoke test: all assertions passed")
