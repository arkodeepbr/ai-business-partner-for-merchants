from datetime import datetime
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import PaymentTransaction


def sales_summary(db: Session, organization_id: str, from_at: datetime, to_at: datetime) -> dict:
    """Deterministic gross successful collections; refunds/fees are excluded by definition."""
    row = db.execute(select(
        func.coalesce(func.sum(PaymentTransaction.amount_minor), 0),
        func.count(PaymentTransaction.id),
        func.min(PaymentTransaction.currency),
        func.count(func.distinct(PaymentTransaction.currency)),
    ).where(
        PaymentTransaction.organization_id == organization_id,
        PaymentTransaction.status == "succeeded",
        PaymentTransaction.occurred_at >= from_at,
        PaymentTransaction.occurred_at < to_at,
    )).one()
    total, count, currency, currency_count = row
    if currency_count > 1:
        raise ValueError("mixed_currency_window")
    return {"organization_id": organization_id, "from_at": from_at, "to_at": to_at,
            "currency": currency or "INR", "gross_collections_minor": int(total),
            "transaction_count": count, "average_transaction_minor": int(total // count) if count else 0,
            "definition": "Sum of succeeded payment amounts in [from_at, to_at); excludes refunds, fees, and settlements.",
            "data_source": "authorized_payment_transactions"}
