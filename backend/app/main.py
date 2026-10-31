import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import secrets
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.assistant import AssistantProviderError, generate_conversational_answer, generate_grounded_answer
from app.auth import current_user, require_membership, issue_access_token
from app.core.config import get_settings
from app.db import SessionLocal, get_db, engine
from app.models import Organization, PaymentTransaction, Settlement, TelegramLink, User, UserWorkspaceData
from app.schemas import AssistantChatRequest, AuthSessionRequest, AuthSessionResponse, ConversationRequest, ConversationResponse, FinanceRecordsResponse, FinanceRecordsUpdate, SalesSummary, TelegramIntegrationStatus, TelegramLinkCodeResponse, TransactionRead, WorkspaceDataResponse, WorkspaceDataUpdate
from app.analytics import sales_summary
from app.telegram_bot import process_telegram_update, send_telegram_message, start_telegram_worker

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    worker = None
    try:
        worker = await start_telegram_worker()
    except Exception:
        # A Telegram outage must not prevent the regular merchant API from starting.
        settings_for_log = get_settings()
        if settings_for_log.telegram_bot_token.get_secret_value():
            import logging
            logging.getLogger(__name__).exception("Telegram bot could not start")
    try:
        yield
    finally:
        if worker:
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass


app = FastAPI(title="Paytm Saathi API", version="1.0.0", openapi_url="/api/v1/openapi.json",
              docs_url="/api/v1/docs", redoc_url=None, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])


@app.post("/api/v1/auth/session", response_model=AuthSessionResponse, tags=["authentication"])
async def create_session(body: AuthSessionRequest, db: Session = Depends(get_db)):
    """Exchange a verified Supabase access token for this API's short-lived token."""
    if not settings.supabase_url or not settings.supabase_anon_key.get_secret_value():
        raise HTTPException(503, "identity_provider_not_configured")

    def verify_token():
        request = UrlRequest(f"{settings.supabase_url.rstrip('/')}/auth/v1/user", headers={
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


@app.get("/api/v1/me/workspace", response_model=WorkspaceDataResponse)
def get_workspace_data(user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace = db.get(UserWorkspaceData, user.id)
    if not workspace:
        return WorkspaceDataResponse(assistant_messages=[], preferred_locale="en", preferred_theme="light")
    return WorkspaceDataResponse(assistant_messages=workspace.assistant_messages, preferred_locale=workspace.preferred_locale, preferred_theme=workspace.preferred_theme)


@app.patch("/api/v1/me/workspace", response_model=WorkspaceDataResponse)
def update_workspace_data(body: WorkspaceDataUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not body.model_fields_set:
        raise HTTPException(422, "workspace_update_required")
    workspace = db.get(UserWorkspaceData, user.id)
    if not workspace:
        workspace = UserWorkspaceData(user_id=user.id)
        db.add(workspace)
    if "assistant_messages" in body.model_fields_set and body.assistant_messages is not None:
        workspace.assistant_messages = [message.model_dump() for message in body.assistant_messages]
    if body.preferred_locale is not None:
        workspace.preferred_locale = body.preferred_locale
    if body.preferred_theme is not None:
        workspace.preferred_theme = body.preferred_theme
    db.commit()
    db.refresh(workspace)
    return WorkspaceDataResponse(assistant_messages=workspace.assistant_messages, preferred_locale=workspace.preferred_locale, preferred_theme=workspace.preferred_theme)


@app.get("/api/v1/me/finance", response_model=FinanceRecordsResponse)
def get_finance_records(user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace = db.get(UserWorkspaceData, user.id)
    return FinanceRecordsResponse(records=workspace.finance_records if workspace else [])


@app.put("/api/v1/me/finance", response_model=FinanceRecordsResponse)
def save_finance_records(body: FinanceRecordsUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace = db.get(UserWorkspaceData, user.id)
    if not workspace:
        workspace = UserWorkspaceData(user_id=user.id)
        db.add(workspace)
    workspace.finance_records = [record.model_dump(mode="json") for record in body.records]
    db.commit()
    db.refresh(workspace)
    return FinanceRecordsResponse(records=workspace.finance_records)


@app.get("/api/v1/me/integrations/telegram", response_model=TelegramIntegrationStatus)
def telegram_status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    link = db.get(TelegramLink, user.id)
    configured = bool(settings.telegram_bot_token.get_secret_value())
    return TelegramIntegrationStatus(
        configured=configured,
        linked=bool(link and link.telegram_user_id and link.telegram_chat_id),
        bot_username=settings.telegram_bot_username.strip().removeprefix("@") or None,
        transport="webhook" if settings.telegram_webhook_url else "polling" if configured else None,
    )


@app.post("/api/v1/me/integrations/telegram/link-code", response_model=TelegramLinkCodeResponse)
def create_telegram_link_code(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not settings.telegram_bot_token.get_secret_value():
        raise HTTPException(503, "telegram_bot_not_configured")
    link = db.get(TelegramLink, user.id)
    if link and link.telegram_user_id:
        raise HTTPException(409, "telegram_already_linked")
    code = secrets.token_hex(5).upper()
    if not link:
        link = TelegramLink(user_id=user.id)
        db.add(link)
    link.link_code_hash = hashlib.sha256(code.encode()).hexdigest()
    link.link_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()
    username = settings.telegram_bot_username.strip().removeprefix("@") or None
    return TelegramLinkCodeResponse(
        code=code,
        expires_in_seconds=600,
        bot_username=username,
        start_link=f"https://t.me/{username}?start=link_{code}" if username else None,
    )


@app.delete("/api/v1/me/integrations/telegram")
def unlink_telegram(user: User = Depends(current_user), db: Session = Depends(get_db)):
    link = db.get(TelegramLink, user.id)
    if link:
        db.delete(link)
        db.commit()
    return {"linked": False}


@app.post("/api/v1/integrations/telegram/webhook", include_in_schema=False)
async def telegram_webhook(request: Request, x_telegram_bot_api_secret_token: str | None = Header(default=None)):
    secret = settings.telegram_webhook_secret.get_secret_value()
    if not settings.telegram_webhook_url or not secret or not secrets.compare_digest(secret, x_telegram_bot_api_secret_token or ""):
        raise HTTPException(403, "telegram_webhook_invalid")
    try:
        update = await request.json()
    except Exception as exc:
        raise HTTPException(400, "telegram_update_invalid") from exc
    with SessionLocal() as db:
        reply = await run_in_threadpool(process_telegram_update, update, db)
    if reply:
        await run_in_threadpool(send_telegram_message, *reply)
    return {"ok": True}


@app.post("/api/v1/assistant/chat", response_model=ConversationResponse)
async def assistant_chat(body: AssistantChatRequest, user: User = Depends(current_user)):
    if not settings.assistant_configured:
        return ConversationResponse(answer="I’m Saathi, your business partner. I can reply in English, Hindi, or Kannada. My AI connection is not set up yet, so I can’t create a fresh chat answer. Add your Sarvam API key to the backend settings to enable conversation. Your merchant data remains private.", evidence={"reason": "assistant_provider_not_configured"})
    messages = [{"role": item.role, "content": item.content} for item in body.messages]
    try:
        answer = await run_in_threadpool(generate_conversational_answer, messages, user.full_name or "Merchant", body.locale, settings)
    except AssistantProviderError as exc:
        reason = str(exc)
        answer = "Sorry, I can’t reach my AI service right now. Please try again shortly."
        return ConversationResponse(answer=answer, evidence={"reason": reason})
    return ConversationResponse(answer=answer, evidence={"mode": "conversational"})


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
