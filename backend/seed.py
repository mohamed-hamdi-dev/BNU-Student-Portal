"""
Seed Script: Migrate users from frontend/Data/db.json to the new SQLite database.

This script ensures we don't lose existing users and admin accounts while
switching architecture.
"""

import json
from pathlib import Path

from core.database import SessionLocal, create_all_tables
from core.security import hash_password
from models.user import User
from routers.academic_core import seed_default_assessment_templates


def run_seed():
    print("Ensuring database tables exist...")
    create_all_tables()

    db_path = Path(__file__).resolve().parent.parent / "frontend" / "Data" / "db.json"
    if not db_path.exists():
        print(f"Not found: {db_path}. No existing users to migrate.")
        return

    print(f"Reading {db_path}...")
    try:
        raw_data = db_path.read_text(encoding="utf-8").lstrip("\ufeff")
        data = json.loads(raw_data)
        users = data.get("users", [])
    except Exception as e:
        print(f"Failed to load db.json: {e}")
        return

    db = SessionLocal()
    try:
        seed_default_assessment_templates(db)

        migrated = 0
        skipped = 0

        for user_data in users:
            # Skip if already exists by username or email
            username = user_data.get("username", "").strip()
            email = user_data.get("email", "").strip()
            
            if not username or not email:
                continue
                
            exists = db.query(User).filter(
                (User.username == username) | (User.email == email)
            ).first()

            if exists:
                skipped += 1
                continue

            # Create new user record
            raw_password = user_data.get("password", "123456")
            
            # Note: the old Express server hashed passwords with bcrypt "if length < 60".
            # To normalize, we just re-hash it properly here. (If it's already a hash, 
            # the user will have to login with the hash string or reset password. This is 
            # a known edge case when migrating raw hashes without the original salt logic, 
            # but for our purposes, we'll assume it's raw or rely on password reset.)
            
            pwd_hash = raw_password
            if len(raw_password) < 60:
                pwd_hash = hash_password(raw_password)

            u = User(
                username=username,
                email=email,
                password_hash=pwd_hash,
                full_name=user_data.get("name", "Unknown User"),
                role=user_data.get("role", "student").lower(),
                student_code=user_data.get("studentId"),
                college=user_data.get("college"),
                major=user_data.get("major"),
                level=user_data.get("level"),
                national_id=user_data.get("nationalId"),
                nationality=user_data.get("nationality"),
                gender=user_data.get("gender"),
                birth_place=user_data.get("birthPlace"),
                is_active=True
            )
            db.add(u)
            migrated += 1

        db.commit()
        print(f"Migration complete! Migrated: {migrated}, Skipped (already exist): {skipped}")
    except Exception as e:
        db.rollback()
        print(f"Error during migration: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
