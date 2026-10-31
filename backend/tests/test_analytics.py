import unittest
from decimal import Decimal

from app.analytics import summarize_transactions


class SalesMetricTests(unittest.TestCase):
    def test_successful_collections_and_refunds_are_separate(self):
        total, count, refunds = summarize_transactions([
            (Decimal("120.50"), "succeeded"),
            (Decimal("9.50"), "failed"),
            (Decimal("20.00"), "refunded"),
            (Decimal("80.00"), "succeeded"),
        ])
        self.assertEqual(total, Decimal("200.50"))
        self.assertEqual(count, 2)
        self.assertEqual(refunds, Decimal("20.00"))

    def test_empty_feed_returns_decimal_zeroes(self):
        self.assertEqual(summarize_transactions([]), (Decimal("0.00"), 0, Decimal("0.00")))


if __name__ == "__main__":
    unittest.main()
