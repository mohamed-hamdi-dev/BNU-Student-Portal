import { apiFetch } from "./api";

const appendQuery = (path, params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        qs.append(key, String(value));
    });
    const query = qs.toString();
    return query ? `${path}?${query}` : path;
};

export const liveChatService = {
    async ensureStudentConversation(payload = {}) {
        return apiFetch("/api/conversations/ensure", {
            method: "POST",
            body: JSON.stringify({
                student_id: payload?.student_id ?? payload?.studentId ?? undefined,
                student_name: payload?.student_name ?? payload?.studentName ?? undefined,
            }),
        });
    },

    async getAdminConversations() {
        return apiFetch("/api/conversations");
    },

    async getStudentConversations() {
        return apiFetch("/api/conversations");
    },

    async getConversationMessages(conversationId, params = {}) {
        const path = appendQuery(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
            viewer: params?.viewer,
            student_id: params?.student_id ?? params?.studentId,
            admin_id: params?.admin_id ?? params?.adminId,
        });
        return apiFetch(path);
    },

    async sendStudentMessage(conversationId, payload) {
        return apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
            method: "POST",
            body: JSON.stringify({
                student_id: payload?.student_id ?? payload?.studentId ?? undefined,
                student_name: payload?.student_name ?? payload?.studentName ?? undefined,
                text: payload?.text,
            }),
        });
    },

    async sendAdminMessage(conversationId, payload) {
        return apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
            method: "POST",
            body: JSON.stringify({
                admin_id: payload?.admin_id ?? payload?.adminId ?? undefined,
                admin_name: payload?.admin_name ?? payload?.adminName ?? undefined,
                text: payload?.text,
            }),
        });
    },

    async markConversationRead(conversationId, payload = {}) {
        return apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/read`, {
            method: "POST",
            body: JSON.stringify({
                reader_type: payload?.reader_type ?? payload?.readerType ?? undefined,
                reader_id: payload?.reader_id ?? payload?.readerId ?? undefined,
            }),
        });
    },

    async updateStudentPresence(conversationId, payload) {
        const online =
            typeof payload?.is_student_online === "boolean"
                ? payload.is_student_online
                : Boolean(payload?.isOnline);
        return apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/presence`, {
            method: "PATCH",
            body: JSON.stringify({ is_student_online: online }),
        });
    },

    async getConversationRating(conversationId) {
        return apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/rating`);
    },

    async submitConversationRating(conversationId, payload) {
        return apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/rating`, {
            method: "POST",
            body: JSON.stringify({
                score: Number(payload?.score || 0),
                comment: payload?.comment || "",
            }),
        });
    },

    async closeConversation(conversationId) {
        return apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/close`, {
            method: "PATCH",
        });
    },
};
