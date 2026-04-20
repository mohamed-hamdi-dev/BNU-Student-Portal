import React, { useState, useMemo, useContext, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CoursesContext } from "../context/CoursesContext";
import { SystemContext } from "../context/SystemContext";
import { BookOpen, Calendar, CheckCircle, AlertCircle, User, LogOut, Search, Clock, Plus, Monitor, GraduationCap, Trash2, X, Users, MapPin, Filter, Layers, Download, ChevronDown, Loader2 } from "lucide-react";
import { calculateSemesterGpa, getCurrentAcademicYear, normalizeAcademicYearValue, normalizeCourse, normalizeSemesterValue } from "../utils/academicData";
import {
    deleteMyRegistrationSelection,
    getMyRegistration,
    getMyStudentProfile,
    listMyAvailableOfferings,
    listMyAdvisorRequests,
    submitStudentRegistration,
} from "../services/advisorRegistrationApi";
import { getMyRegistrationCreditPolicy } from "../services/registrationPolicyApi";
import { getMyPaymentOverview } from "../services/paymentApi";
import { ensureArabicFont } from "../utils/pdfExportUsers";

const normalizeRequestStatus = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
const normalizeStudentIdentifier = (value) => String(value || "").trim();
const collectStudentIdentifiers = (...values) => {
    const keys = new Set();
    values.forEach((value) => {
        const normalized = normalizeStudentIdentifier(value);
        if (normalized) keys.add(normalized);
    });
    return keys;
};

const SCHEDULE_PALETTE = [
    { surface: "bg-sky-50", border: "border-sky-200", chip: "bg-sky-100 text-sky-800", accent: "text-sky-900", meta: "text-sky-700", pdfFill: [240, 249, 255], pdfText: [12, 74, 110], pdfBorder: [186, 230, 253] },
    { surface: "bg-indigo-50", border: "border-indigo-200", chip: "bg-indigo-100 text-indigo-800", accent: "text-indigo-900", meta: "text-indigo-700", pdfFill: [238, 242, 255], pdfText: [55, 48, 163], pdfBorder: [199, 210, 254] },
    { surface: "bg-emerald-50", border: "border-emerald-200", chip: "bg-emerald-100 text-emerald-800", accent: "text-emerald-900", meta: "text-emerald-700", pdfFill: [236, 253, 245], pdfText: [6, 95, 70], pdfBorder: [167, 243, 208] },
    { surface: "bg-amber-50", border: "border-amber-200", chip: "bg-amber-100 text-amber-800", accent: "text-amber-900", meta: "text-amber-700", pdfFill: [255, 251, 235], pdfText: [146, 64, 14], pdfBorder: [253, 230, 138] },
    { surface: "bg-rose-50", border: "border-rose-200", chip: "bg-rose-100 text-rose-800", accent: "text-rose-900", meta: "text-rose-700", pdfFill: [255, 241, 242], pdfText: [136, 19, 55], pdfBorder: [254, 205, 211] },
    { surface: "bg-violet-50", border: "border-violet-200", chip: "bg-violet-100 text-violet-800", accent: "text-violet-900", meta: "text-violet-700", pdfFill: [245, 243, 255], pdfText: [91, 33, 182], pdfBorder: [221, 214, 254] },
    { surface: "bg-cyan-50", border: "border-cyan-200", chip: "bg-cyan-100 text-cyan-800", accent: "text-cyan-900", meta: "text-cyan-700", pdfFill: [236, 254, 255], pdfText: [21, 94, 117], pdfBorder: [165, 243, 252] },
    { surface: "bg-teal-50", border: "border-teal-200", chip: "bg-teal-100 text-teal-800", accent: "text-teal-900", meta: "text-teal-700", pdfFill: [240, 253, 250], pdfText: [17, 94, 89], pdfBorder: [153, 246, 228] },
];

const LECTURE_PALETTE = {
    surface: "bg-amber-50",
    border: "border-amber-200",
    chip: "bg-amber-100 text-amber-800",
    accent: "text-amber-900",
    meta: "text-amber-700",
    pdfFill: [255, 251, 235],
    pdfText: [146, 64, 14],
    pdfBorder: [253, 230, 138],
};

const LAB_PALETTE = {
    surface: "bg-emerald-50",
    border: "border-emerald-200",
    chip: "bg-emerald-100 text-emerald-800",
    accent: "text-emerald-900",
    meta: "text-emerald-700",
    pdfFill: [236, 253, 245],
    pdfText: [6, 95, 70],
    pdfBorder: [167, 243, 208],
};

const hashScheduleKey = (value) =>
    String(value || "")
        .split("")
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);

const getSchedulePalette = (value) => SCHEDULE_PALETTE[hashScheduleKey(value) % SCHEDULE_PALETTE.length];


