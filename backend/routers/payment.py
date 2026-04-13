from datetime import datetime, timedelta, timezone
import json
import random
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user, require_role
from models.academic_core import StudentAcademicProfile, StudentFinanceStatus
from models.academic_core import RegistrationRequest, RegistrationCourseSelection, CourseOffering, CourseCatalog, College
from models.payment import (
    BankReceipt,
    GpaDiscountPolicy,
    LatePenaltyRule,
    BankAccountSetting,
    PaymentConfig,
    PaymentFeeItem,
    PaymentOrder,
    PaymentRecord,
    PaymentTransaction,
    StudentFeeAdjustment,
    StudentFinanceClearance,
)
from models.user import User
from schemas.payment import (
    BankSlipCreateRequest,
    BankReceiptResponse,
    BankReceiptReviewRequest,
    BankReceiptSubmitRequest,
    BankAccountSettingResponse,
    BankAccountSettingUpsert,
    GpaDiscountPolicyResponse,
    GpaDiscountPolicyUpsert,
    LatePenaltyRuleResponse,
    LatePenaltyRuleUpsert,
    PaymentBreakdownResponse,
    PaymentCalculateRequest,
    PaymentConfigResponse,
    PaymentConfigUpsert,
    PaymentFeeItemResponse,
    PaymentFeeItemUpsert,
    PaymentOrderCreateRequest,
    PaymentOrderResponse,
    PaymentRecordResponse,
    PaymentStatusUpdateRequest,
    PaymentTransactionInitRequest,
    PaymentTransactionResponse,
    PaymentTransactionWebhookRequest,
    StudentFinanceClearanceResponse,
    StudentFeeAdjustmentResponse,
    StudentFeeAdjustmentUpsert,
    StudentPaymentOverviewResponse,
)

router = APIRouter(prefix="/payment", tags=["payment"])

