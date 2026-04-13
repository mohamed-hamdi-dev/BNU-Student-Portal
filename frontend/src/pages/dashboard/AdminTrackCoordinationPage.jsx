import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Send, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import Swal from "sweetalert2";
import {
  assignFinalTrackForStudent,
  assignTracksByGpa,
  listTrackSelectionStudents,
  patchTrackCoordinationStatus,
} from "../../services/trackSelectionApi";
import { fetchAcademicState } from "../../services/academicApi";

const STATUS_BADGE = {
  not_eligible: "bg-slate-100 text-slate-700",
  eligible_for_specialization: "bg-cyan-100 text-cyan-800",
  preferences_submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-indigo-100 text-indigo-800",
  final_assigned: "bg-emerald-100 text-emerald-800",
};
const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "");

const trackOption = (track) => {
  if (typeof track === "string") {
    const label = String(track || "").trim();
    return { id: label, name: label };
  }
  return {
    id: String(track?.id || track?.name || "").trim(),
    name: String(track?.name || track?.id || "").trim(),
  };
};

export default function AdminTrackCoordinationPage() {
  const { t, i18n } = useTranslation("global");
  const [items, setItems] = useState([]);
  const [policies, setPolicies] = useState({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [assignChoice, setAssignChoice] = useState({});
  const [busyByStudent, setBusyByStudent] = useState({});
  const isArabic = String(i18n.language || "ar").toLowerCase().startsWith("ar");

  const STATUS_OPTIONS = useMemo(() => ([
    { value: "all", label: t("track_status_all") },
    { value: "not_eligible", label: t("track_status_not_eligible") },
    { value: "eligible_for_specialization", label: t("track_status_eligible") },
    { value: "preferences_submitted", label: t("track_status_preferences_submitted") },
    { value: "under_review", label: t("track_status_under_review") },
    { value: "final_assigned", label: t("track_status_final_assigned") },
  ]), [t]);

  const STATUS_LABEL_BY_VALUE = useMemo(() => STATUS_OPTIONS.reduce((acc, item) => {
    acc[item.value] = item.label;
    return acc;
  }, {}), [STATUS_OPTIONS]);

  const loadPolicies = async () => {
    try {
      const state = await fetchAcademicState();
      const map = state?.registrationSettings?.collegePolicies;
      setPolicies(map && typeof map === "object" ? map : {});
    } catch {
      setPolicies({});
    }
  };

  const loadItems = async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (collegeFilter !== "all") params.college = collegeFilter;
      const data = await listTrackSelectionStudents(params);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      Swal.fire({ icon: "error", title: t("track_error_load"), text: error?.message || t("track_error_unexpected") });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  useEffect(() => {
    loadItems();
  }, [statusFilter, collegeFilter]);

  const collegeOptions = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const college = String(item?.college || "").trim();
      if (college) map.set(college, college);
    });
    return Array.from(map.values());
  }, [items]);

  const policyTracksByCollege = useMemo(() => {
    const result = {};
    Object.entries(policies || {}).forEach(([rawCollege, policy]) => {
      const key = normalizeKey(rawCollege);
      const tracks = Array.isArray(policy?.tracks) ? policy.tracks.map(trackOption).filter((t) => t.id || t.name) : [];
      if (!result[key]) result[key] = [];
      result[key] = [...result[key], ...tracks];
    });

    Object.keys(result).forEach((k) => {
      const seen = new Set();
      result[k] = result[k].filter((item) => {
        const id = normalizeKey(item.id || item.name);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    });

    return result;
  }, [policies]);

  const getTrackOptionsForItem = (item) => {
    const collegeKey = normalizeKey(item?.college);
    const fromPolicy = Array.isArray(policyTracksByCollege[collegeKey]) ? policyTracksByCollege[collegeKey] : [];
    const fromPreferences = Array.isArray(item?.preferences)
      ? item.preferences
          .map((pref) => ({ id: String(pref?.trackId || "").trim(), name: String(pref?.trackName || pref?.trackId || "").trim() }))
          .filter((p) => p.id || p.name)
      : [];
    const merged = [...fromPolicy, ...fromPreferences];
    const seen = new Set();
    return merged.filter((entry) => {
      const id = normalizeKey(entry.id || entry.name);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  const updateStudentStatus = async (studentId, nextStatus) => {
    setBusyByStudent((prev) => ({ ...prev, [studentId]: true }));
    try {
      await patchTrackCoordinationStatus(studentId, nextStatus);
      await loadItems();
      Swal.fire({ icon: "success", title: t("track_success_status_updated"), timer: 1200, showConfirmButton: false });
    } catch (error) {
      Swal.fire({ icon: "error", title: t("track_error_update_status"), text: error?.message || t("track_error_unexpected") });
    } finally {
      setBusyByStudent((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const assignFinalTrack = async (item) => {
    const studentId = item?.studentId;
    const chosen = String(assignChoice[studentId] || "").trim();
    if (!chosen) {
      Swal.fire({ icon: "warning", title: t("track_choose_specialization_first") });
      return;
    }

    setBusyByStudent((prev) => ({ ...prev, [studentId]: true }));
    try {
      await assignFinalTrackForStudent(studentId, chosen);
      await loadItems();
      Swal.fire({ icon: "success", title: t("track_success_final_assigned"), timer: 1200, showConfirmButton: false });
    } catch (error) {
      Swal.fire({ icon: "error", title: t("track_error_assign"), text: error?.message || t("track_error_unexpected") });
    } finally {
      setBusyByStudent((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const runBulkGpaAssignment = async () => {
    const confirm = await Swal.fire({
      icon: "question",
      title: t("track_bulk_assign_title"),
      text: t("track_bulk_assign_text"),
      showCancelButton: true,
      confirmButtonText: t("track_run"),
      cancelButtonText: t("track_cancel"),
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    try {
      const result = await assignTracksByGpa({
        college: collegeFilter === "all" ? null : collegeFilter,
      });
      await loadItems();
      Swal.fire({
        icon: "success",
        title: t("track_bulk_assign_success_title"),
        text: t("track_bulk_assign_success_text", { assigned: result?.assigned || 0, fallback: result?.fallbackAssigned || 0 }),
      });
    } catch (error) {
      Swal.fire({ icon: "error", title: t("track_bulk_assign_error"), text: error?.message || t("track_error_unexpected") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5" dir={isArabic ? "rtl" : "ltr"}>
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-800">{t("track_title")}</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">{t("track_subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runBulkGpaAssignment}
              className="inline-flex items-center gap-2 rounded-xl bg-[#05ADCF] px-4 py-2 text-sm font-black text-white hover:opacity-90"
            >
              <CheckCircle2 size={15} /> {t("track_run_by_gpa")}
            </button>
            <button
              onClick={loadItems}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={15} /> {t("track_refresh")}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-[#05ADCF]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={`status-${opt.value}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={collegeFilter}
            onChange={(e) => setCollegeFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-[#05ADCF]"
          >
            <option value="all">{t("track_all_colleges")}</option>
            {collegeOptions.map((college) => (
              <option key={`college-${college}`} value={college}>
                {college}
              </option>
            ))}
          </select>

          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-700 inline-flex items-center gap-2">
            <Users size={15} /> {t("track_student_count", { count: items.length })}
          </div>
        </div>
      </div>

      {loading && <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">{t("track_loading")}</div>}

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">{t("track_empty")}</div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {items.map((item) => {
          const studentId = item.studentId;
          const busy = Boolean(busyByStudent[studentId]);
          const statusCode = String(item?.coordinationStatus || "not_eligible");
          const statusTone = STATUS_BADGE[statusCode] || "bg-slate-100 text-slate-700";
          const statusLabel = STATUS_LABEL_BY_VALUE[statusCode] || statusCode;
          const trackOptions = getTrackOptionsForItem(item);
          const isNotEligible = statusCode === "not_eligible";
          const isFinalAssigned = statusCode === "final_assigned";
          const canOperate = !isNotEligible && !isFinalAssigned;

          return (
            <div key={`coord-${studentId}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-black text-slate-800">{item.studentName || t("track_student_fallback")}</p>
                  <p className="text-xs font-bold text-slate-500">
                    {t("track_student_meta", { username: item.username || item.studentCode || "-", college: item.college || "-", year: item.level || "-" })}
                  </p>
                  <p className="text-xs font-black text-cyan-700 mt-1">GPA: {Number(item?.gpa || 0).toFixed(2)}</p>
                </div>
                <span className={`rounded-lg px-2 py-1 text-xs font-black ${statusTone}`}>{statusLabel}</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-black text-slate-700 mb-2">{t("track_preferences")}</p>
                {!Array.isArray(item.preferences) || item.preferences.length === 0 ? (
                  <p className="text-xs font-bold text-slate-500">{t("track_no_preferences")}</p>
                ) : (
                  <div className="space-y-2">
                    {item.preferences
                      .slice()
                      .sort((a, b) => Number(a?.preferenceOrder || 0) - Number(b?.preferenceOrder || 0))
                      .map((pref) => (
                        <div key={`pref-${studentId}-${pref.preferenceOrder}-${pref.trackId}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                          {t("track_preference_item", { order: pref.preferenceOrder, name: pref.trackName || pref.trackId })}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-black text-emerald-800">{t("track_final_specialization")}</p>
                <p className="mt-1 text-sm font-bold text-emerald-700">
                  {isNotEligible ? t("track_not_available_before_branching") : (item.finalAssignedTrackName || item.finalAssignedTrackId || t("track_not_assigned_yet"))}
                </p>
              </div>

              {isNotEligible && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                  {t("track_not_eligible_hint")}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <button
                  onClick={() => updateStudentStatus(studentId, "under_review")}
                  disabled={busy || !canOperate}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-black text-indigo-700 disabled:opacity-50"
                >
                  {t("track_status_under_review")}
                </button>

                <select
                  value={assignChoice[studentId] || ""}
                  onChange={(e) => setAssignChoice((prev) => ({ ...prev, [studentId]: e.target.value }))}
                  disabled={busy || !canOperate || trackOptions.length === 0}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#05ADCF] disabled:bg-slate-100"
                >
                  <option value="">{t("track_choose_specialization")}</option>
                  {trackOptions.map((track) => (
                    <option key={`assign-${studentId}-${track.id || track.name}`} value={track.id || track.name}>
                      {track.name || track.id}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => assignFinalTrack(item)}
                  disabled={busy || !canOperate || !assignChoice[studentId]}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#05ADCF] px-3 py-2 text-sm font-black text-white disabled:opacity-50"
                >
                  <CheckCircle2 size={15} /> {t("track_final_approve")}
                </button>
              </div>

              <button
                onClick={() => updateStudentStatus(studentId, "preferences_submitted")}
                disabled={busy || !canOperate}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 disabled:opacity-50"
              >
                <Send size={14} /> {t("track_reset_to_preferences")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
