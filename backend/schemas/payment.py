from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class PaymentCalculateRequest(BaseModel):
    gpa: float = Field(..., ge=0, le=4)


class PaymentBreakdownResponse(BaseModel):
    base_tuition: float
    discount_rate: float
    discount_amount: float
    tuition_after_discount: float
    lab_fee: float
    library_fee: float
    activities_fee: float
    insurance_fee: float
    total_internal_fees: float
    final_total: float


class BankSlipCreateRequest(BaseModel):
    gpa: float = Field(..., ge=0, le=4)
    notes: Optional[str] = None


class PaymentStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="slip_issued | paid | cancelled")
    notes: Optional[str] = None


class PaymentRecordResponse(PaymentBreakdownResponse):
    id: int
    payment_reference: str
    student_user_id: int
    student_code: str
    student_name: str
    college: Optional[str] = None
    gpa: float
    payment_method: str
    status: str
    notes: Optional[str] = None
    slip_issued_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentConfigUpsert(BaseModel):
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    college_id: int | None = None
    batch_year: int | None = Field(default=None, ge=2000, le=2100)
    pricing_mode: Literal["FIXED_TERM", "CREDIT_HOUR"] = "FIXED_TERM"
    split_main_terms: bool = False
    credit_hour_rate: float | None = Field(default=None, ge=0)
    base_amount: float = Field(..., ge=0)
    currency: str = Field(default="EGP", min_length=2, max_length=10)
    allow_online: bool = True
    allow_fawry: bool = True
    allow_bank_transfer: bool = True
    is_active: bool = True


class PaymentConfigResponse(BaseModel):
    id: int
    academic_year_label: str
    semester: str
    college_id: int | None
    batch_year: int | None
    pricing_mode: str
    split_main_terms: bool
    credit_hour_rate: float | None
    base_amount: float
    currency: str
    allow_online: bool
    allow_fawry: bool
    allow_bank_transfer: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GpaDiscountPolicyUpsert(BaseModel):
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    college_id: int | None = None
    min_gpa: float = Field(..., ge=0, le=4)
    max_gpa: float | None = Field(default=None, ge=0, le=4)
    discount_type: Literal["PERCENT", "FIXED"] = "PERCENT"
    discount_value: float = Field(..., ge=0)
    priority: int = Field(default=100, ge=1)
    is_active: bool = True


class GpaDiscountPolicyResponse(BaseModel):
    id: int
    academic_year_label: str
    semester: str
    college_id: int | None
    min_gpa: float
    max_gpa: float | None
    discount_type: str
    discount_value: float
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentOrderCreateRequest(BaseModel):
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]


class PaymentOrderResponse(BaseModel):
    id: int
    order_no: str
    student_user_id: int
    college_id: int | None
    academic_year_label: str
    semester: str
    amount_before_discount: float
    discount_amount: float
    additional_fees_amount: float
    late_penalty_amount: float
    amount_due: float
    due_date: datetime | None
    breakdown_json: str | None
    currency: str
    status: str
    registration_unlock_status: str
    expires_at: datetime | None
    paid_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentTransactionInitRequest(BaseModel):
    method: Literal["ONLINE", "FAWRY", "BANK_TRANSFER"]
    provider: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=120)


class PaymentTransactionWebhookRequest(BaseModel):
    provider_ref: str = Field(..., min_length=3, max_length=120)
    idempotency_key: str = Field(..., min_length=3, max_length=120)
    confirmed_amount: float = Field(..., ge=0)
    status: Literal["SUCCESS", "FAILED"]
    raw_response_json: str | None = None


class PaymentTransactionResponse(BaseModel):
    id: int
    payment_order_id: int
    method: str
    provider: str | None
    provider_ref: str | None
    idempotency_key: str | None
    requested_amount: float
    confirmed_amount: float | None
    status: str
    raw_request_json: str | None
    raw_response_json: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BankReceiptSubmitRequest(BaseModel):
    receipt_no: str | None = Field(default=None, max_length=120)
    bank_name: str = Field(default="Bank of Cairo", max_length=120)
    deposit_date: datetime | None = None
    uploaded_file_url: str | None = Field(default=None, max_length=500)
    ocr_data_json: str | None = None


class BankReceiptReviewRequest(BaseModel):
    review_status: Literal["APPROVED", "REJECTED"]
    review_note: str | None = Field(default=None, max_length=2000)


