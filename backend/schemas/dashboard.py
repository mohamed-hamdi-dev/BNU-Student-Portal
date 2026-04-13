"""Dashboard Pydantic schemas."""

from pydantic import BaseModel
from typing import Dict


class DashboardMetrics(BaseModel):
    total_users: int
    active_students: int
    active_conversations: int
    pending_feedback: int
    users_by_college: Dict[str, int]
