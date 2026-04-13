import unittest
import os
import sys
import types
import importlib.util
from datetime import datetime, timedelta, timezone

sys.path.append(os.path.dirname(__file__))

try:
    import jwt  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    fake_jwt = types.ModuleType("jwt")

    class _FakePyJWTError(Exception):
        pass

    fake_jwt.PyJWTError = _FakePyJWTError
    fake_jwt.encode = lambda payload, key, algorithm=None: "fake-token"
    fake_jwt.decode = lambda token, key, algorithms=None: {"sub": 1}
    sys.modules["jwt"] = fake_jwt

_PAYMENT_PATH = os.path.join(os.path.dirname(__file__), "routers", "payment.py")
_PAYMENT_SPEC = importlib.util.spec_from_file_location("payment_router", _PAYMENT_PATH)
payment_router = importlib.util.module_from_spec(_PAYMENT_SPEC)
assert _PAYMENT_SPEC and _PAYMENT_SPEC.loader
_PAYMENT_SPEC.loader.exec_module(payment_router)

_calculate_breakdown = payment_router._calculate_breakdown


class _FeeItem:
    def __init__(self, item_id, name_ar, amount_type, amount_value, base_scope="TOTAL", item_code=None):
        self.id = item_id
        self.name_ar = name_ar
        self.amount_type = amount_type
        self.amount_value = amount_value
        self.base_scope = base_scope
        self.item_code = item_code


class _PenaltyRule:
    def __init__(self, grace_period_days=21, penalty_type="FIXED", penalty_value=100.0, repeats_weekly=False, max_penalty_amount=None):
        self.grace_period_days = grace_period_days
        self.penalty_type = penalty_type
        self.penalty_value = penalty_value
        self.repeats_weekly = repeats_weekly
        self.max_penalty_amount = max_penalty_amount


class PaymentFeeRulesTests(unittest.TestCase):
    def test_additional_fee_items_are_added_to_total(self):
        fees = [
            _FeeItem(1, "صندوق مصر", "FIXED", 200.0, "TOTAL", "MISR_FUND"),
            _FeeItem(2, "رسوم خدمات", "FIXED", 100.0, "TOTAL", "SERV"),
        ]
        b = _calculate_breakdown(25000.0, 3.2, None, fee_items=fees)
        self.assertAlmostEqual(b["additional_fees_amount"], 300.0, places=2)
        self.assertAlmostEqual(b["final_total"], b["tuition_after_discount"] + 300.0, places=2)

    def test_late_penalty_applies_after_grace_period(self):
        fees = [_FeeItem(1, "رسوم خدمات", "FIXED", 100.0)]
        rule = _PenaltyRule(grace_period_days=21, penalty_type="FIXED", penalty_value=150.0)
        due_date = datetime.now(timezone.utc) - timedelta(days=25)

        b = _calculate_breakdown(
            25000.0,
            3.0,
            None,
            fee_items=fees,
            late_penalty_rule=rule,
            due_date=due_date,
            now_dt=datetime.now(timezone.utc),
        )
        self.assertAlmostEqual(b["late_penalty_amount"], 150.0, places=2)
        self.assertGreater(b["final_total"], b["tuition_after_discount"] + b["additional_fees_amount"])

    def test_no_late_penalty_within_grace_period(self):
        rule = _PenaltyRule(grace_period_days=21, penalty_type="FIXED", penalty_value=150.0)
        due_date = datetime.now(timezone.utc) - timedelta(days=10)

        b = _calculate_breakdown(
            25000.0,
            3.0,
            None,
            fee_items=[],
            late_penalty_rule=rule,
            due_date=due_date,
            now_dt=datetime.now(timezone.utc),
        )
        self.assertAlmostEqual(b["late_penalty_amount"], 0.0, places=2)


if __name__ == "__main__":
    unittest.main()