class BankReceiptResponse(BaseModel):
    id: int
    payment_transaction_id: int
    payment_order_id: int | None = None
    student_user_id: int | None = None
    student_name: str | None = None
    student_username: str | None = None
    student_code: str | None = None
    receipt_no: str | None
    bank_name: str
    deposit_date: datetime | None
    uploaded_file_url: str | None
    ocr_data_json: str | None
    review_status: str
    reviewed_by_user_id: int | None
    reviewed_at: datetime | None
    review_note: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentFinanceClearanceResponse(BaseModel):
    student_user_id: int
    academic_year_label: str
    semester: str
    clearance_status: str
    source: str | None
    notes: str | None
    set_at: datetime | None


class BankAccountSettingUpsert(BaseModel):
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    college_id: int | None = None
    bank_name: str = Field(..., min_length=2, max_length=120)
    account_holder_name: str = Field(..., min_length=2, max_length=200)
    account_number: str = Field(..., min_length=4, max_length=120)
    iban: str | None = Field(default=None, max_length=120)
    swift_code: str | None = Field(default=None, max_length=50)
    branch_name: str | None = Field(default=None, max_length=120)
    payment_note: str | None = Field(default=None, max_length=2000)
    is_active: bool = True


class BankAccountSettingResponse(BaseModel):
    id: int
    academic_year_label: str
    semester: str
    college_id: int | None
    bank_name: str
    account_holder_name: str
    account_number: str
    iban: str | None
    swift_code: str | None
    branch_name: str | None
    payment_note: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentPaymentOverviewResponse(BaseModel):
    order: PaymentOrderResponse | None
    transactions: list[PaymentTransactionResponse]
    clearance: StudentFinanceClearanceResponse | None
    bank_account: BankAccountSettingResponse | None = None
    discount_policy_applied: dict | None = None


class PaymentFeeItemUpsert(BaseModel):
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    college_id: int | None = None
    name_ar: str = Field(..., min_length=2, max_length=200)
    name_en: str | None = Field(default=None, max_length=200)
    item_code: str | None = Field(default=None, max_length=80)
    amount_type: Literal["FIXED", "PERCENT"] = "FIXED"
    amount_value: float = Field(..., ge=0)
    base_scope: Literal["TOTAL", "BASE_TUITION"] = "TOTAL"
    is_mandatory: bool = True
    is_active: bool = True
    sort_order: int = Field(default=100, ge=1)


class PaymentFeeItemResponse(BaseModel):
    id: int
    academic_year_label: str
    semester: str
    college_id: int | None
    name_ar: str
    name_en: str | None
    item_code: str | None
    amount_type: str
    amount_value: float
    base_scope: str
    is_mandatory: bool
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LatePenaltyRuleUpsert(BaseModel):
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    college_id: int | None = None
    grace_period_days: int = Field(default=21, ge=0)
    penalty_type: Literal["FIXED", "PERCENT"] = "FIXED"
    penalty_value: float = Field(..., ge=0)
    repeats_weekly: bool = False
    max_penalty_amount: float | None = Field(default=None, ge=0)
    is_active: bool = True


class LatePenaltyRuleResponse(BaseModel):
    id: int
    academic_year_label: str
    semester: str
    college_id: int | None
    grace_period_days: int
    penalty_type: str
    penalty_value: float
    repeats_weekly: bool
    max_penalty_amount: float | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentFeeAdjustmentUpsert(BaseModel):
    student_user_id: int = Field(..., ge=1)
    academic_year_label: str = Field(..., min_length=7, max_length=30)
    semester: Literal["autumn", "spring", "summer"]
    adjustment_type: Literal["EXEMPT_ITEM", "EXTRA_DISCOUNT_FIXED", "EXTRA_DISCOUNT_PERCENT"] = "EXTRA_DISCOUNT_FIXED"
    fee_item_id: int | None = None
    value: float = Field(default=0, ge=0)
    reason: str | None = Field(default=None, max_length=2000)
    is_active: bool = True


class StudentFeeAdjustmentResponse(BaseModel):
    id: int
    student_user_id: int
    academic_year_label: str
    semester: str
    adjustment_type: str
    fee_item_id: int | None
    value: float
    reason: str | None
    is_active: bool
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
