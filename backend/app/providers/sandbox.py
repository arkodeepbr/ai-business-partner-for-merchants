from datetime import datetime
from app.providers.base import PaymentsProvider


class SandboxPaymentsProvider(PaymentsProvider):
    """No live merchant data. Empty result is deliberate until an approved fixture is configured."""
    mode = "sandbox"

    def fetch_transactions(self, connection_ref: str, from_at: datetime, to_at: datetime):
        return []
