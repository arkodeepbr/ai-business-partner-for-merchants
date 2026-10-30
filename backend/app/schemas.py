from datetime import datetime
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
    assistant_messages: list[WorkspaceMessage] | None = Field(default=None, max_length=200)
    preferred_locale: Literal["en", "hi", "kn"] | None = None


class AuthSessionRequest(BaseModel):
    access_token: str = Field(min_length=20, max_length=8192)


class AuthSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
