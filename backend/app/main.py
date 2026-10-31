import json
import re
from functools import lru_cache
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, func, select
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import jwt

from app.auth import current_actor, issue_session
from app.analytics import summarize_transactions
from app.core.config import get_settings
from app.core.db import Base, engine, get_db
from app.core.time import utc_aware
from app.models import ActionProposal, AuditEvent, Campaign, Conversation, Customer, Merchant, Membership, Message, Product, PurchaseOrder, Receivable, Settlement, Transaction
from app.routes import (cashflow_forecast, peak_hours, period_comparison,
                        router as business_router, tax_summary)
from app.schemas import (ActionCreate, ActionOut, AssistantRequest, AssistantResponse, MerchantCreate,
                         MerchantOut, PendingReceivableDraft, ProductCreate, ProductOut, SalesSummary)

cfg = get_settings()


@lru_cache(maxsize=1)
def google_jwks_client():
    return jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", cache_keys=True)


@asynccontextmanager
async def lifespan(_app):
    if cfg.app_env == "production" and len(cfg.session_signing_key) < 32:
        raise RuntimeError("Production requires SESSION_SIGNING_KEY (32+ characters)")
    if cfg.app_env == "development":
        Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Merchant Business Partner API", version="0.1.0", openapi_url=None,
              docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=cfg.origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])
api = FastAPI(openapi_url="/openapi.json", docs_url="/docs", redoc_url=None)
app.mount("/api/v1", api)
api.include_router(business_router)


@api.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok", "environment": cfg.app_env}


@api.post("/merchants", response_model=MerchantOut, status_code=201)
def create_merchant(body: MerchantCreate, db: Session = Depends(get_db)):
    # Bootstrap provisioning is disabled in production. Production identity/OTP must be connected first.
    if cfg.app_env == "production":
        raise HTTPException(503, "Merchant provisioning requires the configured identity provider")
    merchant = Merchant(name=body.name, tier=body.tier)
    db.add(merchant)
    db.flush()
    subject = "local-owner"
    db.add(Membership(merchant_id=merchant.id, subject=subject, role="owner"))
    db.commit()
    db.refresh(merchant)
    return merchant


class GoogleSignInRequest(BaseModel):
    id_token: str = Field(min_length=1, max_length=8192)


class DeleteAccountRequest(BaseModel):
    confirm: Literal[True]


@api.post("/auth/google")
def google_sign_in(body: GoogleSignInRequest, db: Session = Depends(get_db)):
    if not cfg.google_oauth_client_id:
        raise HTTPException(503, "Google sign-in is not configured on the backend")
    try:
        signing_key = google_jwks_client().get_signing_key_from_jwt(body.id_token).key
    except Exception as exc:
        raise HTTPException(503, "Google identity could not be verified right now") from exc
    try:
        claims = jwt.decode(body.id_token, signing_key, algorithms=["RS256"],
                            audience=cfg.google_oauth_client_id,
                            issuer=["accounts.google.com", "https://accounts.google.com"])
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Google identity token is invalid or expired") from exc
    subject = claims.get("sub")
    email = claims.get("email")
    if not subject or not email or claims.get("email_verified") is not True:
        raise HTTPException(401, "Use a Google account with a verified email address")
    identity = f"google:{subject}"
    membership = db.scalar(select(Membership).where(Membership.subject == identity))
    if membership:
        merchant = db.get(Merchant, membership.merchant_id)
        if merchant is None:
            raise HTTPException(403, "Merchant account is unavailable")
    else:
        display_name = str(claims.get("name") or email.split("@", 1)[0])[:180]
        merchant = Merchant(name=display_name)
        db.add(merchant)
        db.flush()
        membership = Membership(merchant_id=merchant.id, subject=identity, role="owner")
        db.add(membership)
        db.commit()
        db.refresh(merchant)
    try:
        token = issue_session(identity, merchant.id, membership.role)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"access_token": token, "token_type": "bearer",
            "expires_in": cfg.session_ttl_minutes * 60, "merchant_id": merchant.id,
            "merchant_name": merchant.name}


@api.post("/auth/local-session")
def local_session(merchant_id: str, db: Session = Depends(get_db)):
    if cfg.app_env == "production":
        raise HTTPException(404, "Not found")
    membership = db.scalar(select(Membership).where(Membership.merchant_id == merchant_id,
                                                   Membership.subject == "local-owner"))
    if not membership:
        raise HTTPException(404, "Merchant not found")
    try:
        token = issue_session("local-owner", merchant_id, membership.role)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"access_token": token, "token_type": "bearer", "expires_in": cfg.session_ttl_minutes * 60,
            "environment": "local-development"}


@api.get("/me")
def me(actor=Depends(current_actor)):
    return actor


