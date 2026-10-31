from decimal import Decimal
from typing import Iterable


def summarize_transactions(rows: Iterable[tuple[Decimal, str]]) -> tuple[Decimal, int, Decimal]:
    """Return collections, successful count and refunds separately; never imply profit."""
    collections = Decimal("0.00")
    refund_total = Decimal("0.00")
    successes = 0
    for amount, status in rows:
        if status == "succeeded":
            collections += amount
            successes += 1
        elif status == "refunded":
            refund_total += abs(amount)
    return collections, successes, refund_total
