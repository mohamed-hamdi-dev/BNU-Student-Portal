from typing import List
from dataclasses import dataclass

@dataclass
class GPACourse:
    name: str
    credits: float
    grade: str  # A, B, C, D, F (with +/- variations)

# Grade point mapping
GRADE_POINTS = {
    "A+": 4.0,
    "A": 4.0,
    "A-": 3.7,
    "B+": 3.3,
    "B": 3.0,
    "B-": 2.7,
    "C+": 2.3,
    "C": 2.0,
    "C-": 1.7,
    "D+": 1.3,
    "D": 1.0,
    "D-": 0.7,
    "F": 0.0,
}

def get_grade_points(grade: str) -> float:
    """
    Convert letter grade to grade points.
    
    Args:
        grade: Letter grade (e.g., "A", "B+", "C-")
    
    Returns:
        Grade points (0.0 to 4.0)
    
    Raises:
        ValueError: If grade is not recognized
    """
    grade_upper = grade.upper().strip()
    
    if grade_upper not in GRADE_POINTS:
        raise ValueError(f"Invalid grade: {grade}. Valid grades are: {', '.join(GRADE_POINTS.keys())}")
    
    return GRADE_POINTS[grade_upper]

def calculate_gpa(courses: List[GPACourse]) -> dict:
    """
    Calculate GPA from a list of courses.
    
    Args:
        courses: List of GPACourse objects
    
    Returns:
        Dictionary with:
        - gpa: Calculated GPA (total_points / total_credits)
        - total_credits: Sum of all credits
        - total_points: Sum of all grade points (credits * grade_points)
    
    Raises:
        ValueError: If no courses provided or invalid data
    """
    if not courses:
        raise ValueError("No courses provided")
    
    total_points = 0.0
    total_credits = 0.0
    
    for course in courses:
        grade_points = get_grade_points(course.grade)
        points = course.credits * grade_points
        total_points += points
        total_credits += course.credits
    
    if total_credits == 0:
        raise ValueError("Total credits cannot be zero")
    
    gpa = total_points / total_credits
    
    return {
        "gpa": round(gpa, 2),
        "total_credits": round(total_credits, 2),
        "total_points": round(total_points, 2)
    }
