import React, { useContext, useEffect, useMemo, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { liveChatService } from "../../../services/liveChatService";
import { ThemeContext } from "../../../context/ThemeContext";
import { useTranslation } from "react-i18next";

const formatDate = (isoLike) => {
    if (!isoLike) return "-";
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-GB");
};

const safeArray = (value) => (Array.isArray(value) ? value : []);
const readLocalObject = (key) => {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
};

export default function SummaryView({ chatUsers = [], users = [] }) {
    const { t } = useTranslation("admin");
    const { isDarkMode } = useContext(ThemeContext);
    const [selectedId, setSelectedId] = useState(null);
    const [readOnly, setReadOnly] = useState(false);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [favorites, setFavorites] = useState(() => readLocalObject("summary.favorites"));
    const [hiddenRows, setHiddenRows] = useState(() => readLocalObject("summary.hiddenRows"));
    const [messagesByConversation, setMessagesByConversation] = useState({});
    const [loadingMessages, setLoadingMessages] = useState(false);

    const rows = useMemo(() => {
        const profileByUsername = new Map(
            safeArray(users).map((u) => [
                String(u?.username || "").trim().toLowerCase(),
                {
                    level: u?.level || "-",
                    major: u?.major || u?.college || "-",
                },
            ])
        );
        const profileByName = new Map(
            safeArray(users).map((u) => [
                String(u?.full_name || u?.name || "").trim().toLowerCase(),
                {
                    level: u?.level || "-",
                    major: u?.major || u?.college || "-",
                },
            ])
        );

        return safeArray(chatUsers).map((chat) => {
            const key = String(chat?.name || "").trim().toLowerCase();
            const byUsername = profileByUsername.get(String(chat?.studentUsername || "").trim().toLowerCase());
            const byExactName = profileByName.get(key);
            const byPartialName =
                byExactName ||
                safeArray(users)
                    .map((u) => ({
                        name: String(u?.full_name || u?.name || "").trim().toLowerCase(),
                        level: u?.level || "-",
                        major: u?.major || u?.college || "-",
                    }))
                    .find((u) => u.name.includes(key) || key.includes(u.name));
            const profile = byUsername || byExactName || byPartialName || {};
            const unread = Number(chat?.unreadForAdmin || chat?.msgs || 0) > 0;
            return {
                id: chat?.id,
                code: "SD",
                name: chat?.name || t("summary_unknown"),
                level: chat?.level || profile.level || "-",
                major: chat?.major || profile.major || "-",
                date: formatDate(chat?.updatedAt || chat?.time || null),
                unread,
                read: !unread,
                favorite: Boolean(favorites?.[chat?.id]),
                messages: safeArray(messagesByConversation?.[chat?.id]),
            };
        });
    }, [chatUsers, users, favorites, messagesByConversation, t]);

    const visibleRows = useMemo(() => {
        return rows.filter((row) => {
            if (hiddenRows[row.id]) return false;
            if (readOnly && !row.read) return false;
            if (unreadOnly && !row.unread) return false;
            if (favoritesOnly && !row.favorite) return false;
            return true;
        });
    }, [rows, hiddenRows, readOnly, unreadOnly, favoritesOnly]);

    const activeRow = visibleRows.find((row) => row.id === selectedId) || null;

    useEffect(() => {
        localStorage.setItem("summary.favorites", JSON.stringify(favorites));
    }, [favorites]);

    useEffect(() => {
        localStorage.setItem("summary.hiddenRows", JSON.stringify(hiddenRows));
    }, [hiddenRows]);

    useEffect(() => {
        const loadMessages = async () => {
            if (!selectedId) return;
            if (messagesByConversation[selectedId]) return;
            setLoadingMessages(true);
            try {
                const data = await liveChatService.getConversationMessages(selectedId);
                const normalized = safeArray(data).map((m) => ({
                    id: m?.id,
                    role: m?.sender_type === "student" ? "user" : "admin",
                    text: m?.text || "",
                    timestamp: m?.created_at || null,
                }));
                setMessagesByConversation((prev) => ({ ...prev, [selectedId]: normalized }));
            } finally {
                setLoadingMessages(false);
            }
        };
        loadMessages();
    }, [selectedId, messagesByConversation]);

    return (
        <div className={`space-y-4 rounded-2xl border p-3 sm:p-4 ${isDarkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-[#d9e0e5] text-slate-900"}`}>
            <h3 className={`border-b pb-2 text-center text-2xl font-black sm:text-3xl ${isDarkMode ? "border-slate-700 text-slate-100" : "border-black text-slate-900"}`}>{t("summary_title")}</h3>

            <div className={`flex flex-wrap items-center justify-center gap-3 rounded-xl px-3 py-2 text-xs font-bold sm:gap-4 sm:px-4 ${isDarkMode ? "bg-slate-800 text-slate-200" : "bg-slate-300/50 text-slate-700"}`}>
                <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!readOnly && !unreadOnly} onChange={() => { setReadOnly(false); setUnreadOnly(false); }} /> {t("summary_filter_all")}</label>
                <label className="inline-flex items-center gap-1"><input type="checkbox" checked={readOnly} onChange={() => { setReadOnly((v) => !v); setUnreadOnly(false); }} /> {t("summary_filter_read_only")}</label>
                <label className="inline-flex items-center gap-1"><input type="checkbox" checked={unreadOnly} onChange={() => { setUnreadOnly((v) => !v); setReadOnly(false); }} /> {t("summary_filter_unread")}</label>
                <button
                    type="button"
                    onClick={() => {
                        if (selectedId) {
                            setHiddenRows((prev) => ({ ...prev, [selectedId]: true }));
                            setSelectedId(null);
                            return;
                        }
                        setHiddenRows((prev) => {
                            const next = { ...prev };
                            visibleRows.forEach((r) => {
                                next[r.id] = true;
                            });
                            return next;
                        });
                    }}
                    title={t("summary_delete_selected")}
                >
                    <Trash2 size={14} />
                </button>
                <button type="button" onClick={() => setFavoritesOnly((v) => !v)} title={t("summary_favorites_only")}>
                    <Star size={14} className={favoritesOnly ? "fill-rose-500 text-rose-500" : isDarkMode ? "text-slate-200" : "text-slate-700"} />
                </button>
            </div>

            <div className="space-y-2">
                {visibleRows.map((row) => (
                    <div
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        className={`w-full cursor-pointer rounded-xl px-3 py-3 ${
                            isDarkMode
                                ? selectedId === row.id
                                    ? "bg-slate-700"
                                    : "bg-slate-800 hover:bg-slate-700"
                                : selectedId === row.id
                                ? "bg-slate-200"
                                : "bg-slate-300/60 hover:bg-slate-300"
                        }`}
                    >
                        <div className="flex items-center justify-between gap-2 md:hidden">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black">{row.name}</p>
                                <p className={`mt-1 text-xs font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                                    {row.code} - {row.level} - {row.major}
                                </p>
                                <p className={`mt-1 text-[11px] font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>{row.date}</p>
                            </div>
                            <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-full p-1.5"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setFavorites((prev) => ({ ...prev, [row.id]: !prev[row.id] }));
                                }}
                                title={t("summary_favorite")}
                            >
                                <Star size={15} className={row.favorite ? "fill-rose-500 text-rose-500" : isDarkMode ? "text-slate-200" : "text-slate-700"} />
                            </button>
                        </div>

                        <div className="hidden grid-cols-[24px_60px_1fr_100px_70px_120px_34px] items-center gap-2 text-left md:grid">
                            <input type="checkbox" readOnly checked={selectedId === row.id} />
                            <span className="font-black">{row.code}</span>
                            <span className="truncate font-black">{row.name}</span>
                            <span className="font-black">{row.level}</span>
                            <span className="font-black">{row.major}</span>
                            <span className="font-black">{row.date}</span>
                            <button
                                type="button"
                                className="inline-flex items-center justify-center"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setFavorites((prev) => ({ ...prev, [row.id]: !prev[row.id] }));
                                }}
                                title={t("summary_favorite")}
                            >
                                <Star size={15} className={row.favorite ? "fill-rose-500 text-rose-500" : isDarkMode ? "text-slate-200" : "text-slate-700"} />
                            </button>
                        </div>
                    </div>
                ))}
                {!visibleRows.length && <p className={`py-8 text-center text-sm font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>{t("summary_empty_rows")}</p>}
            </div>

            {activeRow && (
                <div className={`rounded-xl border-2 border-cyan-500 p-3 text-right sm:p-4 ${isDarkMode ? "bg-slate-800" : "bg-white/60"}`}>
                    <p className="mb-3 text-center text-lg font-black sm:text-2xl">{activeRow.name} &nbsp; {activeRow.level} &nbsp; {activeRow.major}</p>
                    <div className="space-y-2 text-sm">
                        {activeRow.messages.slice(-8).map((m, i) => (
                            <p key={`${activeRow.id}-${i}`} className={m?.role === "user" ? isDarkMode ? "text-slate-100" : "text-slate-800" : "text-rose-600"}>
                                {m?.text || "-"}
                            </p>
                        ))}
                        {!activeRow.messages.length && !loadingMessages && <p className={isDarkMode ? "text-slate-400" : "text-slate-500"}>{t("summary_no_conversation_details")}</p>}
                        {loadingMessages && <p className={isDarkMode ? "text-slate-400" : "text-slate-500"}>{t("summary_loading_messages")}</p>}
                    </div>
                </div>
            )}
        </div>
    );
}

