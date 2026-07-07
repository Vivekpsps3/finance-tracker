from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from services.encrypted_storage import is_user_migrated


def require_legacy_finance_access(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Block plaintext finance endpoints once a user has completed migration."""
    if is_user_migrated(db, current_user.id):
        raise HTTPException(
            status_code=410,
            detail="Legacy plaintext finance API disabled for this user. Use /api/vault encrypted records.",
        )
    return current_user
