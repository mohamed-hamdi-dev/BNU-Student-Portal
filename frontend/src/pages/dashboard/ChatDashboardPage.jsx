import React, { useEffect, useRef, useState } from "react";
import { BarChart2, ChevronRight, Database, Home, IdCard, Menu, MessageCircle, MessageSquare, PlusSquare, Settings, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SidebarItem } from "./chatDashboard/shared";
import HomeView from "./chatDashboard/HomeView";
import ChatView from "./chatDashboard/ChatView";
import FeedbackView from "./chatDashboard/FeedbackView";
import SettingsView from "./chatDashboard/SettingsView";
import PlaceholderView from "./chatDashboard/PlaceholderView";
import CreateView from "./chatDashboard/CreateView";
import StorageView from "./chatDashboard/StorageView";
import SummaryView from "./chatDashboard/SummaryView";
import { useAdminDashboardData } from "../../hooks/useAdminDashboardData";
import { apiFetch } from "../../services/api";
import ThemeToggle from "../../components/common/ThemeToggle.jsx";
import ChangeLang from "../../components/Changelang.jsx";
import { useTranslation } from "react-i18next";

const AI_UPLOAD_STATUS_STORAGE_KEY = "admin_ai_upload_status_v1";

export default function ChatDashboardPage() {
    const { t, i18n } = useTranslation("admin");
    const isRTL = String(i18n.language || "ar").toLowerCase().startsWith("ar");
    const [activeTab, setActiveTab] = useState("home");
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth < 1024);
    const [createDraft, setCreateDraft] = useState(null);
    const [aiUploadStatus, setAiUploadStatus] = useState(() => {
        try {
            const raw = localStorage.getItem(AI_UPLOAD_STATUS_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return null;
            if (!parsed.type || !parsed.message) return null;
            return parsed;
        } catch {
            return null;
        }
    });
    const [aiUploadBusy, setAiUploadBusy] = useState(false);
    const [aiClearBusy, setAiClearBusy] = useState(false);
    const aiKnowledgeInputRef = useRef(null);
    const navigate = useNavigate();
    const {
        loading,
        error,
        actionBusy,
        studentsData,
        askedData,
        dailyUsersData,
        dailyUsersTrend,
        mostUsedFeaturesData,
        users,
        chatUsers,
        feedbackItems,
        settings,
        storageItems,
        createdContent,
        saveProfile,
        changePassword,
        saveNotifications,
        updateFeedbackStatus,
        deleteFeedbackItem,
        createStorageItem,
        updateStorageItem,
        deleteStorageItem,
        indexStorageItem,
        toggleStorageFavorite,
        createContent,
        updateContent,
    } = useAdminDashboardData();
    const TAB_CONTENT = {
        home: {
            title: t("chat_tab_home"),
            description: t("chat_tab_home_description"),
        },
        chat: {
            title: t("chat_tab_chat"),
            description: t("chat_tab_chat_description"),
        },
        feedback: {
            title: t("chat_tab_feedback"),
            description: t("chat_tab_feedback_description"),
        },
        settings: {
            title: t("chat_tab_settings"),
            description: t("chat_tab_settings_description"),
        },
        summary: {
            title: t("chat_tab_summary"),
            description: t("chat_tab_summary_description"),
        },
        create: {
            title: t("chat_tab_create"),
            description: t("chat_tab_create_description"),
        },
        storage: {
            title: t("chat_tab_storage"),
            description: t("chat_tab_storage_description"),
        },
    };
    const activeTabMeta = TAB_CONTENT[activeTab] || { title: t("chat_placeholder_section"), description: "" };
    const loggedUser = (() => {
        try {
            return JSON.parse(localStorage.getItem("loggedUser") || "{}");
        } catch {
            return {};
        }
    })();
    const adminName = settings?.profile?.name || loggedUser?.name || loggedUser?.username || t("default_user");
    const adminSurname = settings?.profile?.surname || "";
    const adminLabel = `${adminName} ${adminSurname}`.trim();
    const adminUsername =
        settings?.profile?.username ||
        loggedUser?.username ||
        loggedUser?.user ||
        loggedUser?.student_id ||
        loggedUser?.code ||
        "admin";
    const adminAvatarUrl =
        settings?.profile?.avatar ||
        settings?.profile?.profilePhotoUrl ||
        loggedUser?.profilePhotoUrl ||
        loggedUser?.avatarUrl ||
        loggedUser?.avatar ||
        "";
    const adminInitials = `${adminName?.[0] || "A"}${adminSurname?.[0] || ""}`.toUpperCase();

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setIsMobileMenuOpen(false);
    };

    useEffect(() => {
        const onResize = () => {
            setIsMobileViewport(window.innerWidth < 1024);
            if (window.innerWidth >= 1024) {
                setIsMobileMenuOpen(false);
            }
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
        try {
            if (!aiUploadStatus) {
                localStorage.removeItem(AI_UPLOAD_STATUS_STORAGE_KEY);
                return;
            }
            localStorage.setItem(AI_UPLOAD_STATUS_STORAGE_KEY, JSON.stringify(aiUploadStatus));
        } catch {
            // Ignore localStorage failures to avoid blocking the dashboard.
        }
    }, [aiUploadStatus]);

    const handleAiKnowledgeUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const isPdf = file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
        if (!isPdf) {
            setAiUploadStatus({ type: "error", message: t("chat_ai_pdf_only") });
            event.target.value = "";
            return;
        }

        setAiUploadBusy(true);
        setAiUploadStatus({ type: "loading", message: t("chat_ai_upload_processing") });
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("source", "student_guide_pdf");
            formData.append("access_scope", "public");
            const result = await apiFetch("/api/chatbot/rag/upload-pdf", {
                method: "POST",
                body: formData,
            });
            setAiUploadStatus({
                type: "success",
                message: t("chat_ai_upload_success", {
                    pages: Number(result?.pages_indexed || 0),
                    chunks: Number(result?.chunks_indexed || 0),
                }),
            });
        } catch (error) {
            setAiUploadStatus({
                type: "error",
                message: error?.message || t("chat_ai_upload_error"),
            });
        } finally {
            setAiUploadBusy(false);
            event.target.value = "";
        }
    };

    const handleAiKnowledgeClear = async () => {
        const shouldClear = window.confirm(t("chat_ai_clear_confirm"));
        if (!shouldClear) return;

        setAiClearBusy(true);
        setAiUploadStatus({ type: "loading", message: t("chat_ai_clear_processing") });
        try {
            await apiFetch("/api/chatbot/rag/clear", {
                method: "DELETE",
            });
            setAiUploadStatus({
                type: "success",
                message: t("chat_ai_clear_success"),
            });
        } catch (error) {
            setAiUploadStatus({
                type: "error",
                message: error?.message || t("chat_ai_clear_error"),
            });
        } finally {
            setAiClearBusy(false);
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case "home":
                return <HomeView studentsData={studentsData} askedData={askedData} dailyUsersData={dailyUsersData} dailyUsersTrend={dailyUsersTrend} mostUsedFeaturesData={mostUsedFeaturesData} loading={loading} error={error} />;
            case "chat":
                return <ChatView chatUsers={chatUsers} loading={loading} adminProfile={settings?.profile} />;
            case "feedback":
                return <FeedbackView feedbackItems={feedbackItems} loading={loading} actionBusy={actionBusy} onUpdateStatus={updateFeedbackStatus} onDeleteItem={deleteFeedbackItem} />;
            case "settings":
                return <SettingsView settings={settings} loading={loading} actionBusy={actionBusy} onSaveProfile={saveProfile} onChangePassword={changePassword} onSaveNotifications={saveNotifications} />;
            case "summary":
                return <SummaryView chatUsers={chatUsers} users={users} />;
            case "create":
                return (
                    <CreateView
                        initialData={createDraft}
                        onCreate={createContent}
                        onUpdate={updateContent}
                        onFinish={() => setCreateDraft(null)}
                        actionBusy={actionBusy}
                    />
                );
            case "storage":
                return (
                    <StorageView
                        data={storageItems}
                        createdContent={createdContent}
                        loading={loading}
                        onCreate={createStorageItem}
                        onUpdate={updateStorageItem}
                        onDelete={deleteStorageItem}
                        onIndex={indexStorageItem}
                        onToggleFavorite={toggleStorageFavorite}
                        onOpenAdvancedEdit={(file) => {
                            const fileName = String(file?.fileName || "");
                            const normalizedName = fileName.replace(/(_edited)+$/i, "");
                            const matchedContent =
                                createdContent.find((item) => String(item?.subject || "") === fileName) ||
                                createdContent.find((item) => String(item?.subject || "") === normalizedName);
                            setCreateDraft({
                                id: matchedContent?.id || null,
                                linkedStorageId: file?.id || null,
                                to: matchedContent?.target_level || file?.level || "",
                                category: matchedContent?.category || file?.category || "General Information",
                                subject: matchedContent?.subject || fileName,
                                content: matchedContent?.body || "",
                            });
                            handleTabChange("create");
                        }}
                    />
                );
            default:
                return <PlaceholderView label={t("chat_placeholder_section")} />;
        }
    };

    return (
        <div className="admin-chat-page flex h-[100dvh] overflow-hidden bg-[#05ADCF]/10" dir={isRTL ? "rtl" : "ltr"}>
            <aside
                className={`fixed bottom-0 top-0 z-50 flex w-72 flex-col bg-[#05ADCF] shadow-2xl transition-all duration-300 lg:static lg:z-10 ${
                    isMobileMenuOpen ? (isRTL ? "right-0" : "left-0") : isRTL ? "-right-72" : "-left-72"
                } ${isSidebarOpen ? "lg:w-72" : "lg:w-24"}`}>
                <div className={`flex flex-col p-6 ${isSidebarOpen || isMobileViewport ? "items-start" : "items-center"}`}>
                    <div className={`mb-4 flex w-full items-center ${isMobileViewport ? "justify-between" : isSidebarOpen ? "justify-start" : "justify-center"}`}>
                        <button
                            type="button"
                            onClick={() => {
                                if (isMobileViewport) {
                                    setIsMobileMenuOpen(false);
                                    return;
                                }
                                setIsSidebarOpen((prev) => !prev);
                            }}
                            className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 ${
                                isSidebarOpen
                                    ? "border-white/50 bg-white/20 text-white shadow-[0_10px_24px_-14px_rgba(15,23,42,.85)] backdrop-blur-md hover:bg-white/30"
                                    : "border-cyan-200/70 bg-white text-[#05ADCF] shadow-[0_10px_24px_-14px_rgba(5,173,207,.65)] hover:bg-cyan-50"
                            }`}
                            aria-label={isSidebarOpen ? t("close_menu") : t("chat_open_sidebar")}>
                            {isMobileViewport ? <X size={18} /> : isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                        {isMobileViewport && <ThemeToggle compact />}
                    </div>
                    <div className="mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white/30 text-2xl font-black text-white shadow-lg">
                        {adminAvatarUrl ? (
                            <img src={adminAvatarUrl} alt={adminLabel} className="h-full w-full object-cover" />
                        ) : (
                            adminInitials
                        )}
                    </div>
                    {isSidebarOpen && (
                        <div className="w-full px-2 py-1 text-white">
                            <h2 className="text-sm font-black">{adminLabel}</h2>
                            <p className="mt-1 text-[11px] font-semibold text-white/75">
                                <span className="inline-flex items-center gap-1.5">
                                    <IdCard size={12} />
                                    <span>{adminUsername}</span>
                                </span>
                            </p>
                        </div>
                    )}
                </div>

                <nav className="flex-1 space-y-2 px-4 py-4">
                    <SidebarItem icon={Home} label={t("chat_sidebar_home")} active={activeTab === "home"} onClick={() => handleTabChange("home")} collapsed={!isSidebarOpen} />
                    <SidebarItem icon={BarChart2} label={t("chat_sidebar_summary")} active={activeTab === "summary"} onClick={() => handleTabChange("summary")} collapsed={!isSidebarOpen} />
                    <SidebarItem
                        icon={PlusSquare}
                        label={t("chat_sidebar_create")}
                        active={activeTab === "create"}
                        onClick={() => {
                            setCreateDraft(null);
                            handleTabChange("create");
                        }}
                        collapsed={!isSidebarOpen}
                    />
                    <SidebarItem icon={Database} label={t("chat_sidebar_storage")} active={activeTab === "storage"} onClick={() => handleTabChange("storage")} collapsed={!isSidebarOpen} />
                    <SidebarItem icon={MessageCircle} label={t("chat_sidebar_live_chat")} active={activeTab === "chat"} onClick={() => handleTabChange("chat")} collapsed={!isSidebarOpen} />
                    <SidebarItem icon={MessageSquare} label={t("chat_sidebar_feedback")} active={activeTab === "feedback"} onClick={() => handleTabChange("feedback")} collapsed={!isSidebarOpen} />
                </nav>
            </aside>

            {isMobileMenuOpen && (
                <button
                    type="button"
                    className="fixed inset-0 z-40 bg-transparent backdrop-blur-[1px] lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-label={t("close_menu")}
                />
            )}

            <main
                className={`relative z-0 flex flex-1 flex-col overflow-hidden bg-white transition-all duration-200 ${
                    isMobileMenuOpen ? "pointer-events-none !bg-transparent lg:pointer-events-auto lg:!bg-white" : ""
                }`}
            >
                <div className="z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-3 py-3 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.55)] transition-all duration-200 sm:px-4 sm:py-4 md:px-6 md:py-5 lg:flex-nowrap">
                    <button
                        type="button"
                        onClick={() => setIsMobileMenuOpen(true)}
                        className={`order-1 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 lg:hidden ${isRTL ? "ml-auto" : ""}`}
                        aria-label={t("chat_open_sidebar")}>
                        <Menu size={18} />
                    </button>

                    <div className={`order-3 flex min-w-0 flex-1 items-center gap-3 ${isRTL ? "justify-start lg:order-1 lg:justify-end" : "justify-start"}`} dir={isRTL ? "rtl" : "ltr"}>
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate text-sm font-bold text-slate-800 sm:text-base md:text-lg">{activeTabMeta.title}</h2>
                            <p className="hidden truncate text-[10px] font-medium text-gray-500 sm:block">{activeTabMeta.description}</p>
                        </div>

                        <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700 shadow-sm sm:px-3 sm:py-1.5">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[#05ADCF]">
                                <MessageCircle size={13} />
                            </span>
                            <h1 className="text-[11px] font-black tracking-wide sm:text-xs">{t("chat_brand")}</h1>
                        </div>
                    </div>

                    <div className={`order-2 flex items-center gap-2 ${isRTL ? "mr-auto lg:order-2" : "ml-auto"}`}>
                        <div className="hidden lg:block">
                            <ThemeToggle compact />
                        </div>
                        <div className="flex h-10 items-center justify-center scale-[0.74] origin-center">
                            <ChangeLang variant="admin-navbar" />
                        </div>
                        <button
                            type="button"
                            onClick={() => setActiveTab("settings")}
                            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                                activeTab === "settings" ? "border-cyan-200 bg-cyan-50 text-[#05ADCF]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                            aria-label={t("chat_open_settings")}
                            title={t("chat_open_settings")}
                        >
                            <Settings size={18} />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => navigate("/admin/dashboard")}
                        className={`order-4 flex h-9 w-9 items-center justify-center rounded-xl bg-[#05ADCF] text-white shadow-lg transition hover:bg-[#048fb0] sm:h-10 sm:w-10 ${isRTL ? "lg:order-0" : ""}`}
                        aria-label={t("chat_back_to_admin_dashboard")}>
                        <ChevronRight />
                    </button>
                </div>

                <div
                    className={`dashboard-scroll flex-1 overflow-y-auto bg-[#05ADCF]/5 p-3 transition-all duration-200 sm:p-4 md:p-6 lg:p-8 ${
                        isMobileMenuOpen ? "!bg-transparent lg:!bg-[#05ADCF]/5" : ""
                    }`}
                >

                    {renderContent()}
                </div>
            </main>
        </div>
    );
}

