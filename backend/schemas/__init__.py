from schemas.auth import Token, TokenPayload, LoginRequest, OTPRequest, OTPVerify, ResetPassword, ChangePassword
from schemas.user import UserBase, UserCreate, UserUpdate, UserAdminResponse, UserProfileResponse
from schemas.conversation import MessageCreate, MessageResponse, ConversationCreate, ConversationResponse
from schemas.dashboard import DashboardMetrics
from schemas.feedback import FeedbackCreate, FeedbackResponse
from schemas.content import ContentCreate, ContentUpdate, ContentResponse
from schemas.storage import StorageCreate, StorageUpdate, StorageResponse
from schemas.settings import SettingsUpdate, SettingsResponse
from schemas.campus import CampusPlaceCreate, CampusPlaceUpdate, CampusPlaceResponse
from schemas.chatbot import ChatbotMessageCreate, ChatbotMessageResponse, ChatbotSessionCreate, ChatbotSessionResponse, ChatbotSessionDetailResponse
from schemas.quiz import QuizCreate, QuizResponse, QuizSubmissionCreate, QuizSubmissionResponse
from schemas.academic import AcademicStatePayload, AcademicStateResponse
from schemas.academic_core import (
    CollegeCreate, CollegeResponse, CollegeUpdate,
    TrackCreate, TrackUpdate, TrackResponse,
    CurriculumPlanCreate, CurriculumPlanResponse,
    CourseCatalogCreate, CourseCatalogUpdate, CourseCatalogResponse,
    OfferingCreate, OfferingResponse,
    StudentProfileUpsert, StudentProfileResponse,
    FinanceStatusUpdate, FinanceStatusResponse,
    RegistrationWindowCreate, RegistrationWindowResponse,
    RegistrationSubmit, RegistrationStatusUpdate,
    RegistrationRequestResponse, RegistrationSelectionResponse,
    GradeEntryUpsert, GradePublishUpdate, GradeBookResponse,
    GradeImportPreviewRequest, GradeImportBatchResponse,
    AuditLogResponse,
)
from schemas.payment import PaymentCalculateRequest, PaymentBreakdownResponse, BankSlipCreateRequest, PaymentStatusUpdateRequest, PaymentRecordResponse
from schemas.user_photo import UserProfilePhotoResponse, UserProfilePhotoRejectRequest
from schemas.attendance import (
    AttendanceSessionCreate,
    AttendanceSessionResponse,
    AttendanceRecordUpsert,
    AttendanceRecordResponse,
    AttendanceMySummaryResponse,
    AttendanceCourseHistoryResponse,
)

__all__ = [
    "Token", "TokenPayload", "LoginRequest", "OTPRequest", "OTPVerify", "ResetPassword", "ChangePassword",
    "UserBase", "UserCreate", "UserUpdate", "UserAdminResponse", "UserProfileResponse",
    "MessageCreate", "MessageResponse", "ConversationCreate", "ConversationResponse",
    "DashboardMetrics", "FeedbackCreate", "FeedbackResponse", "ContentCreate", "ContentUpdate", "ContentResponse",
    "StorageCreate", "StorageUpdate", "StorageResponse", "SettingsUpdate", "SettingsResponse",
    "CampusPlaceCreate", "CampusPlaceUpdate", "CampusPlaceResponse",
    "ChatbotMessageCreate", "ChatbotMessageResponse", "ChatbotSessionCreate", "ChatbotSessionResponse", "ChatbotSessionDetailResponse",
    "QuizCreate", "QuizResponse", "QuizSubmissionCreate", "QuizSubmissionResponse",
    "AcademicStatePayload", "AcademicStateResponse",
    "CollegeCreate", "CollegeResponse", "CollegeUpdate",
    "TrackCreate", "TrackUpdate", "TrackResponse",
    "CurriculumPlanCreate", "CurriculumPlanResponse",
    "CourseCatalogCreate", "CourseCatalogUpdate", "CourseCatalogResponse",
    "OfferingCreate", "OfferingResponse",
    "StudentProfileUpsert", "StudentProfileResponse",
    "FinanceStatusUpdate", "FinanceStatusResponse",
    "RegistrationWindowCreate", "RegistrationWindowResponse",
    "RegistrationSubmit", "RegistrationStatusUpdate",
    "RegistrationRequestResponse", "RegistrationSelectionResponse",
    "GradeEntryUpsert", "GradePublishUpdate", "GradeBookResponse",
    "GradeImportPreviewRequest", "GradeImportBatchResponse",
    "AuditLogResponse",
    "PaymentCalculateRequest", "PaymentBreakdownResponse", "BankSlipCreateRequest", "PaymentStatusUpdateRequest", "PaymentRecordResponse",
    "UserProfilePhotoResponse", "UserProfilePhotoRejectRequest",
    "AttendanceSessionCreate", "AttendanceSessionResponse",
    "AttendanceRecordUpsert", "AttendanceRecordResponse",
    "AttendanceMySummaryResponse", "AttendanceCourseHistoryResponse",
]
