import React from "react";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import Layout from "./layout/Layout.jsx";
import ForgetPassword from "./pages/ForgetPassword.jsx";
import StudentDashboardPage from "./pages/student/StudentDashboardPage.jsx";
import ErrorPage from "./pages/ErrorPage.jsx";
import StudentPage from "./pages/student/StudentPage.jsx";
import CourseTable from "./pages/CourseTable.jsx";
import CourseTablePrint from "./pages/CourseTablePrint.jsx";
import TranscriptPrint from "./components/TranscriptPrint.jsx";
import Payment from "./pages/Payment.jsx";
import AcademicRegistration from "./pages/AcademicRegistration.jsx";
import QiezBNU from "./pages/QiezBNU/QiezBNU.jsx";
import PhotoUpload from "./pages/PhotoUpload.jsx";
import SectionsSelectionPage from "./pages/SectionsSelectionPage.jsx";
import RegistrationFormPage from "./pages/academicStudent/RegistrationFormPage.jsx";
import AdminDashboard from "./pages/dashboard/AdminDashboard.jsx";
import AdminQuiz from "./pages/QiezBNU/AdminQuiz.jsx";
import ProtectedRoute from "./components/common/ProtectedRoute.jsx";
import AdminPortalLayout from "./pages/dashboard/AdminPortalLayout.jsx";
import CourseManagement from "./pages/dashboard/CourseManagement.jsx";
import OpenSemesterSummaryPage from "./pages/academicStudent/OpenSemesterSummaryPage.jsx";
import AdminRegistrationControlPage from "./pages/academicAdmin/AdminRegistrationControlPage.jsx";
import AdminProfileHoverPage from "./pages/dashboard/AdminProfileHoverPage.jsx";
import AdminAttendancePage from "./pages/dashboard/AdminAttendancePage.jsx";
import AdminUsersPage from "./pages/dashboard/AdminUsersPage.jsx";
import ChatDashboardPage from "./pages/dashboard/ChatDashboardPage.jsx";
import AdminPhotoReviewPage from "./pages/dashboard/AdminPhotoReviewPage.jsx";
import AdminTrackCoordinationPage from "./pages/dashboard/AdminTrackCoordinationPage.jsx";
import AdminPasswordPage from "./pages/dashboard/AdminPasswordPage.jsx";
import AdminRegistrationPoliciesPage from "./pages/dashboard/AdminRegistrationPoliciesPage.jsx";
import AdminCampusPlacesPage from "./pages/dashboard/AdminCampusPlacesPage.jsx";
import AdvisorRegistrationRequestsPage from "./pages/academicAdmin/AdvisorRegistrationRequestsPage.jsx";
import StudentAdvisorRequestPage from "./pages/academicStudent/StudentAdvisorRequestPage.jsx";
import AdminBankReceiptsPage from "./pages/academicAdmin/AdminBankReceiptsPage.jsx";
import AdminPaymentSetupPage from "./pages/academicAdmin/AdminPaymentSetupPage.jsx";