@api.delete("/account")
def delete_account(body: DeleteAccountRequest, actor=Depends(current_actor), db: Session = Depends(get_db)):
    """Permanently remove the owner's merchant workspace and its business records."""
    if actor["role"] != "owner":
        raise HTTPException(403, "Only the merchant account owner can delete this workspace")

    merchant_id = actor["merchant_id"]
    merchant = db.get(Merchant, merchant_id)
    if merchant is None:
        raise HTTPException(404, "Merchant account not found")

    # Messages have no merchant_id of their own, so remove them through the
    # merchant's conversations before deleting the merchant-scoped tables.
    conversation_ids = select(Conversation.id).where(Conversation.merchant_id == merchant_id)
    db.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))

    # Delete child tables first (e.g. movements before products and staff before
    # stores). Explicit deletion also works with SQLite, where FK cascades may
    # not be enabled by the local development database connection.
    try:
        for table in reversed(Base.metadata.sorted_tables):
            if table.name != "merchants" and "merchant_id" in table.c:
                db.execute(delete(table).where(table.c.merchant_id == merchant_id))
        db.execute(delete(Merchant).where(Merchant.id == merchant_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"deleted": True}


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2500)
    voice_id: str | None = Field(default=None, max_length=128)


@api.get("/assistant/voices")
def assistant_voices(actor=Depends(current_actor)):
    if not cfg.elevenlabs_api_key:
        raise HTTPException(503, "ElevenLabs is not configured on the backend")
    from app.providers import get_elevenlabs_voices
    try:
        voices, default_voice_id = get_elevenlabs_voices()
    except RuntimeError as exc:
        raise HTTPException(502, "Could not load ElevenLabs voices. Check backend configuration and account access.") from exc
    return {"voices": voices, "default_voice_id": default_voice_id}


@api.post("/assistant/speech")
def assistant_speech(body: SpeechRequest, actor=Depends(current_actor)):
    if not cfg.elevenlabs_api_key:
        raise HTTPException(503, "ElevenLabs is not configured on the backend")
    from app.providers import generate_elevenlabs_speech
    try:
        audio = generate_elevenlabs_speech(body.text, body.voice_id)
    except RuntimeError as exc:
        status = 422 if str(exc).startswith("Select a voice") else 502
        message = str(exc) if status == 422 else "ElevenLabs could not generate speech. Check account access and usage quota."
        raise HTTPException(status, message) from exc
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@api.get("/dashboard/sales", response_model=SalesSummary)
def sales_summary(days: int = Query(default=1, ge=1, le=365), actor=Depends(current_actor), db: Session = Depends(get_db)):
    start = datetime.now(timezone.utc) - timedelta(days=days)
    mid = actor["merchant_id"]
    txs = db.scalars(select(Transaction).where(Transaction.merchant_id == mid, Transaction.occurred_at >= start)).all()
    total, successful_count, refunds = summarize_transactions((t.amount, t.status) for t in txs)
    pending = db.scalar(select(func.coalesce(func.sum(Settlement.amount), 0)).where(
        Settlement.merchant_id == mid, Settlement.status == "pending")) or Decimal("0.00")
    return SalesSummary(currency="INR", collection_total=total, successful_transactions=successful_count,
                        refunds_total=refunds, pending_settlements=pending, source="merchant-import and provider records",
                        as_of=datetime.now(timezone.utc), data_available=bool(txs))


