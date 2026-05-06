import { useCallback, useEffect, useMemo, useState } from "react";
import { adminDashboardApi } from "../services/adminDashboardApi";

const DEFAULT_DONUT_COLORS = ["#8B5CF6", "#FF8A80", "#22d3ee", "#a78bfa"];
const DEFAULT_DAILY_TREND = [
    { day: "Sat", users: 95 },
    { day: "Sun", users: 120 },
    { day: "Mon", users: 141 },
    { day: "Tue", users: 133 },
    { day: "Wed", users: 157 },
    { day: "Thu", users: 166 },
    { day: "Fri", users: 172 },
];
const DEFAULT_FEATURES = [
    { feature: "Live Chat", value: 92 },
    { feature: "Course FAQ", value: 81 },
    { feature: "Registration", value: 76 },
];

const safeArray = (value) => (Array.isArray(value) ? value : []);
const normalizeDate = (isoDate) => {
    if (!isoDate) return "-";
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB");
};

const mapLocalSessionToDashboard = (session, index = 0) => {
    return {
        id: session?.id || `conv-${index + 1}`,
        name: session?.student_name || session?.studentName || "Student",
        owner: session?.student_name || "Student",
        status: session?.status || "active",
        mode: "service",
        msgs: Number(session?.unread_for_admin || 0),
        time: session?.last_message_at
            ? new Date(session.last_message_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
            : "now",
        lastMessage: session?.last_message_text || "",
        updatedAt: session?.updated_at || new Date().toISOString(),
        studentId: session?.student_id || null,
        studentUsername: session?.student_username || "-",
        level: session?.level || "-",
        major: session?.major || "-",
        unreadForAdmin: Number(session?.unread_for_admin || 0),
        messages: [],
    };
};
const normalizeFeedback = (item, index) => ({
    id: item?.id || index + 1,
    name: item?.name || item?.user_name || item?.userName || "Unknown",
    level: item?.level || "Level -",
    status: item?.status || "NEW",
    date: item?.date || normalizeDate(item?.created_at || item?.createdAt),
    message: item?.message || "No details available.",
    read: Boolean(item?.is_read ?? item?.read),
});

const resolveUserDisplayName = (user) =>
    user?.full_name ||
    user?.name ||
    user?.username ||
    user?.email ||
    "";

const normalizeStorage = (item, index, usersById = new Map()) => {
    const ownerId = item?.owner_id ?? item?.ownerId ?? null;
    const ownerNameFromUsers = ownerId !== null ? usersById.get(String(ownerId)) || "" : "";
    return {
        id: item?.id || index + 1,
        fileName: item?.file_name || item?.fileName || item?.title || `File_${index + 1}`,
        level: item?.level || "Level 1",
        owner: item?.owner || item?.owner_name || ownerNameFromUsers || "Admin",
        category: item?.category || "General Information",
        date: item?.date || normalizeDate(item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt),
        fav: Boolean(item?.is_favorite ?? item?.fav),
        isIndexed: Boolean(item?.is_indexed ?? item?.isIndexed),
        indexingStatus: item?.indexing_status || "pending",
        indexingError: item?.indexing_error || null,
        extractedText: item?.extracted_text || null,
        chunksCount: item?.chunks_count || 0,
        storedName: item?.stored_name ?? item?.storedName ?? null,
    };
};

const normalizeSettings = (settingsRow, fallbackProfile = {}) => ({
    profile: {
        name: settingsRow?.profile?.name || fallbackProfile?.name || "Admin",
        surname: settingsRow?.profile?.surname || fallbackProfile?.surname || "",
        email: settingsRow?.profile?.email || fallbackProfile?.email || "admin@bnu.edu.eg",
    },
    notifications: {
        liveChat: Boolean(settingsRow?.notifications?.liveChat ?? settingsRow?.notifications?.notify_live_chat ?? settingsRow?.notify_live_chat),
        summary: Boolean(settingsRow?.notifications?.summary ?? settingsRow?.notifications?.notify_summary ?? settingsRow?.notify_summary),
        feedback: Boolean(settingsRow?.notifications?.feedback ?? settingsRow?.notifications?.notify_feedback ?? settingsRow?.notify_feedback),
    },
});

const getLoggedUserSafe = () => {
    try {
        return JSON.parse(localStorage.getItem("loggedUser") || "{}");
    } catch {
        return {};
    }
};

const hasEmbeddedStorageFile = (html = "") => /\/api\/storage\/files\//i.test(String(html || ""));

export function useAdminDashboardData() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [users, setUsers] = useState([]);
    const [metricsRows, setMetricsRows] = useState([]);
    const [chatSessions, setChatSessions] = useState([]);
    const [feedbackItems, setFeedbackItems] = useState([]);
    const [storageItems, setStorageItems] = useState([]);
    const [createdContent, setCreatedContent] = useState([]);
    const [settings, setSettings] = useState(normalizeSettings(null));
    const [actionBusy, setActionBusy] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const loggedUser = getLoggedUserSafe();
            const [usersRes, metricsRes, chatRes, feedbackRes, storageRes, contentRes, settingsRes] = await Promise.all([
                adminDashboardApi.getUsers(),
                adminDashboardApi.getAdminMetrics(),
                adminDashboardApi.getChatSessions(),
                adminDashboardApi.getFeedbackItems(),
                adminDashboardApi.getStorageItems(),
                adminDashboardApi.getCreatedContent(),
                adminDashboardApi.getAdminSettings(),
            ]);
            const usersList = safeArray(usersRes);
            const usersById = new Map(
                usersList.map((u) => [
                    String(u?.id ?? u?.user_id ?? ""),
                    resolveUserDisplayName(u),
                ])
            );
            const remoteChat = safeArray(chatRes).map((s, i) => mapLocalSessionToDashboard(s, i));
            setUsers(usersList);
            setMetricsRows(safeArray(metricsRes));
            setChatSessions(remoteChat.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
            setFeedbackItems(safeArray(feedbackRes).map(normalizeFeedback));
            setStorageItems(safeArray(storageRes).map((item, idx) => normalizeStorage(item, idx, usersById)));
            setCreatedContent(safeArray(contentRes));
            const adminUser = safeArray(usersRes).find((u) => String(u?.role || "").toLowerCase() === "admin") || {};
            const fallbackProfile = {
                name: adminUser?.name || loggedUser?.name || loggedUser?.username || "User",
                surname: adminUser?.surname || "",
                email: adminUser?.email || loggedUser?.email || "user@bnu.edu.eg",
            };
            setSettings(normalizeSettings(safeArray(settingsRes)[0], fallbackProfile));
        } catch (err) {
            setError(err?.message || "Failed to load dashboard data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const studentsData = useMemo(() => {
        const students = users.filter((u) => String(u?.role || "").toLowerCase() === "student");
        const levelsMap = new Map();
        students.forEach((student) => {
            const level = student?.level || student?.studentLevel || "Level 1";
            levelsMap.set(level, (levelsMap.get(level) || 0) + 1);
        });
        if (!levelsMap.size) {
            return [
                { name: "Level 1", value: 0 },
                { name: "Level 2", value: 0 },
                { name: "Level 3", value: 0 },
                { name: "Level 4", value: 0 },
            ];
        }
        return [...levelsMap.entries()].map(([name, value]) => ({ name, value }));
    }, [users]);

    const metrics = useMemo(() => {
        const row = metricsRows[0] || {};
        const asked = safeArray(row.mostAsked).length
            ? row.mostAsked.map((item, idx) => ({ name: item?.name || item?.question || `Q${idx + 1}`, value: Number(item?.value || item?.count || 0) }))
            : [
                  { name: "Q1", value: 120 },
                  { name: "Q2", value: 70 },
                  { name: "Q3", value: 110 },
              ];
        const donut = safeArray(row.dailyUsersBreakdown).length
            ? row.dailyUsersBreakdown.map((item, idx) => ({ name: item?.name || `Segment ${idx + 1}`, value: Number(item?.value || 0), color: item?.color || DEFAULT_DONUT_COLORS[idx % DEFAULT_DONUT_COLORS.length] }))
            : [
                  { name: "Students", value: 60, color: DEFAULT_DONUT_COLORS[0] },
                  { name: "Guests", value: 40, color: DEFAULT_DONUT_COLORS[1] },
              ];
        const trend = safeArray(row.dailyUsersTrend).length
            ? row.dailyUsersTrend.map((item) => ({ day: item?.day || "-", users: Number(item?.users || 0) }))
            : DEFAULT_DAILY_TREND;
        const features = safeArray(row.mostUsedFeatures).length
            ? row.mostUsedFeatures.map((item) => ({ feature: item?.feature || item?.name || "Feature", value: Number(item?.value || item?.count || 0) }))
            : DEFAULT_FEATURES;

        return { askedData: asked, dailyUsersData: donut, dailyUsersTrend: trend, mostUsedFeaturesData: features };
    }, [metricsRows]);

    const chatUsers = useMemo(
        () =>
            chatSessions.map((session) => ({
                id: session.id,
                name: session.name,
                studentUsername: session.studentUsername || "-",
                time: session.time || "now",
                msgs: Number(session.msgs || 0),
                status: session.status || "Online",
                mode: session.mode || "general",
                lastMessage: session.lastMessage || "",
                level: session.level || "-",
                major: session.major || "-",
                unreadForAdmin: Number(session.unreadForAdmin || 0),
                updatedAt: session.updatedAt || null,
                messages: safeArray(session.messages),
            })),
        [chatSessions]
    );

    const saveProfile = useCallback(
        async (profile) => {
            setActionBusy(true);
            try {
                const next = { ...settings, profile: { ...settings.profile, ...profile } };
                await adminDashboardApi.upsertAdminSettings(next);
                setSettings(next);
            } finally {
                setActionBusy(false);
            }
        },
        [settings]
    );

    const changePassword = useCallback(async (payload) => {
        setActionBusy(true);
        try {
            await adminDashboardApi.upsertAdminSettings({ passwordMeta: { changedAt: new Date().toISOString(), hasPassword: true } });
            return payload?.newPassword === payload?.confirmPassword;
        } finally {
            setActionBusy(false);
        }
    }, []);

    const saveNotifications = useCallback(
        async (notifications) => {
            setActionBusy(true);
            try {
                const next = { ...settings, notifications: { ...notifications } };
                await adminDashboardApi.upsertAdminSettings({
                    notify_live_chat: Boolean(notifications?.liveChat),
                    notify_summary: Boolean(notifications?.summary),
                    notify_feedback: Boolean(notifications?.feedback),
                });
                setSettings(next);
            } finally {
                setActionBusy(false);
            }
        },
        [settings]
    );

    const updateFeedbackStatus = useCallback(async (feedbackId, newStatus) => {
        setActionBusy(true);
        try {
            const updated = await adminDashboardApi.updateFeedbackStatus(feedbackId, newStatus);
            setFeedbackItems((prev) =>
                prev.map((item) =>
                    Number(item.id) === Number(feedbackId)
                        ? normalizeFeedback({ ...item, ...updated }, 0)
                        : item
                )
            );
            return updated;
        } finally {
            setActionBusy(false);
        }
    }, []);

    const deleteFeedbackItem = useCallback(async (feedbackId) => {
        setActionBusy(true);
        try {
            await adminDashboardApi.deleteFeedbackItem(feedbackId);
            setFeedbackItems((prev) => prev.filter((item) => Number(item.id) !== Number(feedbackId)));
        } finally {
            setActionBusy(false);
        }
    }, []);

    const createStorageItem = useCallback(async (payload) => {
        const created = await adminDashboardApi.createStorageItem(payload);
        setStorageItems((prev) => [normalizeStorage(created, 0), ...prev]);
        return created;
    }, []);

    const updateStorageItem = useCallback(async (id, patch) => {
        const updated = await adminDashboardApi.updateStorageItem(id, patch);
        setStorageItems((prev) =>
            prev.map((item) => (Number(item.id) === Number(id) ? normalizeStorage({ ...item, ...updated }, 0) : item))
        );
        return updated;
    }, []);

    const deleteStorageItem = useCallback(async (id) => {
        setActionBusy(true);
        try {
            await adminDashboardApi.deleteStorageItem(id);
            await loadAll();
        } finally {
            setActionBusy(false);
        }
    }, [loadAll]);

    const deleteContent = useCallback(async (id) => {
        setActionBusy(true);
        try {
            await adminDashboardApi.deleteContent(id);
            await loadAll();
        } finally {
            setActionBusy(false);
        }
    }, [loadAll]);

    const indexStorageItem = useCallback(async (id) => {
        const result = await adminDashboardApi.indexStorageItem(id);
        const updated = result?.item || null;
        if (updated) {
            setStorageItems((prev) =>
                prev.map((item) => (Number(item.id) === Number(id) ? normalizeStorage({ ...item, ...updated }, 0) : item))
            );
        }
        return result;
    }, []);

    const toggleStorageFavorite = useCallback(
        async (id) => {
            const target = storageItems.find((item) => item.id === id);
            if (!target) return;
            await updateStorageItem(id, { fav: !target.fav });
        },
        [storageItems, updateStorageItem]
    );

    const createContent = useCallback(
        async (payload, options = {}) => {
            const contentItem = {
                target_level: payload?.to || null,
                subject: payload?.subject || "",
                category: payload?.category || "General Information",
                body: payload?.content || "",
                content_type: payload?.contentType || "text",
                tags: payload?.tags || "",
                college: payload?.toCollege || null,
                level: payload?.toBatch || null,
                program: payload?.program || null,
                file_url: payload?.fileUrl || null,
                academic_year: payload?.academicYear || null,
                semester: payload?.semester || null,
                display_priority: Number(payload?.displayPriority || 0),
            };
            const saved = await adminDashboardApi.createContent(contentItem);
            setCreatedContent((prev) => [saved, ...prev]);

            const storagePayload = {
                fileName: payload?.subject || `Content_${Date.now()}`,
                level: payload?.to || "All",
                owner: settings.profile?.name || getLoggedUserSafe()?.name || getLoggedUserSafe()?.username || "User",
                category: payload?.category || "General Information",
                date: normalizeDate(new Date().toISOString()),
                fav: false,
            };
            const shouldSkipStorage = Boolean(options?.skipStorage) || hasEmbeddedStorageFile(payload?.content || "");
            if (!shouldSkipStorage) {
                await createStorageItem(storagePayload);
            }
            return saved;
        },
        [createStorageItem, settings.profile?.name]
    );

    const updateContent = useCallback(
        async (contentId, payload, options = {}) => {
            const contentPatch = {
                target_level: payload?.to || null,
                subject: payload?.subject || "",
                category: payload?.category || "General Information",
                body: payload?.content || "",
                content_type: payload?.contentType || "text",
                tags: payload?.tags || "",
                college: payload?.toCollege || null,
                level: payload?.toBatch || null,
                program: payload?.program || null,
                file_url: payload?.fileUrl || null,
                academic_year: payload?.academicYear || null,
                semester: payload?.semester || null,
                display_priority: Number(payload?.displayPriority || 0),
            };
            const updated = await adminDashboardApi.updateContent(contentId, contentPatch);
            setCreatedContent((prev) =>
                prev.map((item) => (Number(item?.id) === Number(contentId) ? { ...item, ...updated } : item))
            );

            const linkedStorageId = options?.linkedStorageId;
            if (linkedStorageId) {
                await updateStorageItem(linkedStorageId, {
                    fileName: payload?.subject || "Untitled",
                    level: payload?.to || null,
                    category: payload?.category || null,
                });
            }
            return updated;
        },
        [updateStorageItem]
    );

    return {
        loading,
        error,
        actionBusy,
        refresh: loadAll,
        studentsData,
        askedData: metrics.askedData,
        dailyUsersData: metrics.dailyUsersData,
        dailyUsersTrend: metrics.dailyUsersTrend,
        mostUsedFeaturesData: metrics.mostUsedFeaturesData,
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
        deleteContent,
        indexStorageItem,
        toggleStorageFavorite,
        createContent,
        updateContent,
    };
}

