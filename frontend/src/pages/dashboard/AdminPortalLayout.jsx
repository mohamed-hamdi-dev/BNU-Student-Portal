import React, { useContext, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LayoutDashboard, BookOpenCheck, SlidersHorizontal, Settings, UserRound, QrCode, Users, LogOut, IdCard, GraduationCap, MessageCircle, Image, ListChecks, KeyRound, MapPin, ClipboardList, ClipboardCheck, Landmark, Bell } from "lucide-react";
import { AuthContext } from "../../context/AuthContext";
import { ThemeContext } from "../../context/ThemeContext.jsx";
import ThemeToggle from "../../components/common/ThemeToggle.jsx";
import ChangeLang from "../../components/Changelang.jsx";
import { apiFetch } from "../../services/api";
import { withAccessToken } from "../../services/profilePhotoApi.js";
import { useTranslation } from "react-i18next";

const menuItems = [
    { to: "/admin/admin-profile", labelKey: "menu_profile", icon: UserRound, roles: ["admin", "doctor", "advisor"], group: "account" },
    { to: "/admin/password-security", labelKey: "menu_password_security", icon: KeyRound, roles: ["admin", "doctor", "advisor"], group: "account" },
    { to: "/admin/users", labelKey: "menu_users", icon: Users, roles: ["admin"], group: "account" },
    { to: "/admin/dashboard", labelKey: "menu_dashboard", icon: LayoutDashboard, roles: ["admin", "doctor"], group: "academic" },
    { to: "/admin/course-management", labelKey: "menu_course_management", icon: BookOpenCheck, roles: ["admin"], group: "academic" },
    { to: "/admin/track-coordination", labelKey: "menu_track_coordination", icon: ListChecks, roles: ["admin"], group: "academic" },
    { to: "/admin/quiz", labelKey: "menu_quiz", icon: Settings, roles: ["admin", "doctor"], group: "academic" },
    { to: "/admin/registration-control", labelKey: "menu_registration_control", icon: SlidersHorizontal, roles: ["admin"], group: "registration" },
    { to: "/admin/payment-setup", labelKey: "menu_payment_setup", icon: Landmark, roles: ["admin"], group: "registration" },
    { to: "/admin/bank-receipts", labelKey: "menu_bank_receipts", icon: Landmark, roles: ["admin"], group: "registration" },
    { to: "/admin/registration-policies", labelKey: "menu_registration_policies", icon: ClipboardList, roles: ["admin"], group: "registration" },
    { to: "/admin/advisor-requests", labelKey: "menu_advisor_requests", icon: ClipboardCheck, roles: ["admin", "advisor"], group: "registration" },
    { to: "/admin/attendance-scanner", labelKey: "menu_attendance_scanner", icon: QrCode, roles: ["admin", "doctor"], group: "operations" },
    { to: "/admin/campus-places", labelKey: "menu_campus_places", icon: MapPin, roles: ["admin"], group: "operations" },
    { to: "/admin/photo-reviews", labelKey: "menu_photo_reviews", icon: Image, roles: ["admin"], group: "operations" },
    { to: "/admin/live-chat", labelKey: "menu_live_chat", icon: MessageCircle, roles: ["admin"], group: "support" },
];

