from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from db import open_db

PROTOCOL = "vault-auth-v1"
CHALLENGE_TTL = timedelta(minutes=5)
SESSION_DAYS = 30
COOKIE = "me_session"
CSRF_COOKIE = "me_csrf"

SCHEMA = """
CREATE TABLE IF NOT EXISTS auth_users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  public_key_b64 TEXT NOT NULL,
  kdf_salt_b64 TEXT NOT NULL,
  kdf_iterations INTEGER NOT NULL,
  wrapped_private_key_b64 TEXT NOT NULL,
  recovery_wrapped_private_key_b64 TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  csrf TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  challenge_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);
"""


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def ensure_schema() -> None:
    open_db().executescript(SCHEMA)
    open_db().commit()


def origin(request) -> str:
    return request.headers.get("origin") or str(request.base_url).rstrip("/")


def find_user(username: str):
    key = username.strip().lower()
    return open_db().execute("SELECT * FROM auth_users WHERE username = ?", (key,)).fetchone()


def user_count() -> int:
    row = open_db().execute("SELECT COUNT(*) AS n FROM auth_users").fetchone()
    return int(row["n"])


def decoy_wrap() -> dict:
    def wrapped() -> str:
        return base64.b64encode(secrets.token_bytes(48)).decode()

    return {
        "auth": {
            "kdf_salt_b64": base64.b64encode(secrets.token_bytes(16)).decode(),
            "kdf_iterations": 310000,
            "wrapped_private_key_b64": wrapped(),
            "recovery_wrapped_private_key_b64": "",
        }
    }


def lookup(username: str) -> dict:
    user = find_user(username)
    if not user:
        return decoy_wrap()
    return {
        "auth": {
            "kdf_salt_b64": user["kdf_salt_b64"],
            "kdf_iterations": user["kdf_iterations"],
            "wrapped_private_key_b64": user["wrapped_private_key_b64"],
            "recovery_wrapped_private_key_b64": user["recovery_wrapped_private_key_b64"] or "",
        }
    }


def issue_challenge(username: str, origin_value: str) -> dict:
    user = find_user(username)
    expires_at = _now() + CHALLENGE_TTL
    message = "\n".join([PROTOCOL, origin_value, expires_at.isoformat()])
    if not user:
        return {
            "challenge_id": secrets.token_urlsafe(24),
            "challenge": secrets.token_urlsafe(32),
            "message": message,
            "expires_at": expires_at.isoformat(),
        }
    raw = secrets.token_urlsafe(32)
    cid = secrets.token_urlsafe(24)
    db = open_db()
    db.execute(
        "INSERT INTO auth_challenges (challenge_id, user_id, challenge_hash, expires_at, consumed) VALUES (?,?,?,?,0)",
        (cid, user["id"], _hash(raw), expires_at.isoformat()),
    )
    db.commit()
    return {"challenge_id": cid, "challenge": raw, "message": message, "expires_at": expires_at.isoformat()}


def _verify_sig(public_key_b64: str, message: str, signature_b64: str) -> bool:
    try:
        public_key = serialization.load_der_public_key(base64.b64decode(public_key_b64, validate=True))
        if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(public_key.curve, ec.SECP256R1):
            return False
        signature = base64.b64decode(signature_b64, validate=True)
        if len(signature) != 64:
            return False
        public_key.verify(
            encode_dss_signature(int.from_bytes(signature[:32], "big"), int.from_bytes(signature[32:], "big")),
            message.encode(),
            ec.ECDSA(hashes.SHA256()),
        )
        return True
    except (ValueError, InvalidSignature):
        return False


def verify(username: str, challenge_id: str, raw: str, message: str, signature_b64: str) -> dict | None:
    user = find_user(username)
    if not user:
        return None
    db = open_db()
    row = db.execute("SELECT * FROM auth_challenges WHERE challenge_id = ?", (challenge_id,)).fetchone()
    if (
        not row
        or row["user_id"] != user["id"]
        or row["consumed"]
        or datetime.fromisoformat(row["expires_at"]) < _now()
        or not hmac.compare_digest(row["challenge_hash"], _hash(raw))
    ):
        return None
    if not _verify_sig(user["public_key_b64"], message, signature_b64):
        return None
    db.execute("UPDATE auth_challenges SET consumed = 1 WHERE challenge_id = ?", (challenge_id,))
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    expires = _now() + timedelta(days=SESSION_DAYS)
    db.execute(
        "INSERT INTO auth_sessions (token_hash, user_id, expires_at, csrf) VALUES (?,?,?,?)",
        (_hash(token), user["id"], expires.isoformat(), csrf),
    )
    db.commit()
    return {"token": token, "csrf": csrf, "username": user["username"]}


def bootstrap(username: str, public_key_b64: str, wrap: dict) -> dict | None:
    if user_count():
        return None
    return create_user_and_session(username, public_key_b64, wrap)


def create_user_and_session(username: str, public_key_b64: str, wrap: dict) -> dict:
    db = open_db()
    db.execute(
        """INSERT INTO auth_users
           (username, public_key_b64, kdf_salt_b64, kdf_iterations, wrapped_private_key_b64, recovery_wrapped_private_key_b64)
           VALUES (?,?,?,?,?,?)""",
        (
            username.strip().lower(),
            public_key_b64,
            wrap["kdf_salt_b64"],
            int(wrap["kdf_iterations"]),
            wrap["wrapped_private_key_b64"],
            wrap.get("recovery_wrapped_private_key_b64") or "",
        ),
    )
    db.commit()
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    expires = _now() + timedelta(days=SESSION_DAYS)
    user = find_user(username)
    db.execute(
        "INSERT INTO auth_sessions (token_hash, user_id, expires_at, csrf) VALUES (?,?,?,?)",
        (_hash(token), user["id"], expires.isoformat(), csrf),
    )
    db.commit()
    return {"token": token, "csrf": csrf, "username": user["username"]}


def session_user(token: str | None):
    if not token:
        return None
    row = open_db().execute(
        "SELECT auth_users.*, auth_sessions.csrf, auth_sessions.expires_at FROM auth_sessions JOIN auth_users ON auth_users.id = auth_sessions.user_id WHERE token_hash = ?",
        (_hash(token),),
    ).fetchone()
    if not row or datetime.fromisoformat(row["expires_at"]) < _now():
        return None
    return row


def logout(token: str | None) -> None:
    if not token:
        return
    open_db().execute("DELETE FROM auth_sessions WHERE token_hash = ?", (_hash(token),))
    open_db().commit()


def set_cookies(response, session: dict) -> None:
    secure = os.environ.get("ORIGIN", "").startswith("https")
    max_age = SESSION_DAYS * 24 * 60 * 60
    response.set_cookie(COOKIE, session["token"], httponly=True, samesite="lax", secure=secure, max_age=max_age, path="/")
    response.set_cookie(CSRF_COOKIE, session["csrf"], httponly=False, samesite="lax", secure=secure, max_age=max_age, path="/")


def clear_cookies(response) -> None:
    response.delete_cookie(COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
