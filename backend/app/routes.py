import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import current_actor
from app.core.db import get_db
from app.core.time import utc_aware
from app.models import (ActionProposal, AuditEvent, Campaign, Conversation, CreditOffer, Customer,
                        InventoryMovement, Message, Notification, Product, PurchaseOrder, Receivable, StaffMember,
                        Store, Supplier, TaxRecord, Transaction)
from app.schemas import ReceivableCreate, SalesTimeline

router = APIRouter()


@router.get("/integrations/status")
def integration_status(actor=Depends(current_actor)):
    from app.providers import CAPABILITIES
    from app.core.config import get_settings
    settings = get_settings()
    rows = []
    for item in CAPABILITIES:
        status = item.status
        prerequisite = item.prerequisite
        if item.key == "google_sign_in" and settings.google_oauth_client_id:
            status = "configured"
            prerequisite = "Verified Google identity tokens; Google sign-in creates a merchant workspace"
        if item.key == "llm" and settings.model_provider.casefold() == "gemini" and settings.gemini_api_key:
            status = "configured"
            prerequisite = "General AI only; free-tier prompts may be used to improve Google's products"
        if item.key == "llm" and settings.model_provider.casefold() == "cloudflare":
            configured = bool(settings.cloudflare_api_token and settings.cloudflare_account_id)
            status = "configured" if configured else "not_configured"
            prerequisite = (f"Cloudflare Workers AI Qwen ({settings.cloudflare_model}); free allowance is subject to daily quota"
                            if configured else "Add a Cloudflare Account ID and Workers AI Read API token to the backend")
        if item.key == "llm" and settings.model_provider.casefold() == "ollama":
            from app.providers import ollama_model_ready
            status = "configured" if ollama_model_ready() else "not_configured"
            prerequisite = f"Run Ollama locally and pull {settings.ollama_model}; private merchant context is processed on this machine"
        if item.key == "text_to_speech" and settings.elevenlabs_api_key:
            status = "configured"
            prerequisite = "ElevenLabs synthesis; usage is subject to the account plan and quota"
        rows.append({"key": item.key, "purpose": item.purpose, "status": status,
                     "prerequisite": prerequisite})
    return rows


class ImportedTransaction(BaseModel):
    external_id: str = Field(min_length=1, max_length=120)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    status: str = Field(pattern="^(succeeded|failed|refunded)$")
    payment_method: str = Field(default="unknown", max_length=32)
    occurred_at: datetime
    sender_name: str | None = Field(default=None, max_length=180)
    sender_reference: str | None = Field(default=None, max_length=180)
    sender_contact: str | None = Field(default=None, max_length=180)


class TransactionImport(BaseModel):
    transactions: list[ImportedTransaction] = Field(min_length=1, max_length=500)


@router.post("/integrations/import/transactions")
def import_transactions(body: TransactionImport, actor=Depends(current_actor), db: Session = Depends(get_db)):
    """Accept a merchant-authorized normalized import, never label it as provider-live data."""
    require_manager(actor)
    created, duplicates = 0, 0
    seen_external_ids: dict[str, ImportedTransaction] = {}
    for item in body.transactions:
        if item.occurred_at.tzinfo is None:
            raise HTTPException(422, "occurred_at must include a timezone")
        if item.external_id in seen_external_ids:
            previous = seen_external_ids[item.external_id]
            if previous != item:
                raise HTTPException(409, f"Conflicting rows use external_id {item.external_id}")
            duplicates += 1
            continue
        seen_external_ids[item.external_id] = item
        exists = db.scalar(select(Transaction).where(Transaction.merchant_id == actor["merchant_id"],
            Transaction.source == "merchant_import", Transaction.external_id == item.external_id))
        if exists:
            if (exists.amount != item.amount or exists.status != item.status or
                    exists.payment_method != item.payment_method or
                    exists.sender_name != item.sender_name or exists.sender_reference != item.sender_reference or
                    exists.sender_contact != item.sender_contact or
                    utc_aware(exists.occurred_at) != item.occurred_at.astimezone(timezone.utc)):
                raise HTTPException(409, f"Imported external_id {item.external_id} conflicts with a previous value")
            duplicates += 1
            continue
        db.add(Transaction(id=str(uuid4()), merchant_id=actor["merchant_id"], amount=item.amount,
            status=item.status, payment_method=item.payment_method, source="merchant_import",
            external_id=item.external_id, occurred_at=item.occurred_at.astimezone(timezone.utc),
            sender_name=item.sender_name, sender_reference=item.sender_reference,
            sender_contact=item.sender_contact))
        created += 1
    db.add(AuditEvent(merchant_id=actor["merchant_id"], subject=actor["subject"],
                      action="transactions.merchant_import", resource_id=f"batch:{created}"))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Import conflicted with another request; retry to skip duplicates") from exc
    return {"accepted": created, "duplicates_skipped": duplicates, "source": "merchant_import",
            "provider_connected": False, "message": "Imported merchant data is not represented as a live provider sync."}


