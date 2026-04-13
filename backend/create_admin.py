from core.database import SessionLocal
from models.user import User
from core.security import hash_password

def create_super_admin():
    db = SessionLocal()
    try:
        # Check if already exists
        admin = db.query(User).filter(User.username == "admin").first()
        if admin:
            print("Admin user already exists. Updating password to '123456'")
            admin.password_hash = hash_password("123456")
        else:
            print("Creating new super admin: username='admin', password='123456'")
            admin = User(
                username="admin",
                email="admin@bnu.edu.eg",
                full_name="Super Admin",
                password_hash=hash_password("123456"),
                role="admin",
                is_active=True
            )
            db.add(admin)
        db.commit()
        print("Success! You can now login with username: 'admin' and password: '123456'")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_super_admin()
