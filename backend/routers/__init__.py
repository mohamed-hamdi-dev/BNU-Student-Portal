# Routers package init
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.conversations import router as conversations_router
from routers.messages import router as messages_router
from routers.dashboard import router as dashboard_router
from routers.feedback import router as feedback_router
from routers.content import router as content_router
from routers.storage import router as storage_router
from routers.settings import router as settings_router
from routers.campus import router as campus_router
from routers.chatbot import router as chatbot_router
from routers.ai_router import router as ai_router
from routers.courses import router as courses_router
from routers.quizzes import router as quizzes_router
from routers.academic import router as academic_router
from routers.academic_core import router as academic_core_router
from routers.payment import router as payment_router
from routers.maintenance import router as maintenance_router
from routers.knowledge import router as knowledge_router
from routers.attendance import router as attendance_router

__all__ = [
    "auth_router", "users_router", 
    "conversations_router", "messages_router", 
    "dashboard_router", "feedback_router",
    "content_router", "storage_router", "settings_router",
    "campus_router", "chatbot_router", "ai_router", "courses_router", "quizzes_router", "academic_router", "academic_core_router", "payment_router", "maintenance_router", "knowledge_router", "attendance_router"
]
