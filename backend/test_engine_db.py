import os
import sys

# Ensure backend dir is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from core.database import engine, Base
from models.academic_core import CoursePrerequisite, ProgramRegulation

# This will create missing tables in the sqlite db (which is handy for testing)
print("Creating tables if they don't exist...")
Base.metadata.create_all(bind=engine)
print("Done!")

