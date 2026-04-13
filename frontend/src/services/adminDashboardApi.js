import { apiFetch } from "./api";

const safeArray = (value) => (Array.isArray(value) ? value : []);

export const adminDashboardApi = {
    async getUsers() {
        const data = await apiFetch("/api/users");
        return safeArray(data);
    },
    async getAdminMetrics() {
        // Updated to real dashboard endpoint
        const data = await apiFetch("/api/dashboard/metrics");
        return data; 
    },
    async getChatSessions() {
        // Admin viewing Live Support chats
        const data = await apiFetch("/api/conversations");
        return safeArray(data);
    },
    async getFeedbackItems() {
        // Admin viewing Feedback
        const data = await apiFetch("/api/feedback");
        return safeArray(data);
    },
    async updateFeedbackStatus(id, newStatus) {
        const statusValue = encodeURIComponent(newStatus);
        return apiFetch(`/api/feedback/${id}/status?new_status=${statusValue}`, { method: "PATCH" });
    },
    async deleteFeedbackItem(id) {
        return apiFetch(`/api/feedback/${id}`, { method: "DELETE" });
    },
    async getStorageItems() {
        // Admin viewing Storage
        const data = await apiFetch("/api/storage");
        return safeArray(data);
    },
    async getCreatedContent() {
        // Admin viewing Content
        const data = await apiFetch("/api/content");
        return safeArray(data);
    },
    async getAdminSettings() {
        // FastAPI returns an object for settings, so we wrap it in an array to match old signature or just return it directly
        try {
            const data = await apiFetch("/api/settings");
            return [data];
        } catch {
            return [];
        }
    },
    async createStorageItem(payload) {
        const body = {
            file_name: payload?.file_name ?? payload?.fileName ?? "Untitled",
            level: payload?.level ?? null,
            category: payload?.category ?? null,
            is_favorite: Boolean(payload?.is_favorite ?? payload?.fav ?? false),
        };
        return apiFetch("/api/storage", { method: "POST", body: JSON.stringify(body) });
    },
    async updateStorageItem(id, payload) {
        const body = {};
        if (payload?.fileName !== undefined || payload?.file_name !== undefined) body.file_name = payload?.file_name ?? payload?.fileName;
        if (payload?.level !== undefined) body.level = payload.level;
        if (payload?.category !== undefined) body.category = payload.category;
        if (payload?.fav !== undefined || payload?.is_favorite !== undefined) body.is_favorite = Boolean(payload?.is_favorite ?? payload?.fav);
        if (payload?.is_indexed !== undefined || payload?.isIndexed !== undefined) body.is_indexed = Boolean(payload?.is_indexed ?? payload?.isIndexed);
        return apiFetch(`/api/storage/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    async indexStorageItem(id) {
        return apiFetch(`/api/storage/${id}/index`, { method: "POST" });
    },
    async deleteStorageItem(id) {
        return apiFetch(`/api/storage/${id}`, { method: "DELETE" });
    },
    async createContent(payload) {
        return apiFetch("/api/content", { method: "POST", body: JSON.stringify(payload) });
    },
    async updateContent(id, payload) {
        return apiFetch(`/api/content/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    },
    async deleteContent(id) {
        return apiFetch(`/api/content/${id}`, { method: "DELETE" });
    },
    async ensureChatSession(payload) {
        // Local chatbot sessions do not map to student support conversation creation.
        // Avoid hitting /api/conversations/ensure here because that endpoint is student-only.
        return Promise.resolve({ skipped: true, reason: "student_only_endpoint" });
    },
    async upsertAdminSettings(settings) {
        return apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify(settings) });
    },
};
