from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from core.database import Base


class PaymentRecord(Base):
    __tablename__ = "payment_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    payment_reference = Column(String(120), unique=True, nullable=False, index=True)

    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    student_code = Column(String(50), nullable=False, index=True)
    student_name = Column(String(255), nullable=False)
    college = Column(String(120), nullable=True)

    gpa = Column(Float, nullable=False, default=0.0)
    base_tuition = Column(Float, nullable=False, default=25000.0)
    discount_rate = Column(Float, nullable=False, default=0.0)
    discount_amount = Column(Float, nullable=False, default=0.0)
    tuition_after_discount = Column(Float, nullable=False, default=25000.0)

    lab_fee = Column(Float, nullable=False, default=1500.0)
    library_fee = Column(Float, nullable=False, default=500.0)
    activities_fee = Column(Float, nullable=False, default=1000.0)
    insurance_fee = Column(Float, nullable=False, default=800.0)
    total_internal_fees = Column(Float, nullable=False, default=3800.0)
    final_total = Column(Float, nullable=False, default=28800.0)

    payment_method = Column(String(20), nullable=False, default="bank")
    status = Column(String(30), nullable=False, default="slip_issued", index=True)
    notes = Column(Text, nullable=True)

    slip_issued_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    student = relationship("User")


class PaymentConfig(Base):
    __tablename__ = "ac_payment_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    batch_year = Column(Integer, nullable=True, index=True)
    pricing_mode = Column(String(20), nullable=False, default="FIXED_TERM")  # FIXED_TERM / CREDIT_HOUR
    split_main_terms = Column(Boolean, nullable=False, default=False)  # autumn/spring => half amount when enabled
    credit_hour_rate = Column(Float, nullable=True)
    base_amount = Column(Float, nullable=False, default=0.0)
    currency = Column(String(10), nullable=False, default="EGP")
    allow_online = Column(Boolean, nullable=False, default=True)
    allow_fawry = Column(Boolean, nullable=False, default=True)
    allow_bank_transfer = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("academic_year_label", "semester", "college_id", name="uq_payment_config_scope"),
    )


class GpaDiscountPolicy(Base):
    __tablename__ = "ac_gpa_discount_policies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    min_gpa = Column(Float, nullable=False, default=0.0)
    max_gpa = Column(Float, nullable=True)
    discount_type = Column(String(20), nullable=False, default="PERCENT")  # PERCENT/FIXED
    discount_value = Column(Float, nullable=False, default=0.0)
    priority = Column(Integer, nullable=False, default=100, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PaymentOrder(Base):
    __tablename__ = "ac_payment_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_no = Column(String(80), nullable=False, unique=True, index=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    amount_before_discount = Column(Float, nullable=False, default=0.0)
    discount_amount = Column(Float, nullable=False, default=0.0)
    additional_fees_amount = Column(Float, nullable=False, default=0.0)
    late_penalty_amount = Column(Float, nullable=False, default=0.0)
    amount_due = Column(Float, nullable=False, default=0.0)
    due_date = Column(DateTime(timezone=True), nullable=True)
    breakdown_json = Column(Text, nullable=True)
    currency = Column(String(10), nullable=False, default="EGP")
    status = Column(String(20), nullable=False, default="PENDING", index=True)  # PENDING/PAID/EXPIRED/CANCELED
    registration_unlock_status = Column(String(20), nullable=False, default="LOCKED", index=True)  # LOCKED/UNLOCKED
    expires_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("student_user_id", "academic_year_label", "semester", name="uq_payment_order_term"),
    )


