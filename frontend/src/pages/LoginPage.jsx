import React, { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Formik } from "formik";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../css/Login.css";
import { FaLock ,FaUser  } from "react-icons/fa6";
import ChangeLang from "../components/Changelang.jsx";
import Swal from "sweetalert2";
import { AuthContext } from "../context/AuthContext.jsx";
import { Eye, EyeOff, GraduationCap, LifeBuoy, ShieldCheck, UserPlus, X } from "lucide-react";
import { apiFetch } from "../services/api";
import { useAccountRequestCatalog } from "../hooks/useAccountRequestCatalog";
import ThemeToggle from "../components/common/ThemeToggle.jsx";

const Toast = Swal.mixin({
    toast: true,
    position: "top",
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    background: "#4A4F53",
    color: "#fff",
    didOpen: (toast) => {
        toast.style.direction = "rtl";
        toast.style.textAlign = "right";
    },
});

const normalizeCollegeKey = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي");

const toYearNumber = (value) => {
    const raw = String(value || "").trim();
    const latin = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    const match = latin.match(/\d+/);
    return match ? Number(match[0]) : NaN;
};

const Basic = () => {
    const { t, i18n } = useTranslation("global"); 
    const navigate = useNavigate(); 
    const { login } = useContext(AuthContext);
    const [showPassword, setShowPassword] = useState(false);
    const [showAccountRequestModal, setShowAccountRequestModal] = useState(false);
    const [accountRequestForm, setAccountRequestForm] = useState({
        fullName: "",
        nationalId: "",
        college: "",
        level: "",
        email: "",
    });
    const { colleges: accountRequestColleges, getLevelsByCollege } = useAccountRequestCatalog();
    const accountRequestLevels = getLevelsByCollege(accountRequestForm.college);
    const filteredAccountRequestLevels = useMemo(() => {
        const key = normalizeCollegeKey(accountRequestForm.college);
        const isEngineering = key.includes("هندس") || key === "eng" || key.includes("engineering");
        if (!isEngineering) return accountRequestLevels;
        return accountRequestLevels.filter((level) => {
            const n = toYearNumber(level?.id || level?.name);
            return Number.isFinite(n) ? n <= 5 : true;
        });
    }, [accountRequestLevels, accountRequestForm.college]);

    const handleAccountRequestSubmit = (e) => {
        e.preventDefault();
        const payload = {
            ...accountRequestForm,
            fullName: String(accountRequestForm.fullName || "").trim(),
            email: String(accountRequestForm.email || "").trim(),
        };
        if (!payload.fullName || !payload.email || !String(payload.college || "").trim() || !String(payload.level || "").trim()) {
            Toast.fire({ icon: "error", title: i18n.language === "ar" ? "الاسم والبريد والكلية والسنة مطلوبون" : "Name, email, college, and year are required", iconColor: "#ef4444" });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
            Toast.fire({ icon: "error", title: i18n.language === "ar" ? "صيغة البريد الإلكتروني غير صحيحة" : "Invalid email format", iconColor: "#ef4444" });
            return;
        }
        const nameParts = payload.fullName.split(/\s+/).filter(Boolean);
        if (nameParts.length < 4) {
            Toast.fire({ icon: "error", title: i18n.language === "ar" ? "اكتب اسمك رباعي كما هو في البطاقة" : "Please enter your full 4-part name as on ID", iconColor: "#ef4444" });
            return;
        }
        const nationalIdDigits = String(payload.nationalId || "").replace(/\D/g, "");
        if (nationalIdDigits.length !== 14) {
            Toast.fire({ icon: "error", title: i18n.language === "ar" ? "الرقم القومي يجب أن يكون 14 رقم" : "National ID must be 14 digits", iconColor: "#ef4444" });
            return;
        }
        apiFetch("/api/auth/account-request", {
            method: "POST",
            body: JSON.stringify({
                full_name: payload.fullName,
                national_id: payload.nationalId,
                college: payload.college,
                level: payload.level,
                email: payload.email,
            }),
        })
            .then(() => {
                Toast.fire({ icon: "success", title: i18n.language === "ar" ? "تم إرسال الطلب للمراجعة" : "Request submitted for admin review", iconColor: "#05ADCF" });
                setShowAccountRequestModal(false);
                setAccountRequestForm({ fullName: "", nationalId: "", college: "", level: "", email: "" });
            })
            .catch((e) => {
                Toast.fire({ icon: "error", title: e.message || t("server_error"), iconColor: "#ef4444" });
            });
    };

    return (
        <div className="herobaner-container w-full relative min-h-[100dvh] overflow-hidden">
            {/* Background */}
            <div className="img-herobaner absolute inset-0 w-full h-full">
                <img className="img-banner w-full h-full min-h-[100dvh] object-cover" src="/assets/images/BNU-build.jpg" alt="banner" />
                {/* Gradient */}
                <div className="auth-overlay absolute inset-0"></div>
            </div>

            {/* Content */}
            <div className="herobaner absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center gap-1">
                <div className="auth-top-theme-toggle">
                    <ThemeToggle compact />
                </div>
                {/* Logo */}
                <div className="logo-container auth-side-logo flex items-center w-full gap-1">
                    <div className="auth-side-logo-badge">
                        <img src="/assets/images/logo.png" alt="BNU logo" className="auth-side-logo-img" />
                    </div>
                    <div className="auth-side-greeting-bubble">
                        {i18n.language === "ar" ? "أهلًا بك في بوابة جامعة بنها الأهلية" : "Welcome to BNU National University"}
                    </div>
                </div>

                {/* Title */}
                <div className="flex-title-page flex sm:flex-row items-center justify-center gap-3 sm:gap-5 w-full max-w-5xl mb-1 px-4 sm:px-6 mt-[5em] lg:mt-[5em]">
                    <div className="text-hero text-center sm:text-left px-1 py-1 flex items-center">
                        <h1
                            className={`auth-main-title leading-none font-extrabold drop-shadow-[0_2px_8px_rgba(1,26,35,0.24)] tracking-wide ${
                                i18n.language === "ar" ? "auth-main-title-ar" : "auth-main-title-en"
                            } ${
                                i18n.language === "en" ? "text-[1.08em] sm:text-[1.3rem] md:text-[1.72rem] lg:text-[1.95rem]" : "text-[1.08em] sm:text-[1.5rem] md:text-[1.9rem] lg:text-[2.2rem]"
                            }`}>
                            {i18n.language === "ar" ? (
                                <>
                                    <span className="portal-title-main">بوابة الخدمات </span>
                                    <span className="portal-title-accent">الطلابية</span>
                                </>
                            ) : (
                                <>
                                    <span className="portal-title-main">Services Portal </span>
                                    <span className="portal-title-accent">Student</span>
                                </>
                            )}
                        </h1>
                    </div>

                    <div className="logo-login-title flex items-center justify-center self-center shrink-0">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 p-[0.25em] rounded-xl bg-[#05ADCF] backdrop-blur-md text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)] border border-[#3CCFEA]/50 flex items-center justify-center">
                            <GraduationCap className="w-5 h-5 sm:w-7 sm:h-7 mt-[1em]" />
                        </div>
                    </div>
                </div>

                {/* Login Form */}
                <div className="formik-login-container auth-card auth-enter rounded-4xl mb-[6em] max-sm:mb-[7.2em] mt-[1.3em] lg:mt-[1.6em] flex items-center justify-center w-[25.5em] h-[31.8em]">
                    <Formik
                        initialValues={{ username: "", password: "" }}
                        validate={(values) => {
                            const errors = {};
                            if (!values.username) errors.username = true;
                            if (!values.password) errors.password = true;
                            return errors;
                        }}
                        onSubmit={async (values, { setSubmitting }) => {
                            try {
                                const result = await login(values.username, values.password);

                                /* LOGIN ERROR */
                                if (!result.success) {
                                    Toast.fire({
                                        icon: "error",
                                        title: result.error || t("login_error"),
                                        iconColor: "#ef4444",
                                    });
                                    setSubmitting(false);
                                    return;
                                }

                                /* LOGIN SUCCESS */
                                Toast.fire({
                                    icon: "success",
                                    title: t("login_success"),
                                    iconColor: "#05ADCF",
                                });
                                localStorage.setItem("show_welcome_after_login", String(Date.now()));

                                // AuthContext login automatically sets the user object if successful.
                                // We wait briefly to let Context propagate before navigating.
                                setTimeout(() => {
                                    // We need to parse from localStorage since we don't have the returned user readily here
                                    const saved = localStorage.getItem("loggedUser");
                                    const user = saved ? JSON.parse(saved) : null;

                                    if (user?.role === "student" && (user?.mustChangePassword || user?.must_change_password || user?.passwordExpired || user?.password_expired)) {
                                        navigate("/persondata?force_password_change=1", { replace: true });
                                        return;
                                    }

                                    if (user?.role === "admin" || user?.role === "doctor" || user?.role === "advisor") {
                                        navigate("/admin/admin-profile", { replace: true });
                                    } else {
                                        navigate("/dashboardstudent", { replace: true });
                                    }
                                }, 800);
                            } catch {
                                Toast.fire({
                                    icon: "error",
                                    title: t("server_error"),
                                    iconColor: "#ef4444",
                                });
                            } finally {
                                setSubmitting(false);
                            }
                        }}>
                        {({ values, errors, touched, handleChange, handleBlur, handleSubmit, isSubmitting }) => (
                            <form onSubmit={handleSubmit} className="flex flex-col items-center gap-7 w-[100%] px-[1.15em]">
                                <h1 className="text-hederformk text-[2.1rem] font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#05ADCF] to-[#00eaff] drop-shadow-lg">{t("welcome")}</h1>
                                <div className="w-full h-px bg-gradient-to-r from-transparent via-[#05ADCF] to-transparent opacity-90 mb-4" />


                                {/* USERNAME */}
                                <div className="input-username auth-input-shell relative flex items-center h-[3.2em] w-full rounded-[1em] backdrop-blur-md shadow-lg">
                                    <div
                                        className="PASSWORD-icon text-xl !ml-[-0.9em]"
                                        style={{
                                            marginInlineStart: i18n.language === "ar" ? "0.8em" : "0.3em",
                                            marginInlineEnd: i18n.language === "en" ? "0.8em" : "0.3em",
                                        }}>
                                        <FaUser className="text-[#05ADCF]" />
                                    </div>
                                    <input
                                        type="text"
                                        name="username"
                                        placeholder={t("username")}
                                        onChange={handleChange}
                                        onBlur={handleBlur}
                                        value={values.username}
                                        className="w-full bg-transparent text-white placeholder-gray-300 outline-none"
                                        style={{ backgroundColor: "transparent", backgroundImage: "none" }}
                                    />
                                    {errors.username && touched.username && <span className="px-2 text-red-500">!</span>}
                                </div>

                                {/* PASSWORD */}
                                <div className="input-password auth-input-shell relative flex items-center h-[3.2em] w-full py-3 rounded-[1em] backdrop-blur-md shadow-lg">
                                    {/* ICON */}
                                    <div
                                        className="PASSWORD-icon text-xl !ml-[-1.2em]"
                                        style={{
                                            paddingInlineStart: i18n.language === "ar" ? "0.8em" : "0.3em",
                                            paddingInlineEnd: i18n.language === "en" ? "0.8em" : "0.3em",
                                        }}>
                                        <FaLock className="text-[#05ADCF]" />
                                    </div>

                                    {/* INPUT */}
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        placeholder={t("password")}
                                        onChange={handleChange}
                                        onBlur={handleBlur}
                                        value={values.password}
                                        className="w-full bg-transparent text-white placeholder-gray-300 outline-none"
                                        style={{ backgroundColor: "transparent", backgroundImage: "none" }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        className={`px-2 py-1 rounded-lg text-[#05ADCF] hover:text-white hover:bg-[#05ADCF]/20 transition-colors ${i18n.language === "ar" ? "ml-2" : "mr-2"}`}
                                        aria-label={showPassword ? "Hide password" : "Show password"}>
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>

                                    {/* ERROR ICON â€” FIXED FOR BOTH LANGUAGES */}
                                    {errors.password && touched.password && <span className="px-2 text-red-500">!</span>}
                                </div>

                                {/* REMEMBER + FORGOT */}
                                <div className="container-remember flex justify-between w-full text-white text-sm">
                                    <label className="checkbox-contain flex items-center gap-2">
                                        <input type="checkbox" className="accent-[#05ADCF]" />
                                        {t("remember_me")}
                                    </label>
                                    <NavLink to="/forget-password" className="forget-password  hover:text-[#05ADCF] cursor-pointer">
                                        {t("forget_password")}
                                    </NavLink>
                                </div>

                                {/* LOGIN BUTTON */}
                                <div>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="btn-login bg-[#05ADCF] text-white hover:bg-[#0498b6] font-bold py-2 px-5 rounded-[1em] shadow-[0_4px_12px_rgba(5,173,207,0.4)] transition-all duration-300 tracking-wide"
                                        style={{
                                            fontSize: i18n.language === "ar" ? "1.2em" : "1.3em",
                                            width: i18n.language === "ar" ? "9.5em" : "8.8em",
                                            height: i18n.language === "ar" ? "2.68em" : "2.5em",
                                        }}>
                                        {t("Login")}
                                    </button>
                                </div>
                                {/* Change Language */}
                                <div className=" change-Language-Login w-full flex justify-end  ">
                                    <div className={`${i18n.language === "ar" ? "scale-75 sm:scale-90 md:scale-100" : "scale-75 sm:scale-90 md:scale-100"}`}>
                                        <ChangeLang variant="navbar" />
                                    </div>
                                </div>
                            </form>
                        )}
                    </Formik>
                </div>

                <div className="auth-footer-links" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
                    <div className="auth-footer-links-row">
                        <div className="auth-footer-link-item">
                            <span className="auth-footer-link-icon">
                                <ShieldCheck size={20} />
                            </span>
                            <span className="auth-footer-link-text">{t("auth_footer_privacy")}</span>
                        </div>
                        <button type="button" onClick={() => setShowAccountRequestModal(true)} className="auth-footer-link-item cursor-pointer bg-transparent border-0 p-0">
                            <span className="auth-footer-link-icon">
                                <UserPlus size={20} />
                            </span>
                            <span className="auth-footer-link-text">{t("auth_footer_account_request")}</span>
                        </button>
                        <div className="auth-footer-link-item">
                            <span className="auth-footer-link-icon">
                                <LifeBuoy size={20} />
                            </span>
                            <span className="auth-footer-link-text">{t("auth_footer_technical_support")}</span>
                        </div>
                    </div>
                    <p className="auth-footer-copyright">{t("auth_footer_copyright")}</p>
                </div>

                {showAccountRequestModal && (
                    <div className="fixed inset-0 z-[120] bg-[#020917]/70 backdrop-blur-[6px] flex items-center justify-center p-4">
                        <div className="absolute inset-0" onClick={() => setShowAccountRequestModal(false)} />
                        <form onSubmit={handleAccountRequestSubmit} className="account-request-modal-card auth-card auth-enter relative w-full max-w-md rounded-[2rem] p-5 sm:p-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="account-request-modal-title text-white font-extrabold text-base sm:text-lg">{t("auth_footer_account_request")}</h3>
                                <button type="button" onClick={() => setShowAccountRequestModal(false)} className="text-slate-200 hover:text-white">
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="account-request-modal-divider mb-4" />
                            <div className="grid grid-cols-1 gap-3">
                                <input value={accountRequestForm.fullName} onChange={(e) => setAccountRequestForm((p) => ({ ...p, fullName: e.target.value }))} placeholder={i18n.language === "ar" ? "اكتب اسمك رباعي كما هو في البطاقة" : "Enter your full 4-part name as on ID"} className="account-request-modal-input auth-input-shell h-11 rounded-2xl px-4 text-white outline-none" />
                                <input value={accountRequestForm.nationalId} onChange={(e) => setAccountRequestForm((p) => ({ ...p, nationalId: e.target.value }))} placeholder={i18n.language === "ar" ? "الرقم القومي (14 رقم)" : "National ID (14 digits)"} className="account-request-modal-input auth-input-shell h-11 rounded-2xl px-4 text-white outline-none" />
                                <select value={accountRequestForm.college} onChange={(e) => setAccountRequestForm((p) => ({ ...p, college: e.target.value, level: "" }))} className="account-request-modal-input auth-input-shell h-11 rounded-2xl px-4 text-white outline-none">
                                    <option value="" className="text-slate-300 bg-slate-900">{i18n.language === "ar" ? "اختر الكلية *" : "Select college *"}</option>
                                    {accountRequestColleges.map((college) => (
                                        <option key={college} value={college} className="text-white bg-slate-900">{college}</option>
                                    ))}
                                </select>
                                <select value={accountRequestForm.level} onChange={(e) => setAccountRequestForm((p) => ({ ...p, level: e.target.value }))} className="account-request-modal-input auth-input-shell h-11 rounded-2xl px-4 text-white outline-none">
                                    <option value="" className="text-slate-300 bg-slate-900">{i18n.language === "ar" ? "اختر السنة *" : "Select year *"}</option>
                                    {filteredAccountRequestLevels.map((level) => (
                                        <option key={level.id || level.name} value={level.id || level.name} className="text-white bg-slate-900">{level.name || level.id}</option>
                                    ))}
                                </select>
                                <input type="email" value={accountRequestForm.email} onChange={(e) => setAccountRequestForm((p) => ({ ...p, email: e.target.value }))} placeholder={i18n.language === "ar" ? "البريد الإلكتروني" : "Email"} className="account-request-modal-input auth-input-shell h-11 rounded-2xl px-4 text-white outline-none" />
                            </div>
                            <div className="mt-5 flex justify-end gap-2">
                                <button type="button" onClick={() => setShowAccountRequestModal(false)} className="account-request-cancel px-4 py-2 rounded-xl text-white text-sm font-bold">{i18n.language === "ar" ? "إلغاء" : "Cancel"}</button>
                                <button type="submit" className="account-request-send px-5 py-2 rounded-xl text-white text-sm font-bold">{i18n.language === "ar" ? "إرسال" : "Send"}</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Basic;












