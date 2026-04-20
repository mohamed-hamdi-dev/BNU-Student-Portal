import React, { useEffect, useMemo, useState } from "react";
import {
  createAdvisorRequest,
  getActiveRegistrationTerm,
  getCurrentRegistrationPeriodStatus,
  listMyAdvisorRequests,
  listMyAvailableOfferings,
} from "../../services/advisorRegistrationApi";
import { getCurrentAcademicYear } from "../../utils/academicData";
import Swal from "sweetalert2";

const showAlert = (message, type = "info") =>
  Swal.fire({
    icon: type,
    text: String(message || ""),
    confirmButtonText: "OK",
    didOpen: (el) => {
      el.style.direction = "rtl";
      el.style.textAlign = "right";
    },
  });

const semesters = [
  { id: "autumn", label: "الخريف" },
  { id: "spring", label: "الربيع" },
  { id: "summer", label: "الصيف" },
];

const REQUEST_STATUS_LABELS = {
  draft: "مسودة",
  submitted: "مقدّم",
  advisor_requested: "بانتظار المرشد",
  need_info: "يحتاج استكمال",
  rejected: "مرفوض",
  advisor_approved: "معتمد من المرشد",
  registered: "تم التسجيل",
  locked: "مقفل",
  approved: "معتمد",
};

