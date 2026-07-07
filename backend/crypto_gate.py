from __future__ import annotations

import os

from fastapi import Depends, HTTPException

from auth import get_current_user
from models import User


def require_legacy_finance_access(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Plaintext finance HTTP APIs are retired for real deployments.

    Set ALLOW_LEGACY_FINANCE=1 only for backend regression tests that still
    exercise the old service layer through routers. The Angular app always uses
    /api/vault after unlock.
    """
    if os.getenv("ALLOW_LEGACY_FINANCE", "").lower() in ("1", "true", "yes"):
        return current_user
    raise HTTPException(
        status_code=410,
        detail="Legacy plaintext finance API disabled. Use /api/vault encrypted records.",
    )
