# Academic Core API (New)

Base prefix: `/api/academic-core`

## 1) Setup (Admin)

- `POST /colleges`
- `GET /colleges`
- `PATCH /colleges/{college_id}`
- `POST /colleges/{college_id}/tracks`
- `GET /colleges/{college_id}/tracks`
- `POST /catalog`
- `GET /catalog`
- `POST /offerings`
- `GET /offerings`
- `POST /student-profiles`
- `POST /registration-windows`
- `GET /registration-windows`
- `PATCH /finance/{student_user_id}`

## 2) Student

- `GET /student-profiles/me`
- `POST /tracks/select/{track_id}`
- `GET /offerings/me-available?academic_year_label=2025-2026&semester=autumn`
- `POST /registration/submit`
- `GET /registration/me?academic_year_label=2025-2026&semester=autumn`

## 3) Advisor / Control (doctor, admin)

- `PATCH /registration/{request_id}/status`  
  statuses: `draft | submitted | advisor_approved | locked`

## 4) Grades (doctor, admin)

- `POST /grades/upsert`
- `PATCH /grades/{gradebook_id}/publish`  
  publish statuses: `draft | reviewed | published`

## 5) Auditing

- `GET /audit-logs`

## Suggested operational flow

1. Admin creates college + tracks + catalog + offerings.
2. Admin creates registration window for term.
3. Finance clears student (`/finance/{student_user_id}`) OR payment status is `paid`.
4. Student submits registration.
5. Advisor approves and locks.
6. Doctor enters grades by cycle and control publishes.
