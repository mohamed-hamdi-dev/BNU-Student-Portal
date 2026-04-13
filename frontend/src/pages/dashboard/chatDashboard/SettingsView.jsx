import React, { useContext, useMemo, useState } from "react";
import { Bell, KeyRound, Save, UploadCloud, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemeContext } from "../../../context/ThemeContext.jsx";

function NotifySwitch({ label, checked, onChange, isDarkMode = false }) {
    const { t } = useTranslation("admin");
    return (
        <div className={`space-y-1 rounded-2xl border p-3 shadow-sm ${isDarkMode ? "border-[#28466f] bg-[#162C4F]" : "border-slate-200 bg-white/80"}`}>
            <p className={`text-sm font-bold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{label}</p>
            <button
                type="button"
                onClick={onChange}
                className={`relative inline-flex h-8 w-32 items-center overflow-hidden rounded-xl border transition-all hover:shadow-sm ${
                    checked
                        ? "border-[#05ADCF] bg-[#05ADCF]/10"
                        : isDarkMode
                        ? "border-[#2d4f7c] bg-[#112741]"
                        : "border-slate-300 bg-slate-100"
                }`}
                aria-pressed={checked}
            >
                <span className={`absolute top-0.5 h-6 w-[60px] rounded-lg bg-[#05ADCF] transition-all duration-300 ${checked ? "right-0.5" : "left-0.5"}`} />
                <span className={`relative z-10 grid w-full grid-cols-2 text-xs font-black ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>
                    <span className={`${checked ? "opacity-70" : "opacity-100"}`}>{t("settings_switch_off")}</span>
                    <span className={`${checked ? "opacity-100" : "opacity-70"}`}>{t("settings_switch_on")}</span>
                </span>
            </button>
            <p className={`text-xs font-bold ${checked ? "text-emerald-600" : "text-slate-500"}`}>{checked ? t("settings_switch_enabled") : t("settings_switch_disabled")}</p>
        </div>
    );
}

export default function SettingsView({ settings, loading = false, actionBusy = false, onSaveProfile, onChangePassword, onSaveNotifications }) {
    const { isDarkMode } = useContext(ThemeContext);
    const { t } = useTranslation("admin");
    const tabs = [
        { key: "Profile", label: t("settings_tab_profile"), icon: User },
        { key: "Password", label: t("settings_tab_password"), icon: KeyRound },
        { key: "Notification", label: t("settings_tab_notification"), icon: Bell },
    ];
    const [activeTab, setActiveTab] = useState("Profile");
    const [profileDraft, setProfileDraft] = useState({});
    const [notificationsDraft, setNotificationsDraft] = useState({});
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [feedbackText, setFeedbackText] = useState("");

    const profileForm = useMemo(
        () => ({
            name: "Admin",
            surname: "",
            email: "admin@bnu.edu.eg",
            ...(settings?.profile || {}),
            ...profileDraft,
        }),
        [settings?.profile, profileDraft]
    );

    const notifications = useMemo(
        () => ({
            liveChat: true,
            summary: false,
            feedback: false,
            ...(settings?.notifications || {}),
            ...notificationsDraft,
        }),
        [settings?.notifications, notificationsDraft]
    );

    const avatarInitials = useMemo(() => {
        const fullName = String(profileForm.name || "").trim();
        const surname = String(profileForm.surname || "").trim();
        const parts = `${fullName} ${surname}`.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
        const compact = fullName.replace(/\s+/g, "");
        return (compact.slice(0, 2) || "AD").toUpperCase();
    }, [profileForm.name, profileForm.surname]);

    const updateProfileField = (key, value) => setProfileDraft((prev) => ({ ...prev, [key]: value }));
    const updatePasswordField = (key, value) => setPasswordForm((prev) => ({ ...prev, [key]: value }));

    const handleAvatarUpload = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setFeedbackText(t("settings_choose_image"));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            updateProfileField("avatar", String(reader.result || ""));
            setFeedbackText(t("settings_profile_image_selected"));
        };
        reader.readAsDataURL(file);
    };

    const toggleNotification = async (key) => {
        const next = { ...notifications, [key]: !notifications[key] };
        setNotificationsDraft((prev) => ({ ...prev, [key]: next[key] }));
        if (onSaveNotifications) {
            await onSaveNotifications(next);
            setFeedbackText(t("settings_notifications_saved"));
        }
    };

    const handleProfileSave = async () => {
        if (!onSaveProfile) return;
        await onSaveProfile(profileForm);
        setFeedbackText(t("settings_profile_saved"));
        setProfileDraft({});
    };

    const handlePasswordSave = async () => {
        if (!onChangePassword) return;
        const valid = await onChangePassword(passwordForm);
        setFeedbackText(valid ? t("settings_password_updated") : t("settings_password_mismatch"));
        if (valid) {
            setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        }
    };

    const handleNotificationsSave = async () => {
        if (!onSaveNotifications) return;
        await onSaveNotifications(notifications);
        setFeedbackText(t("settings_notifications_saved"));
        setNotificationsDraft({});
    };

    const inputClassName = `w-full rounded-2xl border px-4 py-2.5 outline-none transition-all duration-200 focus:border-[#05ADCF] focus:shadow-[0_0_0_3px_rgba(5,173,207,0.16)] ${
        isDarkMode
            ? "border-[#2d4f7c] bg-[#112741] text-slate-100 placeholder:text-slate-400 hover:border-[#3a5f90]"
            : "border-slate-300 bg-white text-slate-900 hover:border-slate-400"
    }`;

    return (
        <div className={`mx-auto max-w-3xl rounded-3xl border p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] sm:p-6 md:p-8 ${
            isDarkMode
                ? "border-[#28466f] bg-[#162C4F]"
                : "border-slate-200 bg-gradient-to-b from-[#f7fbfd] to-[#eef2f5]"
        }`}>
            <h2 className={`text-2xl font-black sm:text-3xl ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>{t("settings_title")}</h2>
            <p className={`mb-7 mt-1 text-xs ${isDarkMode ? "text-slate-300" : "text-slate-400"}`}>{t("settings_subtitle")}</p>

            <div className="mb-10 rounded-2xl bg-[#05ADCF] p-1.5 shadow-[0_8px_20px_-12px_rgba(5,173,207,0.8)]">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black transition-all duration-300 ${
                                activeTab === tab.key
                                    ? isDarkMode
                                        ? "bg-slate-100 text-slate-900 shadow-[inset_0_0_0_1px_rgba(5,173,207,0.25)]"
                                        : "bg-white text-slate-900 shadow-[inset_0_0_0_1px_rgba(5,173,207,0.25)]"
                                    : "text-white/95 hover:bg-white/20 hover:text-white"
                            }`}
                        >
                            <tab.icon size={16} />
                            <span className="text-xs sm:text-sm">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-[320px] animate-in fade-in duration-300">
                {activeTab === "Profile" && (
                    <div className="mx-auto flex max-w-md flex-col items-center space-y-5">
                        <label className="relative block cursor-pointer">
                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                            {profileForm.avatar ? (
                                <img src={profileForm.avatar} alt="Profile" className="h-24 w-24 rounded-2xl border-4 border-white object-cover shadow-md" />
                            ) : (
                                <div className={`flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white text-xl font-black shadow-md ${isDarkMode ? "bg-slate-700 text-slate-100" : "bg-slate-300 text-slate-800"}`}>{avatarInitials}</div>
                            )}
                            <span className="absolute -bottom-1 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#05ADCF] px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">
                                <UploadCloud size={11} />
                                {t("settings_upload")}
                            </span>
                        </label>

                        <div className="w-full space-y-3">
                            <div>
                                <label className={`mb-1 block text-sm font-bold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{t("settings_name")}</label>
                                <input value={profileForm.name} onChange={(e) => updateProfileField("name", e.target.value)} className={inputClassName} />
                            </div>
                            <div>
                                <label className={`mb-1 block text-sm font-bold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{t("settings_surname")}</label>
                                <input value={profileForm.surname} onChange={(e) => updateProfileField("surname", e.target.value)} className={inputClassName} />
                            </div>
                            <div>
                                <label className={`mb-1 block text-sm font-bold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{t("settings_email")}</label>
                                <input type="email" value={profileForm.email} onChange={(e) => updateProfileField("email", e.target.value)} className={inputClassName} />
                            </div>
                        </div>

                        <button
                            onClick={handleProfileSave}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#05ADCF] px-8 py-2.5 font-black text-white transition-all hover:-translate-y-0.5 hover:bg-[#0497b4] hover:shadow-lg"
                        >
                            <Save size={16} />
                            {t("settings_save_changes")}
                        </button>
                    </div>
                )}

                {activeTab === "Password" && (
                    <div className="mx-auto flex max-w-md flex-col items-center space-y-4">
                        <div className="w-full space-y-3">
                            <div>
                                <label className={`mb-1 block text-sm font-bold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{t("settings_current_password")}</label>
                                <input type="password" value={passwordForm.currentPassword} onChange={(e) => updatePasswordField("currentPassword", e.target.value)} className={inputClassName} />
                            </div>
                            <div>
                                <label className={`mb-1 block text-sm font-bold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{t("settings_new_password")}</label>
                                <input type="password" value={passwordForm.newPassword} onChange={(e) => updatePasswordField("newPassword", e.target.value)} className={inputClassName} />
                            </div>
                            <div>
                                <label className={`mb-1 block text-sm font-bold ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{t("settings_confirm_password")}</label>
                                <input type="password" value={passwordForm.confirmPassword} onChange={(e) => updatePasswordField("confirmPassword", e.target.value)} className={inputClassName} />
                            </div>
                        </div>

                        <button
                            onClick={handlePasswordSave}
                            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#05ADCF] px-8 py-2.5 font-black text-white transition-all hover:-translate-y-0.5 hover:bg-[#0497b4] hover:shadow-lg"
                        >
                            <KeyRound size={16} />
                            {t("settings_change_password")}
                        </button>
                    </div>
                )}

                {activeTab === "Notification" && (
                    <div className="mx-auto flex max-w-md flex-col space-y-4">
                        <NotifySwitch label={t("settings_live_chat")} checked={notifications.liveChat} onChange={() => toggleNotification("liveChat")} isDarkMode={isDarkMode} />
                        <NotifySwitch label={t("settings_summary")} checked={notifications.summary} onChange={() => toggleNotification("summary")} isDarkMode={isDarkMode} />
                        <NotifySwitch label={t("settings_feedback")} checked={notifications.feedback} onChange={() => toggleNotification("feedback")} isDarkMode={isDarkMode} />
                        <button
                            onClick={handleNotificationsSave}
                            className="mt-2 inline-flex items-center gap-2 self-start rounded-xl bg-[#05ADCF] px-7 py-2 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:bg-[#0497b4] hover:shadow-lg"
                        >
                            <Bell size={15} />
                            {t("settings_save_notifications")}
                        </button>
                    </div>
                )}
            </div>
            {(loading || actionBusy) && <p className={`mt-4 text-xs font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>{t("settings_saving")}</p>}
            {feedbackText && <p className={`mt-1 text-xs font-semibold ${isDarkMode ? "text-cyan-300" : "text-cyan-700"}`}>{feedbackText}</p>}
        </div>
    );
}
