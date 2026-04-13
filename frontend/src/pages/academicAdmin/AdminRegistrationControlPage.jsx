import React, { useEffect, useMemo, useState } from "react";
import { CalendarRange, Power, Plus, Trash2, Loader2, CheckCircle, AlertTriangle, ChevronDown, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { listRegistrationWindows, patchRegistrationWindowStatus, createRegistrationWindow, deleteRegistrationWindow, updateRegistrationWindow } from "../../services/advisorRegistrationApi";
import { fetchAcademicState, saveAcademicState } from "../../services/academicApi";
import { getCurrentAcademicYear } from "../../utils/academicData";

const STATUS_OPTIONS = ["OPEN", "CLOSED", "PENDING_REVIEW", "APPROVED", "LOCKED"];
const SEMESTER_LABELS = { autumn: "الخريف", spring: "الربيع", summer: "الصيفي" };
const STATUS_BADGES = {
  OPEN: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CLOSED: "bg-rose-50 text-rose-700 border-rose-200",
  PENDING_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-blue-50 text-blue-700 border-blue-200",
  LOCKED: "bg-slate-100 text-slate-700 border-slate-300",
};

const normalizeStatus = (value) => {
  const s = String(value || "").trim().toUpperCase();
  return STATUS_OPTIONS.includes(s) ? s : "CLOSED";
};
const toDateSafe = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const getEffectiveWindowMeta = (windowRow) => {
  if (!windowRow) return { status: "CLOSED", reason: "لا توجد فترة" };
  if (!Boolean(windowRow.is_active)) return { status: "CLOSED", reason: "الفترة غير مفعلة" };
  const now = new Date();
  const openAt = toDateSafe(windowRow.open_at || windowRow.starts_at);
  const closeAt = toDateSafe(windowRow.close_at || windowRow.ends_at);
  if (openAt && now < openAt) return { status: "CLOSED", reason: "لم يبدأ الوقت بعد" };
  if (closeAt && now > closeAt) return { status: "CLOSED", reason: "انتهى الوقت" };
  const adminStatus = normalizeStatus(windowRow.status);
  if (adminStatus !== "CLOSED") return { status: adminStatus, reason: "" };
  return { status: "CLOSED", reason: "مغلقة إداريًا" };
};

const toISOLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const defaultEnd = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const toDateTimeLocalValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const describeWindow = (w) => {
  if (!w) return "-";
  const year = String(w.academic_year_label || "-");
  const sem = SEMESTER_LABELS[String(w.semester || "").toLowerCase()] || String(w.semester || "-");
  const college = w.college_id ? `كلية #${w.college_id}` : "كل الكليات";
  return `${year} - ${sem} - ${college}`;
};

export default function AdminRegistrationControlPage() {
  const { t } = useTranslation("admin");
  const STATUS_LABELS = {
    OPEN: t("admin.registrationPeriods.status.open"),
    CLOSED: t("admin.registrationPeriods.status.closed"),
    PENDING_REVIEW: t("admin.registrationPeriods.status.pendingReview"),
    APPROVED: t("admin.registrationPeriods.status.approved"),
    LOCKED: t("admin.registrationPeriods.status.locked"),
  };
  const SEMESTER_LABELS = {
    autumn: t("admin.registrationPeriods.semesters.autumn"),
    spring: t("admin.registrationPeriods.semesters.spring"),
    summer: t("admin.registrationPeriods.semesters.summer"),
  };
  const [windows, setWindows] = useState([]);
  const [selectedWindowId, setSelectedWindowId] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [loading, setLoading] = useState(true);

  const [openSemesters, setOpenSemesters] = useState({ autumn: true, spring: false, summer: false });
  const [savingSemesterId, setSavingSemesterId] = useState("");

  const [nextStatus, setNextStatus] = useState("OPEN");

  const [showCreate, setShowCreate] = useState(false);
  const [editingWindowId, setEditingWindowId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    academic_year_label: getCurrentAcademicYear() || "2025-2026",
    semester: "autumn",
    status: "OPEN",
    starts_at: toISOLocal(),
    ends_at: defaultEnd(),
    allows_self_registration: true,
    allows_advisor_registration: true,
    requires_financial_clearance: true,
  });

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const selectedWindow = useMemo(
    () => windows.find((w) => String(w.id) === String(selectedWindowId)) || null,
    [windows, selectedWindowId]
  );
  const effectiveWindowMeta = useMemo(() => getEffectiveWindowMeta(selectedWindow), [selectedWindow]);

  const loadWindows = async () => {
    try {
      setLoading(true);
      const data = await listRegistrationWindows();
      const rows = Array.isArray(data) ? data : [];
      setWindows(rows);
      if (!selectedWindowId && rows.length) setSelectedWindowId(String(rows[0].id));
    } catch (error) {
      showToast(error?.message || t("admin.registrationPeriods.messages.loadError"), "error");
    } finally {
      setLoading(false);
    }
  };

  const loadOpenSemesters = async () => {
    try {
      const state = await fetchAcademicState();
      if (state?.openSemesters && typeof state.openSemesters === "object") {
        setOpenSemesters({
          autumn: Boolean(state.openSemesters.autumn),
          spring: Boolean(state.openSemesters.spring),
          summer: Boolean(state.openSemesters.summer),
        });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadWindows();
    loadOpenSemesters();
  }, []);

  useEffect(() => {
    if (!selectedWindow) return;
    setNextStatus(String(selectedWindow.status || "OPEN"));
  }, [selectedWindow]);

  const updateStatus = async (status) => {
    if (!selectedWindow) return;
    try {
      setSavingStatus(true);
      await patchRegistrationWindowStatus(selectedWindow.id, status);
      await loadWindows();
      showToast(`تم تحديث حالة الفترة إلى: ${STATUS_LABELS[status] || status}`);
    } catch (error) {
      showToast(error?.message || t("admin.registrationPeriods.messages.updateStatusError"), "error");
    } finally {
      setSavingStatus(false);
    }
  };

  const toggleSemester = async (semesterId) => {
    try {
      setSavingSemesterId(semesterId);
      const state = await fetchAcademicState();
      if (!state) throw new Error(t("admin.registrationPeriods.messages.loadSemesterSettingsError"));

      const current = {
        autumn: Boolean(state?.openSemesters?.autumn),
        spring: Boolean(state?.openSemesters?.spring),
        summer: Boolean(state?.openSemesters?.summer),
      };
      const next = { ...current, [semesterId]: !current[semesterId] };

      await saveAcademicState({
        ...state,
        openSemesters: next,
      });

      setOpenSemesters(next);
      showToast(`تم ${next[semesterId] ? "فتح" : "غلق"} ترم ${SEMESTER_LABELS[semesterId]}`);
    } catch (error) {
      showToast(error?.message || t("admin.registrationPeriods.messages.updateSemesterError"), "error");
    } finally {
      setSavingSemesterId("");
    }
  };

  const onCreateWindow = async () => {
    const { academic_year_label, semester, starts_at, ends_at } = createForm;
    if (!academic_year_label || !semester || !starts_at || !ends_at) {
      return showToast(t("admin.registrationPeriods.messages.requiredFields"), "error");
    }
    if (new Date(ends_at) <= new Date(starts_at)) {
      return showToast(t("admin.registrationPeriods.messages.invalidDates"), "error");
    }
    try {
      setCreating(true);
      const payload = {
        ...createForm,
        starts_at: new Date(createForm.starts_at).toISOString(),
        ends_at: new Date(createForm.ends_at).toISOString(),
      };
      if (editingWindowId) {
        await updateRegistrationWindow(editingWindowId, payload);
        showToast(t("admin.registrationPeriods.messages.updated"));
      } else {
        await createRegistrationWindow(payload);
        showToast(t("admin.registrationPeriods.messages.created"));
      }
      setShowCreate(false);
      setEditingWindowId(null);
      await loadWindows();
    } catch (error) {
      showToast(error?.message || (editingWindowId ? t("admin.registrationPeriods.messages.updateError") : t("admin.registrationPeriods.messages.createError")), "error");
    } finally {
      setCreating(false);
    }
  };

  const onEditWindow = () => {
    if (!selectedWindow) return;
    setEditingWindowId(selectedWindow.id);
    setCreateForm({
      academic_year_label: selectedWindow.academic_year_label || getCurrentAcademicYear() || "2025-2026",
      semester: selectedWindow.semester || "autumn",
      status: selectedWindow.status || "OPEN",
      starts_at: toDateTimeLocalValue(selectedWindow.starts_at) || toISOLocal(),
      ends_at: toDateTimeLocalValue(selectedWindow.ends_at) || defaultEnd(),
      allows_self_registration: Boolean(selectedWindow.allows_self_registration),
      allows_advisor_registration: Boolean(selectedWindow.allows_advisor_registration),
      requires_financial_clearance: Boolean(selectedWindow.requires_financial_clearance),
    });
    setShowCreate(true);
  };

  const onDeleteWindow = async () => {
    if (!selectedWindow) return;
    if (!window.confirm(t("admin.registrationPeriods.messages.confirmDelete"))) return;
    try {
      setSavingStatus(true);
      await deleteRegistrationWindow(selectedWindow.id);
      showToast(t("admin.registrationPeriods.messages.deleted"));
      setSelectedWindowId("");
      await loadWindows();
    } catch (error) {
      showToast(error?.message || t("admin.registrationPeriods.messages.deleteError"), "error");
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto text-right" dir="rtl">
      <div className="rounded-3xl bg-gradient-to-l from-[#05ADCF] to-[#0387A4] p-6 md:p-8 text-white shadow-lg mb-6">
        <h1 className="text-2xl md:text-3xl font-black">{t("admin.registrationPeriods.title")}</h1>
        <p className="text-sm text-cyan-50 mt-2">{t("admin.registrationPeriods.subtitle")}</p>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-black text-slate-800">{t("admin.registrationPeriods.registrationPeriods")}</h2>
        <button
          onClick={() => {
            const next = !showCreate;
            setShowCreate(next);
            if (next) {
              setEditingWindowId(null);
              setCreateForm({
                academic_year_label: getCurrentAcademicYear() || "2025-2026",
                semester: "autumn",
                status: "OPEN",
                starts_at: toISOLocal(),
                ends_at: defaultEnd(),
                allows_self_registration: true,
                allows_advisor_registration: true,
                requires_financial_clearance: true,
              });
            }
          }}
          className="flex items-center gap-2 rounded-xl bg-[#05ADCF] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0497b3] transition-all"
        >
          <Plus size={16} /> {t("admin.registrationPeriods.createNewPeriod")}
        </button>
      </div>

      <div className="bg-white border border-slate-100 rounded-3xl p-4 md:p-5 shadow-sm mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-black text-slate-700 ml-1">{t("admin.registrationPeriods.openNow")}:</span>
          {[
            { id: "autumn", label: "الخريف" },
            { id: "spring", label: "الربيع" },
            { id: "summer", label: "الصيفي" },
          ].map((semester) => {
            const isOpen = Boolean(openSemesters?.[semester.id]);
            const saving = savingSemesterId === semester.id;
            return (
              <button
                key={semester.id}
                type="button"
                onClick={() => toggleSemester(semester.id)}
                disabled={saving}
                className={`h-10 rounded-xl px-4 text-sm font-black border transition-all disabled:opacity-60 ${
                  isOpen
                    ? "bg-[#05ADCF] text-white border-[#05ADCF]"
                    : "bg-white text-slate-600 border-slate-200 hover:border-[#05ADCF]/50"
                }`}
              >
                {saving ? t("admin.common.loadingShort") : isOpen ? `✓ ${semester.label}` : semester.label}
              </button>
            );
          })}
        </div>
      </div>

      {showCreate && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-6 shadow-sm mb-6 space-y-4 animate-in slide-in-from-top">
          <div className="flex items-center gap-2 mb-2">
            <Plus size={20} className="text-[#05ADCF]" />
            <h3 className="text-base font-black text-slate-800">
              {editingWindowId ? t("admin.registrationPeriods.editPeriod") : t("admin.registrationPeriods.createPeriod")}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">{t("admin.common.academicYear")} *</label>
              <select
                value={createForm.academic_year_label}
                onChange={(e) => setCreateForm((p) => ({ ...p, academic_year_label: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 bg-white text-sm font-semibold"
              >
                {[
                  "2020-2021", "2021-2022", "2022-2023", "2023-2024", "2024-2025",
                  "2025-2026", "2026-2027", "2027-2028", "2028-2029",
                ].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">{t("admin.common.semester")} *</label>
              <select
                value={createForm.semester}
                onChange={(e) => setCreateForm((p) => ({ ...p, semester: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 bg-white text-sm font-semibold"
              >
                <option value="autumn">{t("admin.registrationPeriods.semesters.autumn")}</option>
                <option value="spring">{t("admin.registrationPeriods.semesters.spring")}</option>
                <option value="summer">{t("admin.registrationPeriods.semesters.summer")}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">{t("admin.registrationPeriods.initialStatus")} *</label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm((p) => ({ ...p, status: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 bg-white text-sm font-semibold"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">{t("admin.registrationPeriods.startDate")} *</label>
              <input
                type="datetime-local"
                value={createForm.starts_at}
                onChange={(e) => setCreateForm((p) => ({ ...p, starts_at: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 bg-white text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">{t("admin.registrationPeriods.endDate")} *</label>
              <input
                type="datetime-local"
                value={createForm.ends_at}
                onChange={(e) => setCreateForm((p) => ({ ...p, ends_at: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 bg-white text-sm font-semibold"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={createForm.allows_self_registration}
                onChange={(e) => setCreateForm((p) => ({ ...p, allows_self_registration: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              {t("admin.registrationPeriods.selfRegistration")}
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={createForm.allows_advisor_registration}
                onChange={(e) => setCreateForm((p) => ({ ...p, allows_advisor_registration: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              {t("admin.registrationPeriods.advisorRegistration")}
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={createForm.requires_financial_clearance}
                onChange={(e) => setCreateForm((p) => ({ ...p, requires_financial_clearance: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              {t("admin.registrationPeriods.requiresFinancialClearance")}
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onCreateWindow}
              disabled={creating}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {creating ? (editingWindowId ? t("admin.common.saving") : t("admin.registrationPeriods.creating")) : editingWindowId ? t("admin.registrationPeriods.saveEdit") : t("admin.registrationPeriods.createPeriod")}
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setEditingWindowId(null);
              }}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:border-slate-400 transition-all"
            >
              {t("admin.common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-6 shadow-sm space-y-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-[#05ADCF] flex items-center justify-center">
            <CalendarRange size={18} />
          </div>
          <div>
            <p className="text-base font-black text-slate-800">{t("admin.registrationPeriods.choosePeriod")}</p>
            <p className="text-xs text-slate-500 mt-1">{t("admin.registrationPeriods.choosePeriodHint")}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-slate-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-semibold">{t("admin.common.loading")}</span>
          </div>
        ) : windows.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-3">
              <AlertTriangle size={28} className="text-amber-500" />
            </div>
            <p className="text-base font-black text-slate-700">{t("admin.registrationPeriods.emptyTitle")}</p>
            <p className="text-sm text-slate-500 mt-1">{t("admin.registrationPeriods.emptyHint")}</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500">{t("admin.registrationPeriods.currentPeriod")}</p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedWindowId}
                    onChange={(e) => setSelectedWindowId(e.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 px-3 pl-10 bg-white text-sm font-semibold"
                  >
                    {windows.map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {describeWindow(w)} - {STATUS_LABELS[w.status] || w.status}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
                {selectedWindow && (
                  <button
                    onClick={onEditWindow}
                    disabled={savingStatus}
                    title={t("admin.registrationPeriods.editPeriod")}
                    className="h-11 w-11 flex items-center justify-center rounded-xl bg-cyan-50 text-[#05ADCF] hover:bg-cyan-100 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <Pencil size={18} />
                  </button>
                )}
                {selectedWindow && (
                  <button
                    onClick={onDeleteWindow}
                    disabled={savingStatus}
                    title={t("admin.registrationPeriods.deletePeriod")}
                    className="h-11 w-11 flex items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              {selectedWindow && (
                <p className="text-sm font-bold text-[#036d82] bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2">
                  {t("admin.registrationPeriods.currentlyManaging", { period: describeWindow(selectedWindow) })}
                </p>
              )}
            </div>

            {selectedWindow && (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-black ${STATUS_BADGES[selectedWindow.status] || STATUS_BADGES.CLOSED}`}>
                    {t("admin.registrationPeriods.adminStateOpen")}: {STATUS_LABELS[selectedWindow.status] || selectedWindow.status}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-black ${STATUS_BADGES[effectiveWindowMeta.status] || STATUS_BADGES.CLOSED}`}>
                    {t("admin.registrationPeriods.actualStateOpen")}: {STATUS_LABELS[effectiveWindowMeta.status] || effectiveWindowMeta.status}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">
                    {t("admin.registrationPeriods.fromTo", { start: new Date(selectedWindow.starts_at).toLocaleDateString("ar-EG"), end: new Date(selectedWindow.ends_at).toLocaleDateString("ar-EG") })}
                  </span>
                  {effectiveWindowMeta.reason ? (
                    <span className="text-xs text-rose-600 font-bold">{t("admin.registrationPeriods.reason")}: {effectiveWindowMeta.reason}</span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${selectedWindow.allows_self_registration ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {selectedWindow.allows_self_registration ? `✓ ${t("admin.registrationPeriods.selfRegistration")}` : `✗ ${t("admin.registrationPeriods.selfRegistrationDisabled")}`}
                  </span>
                  <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${selectedWindow.allows_advisor_registration ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {selectedWindow.allows_advisor_registration ? `✓ ${t("admin.registrationPeriods.advisorRegistration")}` : `✗ ${t("admin.registrationPeriods.advisorRegistrationDisabled")}`}
                  </span>
                  <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${selectedWindow.requires_financial_clearance ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                    {selectedWindow.requires_financial_clearance ? `⚠ ${t("admin.registrationPeriods.requiresFinancialClearance")}` : `✓ ${t("admin.registrationPeriods.withoutStudyPlan")}`}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-700 mb-3">{t("admin.registrationPeriods.changeStatus")}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value)}
                      className="h-11 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => updateStatus(nextStatus)}
                      disabled={savingStatus || nextStatus === selectedWindow.status}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#05ADCF] px-4 py-2.5 text-sm font-black text-white hover:bg-[#0497b3] disabled:opacity-60"
                    >
                      <Power size={14} />
                      {savingStatus ? t("admin.registrationPeriods.applyingStatus") : t("admin.registrationPeriods.applyStatus")}
                    </button>
                    <span className="text-xs font-semibold text-slate-500">{t("admin.registrationPeriods.applyHint")}</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl text-sm font-bold text-white shadow-xl z-50 transition-all ${
            toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
