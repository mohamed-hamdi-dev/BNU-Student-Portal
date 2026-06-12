import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Send, User, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { liveChatService } from "../../../services/liveChatService";
import { ThemeContext } from "../../../context/ThemeContext.jsx";

const POLL_MS = 3000;

const safeArray = (value) => (Array.isArray(value) ? value : []);
const formatTime = (iso) => {
    if (!iso) return "--";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

const mapMessage = (message = {}) => ({
    id: message?.id || `msg-${Date.now()}`,
    role: message?.sender_type === "student" ? "user" : "admin",
    text: message?.text || "",
    timestamp: message?.created_at || new Date().toISOString(),
    isRead: Boolean(message?.is_read),
});

export default function ChatView({ adminProfile = {}, loading = false }) {
    const { isDarkMode } = useContext(ThemeContext);
    const { t } = useTranslation("global");
    const loggedUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("loggedUser") || "{}");
        } catch {
            return {};
        }
    }, []);

    const adminId = loggedUser?.id || loggedUser?.username || "admin";
    const adminName = adminProfile?.name || loggedUser?.name || "Admin";

    const [conversations, setConversations] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sending, setSending] = useState(false);
    const [closingConversation, setClosingConversation] = useState(false);
    const [error, setError] = useState("");

    const selectedConversation = useMemo(() => conversations.find((conv) => conv.id === selectedId) || null, [conversations, selectedId]);

    const loadConversations = useCallback(async () => {
        const data = await liveChatService.getAdminConversations();
        setConversations(data);
        setSelectedId((prev) => {
            if (prev && data.some((conv) => conv.id === prev)) return prev;
            return data[0]?.id || null;
        });
        return data;
    }, []);

    const loadMessages = useCallback(
        async (conversationId, markRead = false) => {
            if (!conversationId) {
                setMessages([]);
                return null;
            }
            setLoadingMessages(true);
            try {
                const data = await liveChatService.getConversationMessages(conversationId, { viewer: "admin" });
                const nextMessages = (Array.isArray(data) ? data : safeArray(data?.messages)).map(mapMessage);
                setMessages(nextMessages);
                if (markRead) {
                    await liveChatService.markConversationRead(conversationId, { reader_type: "admin", reader_id: adminId });
                }
                return data;
            } finally {
                setLoadingMessages(false);
            }
        },
        [adminId]
    );

    useEffect(() => {
        let mounted = true;
        setLoadingConversations(true);
        setError("");

        const tick = async () => {
            try {
                const latestConversations = await loadConversations();
                if (!mounted) return;
                const targetId = selectedId && latestConversations.some((conv) => conv.id === selectedId) ? selectedId : latestConversations[0]?.id || null;
                if (targetId) {
                    await loadMessages(targetId, true);
                } else {
                    setMessages([]);
                }
            } catch (err) {
                if (mounted) setError(err?.message || t("live_chat_error_load"));
            } finally {
                if (mounted) setLoadingConversations(false);
            }
        };

        tick();
        const interval = setInterval(tick, POLL_MS);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [loadConversations, loadMessages, selectedId]);

    const handleSelectConversation = async (conversationId) => {
        setSelectedId(conversationId);
        try {
            await loadMessages(conversationId, true);
            await loadConversations();
        } catch (err) {
            setError(err?.message || t("live_chat_error_open"));
        }
    };

    const handleSend = async () => {
        const text = draft.trim();
        if (!text || !selectedConversation || sending) return;
        if (selectedConversation?.status === "closed") return;
        setSending(true);
        setDraft("");
        setError("");
        try {
            await liveChatService.sendAdminMessage(selectedConversation.id, {
                adminId,
                adminName,
                text,
            });
            await loadMessages(selectedConversation.id, false);
            await loadConversations();
        } catch (err) {
            setError(err?.message || t("live_chat_error_send"));
            setDraft(text);
        } finally {
            setSending(false);
        }
    };

    const handleCloseConversation = async () => {
        if (!selectedConversation?.id || closingConversation || selectedConversation?.status === "closed") return;
        setClosingConversation(true);
        setError("");
        try {
            await liveChatService.closeConversation(selectedConversation.id);
            await loadConversations();
            await loadMessages(selectedConversation.id, false);
        } catch (err) {
            setError(err?.message || t("live_chat_error_close"));
        } finally {
            setClosingConversation(false);
        }
    };

    return (
        <div className={`flex h-[78vh] min-h-[520px] flex-col overflow-hidden rounded-2xl border shadow-lg lg:h-full lg:min-h-0 lg:flex-row ${isDarkMode ? "border-[#2a4568] bg-[#162C4F]" : "border-gray-200 bg-white"}`}>
            <div className="flex h-[38%] min-h-[220px] w-full flex-col border-b border-slate-200 bg-slate-900 lg:h-full lg:w-96 lg:border-b-0 lg:border-r">
                <div className="border-b border-white/10 p-3 sm:p-4">
                    <h2 className="text-center text-base font-black tracking-wide text-white sm:text-lg">{t("live_chat_inbox_title")}</h2>
                </div>
                <div className="live-scroll flex-1 space-y-1 overflow-y-auto p-2">
                    {conversations.map((conv) => (
                        <button
                            key={conv.id}
                            onClick={() => handleSelectConversation(conv.id)}
                            className={`w-full rounded-xl p-3 text-left transition-all ${
                                selectedConversation?.id === conv.id ? "bg-cyan-500 text-white shadow-lg" : "text-slate-100 hover:bg-slate-800"
                            }`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold">{conv.student_name || t("live_chat_student_fallback")}</p>
                                    <p className={`truncate text-[11px] ${selectedConversation?.id === conv.id ? "text-cyan-100" : "text-slate-300"}`}>{conv.student_username || conv.student_id || "-"}</p>
                                    <p className={`mt-1 truncate text-[11px] ${selectedConversation?.id === conv.id ? "text-white/90" : "text-slate-300"}`}>{conv.last_message_text || t("live_chat_no_messages")}</p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className="text-[10px]">{formatTime(conv.last_message_at || conv.updated_at)}</span>
                                    {Number(conv.unread_for_admin || 0) > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{conv.unread_for_admin}</span>}
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${conv.is_student_online ? "bg-emerald-500 text-white" : "bg-slate-500 text-slate-100"}`}>
                                        {conv.is_student_online ? t("live_chat_status_online") : t("live_chat_status_offline")}
                                    </span>
                                    {conv.rating_score && (
                                        <div className="flex items-center gap-0.5 text-amber-400 mt-0.5">
                                            <Star size={10} className="fill-current" />
                                            <span className="text-[10px] font-bold leading-none">{conv.rating_score}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
                    {!conversations.length && !loadingConversations && !loading && <p className="px-2 text-center text-xs text-slate-300">{t("live_chat_empty_list")}</p>}
                </div>
            </div>

            <div className={`flex min-h-0 flex-1 flex-col ${isDarkMode ? "bg-[#162C4F]" : "bg-white"}`}>
                <div className={`m-2 flex h-auto min-h-[56px] items-center justify-between rounded-2xl px-3 py-2 text-white shadow-md sm:m-4 sm:px-5 sm:py-3 ${isDarkMode ? "bg-[#10243f]" : "bg-slate-800"}`}>
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600">
                            <User size={16} />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold sm:text-base">{selectedConversation?.student_name || t("live_chat_no_session")}</p>
                            <p className="truncate text-[11px] text-slate-300">{selectedConversation?.student_username || selectedConversation?.student_id || "--"}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedConversation?.rating_score && (
                            <div className="hidden sm:flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200" title={selectedConversation.rating_comment}>
                                <Star size={14} className="fill-amber-400 text-amber-400" />
                                <span className="text-xs font-bold text-amber-600">{selectedConversation.rating_score}/5</span>
                                {selectedConversation.rating_comment && <span className="text-[10px] text-amber-700 max-w-[120px] truncate ml-1">"{selectedConversation.rating_comment}"</span>}
                            </div>
                        )}
                        <span className={`rounded-full px-2 py-1 text-[10px] sm:text-xs ${selectedConversation?.status === "closed" ? "bg-rose-500" : selectedConversation?.is_student_online ? "bg-green-500" : "bg-slate-500"}`}>
                            {selectedConversation?.status === "closed" ? t("live_chat_status_closed") : selectedConversation?.is_student_online ? t("live_chat_status_online") : t("live_chat_status_offline")}
                        </span>
                        <button
                            type="button"
                            onClick={handleCloseConversation}
                            disabled={!selectedConversation || selectedConversation?.status === "closed" || closingConversation}
                            className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5 sm:text-[11px]">
                            {closingConversation ? t("live_chat_closing") : t("live_chat_close")}
                        </button>
                    </div>
                </div>

                <div className="live-scroll flex-1 space-y-3 overflow-y-auto p-3 sm:p-6">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                            <div
                                className={`max-w-[86%] rounded-2xl p-3 text-sm leading-relaxed sm:max-w-md ${
                                    msg.role === "user" ? (isDarkMode ? "rounded-tl-none bg-[#1f3a5f] text-slate-100" : "rounded-tl-none bg-slate-100 text-slate-800") : (isDarkMode ? "rounded-tr-none border border-cyan-200 bg-[#d8f7ff] text-right text-[#0a2945]" : "rounded-tr-none border border-cyan-200 bg-cyan-50 text-right text-slate-800")
                                }`}>
                                <p>{msg.text}</p>
                                <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${msg.role === "admin" ? (isDarkMode ? "text-[#21506d]" : "text-slate-500") : (isDarkMode ? "text-slate-300" : "text-slate-500")}`}>
                                    <span>{formatTime(msg.timestamp)}</span>
                                    {msg.role === "admin" && <span className={msg.isRead ? "text-cyan-600" : isDarkMode ? "text-[#2f647f]" : "text-slate-400"}>{msg.isRead ? "✓✓" : "✓"}</span>}
                                </p>
                            </div>
                        </div>
                    ))}
                    {!messages.length && !loadingMessages && <p className={`text-center text-xs ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>{t("live_chat_select_conversation")}</p>}
                </div>

                <div className={`border-t p-3 sm:p-4 ${isDarkMode ? "border-[#2a4568] bg-[#112741]" : "bg-gray-50"}`}>
                    {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
                    <div className={`flex items-center gap-2 rounded-full border px-3 py-2 sm:px-4 ${isDarkMode ? "border-[#335a82] bg-[#0f223d]" : "bg-white"}`}>
                        <input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            type="text"
                            disabled={!selectedConversation || sending || selectedConversation?.status === "closed"}
                            placeholder={t("live_chat_reply_placeholder")}
                            className={`flex-1 pr-2 text-sm outline-none ${isDarkMode ? "text-slate-100 placeholder:text-slate-400" : ""}`}
                        />
                        <button onClick={handleSend} disabled={!selectedConversation || sending || selectedConversation?.status === "closed"} className="rounded-full p-2 text-cyan-600 transition-colors hover:bg-cyan-50 disabled:opacity-40">
                            <Send size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}


