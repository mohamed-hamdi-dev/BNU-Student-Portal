from core.database import SessionLocal
from models.campus import CampusPlace
from data.campus_places import campus_places

def _pick(source: dict, *keys):
    for key in keys:
        value = source.get(key)
        if value is not None:
            return value
    return None


def sync_campus_places(db):
    """
    Upsert default campus places into DB.
    - Adds missing places.
    - Updates matching defaults by English name.
    - Keeps custom admin-created places untouched.
    """
    inserted = 0
    updated = 0

    for p in campus_places:
        name = str(_pick(p, "name") or "").strip()
        if not name:
            continue

        existing = db.query(CampusPlace).filter(CampusPlace.name == name).first()
        payload = {
            "name": name,
            "name_ar": _pick(p, "name_ar", "nameAr"),
            "building_code": _pick(p, "building_code", "buildingCode"),
            "category": _pick(p, "category"),
            "icon_key": _pick(p, "icon_key", "iconKey"),
            "latitude": _pick(p, "latitude"),
            "longitude": _pick(p, "longitude"),
            "description": _pick(p, "description"),
            "description_ar": _pick(p, "description_ar", "descriptionAr"),
        }

        if existing:
            for field, value in payload.items():
                setattr(existing, field, value)
            updated += 1
            continue

        db.add(CampusPlace(**payload))
        inserted += 1

    db.commit()
    return inserted, updated


def seed_campus():
    db = SessionLocal()
    try:
        inserted, updated = sync_campus_places(db)
        print(f"Campus places sync complete. inserted={inserted}, updated={updated}")
    except Exception as e:
        print(f"Error seeding campus: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_campus()
