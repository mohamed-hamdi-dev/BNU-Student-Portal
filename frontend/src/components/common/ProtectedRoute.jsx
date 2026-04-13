import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

function AccessDenied() {
    const navigate = useNavigate();

    const rawUser = localStorage.getItem("loggedUser");
    let role = "";
    try {
        role = String(JSON.parse(rawUser || "{}")?.role || "").toLowerCase();
    } catch {
        role = "";
    }

    const backTo = role === "admin" || role === "doctor" || role === "advisor" ? "/admin/admin-profile" : "/dashboardstudent";

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4" dir="rtl">
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
                <h1 className="text-xl font-black text-slate-800 mb-3">ليس لك صلاحية للدخول</h1>
                <p className="text-sm text-slate-500 mb-6">هذه الصفحة غير متاحة لدور حسابك الحالي.</p>
                <button
                    onClick={() => navigate(backTo)}
                    className="w-full rounded-2xl bg-[#05ADCF] text-white py-3 font-bold hover:opacity-90 transition">
                    الرجوع للصفحة الرئيسية
                </button>
            </div>
        </div>
    );
}

const ProtectedRoute = ({ role }) => {
    const location = useLocation();

    let user = null;
    try {
        user = JSON.parse(localStorage.getItem("loggedUser") || "null");
    } catch {
        user = null;
    }

    if (!user) {
        return <Navigate to="/" replace />;
    }

    const userRole = String(user?.role || "").toLowerCase();
    const requiresPasswordUpdate = Boolean(
        user?.mustChangePassword ||
            user?.must_change_password ||
            user?.passwordExpired ||
            user?.password_expired
    );
    const isPasswordChangeOnPerson = location.pathname === "/persondata";
    if (requiresPasswordUpdate && userRole === "student" && !isPasswordChangeOnPerson) {
        return <Navigate to="/persondata?force_password_change=1" replace />;
    }

    const allowedRoles = Array.isArray(role) ? role : role ? [role] : [];
    const normalizedAllowed = allowedRoles.map((r) => String(r).toLowerCase());

    if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(userRole)) {
        return <AccessDenied />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
