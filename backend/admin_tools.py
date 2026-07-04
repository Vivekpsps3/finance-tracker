from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from models import (
    Asset,
    AuditEvent,
    BankAccount,
    BrokerageAccount,
    Holding,
    ImportBatch,
    Liability,
    NetWorthSnapshot,
    PlanningAssumptionProfile,
    TaxDocument,
    Transaction,
    User,
    UserSession,
)

USER_OWNED_MODELS = [
    Transaction,
    BankAccount,
    ImportBatch,
    Asset,
    Liability,
    Holding,
    BrokerageAccount,
    NetWorthSnapshot,
    TaxDocument,
    PlanningAssumptionProfile,
]

BLOCKED_SQL_TOKENS = {
    "attach",
    "detach",
    "pragma",
    "vacuum",
    "reindex",
    "load_extension",
}


def admin_metrics(db: Session) -> dict[str, Any]:
    users = db.query(User).all()
    active_users = sum(1 for u in users if u.is_active)
    admins = sum(1 for u in users if (u.role.value if hasattr(u.role, "value") else str(u.role)) == "admin")
    totals = {
        "users": len(users),
        "active_users": active_users,
        "admins": admins,
        "sessions": db.query(UserSession).count(),
        "active_sessions": db.query(UserSession).filter(UserSession.revoked_at.is_(None)).count(),
        "audit_events": db.query(AuditEvent).count(),
    }
    finance_rows = {model.__tablename__: db.query(model).count() for model in USER_OWNED_MODELS}
    per_user = []
    for user in users:
        row = {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "is_active": user.is_active,
        }
        row.update({model.__tablename__: db.query(model).filter(model.user_id == user.id).count() for model in USER_OWNED_MODELS})
        per_user.append(row)
    inspector = inspect(db.bind)
    tables = []
    for table in inspector.get_table_names():
        try:
            count = db.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
        except Exception:
            count = None
        tables.append({"name": table, "rows": count})
    return {"totals": totals, "finance_rows": finance_rows, "per_user": per_user, "tables": tables}


def execute_admin_sql(db: Session, sql: str) -> dict[str, Any]:
    statement = sql.strip()
    if not statement:
        raise HTTPException(status_code=400, detail="SQL is required")
    if "\x00" in statement:
        raise HTTPException(status_code=400, detail="Invalid SQL")
    lowered = statement.lower()
    first = lowered.split(None, 1)[0] if lowered.split(None, 1) else ""
    if first in BLOCKED_SQL_TOKENS or any(token in lowered for token in ("load_extension", "sqlite_master")):
        raise HTTPException(status_code=400, detail="That SQL statement is not allowed")
    result = db.execute(text(statement))
    if result.returns_rows:
        rows = result.mappings().fetchmany(200)
        return {"columns": list(result.keys()), "rows": [dict(row) for row in rows], "row_count": len(rows), "truncated": len(rows) == 200}
    db.commit()
    return {"columns": [], "rows": [], "row_count": result.rowcount if result.rowcount is not None else 0, "truncated": False}


def delete_user_account(db: Session, user: User, *, actor_user_id: int) -> None:
    for model in USER_OWNED_MODELS:
        db.query(model).filter(model.user_id == user.id).delete(synchronize_session=False)
    db.query(UserSession).filter(UserSession.user_id == user.id).delete(synchronize_session=False)
    db.query(AuditEvent).filter(AuditEvent.actor_user_id == user.id).update(
        {AuditEvent.actor_user_id: None}, synchronize_session=False
    )
    db.query(AuditEvent).filter(AuditEvent.target_user_id == user.id).update(
        {AuditEvent.target_user_id: None}, synchronize_session=False
    )
    audit = AuditEvent(
        actor_user_id=actor_user_id,
        target_user_id=None,
        event_type="user_deleted",
        detail=f"deleted_user_email={user.email}",
    )
    db.add(audit)
    db.delete(user)
