from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MerchantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    tier: str = Field(default="qr", pattern="^(qr|soundbox|pos|omnichannel)$")


class MerchantOut(BaseModel):
    id: str
    name: str
    tier: str
    currency: str
    model_config = ConfigDict(from_attributes=True)


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    sku: str | None = Field(default=None, max_length=80)
    quantity: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=0, ge=0)
    unit: str = Field(default="unit", max_length=24)


class ProductOut(ProductCreate):
    id: str
    model_config = ConfigDict(from_attributes=True)


class AssistantRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None
    response_language: Literal["en", "hi"] | None = None


class PendingReceivableDraft(BaseModel):
    customer_name: str = Field(min_length=1, max_length=180)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)


class AssistantResponse(BaseModel):
    answer: str
    sources: list[str]
    grounded: bool = True
    pending_receivable_draft: PendingReceivableDraft | None = None


class ReceivableCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=180)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=12, max_length=80)


class SalesTimelineBucket(BaseModel):
    label: str
    collections: str
    refunds: str
    successful_transactions: int


class SalesTimeline(BaseModel):
    period: Literal["day", "week", "month"]
    timezone: str
    as_of: datetime
    start: datetime
    end: datetime
    buckets: list[SalesTimelineBucket]
    collections: str
    refunds: str
    successful_transactions: int
    source: str
    collections_are_not_profit: bool


class ActionCreate(BaseModel):
    kind: str = Field(pattern="^(purchase_order|campaign|credit_application|report_share)$")
    payload: dict


class ActionOut(BaseModel):
    id: str
    kind: str
    status: str
    expires_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SalesSummary(BaseModel):
    currency: str
    collection_total: Decimal
    successful_transactions: int
    refunds_total: Decimal
    pending_settlements: Decimal
    source: str
    as_of: datetime
    data_available: bool
