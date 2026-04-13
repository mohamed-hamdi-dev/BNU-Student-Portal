from datetime import datetime, timedelta, timezone
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, inspect, text, or_, func
from sqlalchemy.orm import Session

from core.deps import get_current_user, get_db, require_role
from models.quiz import Quiz, QuizSubmission
from models.academic_core import RegistrationRequest, RegistrationCourseSelection, CourseOffering, CourseCatalog
from models.user import User
from schemas.quiz import (
    QuizCreate,
    QuizResponse,
    QuizSubmissionCreate,
    QuizSubmissionResponse,
    QuizSubmissionsPageResponse,
)


router = APIRouter(prefix="/quizzes", tags=["quizzes"])

ARCHIVE_DAYS_DEFAULT = 120


def ensure_quiz_schema(db: Session) -> None:
    """Schema is managed centrally by ORM metadata creation."""
    return None


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        local_tz = datetime.now().astimezone().tzinfo or timezone.utc
        return dt.replace(tzinfo=local_tz).astimezone(timezone.utc)
    return dt.astimezone(timezone.utc)


def _serialize_quiz(quiz: Quiz) -> QuizResponse:
    try:
        questions = json.loads(quiz.questions_json or "[]")
        if not isinstance(questions, list):
            questions = []
    except json.JSONDecodeError:
        questions = []

    return QuizResponse(
        id=quiz.id,
        title=quiz.title,
        duration=quiz.duration,
        courseCode=quiz.course_code,
        collegeId=quiz.college_id,
        visibility=quiz.visibility or "college",
        academicYear=quiz.academic_year,
        term=quiz.term,
        section=quiz.section,
        startTime=quiz.start_time,
        endTime=quiz.end_time,
        questions=questions,
    )


def _normalize_term(value: str | None) -> str | None:
    if not value:
        return None
    raw = str(value).strip().lower()
    mapping = {
        "autumn": "autumn",
        "fall": "autumn",
        "first": "autumn",
        "spring": "spring",
        "second": "spring",
        "summer": "summer",
        "ترم اول": "autumn",
        "الاول": "autumn",
        "ترم ثاني": "spring",
        "الثاني": "spring",
        "صيف": "summer",
    }
    return mapping.get(raw, raw)