const REQUEST_STATUS_TONES = {
  need_info: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  advisor_approved: "bg-cyan-50 text-cyan-700 border-cyan-200",
  registered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  locked: "bg-slate-100 text-slate-700 border-slate-200",
  advisor_requested: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const statusLabel = (status) => REQUEST_STATUS_LABELS[String(status || "").trim().toLowerCase()] || String(status || "-");
const statusTone = (status) => REQUEST_STATUS_TONES[String(status || "").trim().toLowerCase()] || "bg-slate-50 text-slate-700 border-slate-200";
const toDateSafe = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const normalizeWindowStatus = (value) => {
  const s = String(value || "").trim().toUpperCase();
  return ["OPEN", "PENDING_REVIEW", "APPROVED", "LOCKED", "CLOSED"].includes(s) ? s : "CLOSED";
};
const getEffectiveWindowStatus = (windowRow) => {
  if (!windowRow || !Boolean(windowRow.is_active)) return "CLOSED";
  const now = new Date();
  const openAt = toDateSafe(windowRow.open_at || windowRow.starts_at);
  const closeAt = toDateSafe(windowRow.close_at || windowRow.ends_at);
  if (openAt && now < openAt) return "CLOSED";
  if (closeAt && now > closeAt) return "CLOSED";
  return normalizeWindowStatus(windowRow.status);
};

export default function StudentAdvisorRequestPage() {
  const [academicYear, setAcademicYear] = useState(() => getCurrentAcademicYear() || "2025-2026");
  const [semester, setSemester] = useState("autumn");
  const [offerings, setOfferings] = useState([]);
  const [selectedOfferings, setSelectedOfferings] = useState([]);
  const [reason, setReason] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initializedWindow, setInitializedWindow] = useState(false);

  const selectedHours = useMemo(
    () =>
      offerings
        .filter((item) => selectedOfferings.includes(item.offering_id))
        .reduce((acc, item) => acc + Number(item.credit_hours || 0), 0),
    [offerings, selectedOfferings]
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [available, mine] = await Promise.all([
        listMyAvailableOfferings(academicYear, semester),
        listMyAdvisorRequests({ academic_year_label: academicYear, semester }),
      ]);
      setOfferings(Array.isArray(available?.items) ? available.items : []);
      setRequests(Array.isArray(mine?.items) ? mine.items : []);
    } catch (error) {
      showAlert(error?.message || "تعذّر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadPreferredWindow = async () => {
      try {
        const currentYear = getCurrentAcademicYear() || "2025-2026";
        const preferred = await getActiveRegistrationTerm({ academic_year_label: currentYear });
        if (!active) return;
        if (preferred) {
          setAcademicYear(String(preferred.academic_year_label || currentYear));
          setSemester(String(preferred.semester || "autumn").trim().toLowerCase());
        }
      } catch {
        // Keep defaults if windows fail to load.
      } finally {
        if (active) setInitializedWindow(true);
      }
    };
    loadPreferredWindow();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!initializedWindow) return;
    loadData();
  }, [academicYear, semester, initializedWindow]);
  useEffect(() => {
    if (!initializedWindow) return;
    const timer = setInterval(() => {
      loadData();
    }, 20000);
    return () => clearInterval(timer);
  }, [academicYear, semester, initializedWindow]);

  const toggleOffering = (offeringId) => {
    setSelectedOfferings((prev) =>
      prev.includes(offeringId) ? prev.filter((id) => id !== offeringId) : [...prev, offeringId]
    );
  };

  const submitRequest = async () => {
    if (!selectedOfferings.length) {
      showAlert("اختر مادة واحدة على الأقل");
      return;
    }
    if (String(reason || "").trim().length < 3) {
      showAlert("اكتب سبب الطلب");
      return;
    }
    try {
      setSaving(true);
      await createAdvisorRequest({
        academic_year_label: academicYear,
        semester,
        offering_ids: selectedOfferings,
        requested_note: reason.trim(),
      });
      setReason("");
      setSelectedOfferings([]);
      await loadData();
      showAlert("تم حفظ التسجيل وإرساله للمرشد بنجاح", "success");
    } catch (error) {
      const rawMessage = String(error?.message || "");
      if (rawMessage.toLowerCase().includes("no academic advisor is assigned")) {
        showAlert("لا يوجد مرشد أكاديمي معيّن لك حاليًا. يرجى التواصل مع شؤون الطلاب/الإدارة لتعيين مرشد أولًا.", "error");
      } else {
        showAlert(rawMessage || "تعذّر إرسال الطلب", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6" dir="rtl">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-800">طلب تسجيل عبر المرشد الأكاديمي</h1>
        <p className="text-sm text-slate-500 mt-2">
          استخدم الصفحة دي عندما يكون التسجيل الذاتي مغلق، ويتم إرسال طلبك للمرشد للمراجعة (اعتماد/رفض/استكمال).
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="h-11 rounded-xl border border-slate-200 px-3"
            placeholder="العام الأكاديمي"
          />
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="h-11 rounded-xl border border-slate-200 px-3 bg-white"
          >
            {semesters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="h-11 rounded-xl bg-cyan-50 border border-cyan-200 px-3 flex items-center text-sm font-bold text-cyan-800">
            الساعات المختارة: {selectedHours}
          </div>
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="سبب الطلب"
          className="w-full min-h-24 rounded-xl border border-slate-200 px-3 py-2"
        />

        <div className="rounded-2xl border border-slate-200 max-h-72 overflow-auto">
          {loading ? (
            <p className="p-4 text-slate-500">جارٍ التحميل...</p>
          ) : offerings.length === 0 ? (
            <p className="p-4 text-slate-500">لا توجد مواد متاحة</p>
          ) : (
            offerings.map((item) => (
              <label
                key={item.offering_id}
                className="flex items-center justify-between border-b border-slate-100 px-4 py-3 cursor-pointer"
              >
                <div>
                  <p className="font-bold text-slate-800">
                    {item.course_code} - {item.course_title_ar}
                  </p>
                  <p className="text-xs text-slate-500">السكشن {item.section}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-600">{item.credit_hours} ساعة</span>
                  <input
                    type="checkbox"
                    checked={selectedOfferings.includes(item.offering_id)}
                    onChange={() => toggleOffering(item.offering_id)}
                  />
                </div>
              </label>
            ))
          )}
        </div>

        <button
          disabled={saving}
          onClick={submitRequest}
          className="rounded-xl bg-[#05ADCF] text-white px-4 py-2 font-bold disabled:opacity-60"
        >
          {saving ? "جارٍ حفظ التسجيل..." : "حفظ التسجيل وإرساله للمرشد"}
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-black text-slate-800 mb-3">طلباتي</h2>
        <div className="space-y-3">
          {requests.length === 0 && <p className="text-sm text-slate-500">لا توجد طلبات حتى الآن.</p>}
          {requests.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-slate-800">طلب #{item.id}</p>
              <p className="text-xs text-slate-500">
                {item.academic_year_label} - {item.semester}
              </p>
              <div className="mt-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-black ${statusTone(item.status)}`}>
                  الحالة: {statusLabel(item.status)}
                </span>
              </div>
              {item.requested_note && <p className="text-xs text-slate-600 mt-2">السبب: {item.requested_note}</p>}
              {item.advisor_note && (
                <div className="mt-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800 font-bold">
                  ملاحظة المرشد: {item.advisor_note}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

