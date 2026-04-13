"""
FastAPI dependency injection functions.

Provides:
  - get_db()           → SQLAlchemy session (auto-closed)
  - get_current_user() → Authenticated user from JWT token
  - require_role()     → Role-based access control
"""

from typing import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from core.database import SessionLocal
from core.security import decode_access_token

# Lazy import to avoid circular imports — resolved at runtime
_User = None

def _get_user_model():
    global _User
    if _User is None:
        from models.user import User
        _User = User
    return _User


# ── Database Session ──────────────────────────────────────────────────
def get_db() -> Generator[Session, None, None]:
    """Yield a database session, auto-closed after request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── JWT Bearer Scheme ─────────────────────────────────────────────────
security_scheme = HTTPBearer(auto_error=False)


# ── Current User ──────────────────────────────────────────────────────
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Extract and validate the current user from the JWT Bearer token.

    Raises 401 if:
      - No token provided
      - Token is invalid or expired
      - User not found in database
      - User is deactivated
    """
    User = _get_user_model()

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    return user


# ── Role-Based Access Control ─────────────────────────────────────────
def require_role(*allowed_roles: str):
    """
    Factory that returns a dependency function checking the user's role.

    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_role("admin"))])
        async def admin_endpoint(): ...

        Or as a parameter:
        def my_endpoint(user = Depends(require_role("admin"))):
            ...
    """
    def role_checker(current_user=Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(allowed_roles)}",
            )
        return current_user
    return role_checker
