from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.assistant import AssistantProviderError, generate_grounded_answer
from app.auth import current_user, require_membership, issue_access_token
from app.core.config import get_settings
from app.db import get_db, engine
from app.models import Organization, PaymentTransaction, Settlement, User
from app.schemas import AuthSessionRequest, AuthSessionResponse, ConversationRequest, ConversationResponse, SalesSummary, TransactionRead
from app.analytics import sales_summary

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Paytm Saathi API", version="1.0.0", openapi_url="/api/v1/openapi.json",
              docs_url="/api/v1/docs", redoc_url=None, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])


@app.post("/api/v1/auth/session", response_model=AuthSessionResponse, tags=["authentication"])
async def create_session(body: AuthSessionRequest, db: Session = Depends(get_db)):
    """Exchange a verified Supabase access token for this API's short-lived token."""
    if not settings.supabase_url or not settings.supabase_anon_key.get_secret_value():
        raise HTTPException(503, "identity_provider_not_configured")

    def verify_token():
        request = Request(f"{settings.supabase_url.rstrip('/')}/auth/v1/user", headers={
            "apikey": settings.supabase_anon_key.get_secret_value(),
            "Authorization": f"Bearer {body.access_token}",
        })
        try:
            with urlopen(request, timeout=8) as response:
                return json.loads(response.read())
        except HTTPError as exc:
            if exc.code in (400, 401, 403):
                raise HTTPException(401, "invalid_identity_session") from exc
            raise HTTPException(503, "identity_provider_unavailable") from exc
        except (URLError, TimeoutError) as exc:
            raise HTTPException(503, "identity_provider_unavailable") from exc

    identity = await run_in_threadpool(verify_token)
    email = identity.get("email") if identity.get("email_confirmed_at") else None
    phone = identity.get("phone") if identity.get("phone_confirmed_at") else None
    if not email and not phone:
        raise HTTPException(403, "verified_email_or_phone_required")
    supabase_id = identity.get("id")
    if not supabase_id:
        raise HTTPException(401, "invalid_identity_session")

    user = db.scalar(select(User).where(User.supabase_user_id == supabase_id))
    if not user:
        # Verified contact ownership allows returning users to link their existing profile.
        matches = []
        if email:
            matches.extend(db.scalars(select(User).where(User.email == email)).all())
        if phone:
            matches.extend(db.scalars(select(User).where(User.phone_e164 == phone)).all())
        unique_matches = {match.id: match for match in matches}
        if len(unique_matches) > 1:
            raise HTTPException(409, "identity_contacts_match_different_accounts")
        user = next(iter(unique_matches.values()), None)
        if not user:
            user = User()
            db.add(user)
        user.supabase_user_id = supabase_id
    if email:
        user.email = email
    if phone:
        user.phone_e164 = phone
    metadata = identity.get("user_metadata") or {}
    user.full_name = metadata.get("full_name") or metadata.get("name") or user.full_name
    db.commit()
    return AuthSessionResponse(access_token=issue_access_token(user.id), expires_in=settings.access_token_minutes * 60)


@app.get("/health/live", tags=["operations"])
def live():
    return {"status": "ok"}


@app.get("/health/ready", tags=["operations"])
def ready(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(503, "database_unavailable") from exc
    return {"status": "ready", "provider_mode": settings.provider_mode}


@app.get("/api/v1/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.models import Membership
    memberships = db.scalars(select(Membership).where(Membership.user_id == user.id)).all()
    return {"user_id": user.id, "organizations": [{"id": m.organization_id, "role": m.role} for m in memberships]}


@app.get("/api/v1/organizations/{organization_id}/analytics/sales", response_model=SalesSummary)
def get_sales(organization_id: str, from_at: datetime = Query(...), to_at: datetime = Query(...),
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_membership(organization_id, db, user)
    if from_at >= to_at:
        raise HTTPException(422, "invalid_time_window")
    try:
        return sales_summary(db, organization_id, from_at, to_at)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/v1/organizations/{organization_id}/transactions", response_model=list[TransactionRead])
def list_transactions(organization_id: str, limit: int = Query(default=50, ge=1, le=100),
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_membership(organization_id, db, user)
    return db.scalars(select(PaymentTransaction).where(
        PaymentTransaction.organization_id == organization_id).order_by(
            PaymentTransaction.occurred_at.desc()).limit(limit)).all()


@app.post("/api/v1/organizations/{organization_id}/assistant", response_model=ConversationResponse)
def assistant(organization_id: str, body: ConversationRequest, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    require_membership(organization_id, db, user)
    if not settings.assistant_configured:
        return ConversationResponse(
            answer="Saathi's AI provider is not configured yet. No business figures were inferred.",
            evidence={"organization_id": organization_id, "reason": "assistant_provider_not_configured"},
        )
    if organization_id not in settings.ai_data_consent_organization_ids:
        return ConversationResponse(
            answer="AI sharing is not enabled for this merchant. No business data was sent to the AI provider.",
            evidence={"organization_id": organization_id, "reason": "assistant_data_consent_required"},
        )

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=7)
    try:
        sales = sales_summary(db, organization_id, start, now)
    except ValueError:
        sales = {"available": False, "reason": "mixed_currency_window"}
    settlements = db.scalars(select(Settlement).where(
        Settlement.organization_id == organization_id,
        Settlement.status.in_(["pending", "processing", "initiated"]),
    ).order_by(Settlement.expected_at.asc()).limit(20)).all()
    facts = {
        "organization_id": organization_id,
        "data_window_utc": {"from": start.isoformat(), "to": now.isoformat()},
        "sales_last_7_days": sales,
        "pending_settlements": [
            {
                "amount_minor": item.amount_minor,
                "currency": item.currency,
                "status": item.status,
                "expected_at": item.expected_at.isoformat() if item.expected_at else None,
            }
            for item in settlements
        ],
        "unavailable_domains": ["inventory", "customers", "lending", "tax", "campaigns", "purchase_orders"],
        "action_execution": "disabled; no external actions can be submitted from this assistant",
    }
    try:
        answer = generate_grounded_answer(body.question, facts, settings)
    except AssistantProviderError as exc:
        reason = str(exc)
        return ConversationResponse(
            answer="I couldn't get a safe answer from the AI provider. Please try again later; no action was taken.",
            evidence={"organization_id": organization_id, "reason": reason},
        )
    return ConversationResponse(
        answer=answer,
        evidence={"organization_id": organization_id, "sources": ["authorized_payment_transactions", "authorized_settlements"],
                  "window_start": start.isoformat(), "window_end": now.isoformat(),
                  "unavailable_domains": facts["unavailable_domains"], "read_only": True},
        grounded=True,
    )