def _normalize_visibility(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    return "global" if raw == "global" else "college"


def _submission_status(submission: QuizSubmission, quiz: Quiz | None) -> str:
    if not quiz or not quiz.end_time:
        return "submitted"
    return "late" if submission.submitted_at > quiz.end_time else "on_time"


def _serialize_submission(submission: QuizSubmission, quiz: Quiz | None) -> QuizSubmissionResponse:
    return QuizSubmissionResponse(
        id=submission.id,
        quizId=submission.quiz_id,
        studentId=submission.student_id,
        studentName=submission.student_name,
        quizTitle=submission.quiz_title,
        courseCode=submission.course_code,
        academicYear=submission.academic_year,
        term=submission.term,
        section=submission.section,
        status=_submission_status(submission, quiz),
        score=submission.score,
        submittedAt=submission.submitted_at,
    )


@router.get("", response_model=list[QuizResponse])
async def list_quizzes(
    college_id: str | None = Query(default=None, alias="collegeId"),
    visibility: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Quiz)
    role = (current_user.role or "").lower()

    if role == "doctor":
        query = query.filter(Quiz.created_by == current_user.id)
    elif role == "student":
        query = query.filter(Quiz.is_active == True)
        final_statuses = ("registered", "approved", "locked", "graded")
        student_course_rows = (
            db.query(CourseCatalog.code)
            .join(CourseOffering, CourseOffering.course_id == CourseCatalog.id)
            .join(RegistrationCourseSelection, RegistrationCourseSelection.offering_id == CourseOffering.id)
            .join(RegistrationRequest, RegistrationRequest.id == RegistrationCourseSelection.registration_request_id)
            .filter(RegistrationRequest.student_user_id == current_user.id)
            .filter(func.lower(RegistrationRequest.status).in_(final_statuses))
            .all()
        )
        registered_codes = {
            str(row[0]).strip().upper()
            for row in student_course_rows
            if row and str(row[0] or "").strip()
        }
        if registered_codes:
            query = query.filter(
                or_(
                    Quiz.course_code.is_(None),
                    func.trim(Quiz.course_code) == "",
                    func.upper(Quiz.course_code).in_(registered_codes),
                )
            )
        else:
            query = query.filter(or_(Quiz.course_code.is_(None), func.trim(Quiz.course_code) == ""))

    if visibility:
        query = query.filter(func.lower(Quiz.visibility) == _normalize_visibility(visibility))

    if college_id:
        normalized = college_id.strip().lower()
        query = query.filter(
            or_(
                func.lower(Quiz.visibility) == "global",
                func.lower(Quiz.college_id) == normalized,
            )
        )

    quizzes = query.order_by(Quiz.created_at.desc()).all()
    return [_serialize_quiz(quiz) for quiz in quizzes]


@router.post("", response_model=QuizResponse, dependencies=[Depends(require_role("admin", "doctor"))])
async def create_quiz(
    payload: QuizCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    quiz = Quiz(
        id=str(uuid.uuid4()),
        title=payload.title.strip(),
        duration=max(1, int(payload.duration or 15)),
        course_code=(payload.course_code or "").strip() or None,
        college_id=(payload.college_id or "").strip() or None,
        visibility=_normalize_visibility(payload.visibility),
        academic_year=(payload.academic_year or "").strip() or None,
        term=_normalize_term(payload.term),
        section=(payload.section or "").strip() or None,
        start_time=_to_utc(payload.start_time),
        end_time=_to_utc(payload.end_time),
        questions_json=json.dumps([question.model_dump() for question in payload.questions], ensure_ascii=False),
        created_by=current_user.id,
        created_at=now,
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return _serialize_quiz(quiz)


@router.put("/{quiz_id}", response_model=QuizResponse, dependencies=[Depends(require_role("admin", "doctor"))])
async def update_quiz(
    quiz_id: str,
    payload: QuizCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    if (current_user.role or "").lower() == "doctor" and quiz.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can update only your own quizzes")

    quiz.title = payload.title.strip()
    quiz.duration = max(1, int(payload.duration or 15))
    quiz.course_code = (payload.course_code or "").strip() or None
    quiz.college_id = (payload.college_id or "").strip() or None
    quiz.visibility = _normalize_visibility(payload.visibility)
    quiz.academic_year = (payload.academic_year or "").strip() or None
    quiz.term = _normalize_term(payload.term)
    quiz.section = (payload.section or "").strip() or None
    quiz.start_time = _to_utc(payload.start_time)
    quiz.end_time = _to_utc(payload.end_time)
    quiz.questions_json = json.dumps([question.model_dump() for question in payload.questions], ensure_ascii=False)

    db.query(QuizSubmission).filter(QuizSubmission.quiz_id == quiz_id).update(
        {
            "quiz_title": quiz.title,
            "course_code": quiz.course_code,
            "academic_year": quiz.academic_year,
            "term": quiz.term,
            "section": quiz.section,
        },
        synchronize_session=False,
    )

    db.commit()
    db.refresh(quiz)
    return _serialize_quiz(quiz)


@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("admin", "doctor"))])
async def delete_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    if (current_user.role or "").lower() == "doctor" and quiz.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can delete only your own quizzes")

    db.query(QuizSubmission).filter(QuizSubmission.quiz_id == quiz_id).delete()
    db.delete(quiz)
    db.commit()
    return None


@router.post("/{quiz_id}/submit", response_model=QuizSubmissionResponse)
async def submit_quiz(
    quiz_id: str,
    payload: QuizSubmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").lower() != "student":
        raise HTTPException(status_code=403, detail="Only students can submit quizzes")

    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    now = datetime.now(timezone.utc)
    start_time = _to_utc(quiz.start_time)
    end_time = _to_utc(quiz.end_time)
    if start_time and now < start_time:
        raise HTTPException(status_code=400, detail="Quiz is not open yet")
    if end_time and now > end_time:
        raise HTTPException(status_code=400, detail="Quiz has ended")

    score = payload.score
    if score is None:
        answers = payload.answers or {}
        try:
            questions = json.loads(quiz.questions_json or "[]")
        except json.JSONDecodeError:
            questions = []
        if not questions:
            score = 0
        else:
            correct_count = 0
            for index, question in enumerate(questions):
                expected = int(question.get("correct", 0))
                submitted = answers.get(str(index), answers.get(index))
                if submitted is not None and int(submitted) == expected:
                    correct_count += 1
            score = round((correct_count / len(questions)) * 100)

    safe_score = max(0, min(100, int(score)))
    existing = db.query(QuizSubmission).filter(
        QuizSubmission.quiz_id == quiz_id,
        QuizSubmission.student_id == current_user.id,
    ).first()

    if existing:
        raise HTTPException(status_code=409, detail="Quiz already submitted")

    submission = QuizSubmission(
        id=str(uuid.uuid4()),
        quiz_id=quiz_id,
        student_id=current_user.id,
        student_name=current_user.full_name,
        quiz_title=quiz.title,
        course_code=quiz.course_code,
        academic_year=quiz.academic_year,
        term=quiz.term,
        section=quiz.section,
        score=safe_score,
        submitted_at=now,
    )
    db.add(submission)

    db.commit()
    db.refresh(submission)
    return _serialize_submission(submission, quiz)


@router.get("/my-results", response_model=list[QuizSubmissionResponse])
async def my_results(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").lower() != "student":
        raise HTTPException(status_code=403, detail="Only students can view student quiz results")

    results = db.query(QuizSubmission).filter(
        QuizSubmission.student_id == current_user.id
    ).order_by(QuizSubmission.submitted_at.desc()).all()

    quiz_map = {q.id: q for q in db.query(Quiz).filter(Quiz.id.in_([r.quiz_id for r in results])).all()} if results else {}
    return [_serialize_submission(item, quiz_map.get(item.quiz_id)) for item in results]


@router.get("/submissions", response_model=list[QuizSubmissionResponse], dependencies=[Depends(require_role("admin", "doctor"))])
async def list_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(QuizSubmission, Quiz)
        .join(Quiz, Quiz.id == QuizSubmission.quiz_id)
        .join(User, User.id == QuizSubmission.student_id)
        .filter(User.role == "student")
    )
    if (current_user.role or "").lower() == "doctor":
        query = query.filter(Quiz.created_by == current_user.id)

    rows = query.order_by(QuizSubmission.submitted_at.desc()).all()
    return [_serialize_submission(submission, quiz) for submission, quiz in rows]


@router.get("/submissions/query", response_model=QuizSubmissionsPageResponse, dependencies=[Depends(require_role("admin", "doctor"))])
async def query_submissions(
    course_code: str | None = Query(default=None, alias="courseCode"),
    term: str | None = None,
    academic_year: str | None = Query(default=None, alias="academicYear"),
    section: str | None = None,
    student_query: str | None = Query(default=None, alias="studentQuery"),
    status_filter: str = Query(default="all", alias="status"),
    scope: str = Query(default="current"),
    date_from: datetime | None = Query(default=None, alias="dateFrom"),
    date_to: datetime | None = Query(default=None, alias="dateTo"),
    page: int = 1,
    page_size: int = Query(default=25, alias="pageSize"),
    sort_by: str = Query(default="submittedAt", alias="sortBy"),
    sort_dir: str = Query(default="desc", alias="sortDir"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=ARCHIVE_DAYS_DEFAULT)

    query = (
        db.query(QuizSubmission, Quiz)
        .join(Quiz, Quiz.id == QuizSubmission.quiz_id)
        .join(User, User.id == QuizSubmission.student_id)
        .filter(User.role == "student")
    )
    if (current_user.role or "").lower() == "doctor":
        query = query.filter(Quiz.created_by == current_user.id)

    if course_code:
        query = query.filter(QuizSubmission.course_code == course_code)
    if term:
        query = query.filter(QuizSubmission.term == _normalize_term(term))
    if academic_year:
        query = query.filter(QuizSubmission.academic_year == academic_year)
    if section:
        query = query.filter(QuizSubmission.section == section)

    if student_query:
        q = f"%{student_query.strip()}%"
        query = query.filter((QuizSubmission.student_name.ilike(q)) | (QuizSubmission.student_id.cast(String).ilike(q)))

    if date_from:
        query = query.filter(QuizSubmission.submitted_at >= _to_utc(date_from))
    if date_to:
        query = query.filter(QuizSubmission.submitted_at <= _to_utc(date_to))

    if scope == "archive":
        query = query.filter(QuizSubmission.submitted_at < cutoff)
    elif scope == "current":
        query = query.filter(QuizSubmission.submitted_at >= cutoff)

    rows = query.all()
    filtered_rows = []
    for submission, quiz in rows:
        status_value = _submission_status(submission, quiz)
        if status_filter in {"on_time", "late"} and status_value != status_filter:
            continue
        filtered_rows.append((submission, quiz, status_value))

    sort_key_map = {
        "score": lambda item: item[0].score,
        "studentName": lambda item: (item[0].student_name or "").lower(),
        "submittedAt": lambda item: item[0].submitted_at,
    }
    key_func = sort_key_map.get(sort_by, sort_key_map["submittedAt"])
    reverse = sort_dir.lower() != "asc"
    filtered_rows.sort(key=key_func, reverse=reverse)

    total = len(filtered_rows)
    page_size = max(1, min(page_size, 100))
    page = max(1, page)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = filtered_rows[start:end]

    items = [_serialize_submission(submission, quiz) for submission, quiz, _ in page_items]
    summary = {
        "on_time": sum(1 for _, _, st in filtered_rows if st == "on_time"),
        "late": sum(1 for _, _, st in filtered_rows if st == "late"),
        "average_score": round(sum(item[0].score for item in filtered_rows) / total, 2) if total else 0,
    }

    total_pages = (total + page_size - 1) // page_size
    return QuizSubmissionsPageResponse(
        items=items,
        total=total,
        page=page,
        pageSize=page_size,
        totalPages=total_pages,
        summary=summary,
    )
