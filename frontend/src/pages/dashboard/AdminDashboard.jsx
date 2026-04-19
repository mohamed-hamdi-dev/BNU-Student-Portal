import React, { useContext, useState, useMemo, useEffect } from "react";
import { Printer, GraduationCap, Edit2, Check, X, Search, Users, Clock, CheckCircle, AlertCircle, ClipboardList, Download, RotateCcw, ShieldCheck, Lock, History, ChevronRight, FileUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SystemContext } from "../../context/SystemContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCurrentAcademicYear, normalizeAcademicYearValue, normalizeSemesterValue } from "../../utils/academicData";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8001";
const GRADE_PUBLISH_STATUS_KEY = "grades.publish.status.v1";
const GRADE_AUDIT_LOG_KEY = "grades.audit.log.v1";
const GRADE_SNAPSHOTS_KEY = "grades.snapshots.v1";
const MAX_SNAPSHOTS = 20;
const REQUIRED_TEMPLATE_HEADERS = ["academicYear", "semester", "gradeCycle", "courseCode", "section", "studentId", "studentName", "score"];
const IMPORT_HEADER_ALIASES = {
    academicYear: ["academicYear", "العام", "السنة الدراسية"],
    semester: ["semester", "الفصل", "الترم"],
    gradeCycle: ["gradeCycle", "دورة الدرجات", "الدورة"],
    courseCode: ["courseCode", "كود المقرر", "المقرر"],
    section: ["section", "الشعبة", "سكشن"],
    studentId: ["studentId", "كود الطالب", "الرقم الجامعي"],
    studentName: ["studentName", "اسم الطالب"],
    username: ["username", "اسم المستخدم"],
    maxScore: ["maxScore", "الحد الأقصى", "الحد الاقصى"],
    score: ["score", "الدرجة"],
    mid1: ["Mid 1", "mid1", "Mid1", "ميد 1", "ميد1"],
    mid2: ["Mid 2", "mid2", "Mid2", "ميد 2", "ميد2"],
    yearWork: ["أعمال السنة", "Year Work", "yearWork", "year_work", "ywork"],
    final: ["النهائي", "Final", "final"],
};
const REQUIRED_HEADERS_AR_LABELS = {
    academicYear: "العام",
    semester: "الفصل",
    gradeCycle: "دورة الدرجات",
    courseCode: "كود المقرر",
    section: "الشعبة",
    studentId: "كود الطالب",
    studentName: "اسم الطالب",
    score: "الدرجة",
};

const GRADE_CYCLES = {
    mid1: { label: "Mid 1", field: "mid1", max: 15 },
    mid2: { label: "Mid 2", field: "mid2", max: 15 },
    yearWork: { label: "Year Work", field: "yearWork", max: 30 },
    final: { label: "Final", field: "final", max: 40 },
};
const COLLEGE_GRADE_DEFAULTS = {
    default: { mid1: 15, mid2: 15, yearWork: 30, final: 40 },
    cs: { mid1: 15, mid2: 15, yearWork: 30, final: 40 },
    engineering: { mid1: 20, mid2: 10, yearWork: 30, final: 40 },
    dentistry: { mid1: 10, mid2: 10, yearWork: 20, final: 60 },
    medicine: { mid1: 10, mid2: 10, yearWork: 20, final: 60 },
    pharmacy: { mid1: 15, mid2: 10, yearWork: 15, final: 60 },
};
const COLLEGE_ALIAS_TO_KEY = {
    cs: "cs",
    "computer science": "cs",
    "علوم الحاسب": "cs",
    "حاسبات": "cs",
    "حاسبات ومعلومات": "cs",
    engineering: "engineering",
    "الهندسة": "engineering",
    dentistry: "dentistry",
    "طب الأسنان": "dentistry",
    medicine: "medicine",
    "الطب": "medicine",
    pharmacy: "pharmacy",
    "الصيدلة": "pharmacy",
};
const GRADE_CYCLES_AR = {
    mid1: "ميد 1",
    mid2: "ميد 2",
    yearWork: "أعمال السنة",
    final: "النهائي",
};
const APPROVED_REGISTRATION_STATUSES = new Set(["registered", "approved", "locked", "graded"]);
const PUBLISH_STATUS_AR = {
    Draft: "مسودة",
    Reviewed: "تحت المراجعة",
    Published: "منشور",
};
const getPublishStatusLabel = (status) => PUBLISH_STATUS_AR[String(status || "")] || String(status || "");
const LEGACY_CYCLE_FIELD_MAP = {
    mid1: "mid1",
    mid2: "mid2",
    coursework: "yearWork",
    yearWork: "yearWork",
    final: "final",
};
const LEGACY_ROW_VALUE_BY_KEY = {
    mid1: (row) => row?.mid1,
    mid2: (row) => row?.mid2,
    coursework: (row) => row?.yearWork ?? row?.ywork,
    yearWork: (row) => row?.yearWork ?? row?.ywork,
    final: (row) => row?.final,
};
const normalizeAssessmentComponents = (raw = []) => {
    const seen = new Set();
    return (Array.isArray(raw) ? raw : [])
        .map((item, index) => {
            const key = String(item?.key || "").trim().toLowerCase();
            const labelAr = String(item?.label_ar || item?.labelAr || item?.label || item?.name || "").trim();
            const labelEn = String(item?.label_en || item?.labelEn || "").trim();
            const maxMarks = Number(item?.max_marks ?? item?.maxMarks ?? item?.max ?? 0);
            const displayOrder = Number(item?.display_order ?? item?.displayOrder ?? index + 1);
            const normalizedKey = key || `component_${index + 1}`;
            const unique = `${normalizedKey}:${displayOrder}`;
            if (seen.has(unique)) return null;
            seen.add(unique);
            return {
                key: normalizedKey,
                label_ar: labelAr || labelEn || normalizedKey,
                label_en: labelEn || labelAr || normalizedKey,
                max_marks: Number.isFinite(maxMarks) && maxMarks >= 0 ? maxMarks : 0,
                display_order: Number.isFinite(displayOrder) && displayOrder > 0 ? displayOrder : index + 1,
                field: LEGACY_CYCLE_FIELD_MAP[normalizedKey] || null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
        .map((item, index) => ({ ...item, display_order: index + 1 }));
};
const parseAssessmentJson = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "string") return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};
const getCourseAssessmentComponents = (course, collegeDefaultsMap = null) => {
    if (!course) return [];
    const allowOverride = Boolean(course?.allowAssessmentOverride ?? course?.allow_assessment_override);
    const overrideRaw = course?.assessmentOverrideComponents || course?.assessment_override_components || parseAssessmentJson(course?.assessment_override_components_json);
    const overrideComponents = normalizeAssessmentComponents(overrideRaw);
    if (allowOverride && overrideComponents.length > 0) return overrideComponents;

    const templateComponents = normalizeAssessmentComponents(course?.assessmentComponents || course?.assessment_components || course?.templateComponents);
    if (templateComponents.length > 0) return templateComponents;

    const fallback = [
        { key: "mid1", label_ar: "ميد 1", label_en: "Mid 1", max_marks: getCourseCycleMax(course, "mid1", 15, collegeDefaultsMap), display_order: 1 },
        { key: "mid2", label_ar: "ميد 2", label_en: "Mid 2", max_marks: getCourseCycleMax(course, "mid2", 15, collegeDefaultsMap), display_order: 2 },
        { key: "coursework", label_ar: "أعمال السنة", label_en: "Year Work", max_marks: getCourseCycleMax(course, "yearWork", 30, collegeDefaultsMap), display_order: 3 },
        { key: "final", label_ar: "النهائي", label_en: "Final", max_marks: getCourseCycleMax(course, "final", 40, collegeDefaultsMap), display_order: 4 },
    ];
    return normalizeAssessmentComponents(fallback.filter((item) => Number(item.max_marks || 0) > 0));
};
const getCycleMetaForCourse = (course, cycleKey, collegeDefaultsMap = null) => {
    const normalizedCycle = normalizeCycle(cycleKey);
    const components = getCourseAssessmentComponents(course, collegeDefaultsMap);
    const fromComponents = components.find((item) => String(item.key) === normalizedCycle);
    if (fromComponents) return fromComponents;
    const fallback = GRADE_CYCLES[normalizedCycle];
    if (!fallback) return null;
    return {
        key: normalizedCycle,
        label_ar: GRADE_CYCLES_AR[normalizedCycle] || fallback.label || normalizedCycle,
        label_en: fallback.label || normalizedCycle,
        max_marks: Number(fallback.max || 0),
        field: fallback.field || LEGACY_CYCLE_FIELD_MAP[normalizedCycle] || null,
    };
};
const getComponentValue = (row, component) => {
    if (!component) return "";
    const key = String(component.key || "");
    const legacyReader = LEGACY_ROW_VALUE_BY_KEY[key];
    if (typeof legacyReader === "function") return legacyReader(row) ?? "";
    const scores = row?.componentScores && typeof row.componentScores === "object" ? row.componentScores : {};
    return scores[key] ?? "";
};
const setComponentValue = (row, component, value) => {
    const next = { ...row };
    const key = String(component?.key || "");
    const legacyField = LEGACY_CYCLE_FIELD_MAP[key];
    if (legacyField) {
        next[legacyField] = value;
        if (legacyField === "yearWork") next.ywork = value;
        return next;
    }
    const prevScores = row?.componentScores && typeof row.componentScores === "object" ? row.componentScores : {};
    next.componentScores = { ...prevScores, [key]: value };
    return next;
};
const sumRowComponents = (row, components = []) =>
    (Array.isArray(components) ? components : []).reduce((acc, component) => acc + toNum(getComponentValue(row, component), 0), 0);

const selectionKey = (academicYear, semester, cycle) => `${academicYear || ""}__${semester || ""}__${cycle || ""}`;
const getRowStorageKey = (item) => `${item.studentId}__${item.code}__${item.semester}__${item.academicYear || ""}`;
const normalizeStudentId = (value) => String(value || "").trim();
const normalizeCourseCode = (value) => String(value || "").trim().toUpperCase();
const normalizeCourseRef = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const hasArabicChars = (value) => /[\u0600-\u06FF]/.test(String(value || ""));
const pickPreferredDisplayName = (candidates = []) => {
    const clean = candidates.map((item) => String(item || "").trim()).filter(Boolean);
    if (!clean.length) return "";
    const arabic = clean.filter((item) => hasArabicChars(item));
    const pool = arabic.length ? arabic : clean;
    return pool.sort((a, b) => b.length - a.length)[0];
};
const normalizeKey = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/ـ/g, "");
const compactKey = (value) => normalizeKey(value).replace(/\s+/g, "");
const normalizeCollegeScope = (value) => compactKey(value);
const hasAnyRecordedGrade = (row = {}) => {
    const directValues = [row?.mid1, row?.mid2, row?.yearWork ?? row?.ywork, row?.final, row?.total, row?.grade];
    if (directValues.some((value) => String(value ?? "").trim() !== "")) return true;
    const componentScores = row?.componentScores;
    if (!componentScores || typeof componentScores !== "object") return false;
    return Object.values(componentScores).some((value) => String(value ?? "").trim() !== "");
};
const isRowEligibleForGradesView = (row = {}) => {
    const status = String(row?.status || "").trim().toLowerCase();
    if (APPROVED_REGISTRATION_STATUSES.has(status)) return true;
    // Keep legacy graded rows visible even if they were saved before status hardening.
    return hasAnyRecordedGrade(row);
};
const getCollegeCandidates = (...values) => {
    const keys = new Set();
    values.forEach((value) => {
        const normalized = normalizeKey(value);
        const compact = compactKey(value);
        if (normalized) keys.add(normalized);
        if (compact) keys.add(compact);
        if (COLLEGE_ALIAS_TO_KEY[normalized]) keys.add(COLLEGE_ALIAS_TO_KEY[normalized]);
        if (COLLEGE_ALIAS_TO_KEY[compact]) keys.add(COLLEGE_ALIAS_TO_KEY[compact]);
    });
    return Array.from(keys);
};
const courseMatchesCollegeScope = (course, collegeScope) => {
    const scope = normalizeCollegeScope(collegeScope);
    if (!scope) return true;
    return getCollegeCandidates(course?.collegeId, course?.college_id, course?.college, course?.faculty).some((item) => normalizeCollegeScope(item) === scope);
};
const toPositiveNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
};
const extractPolicyGradeDefaults = (policy = {}) => {
    const candidate = (policy?.gradeCycles && typeof policy.gradeCycles === "object")
        ? policy.gradeCycles
        : (policy?.grading?.cycles && typeof policy.grading?.cycles === "object")
        ? policy.grading.cycles
        : (policy?.markingSchemeDefault && typeof policy.markingSchemeDefault === "object")
        ? policy.markingSchemeDefault
        : {};

    const mid1 = toPositiveNumber(candidate.mid1 ?? policy.max_mid1 ?? policy.maxMid1);
    const mid2 = toPositiveNumber(candidate.mid2 ?? policy.max_mid2 ?? policy.maxMid2);
    const yearWork = toPositiveNumber(candidate.yearWork ?? candidate.ywork ?? policy.max_coursework ?? policy.maxCoursework);
    const final = toPositiveNumber(candidate.final ?? policy.max_final ?? policy.maxFinal);

    if (!mid1 && !mid2 && !yearWork && !final) return null;
    return {
        mid1: mid1 ?? COLLEGE_GRADE_DEFAULTS.default.mid1,
        mid2: mid2 ?? COLLEGE_GRADE_DEFAULTS.default.mid2,
        yearWork: yearWork ?? COLLEGE_GRADE_DEFAULTS.default.yearWork,
        final: final ?? COLLEGE_GRADE_DEFAULTS.default.final,
    };
};