INTERNAL_FEES = {
    "lab_fee": 1500.0,
    "library_fee": 500.0,
    "activities_fee": 1000.0,
    "insurance_fee": 800.0,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_utc(dt: datetime | None) -> datetime | None:
    if not dt:
        return None
    if isinstance(dt, str):
        raw = dt.strip()
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            dt = parsed
        except ValueError:
            return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def ensure_payment_schema(db: Session) -> None:
    """Schema is managed centrally by ORM metadata creation."""
    return None


def _payment_reference(student_code: str) -> str:
    year = datetime.now(timezone.utc).year
    rand = random.randint(10000, 99999)
    cleaned = (student_code or "UNKNOWN").replace(" ", "")
    return f"BNU-{year}-{cleaned}-{rand}"


def _order_no(student_id: int) -> str:
    year = datetime.now(timezone.utc).year
    rand = random.randint(100000, 999999)
    return f"ORD-{year}-{student_id}-{rand}"


def _discount_rate_for_gpa(gpa: float) -> float:
    if gpa >= 3.9:
        return 0.25
    if gpa >= 3.7:
        return 0.15
    if gpa >= 3.5:
        return 0.10
    return 0.0


def _resolve_student_college_id(db: Session, student_user_id: int) -> int | None:
    profile = (
        db.query(StudentAcademicProfile)
        .filter(StudentAcademicProfile.student_user_id == student_user_id)
        .first()
    )
    if profile and profile.college_id:
        return int(profile.college_id)

    user_row = db.query(User).filter(User.id == int(student_user_id)).first()
    user_college = str(getattr(user_row, "college", "") or "").strip()
    if not user_college:
        return None

    def _norm(value: str) -> str:
        return (
            str(value or "")
            .strip()
            .lower()
            .replace("أ", "ا")
            .replace("إ", "ا")
            .replace("آ", "ا")
            .replace("ة", "ه")
            .replace("ى", "ي")
        )

    target = _norm(user_college)
    if not target:
        return None

    colleges = db.query(College).filter(College.is_active == True).all()  # noqa: E712
    for c in colleges:
        for candidate in [c.code, c.name_ar, c.name_en]:
            key = _norm(str(candidate or ""))
            if not key:
                continue
            if target == key or target in key or key in target:
                return int(c.id)
    return None


def _resolve_payment_config(
    db: Session,
    *,
    academic_year_label: str,
    semester: str,
    college_id: int | None,
    batch_year: int | None = None,
) -> PaymentConfig | None:
    q = db.query(PaymentConfig).filter(
        PaymentConfig.academic_year_label == academic_year_label,
        PaymentConfig.semester == semester,
        PaymentConfig.is_active == True,  # noqa: E712
    )
    if college_id:
        q = q.filter((PaymentConfig.college_id == college_id) | (PaymentConfig.college_id.is_(None)))
    else:
        q = q.filter(PaymentConfig.college_id.is_(None))
    rows = q.order_by(PaymentConfig.updated_at.desc()).all()
    if not rows:
        return None

    # Priority: college+batch > college+no-batch > global+batch > global+no-batch
    def score(row: PaymentConfig) -> tuple[int, int]:
        college_score = 1 if (college_id and row.college_id == college_id) else 0
        if batch_year is None:
            batch_score = 1 if row.batch_year is None else 0
        else:
            batch_score = 2 if row.batch_year == batch_year else (1 if row.batch_year is None else 0)
        return (college_score, batch_score)

    rows.sort(key=score, reverse=True)
    return rows[0]


def _resolve_student_user_id(db: Session, raw_student_ref: int) -> int:
    """
    Accept either internal users.id or student_code (numeric string).
    This keeps admin UI flexible when staff enter student code by habit.
    """
    direct_user = db.query(User.id).filter(User.id == raw_student_ref).first()
    if direct_user:
        return int(raw_student_ref)

    by_code = (
        db.query(User.id)
        .filter(User.role == "student", User.student_code == str(raw_student_ref))
        .first()
    )
    if by_code and getattr(by_code, "id", None):
        return int(by_code.id)

    by_username = (
        db.query(User.id)
        .filter(User.role == "student", User.username == str(raw_student_ref))
        .first()
    )
    if by_username and getattr(by_username, "id", None):
        return int(by_username.id)

    raise HTTPException(status_code=404, detail="Student not found (user_id/student_code/username)")


def _selected_credit_hours_for_student(
    db: Session,
    *,
    student_user_id: int,
    academic_year_label: str,
    semester: str,
) -> float:
    latest_req = (
        db.query(RegistrationRequest)
        .filter(
            RegistrationRequest.student_user_id == student_user_id,
            RegistrationRequest.academic_year_label == academic_year_label,
            RegistrationRequest.semester == semester,
        )
        .order_by(RegistrationRequest.id.desc())
        .first()
    )
    if not latest_req:
        return 0.0
    rows = (
        db.query(CourseCatalog.credit_hours)
        .join(CourseOffering, CourseOffering.course_id == CourseCatalog.id)
        .join(RegistrationCourseSelection, RegistrationCourseSelection.offering_id == CourseOffering.id)
        .filter(RegistrationCourseSelection.registration_request_id == latest_req.id)
        .all()
    )
    return float(sum(float(r[0] or 0.0) for r in rows))


def _resolve_term_base_amount(
    cfg: PaymentConfig,
    *,
    semester: str,
    selected_credit_hours: float,
) -> float:
    mode = str(getattr(cfg, "pricing_mode", "FIXED_TERM") or "FIXED_TERM").upper()
    sem = str(semester or "").strip().lower()
    if mode == "CREDIT_HOUR":
        rate = float(getattr(cfg, "credit_hour_rate", 0.0) or 0.0)
        return max(rate * max(float(selected_credit_hours or 0.0), 0.0), 0.0)

    base = max(float(getattr(cfg, "base_amount", 0.0) or 0.0), 0.0)
    if bool(getattr(cfg, "split_main_terms", False)) and sem in {"autumn", "spring"}:
        return round(base / 2.0, 2)
    return base


def _resolve_discount_policy(
    db: Session,
    *,
    academic_year_label: str,
    semester: str,
    college_id: int | None,
    gpa: float,
) -> GpaDiscountPolicy | None:
    q = db.query(GpaDiscountPolicy).filter(
        GpaDiscountPolicy.academic_year_label == academic_year_label,
        GpaDiscountPolicy.semester == semester,
        GpaDiscountPolicy.is_active == True,  # noqa: E712
        GpaDiscountPolicy.min_gpa <= float(gpa),
    )
    q = q.filter((GpaDiscountPolicy.max_gpa.is_(None)) | (GpaDiscountPolicy.max_gpa >= float(gpa)))
    if college_id:
        q = q.filter((GpaDiscountPolicy.college_id == college_id) | (GpaDiscountPolicy.college_id.is_(None)))
    else:
        q = q.filter(GpaDiscountPolicy.college_id.is_(None))
    rows = q.order_by(GpaDiscountPolicy.priority.asc(), GpaDiscountPolicy.id.asc()).all()
    if not rows:
        return None
    for row in rows:
        if college_id and row.college_id == college_id:
            return row
    return rows[0]


def _resolve_fee_items(
    db: Session,
    *,
    academic_year_label: str,
    semester: str,
    college_id: int | None,
) -> list[PaymentFeeItem]:
    q = db.query(PaymentFeeItem).filter(
        PaymentFeeItem.academic_year_label == academic_year_label,
        PaymentFeeItem.semester == semester,
        PaymentFeeItem.is_active == True,  # noqa: E712
    )
    if college_id:
        q = q.filter((PaymentFeeItem.college_id == college_id) | (PaymentFeeItem.college_id.is_(None)))
    else:
        q = q.filter(PaymentFeeItem.college_id.is_(None))
    rows = q.order_by(PaymentFeeItem.sort_order.asc(), PaymentFeeItem.id.asc()).all()
    return rows


def _resolve_late_penalty_rule(
    db: Session,
    *,
    academic_year_label: str,
    semester: str,
    college_id: int | None,
) -> LatePenaltyRule | None:
    q = db.query(LatePenaltyRule).filter(
        LatePenaltyRule.academic_year_label == academic_year_label,
        LatePenaltyRule.semester == semester,
        LatePenaltyRule.is_active == True,  # noqa: E712
    )
    if college_id:
        q = q.filter((LatePenaltyRule.college_id == college_id) | (LatePenaltyRule.college_id.is_(None)))
    else:
        q = q.filter(LatePenaltyRule.college_id.is_(None))
    rows = q.order_by(LatePenaltyRule.id.asc()).all()
    if not rows:
        return None
    for row in rows:
        if college_id and row.college_id == college_id:
            return row
    return rows[0]


def _resolve_student_adjustments(
    db: Session,
    *,
    student_user_id: int,
    academic_year_label: str,
    semester: str,
) -> list[StudentFeeAdjustment]:
    return (
        db.query(StudentFeeAdjustment)
        .filter(
            StudentFeeAdjustment.student_user_id == student_user_id,
            StudentFeeAdjustment.academic_year_label == academic_year_label,
            StudentFeeAdjustment.semester == semester,
            StudentFeeAdjustment.is_active == True,  # noqa: E712
        )
        .order_by(StudentFeeAdjustment.id.asc())
        .all()
    )


def _resolve_bank_account_setting(
    db: Session,
    *,
    academic_year_label: str,
    semester: str,
    college_id: int | None,
) -> BankAccountSetting | None:
    q = db.query(BankAccountSetting).filter(
        BankAccountSetting.academic_year_label == academic_year_label,
        BankAccountSetting.semester == semester,
        BankAccountSetting.is_active == True,  # noqa: E712
    )
    if college_id:
        q = q.filter((BankAccountSetting.college_id == college_id) | (BankAccountSetting.college_id.is_(None)))
    else:
        q = q.filter(BankAccountSetting.college_id.is_(None))
    rows = q.order_by(BankAccountSetting.updated_at.desc()).all()
    if not rows:
        return None
    for row in rows:
        if college_id and row.college_id == college_id:
            return row
    return rows[0]


def _amount_by_rule(amount_type: str, value: float, base: float) -> float:
    if str(amount_type).upper() == "PERCENT":
        ratio = float(value or 0.0)
        if ratio > 1:
            ratio = ratio / 100.0
        return max(float(base) * ratio, 0.0)
    return max(float(value or 0.0), 0.0)


def _calculate_breakdown(
    base_amount: float,
    gpa: float,
    policy: GpaDiscountPolicy | None,
    *,
    fee_items: list[PaymentFeeItem] | None = None,
    late_penalty_rule: LatePenaltyRule | None = None,
    due_date: datetime | None = None,
    now_dt: datetime | None = None,
    student_adjustments: list[StudentFeeAdjustment] | None = None,
) -> dict[str, Any]:
    discount_amount = 0.0
    discount_rate = 0.0
    if policy:
        if str(policy.discount_type).upper() == "PERCENT":
            discount_rate = max(float(policy.discount_value or 0.0), 0.0)
            if discount_rate > 1:
                discount_rate = discount_rate / 100.0
            discount_amount = float(base_amount) * discount_rate
        else:
            discount_amount = max(float(policy.discount_value or 0.0), 0.0)
            discount_rate = 0.0 if base_amount <= 0 else discount_amount / float(base_amount)
    else:
        # Backward-compatible fallback when no admin policy exists.
        discount_rate = _discount_rate_for_gpa(gpa)
        discount_amount = float(base_amount) * discount_rate

    tuition_after_discount = max(float(base_amount) - discount_amount, 0.0)
    fee_rows: list[dict[str, Any]] = []
    source_items = list(fee_items or [])
    if not source_items:
        source_items = [
            PaymentFeeItem(name_ar="رسوم معامل", amount_type="FIXED", amount_value=float(INTERNAL_FEES["lab_fee"]), base_scope="TOTAL", item_code="LAB"),
            PaymentFeeItem(name_ar="رسوم مكتبة", amount_type="FIXED", amount_value=float(INTERNAL_FEES["library_fee"]), base_scope="TOTAL", item_code="LIB"),
            PaymentFeeItem(name_ar="رسوم أنشطة", amount_type="FIXED", amount_value=float(INTERNAL_FEES["activities_fee"]), base_scope="TOTAL", item_code="ACT"),
            PaymentFeeItem(name_ar="رسوم تأمين", amount_type="FIXED", amount_value=float(INTERNAL_FEES["insurance_fee"]), base_scope="TOTAL", item_code="INS"),
        ]

    for item in source_items:
        base_for_item = tuition_after_discount if str(item.base_scope).upper() == "BASE_TUITION" else tuition_after_discount
        amt = _amount_by_rule(str(item.amount_type), float(item.amount_value or 0.0), base_for_item)
        fee_rows.append(
            {
                "fee_item_id": getattr(item, "id", None),
                "code": getattr(item, "item_code", None),
                "name_ar": str(getattr(item, "name_ar", "")),
                "amount": float(amt),
                "amount_type": str(getattr(item, "amount_type", "FIXED")),
                "is_penalty": False,
            }
        )

    adjustment_logs: list[dict[str, Any]] = []
    for adj in student_adjustments or []:
        adj_type = str(adj.adjustment_type or "").upper()
        if adj_type == "EXEMPT_ITEM" and adj.fee_item_id:
            for row in fee_rows:
                if row.get("fee_item_id") == adj.fee_item_id and row["amount"] > 0:
                    adjustment_logs.append(
                        {
                            "adjustment_type": "EXEMPT_ITEM",
                            "target_fee_item_id": adj.fee_item_id,
                            "amount": float(row["amount"]),
                            "reason": adj.reason,
                        }
                    )
                    row["amount"] = 0.0
        elif adj_type == "EXTRA_DISCOUNT_FIXED":
            val = max(float(adj.value or 0.0), 0.0)
            if val > 0:
                discount_amount += val
                tuition_after_discount = max(tuition_after_discount - val, 0.0)
                adjustment_logs.append({"adjustment_type": adj_type, "amount": val, "reason": adj.reason})
        elif adj_type == "EXTRA_DISCOUNT_PERCENT":
            ratio = float(adj.value or 0.0)
            if ratio > 1:
                ratio = ratio / 100.0
            val = max(tuition_after_discount * max(ratio, 0.0), 0.0)
            if val > 0:
                discount_amount += val
                tuition_after_discount = max(tuition_after_discount - val, 0.0)
                adjustment_logs.append({"adjustment_type": adj_type, "amount": val, "reason": adj.reason})

    total_internal_fees = sum(float(row["amount"]) for row in fee_rows)

    late_penalty_amount = 0.0
    now_ref = _to_utc(now_dt) or _now()
    due_date_ref = _to_utc(due_date)
    if late_penalty_rule and due_date_ref and now_ref > due_date_ref:
        overdue_days = max((now_ref - due_date_ref).days, 0)
        if overdue_days > int(late_penalty_rule.grace_period_days or 0):
            weeks = 1
            if bool(late_penalty_rule.repeats_weekly):
                weeks += max((overdue_days - int(late_penalty_rule.grace_period_days or 0)) // 7, 0)
            base_for_penalty = tuition_after_discount + total_internal_fees
            late_penalty_amount = _amount_by_rule(
                str(late_penalty_rule.penalty_type),
                float(late_penalty_rule.penalty_value or 0.0),
                base_for_penalty,
            ) * max(weeks, 1)
            max_penalty = late_penalty_rule.max_penalty_amount
            if max_penalty is not None:
                late_penalty_amount = min(float(late_penalty_amount), float(max_penalty))
            fee_rows.append(
                {
                    "fee_item_id": None,
                    "code": "LATE_PENALTY",
                    "name_ar": "غرامة تأخير",
                    "amount": float(max(late_penalty_amount, 0.0)),
                    "amount_type": str(late_penalty_rule.penalty_type),
                    "is_penalty": True,
                }
            )

    final_total = tuition_after_discount + total_internal_fees + max(late_penalty_amount, 0.0)
    return {
        "base_tuition": float(base_amount),
        "discount_rate": float(discount_rate),
        "discount_amount": float(discount_amount),
        "tuition_after_discount": float(tuition_after_discount),
        "lab_fee": float(INTERNAL_FEES["lab_fee"]),
        "library_fee": float(INTERNAL_FEES["library_fee"]),
        "activities_fee": float(INTERNAL_FEES["activities_fee"]),
        "insurance_fee": float(INTERNAL_FEES["insurance_fee"]),
        "total_internal_fees": float(total_internal_fees),
        "fee_items": fee_rows,
        "additional_fees_amount": float(total_internal_fees),
        "late_penalty_amount": float(max(late_penalty_amount, 0.0)),
        "adjustments": adjustment_logs,
        "final_total": float(final_total),
    }


def _set_term_clearance(
    db: Session,
    *,
    student_user_id: int,
    academic_year_label: str,
    semester: str,
    clearance_status: str,
    source: str,
    notes: str | None = None,
    actor_user_id: int | None = None,
) -> StudentFinanceClearance:
    row = (
        db.query(StudentFinanceClearance)
        .filter(
            StudentFinanceClearance.student_user_id == student_user_id,
            StudentFinanceClearance.academic_year_label == academic_year_label,
            StudentFinanceClearance.semester == semester,
        )
        .first()
    )
    if not row:
        row = StudentFinanceClearance(
            student_user_id=student_user_id,
            academic_year_label=academic_year_label,
            semester=semester,
        )
        db.add(row)
        db.flush()
    row.clearance_status = clearance_status
    row.source = source
    row.notes = notes
    row.set_by_user_id = actor_user_id
    row.set_at = _now()

    # Keep legacy global finance status in sync for existing registration checks.
    legacy = db.query(StudentFinanceStatus).filter(StudentFinanceStatus.student_user_id == student_user_id).first()
    if not legacy:
        legacy = StudentFinanceStatus(student_user_id=student_user_id, status="pending")
        db.add(legacy)
        db.flush()
    if clearance_status == "CLEARED":
        legacy.status = "cleared"
        legacy.cleared_by_user_id = actor_user_id
        legacy.cleared_at = _now()
    elif clearance_status == "BLOCKED":
        legacy.status = "blocked"
        legacy.notes = notes
    else:
        legacy.status = "pending"
        legacy.notes = notes
    return row


def _serialize_clearance(row: StudentFinanceClearance | None) -> StudentFinanceClearanceResponse | None:
    if not row:
        return None
    return StudentFinanceClearanceResponse(
        student_user_id=int(row.student_user_id),
        academic_year_label=str(row.academic_year_label),
        semester=str(row.semester),
        clearance_status=str(row.clearance_status),
        source=row.source,
        notes=row.notes,
        set_at=row.set_at,
    )


@router.post("/calculate", response_model=PaymentBreakdownResponse)
async def calculate_payment(
    payload: PaymentCalculateRequest,
    _: User = Depends(get_current_user),
):
    # Legacy endpoint still used by current frontend.
    breakdown = _calculate_breakdown(25000.0, payload.gpa, None)
    return PaymentBreakdownResponse(**breakdown)


@router.post("/configs", response_model=PaymentConfigResponse, dependencies=[Depends(require_role("admin"))])
async def upsert_payment_config(payload: PaymentConfigUpsert, db: Session = Depends(get_db)):
    ensure_payment_schema(db)
    q = db.query(PaymentConfig).filter(
        PaymentConfig.academic_year_label == payload.academic_year_label,
        PaymentConfig.semester == payload.semester,
    )
    if payload.college_id is None:
        q = q.filter(PaymentConfig.college_id.is_(None))
    else:
        q = q.filter(PaymentConfig.college_id == payload.college_id)
    if payload.batch_year is None:
        q = q.filter(PaymentConfig.batch_year.is_(None))
    else:
        q = q.filter(PaymentConfig.batch_year == payload.batch_year)
    row = q.first()
    if not row:
        row = PaymentConfig(
            academic_year_label=payload.academic_year_label,
            semester=payload.semester,
            college_id=payload.college_id,
            batch_year=payload.batch_year,
        )
        db.add(row)
        db.flush()
    row.batch_year = payload.batch_year
    row.pricing_mode = payload.pricing_mode
    row.split_main_terms = payload.split_main_terms
    row.credit_hour_rate = payload.credit_hour_rate
    row.base_amount = payload.base_amount
    row.currency = payload.currency
    row.allow_online = payload.allow_online
    row.allow_fawry = payload.allow_fawry
    row.allow_bank_transfer = payload.allow_bank_transfer
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


@router.get("/configs", response_model=list[PaymentConfigResponse], dependencies=[Depends(require_role("admin"))])
async def list_payment_configs(
    academic_year_label: str | None = None,
    semester: str | None = None,
    college_id: int | None = None,
    batch_year: int | None = None,
    db: Session = Depends(get_db),
):
    ensure_payment_schema(db)
    q = db.query(PaymentConfig)
    if academic_year_label:
        q = q.filter(PaymentConfig.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(PaymentConfig.semester == semester)
    if college_id is not None:
        q = q.filter(PaymentConfig.college_id == college_id)
    if batch_year is not None:
        q = q.filter(PaymentConfig.batch_year == batch_year)
    return q.order_by(PaymentConfig.updated_at.desc()).all()


@router.post("/bank-account-settings", response_model=BankAccountSettingResponse, dependencies=[Depends(require_role("admin"))])
async def upsert_bank_account_setting(payload: BankAccountSettingUpsert, db: Session = Depends(get_db)):
    ensure_payment_schema(db)
    q = db.query(BankAccountSetting).filter(
        BankAccountSetting.academic_year_label == payload.academic_year_label,
        BankAccountSetting.semester == payload.semester,
    )
    if payload.college_id is None:
        q = q.filter(BankAccountSetting.college_id.is_(None))
    else:
        q = q.filter(BankAccountSetting.college_id == payload.college_id)
    row = q.first()
    if not row:
        row = BankAccountSetting(
            academic_year_label=payload.academic_year_label,
            semester=payload.semester,
            college_id=payload.college_id,
        )
        db.add(row)
        db.flush()
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.get("/bank-account-settings", response_model=list[BankAccountSettingResponse], dependencies=[Depends(require_role("admin"))])
async def list_bank_account_settings(
    academic_year_label: str | None = None,
    semester: str | None = None,
    college_id: int | None = None,
    db: Session = Depends(get_db),
):
    ensure_payment_schema(db)
    q = db.query(BankAccountSetting)
    if academic_year_label:
        q = q.filter(BankAccountSetting.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(BankAccountSetting.semester == semester)
    if college_id is not None:
        q = q.filter(BankAccountSetting.college_id == college_id)
    return q.order_by(BankAccountSetting.updated_at.desc()).all()


@router.delete("/bank-account-settings/{setting_id}", dependencies=[Depends(require_role("admin"))])
async def delete_bank_account_setting(setting_id: int, db: Session = Depends(get_db)):
    row = db.query(BankAccountSetting).filter(BankAccountSetting.id == setting_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Bank account setting not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/gpa-discount-policies", response_model=GpaDiscountPolicyResponse, dependencies=[Depends(require_role("admin"))])
async def create_discount_policy(payload: GpaDiscountPolicyUpsert, db: Session = Depends(get_db)):
    ensure_payment_schema(db)
    row = GpaDiscountPolicy(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/gpa-discount-policies", response_model=list[GpaDiscountPolicyResponse], dependencies=[Depends(require_role("admin"))])
async def list_discount_policies(
    academic_year_label: str | None = None,
    semester: str | None = None,
    college_id: int | None = None,
    db: Session = Depends(get_db),
):
    ensure_payment_schema(db)
    q = db.query(GpaDiscountPolicy)
    if academic_year_label:
        q = q.filter(GpaDiscountPolicy.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(GpaDiscountPolicy.semester == semester)
    if college_id is not None:
        q = q.filter(GpaDiscountPolicy.college_id == college_id)
    return q.order_by(GpaDiscountPolicy.priority.asc(), GpaDiscountPolicy.id.desc()).all()


@router.delete("/gpa-discount-policies/{policy_id}", dependencies=[Depends(require_role("admin"))])
async def delete_discount_policy(policy_id: int, db: Session = Depends(get_db)):
    row = db.query(GpaDiscountPolicy).filter(GpaDiscountPolicy.id == policy_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/fee-items", response_model=PaymentFeeItemResponse, dependencies=[Depends(require_role("admin"))])
async def create_fee_item(payload: PaymentFeeItemUpsert, db: Session = Depends(get_db)):
    ensure_payment_schema(db)
    row = PaymentFeeItem(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/fee-items", response_model=list[PaymentFeeItemResponse], dependencies=[Depends(require_role("admin"))])
async def list_fee_items(
    academic_year_label: str | None = None,
    semester: str | None = None,
    college_id: int | None = None,
    db: Session = Depends(get_db),
):
    ensure_payment_schema(db)
    q = db.query(PaymentFeeItem)
    if academic_year_label:
        q = q.filter(PaymentFeeItem.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(PaymentFeeItem.semester == semester)
    if college_id is not None:
        q = q.filter(PaymentFeeItem.college_id == college_id)
    return q.order_by(PaymentFeeItem.sort_order.asc(), PaymentFeeItem.id.desc()).all()


@router.delete("/fee-items/{fee_item_id}", dependencies=[Depends(require_role("admin"))])
async def delete_fee_item(fee_item_id: int, db: Session = Depends(get_db)):
    row = db.query(PaymentFeeItem).filter(PaymentFeeItem.id == fee_item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Fee item not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/late-penalty-rules", response_model=LatePenaltyRuleResponse, dependencies=[Depends(require_role("admin"))])
async def upsert_late_penalty_rule(payload: LatePenaltyRuleUpsert, db: Session = Depends(get_db)):
    ensure_payment_schema(db)
    q = db.query(LatePenaltyRule).filter(
        LatePenaltyRule.academic_year_label == payload.academic_year_label,
        LatePenaltyRule.semester == payload.semester,
    )
    if payload.college_id is None:
        q = q.filter(LatePenaltyRule.college_id.is_(None))
    else:
        q = q.filter(LatePenaltyRule.college_id == payload.college_id)
    row = q.first()
    if not row:
        row = LatePenaltyRule(
            academic_year_label=payload.academic_year_label,
            semester=payload.semester,
            college_id=payload.college_id,
        )
        db.add(row)
        db.flush()
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.get("/late-penalty-rules", response_model=list[LatePenaltyRuleResponse], dependencies=[Depends(require_role("admin"))])
async def list_late_penalty_rules(
    academic_year_label: str | None = None,
    semester: str | None = None,
    college_id: int | None = None,
    db: Session = Depends(get_db),
):
    ensure_payment_schema(db)
    q = db.query(LatePenaltyRule)
    if academic_year_label:
        q = q.filter(LatePenaltyRule.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(LatePenaltyRule.semester == semester)
    if college_id is not None:
        q = q.filter(LatePenaltyRule.college_id == college_id)
    return q.order_by(LatePenaltyRule.updated_at.desc()).all()


@router.post("/student-adjustments", response_model=StudentFeeAdjustmentResponse, dependencies=[Depends(require_role("admin"))])
async def create_student_adjustment(
    payload: StudentFeeAdjustmentUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_payment_schema(db)
    payload_data = payload.model_dump()
    payload_data["student_user_id"] = _resolve_student_user_id(db, int(payload.student_user_id))
    row = StudentFeeAdjustment(**payload_data, created_by_user_id=current_user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/student-adjustments", response_model=list[StudentFeeAdjustmentResponse], dependencies=[Depends(require_role("admin"))])
async def list_student_adjustments(
    student_user_id: int | None = None,
    academic_year_label: str | None = None,
    semester: str | None = None,
    db: Session = Depends(get_db),
):
    ensure_payment_schema(db)
    q = db.query(StudentFeeAdjustment)
    if student_user_id:
        q = q.filter(StudentFeeAdjustment.student_user_id == student_user_id)
    if academic_year_label:
        q = q.filter(StudentFeeAdjustment.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(StudentFeeAdjustment.semester == semester)
    return q.order_by(StudentFeeAdjustment.created_at.desc()).all()


@router.delete("/student-adjustments/{adjustment_id}", dependencies=[Depends(require_role("admin"))])
async def delete_student_adjustment(adjustment_id: int, db: Session = Depends(get_db)):
    row = db.query(StudentFeeAdjustment).filter(StudentFeeAdjustment.id == adjustment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Student adjustment not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/orders", response_model=PaymentOrderResponse)
async def create_or_get_order(
    payload: PaymentOrderCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_payment_schema(db)
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")

    college_id = _resolve_student_college_id(db, current_user.id)
    profile = db.query(StudentAcademicProfile).filter(StudentAcademicProfile.student_user_id == current_user.id).first()
    batch_year = int(profile.entry_batch_year) if (profile and profile.entry_batch_year) else None
    cfg = _resolve_payment_config(
        db,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
        college_id=college_id,
        batch_year=batch_year,
    )
    if not cfg:
        raise HTTPException(status_code=400, detail="No payment configuration found for this term")

    existing = (
        db.query(PaymentOrder)
        .filter(
            PaymentOrder.student_user_id == current_user.id,
            PaymentOrder.academic_year_label == payload.academic_year_label,
            PaymentOrder.semester == payload.semester,
        )
        .first()
    )
    if existing and str(existing.status).upper() in {"PAID"}:
        return existing

    gpa_value = float(getattr(current_user, "gpa", 0) or 0)
    if profile and profile.gpa is not None:
        gpa_value = float(profile.gpa)
    policy = _resolve_discount_policy(
        db,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
        college_id=college_id,
        gpa=gpa_value,
    )
    fee_items = _resolve_fee_items(
        db,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
        college_id=college_id,
    )
    penalty_rule = _resolve_late_penalty_rule(
        db,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
        college_id=college_id,
    )
    adjustments = _resolve_student_adjustments(
        db,
        student_user_id=current_user.id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
    )
    due_date = _now()
    if existing and existing.due_date:
        due_date = _to_utc(existing.due_date) or _now()
    selected_credit_hours = _selected_credit_hours_for_student(
        db,
        student_user_id=current_user.id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
    )
    effective_base_amount = _resolve_term_base_amount(
        cfg,
        semester=payload.semester,
        selected_credit_hours=selected_credit_hours,
    )
    try:
        breakdown = _calculate_breakdown(
            float(effective_base_amount),
            gpa_value,
            policy,
            fee_items=fee_items,
            late_penalty_rule=penalty_rule,
            due_date=due_date,
            student_adjustments=adjustments,
        )
    except TypeError:
        # Defensive fallback for legacy rows with inconsistent datetime serialization.
        breakdown = _calculate_breakdown(
            float(effective_base_amount),
            gpa_value,
            policy,
            fee_items=fee_items,
            late_penalty_rule=penalty_rule,
            due_date=None,
            student_adjustments=adjustments,
        )
    amount_due = float(breakdown["final_total"])

    if not existing:
        existing = PaymentOrder(
            order_no=_order_no(current_user.id),
            student_user_id=current_user.id,
            college_id=college_id,
            academic_year_label=payload.academic_year_label,
            semester=payload.semester,
        )
        db.add(existing)
        db.flush()
    existing.amount_before_discount = float(effective_base_amount)
    existing.discount_amount = float(breakdown["discount_amount"])
    existing.additional_fees_amount = float(breakdown["additional_fees_amount"])
    existing.late_penalty_amount = float(breakdown["late_penalty_amount"])
    existing.amount_due = amount_due
    existing.due_date = due_date
    existing.breakdown_json = json.dumps(breakdown, ensure_ascii=False)
    existing.currency = cfg.currency
    existing.status = "PENDING"
    existing.registration_unlock_status = "LOCKED"
    existing.expires_at = _now() + timedelta(days=3)
    existing.paid_at = None

    _set_term_clearance(
        db,
        student_user_id=current_user.id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
        clearance_status="NOT_CLEARED",
        source="ORDER_CREATED",
        notes="Waiting for payment",
        actor_user_id=current_user.id,
    )

    db.commit()
    db.refresh(existing)
    return existing


@router.post("/orders/{order_id}/transactions/initiate", response_model=PaymentTransactionResponse)
async def initiate_transaction(
    order_id: int,
    payload: PaymentTransactionInitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    order = (
        db.query(PaymentOrder)
        .filter(PaymentOrder.id == order_id, PaymentOrder.student_user_id == current_user.id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(order.status).upper() == "PAID":
        raise HTTPException(status_code=400, detail="Order already paid")

    profile = db.query(StudentAcademicProfile).filter(StudentAcademicProfile.student_user_id == current_user.id).first()
    batch_year = int(profile.entry_batch_year) if (profile and profile.entry_batch_year) else None
    cfg = _resolve_payment_config(
        db,
        academic_year_label=order.academic_year_label,
        semester=order.semester,
        college_id=order.college_id,
        batch_year=batch_year,
    )
    if not cfg:
        raise HTTPException(status_code=400, detail="No active payment config for this order")
    method = str(payload.method).upper()
    if method == "ONLINE" and not cfg.allow_online:
        raise HTTPException(status_code=400, detail="Online payment is disabled for this term")
    if method == "FAWRY" and not cfg.allow_fawry:
        raise HTTPException(status_code=400, detail="Fawry payment is disabled for this term")
    if method == "BANK_TRANSFER" and not cfg.allow_bank_transfer:
        raise HTTPException(status_code=400, detail="Bank payment is disabled for this term")

    idem = (payload.idempotency_key or f"{order.order_no}-{method}-{random.randint(10000, 99999)}").strip()
    tx = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.idempotency_key == idem)
        .first()
    )
    if tx:
        return tx

    tx = PaymentTransaction(
        payment_order_id=order.id,
        method=method,
        provider=payload.provider or ("BANK" if method == "BANK_TRANSFER" else method),
        idempotency_key=idem,
        requested_amount=float(order.amount_due or 0.0),
        status="PENDING_REVIEW" if method == "BANK_TRANSFER" else "INITIATED",
        raw_request_json=f'{{"method":"{method}"}}',
    )
    db.add(tx)
    db.flush()

    if method == "BANK_TRANSFER":
        rec = BankReceipt(payment_transaction_id=tx.id, review_status="PENDING")
        db.add(rec)
    db.commit()
    db.refresh(tx)
    return tx


@router.post("/orders/{order_id}/transactions/{transaction_id}/bank-receipt", response_model=BankReceiptResponse)
async def submit_bank_receipt(
    order_id: int,
    transaction_id: int,
    payload: BankReceiptSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    order = (
        db.query(PaymentOrder)
        .filter(PaymentOrder.id == order_id, PaymentOrder.student_user_id == current_user.id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    tx = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.id == transaction_id, PaymentTransaction.payment_order_id == order.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if str(tx.method).upper() != "BANK_TRANSFER":
        raise HTTPException(status_code=400, detail="Receipt is only allowed for bank transfer")

    rec = db.query(BankReceipt).filter(BankReceipt.payment_transaction_id == tx.id).first()
    if not rec:
        rec = BankReceipt(payment_transaction_id=tx.id)
        db.add(rec)
        db.flush()
    rec.receipt_no = payload.receipt_no
    rec.bank_name = payload.bank_name
    rec.deposit_date = payload.deposit_date
    rec.uploaded_file_url = payload.uploaded_file_url
    rec.ocr_data_json = payload.ocr_data_json
    rec.review_status = "PENDING"
    tx.status = "PENDING_REVIEW"
    db.commit()
    db.refresh(rec)
    return rec


@router.post("/webhook/{provider}/confirm")
async def provider_webhook_confirm(
    provider: str,
    payload: PaymentTransactionWebhookRequest,
    db: Session = Depends(get_db),
):
    tx = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.idempotency_key == payload.idempotency_key)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if str(tx.status).upper() == "SUCCESS":
        return {"ok": True, "message": "Already processed"}

    tx.provider = provider.upper()
    tx.provider_ref = payload.provider_ref
    tx.confirmed_amount = payload.confirmed_amount
    tx.status = payload.status
    tx.raw_response_json = payload.raw_response_json

    order = db.query(PaymentOrder).filter(PaymentOrder.id == tx.payment_order_id).first()
    if order and str(payload.status).upper() == "SUCCESS":
        if float(payload.confirmed_amount or 0.0) + 0.0001 < float(order.amount_due or 0.0):
            tx.status = "FAILED"
            db.commit()
            raise HTTPException(status_code=400, detail="Confirmed amount is less than required amount")
        order.status = "PAID"
        order.registration_unlock_status = "UNLOCKED"
        order.paid_at = _now()
        _set_term_clearance(
            db,
            student_user_id=order.student_user_id,
            academic_year_label=order.academic_year_label,
            semester=order.semester,
            clearance_status="CLEARED",
            source=str(tx.method).upper(),
            notes=f"Auto-cleared by {provider}",
            actor_user_id=None,
        )
    db.commit()
    return {"ok": True}


@router.get("/my/overview", response_model=StudentPaymentOverviewResponse)
async def my_payment_overview(
    academic_year_label: str,
    semester: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_payment_schema(db)
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Students only")
    college_id = _resolve_student_college_id(db, current_user.id)
    order = (
        db.query(PaymentOrder)
        .filter(
            PaymentOrder.student_user_id == current_user.id,
            PaymentOrder.academic_year_label == academic_year_label,
            PaymentOrder.semester == semester,
        )
        .first()
    )
    transactions = []
    if order:
        transactions = (
            db.query(PaymentTransaction)
            .filter(PaymentTransaction.payment_order_id == order.id)
            .order_by(PaymentTransaction.created_at.desc())
            .all()
        )
    clearance = (
        db.query(StudentFinanceClearance)
        .filter(
            StudentFinanceClearance.student_user_id == current_user.id,
            StudentFinanceClearance.academic_year_label == academic_year_label,
            StudentFinanceClearance.semester == semester,
        )
        .first()
    )
    effective_college_id = int(order.college_id) if (order and order.college_id) else college_id
    bank_account = _resolve_bank_account_setting(
        db,
        academic_year_label=academic_year_label,
        semester=semester,
        college_id=effective_college_id,
    )
    return StudentPaymentOverviewResponse(
        order=order,
        transactions=transactions,
        clearance=_serialize_clearance(clearance),
        bank_account=bank_account,
        discount_policy_applied=None,
    )


@router.get("/admin/transactions", response_model=list[PaymentTransactionResponse], dependencies=[Depends(require_role("admin"))])
async def admin_list_transactions(
    method: str | None = Query(default=None),
    status_value: str | None = Query(default=None, alias="status"),
    academic_year_label: str | None = None,
    semester: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(PaymentTransaction).join(PaymentOrder, PaymentOrder.id == PaymentTransaction.payment_order_id)
    if method:
        q = q.filter(PaymentTransaction.method == method.upper())
    if status_value:
        q = q.filter(PaymentTransaction.status == status_value.upper())
    if academic_year_label:
        q = q.filter(PaymentOrder.academic_year_label == academic_year_label)
    if semester:
        q = q.filter(PaymentOrder.semester == semester)
    return q.order_by(PaymentTransaction.created_at.desc()).all()


@router.get("/admin/bank-receipts", response_model=list[BankReceiptResponse], dependencies=[Depends(require_role("admin"))])
async def admin_list_bank_receipts(
    review_status: str | None = None,
    db: Session = Depends(get_db),
):
    q = (
        db.query(BankReceipt, PaymentTransaction, PaymentOrder, User)
        .join(PaymentTransaction, PaymentTransaction.id == BankReceipt.payment_transaction_id)
        .join(PaymentOrder, PaymentOrder.id == PaymentTransaction.payment_order_id)
        .outerjoin(User, User.id == PaymentOrder.student_user_id)
    )
    if review_status:
        q = q.filter(BankReceipt.review_status == review_status.upper())
    rows = q.order_by(BankReceipt.created_at.desc()).all()
    result: list[BankReceiptResponse] = []
    for receipt, tx, order, student in rows:
        result.append(
            BankReceiptResponse(
                id=receipt.id,
                payment_transaction_id=receipt.payment_transaction_id,
                payment_order_id=getattr(tx, "payment_order_id", None),
                student_user_id=getattr(order, "student_user_id", None),
                student_name=getattr(student, "full_name", None),
                student_username=getattr(student, "username", None),
                student_code=(getattr(student, "student_code", None) or getattr(student, "username", None)),
                receipt_no=receipt.receipt_no,
                bank_name=receipt.bank_name,
                deposit_date=receipt.deposit_date,
                uploaded_file_url=receipt.uploaded_file_url,
                ocr_data_json=receipt.ocr_data_json,
                review_status=receipt.review_status,
                reviewed_by_user_id=receipt.reviewed_by_user_id,
                reviewed_at=receipt.reviewed_at,
                review_note=receipt.review_note,
                created_at=receipt.created_at,
                updated_at=receipt.updated_at,
            )
        )
    return result


@router.patch("/admin/bank-receipts/{receipt_id}/review", response_model=BankReceiptResponse, dependencies=[Depends(require_role("admin"))])
async def admin_review_bank_receipt(
    receipt_id: int,
    payload: BankReceiptReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receipt = db.query(BankReceipt).filter(BankReceipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    tx = db.query(PaymentTransaction).filter(PaymentTransaction.id == receipt.payment_transaction_id).first()
    order = db.query(PaymentOrder).filter(PaymentOrder.id == tx.payment_order_id).first() if tx else None
    if not tx or not order:
        raise HTTPException(status_code=404, detail="Receipt transaction/order not found")

    receipt.review_status = payload.review_status
    receipt.review_note = payload.review_note
    receipt.reviewed_by_user_id = current_user.id
    receipt.reviewed_at = _now()
    if payload.review_status == "APPROVED":
        tx.status = "SUCCESS"
        tx.confirmed_amount = tx.confirmed_amount if tx.confirmed_amount is not None else order.amount_due
        order.status = "PAID"
        order.registration_unlock_status = "UNLOCKED"
        order.paid_at = _now()
        _set_term_clearance(
            db,
            student_user_id=order.student_user_id,
            academic_year_label=order.academic_year_label,
            semester=order.semester,
            clearance_status="CLEARED",
            source="BANK_APPROVAL",
            notes=payload.review_note or "Bank receipt approved",
            actor_user_id=current_user.id,
        )
    else:
        tx.status = "FAILED"
        _set_term_clearance(
            db,
            student_user_id=order.student_user_id,
            academic_year_label=order.academic_year_label,
            semester=order.semester,
            clearance_status="NOT_CLEARED",
            source="BANK_REJECTED",
            notes=payload.review_note or "Bank receipt rejected",
            actor_user_id=current_user.id,
        )
    db.commit()
    db.refresh(receipt)
    return receipt


@router.get("/admin/clearance/{student_user_id}", response_model=list[StudentFinanceClearanceResponse], dependencies=[Depends(require_role("admin"))])
async def admin_student_clearance(student_user_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(StudentFinanceClearance)
        .filter(StudentFinanceClearance.student_user_id == student_user_id)
        .order_by(StudentFinanceClearance.updated_at.desc())
        .all()
    )
    return [_serialize_clearance(row) for row in rows if row]


# Legacy endpoints kept for backward compatibility with current front-end.
@router.post("/bank-slip", response_model=PaymentRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_bank_slip_legacy(
    payload: BankSlipCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can create bank slips")

    breakdown = _calculate_breakdown(25000.0, payload.gpa, None)
    now = _now()
    student_code = current_user.student_code or current_user.username or str(current_user.id)
    record = PaymentRecord(
        payment_reference=_payment_reference(student_code),
        student_user_id=current_user.id,
        student_code=student_code,
        student_name=current_user.full_name,
        college=current_user.college,
        gpa=payload.gpa,
        payment_method="bank",
        status="slip_issued",
        notes=payload.notes,
        slip_issued_at=now,
        base_tuition=breakdown["base_tuition"],
        discount_rate=breakdown["discount_rate"],
        discount_amount=breakdown["discount_amount"],
        tuition_after_discount=breakdown["tuition_after_discount"],
        lab_fee=breakdown["lab_fee"],
        library_fee=breakdown["library_fee"],
        activities_fee=breakdown["activities_fee"],
        insurance_fee=breakdown["insurance_fee"],
        total_internal_fees=breakdown["total_internal_fees"],
        final_total=breakdown["final_total"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/my-slips", response_model=list[PaymentRecordResponse])
async def my_slips(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(PaymentRecord)
        .filter(PaymentRecord.student_user_id == current_user.id)
        .order_by(PaymentRecord.created_at.desc())
        .all()
    )


@router.get("/student/{student_user_id}", response_model=list[PaymentRecordResponse], dependencies=[Depends(require_role("admin"))])
async def list_student_payments(student_user_id: int, db: Session = Depends(get_db)):
    return (
        db.query(PaymentRecord)
        .filter(PaymentRecord.student_user_id == student_user_id)
        .order_by(PaymentRecord.created_at.desc())
        .all()
    )


@router.patch("/{payment_id}/status", response_model=PaymentRecordResponse, dependencies=[Depends(require_role("admin"))])
async def update_payment_status(
    payment_id: int,
    payload: PaymentStatusUpdateRequest,
    db: Session = Depends(get_db),
):
    allowed = {"slip_issued", "paid", "cancelled"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {', '.join(sorted(allowed))}")

    record = db.query(PaymentRecord).filter(PaymentRecord.id == payment_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Payment record not found")

    record.status = payload.status
    record.notes = payload.notes if payload.notes is not None else record.notes
    if payload.status == "paid":
        record.paid_at = _now()
    db.commit()
    db.refresh(record)
    return record
    selected_credit_hours = _selected_credit_hours_for_student(
        db,
        student_user_id=current_user.id,
        academic_year_label=payload.academic_year_label,
        semester=payload.semester,
    )
    effective_base_amount = _resolve_term_base_amount(
        cfg,
        semester=payload.semester,
        selected_credit_hours=selected_credit_hours,
    )
