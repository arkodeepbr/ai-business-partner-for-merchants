from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.models import Membership, User

bearer = HTTPBearer(auto_error=False)


def issue_access_token(user_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "iss": settings.jwt_issuer,
                       "iat": now, "exp": now + timedelta(minutes=settings.access_token_minutes)},
                      settings.jwt_secret.get_secret_value(), algorithm="HS256")


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(401, "authentication_required")
    settings = get_settings()
    try:
        claims = jwt.decode(credentials.credentials, settings.jwt_secret.get_secret_value(),
                            algorithms=["HS256"], issuer=settings.jwt_issuer)
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "invalid_or_expired_token") from exc
    user = db.get(User, claims.get("sub"))
    if not user or not user.active:
        raise HTTPException(401, "user_inactive")
    return user


def require_membership(organization_id: str, db: Session, user: User) -> Membership:
    membership = db.scalar(select(Membership).where(
        Membership.organization_id == organization_id, Membership.user_id == user.id))
    if not membership:
        # Do not reveal whether another tenant's identifier exists.
        raise HTTPException(404, "merchant_not_found")
    return membership
