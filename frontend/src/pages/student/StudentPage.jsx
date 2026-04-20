import React, { useContext, useState, useEffect, useRef } from "react";
import { User, BookOpen, Globe, UserCheck, MapPin, IdCard, Mail, Bell, LogOut, Lock, ChevronDown, ShieldCheck, BadgeCheck, QrCode, Eye, EyeOff, X } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { useTranslation } from "react-i18next";
import Swal from "sweetalert2";
import { apiFetch } from "../../services/api";
import { getMyDisplayProfilePhoto, withAccessToken } from "../../services/profilePhotoApi";
import { ThemeContext } from "../../context/ThemeContext";

const isArabicLanguage = (lang) => String(lang || "ar").toLowerCase().startsWith("ar");
const hasBrokenEncoding = (value) => {
    const text = String(value ?? "").trim();
    if (!text) return false;
    return text.includes("?") || /\?{3,}/.test(text);
};

const safeText = (value, fallback) => {
    const text = String(value ?? "").trim();
    if (!text || hasBrokenEncoding(text)) return fallback;
    return text;
};

const SimpleQRCode = ({ value, size = 180 }) => {
    return (
        <div className="bg-white p-3 rounded-2xl flex flex-col items-center justify-center border-2 border-[#05ADCF]/20">
            <QRCodeCanvas value={value} size={size} level="H" includeMargin bgColor="#ffffff" fgColor="#001d24" />
            <p className="mt-2 text-[8px] font-mono text-gray-400 select-all max-w-[150px] truncate">{value}</p>
        </div>
    );
};