@api.get("/dashboard/briefing")
def dashboard_briefing(language: Literal["en", "hi"] = Query(default="en"),
                       actor=Depends(current_actor), db: Session = Depends(get_db)):
    """Build a daily, read-only summary from this merchant's recorded data."""
    local_now = datetime.now(ZoneInfo("Asia/Kolkata"))
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = local_start.astimezone(timezone.utc)
    end = (local_start + timedelta(days=1)).astimezone(timezone.utc)
    previous_start = start - timedelta(days=1)
    merchant_id = actor["merchant_id"]
    rows = db.scalars(select(Transaction).where(
        Transaction.merchant_id == merchant_id,
        Transaction.occurred_at >= previous_start,
        Transaction.occurred_at < end,
    )).all()
    today_rows = [row for row in rows if utc_aware(row.occurred_at) >= start]
    prior_rows = [row for row in rows if utc_aware(row.occurred_at) < start]
    collected, successful_count, refunds = summarize_transactions(
        (row.amount, row.status) for row in today_rows
    )
    prior_collected, _, _ = summarize_transactions((row.amount, row.status) for row in prior_rows)
    change_percent = None if prior_collected == 0 else (
        (collected - prior_collected) / prior_collected * Decimal("100")
    ).quantize(Decimal("0.01"))
    low_stock = db.scalars(select(Product).where(
        Product.merchant_id == merchant_id,
        Product.active.is_(True),
        Product.quantity <= Product.reorder_level,
    ).order_by(Product.name).limit(20)).all()
    pending = db.scalars(select(Settlement).where(
        Settlement.merchant_id == merchant_id,
        Settlement.status == "pending",
    )).all()
    utc_now = datetime.now(timezone.utc)
    expected_soon = [row for row in pending if row.expected_at is not None
                     and utc_now <= utc_aware(row.expected_at) <= utc_now + timedelta(hours=24)]
    expected_total = sum((row.amount for row in expected_soon), Decimal("0.00"))

    insights: list[dict[str, str]] = []
    if successful_count:
        insights.append({
            "kind": "collections",
            "text": (f"आज अभी तक ₹{collected} के {successful_count} सफल पेमेंट दर्ज हुए।"
                     if language == "hi" else
                     f"₹{collected} has been collected across {successful_count} successful payments today."),
        })
    else:
        insights.append({
            "kind": "collections",
            "text": ("आज के लिए जुड़े हुए रिकॉर्ड में कोई सफल पेमेंट नहीं दिखा।"
                     if language == "hi" else
                     "No successful payments are recorded for today yet."),
        })
    if change_percent is not None:
        direction = "बढ़ा" if change_percent >= 0 else "घटा"
        insights.append({
            "kind": "comparison",
            "text": (f"पिछले दिन की समान अवधि से कलेक्शन {abs(change_percent)}% {direction}।"
                     if language == "hi" else
                     f"Collections are {abs(change_percent)}% {'up' if change_percent >= 0 else 'down'} versus yesterday."),
        })
    if refunds:
        insights.append({
            "kind": "refunds",
            "text": (f"आज ₹{refunds} के रिफंड दर्ज हुए।" if language == "hi"
                     else f"₹{refunds} in refunds are recorded today."),
        })
    if low_stock:
        names = ", ".join(item.name for item in low_stock[:4])
        more = len(low_stock) - 4
        if more > 0:
            names += f" +{more}"
        insights.append({
            "kind": "stock",
            "text": (f"कम स्टॉक दर्ज है: {names}। ऑर्डर से पहले मात्रा जाँचें।"
                     if language == "hi" else
                     f"Low stock is recorded for {names}. Check quantities before ordering."),
        })
    if expected_soon:
        insights.append({
            "kind": "settlements",
            "text": (f"अगले 24 घंटों में ₹{expected_total} के {len(expected_soon)} सेटलमेंट अपेक्षित हैं; तारीख बदल सकती है।"
                     if language == "hi" else
                     f"₹{expected_total} across {len(expected_soon)} settlements is expected within 24 hours; dates can change."),
        })
    return {
        "language": language,
        "timezone": "Asia/Kolkata",
        "as_of": local_now.isoformat(),
        "data_available": bool(rows or low_stock or pending),
        "collections": str(collected),
        "successful_transactions": successful_count,
        "refunds": str(refunds),
        "change_vs_yesterday_percent": str(change_percent) if change_percent is not None else None,
        "insights": insights,
        "source": "merchant payment, settlement and inventory records",
        "collections_are_not_profit": True,
    }


@api.get("/transactions")
def transactions(limit: int = Query(default=50, ge=1, le=200), actor=Depends(current_actor), db: Session = Depends(get_db)):
    rows = db.scalars(select(Transaction).where(Transaction.merchant_id == actor["merchant_id"])
                      .order_by(Transaction.occurred_at.desc()).limit(limit)).all()
    return [{"id": r.id, "external_id": r.external_id, "amount": str(r.amount), "status": r.status,
             "payment_method": r.payment_method, "occurred_at": r.occurred_at, "source": r.source,
             "sender_name": r.sender_name, "sender_reference": r.sender_reference,
             "sender_contact": r.sender_contact} for r in rows]


@api.get("/transactions/{transaction_id}")
def transaction_detail(transaction_id: str, actor=Depends(current_actor), db: Session = Depends(get_db)):
    row = db.scalar(select(Transaction).where(Transaction.id == transaction_id,
                                                Transaction.merchant_id == actor["merchant_id"]))
    if row is None:
        raise HTTPException(404, "Transaction not found")
    return {"id": row.id, "external_id": row.external_id, "amount": str(row.amount), "status": row.status,
            "payment_method": row.payment_method, "occurred_at": row.occurred_at, "source": row.source,
            "sender_name": row.sender_name, "sender_reference": row.sender_reference,
            "sender_contact": row.sender_contact}


@api.get("/cashflow/settlements")
def settlements(actor=Depends(current_actor), db: Session = Depends(get_db)):
    rows = db.scalars(select(Settlement).where(Settlement.merchant_id == actor["merchant_id"])
                      .order_by(Settlement.expected_at.desc()).limit(100)).all()
    return [{"id": r.id, "amount": str(r.amount), "status": r.status, "expected_at": r.expected_at,
             "settled_at": r.settled_at} for r in rows]


@api.get("/inventory", response_model=list[ProductOut])
def inventory(actor=Depends(current_actor), db: Session = Depends(get_db)):
    return db.scalars(select(Product).where(Product.merchant_id == actor["merchant_id"], Product.active.is_(True))).all()


@api.post("/inventory", response_model=ProductOut, status_code=201)
def add_product(body: ProductCreate, actor=Depends(current_actor), db: Session = Depends(get_db)):
    if actor["role"] not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Manager permission required")
    product = Product(**body.model_dump(), merchant_id=actor["merchant_id"])
    db.add(product); db.commit(); db.refresh(product)
    return product


