from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models import Membership

bearer = HTTPBearer(auto_error=False)


def issue_session(subject: str, merchant_id: str, role: str) -> str:
    cfg = get_settings()
    if len(cfg.session_signing_key) < 32:
        raise RuntimeError("SESSION_SIGNING_KEY must contain at least 32 characters")
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": subject, "merchant_id": merchant_id, "role": role,
                       "iat": now, "exp": now + timedelta(minutes=cfg.session_ttl_minutes)},
                      cfg.session_signing_key, algorithm="HS256")


def current_actor(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                  db: Session = Depends(get_db)):
    cfg = get_settings()
    if not credentials or len(cfg.session_signing_key) < 32:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        claims = jwt.decode(credentials.credentials, cfg.session_signing_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc
    subject, merchant_id = claims.get("sub"), claims.get("merchant_id")
    membership = db.scalar(select(Membership).where(Membership.subject == subject,
                                                    Membership.merchant_id == merchant_id))
    if not membership:
        raise HTTPException(status_code=403, detail="Merchant access denied")
    return {"subject": subject, "merchant_id": merchant_id, "role": membership.role}