def require_manager(actor):
    if actor["role"] not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Manager permission required")


def receivable_dict(row: Receivable) -> dict:
    return {"id": row.id, "customer_name": row.customer_name, "amount": row.amount,
            "status": row.status, "note": row.note, "source": row.source,
            "created_at": row.created_at}


@router.get("/receivables")
def list_receivables(status: str | None = Query(default=None, pattern="^(pending|settled)$"),
                     limit: int = Query(default=100, ge=1, le=200),
                     actor=Depends(current_actor), db: Session = Depends(get_db)):
    query = select(Receivable).where(Receivable.merchant_id == actor["merchant_id"])
    if status:
        query = query.where(Receivable.status == status)
    rows = db.scalars(query.order_by(Receivable.created_at.desc()).limit(limit)).all()
    return [receivable_dict(row) for row in rows]


@router.post("/receivables", status_code=201)
def create_receivable(body: ReceivableCreate, actor=Depends(current_actor), db: Session = Depends(get_db)):
    """Create a confirmed, merchant-entered due record, separate from processor payments."""
    require_manager(actor)
    name = " ".join(body.customer_name.split()).strip()
    if not name:
        raise HTTPException(422, "Customer name is required")
    existing = db.scalar(select(Receivable).where(
        Receivable.merchant_id == actor["merchant_id"],
        Receivable.idempotency_key == body.idempotency_key))
    if existing:
        if existing.customer_name.casefold() != name.casefold() or existing.amount != body.amount:
            raise HTTPException(409, "This confirmation key was already used for a different due record")
        return {**receivable_dict(existing), "created": False}

    row = Receivable(merchant_id=actor["merchant_id"], customer_name=name, amount=body.amount,
                     note=body.note, status="pending", source="assistant",
                     idempotency_key=body.idempotency_key, created_by=actor["subject"])
    db.add(row)
    db.flush()
    db.add(AuditEvent(merchant_id=actor["merchant_id"], subject=actor["subject"],
                      action="receivable.assistant_created", resource_id=row.id))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        existing = db.scalar(select(Receivable).where(
            Receivable.merchant_id == actor["merchant_id"],
            Receivable.idempotency_key == body.idempotency_key))
        if existing and existing.customer_name.casefold() == name.casefold() and existing.amount == body.amount:
            return {**receivable_dict(existing), "created": False}
        raise HTTPException(409, "Could not safely save this due record; review the pending list and retry") from exc
    db.refresh(row)
    return {**receivable_dict(row), "created": True}


class StoreIn(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    code: str = Field(min_length=1, max_length=60)
    address: str | None = Field(default=None, max_length=500)


class CustomerIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=180)
    contact_hash: str | None = Field(default=None, max_length=128)


class ConsentIn(BaseModel):
    consent: bool