const parseSafe = (value, fallback) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const toNum = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const AUDIT_ACTION_META = {
    import_confirmed: { label: "تأكيد رفع الدرجات", tone: "info" },
    template_downloaded: { label: "تحميل قالب الدرجات", tone: "neutral" },
    manual_edit_saved: { label: "حفظ تعديل يدوي", tone: "success" },
    selection_reviewed: { label: "تحويل الحالة إلى تحت المراجعة", tone: "warning" },
    selection_published: { label: "نشر الدرجات", tone: "success" },
    selection_back_to_draft: { label: "إرجاع الحالة إلى مسودة", tone: "warning" },
    scope_migrated: { label: "ترحيل نطاق الدرجات", tone: "info" },
    scope_cleared: { label: "مسح نطاق الدرجات", tone: "danger" },
    snapshot_restored: { label: "استرجاع نسخة احتياطية", tone: "info" },
};
const getAuditToneClasses = (tone) => {
    if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
    if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
    if (tone === "info") return "border-cyan-200 bg-cyan-50 text-cyan-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
};

const csvEscape = (value) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
        return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
};

const downloadCsv = (filename, rows) => {
    if (!rows?.length) return;
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(",")];
    rows.forEach((row) => {
        lines.push(headers.map((h) => csvEscape(row[h])).join(","));
    });
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

const normalizeCycle = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    const compact = raw.replace(/\s+/g, "");
    if (raw === "mid1" || raw === "mid 1") return "mid1";
    if (raw === "mid2" || raw === "mid 2") return "mid2";
    if (raw === "yearwork" || raw === "year work" || raw === "ywork") return "coursework";
    if (raw === "coursework") return "coursework";
    if (compact === "اعمالالسنة" || compact === "أعمالالسنة") return "coursework";
    if (compact === "عملي" || raw === "practical") return "practical";
    if (compact === "شفوي" || raw === "oral") return "oral";
    if (compact === "كويز" || raw === "quiz") return "quiz";
    if (compact === "اسايمنت" || raw === "assignment") return "assignment";
    if (raw === "final") return "final";
    return raw;
};
const resolveScoreFromTemplateRow = (row, cycle, cycleMeta = null) => {
    const direct = Number(row.score);
    if (Number.isFinite(direct)) return direct;
    const aliasesByCycle = {
        mid1: ["Mid 1", "mid1", "Mid1", "ميد 1", "ميد1"],
        mid2: ["Mid 2", "mid2", "Mid2", "ميد 2", "ميد2"],
        yearWork: ["أعمال السنة", "Year Work", "yearWork", "year_work", "ywork"],
        coursework: ["أعمال السنة", "Year Work", "yearWork", "year_work", "ywork", "coursework"],
        final: ["النهائي", "Final", "final"],
    };
    const aliases = [...(aliasesByCycle[cycle] || [])];
    if (cycleMeta?.label_ar) aliases.push(String(cycleMeta.label_ar));
    if (cycleMeta?.label_en) aliases.push(String(cycleMeta.label_en));
    if (cycleMeta?.key) aliases.push(String(cycleMeta.key));
    for (const key of aliases) {
        const candidate = Number(row[key]);
        if (Number.isFinite(candidate)) return candidate;
    }
    return Number.NaN;
};
const normalizeImportedTemplateRows = (rows = []) => {
    return (Array.isArray(rows) ? rows : []).map((row) => {
        const next = {};
        Object.entries(IMPORT_HEADER_ALIASES).forEach(([canonical, aliases]) => {
            const found = aliases.find((key) => Object.prototype.hasOwnProperty.call(row || {}, key));
            if (found) next[canonical] = row[found];
        });
        return next;
    });
};

const getCollegeCycleDefaultMax = (cycle, course, collegeDefaultsMap = null) => {
    const normalizedCycle = cycle === "coursework" ? "yearWork" : cycle;
    const sourceMap = collegeDefaultsMap && typeof collegeDefaultsMap === "object" ? collegeDefaultsMap : COLLEGE_GRADE_DEFAULTS;
    const collegeDefaults =
        getCollegeCandidates(course?.collegeId, course?.college_id, course?.college, course?.faculty)
            .map((key) => sourceMap[key])
            .find((entry) => entry && typeof entry === "object") || sourceMap.default || COLLEGE_GRADE_DEFAULTS.default;
    return Number(
        collegeDefaults?.[normalizedCycle] ??
            sourceMap?.default?.[normalizedCycle] ??
            COLLEGE_GRADE_DEFAULTS.default?.[normalizedCycle] ??
            GRADE_CYCLES[normalizedCycle]?.max ??
            15
    );
};

const getCourseCycleMax = (course, cycle, fallback, collegeDefaultsMap = null) => {
    const normalizedCycle = cycle === "coursework" ? "yearWork" : cycle;
    const baseFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : getCollegeCycleDefaultMax(normalizedCycle, course, collegeDefaultsMap);
    if (!course) return baseFallback;
    const scheme = course.markingScheme && typeof course.markingScheme === "object" ? course.markingScheme : null;
    if (scheme && Number.isFinite(Number(scheme[normalizedCycle])) && Number(scheme[normalizedCycle]) > 0) return Number(scheme[normalizedCycle]);

    if (normalizedCycle === "mid1" && Number.isFinite(Number(course.mid1)) && Number(course.mid1) > 0) return Number(course.mid1);
    if (normalizedCycle === "mid2" && Number.isFinite(Number(course.mid2)) && Number(course.mid2) > 0) return Number(course.mid2);
    if (normalizedCycle === "yearWork" && Number.isFinite(Number(course.yearWork ?? course.ywork)) && Number(course.yearWork ?? course.ywork) > 0) return Number(course.yearWork ?? course.ywork);
    if (normalizedCycle === "final" && Number.isFinite(Number(course.final)) && Number(course.final) > 0) return Number(course.final);
    return baseFallback;
};

const getCourseTotalMax = (course, collegeDefaultsMap = null) => {
    const components = getCourseAssessmentComponents(course, collegeDefaultsMap);
    if (components.length > 0) {
        return components.reduce((sum, item) => sum + Number(item?.max_marks || 0), 0);
    }
    return (
        getCourseCycleMax(course, "mid1", getCollegeCycleDefaultMax("mid1", course, collegeDefaultsMap), collegeDefaultsMap) +
        getCourseCycleMax(course, "mid2", getCollegeCycleDefaultMax("mid2", course, collegeDefaultsMap), collegeDefaultsMap) +
        getCourseCycleMax(course, "yearWork", getCollegeCycleDefaultMax("yearWork", course, collegeDefaultsMap), collegeDefaultsMap) +
        getCourseCycleMax(course, "final", getCollegeCycleDefaultMax("final", course, collegeDefaultsMap), collegeDefaultsMap)
    );
};

const gradeToPoints = (grade) => {
    if (!grade) return 0.0;
    const pointsMap = {
        "A+": 4.0,
        A: 4.0,
        "A-": 3.7,
        "B+": 3.3,
        B: 3.0,
        "B-": 2.7,
        "C+": 2.3,
        C: 2.0,
        "C-": 1.7,
        "D+": 1.3,
        D: 1.0,
        F: 0.0,
    };
    return pointsMap[String(grade).toUpperCase().trim()] || 0.0;
};

const calculateGpa = (courses) => {
    if (!courses?.length) return 0.0;
    let totalPoints = 0;
    let totalCredits = 0;
    courses.forEach((course) => {
        const credits = parseFloat(course.credits) || 0;
        totalPoints += gradeToPoints(course.grade) * credits;
        totalCredits += credits;
    });
    return totalCredits > 0 ? totalPoints / totalCredits : 0.0;
};