@api.get("/inventory/alerts")
def inventory_alerts(actor=Depends(current_actor), db: Session = Depends(get_db)):
    rows = db.scalars(select(Product).where(Product.merchant_id == actor["merchant_id"], Product.active.is_(True),
                                            Product.quantity <= Product.reorder_level)).all()
    return [{"product_id": p.id, "name": p.name, "quantity": p.quantity, "reorder_level": p.reorder_level}
            for p in rows]


@api.post("/approvals", response_model=ActionOut, status_code=201)
def create_proposal(body: ActionCreate, actor=Depends(current_actor), db: Session = Depends(get_db)):
    if actor["role"] not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Manager permission required")
    action = ActionProposal(merchant_id=actor["merchant_id"], kind=body.kind,
                            payload=json.dumps(body.payload, separators=(",", ":")),
                            expires_at=datetime.now(timezone.utc) + timedelta(hours=24))
    db.add(action); db.commit(); db.refresh(action)
    db.add(AuditEvent(merchant_id=actor["merchant_id"], subject=actor["subject"], action="proposal.created", resource_id=action.id))
    db.commit()
    return action


@api.get("/approvals", response_model=list[ActionOut])
def list_proposals(actor=Depends(current_actor), db: Session = Depends(get_db)):
    return db.scalars(select(ActionProposal).where(ActionProposal.merchant_id == actor["merchant_id"])
                      .order_by(ActionProposal.created_at.desc())).all()


@api.post("/approvals/{proposal_id}/decision")
def decide_proposal(proposal_id: str, decision: str = Query(pattern="^(approve|reject)$"),
                    actor=Depends(current_actor), db: Session = Depends(get_db)):
    if actor["role"] not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Manager permission required")
    proposal = db.scalar(select(ActionProposal).where(ActionProposal.id == proposal_id,
                                                       ActionProposal.merchant_id == actor["merchant_id"]))
    if not proposal: raise HTTPException(404, "Proposal not found")
    if proposal.status != "pending": raise HTTPException(409, "Proposal already decided")
    if utc_aware(proposal.expires_at) <= datetime.now(timezone.utc):
        proposal.status = "expired"; db.commit(); raise HTTPException(410, "Proposal expired")
    # Approval records authorization only. Execution stays unavailable until a verified provider is installed.
    if decision == "approve":
        payload = json.loads(proposal.payload)
        if proposal.kind == "purchase_order" and payload.get("purchase_order_id"):
            order = db.scalar(select(PurchaseOrder).where(PurchaseOrder.id == payload["purchase_order_id"],
                                                           PurchaseOrder.merchant_id == actor["merchant_id"]))
            if order is None: raise HTTPException(409, "Purchase order no longer exists")
            order.status = "approved_pending_provider"
        if proposal.kind == "campaign" and payload.get("campaign_id"):
            campaign = db.scalar(select(Campaign).where(Campaign.id == payload["campaign_id"],
                                                         Campaign.merchant_id == actor["merchant_id"]))
            if campaign is None: raise HTTPException(409, "Campaign no longer exists")
            campaign.status = "approved_pending_provider"
        proposal.status = "approved_pending_provider"
    else:
        proposal.status = "rejected"
    db.add(AuditEvent(merchant_id=actor["merchant_id"], subject=actor["subject"], action=f"proposal.{decision}", resource_id=proposal.id))
    db.commit()
    return {"id": proposal.id, "status": proposal.status, "executed": False,
            "message": "No external action was executed; a verified provider adapter is required."}


def parse_receivable_request(question: str, hindi: bool) -> dict | None:
    q = question.casefold()
    write_intent = bool(re.search(
        r"\b(?:keep|mark|record|add|note|set|make|leave|put|create|enter)\b"
        r"|रख(?:ो|ें|ना)?|रख\s+(?:दो|दीजिए|लेना)"
        r"|लिख(?:ो|ें|ना)?|लिख\s+(?:दो|दीजिए)"
        r"|दर्ज(?:़)?\s*(?:कर(?:ो|ें|ना)?|कर\s+दो)"
        r"|जोड़(?:ो|ें|ना)?|जोड़\s+(?:दो|दीजिए)"
        r"|डाल(?:ो|ें|ना)?|डाल\s+(?:दो|दीजिए)"
        r"|बना(?:ओ|एँ|ना)?|बना\s+(?:दो|दीजिए)"
        r"|\b(?:rakh|rakhna|rakho|rakhdo|likh|likhna|likho|likhdo|jod|jodna|jodo|daal|dalo|dalna|bana|banao|banaana)\b",
        q, re.IGNORECASE))
    due_intent = bool(re.search(
        r"\b(?:pending|due|owed|owes|owing|unpaid|outstanding|receivable|baaki|baki|bakaya|udhaar|udhar)\b"
        r"|बाक़?ी|बकाया|उधार|उधारी|पेंडिंग|देना\s+है|लेना\s+है",
        q, re.IGNORECASE))
    if not (write_intent and due_intent):
        return None

    # Parse common English, Devanagari Hindi, and Romanized Hindi forms locally
    # first. This keeps a clear write request out of the general Q&A path and
    # avoids relying on the model to extract a simple name and numeric amount.
    draft = _receivable_draft_from_text(question)
    if draft:
        return {"draft": draft}

    # Hindi word order varies more widely; use the configured model for an
    # incomplete or less common structure, but never save without confirmation.
    if hindi or re.search(r"[\u0900-\u097F]", question):
        if get_settings().model_provider.casefold() in {"ollama", "cloudflare"}:
            from app.providers import parse_receivable_command
            try:
                draft = parse_receivable_command(question, "hi" if re.search(r"[\u0900-\u097F]", question) else "en")
            except RuntimeError:
                draft = None
            return {"draft": draft}
        return {"draft": None}

    if get_settings().model_provider.casefold() in {"ollama", "cloudflare"}:
        from app.providers import parse_receivable_command
        try:
            draft = parse_receivable_command(question, "hi" if hindi else "en")
        except RuntimeError:
            draft = None
    return {"draft": draft}