const App = () => {
    const { t } = useTranslation("global");
    const showAlert = (message, type = "warning") =>
        Swal.fire({
            icon: type,
            text: String(message || ""),
            confirmButtonText: "OK",
            didOpen: (el) => {
                el.style.direction = "rtl";
                el.style.textAlign = "right";
            },
        });
    const confirmDeleteAlert = async (message) => {
        const result = await Swal.fire({
            title: "تأكيد الحذف",
            text: String(message || "هل أنت متأكد من حذف هذه المادة؟"),
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "حذف",
            cancelButtonText: "إلغاء",
            buttonsStyling: false,
            background: "#0f1720",
            color: "#e7f9f7",
            customClass: {
                popup: "rounded-3xl border border-[#1f3640]",
                confirmButton: "px-5 py-2.5 rounded-full font-bold text-slate-900 bg-[#79e6df] border-2 border-[#79e6df] mx-1",
                cancelButton: "px-5 py-2.5 rounded-full font-bold text-[#d7f6f2] bg-[#0e7f79] border border-[#0e7f79] mx-1",
            },
            didOpen: (el) => {
                el.style.direction = "rtl";
                el.style.textAlign = "right";
            },
        });
        return Boolean(result?.isConfirmed);
    };
    const [activeTab, setActiveTab] = useState("registration");
    const [selectedCourseForGroups, setSelectedCourseForGroups] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedYear, setSelectedYear] = useState("all");
    const [submittingToAdvisor, setSubmittingToAdvisor] = useState(false);
    const [termRequestStatus, setTermRequestStatus] = useState("");
    const [expandedMobileCourseKey, setExpandedMobileCourseKey] = useState(null);
    const [deletingCourseCode, setDeletingCourseCode] = useState("");
    const [withdrawingAll, setWithdrawingAll] = useState(false);
    const hydratedTermKeyRef = useRef("");
    const suppressHydrationUntilRef = useRef(0);
    const missingScheduleRetryRef = useRef("");
    const [availableOfferings, setAvailableOfferings] = useState([]);
    const [availableOfferingsLoaded, setAvailableOfferingsLoaded] = useState(false);
    const [paymentUnlocked, setPaymentUnlocked] = useState(false);
    const [paymentLoading, setPaymentLoading] = useState(true);
    const [paymentDueAmount, setPaymentDueAmount] = useState(0);
    /** Fresh GPA / passed hours from academic-core (keeps student view in sync after advisor edits). */
    const [serverProfileMetrics, setServerProfileMetrics] = useState(null);

    const { selectedCourses, setSelectedCourses, addSelectedCourse, removeSelectedCourse } = useContext(CoursesContext);
    const { registrationOpen, openSemester, years, registrationSettings, getAvailableCoursesForStudent, upsertPreliminaryAcademicRecord, removePreliminaryAcademicRecord, academicRecords = [] } = useContext(SystemContext);

    const refreshStudentProfileMetrics = useCallback(async () => {
        try {
            const p = await getMyStudentProfile();
            const gpa = Number(p?.gpa ?? 0);
            const passed = Number(p?.passed_hours ?? 0);
            setServerProfileMetrics({ gpa, passed_hours: passed });
            try {
                const raw = JSON.parse(localStorage.getItem("loggedUser") || "{}");
                const next = { ...raw, gpa, completedHours: passed };
                localStorage.setItem("loggedUser", JSON.stringify(next));
                window.dispatchEvent(new Event("loggedUserUpdated"));
            } catch {
                /* ignore */
            }
        } catch {
            setServerProfileMetrics(null);
        }
    }, []);

    useEffect(() => {
        void refreshStudentProfileMetrics();
    }, [refreshStudentProfileMetrics]);

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === "visible") void refreshStudentProfileMetrics();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [refreshStudentProfileMetrics]);

    const studentInfo = useMemo(() => {
        const saved = localStorage.getItem("loggedUser");
        const data = saved ? JSON.parse(saved) : {};
        let gpa = Number(data?.gpa || 0);
        let completedHours = Number(data?.completedHours || 0);
        if (serverProfileMetrics && Number.isFinite(serverProfileMetrics.gpa)) {
            gpa = Number(serverProfileMetrics.gpa);
            completedHours = Number(serverProfileMetrics.passed_hours ?? completedHours);
        }
        return {
            name: data?.name || data?.NameID || t("academic_reg_student_default"),
            id: data?.studentId || data?.studentCode || data?.student_code || data?.username || "-",
            gpa,
            completedHours,
            major: data?.major || t("academic_reg_major_default"),
            academicYear: normalizeAcademicYearValue(data?.academicYear || data?.year || data?.level, registrationSettings?.activeAcademicYear || "1"),
            maxHours: Number(data?.maxHours || 18),
        };
    }, [registrationSettings?.activeAcademicYear, t, serverProfileMetrics]);
    const studentIdentifiers = useMemo(() => {
        const saved = localStorage.getItem("loggedUser");
        const data = saved ? JSON.parse(saved) : {};
        return collectStudentIdentifiers(
            data?.studentId,
            data?.student_id,
            data?.studentCode,
            data?.student_code,
            data?.username,
            data?.id
        );
    }, []);
    const fallbackCompletedRecords = useMemo(() => {
        if (!studentIdentifiers.size) return [];
        return (Array.isArray(academicRecords) ? academicRecords : []).filter((record) => {
            const recordStudentId = normalizeStudentIdentifier(record?.studentId || record?.student_id || record?.studentCode || record?.student_code || record?.username);
            if (!studentIdentifiers.has(recordStudentId)) return false;
            const grade = String(record?.grade || "").trim().toUpperCase();
            const status = String(record?.status || "").trim().toLowerCase();
            return Boolean(grade) || status === "graded" || status === "completed" || status === "مكتمل";
        });
    }, [academicRecords, studentIdentifiers]);
    const fallbackCompletedHours = useMemo(
        () =>
            fallbackCompletedRecords.reduce((sum, record) => {
                const grade = String(record?.grade || "").trim().toUpperCase();
                const credits = Number(record?.credits ?? record?.hours ?? 0) || 0;
                if (!credits) return sum;
                if (!grade || grade === "F") return sum;
                return sum + credits;
            }, 0),
        [fallbackCompletedRecords]
    );
    const fallbackCumulativeGpa = useMemo(() => calculateSemesterGpa(fallbackCompletedRecords), [fallbackCompletedRecords]);
    const effectiveCumulativeGpa = useMemo(() => {
        const serverGpa = Number(studentInfo.gpa || 0);
        if (serverGpa > 0) return serverGpa;
        return fallbackCumulativeGpa;
    }, [fallbackCumulativeGpa, studentInfo.gpa]);
    const effectiveCompletedHours = useMemo(() => {
        const serverHours = Number(studentInfo.completedHours || 0);
        if (serverHours > 0) return serverHours;
        return fallbackCompletedHours;
    }, [fallbackCompletedHours, studentInfo.completedHours]);
    const [policyHoursLimit, setPolicyHoursLimit] = useState(null);

    useEffect(() => {
        let active = true;
        const loadPolicyHours = async () => {
            try {
                const data = await getMyRegistrationCreditPolicy();
                const max = Number(data?.allowed_credit_hours?.max);
                const min = Number(data?.allowed_credit_hours?.min);
                if (!active) return;
                if (Number.isFinite(max) && max > 0) {
                    setPolicyHoursLimit({
                        max,
                        min: Number.isFinite(min) && min >= 0 ? min : 0,
                    });
                } else {
                    setPolicyHoursLimit(null);
                }
            } catch {
                if (active) setPolicyHoursLimit(null);
            }
        };
        loadPolicyHours();
        return () => {
            active = false;
        };
    }, []);

    const fallbackMaxHoursByGpa = useMemo(() => {
        const gpa = Number(studentInfo?.gpa || 0);
        if (gpa >= 3) return 21;
        if (gpa >= 2) return 18;
        return 12;
    }, [studentInfo?.gpa]);
    const fallbackMinHoursByGpa = useMemo(() => {
        const gpa = Number(studentInfo?.gpa || 0);
        if (gpa >= 3) return 18;
        if (gpa >= 2) return 12;
        return 9;
    }, [studentInfo?.gpa]);
    const effectiveMaxHours = Number(policyHoursLimit?.max || fallbackMaxHoursByGpa || studentInfo.maxHours || 18);
    const effectiveMinHours = Number((policyHoursLimit?.min ?? 0) > 0 ? policyHoursLimit.min : fallbackMinHoursByGpa);
    const scheduleDayMeta = useMemo(
        () => [
            { key: "sunday", ar: "الأحد", en: "Sunday", label: t("academic_reg_day_sunday") },
            { key: "monday", ar: "الاثنين", en: "Monday", label: t("academic_reg_day_monday") },
            { key: "tuesday", ar: "الثلاثاء", en: "Tuesday", label: t("academic_reg_day_tuesday") },
            { key: "wednesday", ar: "الأربعاء", en: "Wednesday", label: t("academic_reg_day_wednesday") },
            { key: "thursday", ar: "الخميس", en: "Thursday", label: t("academic_reg_day_thursday") },
            { key: "friday", ar: "الجمعة", en: "Friday", label: "Friday" },
            { key: "saturday", ar: "السبت", en: "Saturday", label: "Saturday" },
        ],
        [t]
    );
    const timeSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
    const academicYearLabel = useMemo(() => String(getCurrentAcademicYear() || ""), []);
    const openSemesterMeta = useMemo(() => {
        const key = String(openSemester || "").trim().toLowerCase();
        if (key === "autumn" || key === "fall") return { ar: "الخريف", en: "Autumn" };
        if (key === "spring") return { ar: "الربيع", en: "Spring" };
        if (key === "summer") return { ar: "الصيف", en: "Summer" };
        return { ar: "غير محدد", en: "Not set" };
    }, [openSemester]);
    const openSemesterLabel = openSemesterMeta.ar;
    const normalizedOpenSemester = useMemo(() => normalizeSemesterValue(openSemester, ""), [openSemester]);
    const isCurrentSemester = (semesterValue) => normalizeSemesterValue(semesterValue, "") === normalizedOpenSemester;
    const academicYears = useMemo(() => [{ id: "all", name: t("academic_reg_all_years") }, ...(years || []).map((y) => ({ id: y.id, name: y.name }))], [t, years]);
    const courses = useMemo(() => getAvailableCoursesForStudent(studentInfo).map((course) => normalizeCourse(course)), [getAvailableCoursesForStudent, studentInfo]);
    useEffect(() => {
        let active = true;
        const loadAvailableOfferings = async () => {
            if (!openSemester) {
                if (active) {
                    setAvailableOfferings([]);
                    setAvailableOfferingsLoaded(false);
                }
                return;
            }
            try {
                const available = await listMyAvailableOfferings(String(getCurrentAcademicYear() || ""), openSemester);
                if (!active) return;
                setAvailableOfferings(Array.isArray(available?.items) ? available.items : []);
                setAvailableOfferingsLoaded(true);
            } catch {
                if (!active) return;
                setAvailableOfferings([]);
                setAvailableOfferingsLoaded(false);
            }
        };
        void loadAvailableOfferings();
        return () => {
            active = false;
        };
    }, [openSemester]);
    const totalRegisteredHours = useMemo(() => {
        return selectedCourses
            .filter((course) => isCurrentSemester(course?.semester))
            .reduce((sum, course) => sum + Number(course.hours || course.credits || 0), 0);
    }, [selectedCourses, normalizedOpenSemester]);
    const currentSemesterSelectedCourses = useMemo(
        () => selectedCourses.filter((course) => isCurrentSemester(course?.semester)),
        [selectedCourses, normalizedOpenSemester]
    );
    const currentSemesterSelectedCourseMap = useMemo(
        () =>
            new Map(
                currentSemesterSelectedCourses.map((course) => [
                    String(course?.id || course?.code || ""),
                    course,
                ])
            ),
        [currentSemesterSelectedCourses]
    );
    const currentSemesterSelectedCourseIds = useMemo(
        () => new Set(currentSemesterSelectedCourses.map((course) => String(course?.id || course?.code || ""))),
        [currentSemesterSelectedCourses]
    );
    const backendSelectionCourses = useMemo(
        () => currentSemesterSelectedCourses.filter((course) => String(course?.scheduleSource || "").trim().toLowerCase() === "backend_selection"),
        [currentSemesterSelectedCourses]
    );
    const scheduledSelectionCourses = useMemo(
        () => backendSelectionCourses.filter((course) => Boolean(course?.hasBackendSchedule)),
        [backendSelectionCourses]
    );
    const unscheduledSelectionCourses = useMemo(
        () => backendSelectionCourses.filter((course) => !course?.hasBackendSchedule),
        [backendSelectionCourses]
    );
    const effectiveUnscheduledSelectionCourses = useMemo(() => {
        const scheduledCodes = new Set(
            scheduledSelectionCourses
                .map((course) => String(course?.id || course?.code || "").trim().toUpperCase())
                .filter(Boolean)
        );
        return unscheduledSelectionCourses.filter((course) => {
            const code = String(course?.id || course?.code || "").trim().toUpperCase();
            if (!code) return true;
            return !scheduledCodes.has(code);
        });
    }, [scheduledSelectionCourses, unscheduledSelectionCourses]);
    const availableCourseIds = useMemo(
        () => new Set(courses.map((course) => String(course?.id || course?.code || "").trim().toUpperCase()).filter(Boolean)),
        [courses]
    );
    const availableOfferingCourseIds = useMemo(
        () =>
            new Set(
                (Array.isArray(availableOfferings) ? availableOfferings : [])
                    .map((item) => String(item?.course_code || "").trim().toUpperCase())
                    .filter(Boolean)
            ),
        [availableOfferings]
    );
    const getSelectedCourseForCurrentSemester = (courseId) => currentSemesterSelectedCourseMap.get(String(courseId || ""));

    useEffect(() => {
        if (!normalizedOpenSemester) return;
        const lockedStatuses = new Set(["advisor_approved", "registered", "approved", "locked"]);
        setSelectedCourses((prev) => {
            const current = Array.isArray(prev) ? prev : [];
            let changed = false;
            const next = current.filter((item) => {
                if (!isCurrentSemester(item?.semester)) return true;
                const itemStatus = normalizeRequestStatus(item?.status);
                if (lockedStatuses.has(itemStatus)) return true;
                const itemCode = String(item?.id || item?.code || "").trim().toUpperCase();
                const keep = itemCode && availableCourseIds.has(itemCode);
                if (!keep) changed = true;
                return keep;
            });
            return changed ? next : prev;
        });
    }, [normalizedOpenSemester, availableCourseIds, setSelectedCourses]);

    const handleRegisterClick = async (course) => {
        if (!registrationOpen || course.status === "locked") return;
        if (totalRegisteredHours + Number(course.hours || 0) > effectiveMaxHours) {
            showAlert(t("academic_reg_max_hours_exceeded"), "warning");
            return;
        }
        const normalizeCode = (value) =>
            String(value || "")
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9\u0600-\u06FF]/g, "");
        const courseCode = normalizeCode(course?.code || course?.id);
        if (!courseCode) {
            showAlert("تعذر تحديد كود المادة لتحميل السكاشن المتاحة.", "error");
            return;
        }
        try {
            const academicYearLabel = String(getCurrentAcademicYear() || "");
            const available = await listMyAvailableOfferings(academicYearLabel, openSemester);
            const offerings = Array.isArray(available?.items) ? available.items : [];
            const matchedGroups = offerings
                .filter((item) => normalizeCode(item?.course_code) === courseCode)
                .map((item) => ({
                    id: String(item?.section || item?.offering_id || ""),
                    name: String(item?.section || "-"),
                    section: String(item?.section || ""),
                    day: String(item?.day_of_week || ""),
                    time: `${String(item?.start_time || "")} - ${String(item?.end_time || "")}`.trim(),
                    hall: String(item?.room_name || ""),
                    capacity: Number(item?.available_seats ?? item?.capacity ?? 0),
                    full: !Boolean(item?.is_open),
                    offering_id: Number(item?.offering_id || 0) || undefined,
                    offeringId: Number(item?.offering_id || 0) || undefined,
                }));
            if (!matchedGroups.length) {
                showAlert("لا توجد سكاشن متاحة حاليًا لهذه المادة في هذا الترم.", "warning");
                return;
            }
            setSelectedCourseForGroups({
                ...course,
                groups: matchedGroups,
            });
        } catch (error) {
            showAlert(String(error?.message || "تعذر تحميل السكاشن المتاحة من السيرفر."), "error");
        }
    };

    const confirmRegistration = (course, group) => {
        if (group.full) return;
        const registrationResult = addSelectedCourse({ ...course, selectedGroup: group, semester: openSemester, status: "draft" });
        if (!registrationResult?.ok) {
            showAlert(registrationResult?.error || "تعذر تسجيل المادة المختارة.", "error");
            return;
        }
        const preliminaryResult = upsertPreliminaryAcademicRecord({
            studentId: studentInfo.id,
            studentName: studentInfo.name,
            course,
            semester: openSemester,
            academicYear: getCurrentAcademicYear(),
            year: course.year,
            lecture: course.lecture,
            selectedGroup: group,
        });
        if (!preliminaryResult?.ok) {
            removeSelectedCourse(course.id, openSemester);
            showAlert(preliminaryResult?.error || "تعذر حفظ بيانات التسجيل المبدئية.", "error");
            return;
        }
        setSelectedCourseForGroups(null);
    };

    const removeCourse = async (courseId) => {
        const current = getSelectedCourseForCurrentSemester(courseId);
        const lockedStatuses = new Set(["advisor_approved", "registered", "approved", "locked"]);
        const normalizedStatus = normalizeRequestStatus(current?.status);
        if (lockedStatuses.has(normalizedStatus) || isSelectionEditLocked) {
            showAlert("لا يمكن حذف هذه المادة بعد إرسالها إلى المرشد/التنفيذ. راجع حالة الطلب الحالية.", "info");
            return;
        }
        const courseCode = String(current?.id || current?.code || courseId || "").trim();
        if (!courseCode) {
            showAlert("تعذر تحديد كود المادة للحذف.", "error");
            return;
        }
        try {
            const result = await deleteMyRegistrationSelection({
                academic_year_label: String(getCurrentAcademicYear()),
                semester: openSemester,
                course_code: courseCode,
                student_id_hint: String(studentInfo?.id || "").trim(),
            });
            console.info("[registration.delete] response", {
                academic_year_label: String(getCurrentAcademicYear()),
                semester: openSemester,
                course_code: courseCode,
                result,
            });
            const reason = String(result?.reason || "").trim().toLowerCase();
            const deleted = Boolean(result?.deleted);
            if (!deleted) {
                // If backend cannot find the selection row, treat local row as stale ghost data
                // and reconcile UI with authoritative backend snapshot.
                if (reason === "selection_not_found" || reason === "request_not_found") {
                    removeSelectedCourse(courseCode, openSemester);
                    removePreliminaryAcademicRecord({ studentId: studentInfo.id, code: courseCode, semester: openSemester });
                    suppressHydrationUntilRef.current = 0;
                    hydratedTermKeyRef.current = "";
                    await hydrateSelectionsFromBackend();
                    showAlert("المادة لم تكن موجودة على السيرفر (بيانات محلية قديمة). تم تنظيف الواجهة وإعادة المزامنة.", "info");
                    return;
                }
                showAlert(`Server did not delete this course (reason: ${reason || "unknown"}).`, "error");
                return;
            }
            setTermRequestStatus(normalizeRequestStatus(result?.request?.status || ""));
        } catch (err) {
            showAlert(String(err?.message || "تعذر حذف المادة من طلب التسجيل الحالي."), "error");
            return;
        }
        removeSelectedCourse(courseCode, openSemester);
        removePreliminaryAcademicRecord({ studentId: studentInfo.id, code: courseCode, semester: openSemester });
        // Force immediate server sync to confirm deletion state for current term.
        suppressHydrationUntilRef.current = 0;
        hydratedTermKeyRef.current = "";
        await hydrateSelectionsFromBackend();
    };

    const confirmAndRemoveCourse = async (course) => {
        const courseCode = String(course?.id || course?.code || "").trim();
        if (!courseCode || deletingCourseCode === courseCode) return;
        const confirmed = await confirmDeleteAlert("هل أنت متأكد من حذف هذه المادة؟");
        if (!confirmed) return;
        setDeletingCourseCode(courseCode);
        try {
            await removeCourse(courseCode);
        } finally {
            setDeletingCourseCode("");
        }
    };

    const getTermRequestStatusLabel = (status) => {
        const key = normalizeRequestStatus(status);
        if (!key) return "";
        if (key === "advisor_requested" || key === "submitted") return "تم الإرسال للمرشد";
        if (key === "advisor_approved") return "وافق المرشد";
        if (key === "registered") return "تم التنفيذ";
        if (key === "approved") return "معتمد";
        if (key === "locked") return "مغلق";
        if (key === "need_info") return "يحتاج استكمال";
        if (key === "rejected") return "مرفوض";
        if (key === "draft") return "مسودة";
        return key;
    };

    const getTermRequestTone = (status) => {
        const key = normalizeRequestStatus(status);
        if (key === "advisor_requested" || key === "submitted") return "bg-indigo-50 text-indigo-700 border-indigo-200";
        if (key === "advisor_approved") return "bg-cyan-50 text-cyan-700 border-cyan-200";
        if (key === "registered" || key === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
        if (key === "locked") return "bg-slate-100 text-slate-700 border-slate-300";
        if (key === "need_info") return "bg-amber-50 text-amber-700 border-amber-200";
        if (key === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
        return "bg-slate-50 text-slate-700 border-slate-200";
    };

    const syncCurrentSemesterStatus = (nextStatus) => {
        const normalized = normalizeRequestStatus(nextStatus);
        if (!normalized || !openSemester) return;
        const mapped =
            normalized === "registered" || normalized === "advisor_approved" || normalized === "approved" || normalized === "locked"
                ? "registered"
                : normalized === "rejected"
                ? "rejected"
                : normalized === "need_info"
                ? "need_info"
                : "pending_advisor";
        setSelectedCourses((prev) => {
            let changed = false;
            const next = (Array.isArray(prev) ? prev : []).map((item) => {
                if (!isCurrentSemester(item?.semester)) return item;
                if (String(item?.status || "").toLowerCase() === mapped) return item;
                changed = true;
                return { ...item, status: mapped };
            });
            return changed ? next : prev;
        });
    };

    const loadTermRequestStatus = async () => {
        try {
            const academicYearLabel = String(getCurrentAcademicYear());
            const res = await listMyAdvisorRequests({
                academic_year_label: academicYearLabel,
                semester: openSemester,
            });
            const items = Array.isArray(res?.items) ? res.items : [];
            if (!items.length) {
                setTermRequestStatus("");
                return;
            }
            const latest = [...items].sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0];
            const latestStatus = normalizeRequestStatus(latest?.status);
            setTermRequestStatus(latestStatus);
            syncCurrentSemesterStatus(latestStatus);
        } catch {
            setTermRequestStatus("");
        }
    };

    const hydrateSelectionsFromBackend = async () => {
        try {
            // Skip hydration if a recent delete is still being processed
            if (Date.now() < suppressHydrationUntilRef.current) return;
            if (!openSemester) return;
            if (!Array.isArray(courses) || courses.length === 0) return;
            const academicYearLabel = String(getCurrentAcademicYear());
            const hydrateKey = `${academicYearLabel}__${String(openSemester || "")}`;
            if (hydratedTermKeyRef.current === hydrateKey) return;
            const res = await getMyRegistration(academicYearLabel, openSemester);
            // Double-check suppression after async call
            if (Date.now() < suppressHydrationUntilRef.current) return;
            console.info("[registration.hydrate] fetched", {
                academic_year_label: academicYearLabel,
                semester: openSemester,
                request_status: normalizeRequestStatus(res?.request?.status),
                selections_count: Array.isArray(res?.selections) ? res.selections.length : 0,
                source: res?.source || "core",
                selections: Array.isArray(res?.selections)
                    ? res.selections.map((row) => ({
                          offering_id: row?.offering_id,
                          course_code: row?.course_code,
                          section: row?.section,
                          day_of_week: row?.day_of_week,
                          start_time: row?.start_time,
                          end_time: row?.end_time,
                      }))
                    : [],
            });
            const source = String(res?.source || "").trim().toLowerCase();
            if (source === "legacy") {
                setSelectedCourses((prev) => {
                    const current = Array.isArray(prev) ? prev : [];
                    const next = current.filter((item) => !isCurrentSemester(item?.semester));
                    return next.length === current.length ? prev : next;
                });
                hydratedTermKeyRef.current = hydrateKey;
                return;
            }
            const requestStatus = normalizeRequestStatus(res?.request?.status);
            if (requestStatus) {
                setTermRequestStatus(requestStatus);
                syncCurrentSemesterStatus(requestStatus);
            }
            const selections = Array.isArray(res?.selections) ? res.selections : [];
            if (!selections.length) {
                setSelectedCourses((prev) => {
                    const current = Array.isArray(prev) ? prev : [];
                    const next = current.filter((item) => !isCurrentSemester(item?.semester));
                    return next.length === current.length ? prev : next;
                });
                hydratedTermKeyRef.current = hydrateKey;
                return;
            }

            const byCode = new Map();
            courses.forEach((course) => {
                const key = String(course?.id || course?.code || "").trim().toUpperCase();
                if (key) byCode.set(key, course);
            });
            const currentByCode = new Map();
            currentSemesterSelectedCourses.forEach((course) => {
                const key = String(course?.id || course?.code || "").trim().toUpperCase();
                if (key) currentByCode.set(key, course);
            });

            const sessionHasParsableWindow = (session) => {
                if (!session || typeof session !== "object") return false;
                if (!normalizeDayToken(String(session.day || ""))) return false;
                const { startHour } = parseSessionRangeHours(session);
                return startHour !== null;
            };

            const mapped = selections
                .map((sel) => {
                    const code = String(sel?.course_code || "").trim().toUpperCase();
                    const base = byCode.get(code);
                    if (!base) return null;
                    const currentSnapshot = currentByCode.get(code);
                    const sectionToken = String(sel?.section || "").trim().toUpperCase();
                    const matchedGroup = (base.groups || []).find((g) => String(g?.name || g?.section || g?.id || "").toUpperCase().includes(sectionToken));
                    const pickedGroup =
                        matchedGroup ||
                        (base.groups || []).find((g) => String(g?.section || "").trim().toUpperCase() === sectionToken) ||
                        null;
                    const hasOfferingSchedule = Boolean(
                        String(sel?.day_of_week || "").trim() &&
                        String(sel?.start_time || "").trim() &&
                        String(sel?.end_time || "").trim()
                    );
                    const lectureLikeFromGroup = (groupRow) => {
                        if (!groupRow || typeof groupRow !== "object") return null;
                        const label = String(groupRow?.name || groupRow?.section || "").trim().toLowerCase();
                        const isLectureLike =
                            label.includes("lecture") ||
                            label.includes("lec") ||
                            label.includes("محاض") ||
                            label.includes("عام");
                        if (!isLectureLike) return null;
                        return {
                            day: groupRow?.day || "",
                            time: groupRow?.time || "",
                            start: groupRow?.start || "",
                            end: groupRow?.end || "",
                            hall: groupRow?.hall || groupRow?.room || "",
                        };
                    };
                    const candidateLectures = [
                        currentSnapshot?.lecture,
                        currentSnapshot?.lectureSession,
                        base?.lecture,
                        base?.lectureSession,
                        base?.mainLecture,
                        Array.isArray(base?.lectures) ? base.lectures[0] : null,
                        Array.isArray(currentSnapshot?.lectures) ? currentSnapshot.lectures[0] : null,
                        Array.isArray(base?.groups) ? base.groups.map(lectureLikeFromGroup).find(Boolean) : null,
                    ].filter((row) => row && typeof row === "object");
                    const pickLectureField = (field) => {
                        for (const candidate of candidateLectures) {
                            const value = String(candidate?.[field] || "").trim();
                            if (value) return value;
                        }
                        return "";
                    };
                    const hydratedLecture = {
                        day: pickLectureField("day"),
                        time: pickLectureField("time"),
                        start: pickLectureField("start"),
                        end: pickLectureField("end"),
                        hall: pickLectureField("hall"),
                    };
                    let hydratedGroup = pickedGroup
                        ? {
                              ...pickedGroup,
                              ...(hasOfferingSchedule
                                  ? {
                                        day: sel.day_of_week,
                                        time: `${sel.start_time} - ${sel.end_time}`,
                                        start: sel.start_time,
                                        end: sel.end_time,
                                        hall: String(sel.room_name || "").trim() || pickedGroup.hall || "",
                                    }
                                  : {}),
                          }
                        : null;
                    if (!hydratedGroup && sel?.section) {
                        hydratedGroup = {
                            id: sel.section,
                            name: sel.section,
                            section: sel.section,
                            ...(hasOfferingSchedule
                                ? {
                                      day: sel.day_of_week,
                                      time: `${sel.start_time} - ${sel.end_time}`,
                                      start: sel.start_time,
                                      end: sel.end_time,
                                      hall: sel.room_name || "",
                                  }
                                : {
                                      day: "",
                                      time: "",
                                      start: "",
                                      end: "",
                                      hall: "",
                                  }),
                        };
                    }

                    const hasDisplayableSchedule =
                        sessionHasParsableWindow(hydratedGroup) || sessionHasParsableWindow(hydratedLecture);
                    const offeringScheduleIncomplete = !hasOfferingSchedule;

                    return {
                        ...base,
                        lecture: hydratedLecture,
                        semester: normalizedOpenSemester || openSemester,
                        status:
                            requestStatus === "registered" || requestStatus === "approved" || requestStatus === "locked"
                                ? "registered"
                                : requestStatus === "advisor_approved"
                                ? "advisor_approved"
                                : requestStatus === "draft"
                                ? "draft"
                                : "pending_advisor",
                        offering_id: Number(sel?.offering_id || 0) || undefined,
                        isUnscheduledSelection: !hasDisplayableSchedule,
                        hasBackendSchedule: hasDisplayableSchedule,
                        offeringScheduleIncomplete,
                        scheduleSource: "backend_selection",
                        selectedGroup: hydratedGroup,
                    };
                })
                .filter(Boolean);
            console.info("[registration.hydrate] mapped_local_courses", {
                mapped_count: mapped.length,
                mapped: mapped.map((row) => ({
                    code: row?.id || row?.code,
                    semester: row?.semester,
                    group: row?.selectedGroup?.name || row?.selectedGroup?.section || null,
                    group_day: row?.selectedGroup?.day || null,
                    group_time: row?.selectedGroup?.time || null,
                    lecture_day: row?.lecture?.day || null,
                    lecture_time: row?.lecture?.time || null,
                    is_unscheduled_selection: Boolean(row?.isUnscheduledSelection),
                    status: row?.status || null,
                })),
            });

            if (!mapped.length) return;
            setSelectedCourses((prev) => {
                const current = Array.isArray(prev) ? prev : [];
                const others = current.filter((item) => !isCurrentSemester(item?.semester));
                return [...others, ...mapped];
            });
            hydratedTermKeyRef.current = hydrateKey;
        } catch {
            // Ignore hydration failures and keep current local state.
        }
    };

    useEffect(() => {
        if (!openSemester) return;
        loadTermRequestStatus();
        hydrateSelectionsFromBackend();
    }, [openSemester, courses.length]);

    useEffect(() => {
        let active = true;
        const loadPaymentGate = async () => {
            try {
                if (!openSemester) {
                    if (active) {
                        setPaymentUnlocked(false);
                        setPaymentLoading(false);
                        setPaymentDueAmount(0);
                    }
                    return;
                }
                setPaymentLoading(true);
                const overview = await getMyPaymentOverview(String(getCurrentAcademicYear()), openSemester);
                if (!active) return;
                const clearance = String(overview?.clearance?.clearance_status || "").toUpperCase();
                const orderPaymentStatus = String(overview?.order?.status || "").toUpperCase();
                const unlockStatus = String(overview?.order?.registration_unlock_status || "").toUpperCase();
                const dueAmount = Number(overview?.order?.amount_due || 0);
                setPaymentDueAmount(Number.isFinite(dueAmount) ? dueAmount : 0);
                const unlocked =
                    orderPaymentStatus === "PAID" ||
                    unlockStatus === "UNLOCKED" ||
                    clearance === "CLEARED";
                setPaymentUnlocked(unlocked);
            } catch {
                if (!active) return;
                setPaymentUnlocked(false);
                setPaymentDueAmount(0);
            } finally {
                if (active) setPaymentLoading(false);
            }
        };
        loadPaymentGate();
        return () => {
            active = false;
        };
    }, [openSemester]);

    /** After advisor approval / execution — no student edits. (Draft / sent to advisor / need_info / rejected stay editable; backend accepts re-submit while not finally locked.) */
    const isSelectionEditLocked = ["advisor_approved", "registered", "approved", "locked"].includes(normalizeRequestStatus(termRequestStatus));
    const isSubmitLockedByRequest = isSelectionEditLocked;

    const withdrawAllSelectionsForTerm = async () => {
        if (isSelectionEditLocked) {
            showAlert("لا يمكن مسح الاختيارات بعد اعتماد المرشد أو تنفيذ التسجيل لهذا الفصل.", "info");
            return;
        }
        if (!registrationOpen) {
            showAlert("فترة التسجيل غير مفتوحة.", "warning");
            return;
        }
        if (!currentSemesterSelectedCourses.length) return;
        const confirmed = await confirmDeleteAlert(
            "سيتم حذف جميع المواد المختارة لهذا الفصل من الطلب (على السيرفر ومحلياً). يمكنك بعد ذلك اختيار مواد جديدة وإرسال طلب جديد. هل تريد المتابعة؟"
        );
        if (!confirmed) return;
        setWithdrawingAll(true);
        try {
            const academicYearLabel = String(getCurrentAcademicYear());
            const rows = [...currentSemesterSelectedCourses];
            for (const course of rows) {
                const code = String(course?.id || course?.code || "").trim();
                if (!code) continue;
                try {
                    await deleteMyRegistrationSelection({
                        academic_year_label: academicYearLabel,
                        semester: openSemester,
                        course_code: code,
                        student_id_hint: String(studentInfo?.id || "").trim(),
                    });
                } catch {
                    // استمر؛ قد تكون المادة غير موجودة على السيرفر
                }
                removeSelectedCourse(code, openSemester);
                removePreliminaryAcademicRecord({ studentId: studentInfo.id, code, semester: openSemester });
            }
            suppressHydrationUntilRef.current = 0;
            hydratedTermKeyRef.current = "";
            await loadTermRequestStatus();
            await hydrateSelectionsFromBackend();
            showAlert("تم مسح جميع الاختيارات. يمكنك تسجيل المواد من جديد ثم الإرسال للمرشد.", "success");
        } catch (err) {
            showAlert(String(err?.message || "تعذر إكمال مسح جميع المواد."), "error");
        } finally {
            setWithdrawingAll(false);
        }
    };

    const submitSelectionToAdvisor = async () => {
        if (isSubmitLockedByRequest) {
            showAlert(`لا يمكن إرسال أو تعديل الطلب بعد اعتماد/تنفيذ التسجيل. الحالة: ${getTermRequestStatusLabel(termRequestStatus)}.`, "info");
            return;
        }
        if (!currentSemesterSelectedCourses.length) {
            showAlert(t("academic_reg_submit_none_selected"), "warning");
            return;
        }
        try {
            setSubmittingToAdvisor(true);
            const academicYearLabel = String(getCurrentAcademicYear());
            const available = await listMyAvailableOfferings(academicYearLabel, openSemester);
            const offerings = Array.isArray(available?.items) ? available.items : [];
            const normalizeText = (v) => String(v || "").trim().toLowerCase();
            const normalizeCode = (v) =>
                String(v || "")
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9\u0600-\u06ff]/g, "");
            const normalizeSectionToken = (v) =>
                String(v || "")
                    .trim()
                    .toLowerCase()
                    .replace(/\b(section|sec|\u0633\u0643\u0634\u0646|\u0634\u0639\u0628\u0629|\u0645\u062c\u0645\u0648\u0639\u0629)\b/g, "")
                    .replace(/[^a-z0-9]/g, "");

            const used = new Set();
            const offeringIds = [];
            const unresolvedCourses = [];
            const selectionContext = [];

            currentSemesterSelectedCourses.forEach((course) => {
                const selectedSectionRaw = String(
                    course?.selectedGroup?.section || course?.selectedGroup?.name || course?.selectedGroup?.id || ""
                ).trim();
                selectionContext.push({
                    course_code: String(course?.code || course?.id || "").trim().toUpperCase(),
                    selected_section: selectedSectionRaw,
                });
                const directOfferingId = Number(course?.offering_id || course?.offeringId || course?.selectedGroup?.offering_id || course?.selectedGroup?.offeringId);
                if (Number.isFinite(directOfferingId) && directOfferingId > 0) {
                    if (!offeringIds.includes(directOfferingId)) offeringIds.push(directOfferingId);
                    return;
                }

                const code = normalizeCode(course?.code || course?.id);
                const selectedSection = normalizeSectionToken(selectedSectionRaw);
                const candidates = offerings.filter((item, idx) => {
                    if (used.has(idx)) return false;
                    return normalizeCode(item?.course_code) === code;
                });
                if (!candidates.length) {
                    unresolvedCourses.push({
                        courseCode: String(course?.code || course?.id || "").trim().toUpperCase(),
                        courseName: course?.name || course?.code || course?.id || "مقرر غير معروف",
                        selectedSection: course?.selectedGroup?.section || course?.selectedGroup?.name || "-",
                        availableSections: [],
                        reason: "not_offered",
                    });
                    return;
                }
                const sectionMatched = selectedSection
                    ? candidates.find((item) => normalizeSectionToken(item?.section) === selectedSection)
                    : null;
                let chosen = null;
                if (sectionMatched) {
                    chosen = sectionMatched;
                } else {
                    unresolvedCourses.push({
                        courseCode: String(course?.code || course?.id || "").trim().toUpperCase(),
                        courseName: course?.name || course?.code || course?.id || "مقرر غير معروف",
                        selectedSection: course?.selectedGroup?.section || course?.selectedGroup?.name || "-",
                        availableSections: candidates.map((c) => String(c?.section || "-")).filter(Boolean),
                        reason: "section_unavailable",
                    });
                    return;
                }
                const chosenIdx = offerings.indexOf(chosen);
                if (chosenIdx >= 0) used.add(chosenIdx);
                const oid = Number(chosen?.offering_id);
                if (Number.isFinite(oid)) offeringIds.push(oid);
            });

            if (unresolvedCourses.length) {
                const detailsRows = unresolvedCourses.map((item) => {
                    const available = Array.isArray(item?.availableSections) && item.availableSections.length
                        ? item.availableSections.join(" / ")
                        : "لا توجد سكاشن متاحة";
                    return {
                        courseCode: String(item?.courseCode || "").trim().toUpperCase(),
                        courseName: String(item?.courseName || "-"),
                        selectedSection: String(item?.selectedSection || "-"),
                        availableSections: available,
                    };
                });
                const detailsHtml = `
                    <div style="text-align:right;direction:rtl;line-height:1.9">
                        <div style="margin-bottom:8px">تم العثور على اختلاف بين السكاشن المختارة والسكاشن المتاحة حاليًا:</div>
                        <ul style="margin:0;padding-inline-start:18px">
                            ${detailsRows
                                .map(
                                    (row) =>
                                        `<li><b>${row.courseName}</b> | السكشن المختار: ${row.selectedSection} | السكاشن المتاحة: ${row.availableSections}</li>`
                                )
                                .join("")}
                        </ul>
                        <div style="margin-top:10px">قد تكون هذه بيانات محلية قديمة. هل تريد إعادة مزامنة اختيارات هذا الترم من السيرفر؟</div>
                    </div>
                `;
                const syncPrompt = await Swal.fire({
                    icon: "warning",
                    title: "تعذر مطابقة بعض المواد مع السكاشن المتاحة",
                    html: detailsHtml,
                    showCancelButton: true,
                    confirmButtonText: "إعادة مزامنة اختيارات هذا الترم",
                    cancelButtonText: "إغلاق",
                    didOpen: (el) => {
                        el.style.direction = "rtl";
                        el.style.textAlign = "right";
                    },
                });
                if (syncPrompt?.isConfirmed) {
                    const unresolvedCodes = Array.from(
                        new Set(detailsRows.map((row) => String(row?.courseCode || "").trim().toUpperCase()).filter(Boolean))
                    );
                    for (const code of unresolvedCodes) {
                        try {
                            await deleteMyRegistrationSelection({
                                academic_year_label: String(getCurrentAcademicYear()),
                                semester: openSemester,
                                course_code: code,
                                student_id_hint: String(studentInfo?.id || "").trim(),
                            });
                        } catch {
                            // Continue cleanup even if one stale row is already missing.
                        }
                    }
                    setSelectedCourses((prev) => {
                        const current = Array.isArray(prev) ? prev : [];
                        return current.filter((item) => !isCurrentSemester(item?.semester));
                    });
                    suppressHydrationUntilRef.current = 0;
                    hydratedTermKeyRef.current = "";
                    await hydrateSelectionsFromBackend();
                    await loadTermRequestStatus();
                }
                return;
            }

            if (!offeringIds.length) {
                showAlert(t("academic_reg_submit_mapping_failed"), "error");
                return;
            }

            const uniqueOfferingIds = Array.from(new Set(offeringIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));

            await submitStudentRegistration({
                academic_year_label: academicYearLabel,
                semester: openSemester,
                offering_ids: uniqueOfferingIds,
                selection_context: selectionContext,
            });

            setSelectedCourses((prev) =>
                (Array.isArray(prev) ? prev : []).map((item) =>
                    isCurrentSemester(item?.semester)
                        ? { ...item, status: "pending_advisor" }
                        : item
                )
            );

            showAlert(t("academic_reg_submit_success"), "success");
            setTermRequestStatus("advisor_requested");
            await loadTermRequestStatus();
        } catch (error) {
            const rawMessage = String(error?.message || "");
            const errorDetail = error?.detail && typeof error.detail === "object" ? error.detail : null;
            if (errorDetail?.error === "section_unavailable") {
                const unavailableCourseCode = String(errorDetail?.course_code || "").trim();
                const unavailableSelectedSection = String(errorDetail?.selected_section || "").trim();
                const unavailableSections = Array.isArray(errorDetail?.available_sections)
                    ? errorDetail.available_sections.map((row) => String(row || "").trim()).filter(Boolean)
                    : [];
                const unavailableSectionsText = unavailableSections.length ? unavailableSections.join(" / ") : "لا توجد سكاشن متاحة";
                const syncPrompt = await Swal.fire({
                    icon: "warning",
                    title: "السكشن المختار لم يعد متاحًا",
                    html: `
                        <div style="text-align:right;direction:rtl;line-height:1.8">
                            <div>المادة: <b>${unavailableCourseCode || "-"}</b></div>
                            <div>السكشن المختار: <b>${unavailableSelectedSection || "-"}</b></div>
                            <div>السكاشن المتاحة الآن: <b>${unavailableSectionsText}</b></div>
                            <div style="margin-top:8px">يمكنك إعادة مزامنة اختيارات هذا الترم من السيرفر ثم اختيار سكشن متاح يدويًا.</div>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: "إعادة مزامنة اختيارات هذا الترم",
                    cancelButtonText: "إغلاق",
                    didOpen: (el) => {
                        el.style.direction = "rtl";
                        el.style.textAlign = "right";
                    },
                });
                if (syncPrompt?.isConfirmed) {
                    setSelectedCourses((prev) => {
                        const current = Array.isArray(prev) ? prev : [];
                        return current.filter((item) => !isCurrentSemester(item?.semester));
                    });
                    suppressHydrationUntilRef.current = 0;
                    hydratedTermKeyRef.current = "";
                    await hydrateSelectionsFromBackend();
                    await loadTermRequestStatus();
                }
                return;
            } else if (errorDetail?.code === "SCHEDULE_CONFLICT") {
                const conflicts = Array.isArray(errorDetail?.conflicts) ? errorDetail.conflicts : [];
                const typeLabel = (value) => {
                    const key = String(value || "").trim().toLowerCase();
                    if (key === "lecture" || key === "lec") return "محاضرة";
                    if (key === "lab" || key === "section") return "سكشن";
                    return "جلسة";
                };
                const details = conflicts
                    .slice(0, 5)
                    .map((row) => {
                        const leftCourse = String(row?.current_course || "-");
                        const leftSection = String(row?.current_section || "-");
                        const leftType = typeLabel(row?.current_type || row?.type);
                        const rightCourse = String(row?.conflicting_course || "-");
                        const rightSection = String(row?.conflicting_section || "-");
                        const rightType = typeLabel(row?.conflicting_type || row?.type);
                        const day = String(row?.day || "-");
                        const time = String(row?.time || `${row?.start_time || ""} - ${row?.end_time || ""}`).trim();
                        return `- ${leftType} ${leftCourse} (${leftSection}) يتعارض مع ${rightType} ${rightCourse} (${rightSection}) يوم ${day} الساعة ${time}`;
                    })
                    .join("\n");
                const head = String(errorDetail?.message || "يوجد تعارض في الجدول الدراسي.").trim();
                showAlert(`${head}\n${details || rawMessage}`, "error");
            } else if (rawMessage.toLowerCase().includes("no academic advisor is assigned")) {
                showAlert(t("academic_reg_submit_no_advisor"), "error");
            } else if (rawMessage.toLowerCase().includes("registration is locked")) {
                await loadTermRequestStatus();
                showAlert("تم إرسال الطلب بالفعل أو تم قفل التسجيل لهذا الفصل الدراسي.", "info");
            } else {
                showAlert(rawMessage || t("academic_reg_submit_failed"), "error");
            }
        } finally {
            setSubmittingToAdvisor(false);
        }
    };

    const isSameYear = (courseYear, yearFilter) => {
        if (yearFilter === "all") return true;
        return normalizeAcademicYearValue(courseYear, "") === normalizeAcademicYearValue(yearFilter, "");
    };

    const filteredCourses = useMemo(() => {
        const normalizedQuery = String(searchQuery || "").trim().toLowerCase();
        return courses.filter((course) => {
            const courseCode = String(course?.id || course?.code || "").trim().toUpperCase();
            const hasAvailableOffering =
                !availableOfferingsLoaded ||
                !courseCode ||
                availableOfferingCourseIds.has(courseCode);
            if (!hasAvailableOffering) return false;
            const courseName = String(course?.name || "").toLowerCase();
            const courseId = String(course?.id || course?.code || "").toLowerCase();
            const matchesSearch = !normalizedQuery || courseName.includes(normalizedQuery) || courseId.includes(normalizedQuery);
            const matchesYear = isSameYear(course.year, selectedYear);
            return matchesSearch && matchesYear;
        });
    }, [courses, searchQuery, selectedYear, availableOfferingsLoaded, availableOfferingCourseIds]);
    const normalizeArabicDigits = (value) =>
        String(value || "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    /** Hall may live on catalog lecture or on selected section; LEC blocks often mirror section time only. */
    const resolveScheduleSessionHall = (session) =>
        String(session?.lecture?.hall || session?.selectedGroup?.hall || "").trim();
    const normalizeDayToken = (value) => {
        const raw = normalizeArabicDigits(value)
            .trim()
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u064B-\u0652]/g, "")
            .replace(/[._-]/g, "")
            .replace(/\s+/g, "");
        if (!raw) return "";
        if (["0", "7"].includes(raw)) return "sunday";
        if (["1"].includes(raw)) return "monday";
        if (["2"].includes(raw)) return "tuesday";
        if (["3"].includes(raw)) return "wednesday";
        if (["4"].includes(raw)) return "thursday";
        if (["5"].includes(raw)) return "friday";
        if (["6"].includes(raw)) return "saturday";
        if (["sun", "sunday", "الاحد", "الأحد", "ahad"].includes(raw)) return "sunday";
        if (["mon", "monday", "الاثنين", "الإثنين", "اثنين"].includes(raw)) return "monday";
        if (["tue", "tuesday", "الثلاثاء", "ثلاثاء"].includes(raw)) return "tuesday";
        if (["wed", "wednesday", "الاربعاء", "الأربعاء", "اربعاء"].includes(raw)) return "wednesday";
        if (["thu", "thursday", "الخميس"].includes(raw)) return "thursday";
        if (["sat", "saturday", "السبت", "سبت"].includes(raw)) return "saturday";
        if (["fri", "friday", "الجمعة", "جمعه", "جمعة"].includes(raw)) return "friday";
        return raw;
    };
    const parseHour = (value) => {
        const text = normalizeArabicDigits(String(value || "").toLowerCase()).trim();
        if (!text) return null;
        const match = text.match(/(\d{1,2})(?::(\d{1,2}))?/);
        if (!match) return null;
        let hour = Number(match[1]);
        const hasPm = /(pm|مساء|\bم\b)/.test(text);
        const hasAm = /(am|صباح|\bص\b)/.test(text);
        if (hasPm && hour < 12) hour += 12;
        if (hasAm && hour === 12) hour = 0;
        if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
        return hour;
    };
    const parseSessionRangeHours = (session = {}) => {
        const rangeText = normalizeArabicDigits(String(session?.time || ""))
            .replace(/[–—]/g, "-")
            .replace(/\s*to\s*/gi, "-");
        const [firstPart = "", secondPart = ""] = rangeText.split("-").map((part) => part.trim());

        let startHour = parseHour(session?.start || firstPart);
        let endHour = parseHour(session?.end || secondPart);
        const firstHour = parseHour(firstPart);
        const secondHour = parseHour(secondPart);

        if (startHour === null && firstHour !== null) startHour = firstHour;
        if (endHour === null && secondHour !== null) endHour = secondHour;

        if (startHour !== null && endHour !== null && endHour <= startHour) {
            if (firstHour !== null && secondHour !== null && firstHour > secondHour) {
                startHour = secondHour;
                endHour = firstHour;
            } else if (startHour > endHour && startHour - endHour <= 8) {
                const swap = startHour;
                startHour = endHour;
                endHour = swap;
            }
        }
        return { startHour, endHour };
    };
    const formatTime12 = (value) => {
        const text = String(value || "").trim();
        if (!text) return "";
        const match = text.match(/(\d{1,2})(?::(\d{2}))?/);
        if (!match) return text;
        let hour = Number(match[1]);
        const minute = String(match[2] || "00");
        if (!Number.isFinite(hour)) return text;
        const suffix = hour >= 12 ? "PM" : "AM";
        hour = hour % 12;
        if (hour === 0) hour = 12;
        return `${String(hour).padStart(2, "0")}:${minute} ${suffix}`;
    };
    const formatSessionRange = (startSlot, endSlot) => {
        const start = String(startSlot || "").trim();
        const end = String(endSlot || "").trim();
        if (!start && !end) return "-";
        if (start && !end) return formatTime12(start);
        if (!start && end) return formatTime12(end);
        const sh = parseHour(start);
        const eh = parseHour(end);
        const ordered = sh !== null && eh !== null && eh < sh ? `${end} - ${start}` : `${start} - ${end}`;
        // Force LTR-friendly punctuation/number flow inside RTL UI.
        const [s, e] = ordered.split(" - ");
        return `\u200E${formatTime12(s)} - ${formatTime12(e)}\u200E`;
    };
    const getStartEndSlots = (session, allowedHours) => {
        const { startHour, endHour: parsedEndHour } = parseSessionRangeHours(session || {});
        if (startHour === null) return null;
        let endHour = parsedEndHour;
        const duration = Number(session?.duration || 0);
        if (endHour === null || endHour <= startHour) {
            endHour = startHour + (Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 1);
        }
        const filteredHours = allowedHours.filter((hour) => hour >= startHour && hour < endHour);
        if (!filteredHours.length) return null;
        const startSlot = `${String(startHour).padStart(2, "0")}:00`;
        const endSlot = `${String(endHour).padStart(2, "0")}:00`;
        return { filteredHours, startSlot, endSlot };
    };
    const scheduleSessionMap = useMemo(() => {
        const allowedHours = timeSlots
            .map((slot) => parseHour(slot))
            .filter((hour) => Number.isFinite(hour));
        const map = new Map();
        scheduledSelectionCourses.forEach((course) => {
            const lectureDay = normalizeDayToken(course?.lecture?.day);
            const lectureSlots = getStartEndSlots(course?.lecture, allowedHours);
            const groupDay = normalizeDayToken(course?.selectedGroup?.day);
            const groupSlots = getStartEndSlots(course?.selectedGroup, allowedHours);
            const hasLectureSchedule = Boolean(lectureDay && lectureSlots);
            const hasGroupSchedule = Boolean(groupDay && groupSlots);
            const sameCourseSameWindowAsLecture =
                hasLectureSchedule &&
                hasGroupSchedule &&
                groupDay === lectureDay &&
                groupSlots?.startSlot === lectureSlots?.startSlot &&
                groupSlots?.endSlot === lectureSlots?.endSlot;

            if (hasLectureSchedule) {
                lectureSlots.filteredHours.forEach((hour) => {
                    const slot = `${String(hour).padStart(2, "0")}:00`;
                    const key = `${lectureDay}__${slot}`;
                    const current = map.get(key) || [];
                    current.push({
                        ...course,
                        type: "LEC",
                        palette: LECTURE_PALETTE,
                        sessionKey: `${course?.id || course?.code || course?.name}__LEC__${lectureDay}__${lectureSlots.startSlot}`,
                        startSlot: lectureSlots.startSlot,
                        endSlot: lectureSlots.endSlot,
                    });
                    map.set(key, current);
                });
            }

            // Section/offering time with no separate catalog lecture → show as Lecture (main class), not Lab.
            if (hasGroupSchedule && !sameCourseSameWindowAsLecture) {
                const useLectureType = !hasLectureSchedule;
                const palette = useLectureType ? LECTURE_PALETTE : LAB_PALETTE;
                const type = useLectureType ? "LEC" : "LAB";
                groupSlots.filteredHours.forEach((hour) => {
                    const slot = `${String(hour).padStart(2, "0")}:00`;
                    const key = `${groupDay}__${slot}`;
                    const current = map.get(key) || [];
                    current.push({
                        ...course,
                        type,
                        palette,
                        sessionKey: `${course?.id || course?.code || course?.name}__${type}__${groupDay}__${groupSlots.startSlot}`,
                        startSlot: groupSlots.startSlot,
                        endSlot: groupSlots.endSlot,
                    });
                    map.set(key, current);
                });
            }
        });
        return map;
    }, [scheduledSelectionCourses, timeSlots]);
    /** Use canonical day keys (sunday, monday, …) — not translated labels — so lookups match scheduleSessionMap. */
    const getSessionAt = (day, time) => scheduleSessionMap.get(`${normalizeDayToken(day)}__${time}`) || [];

    const scheduleMergedBlocksByDay = useMemo(() => {
        const timeSlotIndexFromHour = (hour) => {
            if (hour === null || !Number.isFinite(hour)) return -1;
            for (let i = 0; i < timeSlots.length; i += 1) {
                if (parseHour(timeSlots[i]) === hour) return i;
            }
            return -1;
        };

        const byDay = new Map(scheduleDayMeta.map((day) => [day.key, []]));
        const sessionSeen = new Set();

        const resolveSpan = (startSlot, endSlot) => {
            const maxCols = timeSlots.length;
            const startClean = String(startSlot || "").trim();
            const endClean = String(endSlot || "").trim();
            let startIndex = timeSlots.indexOf(startClean);
            const startHour = parseHour(startClean);
            if (startIndex < 0 && startHour !== null) {
                startIndex = timeSlotIndexFromHour(startHour);
            }
            if (startIndex < 0) return null;

            let endIndex = timeSlots.indexOf(endClean);
            if (endIndex <= startIndex && endClean) {
                const endHour = parseHour(endClean);
                if (endHour !== null && endHour > startHour) {
                    endIndex = timeSlotIndexFromHour(endHour);
                }
            }
            if (endIndex > startIndex) {
                const rawSpan = endIndex - startIndex;
                const span = Math.max(1, Math.min(rawSpan, maxCols - startIndex));
                return { startIndex, span };
            }
            const endHourFallback = parseHour(endClean);
            if (startHour !== null && endHourFallback !== null && endHourFallback > startHour) {
                const rawSpan = Math.max(1, endHourFallback - startHour);
                const span = Math.max(1, Math.min(rawSpan, maxCols - startIndex));
                return { startIndex, span };
            }
            return { startIndex, span: 1 };
        };

        scheduleDayMeta.forEach((dayMeta) => {
            timeSlots.forEach((time) => {
                const sessions = getSessionAt(dayMeta.key, time);
                sessions.forEach((session) => {
                    const sessionId = String(session?.sessionKey || `${session?.id || session?.code || session?.name}-${session?.type || "NA"}-${dayMeta.key}-${session?.startSlot || time}`);
                    const dayScopedKey = `${dayMeta.key}__${sessionId}`;
                    if (sessionSeen.has(dayScopedKey)) return;
                    const resolved = resolveSpan(session?.startSlot || time, session?.endSlot || "");
                    if (!resolved) return;
                    sessionSeen.add(dayScopedKey);
                    const dayList = byDay.get(dayMeta.key) || [];
                    dayList.push({
                        ...session,
                        startIndex: resolved.startIndex,
                        span: resolved.span,
                        sessionId,
                    });
                    byDay.set(dayMeta.key, dayList);
                });
            });
        });

        const lanesByDay = new Map();
        byDay.forEach((blocks, dayKey) => {
            const sorted = [...blocks].sort((a, b) => {
                if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
                return String(a?.sessionId || "").localeCompare(String(b?.sessionId || ""));
            });
            /** Place blocks into lanes with explicit interval overlap check (avoids bugs from placeholder 0 in lane-end arrays). */
            const laneIntervals = [];
            const withLanes = sorted.map((block) => {
                const s = Number(block.startIndex || 0);
                const span = Math.max(1, Number(block.span || 1));
                const e = s + span;
                const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
                let lane = laneIntervals.findIndex((intervals) =>
                    intervals.every((iv) => !overlaps(s, e, iv.start, iv.end))
                );
                if (lane < 0) {
                    lane = laneIntervals.length;
                    laneIntervals.push([]);
                }
                laneIntervals[lane].push({ start: s, end: e });
                return { ...block, lane, span };
            });
            lanesByDay.set(dayKey, { blocks: withLanes, laneCount: Math.max(1, laneIntervals.length) });
        });
        return lanesByDay;
    }, [scheduleDayMeta, timeSlots, scheduleSessionMap]);

    const scheduleCoverage = useMemo(() => {
        const allowedHours = timeSlots.map((slot) => parseHour(slot)).filter((hour) => Number.isFinite(hour));
        const displayedCourseIds = new Set();
        const displayedSessionIds = new Set();
        const duplicateSplitErrors = [];

        scheduleMergedBlocksByDay.forEach((dayData) => {
            const seenBySession = new Set();
            (dayData?.blocks || []).forEach((block) => {
                displayedCourseIds.add(String(block?.id || block?.code || ""));
                const key = String(block?.sessionId || "");
                if (!key) return;
                displayedSessionIds.add(key);
                if (seenBySession.has(key)) {
                    duplicateSplitErrors.push(key);
                } else {
                    seenBySession.add(key);
                }
            });
        });

        const expectedSessions = [];
        scheduledSelectionCourses.forEach((course) => {
            const lectureDay = normalizeDayToken(course?.lecture?.day);
            const lectureSlots = getStartEndSlots(course?.lecture, allowedHours);
            const groupDay = normalizeDayToken(course?.selectedGroup?.day);
            const groupSlots = getStartEndSlots(course?.selectedGroup, allowedHours);
            const hasLectureSchedule = Boolean(lectureDay && lectureSlots);
            const hasGroupSchedule = Boolean(groupDay && groupSlots);
            const sameCourseSameWindowAsLecture =
                hasLectureSchedule &&
                hasGroupSchedule &&
                groupDay === lectureDay &&
                groupSlots?.startSlot === lectureSlots?.startSlot &&
                groupSlots?.endSlot === lectureSlots?.endSlot;

            if (hasLectureSchedule) {
                expectedSessions.push({
                    id: `${course?.id || course?.code || course?.name}__LEC__${lectureDay}__${lectureSlots.startSlot}`,
                    courseId: String(course?.id || course?.code || ""),
                    courseName: String(course?.name || ""),
                    type: "Lecture",
                });
            }
            if (hasGroupSchedule && !sameCourseSameWindowAsLecture) {
                const useLectureType = !hasLectureSchedule;
                expectedSessions.push({
                    id: `${course?.id || course?.code || course?.name}__${useLectureType ? "LEC" : "LAB"}__${groupDay}__${groupSlots.startSlot}`,
                    courseId: String(course?.id || course?.code || ""),
                    courseName: String(course?.name || ""),
                    type: useLectureType ? "Lecture" : "Lab",
                });
            }
        });

        const missingSessions = expectedSessions.filter((session) => !displayedSessionIds.has(session.id));
        const missingCourses = scheduledSelectionCourses.filter((course) => {
            const key = String(course?.id || course?.code || "");
            return key && !displayedCourseIds.has(key);
        });

        return {
            missingCourses,
            missingSessions,
            duplicateSplitErrors,
            allCoursesShown: missingCourses.length === 0,
            sessionsMergedCorrectly: duplicateSplitErrors.length === 0,
            allExpectedSessionsShown: missingSessions.length === 0,
        };
    }, [scheduleMergedBlocksByDay, scheduledSelectionCourses, timeSlots]);
    useEffect(() => {
        console.info("[registration.schedule.coverage]", {
            selected_courses_count: currentSemesterSelectedCourses.length,
            scheduled_selection_count: scheduledSelectionCourses.length,
            unscheduled_selection_count: unscheduledSelectionCourses.length,
            allCoursesShown: scheduleCoverage.allCoursesShown,
            allExpectedSessionsShown: scheduleCoverage.allExpectedSessionsShown,
            sessionsMergedCorrectly: scheduleCoverage.sessionsMergedCorrectly,
            missingCourses: (scheduleCoverage.missingCourses || []).map((row) => row?.id || row?.code),
            missingSessions: (scheduleCoverage.missingSessions || []).map((row) => row?.id),
            duplicateSplitErrors: scheduleCoverage.duplicateSplitErrors || [],
        });
    }, [scheduleCoverage, currentSemesterSelectedCourses.length, scheduledSelectionCourses.length, unscheduledSelectionCourses.length]);
    const coursesMissingSchedule = useMemo(
        () => effectiveUnscheduledSelectionCourses,
        [effectiveUnscheduledSelectionCourses]
    );
    const missingScheduleCourseLabels = useMemo(
        () =>
            coursesMissingSchedule
                .map((course) => String(course?.name || course?.id || course?.code || "").trim())
                .filter(Boolean),
        [coursesMissingSchedule]
    );

    useEffect(() => {
        if (!openSemester) return;
        if (!coursesMissingSchedule.length) {
            missingScheduleRetryRef.current = "";
            return;
        }
        const retryKey = `${String(getCurrentAcademicYear())}__${String(openSemester || "")}`;
        if (missingScheduleRetryRef.current === retryKey) return;
        missingScheduleRetryRef.current = retryKey;
        hydratedTermKeyRef.current = "";
        void hydrateSelectionsFromBackend();
    }, [coursesMissingSchedule.length, openSemester]);
    const scheduleLegend = useMemo(
        () => [
            { id: "Lecture", name: "محاضرة", palette: LECTURE_PALETTE },
            { id: "Lab", name: "سكشن", palette: LAB_PALETTE },
        ],
        []
    );
    const mobileScheduleDays = useMemo(
        () =>
            scheduleDayMeta.map((dayMeta) => ({
                day: dayMeta.label,
                sessions: timeSlots.flatMap((time) =>
                    getSessionAt(dayMeta.key, time).map((session) => ({ ...session, slot: time }))
                ),
            })),
        [scheduleDayMeta, timeSlots, scheduleSessionMap]
    );
    const currentScheduleFocus = useMemo(() => {
        const now = new Date();
        const weekday = now.getDay();
        const dayKeyMap = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };
        const activeDayKey = dayKeyMap[weekday] || null;
        const hour = String(now.getHours()).padStart(2, "0");
        const activeSlot = timeSlots.includes(`${hour}:00`) ? `${hour}:00` : null;
        return { activeDayKey, activeSlot };
    }, [timeSlots]);
    const handleDownloadSchedulePdf = async () => {
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        await ensureArabicFont(doc);

        const processText = (value) => {
            const text = String(value ?? "");
            return typeof doc.processArabic === "function" ? doc.processArabic(text) : text;
        };

        /** Print-only styling: subtle fills by session type (does not alter schedule data). */
        const pdfCoursePrintStyle = (block) => {
            const t = String(block?.type || "").toUpperCase();
            if (t === "LEC") {
                return { fill: [252, 250, 246], text: [30, 41, 59], line: [214, 211, 206] };
            }
            return { fill: [245, 249, 247], text: [30, 41, 59], line: [202, 212, 206] };
        };

        const sessionTypeLabelEn = (block) => (block?.type === "LEC" ? "Lecture" : "Laboratory / Section");

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginX = 40;
        const marginBottom = 38;
        const contentWidth = pageWidth - marginX * 2;
        const rightEdge = pageWidth - marginX;
        const ink = [15, 23, 42];
        const inkMuted = [71, 85, 105];
        const rule = [203, 213, 225];
        const tableBorder = [148, 163, 184];
        const headFill = [30, 41, 59];
        const generatedAt = new Date();
        const generatedEnDate = generatedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        const generatedEnDateLtr = `\u202A${generatedEnDate}\u202C`;
        const studentName = String(studentInfo?.name || "").trim();
        const studentId = String(studentInfo?.id || "").trim();
        const showStudent = Boolean(studentName && studentName !== "-" && studentId && studentId !== "-");

        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, "F");

        let y = 36;
        doc.setTextColor(...inkMuted);
        doc.setFontSize(8);
        doc.setFont("ArialUnicode", "normal");
        doc.text("BNU STUDENT PORTAL", marginX, y);
        doc.text(processText("بوابة الطلاب — جامعة بنها الأهلية"), rightEdge, y, { align: "right" });
        y += 16;

        doc.setTextColor(...ink);
        doc.setFontSize(11);
        doc.text("ACADEMIC SCHEDULE REPORT", marginX, y);
        y += 18;

        doc.setFontSize(17);
        doc.setFont("ArialUnicode", "normal");
        doc.text(`Academic Schedule — ${academicYearLabel}`, marginX, y);
        y += 16;
        doc.setFontSize(11);
        doc.text(processText(`تقرير الجدول الأكاديمي — ${academicYearLabel}`), marginX, y);
        y += 14;

        doc.setDrawColor(...rule);
        doc.setLineWidth(0.75);
        doc.line(marginX, y, rightEdge, y);
        y += 12;

        doc.setFontSize(9);
        doc.setTextColor(...inkMuted);
        const metaLeftX = marginX;
        const metaMidX = marginX + contentWidth * 0.38;
        doc.text(`Academic year: ${academicYearLabel}`, metaLeftX, y);
        doc.text(`Semester: ${openSemesterMeta.en}`, metaLeftX, y + 12);
        doc.text(processText(`العام الجامعي: ${academicYearLabel}`), metaMidX, y);
        doc.text(processText(`الفصل الدراسي: ${openSemesterMeta.ar}`), metaMidX, y + 12);

        doc.setFontSize(9);
        doc.text(processText(`تاريخ الإنشاء: ${generatedEnDateLtr}`), rightEdge, y, { align: "right" });
        y += 28;

        if (showStudent) {
            doc.setTextColor(...ink);
            doc.setFontSize(9);
            doc.text(`Student: ${studentName}`, marginX, y);
            doc.text(`Student ID: ${studentId}`, marginX + Math.min(280, contentWidth * 0.42), y);
            doc.text(processText(`الطالب: ${processText(studentName)}`), rightEdge, y, { align: "right" });
            y += 14;
        }

        const summaryMetrics = [
            { en: "Days", ar: "الأيام", val: String(scheduleDayMeta.length) },
            { en: "Time slots", ar: "الفترات", val: String(timeSlots.length) },
            { en: "Subjects", ar: "المقررات", val: String(currentSemesterSelectedCourses.length) },
        ];
        const gap = 10;
        const cellW = (contentWidth - gap * (summaryMetrics.length - 1)) / summaryMetrics.length;
        let sx = marginX;
        doc.setDrawColor(...rule);
        doc.setLineWidth(0.5);
        summaryMetrics.forEach((m, i) => {
            doc.setFillColor(252, 252, 253);
            doc.rect(sx, y, cellW, 36, "FD");
            doc.setTextColor(...inkMuted);
            doc.setFontSize(7);
            doc.text(m.en.toUpperCase(), sx + 8, y + 11);
            doc.text(processText(m.ar), sx + 8, y + 20);
            doc.setTextColor(...ink);
            doc.setFontSize(14);
            doc.text(m.val, sx + 8, y + 32);
            sx += cellW + gap;
        });
        y += 48;

        const dayColW = 66;
        const slotColW = Math.max(34, (contentWidth - dayColW) / timeSlots.length);
        const columnStyles = { 0: { cellWidth: dayColW, halign: "center", valign: "middle" } };
        for (let i = 0; i < timeSlots.length; i += 1) {
            columnStyles[i + 1] = { cellWidth: slotColW, halign: "left", valign: "top" };
        }

        const head = [[processText("Day / اليوم"), ...timeSlots.map((slot) => formatTime12(slot))]];
        const body = [];
        scheduleDayMeta.forEach((dayMeta) => {
            const dayData = scheduleMergedBlocksByDay.get(dayMeta.key) || { blocks: [], laneCount: 1 };
            const laneCount = Math.max(1, Number(dayData?.laneCount || 1));
            const blocks = Array.isArray(dayData?.blocks) ? dayData.blocks : [];

            for (let lane = 0; lane < laneCount; lane += 1) {
                const row = [];
                if (lane === 0) {
                    row.push({
                        content: `${dayMeta.en}\n${processText(dayMeta.ar)}`,
                        rowSpan: laneCount,
                        fillColor: [248, 250, 252],
                        textColor: inkMuted,
                        _pdfCellKind: "day",
                    });
                }

                const laneBlocks = blocks.filter((block) => Number(block?.lane || 0) === lane);
                const laneByStart = new Map(
                    laneBlocks.map((block) => [Number(block?.startIndex || 0), block])
                );

                let col = 0;
                while (col < timeSlots.length) {
                    const block = laneByStart.get(col);
                    if (!block) {
                        row.push({
                            content: "",
                            fillColor: [255, 255, 255],
                            textColor: [226, 232, 240],
                            _pdfCellKind: "empty",
                        });
                        col += 1;
                        continue;
                    }

                    const span = Math.max(1, Number(block?.span || 1));
                    const room = resolveScheduleSessionHall(block);
                    const ps = pdfCoursePrintStyle(block);
                    const courseTitle = processText(String(block?.name || "").trim());
                    const code = String(block?.id || block?.code || "").trim();
                    const timeLine = formatSessionRange(block?.startSlot, block?.endSlot);
                    const lines = [
                        courseTitle,
                        code ? `${code}  ·  ${sessionTypeLabelEn(block)}` : sessionTypeLabelEn(block),
                        room ? `Room: ${room}` : "Room: —",
                        timeLine && timeLine !== "-" ? timeLine : "",
                    ].filter(Boolean);
                    row.push({
                        content: lines.join("\n"),
                        colSpan: span,
                        fillColor: ps.fill,
                        textColor: ps.text,
                        lineColor: ps.line,
                        _pdfCellKind: "course",
                    });
                    col += span;
                }
                body.push(row);
            }
        });

        const tableStartY = y;

        autoTable(doc, {
            startY: tableStartY,
            margin: { left: marginX, right: marginX, bottom: marginBottom },
            tableWidth: contentWidth,
            theme: "grid",
            head,
            body,
            styles: {
                font: "ArialUnicode",
                fontSize: 7,
                fontStyle: "normal",
                cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
                halign: "left",
                valign: "top",
                overflow: "linebreak",
                textColor: ink,
                lineColor: tableBorder,
                lineWidth: 0.35,
                minCellHeight: 14,
            },
            headStyles: {
                font: "ArialUnicode",
                fontSize: 8,
                fillColor: headFill,
                textColor: [255, 255, 255],
                fontStyle: "bold",
                halign: "center",
                valign: "middle",
                cellPadding: { top: 8, right: 3, bottom: 8, left: 3 },
                minCellHeight: 32,
            },
            columnStyles,
            didParseCell: (hook) => {
                const raw = hook.cell.raw;
                if (!raw || typeof raw !== "object") return;
                if (raw.fillColor) hook.cell.styles.fillColor = raw.fillColor;
                if (raw.textColor) hook.cell.styles.textColor = raw.textColor;
                if (raw.lineColor) hook.cell.styles.lineColor = raw.lineColor;
                if (hook.section === "head" && hook.column.index === 0) {
                    hook.cell.styles.halign = "center";
                }
                if (hook.section === "body") {
                    const kind = raw._pdfCellKind;
                    if (kind === "day") {
                        hook.cell.styles.halign = "center";
                        hook.cell.styles.valign = "middle";
                        hook.cell.styles.fontSize = 8.5;
                        hook.cell.styles.fontStyle = "normal";
                    } else if (kind === "course") {
                        hook.cell.styles.fontSize = 7;
                        hook.cell.styles.fontStyle = "normal";
                        hook.cell.styles.cellPadding = { top: 6, right: 5, bottom: 6, left: 5 };
                        hook.cell.styles.minCellHeight = 52;
                    } else if (kind === "empty") {
                        hook.cell.styles.minCellHeight = 22;
                    }
                }
            },
            didDrawPage: (data) => {
                doc.setDrawColor(...rule);
                doc.setLineWidth(0.4);
                doc.line(marginX, pageHeight - marginBottom + 8, rightEdge, pageHeight - marginBottom + 8);
                doc.setTextColor(...inkMuted);
                doc.setFontSize(7.5);
                doc.setFont("ArialUnicode", "normal");
                doc.text("This document was generated automatically from the academic system.", marginX, pageHeight - 18);
                doc.text(
                    processText("تم إنشاء هذا المستند تلقائيًا من النظام الأكاديمي. أسماء المقررات كما أدخلتها الإدارة."),
                    rightEdge,
                    pageHeight - 18,
                    { align: "right" }
                );
                const pageLabel = `Page ${data.pageNumber}`;
                doc.text(pageLabel, pageWidth / 2, pageHeight - 10, { align: "center" });
            },
        });

        doc.save(`academic-schedule-${String(openSemester || "semester")}-${academicYearLabel}.pdf`);
    };

    return (
        <div className=" min-h-screen  mt-[6em] bg-[#f8fafc] font-sans text-right" dir="rtl">
            <style>{`
                .academic-schedule-shell {
                    font-family: "Inter", "Poppins", "Montserrat", ui-sans-serif, system-ui, sans-serif;
                }
                .academic-schedule-grid {
                    display: grid;
                    grid-template-columns: 140px repeat(13, minmax(118px, 1fr));
                    gap: 14px;
                }
                @media print {
                    .academic-schedule-shell {
                        box-shadow: none !important;
                        border-color: #cbd5e1 !important;
                        break-inside: avoid;
                    }
                    .academic-schedule-grid {
                        grid-template-columns: 110px repeat(13, minmax(72px, 1fr));
                        gap: 8px;
                    }
                    .academic-schedule-print-hide {
                        display: none !important;
                    }
                }
            `}</style>
            <main className="mx-auto px-4 sm:px-6 lg:px-20 py-8 sm:py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 outline-none focus:outline-none">
                {/* Sidebar */}
                <aside className="lg:col-span-3 space-y-6">
                    <div className="bg-white rounded-[2rem] p-4 sm:p-6 shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-[#05ADCF]/5 rounded-full -mr-12 -mt-12 transition-all group-hover:scale-110"></div>
                        <h2 className="text-gray-800 font-bold flex items-center gap-2 mb-6">
                            <GraduationCap size={18} className="text-[#05ADCF]" /> {t("academic_reg_performance_card")}
                        </h2>
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                <p className="text-[10px] text-gray-400 font-bold mb-1 uppercase tracking-wider">{t("academic_reg_cumulative_gpa")}</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl font-black text-gray-900">{Number(effectiveCumulativeGpa || 0).toFixed(2)}</span>
                                    <span className="text-[10px] text-emerald-500 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">{t("academic_reg_excellent")}</span>
                                </div>
                            </div>
                            <div className="bg-[#05ADCF] p-5 rounded-2xl text-white shadow-xl shadow-[#05ADCF]/20 relative overflow-hidden">
                                <div className="relative z-10">
                                    <p className="text-[10px] opacity-80 font-bold mb-1 uppercase tracking-widest">{t("academic_reg_passed_hours")}</p>
                                    <div className="flex justify-between items-end">
                                        <span className="text-4xl font-black">{Number(effectiveCompletedHours || 0)}</span>
                                        <span className="text-xs opacity-70 mb-1">{t("academic_reg_current_term_registered_hours", { hours: totalRegisteredHours })}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/20 rounded-full mt-4 overflow-hidden">
                                        <div
                                            className="h-full bg-white rounded-full transition-all duration-700 ease-out"
                                            style={{ width: `${Math.min(100, (totalRegisteredHours / Math.max(1, effectiveMaxHours)) * 100)}%` }}></div>
                                    </div>
                                    <p className="mt-2 text-[10px] opacity-80 font-bold">{t("academic_reg_allowed_hours_short", { minHours: effectiveMinHours, maxHours: effectiveMaxHours })}</p>
                                </div>
                                <Layers size={80} className="absolute -bottom-6 -left-6 opacity-10 rotate-12" />
                            </div>
                        </div>
                    </div>

                    {activeTab === "registration" && (
                        <div className="bg-white rounded-[2rem] p-4 sm:p-6 shadow-sm border border-gray-100">
                            <h3 className="text-gray-800 font-bold flex items-center gap-2 mb-4">
                                <Filter size={18} className="text-[#05ADCF]" /> {t("academic_reg_filter_by_year")}
                            </h3>
                            <div className="space-y-2">
                                {academicYears.map((year) => (
                                    <button
                                        key={year.id}
                                        onClick={() => setSelectedYear(year.id)}
                                        className={`w-full text-right px-4 py-3 rounded-xl text-xs font-bold transition-all border ${
                                            selectedYear === year.id
                                                ? "bg-[#05ADCF] text-white border-[#05ADCF] shadow-lg shadow-[#05ADCF]/10"
                                                : "bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100"
                                        }`}>
                                        {year.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </aside>

                {/* Content */}
                <section className="lg:col-span-9 space-y-6">
                    <div className="flex gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 w-full sm:w-fit">
                        <button
                            onClick={() => setActiveTab("registration")}
                            className={`flex-1 sm:flex-none px-4 sm:px-10 py-3 rounded-xl text-xs font-black transition-all ${
                                activeTab === "registration" ? "bg-[#05ADCF] text-white shadow-lg" : "text-gray-400 hover:bg-gray-50"
                            }`}>
                            {t("academic_reg_available_courses")}
                        </button>
                        <button
                            onClick={() => setActiveTab("schedule")}
                            className={`flex-1 sm:flex-none px-4 sm:px-10 py-3 rounded-xl text-xs font-black transition-all ${
                                activeTab === "schedule" ? "bg-[#05ADCF] text-white shadow-lg" : "text-gray-400 hover:bg-gray-50"
                            }`}>
                            {t("academic_reg_weekly_schedule")}
                        </button>
                    </div>

                    {activeTab === "registration" && paymentUnlocked && (
                        <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex flex-wrap items-center gap-3">
                            <div className="text-xs font-bold text-slate-600">
                                {t("academic_reg_selected_courses_count", { count: currentSemesterSelectedCourses.length })}
                            </div>
                            <button
                                onClick={submitSelectionToAdvisor}
                                disabled={submittingToAdvisor || withdrawingAll || !registrationOpen || currentSemesterSelectedCourses.length === 0 || isSubmitLockedByRequest}
                                className="rounded-xl bg-[#05ADCF] text-white px-4 py-2 text-xs font-black hover:bg-[#0496B4] disabled:opacity-60"
                            >
                                {submittingToAdvisor ? t("academic_reg_submit_sending") : t("academic_reg_submit_to_advisor")}
                            </button>
                            <button
                                type="button"
                                onClick={withdrawAllSelectionsForTerm}
                                disabled={withdrawingAll || submittingToAdvisor || !registrationOpen || currentSemesterSelectedCourses.length === 0 || isSelectionEditLocked}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                            >
                                {withdrawingAll ? "جارٍ المسح…" : "مسح كل المواد وإعادة التسجيل"}
                            </button>
                            {termRequestStatus && (
                                <div className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-black ${getTermRequestTone(termRequestStatus)}`}>
                                    حالة الطلب: {getTermRequestStatusLabel(termRequestStatus)}
                                </div>
                            )}
                            {!registrationOpen && <div className="text-[11px] font-bold text-rose-500">فترة التسجيل غير مفتوحة.</div>}
                            {isSubmitLockedByRequest && (
                                <div className="text-[11px] font-bold text-slate-600">
                                    لا يمكن تعديل المواد بعد اعتماد المرشد أو تنفيذ التسجيل لهذا الفصل.
                                </div>
                            )}
                            {!isSubmitLockedByRequest &&
                                ["advisor_requested", "submitted"].includes(normalizeRequestStatus(termRequestStatus)) && (
                                    <div className="text-[11px] font-bold text-sky-800">
                                        يمكنك إلغاء تسجيل مادة (سلة المهملات) أو إضافة مواد جديدة، ثم الضغط على «إرسال للمرشد» مرة أخرى لتحديث الطلب قبل المراجعة النهائية.
                                    </div>
                                )}
                            {registrationOpen && currentSemesterSelectedCourses.length === 0 && (
                                <div className="text-[11px] font-bold text-amber-600">يجب اختيار مادة واحدة على الأقل قبل الإرسال.</div>
                            )}
                        </div>
                    )}

                    {paymentLoading ? (
                        <div className="bg-white rounded-[2rem] border border-gray-100 p-8 text-center text-slate-500 text-sm font-bold shadow-sm">
                            جارٍ التحقق من حالة الدفع...
                        </div>
                    ) : !paymentUnlocked ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 sm:p-8 space-y-3">
                            <p className="text-sm sm:text-base font-black text-amber-800">يجب سداد الرسوم الدراسية قبل فتح التسجيل الأكاديمي لهذا الفصل.</p>
                            <div className="rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm">
                                <span className="text-amber-700 font-bold">إجمالي المبلغ المستحق: </span>
                                <span className="font-black text-slate-800">{Number(paymentDueAmount || 0).toLocaleString()} EGP</span>
                            </div>
                            <p className="text-xs font-bold text-amber-700">بعد إتمام السداد من صفحة الدفع سيتم فتح التسجيل تلقائيًا.</p>
                            <button
                                onClick={() => window.location.assign("/payment")}
                                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-black"
                            >
                                اذهب إلى الدفع
                            </button>
                        </div>
                    ) : activeTab === "registration" ? (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 outline-none">
                            <div className="relative group outline-none">
                                <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#05ADCF] transition-colors" size={20} />
                                <input
                                    type="text"
                                    placeholder={t("academic_reg_search_placeholder")}
                                    className="w-full pr-14 pl-6 py-5 bg-white border border-gray-100 rounded-[1.5rem] shadow-sm outline-none transition-[box-shadow,border-color] text-sm font-medium focus:border-[#05ADCF]/25 focus:ring-4 focus:ring-[#05ADCF]/10 focus:outline-none"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {filteredCourses.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {filteredCourses.map((course) => {
                                        const selectedInCurrentSemester = currentSemesterSelectedCourseIds.has(String(course?.id || course?.code || ""));
                                        const selectedCourseStatus = String(getSelectedCourseForCurrentSemester(course.id)?.status || "")
                                            .trim()
                                            .toLowerCase();
                                        return (
                                        <div
                                            key={course.id}
                                            className={`bg-white rounded-[2rem] p-5 sm:p-7 border border-gray-100 shadow-sm hover:shadow-xl transition-all relative group ${
                                                course.status === "locked" ? "opacity-60 grayscale-[0.3]" : ""
                                            }`}>
                                            <div className="flex justify-between mb-5">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[9px] font-black text-[#05ADCF] bg-[#05ADCF]/5 px-2 py-1 rounded-lg uppercase border border-[#05ADCF]/10">
                                                            {course.id}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-gray-300 uppercase bg-gray-50 px-2 py-1 rounded-lg">{t("academic_reg_year_label", { year: course.year })}</span>
                                                    </div>
                                                    <h3 className="font-bold text-xl text-gray-800 mt-1 leading-tight group-hover:text-[#05ADCF] transition-colors">{course.name}</h3>
                                                </div>
                                                <div className="text-left bg-gray-50 p-2 rounded-2xl border border-gray-100 min-w-[50px] flex flex-col items-center justify-center">
                                                    <span className="text-xl font-black text-gray-900 leading-none">{course.hours}</span>
                                                    <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">{t("academic_reg_hour")}</span>
                                                </div>
                                            </div>

                                            <div className="space-y-3 mb-8">
                                                <div className="flex items-center justify-between bg-gray-50/50 p-3 rounded-xl border border-gray-100/50">
                                                    <div className="flex items-center gap-2 text-[11px] font-bold text-gray-500">
                                                        <GraduationCap size={14} className="text-[#05ADCF]" /> {t("academic_reg_lecture")}
                                                    </div>
                                                    <div className="text-[11px] font-bold text-gray-700">
                                                        {course.lecture.day} - {course.lecture.time}
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between bg-gray-50/50 p-3 rounded-xl border border-gray-100/50">
                                                    <div className="flex items-center gap-2 text-[11px] font-bold text-gray-500">
                                                        <Monitor size={14} className="text-[#05ADCF]" /> {t("academic_reg_labs")}
                                                    </div>
                                                    <div className="text-[11px] font-bold text-emerald-600">{t("academic_reg_available_options", { count: course.groups.length })}</div>
                                                </div>
                                            </div>

                                            {course.prereq && (
                                                <div className="mb-6 text-[10px] text-amber-600 font-bold flex items-center gap-2 bg-amber-50 p-3 rounded-xl border border-amber-100/50">
                                                    <AlertCircle size={14} /> {t("academic_reg_prereq_required", { prereq: course.prereq })}
                                                </div>
                                            )}

                                            <button
                                                onClick={() => handleRegisterClick(course)}
                                                disabled={
                                                    !registrationOpen ||
                                                    isSubmitLockedByRequest ||
                                                    course.status === "locked" ||
                                                    selectedInCurrentSemester
                                                }
                                                className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2
                          ${
                              selectedInCurrentSemester
                                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                  : isSubmitLockedByRequest || !registrationOpen || course.status === "locked"
                                  ? "bg-gray-100 text-gray-300"
                                  : "bg-gray-900 text-white hover:bg-[#05ADCF] hover:shadow-lg shadow-gray-200"
                          }`}>
                                                {selectedInCurrentSemester ? (
                                                    <>
                                                        <CheckCircle size={16} />{" "}
                                                        {(isSubmitLockedByRequest ||
                                                            ["advisor_approved", "registered", "approved", "locked"].includes(selectedCourseStatus))
                                                            ? t("academic_reg_registered")
                                                            : t("academic_reg_saved_pending_advisor")}
                                                    </>
                                                ) : isSubmitLockedByRequest ? (
                                                    <>
                                                        <CheckCircle size={16} /> {t("academic_reg_locked_after_submit")}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus size={16} /> {t("academic_reg_add_course")}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )})}
                                </div>
                            ) : (
                                    <div className="bg-white p-10 sm:p-20 rounded-[2.5rem] text-center border border-gray-100">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Layers size={40} className="text-gray-200" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-400">{t("academic_reg_no_courses_match_filters")}</h3>
                                    <button
                                        onClick={() => {
                                            setSelectedYear("all");
                                            setSearchQuery("");
                                        }}
                                        className="mt-4 text-[#05ADCF] text-xs font-bold underline">
                                        {t("academic_reg_reset_filters")}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Tab - Grid Weekly Schedule */
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="academic-schedule-shell overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                                <div className="border-b border-slate-200 px-4 py-5 sm:px-7 sm:py-7">
                                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="space-y-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">Academic Dashboard</p>
                                            <div className="space-y-1">
                                                <h2 className="text-[clamp(1.45rem,2vw,2.1rem)] font-semibold tracking-tight text-slate-900">Academic Schedule</h2>
                                                <p className="text-sm font-medium text-slate-500">الجدول الأكاديمي</p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                                                <span className="font-medium">{openSemesterMeta.en}</span>
                                                <span className="text-slate-300">/</span>
                                                <span>{openSemesterMeta.ar}</span>
                                                <span className="text-slate-300">•</span>
                                                <span>{academicYearLabel}</span>
                                            </div>
                                        </div>

                                        <div className="academic-schedule-print-hide flex flex-wrap items-center gap-3">
                                            <button
                                                onClick={handleDownloadSchedulePdf}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                                            >
                                                <Download size={14} />
                                                تنزيل الجدول PDF
                                            </button>
                                        </div>
                                    </div>

                                    {scheduleLegend.length > 0 && (
                                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                                            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-sm font-medium text-slate-700">Session Type Legend</p>
                                                <p className="text-xs text-slate-400">لون للمحاضرة ولون مختلف للسكشن</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {scheduleLegend.map((item) => (
                                                    <div
                                                        key={`legend-${item.id}`}
                                                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium ${item.palette.surface} ${item.palette.border} text-slate-700`}
                                                    >
                                                        <span className={`h-2.5 w-2.5 rounded-full ${item.palette.chip.split(" ")[0]}`}></span>
                                                        <span className="text-slate-800">{item.id}</span>
                                                        <span className="text-slate-500">{item.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="hidden lg:block overflow-x-auto px-4 py-4 sm:px-5">
                                    <div className="academic-schedule-grid min-w-[1560px]">
                                        <div className="flex min-h-[56px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                            Day
                                        </div>
                                        {timeSlots.map((time) => {
                                            const isCurrentTime = currentScheduleFocus.activeSlot === time;
                                            return (
                                                <div
                                                    key={time}
                                                    className={`flex min-h-[56px] items-center justify-center rounded-xl border px-2 text-center text-sm font-medium ${
                                                        isCurrentTime ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-50 text-slate-600"
                                                    }`}
                                                >
                                                    {formatTime12(time)}
                                                </div>
                                            );
                                        })}

                                        {scheduleDayMeta.map((dayMeta) => {
                                            const isCurrentDay = currentScheduleFocus.activeDayKey === dayMeta.key;
                                            const dayLayout = scheduleMergedBlocksByDay.get(dayMeta.key) || { blocks: [], laneCount: 1 };
                                            const dayBlocks = Array.isArray(dayLayout.blocks) ? dayLayout.blocks : [];
                                            const laneCount = Math.max(1, Number(dayLayout.laneCount || 1));
                                            return (
                                                <React.Fragment key={dayMeta.key}>
                                                    <div
                                                        className={`flex min-h-[86px] items-center justify-center rounded-xl border px-3 py-3 text-center ${
                                                            isCurrentDay ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-white"
                                                        }`}
                                                    >
                                                        <div>
                                                            <p className="text-base font-semibold text-slate-900">{dayMeta.en}</p>
                                                            <p className="mt-1 text-sm text-slate-500">{dayMeta.ar}</p>
                                                            {laneCount > 1 && (
                                                                <p className="mt-2 text-[10px] font-medium leading-relaxed text-slate-600">
                                                                    صفوف متعددة: أوقات متداخلة على الشبكة — كل مقرر في صف للوضوح. راجع الجدول الرسمي إذا بدا غير متوقع.
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-13">
                                                        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/90 to-white p-2 shadow-inner">
                                                            {Array.from({ length: laneCount }, (_, laneIdx) => (
                                                                <div
                                                                    key={`${dayMeta.key}-lane-${laneIdx}`}
                                                                    className="relative isolate grid min-h-[72px] grid-cols-13 gap-1.5 rounded-xl border border-slate-100 bg-white/95 p-1.5"
                                                                >
                                                                    {timeSlots.map((time) => {
                                                                        const isCurrentCell = isCurrentDay && currentScheduleFocus.activeSlot === time;
                                                                        return (
                                                                            <div
                                                                                key={`${dayMeta.key}-lane${laneIdx}-bg-${time}`}
                                                                                className={`z-0 min-h-[64px] rounded-md border border-dashed ${
                                                                                    isCurrentCell
                                                                                        ? "border-sky-200 bg-sky-50/40"
                                                                                        : "border-slate-100 bg-slate-50/50"
                                                                                }`}
                                                                            />
                                                                        );
                                                                    })}
                                                                    {dayBlocks
                                                                        .filter((b) => Number(b.lane || 0) === laneIdx)
                                                                        .map((session, sIdx) => {
                                                                            const hall = resolveScheduleSessionHall(session);
                                                                            const span = Math.max(1, Number(session?.span || 1));
                                                                            return (
                                                                                <article
                                                                                    key={`${dayMeta.key}-lane${laneIdx}-${session.sessionId || session.id}-${sIdx}`}
                                                                                    className={`z-10 flex min-h-[68px] flex-col overflow-hidden rounded-xl border border-slate-200/90 p-2.5 shadow-md ring-1 ring-slate-900/[0.04] ${session.palette.surface} ${session.palette.border}`}
                                                                                    style={{
                                                                                        gridColumn: `${Number(session.startIndex || 0) + 1} / span ${span}`,
                                                                                    }}
                                                                                >
                                                                                    <div className="flex min-h-0 flex-1 items-start justify-between gap-2">
                                                                                        <div className="min-w-0 flex-1">
                                                                                            <h3 className={`line-clamp-2 text-[11px] font-bold leading-snug ${session.palette.accent}`}>{session.name}</h3>
                                                                                            <p className="mt-0.5 font-mono text-[10px] text-slate-500">{session.id}</p>
                                                                                            <p dir="ltr" className="mt-1 text-[10px] font-medium text-slate-600">{formatSessionRange(session.startSlot, session.endSlot)}</p>
                                                                                        </div>
                                                                                        <div className="shrink-0 flex max-w-[88px] flex-col items-end gap-1">
                                                                                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${session.palette.chip}`}>
                                                                                                {session.type === "LEC" ? "Lecture" : "Lab"}
                                                                                            </span>
                                                                                            <div className={`flex max-w-full items-center gap-0.5 text-[9px] font-semibold ${session.palette.meta}`}>
                                                                                                <MapPin size={10} className="shrink-0" />
                                                                                                <span className="min-w-0 max-w-[84px] truncate text-right">{hall || "—"}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </article>
                                                                            );
                                                                        })}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-3 p-4 lg:hidden sm:p-6">
                                    {scheduleDayMeta.map((dayMeta) => {
                                        const daySessions = [];
                                        const seenSessions = new Set();
                                        timeSlots.forEach((time) => {
                                            getSessionAt(dayMeta.key, time).forEach((session) => {
                                                const uniqueKey = String(session?.sessionKey || `${session?.id}-${session?.type}-${time}`);
                                                if (seenSessions.has(uniqueKey)) return;
                                                seenSessions.add(uniqueKey);
                                                daySessions.push({ ...session, slot: session?.startSlot || time });
                                            });
                                        });
                                        const isCurrentDay = currentScheduleFocus.activeDayKey === dayMeta.key;
                                        return (
                                            <section
                                                key={`mobile-${dayMeta.key}`}
                                                className={`rounded-2xl border p-4 shadow-sm ${isCurrentDay ? "border-sky-200 bg-sky-50/50" : "border-slate-200 bg-white"}`}
                                            >
                                                <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                                    <div>
                                                        <h3 className="text-base font-semibold text-slate-900">{dayMeta.en}</h3>
                                                        <p className="text-sm text-slate-500">{dayMeta.ar}</p>
                                                    </div>
                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-500">
                                                        {daySessions.length ? `${daySessions.length} sessions` : "No sessions"}
                                                    </span>
                                                </div>

                                                {daySessions.length ? (
                                                    <div className="space-y-3">
                                                        {daySessions.map((session, index) => {
                                                            const hall = resolveScheduleSessionHall(session);
                                                            const isCurrentSession = isCurrentDay && currentScheduleFocus.activeSlot === session.slot;
                                                            return (
                                                                <article
                                                                    key={`mobile-session-${dayMeta.key}-${session.id}-${index}`}
                                                                    className={`rounded-xl border p-4 shadow-sm ${session.palette.surface} ${session.palette.border} ${
                                                                        isCurrentSession ? "ring-1 ring-sky-200" : ""
                                                                    }`}
                                                                >
                                                                    <div className="mb-2 flex items-start justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">{formatTime12(session.slot)}</p>
                                                                            <h4 className={`mt-1 text-sm font-semibold leading-5 ${session.palette.accent}`}>{session.name}</h4>
                                                                            <p className="mt-1 text-xs text-slate-500">{session.id}</p>
                                                                            <p dir="ltr" className="mt-1 text-xs text-slate-500">{formatSessionRange(session.startSlot || session.slot, session.endSlot || session.slot)}</p>
                                                                        </div>
                                                                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${session.palette.chip}`}>
                                                                            {session.type === "LEC" ? "Lecture" : "Lab"}
                                                                        </span>
                                                                    </div>
                                                                    <div className={`flex items-center gap-1.5 text-xs font-medium ${session.palette.meta}`}>
                                                                        <MapPin size={12} />
                                                                        <span className="block max-w-[170px] truncate">{hall || "-"}</span>
                                                                    </div>
                                                                </article>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
                                                        No sessions scheduled
                                                    </div>
                                                )}
                                            </section>
                                        );
                                    })}
                                </div>
                            </div>

                            {coursesMissingSchedule.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
                                    بعض المواد لا يظهر لها جدول لأن اليوم/الوقت غير متاحين لا من سجل الشعبة على السيرفر ولا من بيانات المقرر في الكتالوج. استكمل الجدول في إدارة العروض (Offerings) أو حدّث المقرر في إدارة المواد.
                                    {missingScheduleCourseLabels.length > 0 ? ` المواد المتأثرة: ${missingScheduleCourseLabels.join("، ")}` : ""}
                                </div>
                            )}

                            {/* Registered Cards for direct actions */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {currentSemesterSelectedCourses.map((course) => (
                                    (() => {
                                        const courseKey = `${course.id}-${course.semester}`;
                                        const isExpanded = expandedMobileCourseKey === courseKey;
                                        const isLocked =
                                            isSelectionEditLocked ||
                                            ["advisor_approved", "registered", "approved", "locked"].includes(
                                                String(course?.status || "").trim().toLowerCase()
                                            );
                                        const isDeleting = deletingCourseCode === String(course?.id || course?.code || "").trim();
                                        const isUnscheduled = !course?.hasBackendSchedule;
                                        const dayText = isUnscheduled ? "Unscheduled" : course?.selectedGroup?.day || course?.lecture?.day || "-";
                                        const timeText = isUnscheduled ? "Unscheduled" : course?.selectedGroup?.time || course?.lecture?.time || "-";
                                        const roomText = isUnscheduled ? "Unscheduled" : course?.selectedGroup?.hall || course?.lecture?.hall || "-";
                                        return (
                                            <div
                                                key={courseKey}
                                                className="overflow-hidden rounded-[1.7rem] border border-gray-100 bg-white shadow-sm transition-all hover:border-slate-200"
                                            >
                                                <div className="hidden md:flex items-center justify-between gap-4 p-5 group">
                                                    <div className="flex items-center gap-4">
                                                        <div className="bg-[#05ADCF]/5 p-3 rounded-2xl text-[#05ADCF]">
                                                            <BookOpen size={20} />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-black text-gray-800">{course.name}</h4>
                                                            <p className="text-[10px] text-gray-400 font-bold">
                                                                {course.id} - {course.selectedGroup?.name || t("academic_reg_not_available_short")}
                                                            </p>
                                                            {isUnscheduled && (
                                                                <p className="mt-1 inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                                                                    Unscheduled
                                                                </p>
                                                            )}
                                                            {!isUnscheduled && course?.offeringScheduleIncomplete && (
                                                                <p className="mt-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                                                                    Schedule from catalog — confirm on server
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => confirmAndRemoveCourse(course)}
                                                        disabled={isLocked || isDeleting}
                                                        className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                                    </button>
                                                </div>

                                                <div className="md:hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedMobileCourseKey((prev) => (prev === courseKey ? null : courseKey))}
                                                        className="flex w-full items-center gap-3 p-4 text-right"
                                                    >
                                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#05ADCF]/6 text-[#05ADCF]">
                                                            <BookOpen size={18} />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <h4 className="line-clamp-2 text-sm font-black leading-5 text-slate-800">{course.name}</h4>
                                                            <p className="mt-1 text-[10px] font-bold text-slate-400">
                                                                {course.id} • {course.selectedGroup?.name || t("academic_reg_not_available_short")}
                                                            </p>
                                                        </div>
                                                        {isUnscheduled && (
                                                            <span className="mt-1 inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                                                                Unscheduled
                                                            </span>
                                                        )}
                                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
                                                            <ChevronDown size={18} className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                                                        </div>
                                                    </button>

                                                    <div className={`grid transition-all duration-300 ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                                                        <div className="overflow-hidden">
                                                            <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Code</p>
                                                                        <p className="mt-1 text-xs font-black text-slate-700">{course.id}</p>
                                                                    </div>
                                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Group</p>
                                                                        <p className="mt-1 text-xs font-black text-slate-700">{course.selectedGroup?.name || t("academic_reg_not_available_short")}</p>
                                                                    </div>
                                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Day</p>
                                                                        <p className="mt-1 text-xs font-black text-slate-700">{dayText}</p>
                                                                    </div>
                                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Time</p>
                                                                        <p className="mt-1 text-xs font-black text-slate-700">{timeText}</p>
                                                                    </div>
                                                                </div>

                                                                <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Classroom</p>
                                                                    <p className="mt-1 text-xs font-black text-slate-700">{roomText}</p>
                                                                </div>

                                                                <button
                                                                    onClick={() => confirmAndRemoveCourse(course)}
                                                                    disabled={isLocked || isDeleting}
                                                                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-black text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                                    حذف المادة
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                ))}
                                {currentSemesterSelectedCourses.length === 0 && (
                                    <div className="md:col-span-2 lg:col-span-3 bg-white p-8 rounded-[2rem] border border-dashed border-gray-200 text-center text-sm font-bold text-gray-400">
                                        لا توجد مواد مسجلة لهذا الفصل لعرضها هنا.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            </main>
            {/* =================================================================================================== */}
            {/* Group Selection Modal */}
            {selectedCourseForGroups && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
                    <div className="absolute inset-0 bg-gray-900/45 transition-opacity" onClick={() => setSelectedCourseForGroups(null)}></div>
                    <div className="bg-white w-full max-w-xl rounded-[2rem] sm:rounded-[3rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in duration-300">
                        <div className="bg-[#05ADCF] p-5 sm:p-8 text-white relative">
                            <button onClick={() => setSelectedCourseForGroups(null)} className="absolute top-5 sm:top-8 left-5 sm:left-8 p-2 hover:bg-white/10 rounded-xl transition-all">
                                <X size={24} />
                            </button>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-[10px] font-black bg-white/20 px-2 py-1 rounded-lg uppercase border border-white/20 tracking-tighter">{selectedCourseForGroups.id}</span>
                                <span className="text-[10px] font-black opacity-80 uppercase tracking-widest">{t("academic_reg_year_label", { year: selectedCourseForGroups.year })}</span>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black">{t("academic_reg_select_section")}</h2>
                            <p className="text-sm opacity-80 mt-2 font-medium">{t("academic_reg_select_section_desc")}</p>
                        </div>
                        <div className="p-4 sm:p-8 space-y-4 max-h-[55vh] overflow-y-auto custom-scrollbar">
                            {selectedCourseForGroups.groups.map((group) => (
                                <div
                                    key={group.id}
                                    onClick={() => !group.full && confirmRegistration(selectedCourseForGroups, group)}
                                    className={`p-6 rounded-[2rem] border-2 transition-all flex justify-between items-center cursor-pointer group/item
                        ${group.full ? "bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed" : "hover:border-[#05ADCF] hover:bg-[#05ADCF]/5 border-gray-100 shadow-sm hover:shadow-md"}`}>
                                    <div className="flex items-center gap-4">
                                        <div
                                            className={`p-4 rounded-2xl ${
                                                group.full ? "bg-gray-200" : "bg-[#05ADCF]/10 text-[#05ADCF] group-hover/item:bg-[#05ADCF] group-hover/item:text-white"
                                            } transition-all`}>
                                            <Monitor size={24} />
                                        </div>
                                        <div>
                                            <p className="font-black text-base text-gray-800">{group.name}</p>
                                            <div className="flex items-center gap-3 mt-1.5 text-[11px] font-bold text-gray-400">
                                                <span className="flex items-center gap-1">
                                                    <Calendar size={12} /> {group.day}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} /> {group.time}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <MapPin size={12} /> {group.hall}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-left">
                                        <span className={`text-[11px] font-black uppercase mb-1 block ${group.full ? "text-red-400" : "text-emerald-500"}`}>{group.full ? t("academic_reg_full") : t("academic_reg_available")}</span>
                                        <div className="flex items-center justify-end gap-1.5 text-[11px] text-gray-400 font-bold">
                                            <Users size={12} /> {group.capacity}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 border-t border-gray-50 bg-gray-50/30 flex justify-center ">
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">{t("academic_reg_review_schedule_conflicts")}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
