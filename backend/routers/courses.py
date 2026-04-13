"""
Courses Router.
Provides a lightweight courses endpoint used by GPA UI fallbacks.
"""

from typing import List
from fastapi import APIRouter

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("")
async def list_courses() -> List[dict]:
    """
    Return a minimal public list of courses.

    This keeps backward compatibility with frontend callers that still request
    /api/courses while the full academic module is being migrated.
    """
    return [
        {"id": "CS101", "code": "CS101", "name": "Introduction to Computer Science", "semester": "1", "credits": 3},
        {"id": "MTH101", "code": "MTH101", "name": "Mathematics 1", "semester": "1", "credits": 3},
        {"id": "PHY101", "code": "PHY101", "name": "Physics", "semester": "1", "credits": 3},
    ]