function PersonData({ user, onUserUpdate, forcePasswordChange = false, onPasswordChanged = null }) {
    const { t, i18n } = useTranslation("global");
    const { isDarkMode } = useContext(ThemeContext);
    const isAr = isArabicLanguage(i18n.language);
    const [remainingTime, setRemainingTime] = useState(20);
    const [lastUpdate, setLastUpdate] = useState("");
    const [dynamicContent, setDynamicContent] = useState("");
    const [showQR, setShowQR] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
    const [profilePhotoFailed, setProfilePhotoFailed] = useState(false);
    const [changePasswordForm, setChangePasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [passwordErrors, setPasswordErrors] = useState({});
    const [changePasswordLoading, setChangePasswordLoading] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [profileForm, setProfileForm] = useState({
        displayName: user.displayName || user.name || "",
        recoveryEmail: user.recoveryEmail || user.email || "",
        phoneNumber: user.phoneNumber || "",
    });
    const [profileErrors, setProfileErrors] = useState({});
    const [profileSaving, setProfileSaving] = useState(false);
    const menuRef = useRef(null);
    const officialName = user.universityName || user.full_name || user.NameID || user.username || "-";
    const profileInitials = String(officialName || "")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
    const effectiveProfilePhotoUrl = !profilePhotoFailed ? String(user.profilePhotoUrl || "").trim() : "";
    const avatarObjectX = Math.max(0, Math.min(100, Number(user?.avatarObjectX ?? user?.avatar_object_x ?? 50) || 50));
    const avatarObjectY = 18;

    useEffect(() => {
        setProfilePhotoFailed(false);
    }, [user.profilePhotoUrl]);

    const UPDATE_INTERVAL = 20;
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

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const handleEsc = (event) => {
            if (event.key === "Escape" && !forcePasswordChange) setShowChangePasswordModal(false);
        };
        document.addEventListener("keydown", handleEsc);
        return () => document.removeEventListener("keydown", handleEsc);
    }, [forcePasswordChange]);

    useEffect(() => {
        if (forcePasswordChange) {
            setShowChangePasswordModal(true);
            setShowMenu(false);
        }
    }, [forcePasswordChange]);

    useEffect(() => {
        setProfileForm({
            displayName: user.displayName || user.name || "",
            recoveryEmail: user.recoveryEmail || user.email || "",
            phoneNumber: user.phoneNumber || "",
        });
    }, [user.displayName, user.name, user.recoveryEmail, user.email, user.phoneNumber]);

    const personData = [
        { label: t("payment_name"), value: safeText(officialName, t("person_not_available")), icon: User },
        { label: t("person_university_code"), value: safeText(user.username, "-"), icon: IdCard },
        { label: t("payment_college"), value: safeText(user.college, t("person_not_set")), icon: BookOpen },
        {
            label: t("quiz_major"),
            value: safeText(user.specialization || user.major || user.track || user.trackId, t("person_not_set")),
            icon: BookOpen,
        },
        { label: t("ID Number"), value: safeText(user.nationalId || user.national_id, t("person_not_available")), icon: IdCard },
        { label: t("person_nationality"), value: safeText(user.nationality, t("person_egypt")), icon: Globe },
        { label: t("person_gender"), value: safeText(user.gender, "-"), icon: UserCheck },
        { label: t("person_birth_place"), value: safeText(user.birthPlace || user.birth_place, "-"), icon: MapPin },
        { label: t("person_academic_email"), value: safeText(user.universityEmail || user.email, t("person_not_available")), icon: Mail },
    ];

    const getFormattedTime = () =>
        new Date().toLocaleTimeString(isAr ? "ar-EG" : "en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });

    const updateDynamicContent = () => {
        const timeFactor = Math.floor(Date.now() / (UPDATE_INTERVAL * 1000));
        const content = `ID:${user.studentId || user.username}|Name:${officialName}|College:${user.college || t("person_not_set")}|Major:${user.specialization || user.major || user.track || user.trackId || "-"}|F:${timeFactor}`;
        setDynamicContent(content);
        setLastUpdate(getFormattedTime());
        setRemainingTime(UPDATE_INTERVAL);
    };

    useEffect(() => {
        updateDynamicContent();
        const regenTimer = setInterval(updateDynamicContent, UPDATE_INTERVAL * 1000);
        const countdownTimer = setInterval(() => setRemainingTime((prev) => (prev > 0 ? prev - 1 : UPDATE_INTERVAL)), 1000);
        return () => {
            clearInterval(regenTimer);
            clearInterval(countdownTimer);
        };
    }, [user, officialName]);

    const progressBarWidth = `${(remainingTime / UPDATE_INTERVAL) * 100}%`;

    const validateChangePassword = () => {
        const nextErrors = {};
        if (!changePasswordForm.currentPassword) nextErrors.currentPassword = t("person_current_password_is_required");
        if (!changePasswordForm.newPassword) nextErrors.newPassword = t("person_new_password_is_required");
        if (!changePasswordForm.confirmPassword) nextErrors.confirmPassword = t("person_password_confirmation_is_required");
        if (changePasswordForm.newPassword && changePasswordForm.newPassword.length < 6) nextErrors.newPassword = t("person_new_password_must_be_at_least_6_characte");
        if (changePasswordForm.newPassword && changePasswordForm.currentPassword && changePasswordForm.newPassword === changePasswordForm.currentPassword)
            nextErrors.newPassword = t("person_new_password_cannot_be_the_same_as_curre");
        if (changePasswordForm.confirmPassword && changePasswordForm.newPassword !== changePasswordForm.confirmPassword)
            nextErrors.confirmPassword = t("person_password_confirmation_does_not_match");

        setPasswordErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const resetChangePasswordForm = () => {
        setChangePasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setPasswordErrors({});
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
    };

    const handleChangePassword = async () => {
        if (!validateChangePassword()) return;
        try {
            setChangePasswordLoading(true);
            await apiFetch("/api/auth/change-password", {
                method: "POST",
                body: JSON.stringify({
                    current_password: changePasswordForm.currentPassword,
                    new_password: changePasswordForm.newPassword,
                }),
            });
            const nextUser = {
                ...user,
                mustChangePassword: false,
                must_change_password: false,
                passwordExpired: false,
                password_expired: false,
            };
            localStorage.setItem("loggedUser", JSON.stringify(nextUser));
            window.dispatchEvent(new Event("loggedUserUpdated"));
            if (onUserUpdate) onUserUpdate(nextUser);
            Toast.fire({ icon: "success", title: t("person_password_changed_successfully"), iconColor: "#05ADCF" });
            setShowChangePasswordModal(false);
            resetChangePasswordForm();
            if (forcePasswordChange && typeof onPasswordChanged === "function") {
                onPasswordChanged();
            }
        } catch (error) {
            Toast.fire({ icon: "error", title: error.message || t("server_error"), iconColor: "#ef4444" });
        } finally {
            setChangePasswordLoading(false);
        }
    };

    const validateProfileForm = () => {
        const nextErrors = {};
        if (!profileForm.displayName?.trim()) nextErrors.displayName = t("person_display_name_required");
        if (!profileForm.recoveryEmail?.trim()) nextErrors.recoveryEmail = t("person_recovery_email_required");
        if (profileForm.recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.recoveryEmail)) {
            nextErrors.recoveryEmail = t("person_recovery_email_invalid");
        }
        if (profileForm.phoneNumber && !/^[+0-9()\-\s]{6,20}$/.test(profileForm.phoneNumber)) {
            nextErrors.phoneNumber = t("person_phone_invalid");
        }
        setProfileErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSaveProfileContact = async () => {
        if (!validateProfileForm()) return;
        try {
            setProfileSaving(true);
            const payload = {
                display_name: profileForm.displayName.trim(),
                recovery_email: profileForm.recoveryEmail.trim().toLowerCase(),
                phone_number: profileForm.phoneNumber.trim() || null,
            };
            const data = await apiFetch("/api/users/me/contact-settings", {
                method: "PUT",
                body: JSON.stringify(payload),
            });
            const nextUser = {
                ...user,
                displayName: data.display_name || profileForm.displayName,
                name: data.display_name || profileForm.displayName,
                universityName: officialName,
                recoveryEmail: data.recovery_email || profileForm.recoveryEmail,
                phoneNumber: data.phone_number || "",
            };
            localStorage.setItem("loggedUser", JSON.stringify(nextUser));
            window.dispatchEvent(new Event("loggedUserUpdated"));
            if (onUserUpdate) onUserUpdate(nextUser);
            Toast.fire({ icon: "success", title: t("person_profile_saved"), iconColor: "#05ADCF" });
            setShowProfileModal(false);
        } catch (error) {
            Toast.fire({ icon: "error", title: error.message || t("server_error"), iconColor: "#ef4444" });
        } finally {
            setProfileSaving(false);
        }
    };

    return (
        <div dir="rtl" className="min-h-screen bg-gray-50 flex justify-center items-start mt-[2em] pt-14 lg:pt-16 pb-8 sm:pb-10 px-2.5 sm:px-3 font-sans">
            <div className="w-full max-w-[46rem] xl:max-w-[50rem] bg-white rounded-[1.4rem] lg:rounded-[2rem] shadow-2xl relative overflow-hidden border border-gray-100">
                <div className="h-36 sm:h-40 lg:h-46 bg-gradient-to-br from-[#05ADCF] to-[#0389a4] relative p-3 sm:p-4">
                    <div className="absolute top-4 sm:top-6 right-4 sm:right-6 flex items-center gap-2 sm:gap-3 z-30" ref={menuRef}>
                        <button
                            onClick={() => setShowQR(true)}
                            className="p-3 rounded-full text-white bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border border-white/20 shadow-lg"
                            title={t("person_qr_code")}>
                            <QrCode className="w-6 h-6" />
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className={`flex items-center gap-2 p-1.5 pr-4 rounded-full text-white transition-all backdrop-blur-md border border-white/20 shadow-lg ${
                                    showMenu ? "bg-white/25" : "bg-white/10 hover:bg-white/20"
                                }`}>
                                <span className="text-sm font-medium hidden sm:block">{t("person_account_options")}</span>
                                <div className="p-1.5 bg-white/20 rounded-full">
                                    <User className="w-5 h-5" />
                                </div>
                                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showMenu ? "rotate-180" : ""}`} />
                            </button>

                            {showMenu && (
                                <div
                                    className={`absolute right-0 mt-3 w-[min(16rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-2xl shadow-2xl border py-2 z-40 animate-in fade-in zoom-in duration-200 origin-top-right overflow-hidden max-h-[70vh] overflow-y-auto ${
                                        isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100"
                                    }`}
                                >
                                    <div className={`px-4 py-3 border-b mb-1 ${isDarkMode ? "bg-slate-800/60 border-slate-700" : "bg-gray-50/50 border-gray-50"}`}>
                                        <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>{t("person_settings_privacy")}</p>
                                        <p className={`text-xs font-bold truncate ${isDarkMode ? "text-cyan-300" : "text-[#05ADCF]"}`}>{officialName}</p>
                                    </div>

                                    <button
                                        onClick={() => {
                                            setShowMenu(false);
                                            setShowChangePasswordModal(true);
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors group ${
                                            isDarkMode ? "text-slate-200 hover:bg-cyan-500/10" : "text-gray-700 hover:bg-[#05ADCF]/5"
                                        }`}
                                    >
                                        <div
                                            className={`p-2 rounded-lg transition-colors ${
                                                isDarkMode ? "bg-slate-800 group-hover:bg-cyan-500/20 group-hover:text-cyan-300" : "bg-gray-100 group-hover:bg-[#05ADCF]/10 group-hover:text-[#05ADCF]"
                                            }`}
                                        >
                                            <Lock size={16} />
                                        </div>
                                        <span className="font-medium text-right flex-1">{t("person_change_password")}</span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            setShowMenu(false);
                                            setShowProfileModal(true);
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors group ${
                                            isDarkMode ? "text-slate-200 hover:bg-cyan-500/10" : "text-gray-700 hover:bg-[#05ADCF]/5"
                                        }`}
                                    >
                                        <div
                                            className={`p-2 rounded-lg transition-colors ${
                                                isDarkMode ? "bg-slate-800 group-hover:bg-cyan-500/20 group-hover:text-cyan-300" : "bg-gray-100 group-hover:bg-[#05ADCF]/10 group-hover:text-[#05ADCF]"
                                            }`}
                                        >
                                            <Globe size={16} />
                                        </div>
                                        <span className="font-medium text-right flex-1">{t("person_profile")}</span>
                                    </button>
                                    <button
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors group ${
                                            isDarkMode ? "text-slate-200 hover:bg-cyan-500/10" : "text-gray-700 hover:bg-[#05ADCF]/5"
                                        }`}
                                    >
                                        <div
                                            className={`p-2 rounded-lg transition-colors ${
                                                isDarkMode ? "bg-slate-800 group-hover:bg-cyan-500/20 group-hover:text-cyan-300" : "bg-gray-100 group-hover:bg-[#05ADCF]/10 group-hover:text-[#05ADCF]"
                                            }`}
                                        >
                                            <Bell size={16} />
                                        </div>
                                        <span className="font-medium text-right flex-1">{t("person_notifications")}</span>
                                    </button>

                                    <div className={`my-1 border-t ${isDarkMode ? "border-slate-700" : "border-gray-100"}`}></div>

                                    <NavLink
                                        to="/"
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors group ${
                                            isDarkMode ? "text-rose-300 hover:bg-rose-500/15 hover:text-rose-200" : "text-red-600 hover:bg-red-50 hover:text-red-700"
                                        }`}
                                    >
                                        <div
                                            className={`p-2 rounded-lg transition-colors ${
                                                isDarkMode ? "bg-rose-500/10 text-rose-300 group-hover:bg-rose-500/25 group-hover:text-rose-200" : "bg-red-50 text-red-600 group-hover:bg-red-100 group-hover:text-red-700"
                                            }`}
                                        >
                                            <LogOut size={16} />
                                        </div>
                                        <div className="flex flex-col items-start text-right">
                                            <span className="font-bold text-xs">{t("person_log_out")}</span>
                                        </div>
                                    </NavLink>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2">
                        <div className="bg-white p-2 rounded-full shadow-2xl ring-8 ring-white/50">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full bg-white border-4 border-[#05ADCF] overflow-hidden flex items-center justify-center">
                                {effectiveProfilePhotoUrl ? (
                                    <img
                                        src={effectiveProfilePhotoUrl}
                                        alt={t("person_profile")}
                                        className="w-full h-full rounded-full object-cover bg-white"
                                        style={{ objectPosition: `${avatarObjectX}% ${avatarObjectY}%` }}
                                        onError={() => setProfilePhotoFailed(true)}
                                    />
                                ) : profileInitials ? (
                                    <span className="text-[1.15rem] sm:text-[1.35rem] lg:text-[1.6rem] font-black text-[#05ADCF]">
                                        {profileInitials}
                                    </span>
                                ) : (
                                    <User className="w-8 h-8 sm:w-10 sm:h-10 text-[#05ADCF]" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-12 sm:pt-14 lg:pt-16 pb-5 sm:pb-8 px-3 sm:px-4 md:px-6 lg:px-8">
                    <div className="text-center mb-8 sm:mb-10">
                        <h2 className="text-[clamp(1.2rem,1.9vw,1.6rem)] font-black text-gray-800 flex items-center justify-center gap-2">
                            <BadgeCheck className="text-[#05ADCF] w-8 h-8" />
                            {t("person_personal_information")}
                        </h2>
                        <div className="w-20 h-1.5 bg-[#05ADCF] mx-auto mt-3 rounded-full opacity-20"></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {personData.map((item, index) => (
                            <div
                                key={index}
                                className="group flex flex-col bg-gray-50 border border-gray-100 p-3 rounded-xl hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 hover:border-[#05ADCF]/30 transition-all duration-300">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-white rounded-lg shadow-sm text-[#05ADCF] group-hover:bg-[#05ADCF] group-hover:text-white transition-colors">
                                        <item.icon className="w-4 h-4" />
                                    </div>
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{item.label}</span>
                                </div>
                                <span className="text-[clamp(0.88rem,1.2vw,0.98rem)] font-bold text-gray-700 pr-11 truncate">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {showQR && (
                <div className="fixed inset-0 bg-[#001d24]/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl relative w-full max-w-xs animate-in zoom-in duration-300">
                        <button
                            onClick={() => setShowQR(false)}
                            className="absolute -top-4 -right-4 bg-white text-gray-800 w-10 h-10 rounded-full shadow-xl flex items-center justify-center hover:bg-gray-100 transition-colors font-bold border border-gray-100">
                            <X size={16} />
                        </button>

                        <div className="text-center mb-6">
                            <div className="inline-flex p-3 bg-[#05ADCF]/10 rounded-2xl text-[#05ADCF] mb-2">
                                <ShieldCheck size={24} />
                            </div>
                            <h2 className="font-black text-gray-800 text-lg">{t("person_smart_identity_code")}</h2>
                            <p className="text-[10px] text-gray-400 uppercase tracking-tighter">{t("person_auto_refreshes_for_security")}</p>
                        </div>

                        {dynamicContent ? (
                            <div className="flex justify-center mb-6 p-4 bg-gray-50 rounded-3xl border-2 border-dashed border-[#05ADCF]/20 overflow-hidden">
                                <SimpleQRCode value={dynamicContent} size={150} />
                            </div>
                        ) : (
                            <div className="h-44 flex items-center justify-center text-gray-400 italic">{t("person_encrypting")}</div>
                        )}

                        <div className="space-y-4">
                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                                <div className="h-full bg-[#05ADCF] transition-all duration-1000 ease-linear shadow-[0_0_10px_#05ADCF]" style={{ width: progressBarWidth }}></div>
                            </div>

                            <div className="flex justify-between items-center px-1">
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">{t("person_next_refresh")}</p>
                                    <p className="text-sm font-black text-gray-700">{remainingTime} {t("person_sec")}</p>
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase text-left">{t("person_last_sync")}</p>
                                    <p className="text-[10px] font-medium text-gray-500">{lastUpdate}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showChangePasswordModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[120] p-4" onClick={() => !forcePasswordChange && setShowChangePasswordModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-800">{t("person_change_password")}</h3>
                                <p className="text-xs text-slate-400 mt-1">{t("person_please_fill_in_the_fields_correctly_to_s")}</p>
                            </div>
                            {!forcePasswordChange && (
                                <button onClick={() => setShowChangePasswordModal(false)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200">
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        <div className="p-5 space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">{t("person_current_password")}</label>
                                <div className="relative">
                                    <input
                                        type={showCurrentPassword ? "text" : "password"}
                                        value={changePasswordForm.currentPassword}
                                        onChange={(e) => setChangePasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pl-10 outline-none focus:border-[#05ADCF]"
                                    />
                                    <button type="button" onClick={() => setShowCurrentPassword((prev) => !prev)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                        {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {passwordErrors.currentPassword && <p className="text-[11px] text-red-500 mt-1">{passwordErrors.currentPassword}</p>}
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">{t("person_new_password")}</label>
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? "text" : "password"}
                                        value={changePasswordForm.newPassword}
                                        onChange={(e) => setChangePasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pl-10 outline-none focus:border-[#05ADCF]"
                                    />
                                    <button type="button" onClick={() => setShowNewPassword((prev) => !prev)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {passwordErrors.newPassword && <p className="text-[11px] text-red-500 mt-1">{passwordErrors.newPassword}</p>}
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">{t("person_confirm_new_password")}</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        value={changePasswordForm.confirmPassword}
                                        onChange={(e) => setChangePasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pl-10 outline-none focus:border-[#05ADCF]"
                                    />
                                    <button type="button" onClick={() => setShowConfirmPassword((prev) => !prev)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {passwordErrors.confirmPassword && <p className="text-[11px] text-red-500 mt-1">{passwordErrors.confirmPassword}</p>}
                            </div>
                        </div>

                        <div className="p-5 border-t border-slate-100 flex gap-2">
                            {!forcePasswordChange && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowChangePasswordModal(false);
                                        resetChangePasswordForm();
                                    }}
                                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
                                    {t("person_cancel")}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleChangePassword}
                                disabled={changePasswordLoading}
                                className="flex-1 py-2.5 rounded-xl bg-[#05ADCF] text-white font-bold hover:opacity-90 disabled:opacity-50">
                                {changePasswordLoading ? t("person_saving") : t("person_update_password")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showProfileModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[120] p-4" onClick={() => setShowProfileModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-800">{t("person_profile_settings_title")}</h3>
                                <p className="text-xs text-slate-400 mt-1">{t("person_profile_settings_hint")}</p>
                            </div>
                            <button onClick={() => setShowProfileModal(false)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">{t("person_display_name")}</label>
                                <input
                                    value={profileForm.displayName}
                                    onChange={(e) => setProfileForm((prev) => ({ ...prev, displayName: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF]"
                                />
                                {profileErrors.displayName && <p className="text-[11px] text-red-500 mt-1">{profileErrors.displayName}</p>}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">{t("person_recovery_email")}</label>
                                <input
                                    type="email"
                                    value={profileForm.recoveryEmail}
                                    onChange={(e) => setProfileForm((prev) => ({ ...prev, recoveryEmail: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF]"
                                />
                                {profileErrors.recoveryEmail && <p className="text-[11px] text-red-500 mt-1">{profileErrors.recoveryEmail}</p>}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">{t("person_phone_number")}</label>
                                <input
                                    value={profileForm.phoneNumber}
                                    onChange={(e) => setProfileForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF]"
                                />
                                {profileErrors.phoneNumber && <p className="text-[11px] text-red-500 mt-1">{profileErrors.phoneNumber}</p>}
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 flex gap-2">
                            <button type="button" onClick={() => setShowProfileModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
                                {t("person_cancel")}
                            </button>
                            <button type="button" onClick={handleSaveProfileContact} disabled={profileSaving} className="flex-1 py-2.5 rounded-xl bg-[#05ADCF] text-white font-bold hover:opacity-90 disabled:opacity-50">
                                {profileSaving ? t("person_saving") : t("person_save_profile")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Dashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState(() => {
        const savedUser = localStorage.getItem("loggedUser");
        return savedUser ? JSON.parse(savedUser) : null;
    });
    const forcePasswordChange = new URLSearchParams(location.search).get("force_password_change") === "1";

    useEffect(() => {
        if (!user) {
            window.location.href = "/";
            return;
        }
    }, [user]);

    useEffect(() => {
        const syncProfile = async () => {
            try {
                const profile = await apiFetch("/api/users/me");
                let contactSettings = null;
                try {
                    contactSettings = await apiFetch("/api/users/me/contact-settings");
                } catch {
                    contactSettings = null;
                }
                let profilePhoto = null;
                try {
                    profilePhoto = await getMyDisplayProfilePhoto();
                } catch {
                    profilePhoto = null;
                }
                const normalized = {
                    ...user,
                    ...profile,
                    universityName: profile?.full_name || user?.universityName || user?.full_name || user?.NameID || user?.username,
                    name: contactSettings?.display_name || user?.displayName || profile?.full_name || profile?.name || user?.name,
                    displayName: contactSettings?.display_name || user?.displayName || profile?.full_name || profile?.name || user?.name,
                    universityEmail: profile?.email || user?.universityEmail || user?.email,
                    recoveryEmail: contactSettings?.recovery_email || user?.recoveryEmail || profile?.email || user?.email,
                    phoneNumber: contactSettings?.phone_number || user?.phoneNumber || "",
                    nationalId: profile?.national_id || profile?.nationalId || user?.nationalId,
                    birthPlace: profile?.birth_place || profile?.birthPlace || user?.birthPlace,
                    profilePhotoUrl: withAccessToken(profilePhoto?.fileUrl || "", localStorage.getItem("access_token") || ""),
                };
                setUser(normalized);
                localStorage.setItem("loggedUser", JSON.stringify(normalized));
                window.dispatchEvent(new Event("loggedUserUpdated"));
            } catch {
                // Keep local profile when backend profile sync fails.
            }
        };
        if (user) syncProfile();
    }, []);

    if (!user)
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-12 h-12 border-4 border-[#05ADCF]/20 border-t-[#05ADCF] rounded-full animate-spin"></div>
            </div>
        );

    return (
        <PersonData
            user={user}
            onUserUpdate={setUser}
            forcePasswordChange={forcePasswordChange}
            onPasswordChanged={() => navigate("/dashboardstudent", { replace: true })}
        />
    );
}


