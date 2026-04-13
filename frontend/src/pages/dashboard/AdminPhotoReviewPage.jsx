import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Image as ImageIcon, Search, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  approveProfilePhoto,
  exportProfileCardPack,
  listProfilePhotosForReview,
  rejectProfilePhoto,
} from "../../services/profilePhotoApi";
import { useAccountRequestCatalog } from "../../hooks/useAccountRequestCatalog";

const withToken = (url) => {
  if (!url) return "";
  const token = localStorage.getItem("access_token") || "";
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
};

const statusBadgeClass = (status) => {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "pending_review") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
};

const EMPTY_SUMMARY = { total_students: 0, with_approved: 0, without_approved: 0 };

export default function AdminPhotoReviewPage() {
  const { t } = useTranslation("admin");
  const { colleges, getLevelsByCollege } = useAccountRequestCatalog();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState(null);
  const [rejectReason, setRejectReason] = useState({});

  const [filters, setFilters] = useState({
    college: "",
    level: "",
    q: "",
    status: "all",
  });

  const [exportOptions, setExportOptions] = useState({
    includeNonApproved: false,
    includeWithoutPhoto: true,
  });

  const yearOptions = useMemo(() => getLevelsByCollege(filters.college), [filters.college, getLevelsByCollege]);
  const statusOptions = useMemo(() => [
    { value: "all", label: t("admin.photos.allStatuses") },
    { value: "approved", label: t("admin.photos.approved") },
    { value: "pending_review", label: t("admin.photos.pending") },
    { value: "rejected", label: t("admin.photos.rejected") },
  ], [t]);
  const statusLabel = (status) => {
    if (status === "approved") return t("admin.photos.approved");
    if (status === "pending_review") return t("admin.photos.pending");
    if (status === "rejected") return t("admin.photos.rejected");
    if (status === "replaced") return t("admin.photos.replaced");
    return status || "-";
  };

  const refresh = async () => {
    try {
      setLoading(true);
      const data = await listProfilePhotosForReview({
        college: filters.college || undefined,
        level: filters.level || undefined,
        search: filters.q || undefined,
        status: filters.status,
      });
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary || EMPTY_SUMMARY);
    } catch (error) {
      alert(error.message || t("admin.photos.messages.loadError"));
      setItems([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onApprove = async (id) => {
    try {
      setActionBusyId(id);
      await approveProfilePhoto(id);
      await refresh();
    } catch (error) {
      alert(error.message || t("admin.photos.messages.approveError"));
    } finally {
      setActionBusyId(null);
    }
  };

  const onReject = async (id) => {
    const reason = (rejectReason[id] || "").trim();
    if (reason.length < 3) {
      alert(t("admin.photos.messages.rejectReasonRequired"));
      return;
    }
    try {
      setActionBusyId(id);
      await rejectProfilePhoto(id, reason);
      await refresh();
    } catch (error) {
      alert(error.message || t("admin.photos.messages.rejectError"));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleExport = async () => {
    if (!filters.college || !filters.level) {
      alert(t("admin.photos.messages.exportScopeRequired"));
      return;
    }
    try {
      const { blob, fileName } = await exportProfileCardPack({
        college: filters.college,
        level: filters.level,
        includeNonApproved: exportOptions.includeNonApproved,
        includeWithoutPhoto: exportOptions.includeWithoutPhoto,
        search: filters.q || "",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "card-photos.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message || t("admin.photos.messages.exportError"));
    }
  };

  const exportDisabled = loading || !filters.college || !filters.level || Number(summary.total_students || 0) === 0;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-slate-800">{t("admin.photos.title")}</h1>
        <button onClick={refresh} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
          {t("admin.common.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-5">
        <select
          value={filters.college}
          onChange={(e) => setFilters((prev) => ({ ...prev, college: e.target.value, level: "" }))}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#05ADCF]"
        >
          <option value="">{t("admin.photos.allColleges")}</option>
          {colleges.map((college) => (
            <option key={`photo-college-${college}`} value={college}>
              {college}
            </option>
          ))}
        </select>

        <select
          value={filters.level}
          onChange={(e) => setFilters((prev) => ({ ...prev, level: e.target.value }))}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#05ADCF]"
        >
          <option value="">{t("admin.photos.allYears")}</option>
          {yearOptions.map((year) => (
            <option key={`photo-level-${year.id || year.name}`} value={year.id || year.name}>
              {year.name || year.id}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#05ADCF]"
        >
          {statusOptions.map((option) => (
            <option key={`status-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="relative md:col-span-2">
          <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.q}
            onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            placeholder={t("admin.photos.searchPlaceholder")}
            className="w-full rounded-xl border border-slate-200 py-2.5 pr-9 pl-3 text-sm outline-none focus:border-[#05ADCF]"
          />
        </div>

        <div className="md:col-span-5 flex flex-wrap items-center gap-2">
          <button onClick={refresh} className="rounded-xl bg-[#05ADCF] px-4 py-2 text-sm font-bold text-white">
            {t("admin.photos.applyFilters")}
          </button>
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
            <input
              type="checkbox"
              checked={exportOptions.includeNonApproved}
              onChange={(e) => setExportOptions((prev) => ({ ...prev, includeNonApproved: e.target.checked }))}
            />
            {t("admin.photos.includeUnapproved")}
          </label>
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
            <input
              type="checkbox"
              checked={exportOptions.includeWithoutPhoto}
              onChange={(e) => setExportOptions((prev) => ({ ...prev, includeWithoutPhoto: e.target.checked }))}
            />
            {t("admin.photos.includeWithoutPhoto")}
          </label>
          <button
            onClick={handleExport}
            disabled={exportDisabled}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-black text-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={16} />
            {t("admin.photos.exportCsv")}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-right font-black">{t("admin.photos.summaryTitle")}</th>
              <th className="px-3 py-2 text-right font-black">{t("admin.photos.count")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100">
              <td className="px-3 py-2">{t("admin.photos.totalStudents")}</td>
              <td className="px-3 py-2 font-black text-slate-800">{summary.total_students || 0}</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="px-3 py-2">{t("admin.photos.withApprovedPhoto")}</td>
              <td className="px-3 py-2 font-black text-emerald-700">{summary.with_approved || 0}</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="px-3 py-2">{t("admin.photos.withoutApprovedPhoto")}</td>
              <td className="px-3 py-2 font-black text-rose-700">{summary.without_approved || 0}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {loading && <div className="rounded-2xl bg-white p-4 text-sm text-slate-500">{t("admin.common.loading")}</div>}

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">
          <ImageIcon className="mx-auto mb-2" />
          {t("admin.photos.empty")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-black text-slate-800">{item.userName || t("admin.common.student")}</p>
                <p className="text-xs text-slate-500">
                  {item.username || "-"} | {item.studentCode || "-"}
                </p>
                <p className="text-xs text-slate-500">
                  {item.college || "-"} - {t("admin.photos.year")} {item.level || "-"}
                </p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${statusBadgeClass(item.status)}`}>
                {statusLabel(item.status)}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
              <img src={withToken(item.fileUrl)} alt="student-profile" className="h-60 w-full rounded-lg bg-white object-contain" />
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
              {item.isLatestForStudent ? <span className="rounded-full bg-slate-100 px-2 py-1">{t("admin.photos.latestStudentPhoto")}</span> : null}
              {item.isLatestApprovedForStudent ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">{t("admin.photos.latestApprovedPhoto")}</span> : null}
            </div>

            {item.status === "pending_review" ? (
              <>
                <textarea
                  value={rejectReason[item.id] || ""}
                  onChange={(e) => setRejectReason((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder={t("admin.photos.rejectReasonPlaceholder")}
                  className="mt-3 min-h-[72px] w-full rounded-xl border border-slate-200 p-2 text-sm outline-none"
                />

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onApprove(item.id)}
                    disabled={actionBusyId === item.id}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <CheckCircle2 size={15} /> {t("admin.photos.approve")}
                  </button>
                  <button
                    onClick={() => onReject(item.id)}
                    disabled={actionBusyId === item.id}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <XCircle size={15} /> {t("admin.photos.reject")}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                {t("admin.photos.reviewed")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

