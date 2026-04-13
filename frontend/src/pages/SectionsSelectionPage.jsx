import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { normalizeAcademicYearValue } from "../utils/academicData";
import { getMyTrackSelectionStatus, submitMyTrackPreferences } from "../services/trackSelectionApi";

const getStudent = () => {
  try {
    const data = JSON.parse(localStorage.getItem("loggedUser") || "{}");
    return {
      name: data?.name || data?.NameID || "طالب",
      collegeId: data?.collegeId || data?.college_id || "",
      college: data?.college || data?.faculty || data?.major || "",
      year: normalizeAcademicYearValue(data?.level || data?.year || data?.academicYear, "1"),
    };
  } catch {
    return {
      name: "طالب",
      collegeId: "",
      college: "",
      year: "1",
    };
  }
};

const normalizeTrack = (track) => {
  if (typeof track === "string") {
    const label = track.trim();
    return { id: label, name: label };
  }
  return {
    id: String(track?.id || track?.name || "").trim(),
    name: String(track?.name || track?.id || "").trim(),
  };
};

const STATUS_UI = {
  not_eligible: { labelKey: "sections_status_not_eligible", tone: "bg-slate-100 text-slate-700" },
  eligible_for_specialization: { labelKey: "sections_status_eligible", tone: "bg-cyan-100 text-cyan-800" },
  preferences_submitted: { labelKey: "sections_status_preferences_submitted", tone: "bg-amber-100 text-amber-800" },
  under_review: { labelKey: "sections_status_under_review", tone: "bg-indigo-100 text-indigo-800" },
  final_assigned: { labelKey: "sections_status_final_assigned", tone: "bg-emerald-100 text-emerald-800" },
};