class SupplierIn(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    contact: str | None = Field(default=None, max_length=180)


class PurchaseLine(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    unit_cost: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class PurchaseOrderIn(BaseModel):
    supplier_id: str
    lines: list[PurchaseLine] = Field(min_length=1, max_length=100)


class StockAdjustment(BaseModel):
    delta: int = Field(ge=-1000000, le=1000000)
    reason: str = Field(min_length=2, max_length=240)

    @field_validator("delta")
    @classmethod
    def delta_must_be_nonzero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("delta must not be zero")
        return value


class CampaignIn(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    message: str = Field(min_length=1, max_length=2000)


class StaffIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=180)
    role: str = Field(min_length=1, max_length=60)
    store_id: str | None = None


class QueryIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


@router.get("/stores")
def list_stores(actor=Depends(current_actor), db: Session = Depends(get_db)):
    return db.scalars(select(Store).where(Store.merchant_id == actor["merchant_id"], Store.active.is_(True))).all()


@router.post("/stores", status_code=201)
def create_store(body: StoreIn, actor=Depends(current_actor), db: Session = Depends(get_db)):
    require_manager(actor)
    row = Store(merchant_id=actor["merchant_id"], **body.model_dump())
    db.add(row)
    try: db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(409, "Store code already exists for this merchant") from exc
    db.refresh(row)
    return row


@router.get("/customers")
def list_customers(limit: int = Query(default=50, ge=1, le=200), actor=Depends(current_actor), db: Session = Depends(get_db)):
    return db.scalars(select(Customer).where(Customer.merchant_id == actor["merchant_id"])
                      .order_by(Customer.created_at.desc()).limit(limit)).all()


@router.post("/customers", status_code=201)
def create_customer(body: CustomerIn, actor=Depends(current_actor), db: Session = Depends(get_db)):
    require_manager(actor)
    row = Customer(merchant_id=actor["merchant_id"], **body.model_dump(), consent_marketing=False)
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.patch("/customers/{customer_id}/marketing-consent")
def update_customer_consent(customer_id: str, body: ConsentIn, actor=Depends(current_actor), db: Session = Depends(get_db)):
    require_manager(actor)
    row = db.scalar(select(Customer).where(Customer.id == customer_id, Customer.merchant_id == actor["merchant_id"]))
    if row is None: raise HTTPException(404, "Customer not found")
    row.consent_marketing = body.consent
    db.add(AuditEvent(merchant_id=actor["merchant_id"], subject=actor["subject"],
                      action="customer.marketing.opt_in" if body.consent else "customer.marketing.opt_out",
                      resource_id=row.id))
    db.commit()
    return {"customer_id": row.id, "consent_marketing": row.consent_marketing}


@router.post("/inventory/{product_id}/movements", status_code=201)
def adjust_inventory(product_id: str, body: StockAdjustment, actor=Depends(current_actor), db: Session = Depends(get_db)):
    require_manager(actor)
    product = db.scalar(select(Product).where(Product.id == product_id, Product.merchant_id == actor["merchant_id"])
                        .with_for_update())
    if not product: raise HTTPException(404, "Product not found")
    resulting = product.quantity + body.delta
    if resulting < 0: raise HTTPException(409, "Stock adjustment would make quantity negative")
    product.quantity = resulting
    movement = InventoryMovement(merchant_id=actor["merchant_id"], product_id=product.id, delta=body.delta,
                                 resulting_quantity=resulting, reason=body.reason, actor_subject=actor["subject"])
    db.add(movement); db.commit(); db.refresh(movement)
    return {"id": movement.id, "product_id": product.id, "delta": movement.delta,
            "resulting_quantity": movement.resulting_quantity, "reason": movement.reason,
            "created_at": movement.created_at}


@router.get("/inventory/{product_id}/movements")
def inventory_movements(product_id: str, actor=Depends(current_actor), db: Session = Depends(get_db)):
    product = db.scalar(select(Product.id).where(Product.id == product_id, Product.merchant_id == actor["merchant_id"]))
    if not product: raise HTTPException(404, "Product not found")
    return db.scalars(select(InventoryMovement).where(InventoryMovement.product_id == product_id,
                                                       InventoryMovement.merchant_id == actor["merchant_id"])
                      .order_by(InventoryMovement.created_at.desc()).limit(200)).all()


@router.get("/suppliers")
def list_suppliers(actor=Depends(current_actor), db: Session = Depends(get_db)):
    return db.scalars(select(Supplier).where(Supplier.merchant_id == actor["merchant_id"], Supplier.active.is_(True))).all()


@router.post("/suppliers", status_code=201)
def create_supplier(body: SupplierIn, actor=Depends(current_actor), db: Session = Depends(get_db)):
    require_manager(actor)
    row = Supplier(merchant_id=actor["merchant_id"], **body.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.post("/purchase-orders", status_code=201)
def create_purchase_order(body: PurchaseOrderIn, actor=Depends(current_actor), db: Session = Depends(get_db)):
    require_manager(actor)
    supplier = db.scalar(select(Supplier).where(Supplier.id == body.supplier_id,
                                                 Supplier.merchant_id == actor["merchant_id"], Supplier.active.is_(True)))
    if not supplier: raise HTTPException(404, "Supplier not found")
    product_ids = {line.product_id for line in body.lines}
    products = db.scalars(select(Product).where(Product.id.in_(product_ids), Product.merchant_id == actor["merchant_id"])).all()
    if len(products) != len(product_ids): raise HTTPException(422, "Every product must belong to this merchant")
    row = PurchaseOrder(merchant_id=actor["merchant_id"], supplier_id=supplier.id,
                        lines=[line.model_dump(mode="json") for line in body.lines], status="draft")
    db.add(row); db.flush()
    proposal = ActionProposal(merchant_id=actor["merchant_id"], kind="purchase_order",
        payload=json.dumps({"purchase_order_id": row.id, "supplier_id": supplier.id,
                            "lines": row.lines}, separators=(",", ":")),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24))
    db.add(proposal); db.flush()
    db.add(AuditEvent(merchant_id=actor["merchant_id"], subject=actor["subject"],
                      action="purchase_order.draft_created", resource_id=row.id))
    db.commit(); db.refresh(row)
    return {"id": row.id, "supplier_id": row.supplier_id, "lines": row.lines, "status": row.status,
            "approval_required": True, "proposal_id": proposal.id, "submitted": False}


@router.get("/purchase-orders")
def list_purchase_orders(actor=Depends(current_actor), db: Session = Depends(get_db)):
    rows = db.scalars(select(PurchaseOrder).where(PurchaseOrder.merchant_id == actor["merchant_id"])
                      .order_by(PurchaseOrder.created_at.desc()).limit(100)).all()
    return [{"id": r.id, "supplier_id": r.supplier_id, "lines": r.lines, "status": r.status,
             "created_at": r.created_at} for r in rows]


@router.patch("/campaigns/{campaign_id}/prepare-approval")
def prepare_campaign_approval(campaign_id: str, actor=Depends(current_actor), db: Session = Depends(get_db)):
    require_manager(actor)
    campaign = db.scalar(select(Campaign).where(Campaign.id == campaign_id,
                                                 Campaign.merchant_id == actor["merchant_id"]))
    if not campaign: raise HTTPException(404, "Campaign not found")
    proposal = ActionProposal(merchant_id=actor["merchant_id"], kind="campaign",
        payload=json.dumps({"campaign_id": campaign.id, "campaign_name": campaign.name}, separators=(",", ":")),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24))
    db.add(proposal); db.add(AuditEvent(merchant_id=actor["merchant_id"], subject=actor["subject"],
        action="campaign.approval_requested", resource_id=campaign.id)); db.commit(); db.refresh(proposal)
    return {"proposal_id": proposal.id, "status": proposal.status, "delivery_enabled": False}


@router.post("/campaigns", status_code=201)
def create_campaign_draft(body: CampaignIn, actor=Depends(current_actor), db: Session = Depends(get_db)):
    require_manager(actor)
    row = Campaign(merchant_id=actor["merchant_id"], **body.model_dump(), status="draft")
    db.add(row); db.commit(); db.refresh(row)
    return {"id": row.id, "name": row.name, "message": row.message, "status": row.status,
            "delivery_enabled": False, "consent_required": True}


@router.get("/campaigns")
def list_campaigns(actor=Depends(current_actor), db: Session = Depends(get_db)):
    return db.scalars(select(Campaign).where(Campaign.merchant_id == actor["merchant_id"])
                      .order_by(Campaign.created_at.desc())).all()


@router.get("/credit/offers")
def credit_offers(actor=Depends(current_actor), db: Session = Depends(get_db)):
    # Offers are displayed only when a provider-originated record exists.
    rows = db.scalars(select(CreditOffer).where(CreditOffer.merchant_id == actor["merchant_id"],
                                                CreditOffer.source == "provider")).all()
    return [{"id": o.id, "lender": o.lender, "amount": str(o.amount),
             "annual_rate": str(o.annual_rate) if o.annual_rate is not None else None,
             "tenure_months": o.tenure_months, "fees": str(o.fees) if o.fees is not None else None,
             "expires_at": o.expires_at, "source": o.source} for o in rows]


@router.get("/tax/summary")
def tax_summary(period: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"), actor=Depends(current_actor), db: Session = Depends(get_db)):
    records = db.scalars(select(TaxRecord).where(TaxRecord.merchant_id == actor["merchant_id"], TaxRecord.period == period)).all()
    return {"period": period, "taxable_amount": str(sum((r.taxable_amount for r in records), Decimal("0.00"))),
            "tax_amount": str(sum((r.tax_amount for r in records), Decimal("0.00"))), "record_count": len(records),
            "status": "draft_summary", "filed": False, "source": "merchant tax records"}


@router.get("/reports")
def list_reports(actor=Depends(current_actor)):
    return [{"id": "sales-summary", "type": "sales_summary", "available": True},
            {"id": "gst-summary", "type": "gst_draft_summary", "available": True},
            {"id": "gst-filing", "type": "statutory_filing", "available": False,
             "reason": "No authorized tax filing provider is configured"}]


@router.get("/staff")
def list_staff(actor=Depends(current_actor), db: Session = Depends(get_db)):
    return db.scalars(select(StaffMember).where(StaffMember.merchant_id == actor["merchant_id"],
                                                StaffMember.active.is_(True))).all()


@router.post("/staff", status_code=201)
def create_staff(body: StaffIn, actor=Depends(current_actor), db: Session = Depends(get_db)):
    require_manager(actor)
    if body.store_id:
        store = db.scalar(select(Store).where(Store.id == body.store_id, Store.merchant_id == actor["merchant_id"]))
        if not store: raise HTTPException(404, "Store not found")
    row = StaffMember(merchant_id=actor["merchant_id"], **body.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.get("/notifications")
def list_notifications(unread_only: bool = False, actor=Depends(current_actor), db: Session = Depends(get_db)):
    stmt = select(Notification).where(Notification.merchant_id == actor["merchant_id"])
    if unread_only: stmt = stmt.where(Notification.read_at.is_(None))
    rows = db.scalars(stmt.order_by(Notification.created_at.desc()).limit(100)).all()
    return rows


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, actor=Depends(current_actor), db: Session = Depends(get_db)):
    row = db.scalar(select(Notification).where(Notification.id == notification_id,
                                               Notification.merchant_id == actor["merchant_id"]))
    if not row: raise HTTPException(404, "Notification not found")
    if not row.read_at: row.read_at = datetime.now(timezone.utc); db.commit()
    return {"id": row.id, "read": True}


@router.get("/conversations")
def list_conversations(actor=Depends(current_actor), db: Session = Depends(get_db)):
    return db.scalars(select(Conversation).where(Conversation.merchant_id == actor["merchant_id"])
                      .order_by(Conversation.created_at.desc()).limit(50)).all()


@router.post("/conversations", status_code=201)
def create_conversation(actor=Depends(current_actor), db: Session = Depends(get_db)):
    row = Conversation(merchant_id=actor["merchant_id"])
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.get("/conversations/{conversation_id}/messages")
def get_messages(conversation_id: str, actor=Depends(current_actor), db: Session = Depends(get_db)):
    conversation = db.scalar(select(Conversation).where(Conversation.id == conversation_id,
                                                       Conversation.merchant_id == actor["merchant_id"]))
    if not conversation: raise HTTPException(404, "Conversation not found")
    return db.scalars(select(Message).where(Message.conversation_id == conversation_id)
                      .order_by(Message.created_at.asc()).limit(200)).all()


@router.post("/conversations/{conversation_id}/messages", status_code=201)
def send_message(conversation_id: str, body: QueryIn, actor=Depends(current_actor), db: Session = Depends(get_db)):
    conversation = db.scalar(select(Conversation).where(Conversation.id == conversation_id,
                                                       Conversation.merchant_id == actor["merchant_id"]))
    if not conversation: raise HTTPException(404, "Conversation not found")
    user_message = Message(conversation_id=conversation_id, role="user", content=body.question)
    db.add(user_message)
    # This message route intentionally does not call an LLM; use the explicit grounded query endpoint.
    db.commit(); db.refresh(user_message)
    return {"message": user_message, "assistant_endpoint": "/assistant/query", "model_provider": "disabled"}


@router.get("/analytics/peak-hours")
def peak_hours(days: int = Query(default=30, ge=1, le=365), actor=Depends(current_actor), db: Session = Depends(get_db)):
    from app.models import Transaction
    start = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(select(func.extract("hour", Transaction.occurred_at), func.count(Transaction.id))
                      .where(Transaction.merchant_id == actor["merchant_id"], Transaction.occurred_at >= start,
                             Transaction.status == "succeeded")
                      .group_by(func.extract("hour", Transaction.occurred_at))
                      .order_by(func.count(Transaction.id).desc()).limit(5)).all()
    return {"period_days": days, "hours": [{"hour": int(hour), "successful_transactions": count} for hour, count in rows],
            "source": "connected transaction records"}


@router.get("/analytics/period-comparison")
def period_comparison(days: int = Query(default=7, ge=1, le=90), actor=Depends(current_actor), db: Session = Depends(get_db)):
    from app.models import Transaction
    now = datetime.now(timezone.utc)
    current_start, previous_start = now - timedelta(days=days), now - timedelta(days=2 * days)
    values = db.scalars(select(Transaction).where(Transaction.merchant_id == actor["merchant_id"],
                                                   Transaction.occurred_at >= previous_start,
                                                   Transaction.occurred_at < now)).all()
    current = sum((r.amount for r in values if utc_aware(r.occurred_at) >= current_start and r.status == "succeeded"), Decimal("0.00"))
    previous = sum((r.amount for r in values if utc_aware(r.occurred_at) < current_start and r.status == "succeeded"), Decimal("0.00"))
    change_percent = None if previous == 0 else ((current - previous) / previous * Decimal("100")).quantize(Decimal("0.01"))
    return {"current_days": days, "current_collections": str(current), "previous_collections": str(previous),
            "change_percent": str(change_percent) if change_percent is not None else None,
            "comparison_available": previous != 0, "metric": "successful collections; not revenue or profit"}


@router.get("/analytics/timeline", response_model=SalesTimeline)
def sales_timeline(period: Literal["day", "week", "month"] = Query(default="day"),
                   actor=Depends(current_actor), db: Session = Depends(get_db)):
    """Return merchant-scoped hourly or daily collections and refunds in India time."""
    from app.models import Transaction

    tz = ZoneInfo("Asia/Kolkata")
    local_now = datetime.now(tz)
    today = local_now.date()
    if period == "day":
        first_day = today
        bucket_count = 24
        local_start = datetime.combine(today, datetime.min.time(), tzinfo=tz)
    else:
        bucket_count = 7 if period == "week" else 30
        first_day = today - timedelta(days=bucket_count - 1)
        local_start = datetime.combine(first_day, datetime.min.time(), tzinfo=tz)
    local_end = local_start + (timedelta(days=1) if period == "day" else timedelta(days=bucket_count))
    start_utc = local_start.astimezone(timezone.utc)
    end_utc = local_end.astimezone(timezone.utc)
    rows = db.scalars(select(Transaction).where(
        Transaction.merchant_id == actor["merchant_id"],
        Transaction.occurred_at >= start_utc,
        Transaction.occurred_at < end_utc,
    )).all()

    buckets = [{"label": f"{hour:02}:00" if period == "day" else
                (first_day + timedelta(days=index)).strftime("%d %b"),
                "collections": Decimal("0.00"), "refunds": Decimal("0.00"),
                "successful_transactions": 0} for index, hour in enumerate(range(24) if period == "day" else range(bucket_count))]
    for row in rows:
        local_time = utc_aware(row.occurred_at).astimezone(tz)
        index = local_time.hour if period == "day" else (local_time.date() - first_day).days
        if not 0 <= index < len(buckets):
            continue
        if row.status == "succeeded":
            buckets[index]["collections"] += row.amount
            buckets[index]["successful_transactions"] += 1
        elif row.status == "refunded":
            buckets[index]["refunds"] += abs(row.amount)

    collections = sum((bucket["collections"] for bucket in buckets), Decimal("0.00"))
    refunds = sum((bucket["refunds"] for bucket in buckets), Decimal("0.00"))
    return {
        "period": period,
        "timezone": "Asia/Kolkata",
        "as_of": local_now.isoformat(),
        "start": local_start.isoformat(),
        "end": local_end.isoformat(),
        "buckets": [{**bucket, "collections": f"{bucket['collections']:.2f}",
                     "refunds": f"{bucket['refunds']:.2f}"} for bucket in buckets],
        "collections": f"{collections:.2f}",
        "refunds": f"{refunds:.2f}",
        "successful_transactions": sum(bucket["successful_transactions"] for bucket in buckets),
        "source": "merchant transaction records",
        "collections_are_not_profit": True,
    }


@router.get("/analytics/anomalies")
def sales_anomalies(actor=Depends(current_actor), db: Session = Depends(get_db)):
    from app.models import Transaction
    now = datetime.now(timezone.utc)
    rows = db.scalars(select(Transaction).where(Transaction.merchant_id == actor["merchant_id"],
                                                  Transaction.occurred_at >= now - timedelta(days=14),
                                                  Transaction.status == "succeeded")).all()
    recent = sum((r.amount for r in rows if utc_aware(r.occurred_at) >= now - timedelta(days=7)), Decimal("0.00"))
    prior = sum((r.amount for r in rows if utc_aware(r.occurred_at) < now - timedelta(days=7)), Decimal("0.00"))
    if prior == 0:
        return {"available": False, "reason": "At least one prior period with successful transactions is needed.", "alerts": []}
    change = (recent - prior) / prior * Decimal("100")
    alerts = []
    if change <= Decimal("-25"):
        alerts.append({"type": "collection_decline", "priority": "high", "change_percent": str(change.quantize(Decimal("0.01"))),
                       "evidence": "last 7 days compared with preceding 7 days", "action": "Review transactions and store operating changes"})
    elif change >= Decimal("50"):
        alerts.append({"type": "collection_spike", "priority": "medium", "change_percent": str(change.quantize(Decimal("0.01"))),
                       "evidence": "last 7 days compared with preceding 7 days", "action": "Check for unusual refunds or provider duplication"})
    return {"available": True, "alerts": alerts, "method": "fixed 25% decline / 50% increase thresholds",
            "collections_are_not_profit": True}


@router.get("/cashflow/forecast")
def cashflow_forecast(actor=Depends(current_actor), db: Session = Depends(get_db)):
    from app.models import Settlement
    now = datetime.now(timezone.utc)
    due = now + timedelta(days=1)
    rows = db.scalars(select(Settlement).where(Settlement.merchant_id == actor["merchant_id"],
                                               Settlement.status == "pending",
                                               Settlement.expected_at >= now,
                                               Settlement.expected_at <= due)).all()
    return {"known_pending_receipts_next_24h": str(sum((r.amount for r in rows), Decimal("0.00"))),
            "settlement_count": len(rows), "forecast_type": "provider expected dates only",
            "assumptions": ["Only connected pending settlements with an expected date are included."],
            "uncertainty": "Provider dates can change; this is not a guaranteed receipt."}
