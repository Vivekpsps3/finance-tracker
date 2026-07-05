from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from admin_tools import admin_metrics, delete_user_account, execute_admin_sql, reset_user_contents
from auth import (
    audit_event,
    clear_session_cookie,
    create_session,
    create_user,
    get_current_admin,
    get_current_user,
    hash_password,
    normalize_email,
    public_user,
    utc_now_naive,
    revoke_user_sessions,
    verify_password,
)
from database import get_db
from models import User, UserRole, UserSession
from schemas_auth import (
    AdminPasswordReset,
    AdminSqlRequest,
    AdminUserContentReset,
    BootstrapRequest,
    BootstrapStatusResponse,
    AdminUserCreate,
    AdminUserUpdate,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    SelfDataResetRequest,
    SignupRequest,
    UserPublic,
)

router = APIRouter(tags=["auth"])


def _user_response(user: User) -> UserPublic:
    return UserPublic.model_validate(public_user(user))


@router.get("/auth/bootstrap-status", response_model=BootstrapStatusResponse)
def bootstrap_status(db: Session = Depends(get_db)):
    return {"needs_setup": db.query(User).count() == 0}


@router.post("/auth/bootstrap", response_model=LoginResponse)
def bootstrap_first_admin(body: BootstrapRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    if db.query(User).count() != 0:
        raise HTTPException(status_code=409, detail="Setup is already complete")
    user = create_user(
        db,
        email=body.email,
        display_name=body.display_name,
        password=body.password,
        role=UserRole.admin,
        must_change_password=False,
    )
    db.commit()
    db.refresh(user)
    csrf = create_session(db, user, request, response)
    db.refresh(user)
    return {"user": _user_response(user), "csrf_token": csrf}


@router.post("/auth/signup", response_model=LoginResponse)
def signup(body: SignupRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    if db.query(User).count() == 0:
        raise HTTPException(status_code=409, detail="Create the first admin account first")
    user = create_user(
        db,
        email=body.email,
        display_name=body.display_name,
        password=body.password,
        role=UserRole.user,
        must_change_password=False,
    )
    db.commit()
    db.refresh(user)
    csrf = create_session(db, user, request, response)
    db.refresh(user)
    return {"user": _user_response(user), "csrf_token": csrf}


@router.post("/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == normalize_email(body.email)).first()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    csrf = create_session(db, user, request, response)
    db.refresh(user)
    return {"user": _user_response(user), "csrf_token": csrf}


@router.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = request.cookies.get("finance_session")
    if token:
        from auth import _hash_secret

        session = db.query(UserSession).filter(UserSession.token_hash == _hash_secret(token)).first()
        if session and session.revoked_at is None:
            session.revoked_at = utc_now_naive()
    audit_event(db, "logout", actor_user_id=current_user.id, target_user_id=current_user.id)
    db.commit()
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/auth/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return {"user": _user_response(current_user), "csrf_token": None}


@router.post("/auth/change-password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    current_user.updated_at = utc_now_naive()
    revoke_user_sessions(db, current_user.id)
    audit_event(db, "password_changed", actor_user_id=current_user.id, target_user_id=current_user.id)
    db.commit()
    return {"ok": True}


@router.post("/auth/reset-data")
def reset_my_data(
    body: SelfDataResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.confirm != "CLEAR MY DATA":
        raise HTTPException(status_code=400, detail='Confirm with "CLEAR MY DATA" to reset your data')
    reset_user_contents(db, current_user, actor_user_id=current_user.id, revoke_sessions=False)
    db.commit()
    return {"ok": True}


@router.get("/admin/users", response_model=List[UserPublic])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    users = db.query(User).order_by(User.email.asc()).all()
    return [_user_response(user) for user in users]


@router.post("/admin/users", response_model=UserPublic)
def admin_create_user(
    body: AdminUserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user = create_user(
        db,
        email=body.email,
        display_name=body.display_name,
        password=body.password,
        role=UserRole(body.role),
        must_change_password=body.must_change_password,
        actor_user_id=admin.id,
    )
    db.commit()
    db.refresh(user)
    return _user_response(user)


def _role_value(role: UserRole | str) -> str:
    if hasattr(role, "value"):
        return role.value
    return str(role).split(".")[-1]


def _active_admin_count(db: Session, *, exclude_user_id: int | None = None) -> int:
    query = db.query(User).filter(User.is_active.is_(True))
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return sum(1 for user in query.all() if _role_value(user.role) == UserRole.admin.value)


def _ensure_not_last_admin(db: Session, target: User, new_role: str | None, new_active: bool | None) -> None:
    target_role = _role_value(target.role)
    target_is_active = bool(target.is_active)
    will_stop_being_active_admin = (
        target_role == UserRole.admin.value
        and target_is_active
        and (new_role == UserRole.user.value or new_active is False)
    )
    if will_stop_being_active_admin and _active_admin_count(db, exclude_user_id=target.id) == 0:
        raise HTTPException(status_code=400, detail="Cannot remove the final active admin")


@router.patch("/admin/users/{user_id}", response_model=UserPublic)
def admin_update_user(
    user_id: int,
    body: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id and body.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    _ensure_not_last_admin(db, target, body.role, body.is_active)
    if body.display_name is not None:
        target.display_name = body.display_name.strip()
    if body.role is not None:
        target.role = UserRole(body.role)
    if body.is_active is not None:
        target.is_active = body.is_active
        if not body.is_active:
            revoke_user_sessions(db, target.id)
    if body.must_change_password is not None:
        target.must_change_password = body.must_change_password
    target.updated_at = utc_now_naive()
    audit_event(db, "user_updated", actor_user_id=admin.id, target_user_id=target.id)
    db.commit()
    db.refresh(target)
    return _user_response(target)


@router.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    _ensure_not_last_admin(db, target, "user", False)
    delete_user_account(db, target, actor_user_id=admin.id)
    db.commit()
    return {"ok": True}


@router.post("/admin/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    body: AdminPasswordReset,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.password_hash = hash_password(body.new_password)
    target.must_change_password = body.must_change_password
    target.updated_at = utc_now_naive()
    revoke_user_sessions(db, target.id)
    audit_event(db, "password_reset", actor_user_id=admin.id, target_user_id=target.id)
    db.commit()
    return {"ok": True}


@router.post("/admin/users/{user_id}/reset-contents")
def admin_reset_user_contents(
    user_id: int,
    body: AdminUserContentReset,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    expected = f"RESET {target.email}"
    if body.confirm.strip() != expected:
        raise HTTPException(status_code=400, detail=f'Type "{expected}" to reset this user')
    reset_user_contents(db, target, actor_user_id=admin.id)
    db.commit()
    return {"ok": True}


@router.get("/admin/metrics")
def get_admin_metrics(db: Session = Depends(get_db), _: User = Depends(get_current_admin)):
    return admin_metrics(db)


@router.post("/admin/sql")
def run_admin_sql(body: AdminSqlRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = execute_admin_sql(db, body.sql)
    audit_event(db, "admin_sql", actor_user_id=admin.id, target_user_id=admin.id, detail=body.sql[:500])
    db.commit()
    return result
