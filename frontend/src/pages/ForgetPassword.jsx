import React, { useMemo, useState } from "react";
import { Formik } from "formik";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../css/Login.css";
import { FaIdCard } from "react-icons/fa6";
import { MdEmail } from "react-icons/md";
import ChangeLang from "../components/Changelang.jsx";
import Swal from "sweetalert2";
import { Eye, EyeOff, GraduationCap, LifeBuoy, LogIn, ShieldCheck, UserPlus, X } from "lucide-react";
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
    const [stage, setStage] = useState("identify");
    const [requestMeta, setRequestMeta] = useState({ requestId: "", email: "", expiresInSec: 300 });
    const [isResending, setIsResending] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

    const mapRecoveryErrorMessage = (message) => {
        const raw = String(message || "").toLowerCase();
        if (raw.includes("invalid recovery data")) {
            return i18n.language === "ar"
                ? "بيانات الاسترجاع غير متطابقة. تأكد من كود الطالب والرقم القومي والبريد الإلكتروني المسجل."
                : "Recovery data mismatch. Please ensure student code, national ID, and registered email are correct.";
        }
        return message || t("server_error");
    };

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
    const handleResendOtp = async (values) => {
        try {
            setIsResending(true);
            const data = await apiFetch("/api/auth/forgot-password", {
                method: "POST",
                body: JSON.stringify({ student_code: values.affNo, national_id: values.nationalId, email: values.mail }),
            });

            setRequestMeta({
                requestId: data.request_id || data.requestId || "",
                email: values.mail,
                expiresInSec: data.expires_in_sec || data.expiresInSec || 300,
            });
            Toast.fire({ icon: "success", title: t("forgot_resend_otp_success"), iconColor: "#05ADCF" });
        } catch (e) {
            Toast.fire({ icon: "error", title: mapRecoveryErrorMessage(e.message), iconColor: "#ef4444" });
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div className="herobaner-container forget-page w-full relative min-h-[100dvh] overflow-x-hidden">
            <div className="img-herobaner absolute inset-0 w-full h-full">
                <img className="img-banner w-full h-full min-h-[100dvh] object-cover" src="/assets/images/BNU-build.jpg" alt="banner" />
                <div className="auth-overlay absolute inset-0"></div>
            </div>

            <div className="herobaner relative z-10 w-full min-h-[100dvh] flex flex-col items-center justify-center gap-1 max-sm:justify-start max-sm:pt-5 max-sm:pb-5">
                <div className="auth-top-theme-toggle">
                    <ThemeToggle compact />
                </div>
                <div className="logo-container auth-side-logo flex items-center w-full gap-1">
                    <div className="auth-side-logo-badge">
                        <img src="/assets/images/logo.png" alt="BNU logo" className="auth-side-logo-img" />
                    </div>
                    <div className="auth-side-greeting-bubble">
                        {i18n.language === "ar" ? "أهلًا بك في بوابة جامعة بنها الأهلية" : "Welcome to BNU National University"}
                    </div>
                </div>

                <div className="flex-title-page flex sm:flex-row items-center justify-center gap-3 sm:gap-5 w-full max-w-5xl mb-1 px-4 sm:px-6 mt-[5em] lg:mt-[5em]">
                    <div className="text-hero text-center sm:text-left px-1 py-1 flex items-center">
                        <h1
                            className={`auth-main-title leading-none font-extrabold drop-shadow-[0_2px_8px_rgba(1,26,35,0.24)] tracking-wide ${
                                i18n.language === "ar" ? "auth-main-title-ar" : "auth-main-title-en"
                            } ${
                                i18n.language === "en" ? "text-[1.08em] sm:text-[1.35rem] md:text-[1.76rem] lg:text-[2.03rem]" : "text-[1.08em] sm:text-[1.58rem] md:text-[2.03rem] lg:text-[2.34rem]"
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

                <div className="formik-login-container formik-forget-container auth-card auth-enter rounded-4xl mb-[6em] max-sm:mb-[7.2em] mt-[1.3em] lg:mt-[0.6em] flex items-center justify-center w-[25.5em] h-[35em] pb-[1.3em] max-sm:w-[92vw] max-sm:h-auto max-sm:justify-start max-sm:pt-[0.55em] max-sm:pb-[0.7em]">
                    <Formik
                        initialValues={{ affNo: "", nationalId: "", mail: "", otp: "", newPassword: "", confirmPassword: "" }}
                        validate={(values) => {
                            const errors = {};
                            if (stage === "identify") {
                                if (!values.affNo) errors.affNo = true;
                                if (!values.nationalId) errors.nationalId = true;
                                if (!values.mail) errors.mail = true;
                            } else {
                                if (!values.otp || values.otp.length < 6) errors.otp = true;
                                if (!values.newPassword || values.newPassword.length < 6) errors.newPassword = true;
                                if (values.confirmPassword !== values.newPassword) errors.confirmPassword = true;
                            }
                            return errors;
                        }}
                        onSubmit={async (values, { setSubmitting }) => {
                            try {
                                if (stage === "identify") {
                                    const data = await apiFetch("/api/auth/forgot-password", {
                                        method: "POST",
                                        body: JSON.stringify({
                                            student_code: values.affNo,
                                            national_id: values.nationalId,
                                            email: values.mail,
                                        }),
                                    });

                                    const requestId = data.request_id || data.requestId || "";
                                    if (!requestId) {
                                        throw new Error("Invalid recovery data");
                                    }
                                    Toast.fire({
                                        icon: "success",
                                        title: data.message || "OTP sent",
                                        iconColor: "#05ADCF",
                                    });
                                    setRequestMeta({
                                        requestId,
                                        email: values.mail,
                                        expiresInSec: data.expires_in_sec || data.expiresInSec || 300,
                                    });
                                    setStage("verify");
                                } else {
                                    const data = await apiFetch("/api/auth/reset-password", {
                                        method: "POST",
                                        body: JSON.stringify({ request_id: requestMeta.requestId, otp: values.otp, new_password: values.newPassword }),
                                    });

                                    Toast.fire({ icon: "success", title: data.message || "Password reset successful", iconColor: "#05ADCF" });
                                    navigate("/", { replace: true });
                                }
                            } catch (e) {
                                Toast.fire({
                                    icon: "error",
                                    title: mapRecoveryErrorMessage(e.message),
                                    iconColor: "#ef4444",
                                });
                            } finally {
                                setSubmitting(false);
                            }
                        }}>
                        {({ values, errors, touched, handleChange, handleBlur, handleSubmit, isSubmitting }) => (
                            <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6 max-sm:gap-3 w-[100%] px-[1.15em] max-sm:px-[0.9em]">
                                <h1
                                    className={`text-hederformk text-[1.12rem] sm:text-[1.45rem] font-bold mt-2 md:!mt-0 text-transparent bg-clip-text bg-gradient-to-r from-[#05ADCF] to-[#00eaff] drop-shadow-lg ${
                                        stage === "verify" && i18n.language === "en" ? "md:text-[1.55rem] lg:text-[1.4rem]" : "md:text-[1.85rem] lg:text-[1.7rem]"
                                    }`}>
                                    {stage === "identify" ? t("forgotPassword") : t("forgot_verify_title")}
                                </h1>
                                <div className="w-full h-px bg-gradient-to-r from-transparent via-[#05ADCF] to-transparent opacity-90 mb-2" />


                                {stage === "identify" ? (
                                    <>
                                        <div className="input-username auth-input-shell relative flex items-center h-[3.2em] w-full rounded-[1em] backdrop-blur-md shadow-lg">
                                            <div
                                                className="PASSWORD-icon !text-[1.5em] !ml-[-1em]"
                                                style={{
                                                    marginInlineStart: i18n.language === "ar" ? "0.8em" : "0.3em",
                                                    marginInlineEnd: i18n.language === "en" ? "0.8em" : "0.3em",
                                                }}>
                                                <FaIdCard className="text-[#05ADCF]" />
                                            </div>
                                            <input
                                                type="text"
                                                name="affNo"
                                                placeholder={t("St. Aff. No")}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                value={values.affNo}
                                                className="w-full bg-transparent text-white placeholder-gray-300 outline-none"
                                            />
                                            {errors.affNo && touched.affNo && <span className="px-2 text-red-500">!</span>}
                                        </div>

                                        <div className="input-username auth-input-shell relative flex items-center h-[3.2em] w-full rounded-[1em] backdrop-blur-md shadow-lg">
                                            <div
                                                className="PASSWORD-icon flex items-center justify-center !text-[1.5em] !ml-[-1em]"
                                                style={{
                                                    marginInlineStart: i18n.language === "ar" ? "0.8em" : "0.3em",
                                                    marginInlineEnd: i18n.language === "en" ? "0.8em" : "0.3em",
                                                }}>
                                                <FaIdCard className="text-[#05ADCF]" />
                                            </div>
                                            <input
                                                type="text"
                                                name="nationalId"
                                                placeholder={t("ID Number")}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                value={values.nationalId}
                                                className="w-full bg-transparent text-white placeholder-gray-300 outline-none"
                                            />
                                            {errors.nationalId && touched.nationalId && <span className="px-2 text-red-500">!</span>}
                                        </div>

                                        <div className="input-password auth-input-shell relative flex items-center h-[3.2em] w-full py-3 rounded-[1em] backdrop-blur-md shadow-lg">
                                            <div
                                                className="PASSWORD-icon !text-[1.5em] !ml-[-1.2em]"
                                                style={{
                                                    paddingInlineStart: i18n.language === "ar" ? "0.8em" : "0.3em",
                                                    paddingInlineEnd: i18n.language === "en" ? "0.8em" : "0.3em",
                                                }}>
                                                <MdEmail className="text-[#05ADCF]" size={110} />
                                            </div>
                                            <input
                                                type="email"
                                                name="mail"
                                                value={values.mail}
                                                placeholder={t("Your registered mail")}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                className="w-full bg-transparent text-white placeholder-gray-300 outline-none"
                                            />
                                            {errors.mail && touched.mail && <span className="px-2 text-red-500">!</span>}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-full text-center text-xs max-sm:text-[10px] leading-tight text-cyan-200 -my-3 pb-1">
                                            {t("forgot_otp_sent_line", {
                                                email: requestMeta.email,
                                                minutes: Math.ceil((requestMeta.expiresInSec || 300) / 60),
                                            })}
                                        </div>
                                        <input
                                            type="text"
                                            name="otp"
                                            placeholder="OTP"
                                            maxLength={6}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            value={values.otp}
                                            className="auth-input-shell w-full h-[3.2em] rounded-[1em] px-4 text-white placeholder-gray-300 outline-none"
                                        />
                                        <div className="auth-input-shell w-full h-[3.2em] rounded-[1em] px-4 flex items-center">
                                            <input
                                                type={showNewPassword ? "text" : "password"}
                                                name="newPassword"
                                                placeholder={t("forgot_new_password")}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                value={values.newPassword}
                                                className="w-full bg-transparent text-white placeholder-gray-300 outline-none"
                                            />
                                            <button type="button" onClick={() => setShowNewPassword((prev) => !prev)} className="text-[#05ADCF] hover:text-white transition-colors">
                                                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                        <div className="auth-input-shell w-full h-[3.2em] rounded-[1em] px-4 flex items-center">
                                            <input
                                                type={showConfirmPassword ? "text" : "password"}
                                                name="confirmPassword"
                                                placeholder={t("forgot_confirm_password")}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                value={values.confirmPassword}
                                                className="w-full bg-transparent text-white placeholder-gray-300 outline-none"
                                            />
                                            <button type="button" onClick={() => setShowConfirmPassword((prev) => !prev)} className="text-[#05ADCF] hover:text-white transition-colors">
                                                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </>
                                )}

                                <div className="container-remember flex justify-between w-full text-white text-sm">
                                    <label className="checkbox-contain flex items-center gap-2">
                                        <input type="checkbox" className="accent-[#05ADCF]" />
                                        {t("remember_me")}
                                    </label>
                                    {stage === "verify" ? (
                                        <button
                                            type="button"
                                            disabled={isResending}
                                            onClick={() => handleResendOtp(values)}
                                            className="forget-password bg-transparent border-0 p-0 text-inherit underline underline-offset-2 hover:text-[#05ADCF] cursor-pointer disabled:opacity-60">
                                            {isResending ? t("forgot_resending") : t("forgot_resend_otp")}
                                        </button>
                                    ) : (
                                        <NavLink to="/forget-password" className="forget-password hover:text-[#05ADCF] cursor-pointer">
                                            {t("forget_password")}
                                        </NavLink>
                                    )}
                                </div>

                                {stage === "identify" ? (
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="btn-login bg-[#05ADCF] text-white hover:bg-[#0498b6] font-bold py-2 px-5 rounded-[1em] shadow-[0_4px_12px_rgba(5,173,207,0.4)] transition-all duration-300 tracking-wide"
                                        style={{
                                            fontSize: i18n.language === "ar" ? "1.2em" : "1.3em",
                                            width: i18n.language === "ar" ? "9.5em" : "8.8em",
                                            height: i18n.language === "ar" ? "2.68em" : "2.5em",
                                        }}>
                                        {t("Send")}
                                    </button>
                                ) : (
                                    <div className="w-full flex flex-col gap-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setStage("identify")}
                                                className="w-full bg-gray-600 text-white font-bold px-3 rounded-[1em] text-sm h-[2.9em] max-sm:h-[2.55em]">
                                                {t("forgot_back")}
                                            </button>
                                            <button type="submit" disabled={isSubmitting} className="w-full bg-[#05ADCF] text-white font-bold px-3 rounded-[1em] text-sm h-[2.9em] max-sm:h-[2.55em]">
                                                {t("forgot_confirm_change")}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="w-full max-w-[25em] px-2 flex items-center justify-between gap-5 max-sm:gap-3 mt-2 max-sm:mt-1 md:mt-1 pb-1">
                                    <div className="flex justify-end items-center">
                                        <div className="scale-90 sm:scale-95 md:scale-100">
                                            <ChangeLang variant="navbar" />
                                        </div>
                                    </div>

                                    <NavLink to="/" className="shrink-0 cursor-pointer flex items-center">
                                        <div className="auth-back-login-pill flex items-center justify-center gap-1 text-[0.88em] backdrop-blur-md rounded-full transition-all duration-300">
                                            <div className="auth-back-login-pill-icon">
                                                <LogIn size={13} className="sm:size-[15]" />
                                            </div>
                                            <div className="auth-back-login-pill-text font-semibold">{t("Login")}</div>
                                        </div>
                                    </NavLink>
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