export default function AdminPortalLayout() {
    const [desktopOpen, setDesktopOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    const [liveChatUnreadCount, setLiveChatUnreadCount] = useState(0);
    const [profilePhotoFailed, setProfilePhotoFailed] = useState(false);

    const location = useLocation();
    const navigate = useNavigate();
    const { currentUser, logout } = useContext(AuthContext);
    const { isDarkMode } = useContext(ThemeContext);
    const { t, i18n } = useTranslation("admin");
    const isRTL = String(i18n.language || "ar").toLowerCase().startsWith("ar");
    const displayName = currentUser?.name || currentUser?.username || t("default_user");
    const displayUsername = currentUser?.username || currentUser?.id || "-";
    const accessToken = String(localStorage.getItem("access_token") || "").trim();
    const profilePhotoUrl = !profilePhotoFailed && accessToken ? withAccessToken(currentUser?.profilePhotoUrl || "", accessToken) : "";

    const avatarLetters = (displayName || "Admin User")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");

    const currentRole = String(currentUser?.role || "").toLowerCase();
    const canAccessLiveChat = currentRole === "admin";
    const allowedMenuItems = useMemo(
        () => menuItems.filter((item) => !Array.isArray(item.roles) || item.roles.includes(currentRole)),
        [currentRole]
    );
    const groupMeta = useMemo(
        () => ({
            account: t("account_group"),
            academic: t("academic_group"),
            registration: t("registration_group"),
            operations: t("operations_group"),
            support: t("support_group"),
        }),
        [t]
    );

    const groupedAllowedItems = useMemo(() => {
        const groupOrder = ["account", "academic", "registration", "operations", "support"];
        return groupOrder
            .map((groupKey) => ({
                key: groupKey,
                title: groupMeta[groupKey],
                items: allowedMenuItems.filter((item) => item.group === groupKey),
            }))
            .filter((group) => group.items.length > 0);
    }, [allowedMenuItems, groupMeta]);

    const pageTitle = useMemo(() => {
        const active = allowedMenuItems.find((item) => location.pathname.startsWith(item.to));
        return active ? t(active.labelKey) : t("page_title_default");
    }, [allowedMenuItems, location.pathname, t]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        setProfilePhotoFailed(false);
    }, [currentUser?.profilePhotoUrl, accessToken]);

    useEffect(() => {
        if (!canAccessLiveChat) {
            setLiveChatUnreadCount(0);
            return;
        }
        let cancelled = false;
        const loadUnread = async () => {
            try {
                const rows = await apiFetch("/api/conversations");
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : [];
                const unread = list.reduce((sum, row) => sum + Number(row?.unread_for_admin || row?.unreadForAdmin || 0), 0);
                setLiveChatUnreadCount(Math.max(0, Number(unread) || 0));
            } catch {
                if (!cancelled) setLiveChatUnreadCount(0);
            }
        };
        loadUnread();
        const timer = setInterval(loadUnread, 15000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [canAccessLiveChat, location.pathname]);

    const handleToggleSidebar = () => {
        if (isMobile) {
            setMobileMenuOpen((prev) => !prev);
            return;
        }
        setDesktopOpen((prev) => !prev);
    };

    const showFullLabels = isMobile || desktopOpen;

    return (
        <div className={`min-h-screen ${isDarkMode ? "bg-slate-950" : "bg-[#F8FAFC]"}`} dir={isRTL ? "rtl" : "ltr"}>
            {isMobile && mobileMenuOpen && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setMobileMenuOpen(false)} />}

            <div className="flex min-h-screen">
                <aside
                    className={`${isDarkMode ? "bg-slate-900 text-white border-slate-800" : "bg-white text-slate-900 border-slate-200 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"} border-l transition-all duration-300 ${
                        isMobile
                            ? `fixed inset-y-0 ${isRTL ? "right-0" : "left-0"} z-[90] w-72 transform ${mobileMenuOpen ? "translate-x-0" : isRTL ? "translate-x-full" : "-translate-x-full"}`
                            : desktopOpen
                            ? "w-72"
                            : "w-20"
                    } flex flex-col`}
                >
                    <div className={`h-16 px-4 border-b flex items-center justify-between ${isDarkMode ? "border-slate-800" : "border-slate-200"}`}>
                        {showFullLabels ? (
                            <span className="font-black text-sm flex items-center gap-2">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${isDarkMode ? "bg-cyan-500 text-white" : "bg-sky-100 text-sky-700"}`}>
                                    <GraduationCap size={18} />
                                </span>
                                <span>{t("brand_name")}</span>
                            </span>
                        ) : (
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${isDarkMode ? "bg-cyan-500 text-white" : "bg-sky-100 text-sky-700"}`}>
                                <GraduationCap size={18} />
                            </span>
                        )}
                        {isMobile && (
                            <button
                                type="button"
                                onClick={() => setMobileMenuOpen(false)}
                                className={`p-2 rounded-lg transition-colors ${isDarkMode ? "bg-slate-800/70 text-slate-200 hover:bg-slate-700 hover:text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"}`}
                                aria-label={t("close_menu")}
                                title={t("close_menu")}
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    {showFullLabels && (
                        <div className={`px-4 py-3 border-b text-xs ${isDarkMode ? "border-slate-800 text-slate-300" : "border-slate-200 text-slate-500"}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl border overflow-hidden flex items-center justify-center font-black ${isDarkMode ? "border-slate-700 bg-cyan-600 text-white" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
                                    {profilePhotoUrl ? <img src={profilePhotoUrl} alt="profile" className="w-full h-full object-cover" onError={() => setProfilePhotoFailed(true)} /> : avatarLetters}
                                </div>
                                <div>
                                    <p className={`font-black ${isDarkMode ? "text-white" : "text-slate-800"}`}>{displayName}</p>
                                    <p className={`mt-1 text-[11px] inline-flex items-center gap-1 ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>
                                        <IdCard size={16} />
                                        <span>{displayUsername}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <nav className="p-3 space-y-3 flex-1 overflow-y-auto">
                        {groupedAllowedItems.map((group) => (
                            <div key={group.key}>
                                {showFullLabels && <p className={`px-2 pb-1 text-[10px] font-black tracking-wide ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>{group.title}</p>}
                                <div className="space-y-1.5">
                                    {group.items.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <NavLink
                                                key={item.to}
                                                to={item.to}
                                                onClick={() => {
                                                    if (isMobile) setMobileMenuOpen(false);
                                                }}
                                                className={({ isActive }) =>
                                                    `w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${
                                                        isActive
                                                            ? isDarkMode
                                                                ? "bg-cyan-500 text-white"
                                                                : "bg-sky-50 text-sky-700 border border-sky-200"
                                                            : isDarkMode
                                                            ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                                                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                                                    }`
                                                }
                                            >
                                                <Icon size={17} />
                                                {showFullLabels && <span>{t(item.labelKey)}</span>}
                                                {item.to === "/admin/live-chat" && liveChatUnreadCount > 0 && (
                                                    <span className={`${isRTL ? "mr-auto" : "ml-auto"} inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-black text-white`}>
                                                        {liveChatUnreadCount}
                                                    </span>
                                                )}
                                            </NavLink>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>

                    <div className={`p-3 border-t ${isDarkMode ? "border-slate-800" : "border-slate-200"}`}>
                        <button
                            onClick={() => {
                                logout();
                                navigate("/", { replace: true });
                            }}
                            className={`w-full flex items-center ${showFullLabels ? (isRTL ? "justify-start" : "justify-start") : "justify-center"} gap-2 rounded-xl px-3 py-3 text-sm font-bold border transition-colors ${
                                isDarkMode ? "bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/20 hover:text-red-200" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                            }`}
                        >
                            <LogOut size={18} />
                            {showFullLabels && <span>{t("logout")}</span>}
                        </button>
                    </div>
                </aside>

                <section className="flex-1 min-w-0">
                    <header className={`h-16 border-b px-4 md:px-6 flex items-center justify-between sticky top-0 z-[80] ${isDarkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleToggleSidebar}
                                className={`relative z-[100] p-2 rounded-lg transition-colors ${isDarkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                            >
                                {isMobile ? (mobileMenuOpen ? <X size={18} /> : <Menu size={18} />) : desktopOpen ? <X size={18} /> : <Menu size={18} />}
                            </button>
                            <h1 className={`font-black text-sm md:text-base ${isDarkMode ? "text-slate-100" : "text-slate-700"}`}>{pageTitle}</h1>
                            <div className="md:hidden">
                                <ThemeToggle compact />
                            </div>
                        </div>
                        <div className={`text-xs flex items-center gap-3 ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>
                            <div className="hidden md:block">
                                <ThemeToggle compact />
                            </div>
                            <div className="flex h-10 items-center justify-center scale-[0.74] origin-center">
                                <ChangeLang variant="admin-navbar" />
                            </div>
                            <button
                                onClick={() => navigate("/admin/password-security")}
                                className={`h-9 w-9 rounded-xl border inline-flex items-center justify-center transition-colors ${
                                    location.pathname.startsWith("/admin/password-security")
                                        ? isDarkMode
                                            ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                                            : "bg-sky-50 text-sky-700 border-sky-200"
                                        : isDarkMode
                                        ? "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                }`}
                                aria-label={t("settings")}
                                title={t("settings")}
                            >
                                <Settings size={16} />
                            </button>
                            {canAccessLiveChat && (
                                <>
                                <button
                                    onClick={() => navigate("/admin/live-chat")}
                                    className={`relative h-9 w-9 rounded-xl border inline-flex items-center justify-center transition-colors ${
                                        location.pathname.startsWith("/admin/live-chat")
                                            ? isDarkMode
                                                ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                                                : "bg-sky-50 text-sky-700 border-sky-200"
                                            : isDarkMode
                                            ? "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                    }`}
                                    aria-label={t("live_chat_notifications")}
                                    title={t("live_chat_notifications")}
                                >
                                    <Bell size={16} />
                                    {liveChatUnreadCount > 0 && (
                                        <span className="absolute -top-1.5 -left-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">
                                            {liveChatUnreadCount}
                                        </span>
                                    )}
                                </button>
                                </>
                            )}
                            <div className={`w-8 h-8 rounded-lg border overflow-hidden flex items-center justify-center font-black ${isDarkMode ? "border-slate-700 bg-cyan-600 text-white" : "border-slate-200 bg-sky-100 text-sky-700"}`}>
                                {profilePhotoUrl ? <img src={profilePhotoUrl} alt="profile" className="w-full h-full object-cover" onError={() => setProfilePhotoFailed(true)} /> : avatarLetters}
                            </div>
                            <div className="hidden sm:flex flex-col leading-tight">
                                <span className={`font-bold ${isDarkMode ? "text-slate-100" : "text-slate-700"}`}>{displayName}</span>
                                <span className={`text-[11px] inline-flex items-center gap-1 ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>
                                    <IdCard size={16} />
                                    <span>{displayUsername}</span>
                                </span>
                            </div>
                        </div>
                    </header>

                    <main className="p-3 md:p-6 overflow-x-hidden">
                        <Outlet />
                    </main>

                </section>
            </div>
        </div>
    );
}