def _receivable_draft_from_text(question: str) -> dict | None:
    normalized = question.translate(str.maketrans("०१२३४५६७८९", "0123456789"))
    amount_match = re.search(
        r"(?:₹|rs\.?\s*)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:rupees?|रुपये|रुपया|रुपए|inr)?",
        normalized, re.IGNORECASE)
    if not amount_match:
        return None

    name_patterns = (
        r"\b(?:from|by|of|for)\s+(?:(?:mr|mrs|ms|shri|smt)\.?\s+|श्री\s*|श्रीमती\s*)?([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F .'-]{0,80})",
        r"([\u0900-\u097F][\u0900-\u097F .'-]{0,50}?)\s+(?:के\s+नाम|के\s+लिए|से|का|की|के)(?=\s|$)",
        r"([A-Za-z][A-Za-z .'-]{0,50}?)\s+(?:ke\s+naam|ke\s+liye|se|ka|ki|ke)(?=\s|$)",
    )
    raw_name = None
    for pattern in name_patterns:
        name_match = re.search(pattern, normalized, re.IGNORECASE)
        if name_match:
            raw_name = re.split(
                r"\b(?:as|because|which|that|who|when|until|on|pending|due|owed|baki|baaki|bakaya|udhar|udhaar|rakh|rakhna|rakho|rakhdo|likh|likhna|likho|likhdo|jodo|dalo|daalo|banao)\b"
                r"|बाक़?ी|बकाया|उधार|उधारी|पेंडिंग|रख|लिख|दर्ज|जोड़|डाल|बन|[,.!?;]",
                name_match.group(1), maxsplit=1, flags=re.IGNORECASE)[0]
            break
    if not raw_name:
        return None

    customer_name = " ".join(raw_name.split()).strip(" .,-")
    customer_name = re.sub(
        r"^(?:(?:please|keep|mark|record|add|note|set|make|leave|put|create|enter)\s+|"
        r"(?:रखो?|रखना|लिखो?|लिखना|दर्ज|जोड़ो?|डालो?|बनाओ?)\s+|"
        r"(?:rakh(?:na|o|do)?|likh(?:na|o|do)?|jod(?:na|o)?|daal|dalo|banao)\s+)+",
        "", customer_name, flags=re.IGNORECASE)
    customer_name = re.sub(r"^(?:mr|mrs|ms|shri|smt)\.?\s+|^(?:श्रीमान|श्रीमती|श्री)\s*", "", customer_name, flags=re.IGNORECASE)
    try:
        amount = Decimal(amount_match.group(1).replace(",", "")).quantize(Decimal("0.01"))
        if customer_name and amount > 0 and amount <= Decimal("999999999999.99"):
            return {"customer_name": customer_name[:180], "amount": amount, "note": None}
    except InvalidOperation:
        pass
    return None


def assistant_business_context(actor, db: Session) -> dict:
    """Build a bounded per-merchant snapshot for the configured assistant provider."""
    merchant_id = actor["merchant_id"]
    as_of = datetime.now(timezone.utc)
    transactions = db.scalars(select(Transaction).where(
        Transaction.merchant_id == merchant_id,
        Transaction.occurred_at >= as_of - timedelta(days=30),
    ).order_by(Transaction.occurred_at.desc()).limit(100)).all()

    def totals(rows):
        successful = [row for row in rows if row.status == "succeeded"]
        refunds = [row for row in rows if row.status == "refunded"]
        return {"successful_collections_inr": str(sum((row.amount for row in successful), Decimal("0.00"))),
                "successful_payment_count": len(successful),
                "refunds_inr": str(sum((abs(row.amount) for row in refunds), Decimal("0.00")))}

    last_24h = [row for row in transactions if utc_aware(row.occurred_at) >= as_of - timedelta(hours=24)]
    last_7d = [row for row in transactions if utc_aware(row.occurred_at) >= as_of - timedelta(days=7)]
    settlements_rows = db.scalars(select(Settlement).where(
        Settlement.merchant_id == merchant_id, Settlement.status == "pending"
    ).order_by(Settlement.expected_at.desc()).limit(50)).all()
    receivables = db.scalars(select(Receivable).where(
        Receivable.merchant_id == merchant_id, Receivable.status == "pending"
    ).order_by(Receivable.created_at.desc()).limit(100)).all()
    products = db.scalars(select(Product).where(
        Product.merchant_id == merchant_id, Product.active.is_(True)
    ).limit(100)).all()
    return {
        "as_of_utc": as_of.isoformat(),
        "collections_last_24_hours": totals(last_24h),
        "collections_last_7_days": totals(last_7d),
        "pending_settlements": [
            {"amount_inr": str(row.amount), "expected_at": row.expected_at.isoformat() if row.expected_at else None}
            for row in settlements_rows
        ],
        "pending_customer_receivables": [
            {"customer_name": row.customer_name, "amount_inr": str(row.amount), "recorded_at": row.created_at.isoformat()}
            for row in receivables
        ],
        "low_stock_products": [
            {"name": row.name, "quantity": row.quantity, "reorder_level": row.reorder_level, "unit": row.unit}
            for row in products if row.quantity <= row.reorder_level
        ],
        "recent_payments": [
            {"amount_inr": str(row.amount), "status": row.status, "method": row.payment_method,
             "sender": row.sender_name, "occurred_at": utc_aware(row.occurred_at).isoformat()}
            for row in transactions[:20]
        ],
    }


