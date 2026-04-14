import React, { useContext, useEffect, useRef, useState } from "react";
import { ArrowRight, LogOut, GraduationCap, Home, Sparkles, X } from "lucide-react";
import { HiMenu } from "react-icons/hi";
import { FaIdCard } from "react-icons/fa";
import ChangeLang from "../components/Changelang";
import ThemeToggle from "../components/common/ThemeToggle.jsx";
import { useTranslation } from "react-i18next";
import { services } from "../components/hooks/servicesData.js"; 
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext.jsx";
import { ThemeContext } from "../context/ThemeContext.jsx";
import { getMyApprovedProfilePhoto, withAccessToken } from "../services/profilePhotoApi.js";
import NotificationBell from "../components/NotificationBell.jsx";

export default function App() {
    const { t, i18n } = useTranslation("global");
    const { currentUser, logout } = useContext(AuthContext);
    const { isDarkMode } = useContext(ThemeContext);
    const user = currentUser;
    const [openMenu, setOpenMenu] = useState(false);
    const [showWelcomeCard, setShowWelcomeCard] = useState(false);
    const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
    const welcomeShownRef = useRef(false);
    const location = useLocation();
    const navigate = useNavigate();

    const isRTL = i18n.language === "ar";
    const isOnServicesHome = location.pathname === "/dashboardstudent";
    const navbarAvatarSize = Math.max(54, Math.min(96, Number(user?.avatarSizePx ?? user?.avatar_size_px ?? 56) || 56));
    const drawerAvatarSize = Math.max(72, Math.min(150, navbarAvatarSize + 28));
    const navbarAvatarHeight = Math.round(navbarAvatarSize * 1.0); // keep stable portrait crop
    const drawerAvatarHeight = Math.round(drawerAvatarSize * 1.0);
    const navbarAvatarWidth = Math.round(navbarAvatarSize * 0.8);
    const drawerAvatarWidth = Math.round(drawerAvatarSize * 0.8);
    const avatarObjectX = Math.max(0, Math.min(100, Number(user?.avatarObjectX ?? user?.avatar_object_x ?? 50) || 50));
    const avatarObjectY = Math.max(0, Math.min(100, Number(user?.avatarObjectY ?? user?.avatar_object_y ?? 50) || 50));
    const effectiveProfilePhotoUrl = user?.profilePhotoUrl || profilePhotoUrl || "";

    useEffect(() => {
        if (!user?.username) return;
        if (welcomeShownRef.current) return;
        const savedAtRaw = localStorage.getItem("show_welcome_after_login");
        const savedAt = Number(savedAtRaw || 0);
        const isFresh = Number.isFinite(savedAt) && savedAt > 0 && Date.now() - savedAt <= 30000;
        if (!isFresh) return;

        welcomeShownRef.current = true;
        localStorage.removeItem("show_welcome_after_login");
        const showTimer = setTimeout(() => setShowWelcomeCard(true), 120);
        const hideTimer = setTimeout(() => setShowWelcomeCard(false), 4300);
        return () => {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
        };
    }, [user?.username]);

    useEffect(() => {
        const loadProfilePhoto = async () => {
            try {
                const row = await getMyApprovedProfilePhoto();
                if (!row?.fileUrl) {
                    setProfilePhotoUrl("");
                    return;
                }
                setProfilePhotoUrl(withAccessToken(row.fileUrl, localStorage.getItem("access_token") || ""));
            } catch {
                setProfilePhotoUrl("");
            }
        };
        if (user?.username) loadProfilePhoto();
    }, [user?.username]);

    useEffect(() => {
        setOpenMenu(false);
    }, [location.pathname]);

    const handleMenuNavigation = (path) => {
        setOpenMenu(false);
        if (location.pathname === path) return;
        const currentPath = String(location.pathname || "").toLowerCase();
        const fromAcademicRegistration = currentPath === "/academicregistration";
        if (fromAcademicRegistration) {
            window.location.assign(path);
            return;
        }
        navigate(path);
    };

    if (!user) return <p className="p-4">Loading...</p>;

    return (
        <>
            {showWelcomeCard && (
                <div className="fixed top-[5.8em] left-4 z-[80]">
                    <div className="min-w-[15.5rem] max-w-[19rem] rounded-2xl border border-cyan-100 bg-white/95 backdrop-blur px-3.5 py-2.5 shadow-[0_14px_30px_rgba(5,173,207,0.2)] animate-in slide-in-from-left-4 fade-in duration-300">
                        <div className="flex items-center gap-2.5">
                            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#05ADCF] to-[#008ba8] text-white flex items-center justify-center font-black">
                                {user?.name?.charAt(0)}
                                <span className="absolute -top-1 -right-1 text-[#05ADCF]">
                                    <Sparkles size={12} className="animate-bounce" />
                                </span>
                            </div>
                            <div className="text-right">
                                <p className="text-[11px] text-emerald-600 font-bold">تم تسجيل الدخول بنجاح</p>
                                <p className="text-sm font-bold text-slate-800">{`مرحباً بك يا ${user?.name || ""}`}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* NAVBAR */}
            <nav
                className={`w-full h-[5em] backdrop-blur-md border-b shadow-sm rounded-b-[24px] fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                    isDarkMode ? "bg-slate-900/80 border-slate-800" : "bg-white/80 border-gray-100"
                }`}
            >
                <div className="max-w-[1700px] mx-auto px-6 md:px-12 flex items-center justify-between h-full">
                    {/* Left Section: Menu & Logo */}
                    <div className="flex items-center gap-6">
                        <div className="p-2.5 hover:bg-gray-100/80 rounded-xl transition-all duration-200 cursor-pointer active:scale-90" onClick={() => setOpenMenu(!openMenu)}>
                            <HiMenu className={isDarkMode ? "text-slate-100" : "text-[#212323]"} size={28} />
                        </div>

                        <div className="flex items-center gap-3.5 cursor-pointer group">
                            <div className="bg-[#05ADCF]/10 p-2 rounded-xl group-hover:bg-[#05ADCF] transition-colors duration-300">
                                <GraduationCap className="w-7 h-7 text-[#05ADCF] group-hover:text-white transition-colors duration-300" />
                            </div>
                            <p className={`${isDarkMode ? "text-slate-100" : "text-[#212323]"} font-extrabold hidden sm:block text-[1.3em] tracking-tight`}>
                                <span className="text-[#05ADCF]">BNU</span> Portal
                            </p>
                        </div>
                    </div>

                    {/* Right Section: Language & User Profile */}
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="hidden md:block">
                            <ThemeToggle compact />
                        </div>
                        {/* Language Switcher Wrapper */}
                        <div className="flex items-center justify-center transition-transform duration-200 origin-center">
                            <ChangeLang variant="navbar" />
                        </div>
                        
                        {/* Advisor Notifications */}
                        <NotificationBell />

                        {/* Vertical Divider (Optional for better visual separation) */}
                        <div className="hidden md:block w-[1px] h-10 bg-gray-100"></div>

                        <div className="flex items-center gap-4 group">
                            {/* User Text Info */}
                            <div className="hidden sm:block rtl:text-left ltr:text-right">
                                <p className={`text-[1.05rem] font-bold leading-none mb-1 ${isDarkMode ? "text-slate-100" : "text-[#212323]"}`}>{user.name}</p>
                                <div className="flex items-center gap-2 text-[0.85rem] text-gray-400 font-medium">
                                    <FaIdCard className="w-3.5 h-3.5 text-[#22C7F2]" />
                                    <span className="tracking-wide uppercase">{user.username}</span>
                                </div>
                            </div>

                            {/* Modern Avatar with Ring */}
                            <div className="relative cursor-pointer">
                                <div
                                    className={`rounded-2xl flex items-center justify-center text-xl font-black transform group-hover:scale-105 transition-all duration-300 border ${
                                        effectiveProfilePhotoUrl
                                            ? "bg-white border-white shadow-sm overflow-hidden ring-1 ring-cyan-200/60"
                                            : "bg-gradient-to-br from-[#05ADCF] to-[#008ba8] text-white border-white shadow-lg shadow-[#05ADCF]/25"
                                    }`}
                                    style={{ width: `${navbarAvatarWidth}px`, height: `${navbarAvatarHeight}px` }}
                                >
                                    {effectiveProfilePhotoUrl ? (
                                        <img
                                            src={effectiveProfilePhotoUrl}
                                            alt="profile"
                                            className="w-full h-full rounded-2xl object-contain bg-white"
                                            style={{ objectPosition: `${avatarObjectX}% ${avatarObjectY}%` }}
                                        />
                                    ) : (
                                        user?.name?.charAt(0)
                                    )}
                                </div>
                                {/* Status Dot (Visual improvement) */}
                                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full shadow-sm"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Backdrop */}
            {openMenu && <div className="fixed inset-0 bg-[#10121360] bg-opacity-50 z-[2400]" onClick={() => setOpenMenu(false)}></div>}

            {/* Slide Menu */}
            <div
                className={`
                    fixed top-0 h-full w-[86vw] max-w-[23em] sm:w-[23em] md:w-[25em] blur-[0.0080055em] shadow-2xl z-[2450] !pt-4 !px-5 transition-transform duration-300
                    ${isDarkMode ? "bg-slate-900/95 text-slate-100" : "bg-[#ffffffdf]"}
                    ${isRTL ? "right-0" : "left-0"}
                    ${openMenu ? "translate-x-0" : isRTL ? "translate-x-full" : "-translate-x-full"}
                    border-gray-200 border-l border-r
                `}>
                {/* Close Icon */}
                <button
                    onClick={() => setOpenMenu(false)}
                    className={`absolute top-1 ${isRTL ? "left-5" : "right-6"} text-3xl ${isDarkMode ? "text-slate-200 hover:bg-slate-800" : "text-gray-700 hover:bg-gray-100"} hover:text-cyan-600 p-3 rounded-full transition`}>
                    <X className="w-6 h-6" />
                </button>
                <div className={`absolute top-3 ${isRTL ? "right-5" : "left-5"} md:hidden`}>
                    <ThemeToggle compact />
                </div>
                {/* ================================================================================= */}
                {/*ToggleMenu start */}
                <div className="flex items-center justify-around gap-4 mt-[1.2em] pt-8">
                    {/* User Text Info */}
                    <div className=" rtl:text-left ltr:text-right">
                        <p className={`text-[1.05rem] font-bold leading-none mb-1 ${isDarkMode ? "text-slate-100" : "text-[#212323]"}`}>{user.name}</p>

                        <div className="flex items-center  gap-2 text-[0.85em] text-gray-400 font-medium">
                            <FaIdCard className="w-3.5 h-3.5 text-[#22C7F2]" />
                            <span className="tracking-wide uppercase">{user.username}</span>
                        </div>
                        <div className="flex items-start  mt-[0.5em] text-[1em] text-gray-400 font-medium ltr:text-lift rtl:text-right">
                            <span className="tracking-wide uppercas  ">{user.major}</span>
                        </div>
                    </div>

                    {/* Modern Avatar with Ring */}
                    <div className="relative cursor-pointer ">
                        <div
                            className={`rounded-2xl flex items-center justify-center text-xl font-black transform group-hover:scale-105 transition-all duration-300 border ${
                                effectiveProfilePhotoUrl
                                    ? "bg-white border-white shadow-sm overflow-hidden ring-1 ring-cyan-200/60"
                                    : "bg-gradient-to-br from-[#05ADCF] to-[#008ba8] text-white border-white shadow-lg shadow-[#05ADCF]/25"
                            }`}
                            style={{ width: `${drawerAvatarWidth}px`, height: `${drawerAvatarHeight}px` }}
                        >
                            {effectiveProfilePhotoUrl ? (
                                <img
                                    src={effectiveProfilePhotoUrl}
                                    alt="profile"
                                    className="w-full h-full rounded-2xl object-contain bg-white"
                                    style={{ objectPosition: `${avatarObjectX}% ${avatarObjectY}%` }}
                                />
                            ) : (
                                user?.name?.charAt(0)
                            )}
                        </div>
                        {/* Status Dot (Visual improvement) */}
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full shadow-sm"></span>
                    </div>
                </div>
                {/* togellmenu end */}
                {/* ================================================================== */}
                <h2 className={`mb-2 text-xl h-[3em] font-bold mt-[2em] ${isDarkMode ? "text-slate-100" : "text-[101213]"}`}> {t("student_services")}</h2>
                {/* Navigation Items */}
                <ul className="menu-scroll flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-24em)] p-[0.5em]">
                    {!isOnServicesHome && (
                        <button
                            key="services-home"
                            type="button"
                            onClick={() => handleMenuNavigation("/dashboardstudent")}
                            className={`group flex h-[7em] w-full items-center gap-4 rounded-xl text-lg font-medium px-[0.5em] py-[0.5em] text-start
                                   ${
                                       location.pathname === "/dashboardstudent"
                                           ? isDarkMode
                                               ? "bg-[#12314a] text-[#e7f5ff] border border-[#22C7F2]/30"
                                               : "bg-cyan-100 text-cyan-700"
                                           : isDarkMode
                                           ? "text-slate-100 hover:bg-[#1a3652] hover:text-[#e7f5ff]"
                                           : "text-[#212323] hover:bg-cyan-50 hover:text-cyan-700"
                                   }
                                   transition-all duration-200`}>
                            <Home className="w-5 h-5 transition-transform group-hover:scale-110" style={{ color: isDarkMode ? "#22C7F2" : "#0EA5E9" }} />
                            <span>{t("chatbot_home")}</span>
                            <span className="ms-1 inline-flex w-5 overflow-hidden">
                                <ArrowRight className="w-5 h-5 text-cyan-600 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                            </span>
                        </button>
                    )}
                    {services.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleMenuNavigation(item.path)}
                            className={`group flex h-[7em] w-full items-center gap-4 rounded-xl text-lg font-medium px-[0.5em] py-[0.5em] text-start
                                   ${
                                       location.pathname === item.path
                                           ? isDarkMode
                                               ? "bg-[#12314a] text-[#e7f5ff] border border-[#22C7F2]/30"
                                               : "bg-cyan-100 text-cyan-700"
                                           : isDarkMode
                                           ? "text-slate-100 hover:bg-[#1a3652] hover:text-[#e7f5ff]"
                                           : "text-[#212323] hover:bg-cyan-50 hover:text-cyan-700"
                                   }
                                   transition-all duration-200`}>
                            <item.Icon className="w-5 h-5 transition-transform group-hover:scale-110" style={{ color: isDarkMode ? "#22C7F2" : item.color }} />
                            <span>{t(item.label)}</span>
                        </button>
                    ))}
                </ul>
                {/* Log Out Button */}
                <div className="logout-container flex items-center justify-center mt-[1em] font-bold">
                    <button
                        onClick={() => {
                            logout();
                            window.location.replace("/"); // استبدال الصفحة بدل NavLink
                        }}
                        className="w-[12em] h-[3.5em] flex items-center gap-2 justify-center rounded-2xl border border-red-600 bg-red-600 text-white backdrop-blur-sm hover:bg-red-700 hover:border-red-700 hover:scale-[1.02] shadow-lg shadow-red-500/25 transition-all duration-300">
                        <LogOut size={19} className="text-white" />
                        {t("logout")}
                    </button>
                </div>
            </div>
        </>
    );
}
