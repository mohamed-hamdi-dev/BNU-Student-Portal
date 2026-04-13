import React, { useMemo, useState } from "react";
import { ArrowLeft, Archive, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const extractFeedbackMeta = (rawMessage = "") => {
    const text = String(rawMessage || "");
    const match = text.match(/^\[(LiveChat|CSAT):([^\]]+)\]\s*(.*)$/i);
    if (!match) return { tag: null, conversationId: null, displayMessage: text };
    return {
        tag: String(match[1] || "").toUpperCase(),
        conversationId: match[2] || null,
        displayMessage: match[3] || "",
    };
};

const extractRatingScore = (text = "") => {
    const match = String(text || "").match(/([1-5])\s*\/\s*5/);
    return match ? Number(match[1]) : 0;
};

const stripRatingPrefix = (text = "") =>
    String(text || "")
        .replace(/^\s*(Service rating|تقييم خدمة العملاء)\s*:\s*[1-5]\s*\/\s*5\s*-?\s*/i, "")
        .trim();

export default function FeedbackView({ feedbackItems = [], loading = false, actionBusy = false, onUpdateStatus, onDeleteItem }) {
    const { t } = useTranslation("admin");
    const [detailView, setDetailView] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [search, setSearch] = useState("");
    const [filterBy, setFilterBy] = useState("ALL");
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState("");

    const handleExportDeletionReport = async () => {
        if (exporting) return;
        setExporting(true);
        setExportError("");
        try {
            const token = localStorage.getItem("access_token");
            const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:8001";
            const url = `${base}/api/maintenance/deletion-report.csv`;
            const response = await fetch(url, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!response.ok) throw new Error(`Export failed: ${response.status}`);

            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = `deletion-report-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            setExportError(err?.message || t("feedback_export_failed"));
        } finally {
            setExporting(false);
        }
    };

    const filterOptions = [
        { value: "ALL", label: t("feedback_filter_all") },
        { value: "Read Only", label: t("feedback_filter_read_only") },
        { value: "Unread", label: t("feedback_filter_unread") },
    ];

    const visibleItems = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return feedbackItems.filter((item) => {
            const statusLabel = item.read ? "READ" : "UNREAD";
            const matchFilter = filterBy === "ALL" ? true : filterBy === "Read Only" ? statusLabel === "READ" : statusLabel === "UNREAD";
            const { conversationId, displayMessage } = extractFeedbackMeta(item?.message || "");
            const matchSearch =
                !normalizedSearch ||
                String(item.name || "").toLowerCase().includes(normalizedSearch) ||
                String(displayMessage || "").toLowerCase().includes(normalizedSearch) ||
                String(conversationId || "").toLowerCase().includes(normalizedSearch);
            return matchFilter && matchSearch;
        });
    }, [feedbackItems, filterBy, search]);

    if (detailView && selectedItem) {
        const detail = extractFeedbackMeta(selectedItem.message || "");
        const ratingScore = detail.tag === "CSAT" ? extractRatingScore(detail.displayMessage) : 0;
        const detailComment = detail.tag === "CSAT" ? stripRatingPrefix(detail.displayMessage) : detail.displayMessage;
        return (
            <div className="animate-in slide-in-from-right p-3 duration-300 sm:p-6 md:p-8">
                <button onClick={() => setDetailView(false)} className="mb-6 flex items-center font-bold text-slate-800 hover:underline">
                    <ArrowLeft className="mr-2" size={20} /> {t("feedback_back_to_list")}
                </button>
                <div className="rounded-3xl border-2 border-slate-300 bg-slate-200 p-5 text-center shadow-xl sm:p-8 md:p-10">
                    <h2 className="mb-8 text-3xl font-serif font-bold">{t("feedback_detail_title")}</h2>
                    {detail.conversationId ? (
                        <p className="mx-auto mb-4 inline-flex rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-white">
                            {detail.tag === "CSAT" ? "CSAT" : t("feedback_live_chat")}: {detail.conversationId}
                        </p>
                    ) : null}
                    {detail.tag === "CSAT" && ratingScore > 0 ? (
                        <div className="mb-4 flex items-center justify-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                                <span key={`star-${s}`} className={s <= ratingScore ? "text-amber-500" : "text-slate-300"}>
                                    ★
                                </span>
                            ))}
                        </div>
                    ) : null}
                    <p className="mx-auto max-w-2xl text-lg leading-relaxed text-gray-700">"{detailComment || t("feedback_no_details")}"</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 p-2 sm:space-y-6 sm:p-4 md:p-8">
            <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-sm sm:p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
                    <span className="text-xs font-semibold text-slate-500">{t("feedback_actions_per_row")}</span>
                    <button
                        type="button"
                        onClick={handleExportDeletionReport}
                        disabled={exporting}
                        className="rounded-lg bg-cyan-600 px-3 py-1 text-xs font-bold text-white hover:bg-cyan-700 disabled:opacity-50"
                    >
                        {exporting ? t("feedback_exporting") : t("feedback_export_csv")}
                    </button>
                    <div className="flex flex-wrap gap-3 sm:gap-4">
                        {filterOptions.map((f) => (
                            <label key={f.value} className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                                <input type="checkbox" checked={filterBy === f.value} onChange={() => setFilterBy(f.value)} className="rounded text-cyan-500" /> {f.label}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="relative w-full lg:w-auto">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-7 py-1.5 text-xs outline-none lg:w-auto"
                        placeholder={t("feedback_search_placeholder")}
                    />
                </div>
            </div>
            {exportError ? <p className="text-xs font-semibold text-rose-600">{exportError}</p> : null}

            <div className="space-y-3">
                {visibleItems.map((item) => {
                    const meta = extractFeedbackMeta(item.message || "");
                    const score = meta.tag === "CSAT" ? extractRatingScore(meta.displayMessage) : 0;
                    return (
                        <div
                            key={item.id}
                            onClick={() => {
                                setSelectedItem(item);
                                setDetailView(true);
                            }}
                            className="group flex cursor-pointer flex-col gap-3 rounded-2xl border-2 border-transparent bg-slate-100 p-4 transition-all hover:border-slate-800 hover:bg-white md:flex-row md:items-center md:justify-between"
                        >
                            <div className="flex items-center justify-between gap-2 md:w-1/2">
                                <span className="truncate font-bold text-slate-800 md:w-1/2">{item.name}</span>
                                <span className="truncate text-right text-xs font-medium text-gray-600 md:w-1/2 md:text-center md:text-sm">{item.level}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {score > 0 ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">{score}/5 ★</span>
                                ) : null}
                                <span className="rounded-full bg-slate-800 px-3 py-1 text-[10px] uppercase tracking-tighter text-white">{item.status}</span>
                            </div>
                            <span className="text-right text-xs text-gray-500 md:w-1/5 md:text-sm">{item.date}</span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    title={String(item.status || "").toLowerCase() === "resolved" ? t("feedback_mark_as_new") : t("feedback_mark_resolved")}
                                    disabled={actionBusy}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const nextStatus = String(item.status || "").toLowerCase() === "resolved" ? "NEW" : "Resolved";
                                        onUpdateStatus?.(item.id, nextStatus);
                                    }}
                                    className={`rounded-md p-1 disabled:opacity-50 ${
                                        String(item.status || "").toLowerCase() === "resolved"
                                            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                    }`}
                                >
                                    <Archive size={14} />
                                </button>
                                <button
                                    type="button"
                                    title={t("feedback_delete")}
                                    disabled={actionBusy}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const ok = window.confirm(t("feedback_delete_confirm"));
                                        if (ok) onDeleteItem?.(item.id);
                                    }}
                                    className="rounded-md bg-rose-100 p-1 text-rose-700 hover:bg-rose-200 disabled:opacity-50"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    );
                })}
                {!visibleItems.length && !loading && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs font-semibold text-slate-500">{t("feedback_empty")}</div>}
                {loading && <div className="text-xs font-semibold text-slate-500">{t("feedback_loading")}</div>}
            </div>
        </div>
    );
}