const router = createBrowserRouter([
    {
        path: "/",
        element: <LoginPage />,
    },

    {
        path: "/forget-password",
        element: <ForgetPassword />,
    },
    {
        path: "/transcript",
        element: <TranscriptPrint />,
    },

    // صفحات الأدمن فقط
    {
        element: <ProtectedRoute role={["admin", "doctor", "advisor"]} />,
        children: [
            {
                path: "/admin",
                element: <AdminPortalLayout />,
                children: [
                    { index: true, element: <Navigate to="/admin/admin-profile" replace /> },
                    {
                        element: <ProtectedRoute role="admin" />,
                        children: [
                            { path: "registration-control", element: <AdminRegistrationControlPage /> },
                            { path: "course-management", element: <CourseManagement /> },
                            { path: "users", element: <AdminUsersPage /> },
                            { path: "photo-reviews", element: <AdminPhotoReviewPage /> },
                            { path: "track-coordination", element: <AdminTrackCoordinationPage /> },
                            { path: "registration-policies", element: <AdminRegistrationPoliciesPage /> },
                            { path: "campus-places", element: <AdminCampusPlacesPage /> },
                            { path: "bank-receipts", element: <AdminBankReceiptsPage /> },
                            { path: "payment-setup", element: <AdminPaymentSetupPage /> },
                        ],
                    },
                    {
                        element: <ProtectedRoute role={["admin", "doctor", "advisor"]} />,
                        children: [
                            { path: "admin-profile", element: <AdminProfileHoverPage /> },
                            { path: "password-security", element: <AdminPasswordPage /> },
                        ],
                    },
                    {
                        element: <ProtectedRoute role={["admin", "doctor"]} />,
                        children: [
                            { path: "dashboard", element: <AdminDashboard /> },
                            { path: "attendance-scanner", element: <AdminAttendancePage /> },
                            { path: "quiz", element: <AdminQuiz /> },
                        ],
                    },
                    {
                        element: <ProtectedRoute role={["admin"]} />,
                        children: [{ path: "student-summary", element: <OpenSemesterSummaryPage /> }],
                    },
                    {
                        element: <ProtectedRoute role={["admin", "advisor"]} />,
                        children: [{ path: "advisor-requests", element: <AdvisorRegistrationRequestsPage /> }],
                    },
                    { path: "*", element: <ErrorPage /> },
                ],
            },
            { path: "/HomeDashboard", element: <Navigate to="/admin/admin-profile" replace /> },
            { path: "/AdminDashboard", element: <Navigate to="/admin/admin-profile" replace /> },
            { path: "/CourseManagement", element: <Navigate to="/admin/course-management" replace /> },
            { path: "/AdminQuiz", element: <Navigate to="/admin/quiz" replace /> },
            { path: "/AdminAttendance", element: <Navigate to="/admin/attendance-scanner" replace /> },
            { path: "/attendance-scanner", element: <Navigate to="/admin/attendance-scanner" replace /> },
            { path: "/admin/users-management", element: <Navigate to="/admin/users" replace /> },
            { path: "/student/registration", element: <Navigate to="/admin/course-management" replace /> },
            { path: "/student/registered", element: <Navigate to="/admin/course-management" replace /> },
            { path: "/student/summary", element: <Navigate to="/admin/student-summary" replace /> },
        ],
    },
    {
        element: <ProtectedRoute role="admin" />,
        children: [{ path: "/admin/live-chat", element: <ChatDashboardPage /> }],
    },

    // // صفحات الطالب فقط
    // {
    //     element: <ProtectedRoute role="student" />,
    //     children: [],
    // },

    // صفحات تحتاج تسجيل دخول فقط
    {
        element: <ProtectedRoute />,
        children: [
            { path: "/course-table-print", element: <CourseTablePrint /> },
            {
                element: <Layout />,
                children: [
                    { path: "/dashboardstudent", element: <StudentDashboardPage /> },
                    { path: "/persondata", element: <StudentPage /> },
                    { path: "/CourseTable", element: <CourseTable /> },
                    { path: "/payment", element: <Payment /> },
                    { path: "/photo-upload", element: <PhotoUpload /> },
                    { path: "/AcademicRegistration", element: <AcademicRegistration /> },
                    { path: "/registration-form", element: <RegistrationFormPage /> },
                    { path: "/sections", element: <SectionsSelectionPage /> },
                    { path: "/student/advisor-request", element: <StudentAdvisorRequestPage /> },
                    { path: "*", element: <ErrorPage /> },
                ],
            },
        ],
    },
    {
        element: <ProtectedRoute role="student" />,
        children: [{ path: "/Qiez-BNU", element: <QiezBNU /> }],
    },
    {
        path: "*",
        element: <ErrorPage />,
    },
]);

export default function App() {
    return <RouterProvider router={router} />;
}
