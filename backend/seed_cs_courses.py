import os
import sys

# Add backend directory to sys.path so we can import modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import SessionLocal
from models.academic_core import CourseCatalog, College, CollegeTrack

def run_seed():
    db = SessionLocal()
    try:
        # Find the CS college
        cs_college = db.query(College).filter(College.code == "CS").first()
        if not cs_college:
            cs_college = College(code="CS", name_ar="علوم الحاسب", name_en="Computer Science")
            db.add(cs_college)
            db.commit()
            db.refresh(cs_college)

        # Find or create AI track for CS
        ai_track = db.query(CollegeTrack).filter(CollegeTrack.college_id == cs_college.id, CollegeTrack.code == "AI").first()
        if not ai_track:
            ai_track = CollegeTrack(college_id=cs_college.id, code="AI", name_ar="الذكاء الاصطناعي", name_en="Artificial Intelligence")
            db.add(ai_track)
            db.commit()
            db.refresh(ai_track)


        # Data map
        courses_data = [
            # Year 1
            {"code": "GEN104", "title_ar": "History of Science, Engineering & Technology", "study_year": 1, "semester": "autumn"},
            {"code": "BAS120", "title_ar": "Differential and Integral Calculus", "study_year": 1, "semester": "autumn"},
            {"code": "BAS121", "title_ar": "Physics", "study_year": 1, "semester": "autumn"},
            {"code": "BAS122", "title_ar": "Discrete Mathematics", "study_year": 1, "semester": "autumn"},
            {"code": "BCS101", "title_ar": "Computer Science Fundamentals", "study_year": 1, "semester": "autumn"},
            {"code": "BCS102", "title_ar": "Structured Programming", "study_year": 1, "semester": "autumn"},
            {"code": "GEN10X", "title_ar": "لغة اختيارية", "study_year": 1, "semester": "spring"},
            {"code": "BAS123", "title_ar": "Linear Algebra", "study_year": 1, "semester": "spring"},
            {"code": "BAS124", "title_ar": "Electronics", "study_year": 1, "semester": "spring"},
            {"code": "BCS103", "title_ar": "Object Oriented Programming", "study_year": 1, "semester": "spring"},
            {"code": "BCS105", "title_ar": "Computer Networks Fundamentals", "study_year": 1, "semester": "spring"},
            {"code": "BCS112", "title_ar": "Technical Report Writing", "study_year": 1, "semester": "spring"},

            # Year 2
            {"code": "GEN202", "title_ar": "Communication & Presentation Skills", "study_year": 2, "semester": "autumn"},
            {"code": "GEN201", "title_ar": "Transparency & Human Rights", "study_year": 2, "semester": "autumn"},
            {"code": "BAS201", "title_ar": "Probability and Statistical Methods", "study_year": 2, "semester": "autumn"},
            {"code": "BAS203", "title_ar": "Differential Equations", "study_year": 2, "semester": "autumn"},
            {"code": "BCS206", "title_ar": "Data Structures", "study_year": 2, "semester": "autumn"},
            {"code": "BCS207", "title_ar": "Logic Design", "study_year": 2, "semester": "autumn"},
            {"code": "BAS225", "title_ar": "Statistical Analysis", "study_year": 2, "semester": "spring"},
            {"code": "BCS204", "title_ar": "Fundamentals of Databases", "study_year": 2, "semester": "spring"},
            {"code": "BCS208", "title_ar": "Design and Analysis of Algorithms", "study_year": 2, "semester": "spring"},
            {"code": "BCS209", "title_ar": "Computer Architecture", "study_year": 2, "semester": "spring"},
            {"code": "BCS210", "title_ar": "Operating Systems", "study_year": 2, "semester": "spring"},
            {"code": "AIM230", "title_ar": "Field Training (I)", "study_year": 2, "semester": "summer"},

            # Year 3 - AI
            {"code": "BCS311", "title_ar": "Artificial Intelligence", "study_year": 3, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "AIM301", "title_ar": "Software Engineering", "study_year": 3, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "AIM302", "title_ar": "Microprocessors and Assembly Language", "study_year": 3, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "AIM303", "title_ar": "Systems Analysis and Design", "study_year": 3, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "AIM305", "title_ar": "Knowledge Representation & Reasoning 1", "study_year": 3, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "AIM304", "title_ar": "Machine Learning", "study_year": 3, "track_id": ai_track.id, "semester": "spring"},
            {"code": "AIM306", "title_ar": "Robotics", "study_year": 3, "track_id": ai_track.id, "semester": "spring"},
            {"code": "AIM307", "title_ar": "Neural Networks", "study_year": 3, "track_id": ai_track.id, "semester": "spring"},
            {"code": "AIM308", "title_ar": "Natural Language Processing", "study_year": 3, "track_id": ai_track.id, "semester": "spring"},
            {"code": "AIM309", "title_ar": "Image Processing", "study_year": 3, "track_id": ai_track.id, "semester": "spring"},
            {"code": "AIM340", "title_ar": "Field Training (II)", "study_year": 3, "track_id": ai_track.id, "semester": "summer"},

            # Year 4 - AI
            {"code": "GEN401", "title_ar": "Professional Ethics", "study_year": 4, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "AIM401", "title_ar": "Deep Learning", "study_year": 4, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "AIM402", "title_ar": "Computer Vision", "study_year": 4, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "AIM440", "title_ar": "Graduation Project (1)", "study_year": 4, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "AIM-ELEC-2-3", "title_ar": "Elective (2) & (3)", "study_year": 4, "track_id": ai_track.id, "semester": "autumn"},
            {"code": "GEN407", "title_ar": "Entrepreneurship", "study_year": 4, "track_id": ai_track.id, "semester": "spring"},
            {"code": "AIM403", "title_ar": "Data Science", "study_year": 4, "track_id": ai_track.id, "semester": "spring"},
            {"code": "AIM450", "title_ar": "Graduation Project (2)", "study_year": 4, "track_id": ai_track.id, "semester": "spring"},
            {"code": "AIM-ELEC-4-6", "title_ar": "Elective (4) (5) (6)", "study_year": 4, "track_id": ai_track.id, "semester": "spring"},
        ]

        updated_count = 0
        added_count = 0

        for c_data in courses_data:
            existing = db.query(CourseCatalog).filter(
                CourseCatalog.code == c_data["code"],
                CourseCatalog.college_id == cs_college.id
            ).first()

            if existing: # Update instead of skipping!
                existing.semester = c_data["semester"]
                existing.study_year = c_data["study_year"]
                existing.title_ar = c_data["title_ar"]
                existing.title_en = c_data["title_ar"] # Sync English title
                existing.track_id = c_data.get("track_id")
                updated_count += 1
            else:
                new_course = CourseCatalog(
                    code=c_data["code"],
                    title_ar=c_data["title_ar"],
                    title_en=c_data["title_ar"],
                    college_id=cs_college.id,
                    study_year=c_data["study_year"],
                    semester=c_data["semester"],
                    track_id=c_data.get("track_id"),
                    credit_hours=3.0,
                    lecture_hours=2.0
                )
                db.add(new_course)
                added_count += 1

        db.commit()
        print(f"Update script complete! Added: {added_count}, Updated: {updated_count}")

    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()
