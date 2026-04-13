from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AcademicStatePayload(BaseModel):
    courses: list[dict[str, Any]] = []
    years: list[dict[str, Any]] = []
    openSemesters: dict[str, bool] = {"autumn": True, "spring": False, "summer": False}
    registrationSettings: dict[str, Any] = {"activeAcademicYear": "1", "enforcePrerequisites": True, "enforceMaxHours": True}
    studentRegistrations: list[dict[str, Any]] = []
    academicRecords: list[dict[str, Any]] = []


class AcademicStateResponse(AcademicStatePayload):
    updatedAt: datetime


class TrackSelectionStatusResponse(BaseModel):
    policyFound: bool = False
    branchingYear: str = ""
    isBranchingOpen: bool = False
    currentStudyYear: str = ""
    coordinationStatus: str = "not_eligible"
    tracks: list[dict[str, str]] = []
    preferences: list[dict[str, str | int]] = []
    finalAssignedTrackId: str = ""
    finalAssignedTrackName: str = ""
    selectedTrackId: str = ""
    selectedTrackName: str = ""
    selectionLocked: bool = False
    windowConfigured: bool = False
    windowOpen: bool = True
    windowStartsAt: str | None = None
    windowEndsAt: str | None = None
    message: str = ""


class TrackSelectionRequest(BaseModel):
    trackId: str = Field(..., min_length=1, max_length=200)


class TrackPreferencesRequest(BaseModel):
    trackIds: list[str] = Field(..., min_length=1, max_length=3)


class TrackAssignmentRequest(BaseModel):
    studentId: int
    trackId: str = Field(..., min_length=1, max_length=200)


class TrackCoordinationStatusUpdate(BaseModel):
    studentId: int
    coordinationStatus: str = Field(..., pattern="^(eligible_for_specialization|preferences_submitted|under_review|final_assigned)$")


class TrackBulkGpaAssignmentRequest(BaseModel):
    college: str | None = None
    capacities: dict[str, int] = {}


class TrackSelectionWindowUpdate(BaseModel):
    collegeKey: str | None = None
    startsAt: datetime
    endsAt: datetime
    enabled: bool = True