@api.post("/assistant/query", response_model=AssistantResponse)
def assistant_query(body: AssistantRequest, actor=Depends(current_actor), db: Session = Depends(get_db)):
    # Answer exact merchant questions from records first; use an LLM for open-ended analysis.
    q = body.question.casefold()
    hindi = body.response_language == "hi" or (
        body.response_language is None and (
            bool(re.search(r"[\u0900-\u097f]", q))
            or bool(re.search(r"\b(aaj|kal|kitni|kamai|jama|batao|baaki)\b", q))
        )
    )
    conversation = None
    if body.conversation_id:
        conversation = db.scalar(select(Conversation).where(Conversation.id == body.conversation_id,
                                                     Conversation.merchant_id == actor["merchant_id"]))
        if not conversation:
            raise HTTPException(404, "Conversation not found")
        db.add(Message(conversation_id=conversation.id, role="user", content=body.question))

    def respond(answer: str, sources: list[str], pending_receivable_draft=None):
        result = AssistantResponse(answer=answer, sources=sources,
                                   pending_receivable_draft=pending_receivable_draft)
        if conversation:
            db.add(Message(conversation_id=conversation.id, role="assistant", content=answer, sources=sources))
            db.commit()
        return result

    receivable_request = parse_receivable_request(body.question, hindi)
    if receivable_request is not None:
        draft = receivable_request.get("draft")
        if not draft:
            answer = ("कृपया ग्राहक का नाम और सही राशि बताएं; मैं सेव करने से पहले रिकॉर्ड दिखाऊँगा।"
                      if hindi else "Please include the customer's name and exact amount. I’ll show the record for confirmation before saving.")
            return respond(answer, ["customer receivables"], None)
        amount = draft["amount"]
        customer_name = draft["customer_name"]
        answer = (f"मैं {customer_name} के नाम ₹{amount:,.2f} का आंतरिक बकाया रिकॉर्ड बनाने का प्रस्ताव दे रहा हूँ। "
                  "यह Paytm भुगतान नहीं है। सेव करने से पहले पुष्टि करें।" if hindi else
                  f"I can record an internal ₹{amount:,.2f} due from {customer_name}. This is not a Paytm payment. Confirm before saving.")
        return respond(answer, ["customer receivables"], PendingReceivableDraft(**draft))

    customer_due_question = bool(re.search(
        r"who\s+(?:still\s+)?owes|customer\s+due|receivable|pending\s+from|due\s+from|outstanding\s+from|list\s+(?:the\s+)?dues|\budhaar\b|\bbaaki\s+from\b|उधार|ग्राहक.*(?:बाकी|बकाया)|किससे.*(?:बाकी|बकाया)|[\u0900-\u097f]+\s+से.*(?:बाकी|बकाया)",
        q, re.IGNORECASE))
    if customer_due_question:
        rows = db.scalars(select(Receivable).where(
            Receivable.merchant_id == actor["merchant_id"], Receivable.status == "pending"
        ).order_by(Receivable.created_at.desc()).limit(100)).all()
        name_match = re.search(r"\b(?:from|of|by)\s+(?:(?:mr|mrs|ms|shri|smt)\.?\s+)?([a-z][a-z .'-]{1,80})", q)
        hindi_name_match = re.search(r"([\u0900-\u097f]{2,60})\s+(?:से|का|की|के)\b", q)
        wanted = name_match.group(1).strip(" .,-") if name_match else (
            hindi_name_match.group(1).strip(" .,-") if hindi_name_match else "")
        if wanted:
            rows = [row for row in rows if wanted in row.customer_name.casefold()]
        total = sum((row.amount for row in rows), Decimal("0.00"))
        if not rows:
            answer = ("इस व्यापारी खाते में कोई मेल खाता लंबित ग्राहक-बकाया रिकॉर्ड नहीं है।"
                      if hindi else "There are no matching pending customer-due records in this merchant account.")
        else:
            details = "; ".join(f"{row.customer_name}: ₹{row.amount:,.2f}" for row in rows)
            answer = (f"दर्ज लंबित ग्राहक-बकाया कुल ₹{total:,.2f} है ({len(rows)} रिकॉर्ड): {details}। "
                      "ये आंतरिक नोट हैं, पेमेंटर से सत्यापित भुगतान नहीं।" if hindi else
                      f"Recorded pending customer dues total ₹{total:,.2f} across {len(rows)} record(s): {details}. These are internal notes, not verified payments.")
        return respond(answer, ["/receivables?status=pending"])

    if any(term in q for term in ("peak", "busiest hour", "busy time", "rush hour")) or re.search(
        r"पीक|व्यस्त समय|सबसे ज़्यादा.*समय|किस समय.*ज़्यादा", q
    ):
        result = peak_hours(days=30, actor=actor, db=db)
        hours = result["hours"]
        if not hours:
            answer = ("जुड़े हुए रिकॉर्ड में अभी व्यस्त समय बताने के लिए पर्याप्त भुगतान नहीं हैं।"
                      if hindi else "There are not enough connected payments to identify busy hours yet.")
        else:
            top = hours[0]
            time_label = datetime(2000, 1, 1, top["hour"]).strftime("%I %p").lstrip("0")
            answer = (f"पिछले 30 दिनों में सबसे व्यस्त दर्ज समय {time_label} रहा, जब {top['successful_transactions']} सफल पेमेंट हुए।"
                      if hindi else
                      f"The busiest recorded hour in the last 30 days was {time_label}, with {top['successful_transactions']} successful payments.")
        return respond(answer, ["/analytics/peak-hours?days=30"])

    if any(term in q for term in ("compare", "comparison", "trend", "versus", " vs ", "last week", "previous week")) or re.search(
        r"तुलना|बदलाव|पिछले हफ़्ते|पिछले सप्ताह|ट्रेंड", q
    ):
        comparison = period_comparison(days=7, actor=actor, db=db)
        if not comparison["comparison_available"]:
            answer = ("पिछले 7 दिनों से तुलना करने के लिए पर्याप्त पिछले भुगतान रिकॉर्ड नहीं हैं।"
                      if hindi else "There are not enough previous payment records for a reliable 7-day comparison.")
        else:
            change = Decimal(comparison["change_percent"])
            answer = (f"पिछले 7 दिनों का सफल कलेक्शन ₹{comparison['current_collections']} रहा, उससे पहले के 7 दिनों में ₹{comparison['previous_collections']} था। बदलाव {abs(change)}% {'बढ़ा' if change >= 0 else 'घटा'}। यह कलेक्शन है, मुनाफ़ा नहीं।"
                      if hindi else
                      f"Successful collections were ₹{comparison['current_collections']} in the last 7 days versus ₹{comparison['previous_collections']} in the 7 days before. That is a {abs(change)}% {'increase' if change >= 0 else 'decrease'}. Collections are not profit.")
        return respond(answer, ["/analytics/period-comparison?days=7"])

    if any(term in q for term in ("cash flow forecast", "expected receipt", "safe to spend", "due tomorrow")) or re.search(
        r"अगले 24 घंटे|कल तक आने|खर्च करने के लिए", q
    ):
        forecast = cashflow_forecast(actor=actor, db=db)
        amount = forecast["known_pending_receipts_next_24h"]
        answer = (f"दर्ज अपेक्षित तारीखों के अनुसार अगले 24 घंटों में ₹{amount} आने की उम्मीद है। यह गारंटी नहीं है; उपलब्ध नकद या सुरक्षित खर्च की राशि इसमें शामिल नहीं है।"
                  if hindi else
                  f"Recorded expected dates show ₹{amount} due for settlement within 24 hours. This is not guaranteed and does not show available cash or a safe-to-spend amount.")
        return respond(answer, ["/cashflow/forecast"])

    if any(term in q for term in ("sale", "collect", "today", "revenue")) or re.search(r"आज|कमाई|जमा|पेमेंट.*आज|\b(aaj|kamai|jama|kitni.*kamai)\b", q):
        summary = dashboard_briefing(language="hi" if hindi else "en", actor=actor, db=db)
        answer = (f"आज के जुड़े हुए रिकॉर्ड में ₹{summary['collections']} के "
                  f"{summary['successful_transactions']} सफल पेमेंट हुए। रिफंड ₹{summary['refunds']} हैं। "
                  "यह कलेक्शन है, मुनाफ़ा नहीं।" if hindi else
                  f"Today's connected records show collections of ₹{summary['collections']} across "
                  f"{summary['successful_transactions']} successful payments. Refunds are ₹{summary['refunds']}. "
                  "Collections are not profit.")
        return respond(answer, ["/dashboard/briefing"])
    if any(term in q for term in ("stock", "inventory", "reorder")) or re.search(r"स्टॉक|भंडार|सामान|रीऑर्डर|\b(maal|samaan)\b", q):
        low = inventory_alerts(actor, db)
        if not low: return respond("जुड़े हुए इन्वेंटरी रिकॉर्ड में कम स्टॉक वाली वस्तु दर्ज नहीं है।" if hindi else "No low-stock items are recorded in connected inventory.", ["/inventory/alerts"])
        names = ", ".join(f"{p['name']} ({p['quantity']} {p['unit'] if 'unit' in p else 'units'})" for p in low)
        return respond(f"इन दर्ज वस्तुओं का स्टॉक कम है: {names}। ऑर्डर करने से पहले असली स्टॉक जांचें।" if hindi else f"These recorded items are at or below their reorder level: {names}.", ["/inventory/alerts"])
    if any(term in q for term in ("settlement", "cash flow", "cashflow", "pending payout")) or re.search(r"सेटलमेंट|निपटान|बाकी|पेंडिंग|\b(baaki|pending|settlement)\b", q):
        items = settlements(actor, db)
        pending = [item for item in items if item["status"] == "pending"]
        total = sum((Decimal(item["amount"]) for item in pending), Decimal("0.00"))
        answer = (f"जुड़े हुए रिकॉर्ड में ₹{total} के {len(pending)} सेटलमेंट लंबित हैं। यह दर्ज स्थिति है, "
                  "पैसा आने की पक्की तारीख नहीं।" if hindi else
                  f"Connected provider records show ₹{total} pending across {len(pending)} settlements. This is a recorded status, not a guaranteed receipt date.")
        return respond(answer,
                       ["/cashflow/settlements"])
    if any(term in q for term in ("gst", "tax", "filing", "taxable")) or re.search(r"जीएसटी|टैक्स|कर रिटर्न", q):
        period = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m")
        summary = tax_summary(period=period, actor=actor, db=db)
        answer = (f"{period} के दर्ज टैक्स रिकॉर्ड में कर योग्य राशि ₹{summary['taxable_amount']} और टैक्स ₹{summary['tax_amount']} है। यह ड्राफ़्ट सारांश है, दाख़िल रिटर्न नहीं।"
                  if hindi else
                  f"For {period}, recorded tax rows show ₹{summary['taxable_amount']} taxable and ₹{summary['tax_amount']} tax. This is a draft summary, not a filed return.")
        return respond(answer, [f"/tax/summary?period={period}"])
    if any(term in q for term in ("customer", "customers", "repeat buyer", "loyalty")) or re.search(r"ग्राहक|बार-बार खरीद", q):
        customers = db.scalars(select(Customer).where(Customer.merchant_id == actor["merchant_id"])).all()
        opted_in = sum(bool(customer.consent_marketing) for customer in customers)
        answer = (f"इस व्यापारी खाते में {len(customers)} ग्राहक रिकॉर्ड हैं; {opted_in} ने मार्केटिंग की सहमति दी है। खरीद का इतिहास उपलब्ध नहीं है, इसलिए दोबारा खरीद की पहचान नहीं कर सकता।"
                  if hindi else
                  f"This merchant account has {len(customers)} customer records; {opted_in} have recorded marketing consent. Purchase history is not connected, so repeat buyers cannot be identified.")
        return respond(answer, ["/customers"])
    settings = get_settings()
    if settings.model_provider.casefold() in {"ollama", "cloudflare"}:
        context = assistant_business_context(actor, db)
        try:
            if settings.model_provider.casefold() == "cloudflare":
                from app.providers import ask_cloudflare
                answer = ask_cloudflare(body.question, context, "hi" if hindi else "en")
            else:
                from app.providers import ask_ollama
                answer = ask_ollama(body.question, context, "hi" if hindi else "en")
        except RuntimeError as exc:
            message = ("The hosted AI model is unavailable. Check the Cloudflare token, model access, and daily quota."
                       if settings.model_provider.casefold() == "cloudflare" else
                       "The local AI model is unavailable. Start Ollama and load the configured model.")
            raise HTTPException(503, message) from exc
        source = ("Cloudflare Workers AI · Qwen" if settings.model_provider.casefold() == "cloudflare"
                  else "local Ollama model")
        return respond(answer, [source, "merchant database snapshot"])
    if settings.model_provider.casefold() == "gemini" and settings.gemini_api_key:
        from app.providers import ask_gemini
        try:
            answer = ask_gemini(body.question, "hi" if hindi else "en")
        except RuntimeError as exc:
            raise HTTPException(503, "AI is temporarily unavailable. Check the backend provider configuration and quota.") from exc
        return respond(answer, ["Gemini general guidance; merchant records were not sent"])
    return respond("मैं जुड़े हुए बिक्री, सेटलमेंट और स्टॉक रिकॉर्ड से जवाब दे सकता हूँ। इस सवाल का भरोसेमंद जवाब देने के लिए संबंधित डेटा या AI सेवा कॉन्फ़िगर करनी होगी।" if hindi else "I can answer from connected sales, settlement, and inventory records. This question needs a configured data source or AI provider before I can answer reliably.", [])
