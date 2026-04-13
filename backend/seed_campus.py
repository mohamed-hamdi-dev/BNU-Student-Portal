from core.database import SessionLocal
from models.campus import CampusPlace
from data.campus_places import campus_places

def seed_campus():
    db = SessionLocal()
    try:
        count = db.query(CampusPlace).count()
        if count > 0:
            print(f"Campus places already seeded ({count} items found). Skipping.")
            return

        print("Seeding campus places into Database from static python dictionary...")
        for p in campus_places:
            place = CampusPlace(
                name=p.get('name'),
                name_ar=p.get('name_ar'),
                category=p.get('category'),
                latitude=p.get('latitude'),
                longitude=p.get('longitude'),
                description=p.get('description'),
                description_ar=p.get('description_ar')
            )
            db.add(place)
        
        db.commit()
        print("Successfully seeded campus places!")
    except Exception as e:
        print(f"Error seeding campus: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_campus()
