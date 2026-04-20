import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import {
  Search, User, BookOpen, Clock, CheckCircle, XCircle, AlertTriangle,
  Lock, Unlock, ShieldCheck, FileText, GraduationCap, Building2,
  CalendarDays, Loader2, ChevronDown, BookMarked, Save, RefreshCw
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  advisorDecisionOnRequest,
  advisorManageRegistrationForStudent,
  advisorRegisterRequest,
  getActiveRegistrationTerm,
  getCurrentRegistrationPeriodStatus,
  getStudentProfileByAdvisor,
  getStudentRegistrationByAdvisor,
  listAdvisorRequests,
  listAdvisorStudents,
  listOfferingsForStudent,
  listRegistrationWindows,
  listStudentRegistrationTermsByAdvisor,
  searchAdvisorStudents,
  updateStudentAcademicMetrics,
} from "../../services/advisorRegistrationApi";
import { fetchAcademicState } from "../../services/academicApi";
import { listAcademicCoreColleges } from "../../services/registrationPolicyApi";
import { calculateSemesterGpa, getCurrentAcademicYear } from "../../utils/academicData";
import "../../css/AdvisorRegistrationPage.css";

/* ========================================================================= */
/* CONSTANTS                                                                  */
/* ========================================================================= */
const PERIOD_LABELS = { OPEN: "مفتوح", CLOSED: "مغلق", PENDING_REVIEW: "قيد المراجعة", APPROVED: "معتمد", LOCKED: "مقفل" };
const PERIOD_ICONS = { OPEN: Unlock, CLOSED: Lock, PENDING_REVIEW: Clock, APPROVED: ShieldCheck, LOCKED: Lock };
const REQUEST_LABELS = {
  all: "الكل", advisor_requested: "بانتظار المرشد", advisor_approved: "تم الاعتماد",
  need_info: "يحتاج استكمال", rejected: "مرفوض", registered: "تم التسجيل", draft: "مسودة", submitted: "مقدّم",
};
const defaultSemesters = [
  { id: "autumn", label: "الخريف" },
  { id: "spring", label: "الربيع" },
  { id: "summer", label: "الصيف" },
];
const AR_SEMESTER_LABELS = { autumn: "الخريف", spring: "الربيع", summer: "الصيف" };

/* ========================================================================= */
/* HELPERS                                                                    */
/* ========================================================================= */
const toArError = (msg) => {
  const t = String(msg || "").trim();
  if (!t) return "حدث خطأ غير متوقع.";
  if (t.includes("مغلق") || t.includes("CLOSED")) return "فترة التسجيل مغلقة — لا يمكن الإضافة أو التعديل.";
  if (t.includes("معتمد") || t.includes("APPROVED")) return "الفترة معتمدة نهائيًا — العرض فقط.";
  if (t.includes("مقفل") || t.includes("LOCKED")) return "الفترة مقفلة — العرض فقط.";
  if (t.includes("المراجعة") || t.includes("PENDING")) return "الفترة قيد المراجعة — لا يمكن تعديل المواد.";
  if (t.includes("approved/locked") || t.includes("معتمد أو مقفل")) return "تسجيل الطالب معتمد أو مقفل بالفعل ولا يمكن تعديله.";
  if (t.includes("No registration period") || t.includes("لا توجد فترة")) return "لا توجد فترة تسجيل لهذا العام / الترم. تأكد من إنشاء فترة من الإعدادات.";
  if (t.includes("cannot manage") || t.includes("You cannot")) return "ليس لديك صلاحية إدارة هذا الطالب.";
  if (t.includes("exceed") || t.includes("below minimum")) return t;
  return t;
};

const isPlaceholderStudentCode = (value) => {
  const code = String(value || "").trim().toUpperCase();
  if (!code) return true;
  return /^BNU-00-00-\d+$/.test(code);
};

const resolveStudentIdentityLabel = (row) => {
  const studentCode = String(row?.student_code || "").trim();
  const username = String(row?.student_username || "").trim();
  if (studentCode && !isPlaceholderStudentCode(studentCode)) return `كود ${studentCode}`;
  if (username) return `يوزر ${username}`;
  return `ID ${row?.student_user_id}`;
};

const collectStudentIdentifierKeys = (student) => {
  const values = [
    student?.student_user_id,
    student?.id,
    student?.username,
    student?.student_username,
    student?.student_code,
    student?.email,
  ];
  return new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
};

const resolveFallbackAcademicMetrics = (student, academicRecords) => {
  const studentKeys = collectStudentIdentifierKeys(student);
  if (!studentKeys.size) return { gpa: 0, passed_hours: 0 };

  const matchedRecords = (Array.isArray(academicRecords) ? academicRecords : []).filter((record) => {
    const recordKeys = [
      record?.studentId,
      record?.student_id,
      record?.studentCode,
      record?.student_code,
      record?.username,
      record?.userId,
      record?.user_id,
      record?.email,
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return recordKeys.some((key) => studentKeys.has(key));
  });

  const passedHours = matchedRecords.reduce((sum, record) => {
    const grade = String(record?.grade || "").trim().toUpperCase();
    if (!grade || grade === "F") return sum;
    const credits = Number(record?.credits ?? record?.hours ?? 0);
    return sum + (Number.isFinite(credits) && credits > 0 ? credits : 0);
  }, 0);

  return {
    gpa: Number(calculateSemesterGpa(matchedRecords) || 0),
    passed_hours: Number(passedHours || 0),
  };
};

const isLockedReq = (req) => {
  if (!req) return false;
  const s = String(req?.status || "").toLowerCase();
  return ["advisor_approved", "registered", "locked", "approved"].includes(s) || Boolean(req?.locked_at);
};

const reqStatusLabel = (status) => REQUEST_LABELS[String(status || "").trim()] || String(status || "-");
const reqHeaderLabel = (status) => {
  const s = String(status || "").trim().toLowerCase();
  if (["advisor_requested", "submitted", "need_info", "rejected", "draft"].includes(s)) return "طلب قائم";
  return "مسجل";
};

const offeringStatusMeta = (offering, isSelected) => {
  const status = String(offering?.eligibility_status || "").trim().toLowerCase();
  if (isSelected || status === "selected") return { label: "مسجلة حاليًا", color: "#047857", bg: "rgba(16,185,129,0.12)" };
  if (status === "open") return { label: "متاحة للتسجيل", color: "#0369a1", bg: "rgba(14,165,233,0.12)" };
  if (status === "locked_prerequisite") return { label: "متطلب سابق", color: "#b45309", bg: "rgba(245,158,11,0.14)" };
  if (status === "locked_future_year") return { label: "سنة أعلى", color: "#7c3aed", bg: "rgba(124,58,237,0.12)" };
  if (status === "locked_passed") return { label: "تم اجتيازها", color: "#475569", bg: "rgba(148,163,184,0.14)" };
  if (status === "locked_full") return { label: "الشعبة مغلقة", color: "#b91c1c", bg: "rgba(239,68,68,0.12)" };
  if (status === "locked_track" || status === "locked_track_before_branching") return { label: "غير متاحة للمسار", color: "#6d28d9", bg: "rgba(139,92,246,0.12)" };
  return { label: "غير متاحة", color: "#9a3412", bg: "rgba(249,115,22,0.12)" };
};

const normalizePeriodStatus = (value) => {
  const s = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(PERIOD_LABELS, s) ? s : "CLOSED";
};
const toDateSafe = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const getEffectiveWindowStatus = (windowRow) => {
  if (!windowRow) return "CLOSED";
  if (!Boolean(windowRow.is_active)) return "CLOSED";
  const now = new Date();
  const openAt = toDateSafe(windowRow.open_at || windowRow.starts_at);
  const closeAt = toDateSafe(windowRow.close_at || windowRow.ends_at);
  if (openAt && now < openAt) return "CLOSED";
  if (closeAt && now > closeAt) return "CLOSED";
  return normalizePeriodStatus(windowRow.status);
};
const termSortWeight = (windowRow) => {
  const label = String(windowRow?.academic_year_label || "").trim();
  const semester = String(windowRow?.semester || "").trim().toLowerCase();
  const yearStart = Number.parseInt(label.split("-")[0], 10);
  const yearWeight = Number.isFinite(yearStart) ? yearStart : 0;
  const semesterWeight = { autumn: 3, spring: 2, summer: 1 }.get(semester, 0);
  return [yearWeight, semesterWeight];
};
const pickPreferredWindow = (windows) => {
  const rows = Array.isArray(windows) ? windows.filter(Boolean) : [];
  if (!rows.length) return null;
  const statusWeight = { OPEN: 5, PENDING_REVIEW: 4, APPROVED: 3, LOCKED: 2, CLOSED: 1 };
  const sorted = [...rows].sort((a, b) => {
    const statusDiff =
      (statusWeight[getEffectiveWindowStatus(b)] || 0) - (statusWeight[getEffectiveWindowStatus(a)] || 0);
    if (statusDiff !== 0) return statusDiff;

    const [yearB, semB] = termSortWeight(b);
    const [yearA, semA] = termSortWeight(a);
    if (yearB !== yearA) return yearB - yearA;
    if (semB !== semA) return semB - semA;

    const updatedB = new Date(b?.updated_at || b?.starts_at || 0).getTime();
    const updatedA = new Date(a?.updated_at || a?.starts_at || 0).getTime();
    return updatedB - updatedA;
  });
  return sorted[0] || null;
};
const getPeriodReason = (periodObj) => {
  const win = periodObj?.window || null;
  if (!win) return "";
  const now = new Date();
  const openAt = toDateSafe(win.open_at || win.starts_at);
  const closeAt = toDateSafe(win.close_at || win.ends_at);
  if (openAt && now < openAt) return "خارج الوقت: لم يبدأ وقت الفترة بعد.";
  if (closeAt && now > closeAt) return "خارج الوقت: انتهى وقت الفترة.";
  return "";
};

const withTimeout = async (promise, timeoutMs = 12000, message = "Request timed out") => {
  let timerId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
};

/* ========================================================================= */
/* TOAST HOOK                                                                 */
/* ========================================================================= */
function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const show = useCallback((msg, type = "success") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type });
    timerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);
  const ToastEl = useMemo(() => {
    if (!toast) return null;
    return (
      <div className={`ar-toast ${toast.type} visible`}>
        {toast.type === "error" ? <XCircle size={18} /> : <CheckCircle size={18} />}
        <span style={{ marginRight: 8 }}>{toast.msg}</span>
      </div>
    );
  }, [toast]);
  return { show, ToastEl };
}

