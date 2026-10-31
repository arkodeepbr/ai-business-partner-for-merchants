from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    occurred_at: datetime
    amount_minor: int
    currency: str
    status: str
    payment_method: str | None


class SalesSummary(BaseModel):
    organization_id: str
    from_at: datetime
    to_at: datetime
    currency: str
    gross_collections_minor: int = Field(description="Successful gross payment collection in minor units")
    transaction_count: int
    average_transaction_minor: int
    definition: str
    data_source: str


class ConversationRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class ConversationResponse(BaseModel):
    answer: str
    evidence: dict
    grounded: bool = False


class AssistantChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AssistantChatRequest(BaseModel):
    messages: list[AssistantChatMessage] = Field(min_length=1, max_length=12)
    locale: Literal["en", "hi", "kn"] = "en"


class WorkspaceMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class WorkspaceDataResponse(BaseModel):
    assistant_messages: list[WorkspaceMessage]
    preferred_locale: Literal["en", "hi", "kn"]


class WorkspaceDataUpdate(BaseModel):
    assistant_messages: list[WorkspaceMessage] | None = None
    preferred_locale: Literal["en", "hi", "kn"] | None = None


class FinanceRecord(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    kind: Literal["contact_added", "money_lent", "money_repaid", "money_borrowed", "money_borrowed_repaid", "loan_taken", "loan_payment", "transfer_recorded", "inventory_item", "inventory_adjustment", "inventory_sale", "inventory_return", "expense_recorded", "customer_purchase"]
    name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    amount_minor: int = Field(ge=0, le=100_000_000_000)
    occurred_at: datetime
    due_date: date | None = None
    related_record_id: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=300)
    annual_interest_bps: int | None = Field(default=None, ge=0, le=100_000)
    duration_months: int | None = Field(default=None, ge=1, le=600)
    quantity: int | None = Field(default=None, ge=0, le=1_000_000)
    quantity_delta: int | None = Field(default=None, ge=-1_000_000, le=1_000_000)
    unit_cost_minor: int | None = Field(default=None, ge=0, le=100_000_000_000)
    unit_price_minor: int | None = Field(default=None, ge=0, le=100_000_000_000)
    discount_minor: int | None = Field(default=None, ge=0, le=100_000_000_000)
    fees_minor: int | None = Field(default=None, ge=0, le=100_000_000_000)
    category: str | None = Field(default=None, max_length=80)


class FinanceRecordsResponse(BaseModel):
    records: list[FinanceRecord]


class FinanceRecordsUpdate(BaseModel):
    records: list[FinanceRecord]


class AuthSessionRequest(BaseModel):
    access_token: str = Field(min_length=20, max_length=8192)


class AuthSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