export default function AdminDashboard() {
    const { academicRecords, mergeGradeRecords, updateAcademicRecord, setAcademicRecords, courses, openSemesters, semesterNames, registrationSettings } = useContext(SystemContext);
    const { t } = useTranslation("admin");
    const [allData, setAllData] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [isConfirmingImport, setIsConfirmingImport] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);
    const [selectedFileName, setSelectedFileName] = useState("");
    const [editingIndex, setEditingIndex] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [usersList, setUsersList] = useState([]);
    const [usersLoaded, setUsersLoaded] = useState(false);
    const [usersLoadFailed, setUsersLoadFailed] = useState(false);
    const [pendingImport, setPendingImport] = useState(null);
    const [publishMap, setPublishMap] = useState(() => parseSafe(localStorage.getItem(GRADE_PUBLISH_STATUS_KEY) || "{}", {}));
    const [auditLog, setAuditLog] = useState(() => parseSafe(localStorage.getItem(GRADE_AUDIT_LOG_KEY) || "[]", []));
    const [snapshots, setSnapshots] = useState(() => parseSafe(localStorage.getItem(GRADE_SNAPSHOTS_KEY) || "[]", []));

    const [gradeConfig, setGradeConfig] = useState(() => {
        const firstOpenSemester = Object.entries(openSemesters || {}).find(([, isOpen]) => Boolean(isOpen))?.[0] || "autumn";
        const loggedUser = parseSafe(localStorage.getItem("loggedUser") || "{}", {});
        return {
            academicYear: getCurrentAcademicYear(),
            semester: firstOpenSemester,
            gradeCycle: "mid1",
            collegeScope: normalizeCollegeScope(loggedUser?.collegeId || loggedUser?.college || loggedUser?.faculty || ""),
            studyYear: "",
            courseCode: "",
            section: "",
            maxScore: GRADE_CYCLES.mid1.max,
        };
    });

    const getRowKey = (item) => getRowStorageKey(item);
    const fetchGradesFromApi = async (entries = []) => {
        if (!entries.length) return new Map();
        const res = await fetch(`${API_BASE_URL}/api/gpa/grade-from-score`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data?.detail || "تعذر حساب التقدير من الخادم");
        }
        const results = Array.isArray(data?.results) ? data.results : [];
        return new Map(results.map((item) => [String(item.item_key || ""), String(item.grade || "")]));
    };

    useEffect(() => {
        setAllData(Array.isArray(academicRecords) ? academicRecords : []);
    }, [academicRecords]);

    useEffect(() => {
        if (!uploadStatus) return undefined;
        const timer = setTimeout(() => setUploadStatus(null), 4500);
        return () => clearTimeout(timer);
    }, [uploadStatus]);

    useEffect(() => {
        localStorage.setItem(GRADE_PUBLISH_STATUS_KEY, JSON.stringify(publishMap));
    }, [publishMap]);

    useEffect(() => {
        localStorage.setItem(GRADE_AUDIT_LOG_KEY, JSON.stringify(auditLog));
    }, [auditLog]);

    useEffect(() => {
        localStorage.setItem(GRADE_SNAPSHOTS_KEY, JSON.stringify(snapshots));
    }, [snapshots]);

    useEffect(() => {
        if (!window.XLSX) {
            const script = document.createElement("script");
            script.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
            script.async = true;
            document.body.appendChild(script);
        }
    }, []);

    useEffect(() => {
        const loadUsers = async () => {
            try {
                setUsersLoadFailed(false);
                const token = localStorage.getItem("access_token") || "";
                const res = await fetch(`${API_BASE_URL}/api/users`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setUsersLoadFailed(true);
                    return;
                }
                const parsedUsers = Array.isArray(data)
                    ? data
                    : Array.isArray(data.users)
                    ? data.users
                    : Array.isArray(data.data)
                    ? data.data
                    : [];
                setUsersList(parsedUsers);
            } catch {
                setUsersLoadFailed(true);
                setUsersList([]);
            } finally {
                setUsersLoaded(true);
            }
        };
        loadUsers();
    }, []);

    const usersLookup = useMemo(() => {
        const map = new Map();
        usersList.forEach((u) => {
            const username = String(u.username || "");
            const studentId = normalizeStudentId(u.studentId || u.student_code || u.studentCode || "");
            if (username) map.set(`username:${username}`, u);
            if (studentId) map.set(`studentId:${studentId}`, u);
        });
        return map;
    }, [usersList]);
    const officialNameByStudentId = useMemo(() => {
        const bucket = new Map();
        const appendName = (sid, ...names) => {
            const key = normalizeStudentId(sid);
            if (!key) return;
            const prev = bucket.get(key) || [];
            bucket.set(key, [...prev, ...names]);
        };

        usersList.forEach((u) => {
            const sid = normalizeStudentId(u.studentId || u.student_code || u.studentCode || "");
            const fallbackSid = normalizeStudentId(u.username || "");
            appendName(sid, u.full_name, u.name, u.displayName, u.display_name, u.universityName);
            appendName(fallbackSid, u.full_name, u.name, u.displayName, u.display_name, u.universityName);
        });
        allData.forEach((row) => {
            appendName(row.studentId, row.studentName);
            appendName(row.username, row.studentName);
        });

        const result = new Map();
        bucket.forEach((names, sid) => {
            result.set(sid, pickPreferredDisplayName(names));
        });
        return result;
    }, [usersList, allData]);

    const coursesLookup = useMemo(() => {
        const map = new Map();
        (Array.isArray(courses) ? courses : []).forEach((course) => {
            const code = String(course.code || course.id || "");
            if (!code) return;
            map.set(code, course);
            map.set(normalizeCourseCode(code), course);
        });
        return map;
    }, [courses]);
    const resolveCourseByCode = (code) => coursesLookup.get(String(code || "")) || coursesLookup.get(normalizeCourseCode(code)) || null;
    const resolveCourseByReference = (value) => {
        const byCode = resolveCourseByCode(value);
        if (byCode) return byCode;
        const ref = normalizeCourseRef(value);
        if (!ref) return null;
        return (Array.isArray(courses) ? courses : []).find((course) => normalizeCourseRef(course?.name || course?.title || "") === ref) || null;
    };
    const rowMatchesCollegeScope = (row) => {
        if (!gradeConfig.collegeScope) return true;
        const rowCourse = resolveCourseByCode(row?.code || row?.courseCode || "");
        if (!rowCourse) return false;
        return courseMatchesCollegeScope(rowCourse, gradeConfig.collegeScope);
    };
    const courseMatchesStudyYear = (courseLike, studyYear) => {
        if (!studyYear) return true;
        const targetYear = normalizeAcademicYearValue(studyYear, "");
        if (!targetYear) return true;
        const rowYear = normalizeAcademicYearValue(courseLike?.year ?? courseLike?.level ?? courseLike?.academicYear ?? "", "");
        return rowYear === targetYear;
    };
    const rowMatchesSectionScope = (row) => {
        const targetSection = String(gradeConfig.section || "").trim().toUpperCase();
        if (!targetSection) return true;
        return String(row?.section || "").trim().toUpperCase() === targetSection;
    };
    const collegeScopeOptions = useMemo(() => {
        const seen = new Set();
        const rows = [];
        (Array.isArray(courses) ? courses : []).forEach((course) => {
            const candidates = [
                course?.college,
                course?.faculty,
                course?.collegeName,
                course?.collegeId,
                course?.college_id,
            ];
            const label = candidates.map((item) => String(item || "").trim()).find(Boolean) || "";
            const value = normalizeCollegeScope(label);
            if (!value || seen.has(value)) return;
            seen.add(value);
            rows.push({ value, label });
        });
        return rows.sort((a, b) => String(a.label).localeCompare(String(b.label), "ar"));
    }, [courses]);
    const scopedYearOptions = useMemo(() => {
        const yearSet = new Set();
        (Array.isArray(courses) ? courses : [])
            .filter((course) => normalizeSemesterValue(course.semester || "", "") === normalizeSemesterValue(gradeConfig.semester || "", ""))
            .filter((course) => courseMatchesCollegeScope(course, gradeConfig.collegeScope))
            .forEach((course) => {
                const year = normalizeAcademicYearValue(course?.year ?? "", "");
                if (year) yearSet.add(year);
            });
        return Array.from(yearSet).sort((a, b) => Number(a) - Number(b));
    }, [courses, gradeConfig.semester, gradeConfig.collegeScope]);
    const scopedCourseOptions = useMemo(
        () =>
            (Array.isArray(courses) ? courses : [])
                .filter((course) => normalizeSemesterValue(course.semester || "", "") === normalizeSemesterValue(gradeConfig.semester || "", ""))
                .filter((course) => courseMatchesCollegeScope(course, gradeConfig.collegeScope))
                .filter((course) => courseMatchesStudyYear(course, gradeConfig.studyYear))
                .map((course) => ({
                    code: String(course.code || course.id || ""),
                    year: normalizeAcademicYearValue(course?.year ?? "", ""),
                }))
                .filter((item) => item.code)
                .sort((a, b) => `${a.year}-${a.code}`.localeCompare(`${b.year}-${b.code}`, "ar")),
        [courses, gradeConfig.semester, gradeConfig.collegeScope, gradeConfig.studyYear]
    );
    const scopedSectionOptions = useMemo(() => {
        const sectionSet = new Set();
        allData
            .filter((item) => String(item.academicYear || "") === String(gradeConfig.academicYear || ""))
            .filter((item) => normalizeSemesterValue(item.semester || "", "") === normalizeSemesterValue(gradeConfig.semester || "", ""))
            .filter((item) => !gradeConfig.courseCode || normalizeCourseCode(item.code || "") === normalizeCourseCode(gradeConfig.courseCode || ""))
            .forEach((item) => {
                const section = String(item.section || "").trim();
                if (section) sectionSet.add(section);
            });
        if (sectionSet.size === 0) {
            const selected = gradeConfig.courseCode ? resolveCourseByCode(gradeConfig.courseCode) : null;
            const groups = Array.isArray(selected?.groups) ? selected.groups : [];
            groups.forEach((group) => {
                const id = String(group?.id || group?.name || "").trim();
                if (id) sectionSet.add(id);
            });
        }
        return Array.from(sectionSet).sort((a, b) => a.localeCompare(b, "ar"));
    }, [allData, gradeConfig.academicYear, gradeConfig.semester, gradeConfig.courseCode]);

    const collegeGradeDefaultsMap = useMemo(() => {
        const map = { ...COLLEGE_GRADE_DEFAULTS };
        const policies = registrationSettings?.collegePolicies && typeof registrationSettings.collegePolicies === "object"
            ? registrationSettings.collegePolicies
            : {};
        Object.entries(policies).forEach(([policyKey, policyValue]) => {
            const extracted = extractPolicyGradeDefaults(policyValue);
            if (!extracted) return;
            const aliases = getCollegeCandidates(
                policyKey,
                policyValue?.collegeId,
                policyValue?.college_id,
                policyValue?.college,
                policyValue?.collegeName,
                policyValue?.faculty
            );
            aliases.forEach((key) => {
                map[key] = { ...map.default, ...extracted };
            });
        });
        return map;
    }, [registrationSettings]);

    const selectedCourse = gradeConfig.courseCode ? resolveCourseByCode(gradeConfig.courseCode) : null;
    const selectedCourseComponents = useMemo(() => getCourseAssessmentComponents(selectedCourse, collegeGradeDefaultsMap), [selectedCourse, collegeGradeDefaultsMap]);
    const activeCycleOptions = useMemo(() => {
        if (!selectedCourse || selectedCourseComponents.length === 0) {
            return Object.entries(GRADE_CYCLES).map(([key, item]) => ({
                key,
                label_ar: GRADE_CYCLES_AR[key] || item.label || key,
                label_en: item.label || key,
                max_marks: Number(item.max || 0),
                field: item.field || null,
            }));
        }
        return selectedCourseComponents.map((item) => ({
            ...item,
            key: normalizeCycle(item.key),
            field: item.field || LEGACY_CYCLE_FIELD_MAP[normalizeCycle(item.key)] || null,
        }));
    }, [selectedCourse, selectedCourseComponents]);
    const currentCycleMeta =
        activeCycleOptions.find((item) => String(item.key || "") === String(gradeConfig.gradeCycle || "")) ||
        activeCycleOptions[0] || {
            key: "mid1",
            label_ar: GRADE_CYCLES_AR.mid1,
            label_en: "Mid 1",
            max_marks: 15,
            field: "mid1",
        };
    const cycleMaxFromCourse = Number(currentCycleMeta?.max_marks || 0) || getCourseCycleMax(
        selectedCourse,
        gradeConfig.gradeCycle,
        getCollegeCycleDefaultMax(gradeConfig.gradeCycle, selectedCourse, collegeGradeDefaultsMap),
        collegeGradeDefaultsMap
    );
    const isCourseSchemeActive = Boolean(selectedCourse);
    const resolveOfficialStudentName = (row = {}, fallbackUser = null) => {
        const sid = normalizeStudentId(row.studentId || "");
        const uname = normalizeStudentId(row.username || "");
        const linkedUser =
            fallbackUser ||
            usersLookup.get(`username:${String(row.username || "")}`) ||
            usersLookup.get(`studentId:${normalizeStudentId(row.studentId || "")}`) ||
            null;
        const bySid = officialNameByStudentId.get(sid) || officialNameByStudentId.get(uname) || "";
        return pickPreferredDisplayName([bySid, linkedUser?.full_name, linkedUser?.name, row.studentName]);
    };

    const scopedPublishKey = selectionKey(gradeConfig.academicYear, gradeConfig.semester, gradeConfig.gradeCycle);
    const currentPublishStatus = ["Draft", "Reviewed", "Published"].includes(publishMap[scopedPublishKey]) ? publishMap[scopedPublishKey] : "Draft";
    const isPublishedLock = currentPublishStatus === "Published";

    useEffect(() => {
        if (!activeCycleOptions.length) return;
        const hasSelectedCycle = activeCycleOptions.some((item) => String(item.key || "") === String(gradeConfig.gradeCycle || ""));
        if (!hasSelectedCycle) {
            const first = activeCycleOptions[0];
            const firstMax = Math.max(1, Number(first?.max_marks || 0) || 1);
            setGradeConfig((prev) => ({ ...prev, gradeCycle: String(first?.key || "mid1"), maxScore: firstMax }));
            return;
        }
        const cycleMax = Math.max(1, Number(currentCycleMeta?.max_marks || 0) || 1);
        if (isCourseSchemeActive || !Number.isFinite(Number(gradeConfig.maxScore)) || Number(gradeConfig.maxScore) <= 0) {
            setGradeConfig((prev) => ({ ...prev, maxScore: cycleMax }));
        }
    }, [activeCycleOptions, currentCycleMeta, gradeConfig.gradeCycle, gradeConfig.maxScore, isCourseSchemeActive]);

    useEffect(() => {
        if (!isCourseSchemeActive) return;
        setGradeConfig((prev) => ({ ...prev, maxScore: Math.max(1, Number(cycleMaxFromCourse || 0) || 1) }));
    }, [isCourseSchemeActive, cycleMaxFromCourse]);

    const addAudit = (action, details = {}) => {
        const user = parseSafe(localStorage.getItem("loggedUser") || "{}", {});
        setAuditLog((prev) =>
            [
                {
                    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    at: new Date().toISOString(),
                    user: user?.username || user?.name || "admin",
                    action,
                    details,
                },
                ...prev,
            ].slice(0, 200)
        );
    };

    const pushSnapshot = (reason) => {
        const user = parseSafe(localStorage.getItem("loggedUser") || "{}", {});
        const snapshot = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            at: new Date().toISOString(),
            by: user?.username || user?.name || "admin",
            reason,
            data: allData,
            publishMap,
        };
        setSnapshots((prev) => [snapshot, ...prev].slice(0, MAX_SNAPSHOTS));
    };

    const restoreSnapshot = (snapshotId) => {
        const snapshot = snapshots.find((item) => item.id === snapshotId);
        if (!snapshot) return;
        setAcademicRecords(Array.isArray(snapshot.data) ? snapshot.data : []);
        setPublishMap(snapshot.publishMap && typeof snapshot.publishMap === "object" ? snapshot.publishMap : {});
        addAudit("snapshot_restored", { snapshotId, reason: snapshot.reason });
        setUploadStatus({ type: "success", title: "تم الاسترجاع", message: "تم استرجاع نسخة سابقة بنجاح" });
    };

    const displayData = useMemo(
        () =>
            allData
                .map((row) => {
                    const byUsername = usersLookup.get(`username:${String(row.username || "")}`);
                    const byStudentId = usersLookup.get(`studentId:${normalizeStudentId(row.studentId || "")}`);
                    const linkedUser = byUsername || byStudentId || null;
                    return {
                        ...row,
                        username: linkedUser?.username || row.username || row.studentId,
                        studentName: resolveOfficialStudentName(row, linkedUser),
                        grade: String(row.final ?? "").trim() === "" ? "" : row.grade,
                        role: linkedUser?.role || row.role || "student",
                    };
                })
                .filter((row) => {
                    if (!usersLoaded || usersLoadFailed) return true;
                    const sid = normalizeStudentId(row.studentId || "");
                    const uname = String(row.username || "");
                    const linkedUser = usersLookup.get(`studentId:${sid}`) || usersLookup.get(`username:${uname}`) || null;
                    return Boolean(linkedUser);
                })
                .filter((row) => String(row.role || "").toLowerCase() !== "admin")
                .filter((row) => isRowEligibleForGradesView(row)),
        [allData, usersLookup, officialNameByStudentId, usersLoaded, usersLoadFailed]
    );

    const filteredData = useMemo(() => {
        const q = searchTerm.toLowerCase().trim();
        return displayData.filter((item) => {
            const sameAcademicYear = String(item.academicYear || "") === String(gradeConfig.academicYear || "");
            const sameSemester = normalizeSemesterValue(item.semester || "", "") === normalizeSemesterValue(gradeConfig.semester || "", "");
            const sameCourse = !gradeConfig.courseCode || normalizeCourseCode(item.code || "") === normalizeCourseCode(gradeConfig.courseCode || "");
            const sameCollegeScope = rowMatchesCollegeScope(item);
            const rowCourse = resolveCourseByCode(item?.code || "");
            const sameStudyYear = courseMatchesStudyYear(rowCourse || item, gradeConfig.studyYear);
            const sameSection = rowMatchesSectionScope(item);
            const sid = String(item.studentId || "").toLowerCase();
            const uname = String(item.username || "").toLowerCase();
            const sname = String(item.studentName || "").toLowerCase();
            const cname = String(item.name || "").toLowerCase();

            if (!q) return sameAcademicYear && sameSemester && sameCourse && sameCollegeScope && sameStudyYear && sameSection;

            const matchesQuery = sid.includes(q) || uname.includes(q) || sname.includes(q) || cname.includes(q);
            // During search, don't force year/semester scope so students from other years don't disappear.
            return sameCourse && sameCollegeScope && sameStudyYear && sameSection && matchesQuery;
        });
    }, [displayData, searchTerm, gradeConfig.academicYear, gradeConfig.semester, gradeConfig.courseCode, gradeConfig.collegeScope, gradeConfig.studyYear, gradeConfig.section]);
    const scopeStudentCount = useMemo(() => new Set(filteredData.map((item) => String(item.studentId || item.username || ""))).size, [filteredData]);
    const lastScopeAudit = useMemo(
        () =>
            (auditLog || []).find(
                (entry) => String(entry?.details?.selection || "") === String(scopedPublishKey || "")
            ) || null,
        [auditLog, scopedPublishKey]
    );
    const academicYearOptions = useMemo(() => {
        const yearSet = new Set();
        yearSet.add(String(getCurrentAcademicYear() || "").trim());
        yearSet.add(String(gradeConfig.academicYear || "").trim());
        displayData.forEach((item) => {
            const year = String(item?.academicYear || "").trim();
            if (year) yearSet.add(year);
        });
        return Array.from(yearSet).filter(Boolean).sort().reverse();
    }, [displayData, gradeConfig.academicYear]);
    const scopeMigrationCandidates = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return displayData.filter((item) => {
            const sameCourse = !gradeConfig.courseCode || normalizeCourseCode(item.code || "") === normalizeCourseCode(gradeConfig.courseCode || "");
            const sameCollegeScope = rowMatchesCollegeScope(item);
            const rowCourse = resolveCourseByCode(item?.code || "");
            const sameStudyYear = courseMatchesStudyYear(rowCourse || item, gradeConfig.studyYear);
            const sameSection = rowMatchesSectionScope(item);
            if (!sameCourse || !sameCollegeScope || !sameStudyYear || !sameSection) return false;
            if (!q) return true;
            const sid = String(item.studentId || "").toLowerCase();
            const uname = String(item.username || "").toLowerCase();
            const sname = String(item.studentName || "").toLowerCase();
            const cname = String(item.name || "").toLowerCase();
            return sid.includes(q) || uname.includes(q) || sname.includes(q) || cname.includes(q);
        });
    }, [displayData, searchTerm, gradeConfig.courseCode, gradeConfig.collegeScope, gradeConfig.studyYear, gradeConfig.section]);

    const stats = useMemo(() => {
        if (!filteredData.length) return { avgGpa: 0, totalStudents: 0, totalCredits: 0 };

        const studentGroups = filteredData.reduce((acc, curr) => {
            const sid = String(curr.username || curr.studentId);
            if (!acc[sid]) acc[sid] = [];
            acc[sid].push(curr);
            return acc;
        }, {});

        const studentIds = Object.keys(studentGroups);
        const avgGpa = studentIds.length ? studentIds.map((id) => calculateGpa(studentGroups[id])).reduce((a, b) => a + b, 0) / studentIds.length : 0;
        const totalCredits = filteredData.reduce((acc, curr) => acc + (parseFloat(curr.credits) || 0), 0);

        return { avgGpa, totalStudents: studentIds.length, totalCredits };
    }, [filteredData]);
    const tableComponents = useMemo(() => {
        if (gradeConfig.courseCode) {
            const selected = resolveCourseByCode(gradeConfig.courseCode);
            const components = getCourseAssessmentComponents(selected, collegeGradeDefaultsMap);
            if (components.length > 0) return components;
        }
        const byKey = new Map();
        filteredData.forEach((row) => {
            const rowCourse = resolveCourseByCode(row?.code || row?.courseCode || "");
            const rowComponents = getCourseAssessmentComponents(rowCourse, collegeGradeDefaultsMap);
            rowComponents.forEach((component, index) => {
                const key = String(component?.key || "").trim();
                if (!key) return;
                if (!byKey.has(key)) {
                    byKey.set(key, {
                        ...component,
                        key,
                        display_order: Number(component?.display_order || index + 1),
                    });
                }
            });
        });
        if (byKey.size > 0) {
            return Array.from(byKey.values()).sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
        }
        return [
            { key: "mid1", label_ar: "ميد 1", max_marks: 15, field: "mid1" },
            { key: "mid2", label_ar: "ميد 2", max_marks: 15, field: "mid2" },
            { key: "coursework", label_ar: "أعمال السنة", max_marks: 30, field: "yearWork" },
            { key: "final", label_ar: "النهائي", max_marks: 40, field: "final" },
        ];
    }, [gradeConfig.courseCode, filteredData, courses, collegeGradeDefaultsMap]);

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file || !window.XLSX) return;
        setSelectedFileName(file.name || "");
        if (isPublishedLock) {
            setUploadStatus({ type: "error", title: "ممنوع التعديل", message: "الدورة منشورة. أعد الحالة إلى مسودة قبل الرفع." });
            return;
        }

        setIsUploading(true);
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = window.XLSX.read(data, { type: "array" });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawRows = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                const jsonData = normalizeImportedTemplateRows(rawRows);
                const headers = Object.keys(jsonData[0] || {});
                const missingHeaders = REQUIRED_TEMPLATE_HEADERS.filter((header) => !headers.includes(header));

                if (missingHeaders.length > 0) {
                    const missingAr = missingHeaders.map((header) => REQUIRED_HEADERS_AR_LABELS[header] || header);
                    setPendingImport({
                        fileName: file.name,
                        validRows: [],
                        errors: [{ rowNumber: 0, message: `الأعمدة الناقصة: ${missingAr.join(", ")}` }],
                    });
                    setUploadStatus({ type: "error", title: "قالب غير مطابق", message: `الأعمدة المطلوبة مفقودة: ${missingAr.join(", ")}` });
                    return;
                }

                const duplicates = new Set();
                const seen = new Set();
                const errors = [];
                const validRows = [];
                const selectedSemesterOpen = Boolean(openSemesters?.[gradeConfig.semester]);
                const selectedCycle = normalizeCycle(gradeConfig.gradeCycle);

                if (!selectedSemesterOpen) {
                    errors.push({ rowNumber: 0, message: "الفصل الدراسي المحدد غير مفتوح في الإعدادات" });
                }

                jsonData.forEach((row, index) => {
                    const rowNumber = index + 2;
                    const academicYear = String(row.academicYear || "").trim();
                    const semester = normalizeSemesterValue(row.semester || "", "");
                    const gradeCycle = normalizeCycle(row.gradeCycle || "");
                    const rawCourseRef = String(row.courseCode || "").trim();
                    const rowCourse = resolveCourseByReference(rawCourseRef);
                    const courseCode = normalizeCourseCode(rowCourse?.code || rawCourseRef);
                    const section = String(row.section || "").trim();
                    const studentId = String(row.studentId || "").trim();
                    const studentName = String(row.studentName || "").trim();
                    const username = String(row.username || "").trim();
                    const cycleMeta = getCycleMetaForCourse(rowCourse, selectedCycle, collegeGradeDefaultsMap);
                    const score = resolveScoreFromTemplateRow(row, selectedCycle, cycleMeta);
                    const fallbackMax = Number(cycleMeta?.max_marks || getCourseCycleMax(
                        rowCourse,
                        selectedCycle,
                        getCollegeCycleDefaultMax(selectedCycle, rowCourse, collegeGradeDefaultsMap),
                        collegeGradeDefaultsMap
                    ));
                    const maxScore = toNum(row.maxScore, fallbackMax);

                    const rowErrors = [];
                    if (!studentId) rowErrors.push("Student ID مطلوب");
                    if (!studentName) rowErrors.push("Student Name مطلوب");
                    if (!courseCode) rowErrors.push("Course Code مطلوب");
                    if (!Number.isFinite(score)) rowErrors.push("Score غير صالح");
                    if (Number.isFinite(score) && (score < 0 || score > maxScore)) rowErrors.push(`Score خارج النطاق 0..${maxScore}`);
                    if (academicYear !== gradeConfig.academicYear) rowErrors.push(`Academic Year يجب أن يساوي ${gradeConfig.academicYear}`);
                    if (semester !== gradeConfig.semester) rowErrors.push(`Semester يجب أن يساوي ${gradeConfig.semester}`);
                    if (gradeCycle !== selectedCycle) rowErrors.push(`Grade Cycle يجب أن يساوي ${selectedCycle}`);
                    if (gradeConfig.courseCode && normalizeCourseCode(courseCode) !== normalizeCourseCode(gradeConfig.courseCode)) rowErrors.push(`Course Code يجب أن يساوي ${gradeConfig.courseCode}`);
                    if (gradeConfig.section && section !== gradeConfig.section) rowErrors.push(`Section يجب أن يساوي ${gradeConfig.section}`);

                    const duplicateKey = `${studentId}__${courseCode}__${gradeCycle}`;
                    if (seen.has(duplicateKey)) duplicates.add(duplicateKey);
                    seen.add(duplicateKey);

                    const hasRecord = allData.some(
                        (item) =>
                            String(item.studentId || "") === studentId &&
                            normalizeCourseCode(item.code || "") === courseCode &&
                            normalizeSemesterValue(item.semester || "", "") === gradeConfig.semester &&
                            String(item.academicYear || "") === gradeConfig.academicYear
                    );
                    const hasStudentInScope = allData.some(
                        (item) =>
                            String(item.studentId || "") === studentId &&
                            normalizeSemesterValue(item.semester || "", "") === gradeConfig.semester &&
                            String(item.academicYear || "") === gradeConfig.academicYear
                    );
                    const knownUser = usersLookup.get(`studentId:${studentId}`) || usersLookup.get(`username:${username}`);

                    if (!rowCourse) rowErrors.push("المقرر غير موجود في الكتالوج");
                    if (rowCourse && normalizeSemesterValue(rowCourse.semester || "", "") !== gradeConfig.semester) rowErrors.push("المقرر لا ينتمي لنفس الفصل");
                    if (!hasRecord) rowErrors.push("الطالب غير مسجل بهذا المقرر/الفصل");
                    if (!knownUser && !hasStudentInScope) rowErrors.push("الطالب غير موجود في قاعدة المستخدمين أو في سجلات الشعبة الحالية");

                    if (rowErrors.length) {
                        errors.push({ rowNumber, message: rowErrors.join(" | ") });
                        return;
                    }

                    validRows.push({
                        studentId,
                        studentName: knownUser?.full_name || studentName,
                        username,
                        courseCode,
                        section,
                        academicYear,
                        semester,
                        gradeCycle,
                        score,
                        maxScore,
                    });
                });

                if (duplicates.size > 0) {
                    errors.push({ rowNumber: 0, message: "يوجد تكرار لنفس الطالب في نفس المقرر ونفس دورة الدرجات داخل الملف" });
                }

                setPendingImport({
                    fileName: file.name,
                    validRows,
                    errors,
                });

                if (errors.length) {
                    setUploadStatus({ type: "error", title: "تم اكتشاف أخطاء", message: `سجلات صالحة: ${validRows.length} | أخطاء: ${errors.length}` });
                } else {
                    setUploadStatus({ type: "success", title: "جاهز للاعتماد", message: `فحص ناجح. السجلات الصالحة: ${validRows.length}` });
                }
            } catch {
                setUploadStatus({ type: "error", title: "خطأ", message: "خطأ في قراءة ملف الإكسيل" });
            } finally {
                setIsUploading(false);
            }
        };

        reader.readAsArrayBuffer(file);
    };

    const confirmImport = async () => {
        if (!pendingImport || pendingImport.validRows.length === 0) {
            setUploadStatus({ type: "error", title: "لا يوجد بيانات", message: "لا توجد سجلات صالحة للاعتماد" });
            return;
        }
        if (pendingImport.errors.length > 0) {
            setUploadStatus({ type: "error", title: "يوجد أخطاء", message: "صحّح الأخطاء أولًا ثم أعد الرفع" });
            return;
        }
        if (isPublishedLock) {
            setUploadStatus({ type: "error", title: "ممنوع التعديل", message: "الدورة منشورة بالفعل" });
            return;
        }

        setIsConfirmingImport(true);
        pushSnapshot("before_confirm_import");

        try {
            const existingMap = new Map(allData.map((item) => [getRowStorageKey(item), item]));
            const gradeApiEntries = [];
            const updates = pendingImport.validRows.map((row) => {
                const key = getRowStorageKey({ studentId: row.studentId, code: row.courseCode, semester: row.semester, academicYear: row.academicYear });
                const existing = existingMap.get(key) || {};
                const resolvedCourse = resolveCourseByCode(row.courseCode);
                const rowComponents = getCourseAssessmentComponents(resolvedCourse, collegeGradeDefaultsMap);
                const cycleMeta = getCycleMetaForCourse(resolvedCourse, row.gradeCycle, collegeGradeDefaultsMap) || { key: row.gradeCycle, field: null };
                const next = {
                    ...existing,
                    studentId: row.studentId,
                    username: row.username || existing.username || row.studentId,
                    studentName: resolveOfficialStudentName(
                        { studentId: row.studentId, username: row.username, studentName: row.studentName || existing.studentName },
                        usersLookup.get(`studentId:${normalizeStudentId(row.studentId)}`) || usersLookup.get(`username:${String(row.username || "")}`)
                    ),
                    code: row.courseCode,
                    name: existing.name || resolveCourseByCode(row.courseCode)?.name || "",
                    credits: toNum(existing.credits, toNum(resolveCourseByCode(row.courseCode)?.hours ?? resolveCourseByCode(row.courseCode)?.credits, 3)),
                    semester: row.semester,
                    academicYear: row.academicYear,
                    mid1: existing.mid1 ?? "",
                    mid2: existing.mid2 ?? "",
                    yearWork: existing.yearWork ?? "",
                    final: existing.final ?? "",
                    componentScores: existing.componentScores && typeof existing.componentScores === "object" ? existing.componentScores : {},
                    grade: existing.grade || "",
                    status: "graded",
                    section: row.section,
                    gradeCycle: row.gradeCycle,
                };
                const scored = setComponentValue(next, cycleMeta, row.score);
                const total = rowComponents.length > 0 ? sumRowComponents(scored, rowComponents) : (toNum(scored.mid1, 0) + toNum(scored.mid2, 0) + toNum(scored.yearWork, 0) + toNum(scored.final, 0));
                const finalMeta = getCycleMetaForCourse(resolvedCourse, "final", collegeGradeDefaultsMap);
                const finalValue = finalMeta ? getComponentValue(scored, finalMeta) : scored.final;
                scored.total = total;
                scored.grade = "";
                const hasFinalScore = String(finalValue ?? "").trim() !== "";
                if (hasFinalScore) {
                    const maxTotal = Math.max(1, getCourseTotalMax(resolvedCourse, collegeGradeDefaultsMap));
                    gradeApiEntries.push({ item_key: key, total, max_total: maxTotal });
                }
                return scored;
            });

            if (gradeApiEntries.length > 0) {
                const gradeMap = await fetchGradesFromApi(gradeApiEntries);
                updates.forEach((item) => {
                    const rowKey = getRowStorageKey(item);
                    if (gradeMap.has(rowKey)) {
                        item.grade = gradeMap.get(rowKey);
                    }
                });
            }

            mergeGradeRecords(updates);
            setPublishMap((prev) => ({ ...prev, [scopedPublishKey]: "Draft" }));
            addAudit("import_confirmed", { fileName: pendingImport.fileName, count: updates.length, selection: scopedPublishKey });
            setPendingImport(null);
            setUploadStatus({ type: "success", title: "تم الاعتماد", message: `تم اعتماد ${updates.length} سجل بنجاح` });
        } catch (error) {
            setUploadStatus({ type: "error", title: "خطأ", message: error?.message || "تعذر حساب التقدير من الخادم" });
        } finally {
            setIsConfirmingImport(false);
        }
    };

    const downloadErrorReport = () => {
        if (!pendingImport?.errors?.length) return;
        downloadCsv(
            `grade-import-errors-${Date.now()}.csv`,
            pendingImport.errors.map((item) => ({ rowNumber: item.rowNumber, message: item.message }))
        );
    };

    const buildTemplateRows = () => {
        const scopedRows = filteredData.length
            ? filteredData
            : allData.filter((item) => {
                  const sameAcademicYear = String(item.academicYear || "") === String(gradeConfig.academicYear || "");
                  const sameSemester = normalizeSemesterValue(item.semester || "", "") === normalizeSemesterValue(gradeConfig.semester || "", "");
                  const sameCourse = !gradeConfig.courseCode || normalizeCourseCode(item.code || "") === normalizeCourseCode(gradeConfig.courseCode || "");
                  const sameCollegeScope = rowMatchesCollegeScope(item);
                  const rowCourse = resolveCourseByCode(item?.code || "");
                  const sameStudyYear = courseMatchesStudyYear(rowCourse || item, gradeConfig.studyYear);
                  const sameSection = rowMatchesSectionScope(item);
                  return sameAcademicYear && sameSemester && sameCourse && sameCollegeScope && sameStudyYear && sameSection;
              });

        const baseRows = scopedRows.length
            ? scopedRows
            : [
                  {
                      studentId: "",
                      studentName: "",
                      username: "",
                      code: gradeConfig.courseCode || "",
                  },
              ];

        return baseRows.map((row) => {
            const courseCode = gradeConfig.courseCode || String(row.code || "");
            const resolvedCourse = resolveCourseByCode(courseCode);
            const cycleMeta = getCycleMetaForCourse(resolvedCourse, gradeConfig.gradeCycle, collegeGradeDefaultsMap);
            const maxScore = Math.max(1, Number(cycleMeta?.max_marks || getCourseCycleMax(resolvedCourse, gradeConfig.gradeCycle, gradeConfig.maxScore, collegeGradeDefaultsMap) || 1));
            const components = getCourseAssessmentComponents(resolvedCourse, collegeGradeDefaultsMap);
            const exportComponents = components.length > 0
                ? components
                : [
                      { key: "mid1", label_ar: "ميد 1" },
                      { key: "mid2", label_ar: "ميد 2" },
                      { key: "coursework", label_ar: "أعمال السنة" },
                      { key: "final", label_ar: "النهائي" },
                  ];
            const rowPayload = {
                المقرر: String(row.name || resolvedCourse?.name || courseCode || ""),
                الساعات: Number(row.credits || row.hours || resolvedCourse?.hours || resolvedCourse?.credits || 0),
                المجموع: row.total ?? "",
                التقدير: row.grade ?? "",
                العام: gradeConfig.academicYear,
                الفصل: semesterNames?.[gradeConfig.semester] || gradeConfig.semester,
                "دورة الدرجات": gradeConfig.gradeCycle,
                "كود المقرر": courseCode,
                الشعبة: gradeConfig.section || String(row.section || ""),
                "كود الطالب": String(row.studentId || ""),
                "اسم الطالب": String(row.studentName || ""),
                "اسم المستخدم": String(row.username || ""),
                الدرجة: "",
                "الحد الأقصى": maxScore,
                إجراء: "",
                ملاحظات: `اكتب الدرجة في ${GRADE_CYCLES_AR[gradeConfig.gradeCycle] || gradeConfig.gradeCycle}`,
            };
            exportComponents.forEach((component) => {
                const title = String(component?.label_ar || component?.label_en || component?.key || "").trim();
                if (!title) return;
                const value = getComponentValue(row, component);
                rowPayload[title] = String(component?.key || "") === String(gradeConfig.gradeCycle || "") ? "" : value;
            });
            return rowPayload;
        });
    };

    const downloadTemplate = () => {
        const templateRows = buildTemplateRows();
        downloadCsv(`grades-template-${gradeConfig.academicYear}-${gradeConfig.semester}-${gradeConfig.gradeCycle}.csv`, templateRows);
        addAudit("template_downloaded", { selection: scopedPublishKey, rows: templateRows.length });
    };
    const saveEdit = async () => {
        if (isPublishedLock) {
            setUploadStatus({ type: "error", title: "ممنوع التعديل", message: "لا يمكن تعديل بيانات منشورة" });
            return;
        }

        const rowCourse = resolveCourseByCode(editForm.code);
        const rowComponents = getCourseAssessmentComponents(rowCourse, collegeGradeDefaultsMap);
        const effectiveComponents = rowComponents.length > 0
            ? rowComponents
            : [
                  { key: "mid1", label_ar: "ميد 1", max_marks: getCourseCycleMax(rowCourse, "mid1", getCollegeCycleDefaultMax("mid1", rowCourse, collegeGradeDefaultsMap), collegeGradeDefaultsMap) },
                  { key: "mid2", label_ar: "ميد 2", max_marks: getCourseCycleMax(rowCourse, "mid2", getCollegeCycleDefaultMax("mid2", rowCourse, collegeGradeDefaultsMap), collegeGradeDefaultsMap) },
                  { key: "coursework", label_ar: "أعمال السنة", max_marks: getCourseCycleMax(rowCourse, "yearWork", getCollegeCycleDefaultMax("yearWork", rowCourse, collegeGradeDefaultsMap), collegeGradeDefaultsMap) },
                  { key: "final", label_ar: "النهائي", max_marks: getCourseCycleMax(rowCourse, "final", getCollegeCycleDefaultMax("final", rowCourse, collegeGradeDefaultsMap), collegeGradeDefaultsMap) },
              ];
        const normalized = {
            ...editForm,
            mid1: toNum(editForm.mid1, 0),
            mid2: toNum(editForm.mid2, 0),
            yearWork: toNum(editForm.yearWork, 0),
            final: toNum(editForm.final, 0),
            componentScores: editForm.componentScores && typeof editForm.componentScores === "object" ? { ...editForm.componentScores } : {},
        };
        const originalRow = allData.find((item) => getRowKey(item) === editingIndex) || null;
        const scoreChanged = effectiveComponents.some((component) => {
            const nextScore = toNum(getComponentValue(normalized, component), 0);
            const previousScore = toNum(getComponentValue(originalRow || {}, component), 0);
            return nextScore !== previousScore;
        });
        const invalid = effectiveComponents.find((component) => {
            const value = toNum(getComponentValue(normalized, component), 0);
            const max = Number(component?.max_marks || 0);
            return value < 0 || value > max;
        });
        if (invalid) {
            const cycleName = invalid?.label_ar || invalid?.label_en || invalid?.key || "الدرجة";
            setUploadStatus({ type: "error", title: "درجة غير صالحة", message: `${cycleName} يجب أن تكون بين 0 و ${Number(invalid?.max_marks || 0)}` });
            return;
        }

        pushSnapshot("before_manual_edit");
        const total = sumRowComponents(normalized, effectiveComponents);
        const finalMeta = getCycleMetaForCourse(rowCourse, "final", collegeGradeDefaultsMap);
        const hasFinalScoreInput = finalMeta ? String(getComponentValue(normalized, finalMeta) ?? "").trim() !== "" : String(editForm.final ?? "").trim() !== "";

        let grade = scoreChanged ? "" : String(originalRow?.grade || "");
        if (scoreChanged && hasFinalScoreInput) {
            try {
                const rowKey = getRowStorageKey(normalized);
                const maxTotal = Math.max(1, getCourseTotalMax(rowCourse, collegeGradeDefaultsMap));
                const gradeMap = await fetchGradesFromApi([{ item_key: rowKey, total, max_total: maxTotal }]);
                grade = gradeMap.get(rowKey) || "";
            } catch (error) {
                setUploadStatus({ type: "error", title: "خطأ", message: error?.message || "تعذر حساب التقدير من الخادم" });
                return;
            }
        }

        updateAcademicRecord({
            ...normalized,
            status: "graded",
            total,
            grade,
            previousRecordKey: editingIndex,
        });

        const oldYear = String(originalRow?.academicYear || "");
        const oldSemester = normalizeSemesterValue(originalRow?.semester || "", "");
        const newYear = String(normalized.academicYear || "");
        const newSemester = normalizeSemesterValue(normalized.semester || "", "");
        const yearOrSemesterChanged = Boolean(originalRow) && (oldYear !== newYear || oldSemester !== newSemester);

        // If admin changes student's year/semester in one row, propagate to same student's records in the same old scope.
        if (yearOrSemesterChanged) {
            setAcademicRecords((prev) =>
                prev.map((item) => {
                    const sameStudent = String(item.studentId || "") === String(normalized.studentId || "");
                    const sameOldScope = String(item.academicYear || "") === oldYear && normalizeSemesterValue(item.semester || "", "") === oldSemester;
                    if (!sameStudent || !sameOldScope) return item;
                    return {
                        ...item,
                        academicYear: newYear,
                        semester: newSemester,
                        semesterName: semesterNames?.[newSemester] || item.semesterName || newSemester,
                    };
                })
            );
        }

        setPublishMap((prev) => ({ ...prev, [scopedPublishKey]: "Draft" }));
        addAudit("manual_edit_saved", { studentId: normalized.studentId, code: normalized.code, selection: scopedPublishKey });
        setUploadStatus({ type: "success", title: "تم الحفظ", message: "تم حفظ التعديلات بنجاح" });
        setEditingIndex(null);
    };

    const markReviewed = () => {
        if (isPublishedLock) return;
        setPublishMap((prev) => ({ ...prev, [scopedPublishKey]: "Reviewed" }));
        addAudit("selection_reviewed", { selection: scopedPublishKey });
        setUploadStatus({ type: "success", title: "تمت المراجعة", message: "تم تحويل الحالة إلى تحت المراجعة" });
    };

    const publishResults = () => {
        if (currentPublishStatus !== "Reviewed") {
            setUploadStatus({ type: "error", title: "خطوة مفقودة", message: "حوّل الحالة إلى تحت المراجعة قبل النشر" });
            return;
        }
        if (!filteredData.length) {
            setUploadStatus({ type: "error", title: "لا توجد بيانات", message: "لا يمكن النشر بدون سجلات" });
            return;
        }
        setPublishMap((prev) => ({ ...prev, [scopedPublishKey]: "Published" }));
        addAudit("selection_published", { selection: scopedPublishKey, rows: filteredData.length });
        setUploadStatus({ type: "success", title: "تم النشر", message: "تم نشر نتائج الدورة الحالية للطلاب" });
    };

    const backToDraft = () => {
        setPublishMap((prev) => ({ ...prev, [scopedPublishKey]: "Draft" }));
        addAudit("selection_back_to_draft", { selection: scopedPublishKey });
        setUploadStatus({ type: "success", title: "تم الإرجاع", message: "تمت إعادة الحالة إلى مسودة" });
    };
    const applyScopeToCandidates = () => {
        if (isPublishedLock) {
            setUploadStatus({ type: "error", title: "ممنوع التعديل", message: "الدورة منشورة. أعد الحالة إلى مسودة أولًا." });
            return;
        }
        if (!searchTerm.trim() && !gradeConfig.courseCode) {
            setUploadStatus({ type: "error", title: "حدد الطالب أولًا", message: "اكتب كود/اسم الطالب أو اختر مقرر قبل تطبيق العام/الفصل." });
            return;
        }
        if (!scopeMigrationCandidates.length) {
            setUploadStatus({ type: "error", title: "لا توجد بيانات", message: "لا يوجد سجلات مطابقة لتطبيق العام/الفصل." });
            return;
        }

        pushSnapshot("before_scope_migration");
        const targetYear = String(gradeConfig.academicYear || "");
        const targetSemester = normalizeSemesterValue(gradeConfig.semester || "", "");
        const candidatesKeySet = new Set(scopeMigrationCandidates.map((item) => getRowStorageKey(item)));

        setAcademicRecords((prev) => {
            const dedup = new Map();
            prev.forEach((item) => {
                const rowKey = getRowStorageKey(item);
                const nextItem = candidatesKeySet.has(rowKey)
                    ? {
                          ...item,
                          academicYear: targetYear,
                          semester: targetSemester,
                          semesterName: semesterNames?.[targetSemester] || item.semesterName || targetSemester,
                      }
                    : item;
                dedup.set(getRowStorageKey(nextItem), nextItem);
            });
            return Array.from(dedup.values());
        });

        setPublishMap((prev) => ({ ...prev, [scopedPublishKey]: "Draft" }));
        addAudit("scope_migrated", { selection: scopedPublishKey, targetYear, targetSemester, count: scopeMigrationCandidates.length });
        setUploadStatus({ type: "success", title: "تم التطبيق", message: `تم تحديث العام/الفصل لـ ${scopeMigrationCandidates.length} سجل` });
    };

    const handleExportGradesPdf = () => {
        if (!filteredData.length) return;

        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const now = new Date();

        doc.setFontSize(14);
        doc.text("BNU - Grades Control Report", 40, 40);
        doc.setFontSize(10);
        doc.text(`Generated: ${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB")}`, 40, 58);
        doc.text(`Scope: ${gradeConfig.academicYear} / ${gradeConfig.semester} / ${gradeConfig.gradeCycle}`, 40, 74);
        doc.text(`Publish Status: ${currentPublishStatus}`, 40, 90);

        const rows = filteredData.map((item, index) => [
            index + 1,
            item.username || item.studentId || "-",
            item.studentName || "-",
            item.code || "-",
            item.name || "-",
            item.credits || "-",
            item.mid1 ?? "-",
            item.mid2 ?? "-",
            item.yearWork ?? "-",
            item.final ?? "-",
            item.total ?? "-",
            item.grade || "-",
            item.semester || "-",
            item.academicYear || "-",
        ]);

        autoTable(doc, {
            startY: 106,
            head: [["#", "Student ID", "Student Name", "Code", "Course", "Credits", "Mid1", "Mid2", "YearWork", "Final", "Total", "Grade", "Semester", "Academic Year"]],
            body: rows,
            styles: { fontSize: 8, halign: "center", valign: "middle" },
            headStyles: { fillColor: [5, 173, 207], textColor: [255, 255, 255], fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: 24, right: 24 },
        });

        doc.save(`grades-report-${gradeConfig.academicYear}-${gradeConfig.semester}-${gradeConfig.gradeCycle}.pdf`);
    };

    return (
        <div className="admin-grades-page min-h-screen bg-white font-sans text-right" dir="rtl">
            {uploadStatus && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-6 animate-bounce-in">
                    <div className={`rounded-2xl shadow-2xl p-4 flex items-start gap-4 border ${uploadStatus.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                        <div className={`p-2 rounded-xl ${uploadStatus.type === "success" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                            {uploadStatus.type === "success" ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
                        </div>
                        <div className="flex-1">
                            <h4 className="font-black text-sm">{uploadStatus.title}</h4>
                            <p className="text-xs mt-1 leading-relaxed opacity-90">{uploadStatus.message}</p>
                        </div>
                        <button onClick={() => setUploadStatus(null)} className="opacity-40 hover:opacity-100 transition-opacity">
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}

            <div className="grades-hero grades-top-shell relative overflow-hidden bg-[#05ADCF] text-white pt-12 pb-32 px-6 rounded-[2rem] mx-3 mt-3 shadow-[0_24px_70px_-30px_rgba(5,173,207,.65)]">
                <div className="grades-hero-glow pointer-events-none absolute -top-16 -left-10 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
                <div className="grades-hero-glow pointer-events-none absolute -bottom-20 right-10 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
                <div className="container mx-auto max-w-7xl">
                    <div className="flex justify-between items-center mb-10">
                        <div className="flex items-center gap-3 bg-white/15 backdrop-blur px-4 py-2 rounded-full border border-white/25 shadow-sm">
                            <GraduationCap className="text-white" size={20} />
                            <span className="text-sm font-black">{t("grade_control_batch_control")}</span>
                        </div>
                        <button className="grades-print-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black text-white hover:bg-slate-900 transition-colors shadow-sm" onClick={handleExportGradesPdf}>
                            <Printer size={16} />
                            <span className="text-xs font-black">{t("grade_control_print_pdf")}</span>
                        </button>
                    </div>

                    <div className="grid lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 space-y-4">
                            <h1 className="text-4xl font-black text-white">{t("grade_control_title")}</h1>
                            <p className="text-cyan-50 font-medium">{t("grade_control_scope_label")}:  {gradeConfig.academicYear} / {semesterNames?.[gradeConfig.semester] || gradeConfig.semester} / {gradeConfig.studyYear ? `السنة ${gradeConfig.studyYear}` : "كل السنوات"} / {gradeConfig.courseCode || "كل المقررات"} / {gradeConfig.section || "كل الشعب"} / {GRADE_CYCLES_AR[gradeConfig.gradeCycle] || gradeConfig.gradeCycle}</p>
                            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${
                                currentPublishStatus === "Published"
                                    ? "bg-cyan-100 text-cyan-800 border-cyan-200"
                                    : currentPublishStatus === "Reviewed"
                                    ? "bg-amber-100 text-amber-800 border-amber-200"
                                    : "bg-[#3a5068] text-[#f4f8fc] border-[#6e8ba8]"
                            }`}>
                                <ShieldCheck size={14} />
                                {t("grade_control_publish_status")}:  {getPublishStatusLabel(currentPublishStatus)}
                            </div>
                        </div>

                        <div className="lg:col-span-2 grid md:grid-cols-3 gap-4">
                            <div className="grades-stat-card bg-white rounded-3xl p-6 text-slate-900 shadow-xl border-t-4 border-cyan-500">
                                <span className="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-tighter">متوسط معدل الدفعة</span>
                                <div className="flex items-baseline gap-1" dir="ltr">
                                    <span className="text-4xl font-black">{stats.avgGpa.toFixed(2)}</span>
                                    <span className="text-sm font-bold text-slate-300">/ 4.0</span>
                                </div>
                            </div>
                            <div className="grades-stat-card bg-white border border-slate-200 rounded-3xl p-6 text-slate-800 shadow-sm">
                                <span className="text-[10px] font-black text-slate-500 block mb-1 uppercase">إجمالي الطلاب</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-4xl font-black">{stats.totalStudents}</span>
                                    <Users className="text-[#05ADCF]" size={24} />
                                </div>
                            </div>
                            <div className="grades-stat-card bg-white border border-slate-200 rounded-3xl p-6 text-slate-800 shadow-sm">
                                <span className="text-[10px] font-black text-slate-500 block mb-1 uppercase">إجمالي الساعات</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-4xl font-black">{stats.totalCredits}</span>
                                    <Clock className="text-[#05ADCF]" size={24} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <main className="grades-main container mx-auto px-6 -mt-16 pb-20 max-w-[98%] relative z-10">
                <div className="mb-4 flex items-center gap-2 text-xs font-bold text-slate-400">
                    <span className="text-white">{t("grade_control_breadcrumb_academic")}</span>
                    <ChevronRight size={12} className="text-white" />
                    <span className="text-white">{t("grade_control_breadcrumb_grade")}</span>
                </div>

                <div className="mb-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_40px_-28px_rgba(15,23,42,.45)]">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1.5 text-cyan-800">
                            <ShieldCheck size={16} className="text-cyan-700" />
                            <h3 className="text-xs font-black">{t("grade_control_truth_source")}</h3>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400">{t("grade_control_scope_config")}</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
                        <label className="text-[11px] font-bold text-slate-600">
                            العام الدراسي
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-cyan-400 focus:bg-white"
                                value={gradeConfig.academicYear}
                                onChange={(e) => setGradeConfig((prev) => ({ ...prev, academicYear: e.target.value, section: "" }))}
                            >
                                {academicYearOptions.map((year) => (
                                    <option key={`year-${year}`} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                            الفصل الدراسي
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-cyan-400 focus:bg-white"
                                value={gradeConfig.semester}
                                onChange={(e) => setGradeConfig((prev) => ({ ...prev, semester: e.target.value, courseCode: "", section: "" }))}
                            >
                                <option value="autumn">الخريف</option>
                                <option value="spring">الربيع</option>
                                <option value="summer">الصيفي</option>
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                            الكلية
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-cyan-400 focus:bg-white"
                                value={gradeConfig.collegeScope || ""}
                                onChange={(e) =>
                                    setGradeConfig((prev) => ({
                                        ...prev,
                                        collegeScope: e.target.value,
                                        studyYear: "",
                                        courseCode: "",
                                        section: "",
                                    }))
                                }
                            >
                                <option value="">كل الكليات</option>
                                {collegeScopeOptions.map((college) => (
                                    <option key={`scope-${college.value}`} value={college.value}>
                                        {college.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                            السنة
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-cyan-400 focus:bg-white"
                                value={gradeConfig.studyYear || ""}
                                onChange={(e) => setGradeConfig((prev) => ({ ...prev, studyYear: e.target.value, courseCode: "", section: "" }))}
                            >
                                <option value="">كل السنوات</option>
                                {scopedYearOptions.map((year) => (
                                    <option key={`study-year-${year}`} value={year}>
                                        السنة {year}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                            المقرر
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-cyan-400 focus:bg-white"
                                value={gradeConfig.courseCode}
                                onChange={(e) =>
                                    setGradeConfig((prev) => {
                                        const nextCourseCode = e.target.value;
                                        const nextCourse = nextCourseCode ? resolveCourseByCode(nextCourseCode) : null;
                                        const nextMax = getCourseCycleMax(nextCourse, prev.gradeCycle, getCollegeCycleDefaultMax(prev.gradeCycle, nextCourse, collegeGradeDefaultsMap), collegeGradeDefaultsMap);
                                        return { ...prev, courseCode: nextCourseCode, section: "", maxScore: nextMax };
                                    })
                                }
                            >
                                <option value="">كل المقررات</option>
                                {scopedCourseOptions.map((course) => (
                                    <option key={course.code} value={course.code}>
                                        {course.code}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                            الشعبة
                            <select
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-cyan-400 focus:bg-white"
                                value={gradeConfig.section || ""}
                                onChange={(e) => setGradeConfig((prev) => ({ ...prev, section: e.target.value }))}
                            >
                                <option value="">كل الشعب</option>
                                {scopedSectionOptions.map((section) => (
                                    <option key={`section-${section}`} value={section}>
                                        {section}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="text-[11px] font-bold text-slate-600 md:col-span-2 lg:col-span-3">
                            مكونات تقييم المادة
                            <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                                {activeCycleOptions.map((item) => {
                                    const isActive = String(gradeConfig.gradeCycle || "") === String(item.key || "");
                                    return (
                                        <button
                                            key={`chip-${item.key}`}
                                            type="button"
                                            onClick={() =>
                                                setGradeConfig((prev) => {
                                                    const nextCycle = String(item.key || "mid1");
                                                    const nextCourse = prev.courseCode ? resolveCourseByCode(prev.courseCode) : null;
                                                    const nextMeta = getCycleMetaForCourse(nextCourse, nextCycle, collegeGradeDefaultsMap);
                                                    const nextMax = Math.max(
                                                        1,
                                                        Number(nextMeta?.max_marks || getCourseCycleMax(nextCourse, nextCycle, getCollegeCycleDefaultMax(nextCycle, nextCourse, collegeGradeDefaultsMap), collegeGradeDefaultsMap) || 1)
                                                    );
                                                    return { ...prev, gradeCycle: nextCycle, maxScore: nextMax };
                                                })
                                            }
                                            className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                                                isActive ? "bg-cyan-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:text-cyan-700"
                                            }`}
                                        >
                                            {item.label_ar || item.label_en || item.key}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="text-[11px] font-bold text-slate-600">
                            الحد الأقصى للمكون الحالي
                            <div className="mt-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
                                {Math.max(1, Number(currentCycleMeta?.max_marks || cycleMaxFromCourse || gradeConfig.maxScore || 1))} درجة
                            </div>
                            <p className="mt-1 text-[10px] text-slate-500">يتم تحديده تلقائيًا من إعدادات المادة</p>
                        </div>
                        <div className="text-[11px] font-bold text-slate-600 md:col-span-2">
                            ملخص النطاق
                            <div className="mt-1 space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
                                <p className="font-bold text-slate-700">عدد الطلاب في النطاق: <span className="text-cyan-700">{scopeStudentCount}</span></p>
                                <p className="font-bold text-slate-700">{t("grade_control_publish_status")}:  <span className="text-cyan-700">{getPublishStatusLabel(currentPublishStatus)}</span></p>
                                <p className="font-bold text-slate-500">آخر تعديل: {lastScopeAudit ? `${new Date(lastScopeAudit.at).toLocaleString("ar-EG")} - ${lastScopeAudit.user}` : "لا يوجد"}</p>
                            </div>
                        </div>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                        <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-2xl border border-[#8BE7F5] bg-[#E8F9FC] px-5 py-2.5 text-[12px] font-black text-[#036d82] hover:bg-[#DDF5FA]">
                            <Download size={13} /> تحميل قالب هذا النطاق
                        </button>
                        <button onClick={markReviewed} disabled={isPublishedLock} className="rounded-xl bg-[#f59e0b] px-4 py-2 text-[11px] font-black text-white shadow-sm hover:bg-[#d88906] disabled:opacity-50">
                            اعتماد للمراجعة
                        </button>
                        <button onClick={publishResults} disabled={currentPublishStatus !== "Reviewed"} className="rounded-xl bg-[#05adcf] px-4 py-2 text-[11px] font-black text-white shadow-sm hover:bg-[#0493b1] disabled:opacity-50">
                            نشر للطلاب
                        </button>
                        <button onClick={backToDraft} className="inline-flex items-center gap-1 rounded-xl bg-[#3a5068] px-4 py-2 text-[11px] font-black text-white shadow-sm hover:bg-[#44607d]">
                            <RotateCcw size={12} /> رجوع إلى مسودة
                        </button>
                        <button onClick={applyScopeToCandidates} disabled={isPublishedLock} className="inline-flex items-center gap-1 rounded-xl bg-[#0b7f99] px-4 py-2 text-[11px] font-black text-white shadow-sm hover:bg-[#0a6f86] disabled:opacity-50">
                            تطبيق النطاق على الطلاب
                        </button>
                        {isPublishedLock && (
                            <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
                                <Lock size={12} /> التعديل مقفول بعد النشر
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 mb-8">
                    <div className="flex-1 bg-white rounded-2xl shadow-lg border border-slate-100 p-2 flex items-center px-4">
                        <Search className="text-slate-400 ml-3" size={20} />
                        <input
                            type="text"
                            placeholder="ابحث بكود الطالب، اسمه، أو اسم المقرر..."
                            className="w-full bg-transparent border-none focus:ring-0 font-bold text-slate-700 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className={`${isPublishedLock ? "bg-slate-300 text-slate-600" : "bg-black hover:bg-slate-900 text-white"} rounded-2xl px-6 py-4 flex items-center gap-3 transition-all shadow-lg relative overflow-hidden`}>
                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} accept=".xlsx, .xls, .csv" disabled={isPublishedLock} />
                        <FileUp size={20} />
                        <span className="font-black whitespace-nowrap">{isUploading ? "جاري الفحص..." : "رفع درجات هذا المكون (Excel/CSV)"}</span>
                    </div>
                </div>
                <p className="mb-6 mt-[-1.2rem] text-xs text-slate-500">{selectedFileName || "لم يتم اختيار ملف"}</p>

                {pendingImport && (
                    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-black text-slate-800">معاينة التحقق قبل الاعتماد: {pendingImport.fileName}</p>
                                <p className="text-xs text-slate-500">Valid: {pendingImport.validRows.length} | Errors: {pendingImport.errors.length}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={downloadErrorReport} disabled={!pendingImport.errors.length} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 disabled:opacity-50">
                                    تنزيل تقرير الأخطاء
                                </button>
                                <button onClick={confirmImport} disabled={isConfirmingImport || pendingImport.errors.length > 0 || pendingImport.validRows.length === 0 || isPublishedLock} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                                    {isConfirmingImport ? "جاري الاعتماد..." : "اعتماد نهائي (Confirm Import)"}
                                </button>
                            </div>
                        </div>
                        {pendingImport.errors.length > 0 && (
                            <div className="mt-3 max-h-40 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                                {pendingImport.errors.slice(0, 20).map((err, idx) => (
                                    <p key={`${err.rowNumber}_${idx}`} className="py-1 border-b border-rose-100 last:border-b-0">
                                        Row {err.rowNumber}: {err.message}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-l from-cyan-100/80 via-sky-100/60 to-blue-50/70">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="text-cyan-600" size={24} />
                            <h2 className="font-black text-slate-800 text-xl">قائمة رصد الدرجات</h2>
                        </div>
                        <div className="flex gap-4 items-center">
                            {filteredData.length > 0 && (
                                <>
                                    <button onClick={() => {
                                        if (isPublishedLock) return;
                                        pushSnapshot("before_scope_clear");
                                        setAcademicRecords((prev) =>
                                            prev.filter((item) => {
                                                const sameAcademicYear = String(item.academicYear || "") === String(gradeConfig.academicYear || "");
                                                const sameSemester = normalizeSemesterValue(item.semester || "", "") === normalizeSemesterValue(gradeConfig.semester || "", "");
                                                const sameCourse = !gradeConfig.courseCode || normalizeCourseCode(item.code || "") === normalizeCourseCode(gradeConfig.courseCode || "");
                                                return !(sameAcademicYear && sameSemester && sameCourse);
                                            })
                                        );
                                        setPublishMap((prev) => ({ ...prev, [scopedPublishKey]: "Draft" }));
                                        addAudit("scope_cleared", { selection: scopedPublishKey });
                                        setUploadStatus({ type: "success", title: "تم المسح", message: "تم مسح سجلات النطاق الحالي" });
                                    }} className="text-rose-500 font-bold text-sm hover:underline px-2 disabled:opacity-50" disabled={isPublishedLock}>
                                        مسح النطاق الحالي
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="grades-soft-scroll grades-soft-scroll-x overflow-x-auto">
                        <table className="w-full text-right border-separate border-spacing-0 min-w-[1200px]">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-900 text-white text-[11px]">
                                    <th className="px-4 py-4 border-b border-slate-700">الطالب</th>
                                    <th className="px-4 py-4 border-b border-slate-700">المقرر</th>
                                    <th className="px-3 py-4 text-center border-b border-slate-700">الساعات</th>
                                    {tableComponents.map((component) => (
                                        <th
                                            key={`th-${component.key}`}
                                            className={`px-3 py-4 text-center border-b border-slate-700 ${String(component.key) === "final" ? "bg-slate-800" : ""}`}
                                        >
                                            {component.label_ar || component.label_en || component.key}
                                        </th>
                                    ))}
                                    <th className="px-3 py-4 text-center border-b border-slate-700">المجموع</th>
                                    <th className="px-3 py-4 text-center border-b border-slate-700">التقدير</th>
                                    <th className="px-3 py-4 text-center border-b border-slate-700">العام</th>
                                    <th className="px-3 py-4 text-center border-b border-slate-700">الفصل</th>
                                    <th className="px-4 py-4 text-center border-b border-slate-700">إجراء</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((item) => {
                                    const rowKey = getRowKey(item);
                                    const isEditing = editingIndex === rowKey;
                                    const rowCourse = resolveCourseByCode(item.code || "");
                                    const rowComponents = gradeConfig.courseCode
                                        ? tableComponents
                                        : (getCourseAssessmentComponents(rowCourse, collegeGradeDefaultsMap).length > 0 ? getCourseAssessmentComponents(rowCourse, collegeGradeDefaultsMap) : tableComponents);
                                    const currentRow = isEditing ? editForm : item;
                                    const totalScore = sumRowComponents(currentRow, rowComponents);

                                    return (
                                        <tr key={rowKey} className="odd:bg-white even:bg-slate-50/50 hover:bg-cyan-50/50 transition-colors">
                                            <td className="px-4 py-4 border-b border-slate-100 align-top">
                                                <div>
                                                    <div className="font-black text-slate-800">{item.studentName}</div>
                                                    <div className="mt-0.5 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{item.username || item.studentId}</div>
                                                    <div className="mt-1 text-[10px] font-bold text-teal-600">الاسم الرسمي من بيانات الشخص</div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 border-b border-slate-100 align-top">
                                                {isEditing ? (
                                                    <input className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-bold outline-none focus:border-cyan-400" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                                                ) : (
                                                    <>
                                                        <div className="text-slate-800 font-black text-sm">{item.name}</div>
                                                        <div className="mt-0.5 text-[10px] font-bold text-slate-400">{item.code}</div>
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 text-center border-b border-slate-100">
                                                {isEditing ? (
                                                    <input type="number" className="w-14 rounded-lg border border-slate-200 p-1.5 text-center text-xs outline-none focus:border-cyan-400" value={editForm.credits} onChange={(e) => setEditForm({ ...editForm, credits: e.target.value })} />
                                                ) : (
                                                    <span className="inline-flex min-w-8 justify-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600">{item.credits}</span>
                                                )}
                                            </td>
                                    {tableComponents.map((component) => {
                                                const isComponentEnabled = rowComponents.some((rowComp) => String(rowComp?.key || "") === String(component?.key || ""));
                                                const value = isComponentEnabled ? getComponentValue(isEditing ? editForm : item, component) : "";
                                                const isFinal = String(component?.key || "") === "final";
                                                const nextClass = isFinal
                                                    ? "px-3 py-4 text-center font-black bg-cyan-50/40 border-b border-slate-100"
                                                    : "px-3 py-4 text-center border-b border-slate-100";
                                                return (
                                                    <td key={`${rowKey}-${component.key}`} className={nextClass}>
                                                        {isEditing ? (
                                                            isComponentEnabled ? (
                                                            <input
                                                                type="number"
                                                                className={`w-16 rounded-lg p-1.5 text-center text-xs outline-none ${isFinal ? "border-2 border-cyan-300 focus:border-cyan-500" : "border border-slate-200 focus:border-blue-400"}`}
                                                                value={value}
                                                                onChange={(e) => {
                                                                    const score = e.target.value;
                                                                    setEditForm((prev) => setComponentValue(prev, component, score));
                                                                }}
                                                            />
                                                            ) : (
                                                                <span className="font-bold text-slate-300">-</span>
                                                            )
                                                        ) : (
                                                            <span className={`font-black ${isComponentEnabled ? (isFinal ? "text-emerald-700" : "text-slate-700") : "text-slate-300"}`}>{isComponentEnabled ? value : "-"}</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-3 py-4 text-center border-b border-slate-100"><span className="inline-flex min-w-[3rem] justify-center rounded-xl bg-cyan-100 px-2 py-1 font-black text-cyan-800">{totalScore}</span></td>
                                            <td className="px-3 py-4 text-center border-b border-slate-100">
                                                {isEditing ? (
                                                    <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                                                        يحسب تلقائيًا بعد إدخال النهائي
                                                    </span>
                                                ) : (
                                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${item.grade?.startsWith("A") ? "bg-emerald-100 text-emerald-700" : item.grade?.startsWith("F") ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                                                        {item.grade}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 text-center text-[11px] font-bold text-slate-600 border-b border-slate-100">
                                                {isEditing ? (
                                                    <input
                                                        className="w-28 rounded-lg border border-slate-200 p-1.5 text-center text-xs outline-none focus:border-cyan-400"
                                                        value={editForm.academicYear || ""}
                                                        onChange={(e) => setEditForm({ ...editForm, academicYear: e.target.value })}
                                                    />
                                                ) : (
                                                    item.academicYear || "-"
                                                )}
                                            </td>
                                            <td className="px-3 py-4 text-center text-[11px] font-bold text-slate-600 border-b border-slate-100">
                                                {isEditing ? (
                                                    <select
                                                        className="w-24 rounded-lg border border-slate-200 p-1.5 text-center text-xs outline-none focus:border-cyan-400"
                                                        value={editForm.semester || ""}
                                                        onChange={(e) => setEditForm({ ...editForm, semester: e.target.value })}
                                                    >
                                                        {Array.from(new Set([...(Object.keys(openSemesters || {})), String(item.semester || "")].filter(Boolean))).map((sem) => (
                                                            <option key={sem} value={sem}>
                                                                {semesterNames?.[sem] || sem}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    semesterNames?.[item.semester] || item.semester || "-"
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-center border-b border-slate-100">
                                                {isEditing ? (
                                                    <div className="flex gap-1 justify-center">
                                                        <button onClick={saveEdit} className="p-1.5 bg-emerald-500 text-white rounded-lg shadow-sm hover:bg-emerald-600 transition-colors"><Check size={12} /></button>
                                                        <button onClick={() => setEditingIndex(null)} className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"><X size={12} /></button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => { setEditingIndex(rowKey); setEditForm({ ...item, componentScores: item.componentScores && typeof item.componentScores === "object" ? item.componentScores : {} }); }} className="p-2 rounded-lg text-slate-300 hover:text-cyan-600 hover:bg-cyan-50 transition-colors">
                                                        <Edit2 size={16} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <p className="text-[11px] font-bold text-slate-400">آخر 50 عملية</p>
                            <History size={16} className="text-slate-600" />
                            <h3 className="text-sm font-black text-slate-800">سجل العمليات (Audit Log)</h3>
                        </div>
                        <div className="grades-soft-scroll max-h-52 overflow-auto space-y-2 pr-1">
                            {auditLog.length === 0 && <p className="py-4 text-xs text-slate-400">لا يوجد أحداث حتى الآن</p>}
                            {auditLog.slice(0, 50).map((entry) => (
                                <div key={entry.id} className="rounded-xl border border-slate-200 bg-white/80 p-2.5 text-xs shadow-sm">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <p className="font-black text-slate-800">
                                            {AUDIT_ACTION_META[entry.action]?.label || String(entry.action || "").replace(/_/g, " ")}
                                        </p>
                                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black ${getAuditToneClasses(AUDIT_ACTION_META[entry.action]?.tone || "neutral")}`}>
                                            {entry.action}
                                        </span>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-600">المستخدم: {entry.user || "-"}</p>
                                    <p className="text-[11px] text-slate-500">{new Date(entry.at).toLocaleString("ar-EG")}</p>
                                    {entry?.details?.selection ? (
                                        <p className="mt-1 truncate text-[10px] text-slate-400">النطاق: {String(entry.details.selection)}</p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2">
                            <RotateCcw size={16} className="text-slate-600" />
                            <h3 className="text-sm font-black text-slate-800">النسخ الاحتياطية (Versioning)</h3>
                        </div>
                        <div className="grades-soft-scroll max-h-52 overflow-auto divide-y divide-slate-100 pr-1">
                            {snapshots.length === 0 && <p className="py-4 text-xs text-slate-400">لا توجد نسخ احتياطية</p>}
                            {snapshots.slice(0, 20).map((snapshot) => (
                                <div key={snapshot.id} className="flex items-center justify-between gap-2 py-2">
                                    <div className="text-xs">
                                        <p className="font-bold text-slate-700">{snapshot.reason}</p>
                                        <p className="text-slate-500">{new Date(snapshot.at).toLocaleString("ar-EG")} - {snapshot.by}</p>
                                    </div>
                                    <button onClick={() => restoreSnapshot(snapshot.id)} className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-black text-cyan-700 hover:bg-cyan-100">
                                        استرجاع
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes bounce-in {
                    0% { transform: translate(-50%, -100%); opacity: 0; }
                    60% { transform: translate(-50%, 10%); opacity: 1; }
                    100% { transform: translate(-50%, 0); }
                }
                .animate-bounce-in {
                    animation: bounce-in 0.5s cubic-bezier(0.17, 0.67, 0.83, 0.67) forwards;
                }
                .grades-print-btn {
                    border: 1px solid rgba(255, 255, 255, 0.24);
                }
                html[data-theme="dark"] .grades-print-btn {
                    background: #3a5068 !important;
                    border-color: #6e8ba8 !important;
                    color: #f4f8fc !important;
                    box-shadow: 0 8px 18px rgba(8, 30, 54, 0.24);
                }
                html[data-theme="dark"] .grades-print-btn:hover {
                    background: #44607d !important;
                    border-color: #8ea9c0 !important;
                }
                html[data-theme="dark"] .admin-grades-page .grades-hero-glow {
                    display: none !important;
                }
                html[data-theme="dark"] .admin-grades-page .grades-top-shell {
                    box-shadow: inset 0 0 0 1px rgba(142, 169, 192, 0.22), 0 10px 24px -18px rgba(5, 173, 207, 0.4) !important;
                }
                html[data-theme="dark"] .admin-grades-page .grades-stat-card {
                    box-shadow: 0 8px 20px -16px rgba(8, 30, 54, 0.35) !important;
                    border-color: rgba(142, 169, 192, 0.28) !important;
                }
                html[data-theme="dark"] .admin-grades-page .grades-print-btn {
                    box-shadow: none !important;
                }
                .admin-grades-page .grades-soft-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: #18c7e3 rgba(255, 255, 255, 0.08);
                }
                .admin-grades-page .grades-soft-scroll::-webkit-scrollbar {
                    width: 10px;
                    height: 10px;
                }
                .admin-grades-page .grades-soft-scroll::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.07);
                    border-radius: 999px;
                    border: 1px solid rgba(148, 163, 184, 0.25);
                }
                .admin-grades-page .grades-soft-scroll::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, #2ad6ef 0%, #0ea7c6 100%);
                    border-radius: 999px;
                    border: 2px solid rgba(15, 23, 42, 0.15);
                    box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.28);
                }
                .admin-grades-page .grades-soft-scroll::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(180deg, #54e4f8 0%, #14b7d5 100%);
                }
                .admin-grades-page .grades-soft-scroll-x::-webkit-scrollbar {
                    height: 12px;
                }
                @media print {
                    html, body, #root {
                        background: #ffffff !important;
                        color: #111827 !important;
                    }
                    .admin-grades-page {
                        background: #ffffff !important;
                        color: #111827 !important;
                    }
                    .admin-grades-page .grades-hero {
                        background: #ffffff !important;
                        color: #111827 !important;
                        box-shadow: none !important;
                        border: 1px solid #dbe3ee !important;
                        border-radius: 14px !important;
                        margin: 0 0 12px 0 !important;
                        padding: 14px !important;
                    }
                    .admin-grades-page .grades-hero-glow,
                    .admin-grades-page .grades-print-btn,
                    .admin-grades-page .animate-bounce-in {
                        display: none !important;
                    }
                    .admin-grades-page .grades-main {
                        margin-top: 0 !important;
                        padding-top: 0 !important;
                    }
                    .admin-grades-page [class*="bg-white"],
                    .admin-grades-page [class*="bg-gray-"],
                    .admin-grades-page [class*="bg-slate-"],
                    .admin-grades-page [class*="bg-cyan-"],
                    .admin-grades-page [class*="bg-[#05ADCF]"] {
                        background: #ffffff !important;
                    }
                    .admin-grades-page [class*="text-white"],
                    .admin-grades-page [class*="text-cyan-"],
                    .admin-grades-page [class*="text-slate-"],
                    .admin-grades-page [class*="text-gray-"] {
                        color: #111827 !important;
                    }
                    .admin-grades-page [class*="shadow"] {
                        box-shadow: none !important;
                    }
                    .admin-grades-page [class*="border-"] {
                        border-color: #dbe3ee !important;
                    }
                }
                input::-webkit-outer-spin-button,
                input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
            `,
            }} />
        </div>
    );
}


