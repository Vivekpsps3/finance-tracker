from __future__ import annotations

import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from database import get_db
from models import AuditEvent, User, UserRole, UserSession

SESSION_COOKIE_NAME = "finance_session"
CSRF_COOKIE_NAME = "finance_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "7"))
COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "0").lower() in ("1", "true", "yes")
COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "lax")
_ph = PasswordHasher()


def utc_now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError):
        return False


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def audit_event(
    db: Session,
    event_type: str,
    *,
    actor_user_id: Optional[int] = None,
    target_user_id: Optional[int] = None,
    detail: Optional[str] = None,
) -> None:
    db.add(
        AuditEvent(
            event_type=event_type,
            actor_user_id=actor_user_id,
            target_user_id=target_user_id,
            detail=detail,
        )
    )


def public_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "is_active": user.is_active,
        "must_change_password": user.must_change_password,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "last_login_at": user.last_login_at,
    }


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def set_csrf_cookie(response: Response, csrf: str) -> None:
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


def create_session(db: Session, user: User, request: Request, response: Response) -> str:
    token = secrets.token_urlsafe(48)
    csrf = secrets.token_urlsafe(32)
    now = utc_now_naive()
    session = UserSession(
        user_id=user.id,
        token_hash=_hash_secret(token),
        csrf_token_hash=_hash_secret(csrf),
        created_at=now,
        expires_at=now + timedelta(days=SESSION_DAYS),
        last_seen_at=now,
        user_agent=request.headers.get("user-agent", "")[:500] or None,
        ip_address=request.client.host if request.client else None,
    )
    db.add(session)
    user.last_login_at = now
    audit_event(db, "login", actor_user_id=user.id, target_user_id=user.id)
    db.commit()
    set_session_cookie(response, token)
    set_csrf_cookie(response, csrf)
    return csrf


def _session_from_request(db: Session, request: Request) -> tuple[UserSession, User]:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required")
    session = db.query(UserSession).filter(UserSession.token_hash == _hash_secret(token)).first()
    now = utc_now_naive()
    if not session or session.revoked_at is not None or session.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive")
    session.last_seen_at = now
    return session, user


def require_csrf(request: Request, session: UserSession) -> None:
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    provided = request.headers.get(CSRF_HEADER_NAME)
    if not provided or not secrets.compare_digest(_hash_secret(provided), session.csrf_token_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    session, user = _session_from_request(db, request)
    require_csrf(request, session)
    return user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role != UserRole.admin.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def create_user(
    db: Session,
    *,
    email: str,
    display_name: str,
    password: str,
    role: UserRole = UserRole.user,
    must_change_password: bool = True,
    actor_user_id: Optional[int] = None,
) -> User:
    clean_email = normalize_email(email)
    if db.query(User).filter(User.email == clean_email).first():
        raise HTTPException(status_code=409, detail="Email already exists")
    user = User(
        email=clean_email,
        display_name=display_name.strip() or clean_email,
        role=role,
        password_hash=hash_password(password),
        is_active=True,
        must_change_password=must_change_password,
    )
    db.add(user)
    db.flush()
    audit_event(db, "user_created", actor_user_id=actor_user_id, target_user_id=user.id)
    return user


def revoke_user_sessions(db: Session, user_id: int, *, except_session_id: Optional[int] = None) -> None:
    now = utc_now_naive()
    query = db.query(UserSession).filter(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    if except_session_id is not None:
        query = query.filter(UserSession.id != except_session_id)
    query.update({UserSession.revoked_at: now}, synchronize_session=False)