class PaymentTransaction(Base):
    __tablename__ = "ac_payment_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    payment_order_id = Column(Integer, ForeignKey("ac_payment_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    method = Column(String(20), nullable=False, index=True)  # ONLINE/FAWRY/BANK_TRANSFER
    provider = Column(String(50), nullable=True, index=True)
    provider_ref = Column(String(120), nullable=True, index=True)
    idempotency_key = Column(String(120), nullable=True, unique=True, index=True)
    requested_amount = Column(Float, nullable=False, default=0.0)
    confirmed_amount = Column(Float, nullable=True)
    status = Column(String(30), nullable=False, default="INITIATED", index=True)  # INITIATED/PENDING_REVIEW/SUCCESS/FAILED/REVERSED
    raw_request_json = Column(Text, nullable=True)
    raw_response_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class BankReceipt(Base):
    __tablename__ = "ac_bank_receipts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    payment_transaction_id = Column(Integer, ForeignKey("ac_payment_transactions.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    receipt_no = Column(String(120), nullable=True, index=True)
    bank_name = Column(String(120), nullable=False, default="Bank of Cairo")
    deposit_date = Column(DateTime(timezone=True), nullable=True)
    uploaded_file_url = Column(String(500), nullable=True)
    ocr_data_json = Column(Text, nullable=True)
    review_status = Column(String(20), nullable=False, default="PENDING", index=True)  # PENDING/APPROVED/REJECTED
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class StudentFinanceClearance(Base):
    __tablename__ = "ac_student_finance_clearance"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    clearance_status = Column(String(20), nullable=False, default="NOT_CLEARED", index=True)  # NOT_CLEARED/CLEARED/BLOCKED
    source = Column(String(30), nullable=True)  # ONLINE/FAWRY/BANK_APPROVAL/MANUAL
    set_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    set_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("student_user_id", "academic_year_label", "semester", name="uq_finance_clearance_term"),
    )


class PaymentFeeItem(Base):
    __tablename__ = "ac_payment_fee_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    name_ar = Column(String(200), nullable=False)
    name_en = Column(String(200), nullable=True)
    item_code = Column(String(80), nullable=True, index=True)
    amount_type = Column(String(20), nullable=False, default="FIXED")  # FIXED / PERCENT
    amount_value = Column(Float, nullable=False, default=0.0)
    base_scope = Column(String(30), nullable=False, default="TOTAL")  # TOTAL / BASE_TUITION
    is_mandatory = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    sort_order = Column(Integer, nullable=False, default=100)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class LatePenaltyRule(Base):
    __tablename__ = "ac_late_penalty_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    grace_period_days = Column(Integer, nullable=False, default=21)
    penalty_type = Column(String(20), nullable=False, default="FIXED")  # FIXED / PERCENT
    penalty_value = Column(Float, nullable=False, default=0.0)
    repeats_weekly = Column(Boolean, nullable=False, default=False)
    max_penalty_amount = Column(Float, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("academic_year_label", "semester", "college_id", name="uq_late_penalty_scope"),
    )


class BankAccountSetting(Base):
    __tablename__ = "ac_bank_account_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    college_id = Column(Integer, ForeignKey("ac_colleges.id", ondelete="SET NULL"), nullable=True, index=True)
    bank_name = Column(String(120), nullable=False, default="Bank of Cairo")
    account_holder_name = Column(String(200), nullable=False, default="")
    account_number = Column(String(120), nullable=False, default="")
    iban = Column(String(120), nullable=True)
    swift_code = Column(String(50), nullable=True)
    branch_name = Column(String(120), nullable=True)
    payment_note = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("academic_year_label", "semester", "college_id", name="uq_bank_account_scope"),
    )


class StudentFeeAdjustment(Base):
    __tablename__ = "ac_student_fee_adjustments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    academic_year_label = Column(String(30), nullable=False, index=True)
    semester = Column(String(20), nullable=False, index=True)
    adjustment_type = Column(String(30), nullable=False, default="EXTRA_DISCOUNT_FIXED")  # EXEMPT_ITEM / EXTRA_DISCOUNT_FIXED / EXTRA_DISCOUNT_PERCENT
    fee_item_id = Column(Integer, ForeignKey("ac_payment_fee_items.id", ondelete="SET NULL"), nullable=True, index=True)
    value = Column(Float, nullable=False, default=0.0)
    reason = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