/* ========================================================================= */
/* MAIN COMPONENT                                                             */
/* ========================================================================= */
export default function AdvisorRegistrationRequestsPage() {
  const { t } = useTranslation("admin");
  const PERIOD_LABELS = {
    OPEN: t("admin.advisorRegistration.status.open"),
    CLOSED: t("admin.advisorRegistration.status.closed"),
    PENDING_REVIEW: t("admin.advisorRegistration.status.pendingReview"),
    APPROVED: t("admin.advisorRegistration.status.approved"),
    LOCKED: t("admin.advisorRegistration.status.locked"),
  };
  const PERIOD_MESSAGES = {
    OPEN: t("admin.advisorRegistration.periodMessages.open"),
    CLOSED: t("admin.advisorRegistration.periodMessages.closed"),
    PENDING_REVIEW: t("admin.advisorRegistration.periodMessages.pendingReview"),
    APPROVED: t("admin.advisorRegistration.periodMessages.approved"),
    LOCKED: t("admin.advisorRegistration.periodMessages.locked"),
  };
  const REQUEST_LABELS = {
    all: t("admin.advisorRegistration.requestFilter.all"),
    advisor_requested: t("admin.advisorRegistration.requestFilter.advisorRequested"),
    advisor_approved: t("admin.advisorRegistration.requestFilter.approved"),
    need_info: t("admin.advisorRegistration.requestFilter.needInfo"),
    rejected: t("admin.advisorRegistration.requestFilter.rejected"),
    registered: t("admin.advisorRegistration.requestFilter.registered"),
    draft: t("admin.advisorRegistration.requestFilter.draft"),
    submitted: t("admin.advisorRegistration.requestFilter.submitted"),
  };
  const AR_SEMESTER_LABELS = {
    autumn: t("admin.advisorRegistration.semesters.autumn"),
    spring: t("admin.advisorRegistration.semesters.spring"),
    summer: t("admin.advisorRegistration.semesters.summer"),
  };
  const role = String(JSON.parse(localStorage.getItem("loggedUser") || "{}")?.role || "").toLowerCase();
  const canAct = role === "advisor" || role === "admin";
  const { show: showToast, ToastEl } = useToast();
  const periodRequestSeqRef = useRef(0);
  const studentSyncSeqRef = useRef(0);
  const initializedPreferredWindowRef = useRef(false);
  const [initializedWindow, setInitializedWindow] = useState(false);

  /* ---- Tab ---- */
  const [activeTab, setActiveTab] = useState("register"); // register | requests

  /* ---- Term selectors ---- */
  const [academicYearOptions, setAcademicYearOptions] = useState([getCurrentAcademicYear() || "2025-2026"]);
  const [semesterOptions, setSemesterOptions] = useState(defaultSemesters);
  const [form, setForm] = useState({
    academic_year_label: getCurrentAcademicYear() || "2025-2026",
    semester: "autumn",
  });

  /* ---- Period status ---- */
  const [period, setPeriod] = useState({ status: "CLOSED", is_open: false, window: null });
  const periodStatus = String(period?.status || "CLOSED").toUpperCase();
  const administrativePeriodStatus = normalizePeriodStatus(period?.window?.status || periodStatus);
  const canEditInPeriod = ["OPEN", "PENDING_REVIEW"].includes(periodStatus);
  const isOpen = canEditInPeriod;
  const PeriodIcon = PERIOD_ICONS[periodStatus] || Lock;
  const periodReason = useMemo(() => getPeriodReason(period), [period]);
  const headerIsLoading = !initializedWindow;
  const displayPeriodStatus = headerIsLoading ? "INIT" : periodStatus;
  const displayAdministrativeStatus = headerIsLoading ? "INIT" : administrativePeriodStatus;
  const HeaderPeriodIcon = headerIsLoading ? Loader2 : PeriodIcon;

  /* ---- Search ---- */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  /* ---- Selected student ---- */
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detectedStudentTerm, setDetectedStudentTerm] = useState(null);
  const [academicMetricsDraft, setAcademicMetricsDraft] = useState({ gpa: "", passed_hours: "" });
  const [savingAcademicMetrics, setSavingAcademicMetrics] = useState(false);

  /* ---- Offerings ---- */
  const [offerings, setOfferings] = useState([]);
  const [selectedOfferings, setSelectedOfferings] = useState([]);
  const [sectionSwapDraft, setSectionSwapDraft] = useState({});
  const [loadingOfferings, setLoadingOfferings] = useState(false);

  /* ---- Existing registration ---- */
  const [existingReq, setExistingReq] = useState(null);
  const [regIsLocked, setRegIsLocked] = useState(false);
  const [loadingTermData, setLoadingTermData] = useState(false);

  /* ---- Note ---- */
  const [advisorNote, setAdvisorNote] = useState("");

  /* ---- Save state ---- */
  const [saving, setSaving] = useState(false);

  /* ---- Requests list ---- */
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestFilter, setRequestFilter] = useState("advisor_requested");
  const [requestNotes, setRequestNotes] = useState({});
  const [processingId, setProcessingId] = useState(null);

  /* ---- Derived ---- */
  const readonly = !canAct || !canEditInPeriod || regIsLocked;
  const canReview = canAct && ["OPEN", "PENDING_REVIEW"].includes(periodStatus);
  const hasLegacyViewSelections = false;
  const hasDetectedTermMismatch = Boolean(
    selectedStudent &&
    detectedStudentTerm &&
    (
      String(detectedStudentTerm.academic_year_label || "") !== String(form.academic_year_label || "") ||
      String(detectedStudentTerm.semester || "") !== String(form.semester || "")
    )
  );

  const selectedHours = useMemo(
    () => offerings
      .filter((o) => selectedOfferings.some((id) => Number(id) === Number(o?.offering_id)))
      .reduce((a, b) => a + Number(b.credit_hours || 0), 0),
    [offerings, selectedOfferings]
  );

  const getCourseKey = useCallback((offering) => {
    if (!offering) return "";
    const courseId = String(offering.course_id || "").trim();
    if (courseId) return `id:${courseId}`;
    const code = String(offering.course_code || "").trim().toUpperCase();
    if (code) return `code:${code}`;
    return `title:${String(offering.course_title_ar || "").trim().toLowerCase()}`;
  }, []);

  const getAlternativeSections = useCallback((offering) => {
    const key = getCourseKey(offering);
    if (!key) return [];
    return offerings.filter(
      (item) => getCourseKey(item) === key
    );
  }, [getCourseKey, offerings]);

  const offeringsById = useMemo(() => {
    const map = new Map();
    (Array.isArray(offerings) ? offerings : []).forEach((item) => {
      const id = Number(item?.offering_id);
      if (Number.isFinite(id)) map.set(id, item);
    });
    return map;
  }, [offerings]);

  const displayOfferings = useMemo(() => {
    const groups = new Map();
    const selectedSet = new Set(
      (Array.isArray(selectedOfferings) ? selectedOfferings : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
    );

    (Array.isArray(offerings) ? offerings : []).forEach((item) => {
      const key = getCourseKey(item);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });

    const rows = [];
    groups.forEach((items) => {
      const selectedItem = items.find((x) => selectedSet.has(Number(x?.offering_id)));
      const openItem = items.find((x) => x?.is_open !== false);
      rows.push(selectedItem || openItem || items[0]);
    });
    return rows;
  }, [offerings, selectedOfferings, getCourseKey]);

  const applySectionSwap = useCallback((fromOffering, toOfferingId) => {
    const sourceId = Number(fromOffering?.offering_id);
    const targetId = Number(toOfferingId);
    if (!sourceId || !targetId || sourceId === targetId) return;
    const target = offerings.find((item) => Number(item.offering_id) === targetId);
    if (!target) return;
    if (target?.is_open === false) {
      showToast("هذا السكشن مغلق/ممتلئ ولا يمكن التحويل إليه.", "error");
      return;
    }

    setSelectedOfferings((prev) => {
      const normalizedPrev = (Array.isArray(prev) ? prev : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
      if (!normalizedPrev.includes(sourceId)) return normalizedPrev;
      const replaced = normalizedPrev.map((id) => (id === sourceId ? targetId : id));
      return Array.from(new Set(replaced));
    });
    setSectionSwapDraft((prev) => ({ ...prev, [sourceId]: "" }));
    showToast(`تم تغيير السكشن إلى ${target.section || "—"} للمادة ${target.course_code || ""}`, "success");
  }, [offerings, showToast]);

  const stats = useMemo(() => ({
    pending: requests.filter((r) => r.status === "advisor_requested").length,
    approved: requests.filter((r) => r.status === "advisor_approved").length,
    registered: requests.filter((r) => r.status === "registered").length,
  }), [requests]);

  const getSemesterLabel = useCallback((semesterId) => {
    const id = String(semesterId || "").trim().toLowerCase();
    return (
      semesterOptions.find((s) => String(s.id || "").trim().toLowerCase() === id)?.label ||
      AR_SEMESTER_LABELS[id] ||
      id ||
      "—"
    );
  }, [semesterOptions]);

  const selectedStudentCollegeLabel = useMemo(
    () =>
      String(
        selectedStudent?.college_name ||
        selectedStudent?.student_college_name ||
        selectedStudent?.college ||
        selectedStudent?.major ||
        existingReq?.student_college_name ||
        ""
      ).trim() || "—",
    [existingReq?.student_college_name, selectedStudent]
  );

  /* ========================================================================= */
  /* DATA LOADERS                                                               */
  /* ========================================================================= */

  // Load initial metadata
  const loadMeta = useCallback(async () => {
    try {
      let windows = [];
      let activeTerm = null;

      try {
        activeTerm = await getActiveRegistrationTerm();
      } catch {
        activeTerm = null;
      }

      try {
        const windowsData = await listRegistrationWindows();
        windows = Array.isArray(windowsData) ? windowsData : [];
      } catch {
        windows = [];
      }

      const dbYears = Array.from(new Set(windows.map((w) => String(w?.academic_year_label || "").trim()).filter(Boolean))).sort((a, b) => b.localeCompare(a));
      if (dbYears.length) setAcademicYearOptions(dbYears);
      const dbSemesters = Array.from(new Set(windows.map((w) => String(w?.semester || "").trim().toLowerCase()).filter(Boolean)));
      if (dbSemesters.length) {
        setSemesterOptions(
          dbSemesters.map((s) => defaultSemesters.find((x) => x.id === s) || { id: s, label: AR_SEMESTER_LABELS[s] || s })
        );
      }
      const preferredWindow = activeTerm?.window || pickPreferredWindow(windows);
      if (preferredWindow && !initializedPreferredWindowRef.current) {
        initializedPreferredWindowRef.current = true;
        const nextStatus = normalizePeriodStatus(activeTerm?.status || getEffectiveWindowStatus(preferredWindow));
        setPeriod({
          status: nextStatus,
          is_open: nextStatus === "OPEN",
          window: preferredWindow,
        });
        setForm((prev) => ({
          ...prev,
          academic_year_label: String(preferredWindow.academic_year_label || prev.academic_year_label),
          semester: String(preferredWindow.semester || prev.semester).trim().toLowerCase(),
        }));
      }
    } catch { /* silent */ }
    finally {
      setInitializedWindow(true);
    }
  }, []);

  // Load period status (no student needed)
  const loadPeriodStatus = useCallback(async (ayLabel, semester, studentId) => {
    const seq = ++periodRequestSeqRef.current;
    try {
      const params = { academic_year_label: ayLabel, semester };
      if (studentId) params.student_user_id = studentId;
      const res = await getCurrentRegistrationPeriodStatus(params);
      if (seq !== periodRequestSeqRef.current) return;
      setPeriod(res || { status: "CLOSED", is_open: false, window: null });
    } catch {
      if (seq !== periodRequestSeqRef.current) return;
      setPeriod({ status: "CLOSED", is_open: false, window: null });
    }
  }, []);

  // Sync student term data 
  const syncStudentTermData = useCallback(async (studentId, ayLabel, semester, studentSnapshot = null) => {
    if (!studentId) return;
    const seq = ++studentSyncSeqRef.current;
    try {
      setLoadingTermData(true);
      const [periodState, registrationState, profileState, academicStateResult] = await Promise.allSettled([
        withTimeout(
          getCurrentRegistrationPeriodStatus({ student_user_id: studentId, academic_year_label: ayLabel, semester }),
          10000,
          "Timed out while loading registration period status"
        ),
        withTimeout(
          getStudentRegistrationByAdvisor({ student_user_id: studentId, academic_year_label: ayLabel, semester }),
          12000,
          "Timed out while loading student registration data"
        ),
        withTimeout(
          getStudentProfileByAdvisor(studentId),
          10000,
          "Timed out while loading student academic profile"
        ),
        withTimeout(
          fetchAcademicState(),
          10000,
          "Timed out while loading academic state"
        ),
      ]);
      if (seq !== studentSyncSeqRef.current) return;
      const periodRes = periodState.status === "fulfilled" ? periodState.value : null;
      const regRes = registrationState.status === "fulfilled" ? registrationState.value : null;
      const profileRes = profileState.status === "fulfilled" ? profileState.value : null;
      const academicState = academicStateResult.status === "fulfilled" ? academicStateResult.value : null;

      if (periodRes) {
        setPeriod(periodRes);
      }

      if (!regRes) {
        if (registrationState.status === "rejected") {
          showToast("تحميل بيانات الطالب استغرق وقتًا طويلًا. يمكنك متابعة المواد الحالية ثم إعادة التحميل.", "error");
        }
        return;
      }

      const profileMetrics = profileRes || regRes?.student_profile || null;
      if (profileMetrics) {
        const fallbackMetrics = resolveFallbackAcademicMetrics(
          {
            student_user_id: studentId,
            username: studentSnapshot?.username || regRes?.request?.student_username || "",
            student_code: studentSnapshot?.student_code || regRes?.request?.student_code || "",
            id: studentSnapshot?.id,
          },
          academicState?.academicRecords
        );
        const nextGpa = Number(profileMetrics?.gpa ?? fallbackMetrics.gpa ?? 0) || Number(fallbackMetrics.gpa || 0);
        const nextPassedHours = Number(profileMetrics?.passed_hours ?? fallbackMetrics.passed_hours ?? 0) || Number(fallbackMetrics.passed_hours || 0);
        const nextStudyYear = Number(profileMetrics?.current_study_year ?? 0);
        setSelectedStudent((prev) =>
          prev
            ? {
                ...prev,
                gpa: nextGpa,
                passed_hours: nextPassedHours,
                student_gpa: nextGpa,
                student_passed_hours: nextPassedHours,
                study_year: nextStudyYear || prev.study_year,
                student_study_year: nextStudyYear || prev.student_study_year,
              }
            : prev
        );
        setAcademicMetricsDraft({
          gpa: nextGpa.toFixed(2),
          passed_hours: String(Math.round(nextPassedHours || 0)),
        });
      }

      const req = regRes?.request || null;
      const locked = Boolean(regRes?.is_locked) || isLockedReq(req);
      const sels = Array.isArray(regRes?.selections) ? regRes.selections : [];
      console.info("[advisor.registration.by-student]", {
        student_user_id: studentId,
        academic_year_label: ayLabel,
        semester,
        request_id: req?.id || null,
        request_status: req?.status || null,
        is_locked: locked,
        selections_count: sels.length,
        selections: sels.map((row) => ({
          offering_id: row?.offering_id,
          course_code: row?.course_code,
          section: row?.section,
          day_of_week: row?.day_of_week || null,
          start_time: row?.start_time || null,
        })),
      });
      setExistingReq(req);
      setRegIsLocked(locked);
      if (req) setAdvisorNote(String(req.requested_note || req.advisor_note || ""));
      if (!req) setAdvisorNote("");

      if (sels.length) {
        const selectedIds = sels
          .map((x) => Number(x.offering_id))
          .filter((x) => Number.isFinite(x) && x > 0);

        const canLoadAllOfferings = ["OPEN", "PENDING_REVIEW"].includes(normalizePeriodStatus(periodRes?.status));
        if (canLoadAllOfferings) {
          try {
            const fullRes = await withTimeout(
              listOfferingsForStudent(studentId, ayLabel, semester, { openOnly: false }),
              10000,
              "Timed out while loading student offerings"
            );
            const fullItems = Array.isArray(fullRes?.items) ? fullRes.items : [];
            if (fullItems.length) {
              const mapById = new Map(
                fullItems
                  .map((item) => [Number(item?.offering_id), item])
                  .filter(([id]) => Number.isFinite(id) && id > 0)
              );
              // Ensure selected rows remain visible even if an offering was deactivated later.
              sels.forEach((x) => {
                const id = Number(x?.offering_id);
                if (!mapById.has(id)) {
                  mapById.set(id, {
                    offering_id: id,
                    course_code: x?.course_code,
                    course_title_ar: x?.course_title_ar,
                    credit_hours: x?.credit_hours,
                    section: x?.section,
                    current_students: null,
                    capacity: null,
                    available_seats: 0,
                    is_open: false,
                    section_status: "CLOSED",
                  });
                }
              });
              setOfferings(Array.from(mapById.values()));
              const selectedFromItems = fullItems
                .filter((item) => item?.is_selected)
                .map((item) => Number(item?.offering_id))
                .filter((id) => Number.isFinite(id) && id > 0);
              setSelectedOfferings(selectedIds.length ? selectedIds : selectedFromItems);
              return;
            }
          } catch {
            // Fallback to selected rows only.
          }
        }

        setOfferings(
          sels.map((x) => ({
            offering_id: x.offering_id,
            course_code: x.course_code,
            course_title_ar: x.course_title_ar,
            credit_hours: x.credit_hours,
            section: x.section,
          }))
        );
        const fallbackIds = sels
          .map((x) => Number(x?.offering_id))
          .filter((x) => Number.isFinite(x));
        setSelectedOfferings(selectedIds.length ? selectedIds : fallbackIds);
      } else {
        setOfferings([]);
        setSelectedOfferings([]);
      }
    } catch (e) {
      if (seq !== studentSyncSeqRef.current) return;
      showToast(toArError(e?.message), "error");
    } finally {
      if (seq !== studentSyncSeqRef.current) return;
      setLoadingTermData(false);
    }
  }, [showToast]);

  // Search students
  const onSearch = useCallback(async () => {
    const q = String(searchQuery).trim();
    if (!q) return;
    try {
      setSearching(true);
      const res = await searchAdvisorStudents(q);
      const items = Array.isArray(res?.items) ? res.items : [];
      setSearchResults(items);
      if (items.length === 0) {
        if (role === "advisor") {
          try {
            const ownStudents = await listAdvisorStudents({ limit: 1 });
            const ownItems = Array.isArray(ownStudents?.items) ? ownStudents.items : [];
            if (ownItems.length === 0) {
              showToast("لا يوجد طلاب مرتبطون بهذا المرشد حاليًا. اربط الطلاب بالمرشد أولًا من إدارة المستخدمين.", "error");
            } else {
              showToast("لم يتم العثور على طالب مطابق.", "error");
            }
          } catch {
            showToast("لم يتم العثور على طالب مطابق.", "error");
          }
        } else {
          showToast("لم يتم العثور على طالب مطابق.", "error");
        }
      }
    } catch (e) {
      showToast(toArError(e?.message), "error");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, showToast, role]);

  const detectLatestStudentTerm = useCallback(async (studentObj) => {
    const studentId = studentObj?.student_user_id;
    if (!studentId) return null;
    try {
      const res = await listStudentRegistrationTermsByAdvisor(studentId);
      const items = Array.isArray(res?.items) ? res.items : [];
      const normalizedItems = items
        .filter((row) => row?.academic_year_label && row?.semester)
        .map((row) => ({
          academic_year_label: String(row.academic_year_label),
          semester: String(row.semester).trim().toLowerCase(),
        }));

      if (normalizedItems.length) {
        const exactCurrent = normalizedItems.find(
          (row) =>
            row.academic_year_label === String(form.academic_year_label || "") &&
            row.semester === String(form.semester || "").trim().toLowerCase()
        );
        const latest = exactCurrent || normalizedItems[0];
        return {
          academic_year_label: latest.academic_year_label,
          semester: latest.semester,
        };
      }

      return null;
    } catch {
      return null;
    }
  }, [form.academic_year_label, form.semester]);

  // Select a student
  const onSelectStudent = useCallback(async (st) => {
    const formatGpa = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "0.00";
      const clamped = Math.min(4, Math.max(0, n));
      return clamped.toFixed(2);
    };
    const formatPassedHours = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "0";
      const clamped = Math.max(0, n);
      const rounded = Math.round(clamped);
      return String(rounded);
    };
    setSelectedStudent(st);
    setAcademicMetricsDraft({
      gpa: formatGpa(st?.gpa ?? st?.student_gpa ?? 0),
      passed_hours: formatPassedHours(st?.passed_hours ?? st?.student_passed_hours ?? 0),
    });
    setSearchResults([]);
    setSearchQuery(st.full_name || st.username || "");
    setExistingReq(null);
    setRegIsLocked(false);
    setOfferings([]);
    setSelectedOfferings([]);
    setAdvisorNote("");
    setDetectedStudentTerm(null);

    const latestTerm = await detectLatestStudentTerm(st);
    if (latestTerm) {
      setDetectedStudentTerm(latestTerm);
      setAcademicYearOptions((prev) => {
        const next = Array.from(new Set([...(Array.isArray(prev) ? prev : []), latestTerm.academic_year_label]));
        return next.sort((a, b) => String(b).localeCompare(String(a)));
      });
      setSemesterOptions((prev) => {
        const hasSemester = Array.isArray(prev) && prev.some((item) => String(item?.id || "").trim().toLowerCase() === String(latestTerm.semester || "").trim().toLowerCase());
        if (hasSemester) return prev;
        const sem = String(latestTerm.semester || "").trim().toLowerCase();
        return [...(Array.isArray(prev) ? prev : []), defaultSemesters.find((x) => x.id === sem) || { id: sem, label: getSemesterLabel(sem) }];
      });

      const currentPeriodIsEditable = true; // Keep the chosen active term; old student history should not auto-switch the page.
      const shouldAutoSwitch =
        !currentPeriodIsEditable && (
          String(latestTerm.academic_year_label) !== String(form.academic_year_label) ||
          String(latestTerm.semester).trim().toLowerCase() !== String(form.semester).trim().toLowerCase()
        );

      if (shouldAutoSwitch) {
        setForm((p) => ({ ...p, academic_year_label: latestTerm.academic_year_label, semester: String(latestTerm.semester).trim().toLowerCase() }));
        showToast(`تم التحويل تلقائيًا إلى آخر ترم مسجل: ${latestTerm.academic_year_label} — ${getSemesterLabel(latestTerm.semester)}`, "success");
        return;
      }
    }

    syncStudentTermData(st.student_user_id, form.academic_year_label, form.semester, st);
  }, [detectLatestStudentTerm, form, getSemesterLabel, period?.status, showToast, syncStudentTermData]);

  const onJumpToDetectedTerm = useCallback(() => {
    if (!selectedStudent || !detectedStudentTerm) return;
    setForm((p) => ({
      ...p,
      academic_year_label: detectedStudentTerm.academic_year_label,
      semester: detectedStudentTerm.semester,
    }));
    showToast("تم الانتقال إلى آخر ترم مسجل للطالب.", "success");
  }, [selectedStudent, detectedStudentTerm, showToast]);

  // Load course offerings
  const onLoadOfferings = useCallback(async () => {
    const sid = selectedStudent?.student_user_id;
    if (!sid) return showToast("اختر الطالب أولاً.", "error");
    if (!canAct) return showToast("ليس لديك صلاحية تنفيذ هذا الإجراء.", "error");
    if (regIsLocked) return showToast("تسجيل الطالب معتمد/مقفل — يمكنك العرض فقط.", "success");
    if (!canEditInPeriod) return showToast("الفترة الحالية غير مفتوحة للتعديل — يمكنك مراجعة التسجيل الحالي فقط.", "success");
    try {
      setLoadingOfferings(true);
      const res = await listOfferingsForStudent(sid, form.academic_year_label, form.semester, { openOnly: false });
      const items = Array.isArray(res?.items) ? res.items : [];
      setOfferings(items);
      const selectedFromItems = items
        .filter((item) => item?.is_selected)
        .map((item) => Number(item?.offering_id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (selectedFromItems.length) {
        setSelectedOfferings(selectedFromItems);
      } else if (!existingReq) {
        setSelectedOfferings([]);
      }
      if (items.length === 0) showToast("لا توجد مواد متاحة لهذا الطالب في هذا الترم.", "error");
    } catch (e) {
      showToast(toArError(e?.message), "error");
    } finally {
      setLoadingOfferings(false);
    }
  }, [selectedStudent, canAct, regIsLocked, canEditInPeriod, form, existingReq, showToast]);

  // Save registration
  const onSave = useCallback(async () => {
    const sid = selectedStudent?.student_user_id;
    if (!sid) return showToast("اختر الطالب أولاً.", "error");
    if (readonly) return showToast("لا يمكن الحفظ في الحالة الحالية.", "error");
    if (!selectedOfferings.length) return showToast("اختر مادة واحدة على الأقل.", "error");
    try {
      setSaving(true);
      await advisorManageRegistrationForStudent({
        student_user_id: Number(sid),
        academic_year_label: form.academic_year_label,
        semester: form.semester,
        offering_ids: selectedOfferings,
        requested_note: String(advisorNote || "").trim() || null,
      });
      showToast(existingReq ? "تم تعديل تسجيل الطالب بنجاح ✓" : "تم حفظ تسجيل الطالب بنجاح ✓", "success");
      await syncStudentTermData(sid, form.academic_year_label, form.semester);
    } catch (e) {
      showToast(toArError(e?.message), "error");
    } finally {
      setSaving(false);
    }
  }, [selectedStudent, readonly, selectedOfferings, form, advisorNote, existingReq, showToast, syncStudentTermData]);

  // Load requests
  const loadRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const params = { status: requestFilter === "all" ? undefined : requestFilter };
      const res = await listAdvisorRequests(params);
      setRequests(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      showToast(toArError(e?.message), "error");
    } finally {
      setLoadingRequests(false);
    }
  }, [requestFilter, showToast]);

  const onSaveAcademicMetrics = useCallback(async () => {
    const sid = Number(selectedStudent?.student_user_id || 0);
    if (!sid) return;
    const gpaValue = Number(academicMetricsDraft.gpa);
    const passedHoursValue = Number(academicMetricsDraft.passed_hours);
    const normalizedGpa = Math.round(Math.min(4, Math.max(0, Number.isFinite(gpaValue) ? gpaValue : 0)) * 100) / 100;
    const normalizedPassedHours = Math.round(Math.max(0, Number.isFinite(passedHoursValue) ? passedHoursValue : 0));
    const payload = { gpa: normalizedGpa, passed_hours: normalizedPassedHours };

    const prevGpa = Number(selectedStudent?.gpa ?? selectedStudent?.student_gpa ?? 0);
    const prevHours = Number(selectedStudent?.passed_hours ?? selectedStudent?.student_passed_hours ?? 0);

    const confirm = await Swal.fire({
      title: "تأكيد التغيير",
      html: `<div style="text-align:right;font-size:14px;line-height:1.6">
        <p style="margin:0 0 8px">هل تريد حفظ المعدل والساعات المجتازة لهذا الطالب؟</p>
        <p style="margin:0;color:#64748b;font-size:12px">من: معدل ${prevGpa.toFixed(2)} — ساعات ${Math.round(prevHours)}</p>
        <p style="margin:4px 0 0;color:#0f172a;font-weight:700">إلى: معدل ${normalizedGpa.toFixed(2)} — ساعات ${normalizedPassedHours}</p>
      </div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "تأكيد الحفظ",
      cancelButtonText: "إلغاء",
      buttonsStyling: false,
      focusCancel: true,
      customClass: {
        popup: "rounded-2xl",
        confirmButton: "px-5 py-2.5 rounded-xl font-bold text-white bg-[#05ADCF] border-0 mx-1",
        cancelButton: "px-5 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 border border-slate-200 mx-1",
      },
      didOpen: (el) => {
        el.style.direction = "rtl";
        el.style.textAlign = "right";
      },
    });
    if (!confirm.isConfirmed) return;

    try {
      setSavingAcademicMetrics(true);
      const res = await updateStudentAcademicMetrics(sid, payload);
      const nextGpa = Number(res?.gpa ?? payload.gpa ?? 0);
      const nextPassedHours = Number(res?.passed_hours ?? payload.passed_hours ?? 0);
      setSelectedStudent((prev) =>
        prev
          ? {
              ...prev,
              gpa: nextGpa,
              passed_hours: nextPassedHours,
              student_gpa: nextGpa,
              student_passed_hours: nextPassedHours,
            }
          : prev
      );
      setAcademicMetricsDraft({
        gpa: Number(nextGpa).toFixed(2),
        passed_hours: String(Math.round(Number(nextPassedHours) || 0)),
      });
      showToast("تم حفظ المعدل والساعات المجتازة. سيظهر التحديث للطالب عند فتح الصفحة أو تحديثها.", "success");
      await loadRequests();
      if (selectedStudent?.student_user_id) {
        await syncStudentTermData(selectedStudent.student_user_id, form.academic_year_label, form.semester);
      }
    } catch (e) {
      showToast(toArError(e?.message || "تعذر حفظ بيانات المعدل والساعات المجتازة."), "error");
    } finally {
      setSavingAcademicMetrics(false);
    }
  }, [
    academicMetricsDraft.gpa,
    academicMetricsDraft.passed_hours,
    selectedStudent?.student_user_id,
    selectedStudent?.gpa,
    selectedStudent?.student_gpa,
    selectedStudent?.passed_hours,
    selectedStudent?.student_passed_hours,
    showToast,
    loadRequests,
  ]);

  // Decision on request
  const onDecision = useCallback(async (requestId, status, currentStatus = "") => {
    const normalizedCurrent = String(currentStatus || "").trim().toLowerCase();
    const isReopenFromApproved =
      String(status || "").trim().toLowerCase() === "need_info" &&
      ["advisor_approved", "registered"].includes(normalizedCurrent);
    if (!canReview && !isReopenFromApproved) return showToast("الحالة الحالية لا تسمح بالقرار.", "error");
    try {
      setProcessingId(requestId);
      await advisorDecisionOnRequest(requestId, { status, advisor_note: String(requestNotes[requestId] || "").trim() || null });
      if (status === "advisor_approved") {
        showToast("تم اعتماد الطلب بنجاح ✓ (بدون تنفيذ التسجيل بعد)", "success");
      } else {
        showToast("تم تحديث حالة الطلب بنجاح ✓", "success");
      }
      await loadRequests();
    } catch (e) {
      showToast(toArError(e?.message), "error");
    } finally {
      setProcessingId(null);
    }
  }, [canReview, requestNotes, showToast, loadRequests, selectedStudent, syncStudentTermData, form.academic_year_label, form.semester]);

  // Register request
  const onRegister = useCallback(async (requestId) => {
    if (!canReview) return showToast("الحالة الحالية لا تسمح بتنفيذ التسجيل.", "error");
    try {
      setProcessingId(requestId);
      await advisorRegisterRequest(requestId);
      showToast("تم تنفيذ التسجيل بنجاح ✓", "success");
      await loadRequests();
    } catch (e) {
      showToast(toArError(e?.message), "error");
    } finally {
      setProcessingId(null);
    }
  }, [canReview, showToast, loadRequests]);

  const onOpenRequestForEdit = useCallback(async (req) => {
    const studentObj = {
      student_user_id: req.student_user_id,
      full_name: req.student_full_name || req.student_username || `الطالب #${req.student_user_id}`,
      username: req.student_username || "",
      student_code: req.student_code || "",
      study_year: req.student_study_year || "",
      college_name: req.student_college_name || "",
    };
    setActiveTab("register");
    setForm((p) => ({
      ...p,
      academic_year_label: req.academic_year_label || p.academic_year_label,
      semester: req.semester || p.semester,
    }));
    await onSelectStudent(studentObj);
    await syncStudentTermData(
      req.student_user_id,
      req.academic_year_label || form.academic_year_label,
      req.semester || form.semester,
      studentObj
    );
    showToast("تم فتح الطلب في شاشة التسجيل للتعديل المباشر.", "success");
  }, [form.academic_year_label, form.semester, onSelectStudent, showToast, syncStudentTermData]);

  /* ========================================================================= */
  /* EFFECTS                                                                    */
  /* ========================================================================= */
  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => {
    if (!initializedWindow) return;
    loadPeriodStatus(form.academic_year_label, form.semester);
  }, [form.academic_year_label, form.semester, initializedWindow, loadPeriodStatus]);
  useEffect(() => { loadRequests(); }, [loadRequests]);
  useEffect(() => {
    setSectionSwapDraft((prev) => {
      const selectedSet = new Set(selectedOfferings.map((x) => Number(x)));
      const next = {};
      Object.entries(prev || {}).forEach(([key, value]) => {
        const offeringId = Number(key);
        if (selectedSet.has(offeringId)) next[offeringId] = value;
      });
      return next;
    });
  }, [selectedOfferings]);
  useEffect(() => {
    const studentId = selectedStudent?.student_user_id;
    if (!studentId) return;
    syncStudentTermData(studentId, form.academic_year_label, form.semester, selectedStudent);
  }, [form.academic_year_label, form.semester, selectedStudent?.student_user_id, syncStudentTermData]);

  /* ========================================================================= */
  /* RENDER                                                                     */
  /* ========================================================================= */
  return (
    <div className="advisor-reg" dir="rtl">
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ===== PERIOD STATUS HEADER ===== */}
        <div className={`ar-period-header status-${displayPeriodStatus} ar-animate-in`}>
          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 900, margin: 0 }}>{t("admin.advisorRegistration.title")}</h1>
                <p style={{ fontSize: "0.85rem", opacity: 0.85, marginTop: 6, fontWeight: 500 }}>
                  {headerIsLoading ? "جاري تحديد حالة فترة التسجيل..." : (PERIOD_MESSAGES[periodStatus] || PERIOD_MESSAGES.CLOSED)}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: "0.75rem", padding: "0.6rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", fontWeight: 700 }}>
                  <CalendarDays size={16} />
                  {form.academic_year_label} — {getSemesterLabel(form.semester)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.14)", borderRadius: "999px", padding: "0.5rem 1rem", fontWeight: 800, fontSize: "0.8rem" }}>
                  <ShieldCheck size={16} />
                  {t("admin.advisorRegistration.adminStateOpen")}: {headerIsLoading ? "جاري التحميل" : (PERIOD_LABELS[displayAdministrativeStatus] || t("admin.advisorRegistration.status.closed"))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.2)", borderRadius: "999px", padding: "0.5rem 1.25rem", fontWeight: 800, fontSize: "0.85rem" }}>
                  <HeaderPeriodIcon size={18} className={headerIsLoading ? "animate-spin" : ""} />
                  {t("admin.advisorRegistration.actualStateOpen")}: {headerIsLoading ? "جاري التحميل" : (PERIOD_LABELS[displayPeriodStatus] || t("admin.advisorRegistration.status.closed"))}
                </div>
              </div>
            </div>
            {!headerIsLoading && periodReason ? (
              <p style={{ marginTop: 8, marginBottom: 0, fontSize: "0.78rem", fontWeight: 700, opacity: 0.95 }}>
                {periodReason}
              </p>
            ) : null}
          </div>
        </div>

        {/* ===== TERM SELECTORS ===== */}
        <div className="ar-card ar-animate-in" style={{ padding: "1rem 1.5rem", marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <select
            className="ar-select"
            value={form.academic_year_label}
            onChange={(e) => setForm((p) => ({ ...p, academic_year_label: e.target.value }))}
          >
            {academicYearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            className="ar-select"
            value={form.semester}
            onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value }))}
          >
            {semesterOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <div className="ar-tabs">
            <button className={`ar-tab ${activeTab === "register" ? "active" : ""}`} onClick={() => setActiveTab("register")}>
              <BookMarked size={16} style={{ marginLeft: 6, verticalAlign: "middle" }} /> {t("admin.advisorRegistration.registerStudents")}
            </button>
            <button className={`ar-tab ${activeTab === "requests" ? "active" : ""}`} onClick={() => setActiveTab("requests")}>
              <FileText size={16} style={{ marginLeft: 6, verticalAlign: "middle" }} /> {t("admin.advisorRegistration.incomingRequests")}
              {stats.pending > 0 && (
                <span style={{ background: "#e11d48", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: "0.7rem", fontWeight: 800, marginRight: 6 }}>{stats.pending}</span>
              )}
            </button>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* TAB: REGISTER                                                          */}
        {/* ===================================================================== */}
        {activeTab === "register" && (
          <div className="ar-animate-in" style={{ marginTop: "1rem" }}>

            {/* ---- Search ---- */}
            <div className="ar-card" style={{ padding: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--ar-text-primary)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: 8 }}>
                <Search size={20} style={{ color: "#05ADCF" }} />  {t("admin.advisorRegistration.searchStudent")}
              </h2>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <div className="ar-search-wrap" style={{ flex: 1, minWidth: 250 }}>
                  <input
                    placeholder={t("admin.advisorRegistration.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSearch()}
                  />
                  <Search className="search-icon" size={20} />
                </div>
                <button className="ar-btn-secondary" onClick={onSearch} disabled={searching} style={{ minWidth: 120 }}>
                  {searching ? <><Loader2 size={16} className="animate-spin" /> {t("admin.advisorRegistration.searching")}</> : t("admin.advisorRegistration.search")}
                </button>
              </div>

              {/* Search results dropdown */}
              {searchResults.length > 0 && (
                <div className="ar-search-results">
                  {searchResults.map((st) => (
                    <div
                      className="ar-search-result-item"
                      key={st.student_user_id}
                      onClick={() => onSelectStudent(st)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1.25rem", cursor: "pointer", transition: "background 0.15s" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: "0.75rem", background: "linear-gradient(135deg, #05ADCF, #0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "0.9rem" }}>
                          {String(st.full_name || "?")[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--ar-text-primary)" }}>{st.full_name || "—"}</div>
                          <div style={{ fontWeight: 600, fontSize: "0.75rem", color: "var(--ar-text-muted)" }}>{st.username || "—"} • {st.college_name || "—"} • السنة {st.study_year || "—"}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#05ADCF", background: "rgba(5,173,207,0.08)", padding: "4px 12px", borderRadius: 999 }}>{t("admin.advisorRegistration.selectStudent")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ---- Selected Student Card ---- */}
            {selectedStudent && (
              <div className="ar-card ar-animate-in" style={{ padding: "1.5rem", marginTop: "1rem" }}>
                <div className="ar-student-card">
                  <div className="ar-student-avatar">
                    <User size={28} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: 900, color: "var(--ar-text-primary)", margin: 0 }}>
                      {selectedStudent.full_name || "—"}
                    </h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8rem", fontWeight: 600, color: "var(--ar-text-secondary)" }}>
                        <User size={14} /> {selectedStudent.username || "—"}
                      </span>
                      {selectedStudentCollegeLabel !== "—" && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8rem", fontWeight: 600, color: "var(--ar-text-secondary)" }}>
                          <Building2 size={14} /> {selectedStudentCollegeLabel}
                        </span>
                      )}
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8rem", fontWeight: 600, color: "var(--ar-text-secondary)" }}>
                        <GraduationCap size={14} /> السنة {selectedStudent.study_year || "—"}
                      </span>
                    </div>
                  </div>
                  {/* Registration status badge */}
                  {existingReq ? (
                    <div className={`ar-status-badge badge-${regIsLocked ? "LOCKED" : "OPEN"}`}>
                      {regIsLocked ? <Lock size={14} /> : <CheckCircle size={14} />}
                      {regIsLocked ? "تسجيل مقفل/معتمد" : `${reqHeaderLabel(existingReq.status)} — ${reqStatusLabel(existingReq.status)}`}
                    </div>
                  ) : (
                    <div className={`ar-status-badge badge-${isOpen ? "OPEN" : "CLOSED"}`}>
                      {hasLegacyViewSelections ? <CheckCircle size={14} /> : isOpen ? <BookOpen size={14} /> : <XCircle size={14} />}
                      {hasLegacyViewSelections ? "مسجل سابقًا (بيانات قديمة — عرض فقط)" : isOpen ? "غير مسجل — جاهز للتسجيل" : "غير مسجل — التسجيل مغلق"}
                    </div>
                  )}
                </div>

                {hasDetectedTermMismatch && (
                  <div style={{ marginTop: "1rem", padding: "0.9rem 1rem", borderRadius: "0.9rem", background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.22)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#075985", display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertTriangle size={16} />
                      الطالب لديه تسجيل في {detectedStudentTerm.academic_year_label} / {getSemesterLabel(detectedStudentTerm.semester)}
                    </span>
                    <button className="ar-btn-secondary" style={{ minHeight: 34, padding: "0.4rem 0.9rem" }} onClick={onJumpToDetectedTerm}>
                      الانتقال الآن
                    </button>
                  </div>
                )}

                <div style={{ marginTop: "1rem", padding: "1rem", borderRadius: "0.9rem", border: "1px solid var(--ar-border)", background: "var(--ar-surface-soft)" }}>
                  <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--ar-text-secondary)", marginBottom: "0.75rem" }}>
                    البيانات الأكاديمية للطالب
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", alignItems: "end" }}>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontSize: "0.75rem", fontWeight: 700, color: "var(--ar-text-muted)" }}>المعدل التراكمي</label>
                      <input
                        className="ar-input"
                        type="number"
                        dir="ltr"
                        min="0"
                        max="4"
                        step="0.01"
                        value={academicMetricsDraft.gpa}
                        onChange={(e) => setAcademicMetricsDraft((prev) => ({ ...prev, gpa: e.target.value }))}
                        onBlur={() =>
                          setAcademicMetricsDraft((prev) => {
                            const n = Number(prev.gpa);
                            const clamped = Math.min(4, Math.max(0, Number.isFinite(n) ? n : 0));
                            return { ...prev, gpa: clamped.toFixed(2) };
                          })
                        }
                        disabled={!canAct || savingAcademicMetrics}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontSize: "0.75rem", fontWeight: 700, color: "var(--ar-text-muted)" }}>الساعات المجتازة</label>
                      <input
                        className="ar-input"
                        type="number"
                        dir="ltr"
                        min="0"
                        step="1"
                        value={academicMetricsDraft.passed_hours}
                        onChange={(e) => setAcademicMetricsDraft((prev) => ({ ...prev, passed_hours: e.target.value }))}
                        onBlur={() =>
                          setAcademicMetricsDraft((prev) => {
                            const n = Number(prev.passed_hours);
                            const rounded = Math.round(Math.max(0, Number.isFinite(n) ? n : 0));
                            return { ...prev, passed_hours: String(rounded) };
                          })
                        }
                        disabled={!canAct || savingAcademicMetrics}
                      />
                    </div>
                    <div>
                      <button
                        className="ar-btn-primary"
                        type="button"
                        onClick={onSaveAcademicMetrics}
                        disabled={!canAct || savingAcademicMetrics}
                      >
                        {savingAcademicMetrics ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        <span style={{ marginRight: 6 }}>Save Metrics</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Closed / Locked warning */}
                {!isOpen && (
                  <div style={{ marginTop: "1rem", padding: "1rem 1.25rem", borderRadius: "1rem", background: "rgba(225,29,72,0.06)", border: "1px solid rgba(225,29,72,0.15)", display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: "0.85rem", color: "#be123c" }}>
                    <AlertTriangle size={20} />
                    {PERIOD_MESSAGES[periodStatus] || PERIOD_MESSAGES.CLOSED}
                  </div>
                )}
                {isOpen && regIsLocked && (
                  <div style={{ marginTop: "1rem", padding: "1rem 1.25rem", borderRadius: "1rem", background: "rgba(107,114,128,0.06)", border: "1px solid rgba(107,114,128,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontWeight: 700, fontSize: "0.85rem", color: "#374151", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Lock size={20} />
                      <span>الترم مفتوح، لكن طلب هذا الطالب حالته النهائية هي {reqStatusLabel(existingReq?.status)} لذلك لا يمكن التعديل مباشرة.</span>
                    </div>
                    {canAct && existingReq?.id && ["advisor_approved", "registered"].includes(String(existingReq?.status || "").toLowerCase()) && (
                      <button
                        className="ar-btn-info"
                        type="button"
                        disabled={processingId === existingReq.id}
                        onClick={() => onDecision(existingReq.id, "need_info", existingReq?.status)}
                      >
                        {processingId === existingReq.id ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                        <span style={{ marginRight: 6 }}>إرجاع للمراجعة</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ---- Load offerings / Offerings list ---- */}
            {selectedStudent && (
              <div className={`ar-card ar-animate-in ${readonly && !loadingTermData ? "" : ""}`} style={{ padding: "1.5rem", marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--ar-text-primary)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <BookOpen size={20} style={{ color: "#05ADCF" }} /> المواد المتاحة / المسجلة
                  </h2>
                  <button className="ar-btn-secondary" onClick={onLoadOfferings} disabled={loadingOfferings || loadingTermData || !selectedStudent}>
                    {loadingOfferings ? <><Loader2 size={14} className="animate-spin" /> تحميل...</> : <><RefreshCw size={14} /> تحميل مواد الترم</>}
                  </button>
                </div>

                {/* Hours counter */}
                {offerings.length > 0 && (
                  <div className="ar-hours-counter" style={{ marginBottom: "1rem" }}>
                    <div>
                      <div className="count">{selectedHours}</div>
                      <div className="label">ساعة مختارة</div>
                    </div>
                    <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.2)" }} />
                    <div>
                      <div className="count">{displayOfferings.length}</div>
                      <div className="label">مادة متاحة</div>
                    </div>
                  </div>
                )}

                {/* Offerings list */}
                {loadingTermData ? (
                  <div className="ar-empty">
                    <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} />
                    <p style={{ marginTop: "0.5rem", fontWeight: 700 }}>جارٍ تحميل بيانات الطالب...</p>
                  </div>
                ) : offerings.length > 0 ? (
                  <div style={{ borderRadius: "1rem", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    {displayOfferings.map((o) => {
                      const offeringId = Number(o?.offering_id);
                      const isSelected = selectedOfferings.some((id) => Number(id) === offeringId);
                      const isSectionOpen = o?.is_open !== false;
                      const eligibilityStatus = String(o?.eligibility_status || "").trim().toLowerCase();
                      const isSelectable = isSelected || eligibilityStatus === "open";
                      const statusMeta = offeringStatusMeta(o, isSelected);
                      const reasonText = !isSelectable ? String(o?.eligibility_reason || "").trim() : "";
                      const alternatives = isSelected ? getAlternativeSections(o) : [];
                      const swapValue = String(sectionSwapDraft[offeringId] || "");
                      return (
                        <label
                          key={o.offering_id}
                          className={`ar-offering-item ${isSelected ? "selected" : ""} ${readonly || !isSelectable ? "disabled" : ""}`}
                          style={{ cursor: readonly || !isSelectable ? "not-allowed" : "pointer" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <input
                              type="checkbox"
                              className="ar-checkbox"
                              checked={isSelected}
                              disabled={readonly || !isSelectable}
                              onChange={() => {
                                if (readonly || !isSelectable) return;
                                setSelectedOfferings((prev) => {
                                  const normalizedPrev = (Array.isArray(prev) ? prev : [])
                                    .map((id) => Number(id))
                                    .filter((id) => Number.isFinite(id));
                                  const currentCourseKey = getCourseKey(o);
                                  if (normalizedPrev.includes(offeringId)) {
                                    return normalizedPrev.filter((id) => id !== offeringId);
                                  }
                                  const cleaned = normalizedPrev.filter((id) => {
                                    const existing = offeringsById.get(id);
                                    return getCourseKey(existing) !== currentCourseKey;
                                  });
                                  return [...cleaned, offeringId];
                                });
                              }}
                            />
                            <div>
                              <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--ar-text-primary)" }}>
                                {o.course_code} — {o.course_title_ar}
                              </div>
                              <div style={{ fontWeight: 600, fontSize: "0.75rem", color: "var(--ar-text-muted)", marginTop: 2 }}>
                                السكشن {o.section}
                              </div>
                              <div style={{ marginTop: 6 }}>
                                <span style={{ fontWeight: 800, fontSize: "0.72rem", color: statusMeta.color, background: statusMeta.bg, padding: "4px 10px", borderRadius: 999 }}>
                                  {statusMeta.label}
                                </span>
                              </div>
                              {reasonText && (
                                <div style={{ fontWeight: 700, fontSize: "0.72rem", color: "#9a3412", marginTop: 4 }}>
                                  {reasonText}
                                </div>
                              )}
                              {!isSectionOpen && eligibilityStatus === "open" && (
                                <div style={{ fontWeight: 700, fontSize: "0.72rem", color: "#dc2626", marginTop: 4 }}>
                                  مغلق — هذا السكشن ممتلئ
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="ar-offering-actions" onClick={(e) => e.stopPropagation()}>
                            {isSelected && alternatives.length > 0 && (
                              <div className="ar-section-swap-wrap">
                                <span className="ar-section-swap-label">تغيير السكشن:</span>
                                <select
                                  className="ar-section-swap-select"
                                  value={swapValue}
                                  disabled={readonly}
                                  onChange={(e) =>
                                    setSectionSwapDraft((prev) => ({
                                      ...prev,
                                      [offeringId]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">اختر السكشن</option>
                                  {alternatives.map((alt) => (
                                    <option key={alt.offering_id} value={alt.offering_id} disabled={alt?.is_open === false}>
                                      {Number(alt.offering_id) === offeringId ? "السكشن الحالي" : "سكشن"} {alt.section || "—"} ({alt.credit_hours || 0} ساعة){alt?.is_open === false ? " — مغلق" : ""}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="ar-btn-mini"
                                  disabled={readonly || !swapValue || Number(swapValue) === offeringId}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    applySectionSwap(o, swapValue);
                                  }}
                                >
                                  تطبيق
                                </button>
                              </div>
                            )}
                            {isSelected && alternatives.length === 0 && !isSectionOpen && (
                              <span style={{ fontWeight: 700, fontSize: "0.72rem", color: "#dc2626", whiteSpace: "nowrap" }}>
                                لا توجد سكاش مفتوحة بديلة الآن
                              </span>
                            )}
                            <span style={{ fontWeight: 800, fontSize: "0.8rem", color: "#05ADCF", background: "rgba(5,173,207,0.08)", padding: "4px 12px", borderRadius: 999, whiteSpace: "nowrap" }}>
                              {o.credit_hours} ساعة
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ar-empty">
                    <div className="ar-empty-icon">
                      <BookOpen size={36} style={{ color: "var(--ar-icon-muted)" }} />
                    </div>
                    <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                      {existingReq
                        ? "لا توجد مواد مسجلة — اضغط \"تحميل مواد الترم\" لعرض المواد المتاحة."
                        : !isOpen
                          ? "لا توجد مواد مسجلة لهذا الترم حاليًا. الفترة غير مفتوحة للتعديل (عرض فقط)."
                          : "اضغط \"تحميل مواد الترم\" لعرض المواد المتاحة لهذا الطالب."}
                    </p>
                  </div>
                )}

                {/* Advisor note */}
                {offerings.length > 0 && (
                  <textarea
                    className="ar-textarea"
                    value={advisorNote}
                    onChange={(e) => setAdvisorNote(e.target.value)}
                    disabled={readonly}
                    placeholder="ملاحظة المرشد (اختيارية)..."
                    style={{ marginTop: "1rem" }}
                  />
                )}

                {/* Save button */}
                {offerings.length > 0 && (
                  <button className="ar-btn-primary" onClick={onSave} disabled={saving || readonly || !selectedOfferings.length} style={{ marginTop: "1rem" }}>
                    {saving ? (
                      <><Loader2 size={18} className="animate-spin" /> جارٍ الحفظ...</>
                    ) : existingReq ? (
                      <><Save size={18} /> تعديل تسجيل الطالب</>
                    ) : (
                      <><Save size={18} /> حفظ تسجيل الطالب</>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* No student selected */}
            {!selectedStudent && (
              <div className="ar-card ar-animate-in" style={{ marginTop: "1rem" }}>
                <div className="ar-empty" style={{ padding: "4rem 2rem" }}>
                  <div className="ar-empty-icon">
                    <User size={36} style={{ color: "var(--ar-icon-muted)" }} />
                  </div>
                  <h3 style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--ar-text-secondary)", margin: "0.5rem 0" }}>{t("admin.advisorRegistration.searchStudentToStart")}</h3>
                  <p style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ar-text-muted)", maxWidth: 400, margin: "0 auto" }}>
                    {t("admin.advisorRegistration.searchStudentHint")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB: REQUESTS                                                          */}
        {/* ===================================================================== */}
        {activeTab === "requests" && (
          <div className="ar-animate-in" style={{ marginTop: "1rem" }}>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
              <div className="ar-card" style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: "0.75rem", background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Clock size={20} style={{ color: "#d97706" }} />
                </div>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--ar-text-primary)" }}>{stats.pending}</div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ar-text-muted)" }}>{t("admin.advisorRegistration.status.pendingReview")}</div>
                </div>
              </div>
              <div className="ar-card" style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: "0.75rem", background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ShieldCheck size={20} style={{ color: "#1d4ed8" }} />
                </div>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--ar-text-primary)" }}>{stats.approved}</div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ar-text-muted)" }}>{t("admin.advisorRegistration.status.approved")}</div>
                </div>
              </div>
              <div className="ar-card" style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: "0.75rem", background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle size={20} style={{ color: "#059669" }} />
                </div>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--ar-text-primary)" }}>{stats.registered}</div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ar-text-muted)" }}>{t("admin.advisorRegistration.requestFilter.registered")}</div>
                </div>
              </div>
            </div>

            {/* Filter */}
            <div className="ar-card" style={{ padding: "1rem 1.5rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--ar-text-secondary)" }}>{t("admin.advisorRegistration.statusFilter")}:</span>
              <select className="ar-select" value={requestFilter} onChange={(e) => setRequestFilter(e.target.value)}>
                {Object.entries(REQUEST_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="ar-btn-secondary" onClick={loadRequests} disabled={loadingRequests}>
                {loadingRequests ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                <span style={{ marginRight: 4 }}>{t("admin.common.refresh")}</span>
              </button>
            </div>

            {/* Requests list */}
            <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.75rem" }}>
              {loadingRequests ? (
                <div className="ar-card">
                  <div className="ar-empty">
                    <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} />
                    <p style={{ fontWeight: 700 }}>{t("admin.common.loading")}</p>
                  </div>
                </div>
              ) : requests.length === 0 ? (
                <div className="ar-card">
                  <div className="ar-empty">
                    <div className="ar-empty-icon"><FileText size={36} style={{ color: "var(--ar-icon-muted)" }} /></div>
                    <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>{t("admin.advisorRegistration.noMatchingRequests")}</p>
                  </div>
                </div>
              ) : requests.map((r) => {
                const rowLocked = !canReview || isLockedReq(r);
                return (
                  <div key={r.id} className="ar-request-card ar-animate-in">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: "0.75rem", background: "linear-gradient(135deg, #f1f5f9, #e2e8f0)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <User size={18} style={{ color: "var(--ar-text-secondary)" }} />
                        </div>
                        <div>
                          <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--ar-text-primary)" }}>
                            طلب #{r.id}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--ar-text-secondary)", marginRight: 8 }}>
                            — {r.student_full_name || "طالب غير معروف"}
                          </span>
                          <div style={{ fontWeight: 600, fontSize: "0.75rem", color: "var(--ar-text-muted)" }}>
                            {resolveStudentIdentityLabel(r)} •
                            {r.student_study_year ? ` السنة ${r.student_study_year}` : ""} •
                            {r.student_college_name || "—"} •
                            {r.academic_year_label} — {getSemesterLabel(r.semester)}
                          </div>
                        </div>
                      </div>
                      <span style={{ padding: "4px 14px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 800, background: "#f1f5f9", color: "var(--ar-text-secondary)" }}>
                        {reqStatusLabel(r.status)}
                      </span>
                    </div>

                    <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.4rem" }}>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--ar-text-secondary)" }}>
                        المعدل التراكمي: {Number(r.student_gpa || 0).toFixed(2)} • الساعات المختارة: {Number(r.selected_total_hours || 0)}
                      </div>
                      {Array.isArray(r.selected_offerings) && r.selected_offerings.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {r.selected_offerings.map((item) => (
                            <span
                              key={`${r.id}-${item.offering_id}`}
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: "rgba(5,173,207,0.10)",
                                color: "#036d82",
                                border: "1px solid rgba(5,173,207,0.25)",
                              }}
                              title={`${item.course_title_ar || item.course_code} • سكشن ${item.section}`}
                            >
                              {item.course_code} • سكشن {item.section}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.75rem", color: "var(--ar-text-muted)" }}>لا توجد مواد مرتبطة بالطلب.</div>
                      )}
                    </div>

                    <div style={{ marginTop: "0.75rem" }}>
                      <button className="ar-btn-secondary" onClick={() => onOpenRequestForEdit(r)}>
                        {t("admin.advisorRegistration.openForEdit")}
                      </button>
                    </div>

                    {canAct && !rowLocked && (
                      <>
                        <textarea
                          className="ar-textarea"
                          value={requestNotes[r.id] || ""}
                          onChange={(e) => setRequestNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                          placeholder={t("admin.advisorRegistration.advisorNotePlaceholder")}
                          style={{ marginTop: "0.75rem", minHeight: 60 }}
                        />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "0.75rem" }}>
                          <button className="ar-btn-approve" disabled={processingId === r.id || rowLocked} onClick={() => onDecision(r.id, "advisor_approved")}>
                            <ShieldCheck size={14} style={{ marginLeft: 4 }} /> {t("admin.advisorRegistration.approve")}
                          </button>
                          <button className="ar-btn-info" disabled={processingId === r.id || rowLocked} onClick={() => onDecision(r.id, "need_info")}>
                            <AlertTriangle size={14} style={{ marginLeft: 4 }} /> {t("admin.advisorRegistration.requestCompletion")}
                          </button>
                          <button className="ar-btn-reject" disabled={processingId === r.id || rowLocked} onClick={() => onDecision(r.id, "rejected")}>
                            <XCircle size={14} style={{ marginLeft: 4 }} /> {t("admin.advisorRegistration.reject")}
                          </button>
                          <button className="ar-btn-register" disabled={processingId === r.id || rowLocked} onClick={() => onRegister(r.id)}>
                            <CheckCircle size={14} style={{ marginLeft: 4 }} /> {t("admin.advisorRegistration.executeRegistration")}
                          </button>
                        </div>
                      </>
                    )}
                    {rowLocked && (
                      <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                        <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 700, color: "var(--ar-text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                          <Lock size={14} /> {isLockedReq(r) ? t("admin.advisorRegistration.requestLocked") : t("admin.advisorRegistration.cannotEditCurrentState")}
                        </p>
                        {canAct && ["advisor_approved", "registered"].includes(String(r?.status || "").toLowerCase()) && (
                          <button
                            className="ar-btn-info"
                            disabled={processingId === r.id}
                            onClick={() => onDecision(r.id, "need_info", r?.status)}
                            title={t("admin.advisorRegistration.returnForReview")}
                          >
                            <AlertTriangle size={14} style={{ marginLeft: 4 }} /> {t("admin.advisorRegistration.returnForReview")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
      {ToastEl}
    </div>
  );
}