export default function SectionsSelectionPage() {
  const { t } = useTranslation("global");
  const student = useMemo(() => getStudent(), []);
  const [status, setStatus] = useState(null);
  const [preferences, setPreferences] = useState(["", "", ""]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tracks = useMemo(
    () => (Array.isArray(status?.tracks) ? status.tracks.map(normalizeTrack).filter((track) => track.id || track.name) : []),
    [status]
  );

  const syncLoggedUserFinalTrack = (nextTrackId, nextTrackName) => {
    try {
      const raw = JSON.parse(localStorage.getItem("loggedUser") || "{}");
      const next = {
        ...raw,
        trackId: nextTrackId || "",
        track: nextTrackId || "",
        specialization: nextTrackName || nextTrackId || "",
        trackLocked: Boolean(nextTrackId),
      };
      localStorage.setItem("loggedUser", JSON.stringify(next));
    } catch {
      // ignore local storage sync errors
    }
  };

  const loadStatus = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getMyTrackSelectionStatus();
      setStatus(data);

      const prefList = Array.isArray(data?.preferences) ? [...data.preferences] : [];
      prefList.sort((a, b) => Number(a?.preferenceOrder || 0) - Number(b?.preferenceOrder || 0));
      const next = ["", "", ""];
      prefList.slice(0, 3).forEach((item, idx) => {
        next[idx] = String(item?.trackId || "").trim();
      });
      setPreferences(next);

      if (data?.coordinationStatus === "final_assigned" && data?.finalAssignedTrackId) {
        syncLoggedUserFinalTrack(data.finalAssignedTrackId, data?.finalAssignedTrackName || data.finalAssignedTrackId);
      }
    } catch (err) {
      setError(err?.message || t("sections_error_load_status"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const policyFound = Boolean(status?.policyFound);
  const isBranchingOpen = Boolean(status?.isBranchingOpen);
  const windowConfigured = Boolean(status?.windowConfigured);
  const windowOpen = Boolean(status?.windowOpen);
  const coordinationStatus = String(status?.coordinationStatus || "not_eligible");
  const hasFinalAssignment = coordinationStatus === "final_assigned" && Boolean(status?.finalAssignedTrackId);
  const canSubmitPreferences =
    policyFound &&
    isBranchingOpen &&
    (!windowConfigured || windowOpen) &&
    !hasFinalAssignment;

  const activePreferences = preferences.map((item) => String(item || "").trim()).filter(Boolean);

  const updatePreference = (index, value) => {
    setPreferences((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const savePreferences = async () => {
    const compact = preferences.map((item) => String(item || "").trim()).filter(Boolean);
    if (compact.length === 0) {
      setError(t("sections_error_select_one_preference"));
      return;
    }
    if (new Set(compact).size !== compact.length) {
      setError(t("sections_error_duplicate_preference"));
      return;
    }

    setSaving(true);
    setError("");
    try {
      await submitMyTrackPreferences(compact);
      await loadStatus();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err?.message || t("sections_error_save_preferences"));
    } finally {
      setSaving(false);
    }
  };

  const statusInfo = STATUS_UI[coordinationStatus] || STATUS_UI.not_eligible;
  const statusLabel = t(statusInfo.labelKey);

  return (
    <div className="min-h-screen bg-[#F8FAFC] mt-[6em] p-6 font-[Tajawal]" dir="rtl">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black text-slate-800">{t("sections_internal_coordination_title")}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("sections_student_college_year_line", {
              name: student.name,
              college: student.college || student.collegeId || t("sections_not_set"),
              year: status?.currentStudyYear || student.year,
            })}
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black border border-transparent bg-slate-50">
            <span className={`rounded-lg px-2 py-1 ${statusInfo.tone}`}>{statusLabel}</span>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">
            {t("sections_loading_status")}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>
        )}

        {!loading && !error && !policyFound && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
            {t("sections_no_policy_message")}
          </div>
        )}

        {!loading && !error && policyFound && !isBranchingOpen && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
            {t("sections_not_eligible_branching_message", { year: status?.branchingYear })}
          </div>
        )}

        {!loading && !error && policyFound && isBranchingOpen && windowConfigured && !windowOpen && !hasFinalAssignment && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
            {t("sections_window_closed_message")}
          </div>
        )}

        {!loading && !error && policyFound && isBranchingOpen && hasFinalAssignment && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-emerald-700">
              <CheckCircle2 size={16} />
              {t("sections_status_final_assigned")}
            </div>
            <p className="mt-2 text-lg font-black text-emerald-800">
              {status?.finalAssignedTrackName || status?.finalAssignedTrackId}
            </p>
          </div>
        )}

        {!loading && !error && policyFound && isBranchingOpen && !hasFinalAssignment && (
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
              <AlertCircle size={16} className="text-cyan-600" />
              {t("sections_preferences_hint")}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {[0, 1, 2].map((index) => {
                const label = index === 0 ? "الرغبة الأولى" : index === 1 ? "الرغبة الثانية" : "الرغبة الثالثة";
                return (
                  <div key={`pref-${index}`} className="space-y-1">
                    <label className="text-sm font-black text-slate-700">{label}</label>
                    <select
                      value={preferences[index]}
                      onChange={(e) => updatePreference(index, e.target.value)}
                      disabled={!canSubmitPreferences}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">اختر التخصص</option>
                      {tracks.map((track) => {
                        const key = String(track.id || track.name || "");
                        const selectedElsewhere =
                          preferences.some((val, idx) => idx !== index && String(val || "").trim() === key) &&
                          String(preferences[index] || "").trim() !== key;
                        return (
                          <option key={`track-${index}-${key}`} value={key} disabled={selectedElsewhere}>
                            {track.name || track.id}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })}
            </div>

            <button
              onClick={savePreferences}
              disabled={!canSubmitPreferences || activePreferences.length === 0 || saving}
              className="w-full rounded-2xl bg-[#05ADCF] py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {saving ? "جاري حفظ الرغبات..." : "حفظ رغبات التنسيق"}
            </button>

            {saved && (
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
                <CheckCircle2 size={16} />
                تم حفظ الرغبات بنجاح
              </div>
            )}

            {Array.isArray(status?.preferences) && status.preferences.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-slate-700">
                  <Clock3 size={15} />
                  الرغبات الحالية
                </div>
                <div className="mt-3 space-y-2">
                  {status.preferences
                    .slice()
                    .sort((a, b) => Number(a?.preferenceOrder || 0) - Number(b?.preferenceOrder || 0))
                    .map((item) => (
                      <div key={`saved-pref-${item.preferenceOrder}-${item.trackId}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                        الرغبة {item.preferenceOrder}: {item.trackName || item.trackId}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}




