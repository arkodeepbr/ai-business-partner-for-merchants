from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class ProviderTransaction:
    event_id: str
    occurred_at: datetime
    amount_minor: int
    currency: str
    status: str
    payment_method: str | None = None


class PaymentsProvider:
    mode: str

    def fetch_transactions(self, connection_ref: str, from_at: datetime, to_at: datetime) -> list[ProviderTransaction]:
        raise NotImplementedError
