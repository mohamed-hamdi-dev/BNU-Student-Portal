import React, { useContext, useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Trash2, BookOpen, Users, Calendar, Clock, Layers, ChevronRight, X, AlertCircle, Sun, CloudRain, Flower2, SlidersHorizontal, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SystemContext } from "../../context/SystemContext";
import { ThemeContext } from "../../context/ThemeContext";
import { fetchCollegesState, saveCollegesState } from "../../services/academicApi";
import { listAssessmentTemplates, listGradingScales } from "../../services/registrationPolicyApi";
import MobileHorizontalScroll from "../../components/common/MobileHorizontalScroll";

const COLLEGES_KEY = "system.colleges";
const defaultColleges = [
    { id: "CS", name: "علوم الحاسب" },
    { id: "ENG", name: "الهندسة" },
    { id: "BUS", name: "إدارة الأعمال" },
    { id: "MED", name: "الطب" },
    { id: "DEN", name: "طب الأسنان" },
    { id: "PHR", name: "الصيدلة" },
];

const parseColleges = () => {
    try {
        const stored = JSON.parse(localStorage.getItem(COLLEGES_KEY) || "null");
        if (Array.isArray(stored) && stored.length > 0) return stored;
        return defaultColleges;
    } catch {
        return defaultColleges;
    }
};
const parseStoredCollegesStrict = () => {
    try {
        const stored = JSON.parse(localStorage.getItem(COLLEGES_KEY) || "null");
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
};
const normalizeCollegeList = (rawColleges) => {
    if (!Array.isArray(rawColleges)) return [];
    const seen = new Set();
    return rawColleges
        .map((item) => ({
            id: String(item?.id || "").trim().toUpperCase(),
            name: String(item?.name || "").trim(),
        }))
        .filter((item) => item.id && item.name)
        .filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
};
const mergeCollegeLists = (remoteColleges, localColleges) => {
    const mergedById = new Map();
    normalizeCollegeList(remoteColleges).forEach((item) => {
        mergedById.set(item.id, item);
    });
    normalizeCollegeList(localColleges).forEach((item) => {
        mergedById.set(item.id, item);
    });
    return Array.from(mergedById.values());
};
const areCollegeListsEqual = (a, b) => {
    const left = normalizeCollegeList(a);
    const right = normalizeCollegeList(b);
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
        if (left[i].id !== right[i].id || left[i].name !== right[i].name) return false;
    }
    return true;
};
const normalizeKey = (value) => String(value || "").trim().toLowerCase();
const normalizeTracks = (tracks) => {
    if (!Array.isArray(tracks)) return [];
    const seen = new Set();
    return tracks
        .map((track) => {
            const label = String(track?.name || track?.id || track || "").trim();
            return { id: label, name: label };
        })
        .filter((track) => track.id)
        .filter((track) => {
            const key = normalizeKey(track.id);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};
const normalizeLevelThresholds = (levelThresholds) => {
    if (!levelThresholds || typeof levelThresholds !== "object") return {};
    const map = {};
    Object.entries(levelThresholds).forEach(([yearKey, minHoursValue]) => {
        const year = String(yearKey || "").trim();
        const minHours = Number(minHoursValue);
        if (!year || !Number.isFinite(minHours)) return;
        map[year] = Math.max(0, minHours);
    });
    return map;
};
const normalizeYearIds = (rawYearIds, fallbackYears = []) => {
    const fallback = (Array.isArray(fallbackYears) ? fallbackYears : [])
        .map((year) => String(year?.id || "").trim())
        .filter(Boolean);
    if (!Array.isArray(rawYearIds) || rawYearIds.length === 0) return fallback;
    const seen = new Set();
    return rawYearIds
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((id) => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
};
const MAX_COLLEGE_YEARS = 8;
const ARABIC_YEAR_LABELS = {
    "1": "السنة الأولى",
    "2": "السنة الثانية",
    "3": "السنة الثالثة",
    "4": "السنة الرابعة",
    "5": "السنة الخامسة",
    "6": "السنة السادسة",
    "7": "السنة السابعة",
    "8": "السنة الثامنة",
};
const formatYearLabel = (year = {}) => {
    const id = String(year?.id || "").trim();
    const rawName = String(year?.name || "").trim();
    if (id && ARABIC_YEAR_LABELS[id]) return ARABIC_YEAR_LABELS[id];
    const normalizedName = rawName.replace("الفرقة", "السنة");
    const digits = normalizedName.match(/\d+/)?.[0] || id.match(/\d+/)?.[0] || "";
    if (digits && ARABIC_YEAR_LABELS[digits]) return ARABIC_YEAR_LABELS[digits];
    if (normalizedName) return normalizedName;
    return id ? `السنة ${id}` : "";
};
const yearSort = (a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b), "ar");
};
const buildSequentialYearIds = (totalYears, allYears = []) => {
    const safeTotal = Math.max(1, Math.min(MAX_COLLEGE_YEARS, Number(totalYears) || 1));
    const ids = [];
    for (let i = 1; i <= safeTotal; i += 1) ids.push(String(i));
    (Array.isArray(allYears) ? allYears : [])
        .map((year) => String(year?.id || "").trim())
        .filter(Boolean)
        .forEach((id) => {
            if (!ids.includes(id) && ids.length < safeTotal) ids.push(id);
        });
    return ids.slice(0, safeTotal).sort(yearSort);
};
const resolvePolicyYears = (policy = {}, allYears = []) => {
    const normalizedAll = Array.isArray(allYears) ? allYears : [];
    const mapById = new Map(normalizedAll.map((year) => [String(year?.id || "").trim(), year]));
    const requestedTotal = Number(policy?.totalYears || 0);
    const fallbackTotal = normalizedAll.length > 0 ? normalizedAll.length : 4;
    const totalYears = Number.isFinite(requestedTotal) && requestedTotal > 0 ? requestedTotal : fallbackTotal;
    const rawYearIds = normalizeYearIds(policy?.yearIds, []);
    const yearIds = (rawYearIds.length > 0 ? rawYearIds : buildSequentialYearIds(totalYears, normalizedAll))
        .sort(yearSort)
        .slice(0, Math.max(1, Math.min(MAX_COLLEGE_YEARS, Number(totalYears) || 1)));
    return yearIds.map((id) => {
        const fromGlobal = mapById.get(id);
        if (fromGlobal) return fromGlobal;
        return { id, name: `السنة ${id}` };
    });
};
const inferCollegeDefaultYears = (collegeValue) => {
    const key = String(collegeValue || "")
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/ـ/g, "");
    if (!key) return 0;
    if (key.includes("علوم الحاسب") || key.includes("حاسبات") || key.includes("computer science") || key === "cs") return 4;
    if (key.includes("هندس") || key.includes("engineering") || key === "eng") return 5;
    return 0;
};
const resolveCollegeScopedYears = ({ policy = {}, allYears = [], collegeId = "", collegeName = "" }) => {
    const normalizedAll = Array.isArray(allYears) ? allYears : [];
    const hasPolicyIds = Array.isArray(policy?.yearIds) && policy.yearIds.some((id) => String(id || "").trim());
    const hasPolicyTotal = Number(policy?.totalYears || 0) > 0;
    if (hasPolicyIds || hasPolicyTotal) {
        return resolvePolicyYears(policy, normalizedAll);
    }
    const fallbackYears = inferCollegeDefaultYears(collegeName || collegeId);
    if (fallbackYears > 0) {
        const mapById = new Map(normalizedAll.map((year) => [String(year?.id || "").trim(), year]));
        return Array.from({ length: fallbackYears }, (_, idx) => String(idx + 1)).map((id) => mapById.get(id) || { id, name: `السنة ${id}` });
    }
    return normalizedAll;
};

const DAY_OPTIONS = ["السبت", "الاحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس"];
const normalizeArabicDay = (value) =>
    String(value || "")
        .trim()
        .replace(/[أإآ]/g, "ا");
const toDayOptionValue = (value) => {
    const normalized = normalizeArabicDay(value);
    return DAY_OPTIONS.includes(normalized) ? normalized : DAY_OPTIONS[0];
};
const START_TIME_OPTIONS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
const DURATION_OPTIONS = [1, 2, 3, 4];
const CAPACITY_OPTIONS = ["20", "25", "30", "35", "40", "45", "50", "60"];
const YEAR_PRESET_OPTIONS = [
    { id: "1", name: "السنة الأولى" },
    { id: "2", name: "السنة الثانية" },
    { id: "3", name: "السنة الثالثة" },
    { id: "4", name: "السنة الرابعة" },
    { id: "5", name: "السنة الخامسة" },
    { id: "6", name: "السنة السادسة" },
    { id: "7", name: "السنة السابعة" },
    { id: "8", name: "السنة الثامنة" },
];
const DEFAULT_ASSESSMENT_TEMPLATES = [
    {
        id: "TEMPLATE_100_DEFAULT",
        code: "TEMPLATE_100_DEFAULT",
        name_ar: "نظام 100 درجة",
        components: [
            { key: "mid1", label_ar: "ميد 1", label_en: "Mid 1", max_marks: 15, display_order: 1 },
            { key: "mid2", label_ar: "ميد 2", label_en: "Mid 2", max_marks: 15, display_order: 2 },
            { key: "coursework", label_ar: "أعمال السنة", label_en: "Year Work", max_marks: 30, display_order: 3 },
            { key: "final", label_ar: "النهائي", label_en: "Final", max_marks: 40, display_order: 4 },
        ],
    },
    {
        id: "TEMPLATE_200_DEFAULT",
        code: "TEMPLATE_200_DEFAULT",
        name_ar: "نظام 200 درجة",
        components: [
            { key: "mid1", label_ar: "ميد 1", label_en: "Mid 1", max_marks: 40, display_order: 1 },
            { key: "coursework", label_ar: "أعمال السنة", label_en: "Year Work", max_marks: 60, display_order: 2 },
            { key: "final", label_ar: "النهائي", label_en: "Final", max_marks: 100, display_order: 3 },
        ],
    },
    {
        id: "TEMPLATE_250_DEFAULT",
        code: "TEMPLATE_250_DEFAULT",
        name_ar: "نظام 250 درجة",
        components: [
            { key: "mid1", label_ar: "ميد 1", label_en: "Mid 1", max_marks: 50, display_order: 1 },
            { key: "practical", label_ar: "عملي", label_en: "Practical", max_marks: 75, display_order: 2 },
            { key: "final", label_ar: "النهائي", label_en: "Final", max_marks: 125, display_order: 3 },
        ],
    },
];

const DEFAULT_GRADING_SCALES = [
    { id: "DEFAULT_ABCD", code: "DEFAULT_ABCD", name_ar: "النظام الافتراضي للتقديرات" },
];

const ASSESSMENT_COMPONENT_CATALOG = [
    { key: "mid1", label_ar: "ميد 1", label_en: "Mid 1", default_max: 15 },
    { key: "mid2", label_ar: "ميد 2", label_en: "Mid 2", default_max: 15 },
    { key: "coursework", label_ar: "أعمال السنة", label_en: "Year Work", default_max: 30 },
    { key: "final", label_ar: "النهائي", label_en: "Final", default_max: 40 },
    { key: "practical", label_ar: "عملي", label_en: "Practical", default_max: 20 },
    { key: "oral", label_ar: "شفوي", label_en: "Oral", default_max: 10 },
    { key: "quiz", label_ar: "اختبار قصير", label_en: "Quiz", default_max: 10 },
    { key: "assignment", label_ar: "واجب", label_en: "Assignment", default_max: 10 },
];
const LEGACY_COMPONENT_MAP = {
    mid1: "mid1",
    mid2: "mid2",
    coursework: "yearWork",
    final: "final",
};
const CUSTOM_TOTAL_MIN = 50;
const CUSTOM_TOTAL_MAX = 400;
const CUSTOM_TOTAL_STEP = 10;
const scaleComponentsToTotal = (components = [], targetTotal = 0) => {
    const normalized = normalizeAssessmentComponents(components);
    const safeTarget = Number(targetTotal || 0);
    const baseTotal = toAssessmentTotal(normalized);
    if (!normalized.length || !Number.isFinite(safeTarget) || safeTarget <= 0 || baseTotal <= 0) return normalized;
    if (Math.abs(baseTotal - safeTarget) < 0.0001) return normalized;
    const ratio = safeTarget / baseTotal;
    const scaled = normalized.map((item) => ({
        ...item,
        max_marks: Number((Number(item.max_marks || 0) * ratio).toFixed(2)),
    }));
    const scaledTotal = toAssessmentTotal(scaled);
    const delta = Number((safeTarget - scaledTotal).toFixed(2));
    if (scaled.length > 0 && Math.abs(delta) > 0.0001) {
        const last = scaled[scaled.length - 1];
        scaled[scaled.length - 1] = {
            ...last,
            max_marks: Number((Number(last.max_marks || 0) + delta).toFixed(2)),
        };
    }
    return scaled;
};
const parseJsonArray = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "string") return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};
const normalizeAssessmentComponents = (items = []) => {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
        .map((item, index) => {
            const key = String(item?.key || "").trim().toLowerCase();
            const labelAr = String(item?.label_ar || item?.labelAr || item?.name || item?.label || "").trim();
            const labelEn = String(item?.label_en || item?.labelEn || "").trim();
            const label = labelAr || labelEn || key || `component_${index + 1}`;
            const maxMarks = Number(item?.max_marks ?? item?.maxMarks ?? item?.max ?? 0);
            const displayOrder = Number(item?.display_order ?? item?.displayOrder ?? index + 1);
            const normalizedKey = key || `custom_${index + 1}`;
            return {
                key: normalizedKey,
                label_ar: labelAr || label,
                label_en: labelEn || label,
                max_marks: Number.isFinite(maxMarks) && maxMarks >= 0 ? maxMarks : 0,
                display_order: Number.isFinite(displayOrder) && displayOrder > 0 ? displayOrder : index + 1,
                field: LEGACY_COMPONENT_MAP[normalizedKey] || null,
            };
        })
        .filter((item) => {
            const unique = `${item.key}::${item.display_order}`;
            if (seen.has(unique)) return false;
            seen.add(unique);
            return true;
        })
        .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
        .map((item, index) => ({ ...item, display_order: index + 1 }));
};
const mapTemplateToComponents = (template = null) => normalizeAssessmentComponents(template?.components || []);
const getTemplateById = (templates = [], templateId = "") => {
    const target = String(templateId || "").trim();
    if (!target) return null;
    return (
        (Array.isArray(templates) ? templates : []).find((item) => {
            const idValue = String(item?.id ?? "").trim();
            const codeValue = String(item?.code ?? "").trim();
            return idValue === target || codeValue === target;
        }) || null
    );
};
const toAssessmentTotal = (components = []) =>
    normalizeAssessmentComponents(components).reduce((sum, item) => sum + Number(item?.max_marks || 0), 0);
const courseAssessmentComponents = (course = {}, templates = []) => {
    const overrideRaw =
        course?.assessmentOverrideComponents ||
        course?.assessment_override_components ||
        parseJsonArray(course?.assessment_override_components_json);
    const overrideComponents = normalizeAssessmentComponents(overrideRaw);
    const allowOverride = Boolean(course?.allowAssessmentOverride ?? course?.allow_assessment_override);
    if (allowOverride && overrideComponents.length > 0) return overrideComponents;

    const templateId = String(course?.assessmentTemplateId || course?.assessment_template_id || "").trim();
    const selectedTemplate = getTemplateById(templates, templateId);
    const templateComponents = mapTemplateToComponents(selectedTemplate);
    if (templateComponents.length > 0) return templateComponents;

    const fallback = [
        { key: "mid1", label_ar: "ميد 1", label_en: "Mid 1", max_marks: Number(course?.mid1 || 0) },
        { key: "mid2", label_ar: "ميد 2", label_en: "Mid 2", max_marks: Number(course?.mid2 || 0) },
        { key: "coursework", label_ar: "أعمال السنة", label_en: "Year Work", max_marks: Number(course?.yearWork ?? course?.ywork ?? 0) },
        { key: "final", label_ar: "النهائي", label_en: "Final", max_marks: Number(course?.final || 0) },
    ];
    return normalizeAssessmentComponents(fallback.filter((item) => Number(item.max_marks || 0) > 0));
};
const mapComponentsToLegacyScores = (components = []) => {
    const normalized = normalizeAssessmentComponents(components);
    const map = { mid1: 0, mid2: 0, yearWork: 0, final: 0 };
    normalized.forEach((item) => {
        const field = LEGACY_COMPONENT_MAP[item.key];
        if (!field) return;
        map[field] = Number(item.max_marks || 0);
    });
    return map;
};
const buildTimeRange = (start, durationHours = 2) => {
    if (!start || !String(start).includes(":")) return "";
    const [hour, minute] = String(start).split(":").map((value) => Number(value));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
    const endHour = hour + durationHours;
    const end = `${String(endHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return `${start} - ${end}`;
};
const parseStartFromRange = (timeRange) => String(timeRange || "").split("-")[0]?.trim() || "";
const parseTimeToMinutes = (value) => {
    const raw = String(value || "").trim();
    if (!raw.includes(":")) return NaN;
    const [h, m] = raw.split(":").map((item) => Number(item));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
};
const parseRangeToMinutes = (timeRange) => {
    const raw = String(timeRange || "").trim();
    if (!raw || !raw.includes("-")) return null;
    const parts = raw.split("-").map((item) => String(item || "").trim());
    if (parts.length < 2) return null;
    const startMin = parseTimeToMinutes(parts[0]);
    const endMin = parseTimeToMinutes(parts[1]);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
    return { startMin, endMin };
};
const validateSessionChronology = (session = {}, sessionLabel = "الجلسة") => {
    const explicitRange = parseRangeToMinutes(session?.time);
    if (explicitRange && explicitRange.endMin <= explicitRange.startMin) {
        return `${sessionLabel}: وقت النهاية يجب أن يكون بعد وقت البداية.`;
    }
    const startText = String(session?.start || parseStartFromRange(session?.time) || "").trim();
    const startMin = parseTimeToMinutes(startText);
    if (!Number.isFinite(startMin)) {
        return `${sessionLabel}: وقت البداية غير صحيح. استخدم صيغة HH:MM.`;
    }
    const duration = Number(session?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) {
        return `${sessionLabel}: مدة الجلسة يجب أن تكون أكبر من صفر.`;
    }
    return "";
};
const parseSessionWindow = (session = {}) => {
    const day = toDayOptionValue(session?.day || DAY_OPTIONS[0]);
    const startText = String(session?.start || parseStartFromRange(session?.time) || "").trim();
    const startMin = parseTimeToMinutes(startText);
    if (!Number.isFinite(startMin)) return null;
    const duration = Number(session?.duration || 2);
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 2;
    const endMin = startMin + safeDuration * 60;
    return { day, startMin, endMin };
};
const parseGroupWindow = (group = {}) => parseSessionWindow(group);
const hasWindowOverlap = (a, b) => a.day === b.day && a.startMin < b.endMin && a.endMin > b.startMin;
const normalizeKeyPart = (value) => String(value || "").trim().toLowerCase();
const normalizeScheduleToken = (value) => String(value || "").trim().toLowerCase();
const slugifySectionToken = (value = "") =>
    String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9\u0600-\u06FF]+/g, "-")
        .replace(/^-+|-+$/g, "") || "SEC";
const buildGroupAutoId = (course, sectionName, fallback = 1) => {
    const courseCode = String(course?.id || course?.code || "").trim().toUpperCase() || "COURSE";
    const sectionToken = slugifySectionToken(sectionName || `SEC-${fallback}`);
    return `${courseCode}-${sectionToken}`;
};
const toCourseScopeKey = (course = {}) =>
    [
        normalizeKeyPart(course?.collegeId || course?.college || ""),
        normalizeKeyPart(course?.trackId || ""),
        normalizeKeyPart(course?.year || ""),
        normalizeKeyPart(course?.semester || ""),
    ].join("::");
const buildDefaultLectureTargetGroupId = (course = {}) =>
    [
        String(course?.collegeId || course?.college || "general").trim() || "general",
        `Y${String(course?.year || "1").trim() || "1"}`,
        String(course?.semester || "autumn").trim() || "autumn",
        "ALL",
    ]
        .join("-")
        .toUpperCase();
const buildLectureTargetGroupOptions = (course = {}) => {
    const seen = new Set();
    const options = [];
    const push = (value, label) => {
        const normalized = String(value || "").trim().toUpperCase();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        options.push({ value: normalized, label: String(label || normalized) });
    };

    const allToken = buildDefaultLectureTargetGroupId(course);
    push(allToken, `لكل الدفعة (${allToken})`);

    const groups = Array.isArray(course?.groups) ? course.groups : [];
    groups.forEach((group, index) => {
        const raw = group?.targetGroupId || group?.name || group?.section || group?.id || `G${index + 1}`;
        const token = String(raw || "").trim().toUpperCase();
        if (!token) return;
        const groupName = String(group?.name || group?.section || group?.id || `G${index + 1}`).trim();
        push(token, `${groupName} (${token})`);
    });

    return options;
};
const localizeScheduleAlertMessage = (message = "") => {
    const text = String(message || "").trim();
    if (!text) return "";
    const dictionary = {
        "This room is already occupied at this time.": "هذه القاعة مشغولة بالفعل في هذا الوقت.",
        "This instructor already has a class at this time.": "هذا المحاضر لديه محاضرة أخرى في نفس الوقت.",
        "This student group already has another section at this time.": "هذه المجموعة المستهدفة لديها سكشن آخر في نفس الوقت.",
        "وقت المجموعة غير صحيح. استخدم صيغة HH:MM.": "وقت المجموعة غير صحيح. استخدم صيغة HH:MM.",
        "يرجى تحديد المجموعة المستهدفة (Target Group).": "يرجى تحديد المجموعة المستهدفة.",
    };
    return dictionary[text] || text;
};

const App = () => {
    const { isDarkMode } = useContext(ThemeContext);
    const { t, i18n } = useTranslation("global");
    const {
        years,
        setYears,
        courses,
        setCourses,
        registrationSettings,
        setRegistrationSettings,
        saveRegistrationSettingsNow,
        setStudentRegistrations,
        setAcademicRecords,
    } = useContext(SystemContext);
    const isArabic = String(i18n.language || "ar").toLowerCase().startsWith("ar");
    // الألوان المخصصة للهوية البصرية
    const theme = {
        primary: "#05ADCF",
        primaryLight: "#3CCFEA",
        primaryLighter: "#8BE7F5",
        primaryDark: "#0288A3",
        primaryDarker: "#015C6F",
    };

    // حالة النظام (State)
    const [activeTab, setActiveTab] = useState("courses");
    const [selectedYear, setSelectedYear] = useState("all");
    // UI filter only: do not bind default selection to backend open semester.
    const [selectedSemester, setSelectedSemester] = useState("autumn");
    const [yearsCollegeFilter, setYearsCollegeFilter] = useState("all");
    const [selectedCollegeFilter, setSelectedCollegeFilter] = useState("all");

    const [showAddModal, setShowAddModal] = useState(false);
    const [showGroupsModal, setShowGroupsModal] = useState(null);
    const [showYearModal, setShowYearModal] = useState(false);
    const [showCollegeModal, setShowCollegeModal] = useState(false);
    const [showCollegePolicyModal, setShowCollegePolicyModal] = useState(null);
    const [showAssessmentBuilder, setShowAssessmentBuilder] = useState(false);
    const [builderSelectedComponentKey, setBuilderSelectedComponentKey] = useState("mid1");
    const [scheduleAlert, setScheduleAlert] = useState({ open: false, title: "", lines: [] });
    const [groupForm, setGroupForm] = useState({
        name: "",
        targetGroupId: "",
        day: "",
        time: "",
        start: "",
        duration: 2,
        hall: "",
        instructor: "",
        capacity: "",
    });
    const [editingGroupId, setEditingGroupId] = useState("");

    const [colleges, setColleges] = useState(() => parseColleges());
    const [assessmentTemplates, setAssessmentTemplates] = useState(DEFAULT_ASSESSMENT_TEMPLATES);
    const [gradingScales, setGradingScales] = useState(DEFAULT_GRADING_SCALES);
    const [newCourse, setNewCourse] = useState({
        id: "",
        name: "",
        year: "1",
        semester: "autumn",
        hours: 3,
        prereq: "",
        college: "",
        collegeId: "",
        trackId: "",
        trackName: "",
        assessmentTemplateId: "",
        gradingScaleId: "",
        allowAssessmentOverride: false,
        assessmentOverrideComponents: [],
        assessmentTotalMax: 0,
        category: "تخصص",
        lecture: { day: "الاحد", time: "08:00 - 10:00", start: "08:00", duration: 2, hall: "", instructor: "", targetGroupId: "" },
    });
    const [editingCourseKey, setEditingCourseKey] = useState("");

    const [yearForm, setYearForm] = useState({ id: "" });
    const [collegeForm, setCollegeForm] = useState({ id: "", name: "" });
    const [trackDraftByCollege, setTrackDraftByCollege] = useState({});
    const [levelThresholdDraftByCollege, setLevelThresholdDraftByCollege] = useState({});
    const [policySavingByCollege, setPolicySavingByCollege] = useState({});
    const [policySaveStatusByCollege, setPolicySaveStatusByCollege] = useState({});
    const openScheduleAlert = (lines, title = "تنبيه الجدول") => {
        const normalized = (Array.isArray(lines) ? lines : [lines])
            .map((line) => localizeScheduleAlertMessage(line))
            .filter(Boolean);
        setScheduleAlert({
            open: true,
            title: String(title || "تنبيه الجدول"),
            lines: normalized.length > 0 ? normalized : ["حدث خطأ غير متوقع."],
        });
    };
    const collegePolicies = registrationSettings?.collegePolicies && typeof registrationSettings.collegePolicies === "object" ? registrationSettings.collegePolicies : {};
    const selectedCollegePolicy = newCourse.collegeId ? collegePolicies[normalizeKey(newCourse.collegeId)] : null;
    const selectedCollegeTracks = Array.isArray(selectedCollegePolicy?.tracks) ? selectedCollegePolicy.tracks : [];
    const addCourseTemplateOptions = useMemo(() => {
        const selectedCollegeId = String(newCourse.collegeId || "").trim();
        const selectedTrackId = String(newCourse.trackId || "").trim();
        const selectedYear = Number(newCourse.year || 0);
        const selectedSemesterId = String(newCourse.semester || "").trim().toLowerCase();
        return (assessmentTemplates || []).filter((item) => {
            const sameCollege = !item?.college_id || !selectedCollegeId || String(item.college_id) === selectedCollegeId;
            const sameTrack = !item?.track_id || !selectedTrackId || String(item.track_id) === selectedTrackId;
            const sameYear = !item?.study_year || !selectedYear || Number(item.study_year) === selectedYear;
            const sameSemester = !item?.semester || !selectedSemesterId || String(item.semester).toLowerCase() === selectedSemesterId;
            return sameCollege && sameTrack && sameYear && sameSemester;
        });
    }, [assessmentTemplates, newCourse.collegeId, newCourse.trackId, newCourse.year, newCourse.semester]);
    const addCourseScaleOptions = useMemo(() => {
        const selectedCollegeId = String(newCourse.collegeId || "").trim();
        return (gradingScales || []).filter((item) => !item?.college_id || !selectedCollegeId || String(item.college_id) === selectedCollegeId);
    }, [gradingScales, newCourse.collegeId]);
    const singleScaleOption = useMemo(() => (addCourseScaleOptions.length === 1 ? addCourseScaleOptions[0] : null), [addCourseScaleOptions]);
    const singleScaleLabel = useMemo(() => {
        if (!singleScaleOption) return "";
        const key = String(singleScaleOption?.id ?? singleScaleOption?.code ?? "").trim();
        return String(singleScaleOption?.name_ar || singleScaleOption?.name_en || singleScaleOption?.code || key || "النظام الافتراضي للتقديرات");
    }, [singleScaleOption]);
    const addCourseYearOptions = useMemo(() => {
        const selectedCollege = colleges.find((item) => String(item.id) === String(newCourse.collegeId));
        return resolveCollegeScopedYears({
            policy: selectedCollegePolicy || {},
            allYears: years,
            collegeId: selectedCollege?.id || newCourse.collegeId,
            collegeName: selectedCollege?.name || newCourse.college,
        });
    }, [colleges, newCourse.college, newCourse.collegeId, selectedCollegePolicy, years]);
    const lectureTargetGroupOptions = useMemo(() => buildLectureTargetGroupOptions(newCourse), [newCourse]);

    const selectedTemplate = useMemo(() => getTemplateById(addCourseTemplateOptions, newCourse.assessmentTemplateId), [addCourseTemplateOptions, newCourse.assessmentTemplateId]);
    const selectedTemplateComponents = useMemo(() => mapTemplateToComponents(selectedTemplate), [selectedTemplate]);
    const selectedTemplateTotal = useMemo(() => toAssessmentTotal(selectedTemplateComponents), [selectedTemplateComponents]);
    const customTotalOptions = useMemo(() => {
        const list = [];
        for (let value = CUSTOM_TOTAL_MIN; value <= CUSTOM_TOTAL_MAX; value += CUSTOM_TOTAL_STEP) list.push(value);
        return list;
    }, []);
    const normalizedOverrideComponents = useMemo(() => normalizeAssessmentComponents(newCourse.assessmentOverrideComponents || []), [newCourse.assessmentOverrideComponents]);
    const overrideTotal = useMemo(() => toAssessmentTotal(normalizedOverrideComponents), [normalizedOverrideComponents]);
    const availableBuilderComponents = useMemo(() => {
        const used = new Set(normalizedOverrideComponents.map((item) => String(item.key || "").trim().toLowerCase()));
        return ASSESSMENT_COMPONENT_CATALOG.filter((item) => !used.has(String(item.key || "").trim().toLowerCase()));
    }, [normalizedOverrideComponents]);

    const applyTemplateComponentsToCourse = useCallback((templateId, keepManual = true) => {
        const template = getTemplateById(addCourseTemplateOptions, templateId);
        const templateComponents = mapTemplateToComponents(template);
        const templateTotal = toAssessmentTotal(templateComponents);
        setNewCourse((prev) => {
            const hasManual = normalizeAssessmentComponents(prev.assessmentOverrideComponents || []).length > 0;
            const shouldReplaceManual = !keepManual || !hasManual;
            return {
                ...prev,
                assessmentTemplateId: String(templateId || ""),
                assessmentTotalMax: templateTotal,
                assessmentOverrideComponents: shouldReplaceManual ? templateComponents : prev.assessmentOverrideComponents,
            };
        });
    }, [addCourseTemplateOptions]);

    const addBuilderComponentByKey = useCallback((componentKey) => {
        const fallbackKey = String(availableBuilderComponents[0]?.key || "").trim();
        const requestedKey = String(componentKey || "").trim();
        const isRequestedAvailable = availableBuilderComponents.some((item) => String(item?.key || "").trim() === requestedKey);
        const targetKey = isRequestedAvailable ? requestedKey : fallbackKey;
        const picked = ASSESSMENT_COMPONENT_CATALOG.find((item) => item.key === targetKey) || ASSESSMENT_COMPONENT_CATALOG[0] || null;
        if (!picked) return;
        setNewCourse((prev) => {
            const current = normalizeAssessmentComponents(prev.assessmentOverrideComponents || []);
            if (current.some((item) => String(item.key) === String(picked.key))) return prev;
            const next = [
                ...current,
                {
                    key: picked.key,
                    label_ar: picked.label_ar,
                    label_en: picked.label_en,
                    max_marks: Number(picked.default_max || 0),
                    display_order: current.length + 1,
                },
            ];
            return { ...prev, assessmentOverrideComponents: next };
        });
    }, [availableBuilderComponents]);

    const addBuilderComponent = useCallback(() => {
        addBuilderComponentByKey(builderSelectedComponentKey);
    }, [addBuilderComponentByKey, builderSelectedComponentKey]);

    useEffect(() => {
        if (!showAssessmentBuilder) return;
        if (!Array.isArray(availableBuilderComponents) || availableBuilderComponents.length === 0) return;
        const hasCurrent = availableBuilderComponents.some((item) => String(item.key || "") === String(builderSelectedComponentKey || ""));
        if (!hasCurrent) {
            setBuilderSelectedComponentKey(String(availableBuilderComponents[0]?.key || ""));
        }
    }, [availableBuilderComponents, builderSelectedComponentKey, showAssessmentBuilder]);

    const removeBuilderComponent = useCallback((componentKey) => {
        setNewCourse((prev) => {
            const next = normalizeAssessmentComponents(prev.assessmentOverrideComponents || []).filter((item) => String(item.key || "") !== String(componentKey || ""));
            return { ...prev, assessmentOverrideComponents: next };
        });
    }, []);

    const updateBuilderComponent = useCallback((componentKey, patch = {}) => {
        setNewCourse((prev) => {
            const next = normalizeAssessmentComponents(prev.assessmentOverrideComponents || []).map((item) => {
                if (String(item.key || "") !== String(componentKey || "")) return item;
                return {
                    ...item,
                    label_ar: String(patch.label_ar ?? item.label_ar ?? "").trim() || item.label_ar,
                    max_marks: Number.isFinite(Number(patch.max_marks)) ? Math.max(0, Number(patch.max_marks)) : Number(item.max_marks || 0),
                };
            });
            return { ...prev, assessmentOverrideComponents: next };
        });
    }, []);

    useEffect(() => {
        localStorage.setItem(COLLEGES_KEY, JSON.stringify(colleges));
    }, [colleges]);
    useEffect(() => {
        let active = true;
        const token = localStorage.getItem("access_token");
        if (!token) {
            return () => {
                active = false;
            };
        }
        const hydrateColleges = async () => {
            try {
                const remote = await fetchCollegesState();
                const localStored = parseStoredCollegesStrict();
                const normalizedRemote = normalizeCollegeList(remote);
                const merged = mergeCollegeLists(normalizedRemote, localStored);
                if (!active || merged.length === 0) return;
                setColleges(merged);
                if (!areCollegeListsEqual(normalizedRemote, merged)) {
                    try {
                        await saveCollegesState(merged);
                    } catch {
                        // Keep merged local state; sync can be retried later.
                    }
                }
            } catch {
                // Keep local fallback when backend is unavailable.
            }
        };
        hydrateColleges();
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        let active = true;
        const token = localStorage.getItem("access_token");
        if (!token) {
            return () => {
                active = false;
            };
        }
        const hydrateAssessmentConfig = async () => {
            try {
                const [templates, scales] = await Promise.all([listAssessmentTemplates(), listGradingScales()]);
                if (!active) return;
                if (Array.isArray(templates) && templates.length > 0) {
                    setAssessmentTemplates(
                        templates.map((item) => ({
                            ...item,
                            id: item?.id ?? item?.code ?? "",
                        }))
                    );
                }
                if (Array.isArray(scales) && scales.length > 0) {
                    setGradingScales(
                        scales.map((item) => ({
                            ...item,
                            id: item?.id ?? item?.code ?? "",
                        }))
                    );
                }
            } catch {
                // Keep local defaults when backend is unavailable.
            }
        };
        hydrateAssessmentConfig();
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        if (!showAddModal) return;
        if (!Array.isArray(addCourseYearOptions) || addCourseYearOptions.length === 0) return;
        const allowed = new Set(addCourseYearOptions.map((year) => String(year?.id || "")));
        if (!allowed.has(String(newCourse.year || ""))) {
            setNewCourse((prev) => ({ ...prev, year: String(addCourseYearOptions[0]?.id || "1") }));
        }
    }, [addCourseYearOptions, newCourse.year, showAddModal]);
    useEffect(() => {
        if (!showAddModal) return;
        if (!Array.isArray(addCourseTemplateOptions) || addCourseTemplateOptions.length === 0) return;
        const allowed = new Set(addCourseTemplateOptions.map((item) => String(item?.id ?? item?.code ?? "")));
        if (!allowed.has(String(newCourse.assessmentTemplateId || ""))) {
            applyTemplateComponentsToCourse(String(addCourseTemplateOptions[0]?.id ?? addCourseTemplateOptions[0]?.code ?? ""), false);
        }
    }, [addCourseTemplateOptions, newCourse.assessmentTemplateId, showAddModal, applyTemplateComponentsToCourse]);
    useEffect(() => {
        if (!showAddModal) return;
        if (!Array.isArray(addCourseScaleOptions) || addCourseScaleOptions.length === 0) return;
        const allowed = new Set(addCourseScaleOptions.map((item) => String(item?.id ?? item?.code ?? "")));
        if (!allowed.has(String(newCourse.gradingScaleId || ""))) {
            setNewCourse((prev) => ({
                ...prev,
                gradingScaleId: String(addCourseScaleOptions[0]?.id ?? addCourseScaleOptions[0]?.code ?? ""),
            }));
        }
    }, [addCourseScaleOptions, newCourse.gradingScaleId, showAddModal]);

    useEffect(() => {
        if (showAddModal) return;
        setShowAssessmentBuilder(false);
    }, [showAddModal]);

    const openGroupsManager = (course) => {
        setShowGroupsModal(course);
        setEditingGroupId("");
        setGroupForm({
            name: "",
            targetGroupId: "",
            day: DAY_OPTIONS[0],
            time: buildTimeRange(START_TIME_OPTIONS[0]),
            start: START_TIME_OPTIONS[0],
            duration: 2,
            hall: "",
            instructor: "",
            capacity: "",
        });
    };
    const getCourseKey = (course) =>
        `${String(course?.id || "").trim().toUpperCase()}::${String(course?.semester || "").trim().toLowerCase()}::${String(course?.collegeId || "").trim().toUpperCase()}`;
    const openEditCourseModal = (course) => {
        if (!course) return;
        setEditingCourseKey(getCourseKey(course));
        setNewCourse({
            id: String(course.id || ""),
            name: String(course.name || ""),
            year: String(course.year || "1"),
            semester: String(course.semester || selectedSemester || "autumn"),
            hours: Number(course.hours || 3),
            prereq: String(course.prereq || ""),
            college: String(course.college || ""),
            collegeId: String(course.collegeId || ""),
            trackId: String(course.trackId || ""),
            trackName: String(course.trackName || ""),
            assessmentTemplateId: String(course.assessmentTemplateId || course.assessment_template_id || ""),
            gradingScaleId: String(course.gradingScaleId || course.grading_scale_id || ""),
            allowAssessmentOverride: Boolean(course.allowAssessmentOverride ?? course.allow_assessment_override ?? false),
            assessmentOverrideComponents: courseAssessmentComponents(course, assessmentTemplates),
            assessmentTotalMax: Number(course.assessmentTotalMax || course.maxTotal || 0),
            category: String(course.category || "تخصص"),
            lecture: {
                day: toDayOptionValue(course?.lecture?.day || "الاحد"),
                start: String(course?.lecture?.start || parseStartFromRange(course?.lecture?.time) || "08:00"),
                duration: Number(course?.lecture?.duration || 2),
                time: buildTimeRange(String(course?.lecture?.start || parseStartFromRange(course?.lecture?.time) || "08:00"), Number(course?.lecture?.duration || 2)),
                hall: String(course?.lecture?.hall || ""),
                instructor: String(course?.lecture?.instructor || ""),
                targetGroupId: String(course?.lecture?.targetGroupId || buildDefaultLectureTargetGroupId(course)),
            },
        });
        setShowAssessmentBuilder(false);
        setShowAddModal(true);
    };

    const updateCourseGroups = (courseId, nextGroups) => {
        setCourses((prev) =>
            prev.map((course) => {
                if (course.id !== courseId) return course;
                return { ...course, groups: nextGroups };
            })
        );

        setShowGroupsModal((prev) => (prev ? { ...prev, groups: nextGroups } : prev));
    };

    const handleSaveGroup = () => {
        if (!showGroupsModal) return;
        const sectionName = String(groupForm.name || "").trim() || `مجموعة ${showGroupsModal.groups?.length + 1 || 1}`;
        const targetGroupId = String(groupForm.targetGroupId || sectionName).trim();
        if (!targetGroupId) {
            openScheduleAlert("يرجى تحديد المجموعة المستهدفة (Target Group).");
            return;
        }
        const autoId = buildGroupAutoId(showGroupsModal, sectionName, showGroupsModal.groups?.length + 1 || 1);

        const nextGroup = {
            id: editingGroupId || autoId,
            name: sectionName,
            targetGroupId,
            day: toDayOptionValue(groupForm.day || DAY_OPTIONS[0]),
            time: groupForm.time || buildTimeRange(groupForm.start || START_TIME_OPTIONS[0], Number(groupForm.duration || 2)),
            start: groupForm.start || parseStartFromRange(groupForm.time) || START_TIME_OPTIONS[0],
            duration: Number(groupForm.duration || 2),
            hall: groupForm.hall || "",
            instructor: String(groupForm.instructor || "").trim(),
            capacity: groupForm.capacity || "",
        };
        const groupChronologyError = validateSessionChronology(nextGroup, "المجموعة");
        if (groupChronologyError) {
            openScheduleAlert(groupChronologyError, "خطأ في وقت المجموعة");
            return;
        }

        const nextWindow = parseGroupWindow(nextGroup);
        if (!nextWindow) {
            openScheduleAlert("وقت المجموعة غير صحيح. استخدم صيغة HH:MM.");
            return;
        }
        const targetScopeKey = toCourseScopeKey(showGroupsModal);
        const targetGroupKey = normalizeScheduleToken(nextGroup.targetGroupId || nextGroup.name || nextGroup.id);
        const roomKey = normalizeScheduleToken(nextGroup.hall);
        const instructorKey = normalizeScheduleToken(nextGroup.instructor);
        const targetSemesterKey = normalizeKeyPart(showGroupsModal?.semester || "");
        const conflicts = [];
        (Array.isArray(courses) ? courses : []).forEach((course) => {
            const sameSemester = normalizeKeyPart(course?.semester || "") === targetSemesterKey;
            if (!sameSemester) return;
            const groups = Array.isArray(course?.groups) ? course.groups : [];
            groups.forEach((group) => {
                if (String(course?.id || "") === String(showGroupsModal?.id || "") && String(group?.id || "") === String(editingGroupId || "")) return;
                const existingWindow = parseGroupWindow(group);
                if (!existingWindow || !hasWindowOverlap(nextWindow, existingWindow)) return;

                const existingRoomKey = normalizeScheduleToken(group?.hall);
                if (roomKey && existingRoomKey && roomKey === existingRoomKey) {
                    conflicts.push("This room is already occupied at this time.");
                }

                const existingInstructorKey = normalizeScheduleToken(group?.instructor);
                if (instructorKey && existingInstructorKey && instructorKey === existingInstructorKey) {
                    conflicts.push("This instructor already has a class at this time.");
                }

                const existingScopeKey = toCourseScopeKey(course);
                const existingTargetGroupKey = normalizeScheduleToken(group?.targetGroupId || group?.name || group?.id);
                if (targetGroupKey && existingTargetGroupKey && targetGroupKey === existingTargetGroupKey && targetScopeKey === existingScopeKey) {
                    conflicts.push("This student group already has another section at this time.");
                }
            });
        });
        const uniqueConflicts = [...new Set(conflicts)];
        if (uniqueConflicts.length > 0) {
            openScheduleAlert(uniqueConflicts, "يوجد تعارض في الجدول");
            return;
        }

        const prevGroups = Array.isArray(showGroupsModal.groups) ? showGroupsModal.groups : [];
        const nextGroups = editingGroupId
            ? prevGroups.map((group) => (group.id === editingGroupId ? { ...group, ...nextGroup } : group))
            : [...prevGroups, nextGroup];

        updateCourseGroups(showGroupsModal.id, nextGroups);
        setEditingGroupId("");
        setGroupForm({
            name: "",
            targetGroupId: "",
            day: DAY_OPTIONS[0],
            time: buildTimeRange(START_TIME_OPTIONS[0]),
            start: START_TIME_OPTIONS[0],
            duration: 2,
            hall: "",
            instructor: "",
            capacity: "",
        });
    };

    const handleEditGroup = (group) => {
        setEditingGroupId(group.id);
        setGroupForm({
            name: group.name || "",
            targetGroupId: group.targetGroupId || group.name || "",
            day: toDayOptionValue(group.day || DAY_OPTIONS[0]),
            time: group.time || buildTimeRange(group.start || START_TIME_OPTIONS[0], Number(group.duration || 2)),
            start: group.start || parseStartFromRange(group.time) || START_TIME_OPTIONS[0],
            duration: Number(group.duration || 2),
            hall: group.hall || "",
            instructor: group.instructor || "",
            capacity: group.capacity || "",
        });
    };

    const handleDeleteGroup = (groupId) => {
        if (!showGroupsModal) return;
        const prevGroups = Array.isArray(showGroupsModal.groups) ? showGroupsModal.groups : [];
        const nextGroups = prevGroups.filter((group) => group.id !== groupId);
        updateCourseGroups(showGroupsModal.id, nextGroups);
    };

    // دالة الحذف المُحسنة - تم التأكد من عملها بنسبة 100%
    const handleDeleteCourse = (courseToDelete) => {
        const targetId = String(courseToDelete?.id || "").trim().toLowerCase();
        const targetCode = String(courseToDelete?.code || courseToDelete?.id || "").trim().toLowerCase();
        const isSameCourse = (item = {}) => {
            const itemId = String(item.id || "").trim().toLowerCase();
            const itemCode = String(item.code || item.id || "").trim().toLowerCase();
            if (!targetId && !targetCode) return false;
            return itemId === targetId || itemCode === targetCode;
        };

        // استخدام window.confirm لأننا في بيئة iframe
        if (window.confirm("هل أنت متأكد من حذف هذه المادة؟")) {
            setCourses((prev) => prev.filter((course) => !isSameCourse(course)));
            setStudentRegistrations((prev) => prev.filter((item) => !isSameCourse(item)));
            setAcademicRecords((prev) => prev.filter((item) => !isSameCourse(item)));

            // Defensive cleanup for legacy keys that might still feed old screens.
            try {
                const cleanArrayByCourse = (key) => {
                    const raw = JSON.parse(localStorage.getItem(key) || "[]");
                    if (!Array.isArray(raw)) return;
                    const next = raw.filter((item) => !isSameCourse(item));
                    localStorage.setItem(key, JSON.stringify(next));
                };
                cleanArrayByCourse("system.courses");
                cleanArrayByCourse("system.studentRegistrations");
                cleanArrayByCourse("system.academicRecords");
                cleanArrayByCourse("selectedCourses");
                cleanArrayByCourse("admin.gradesData");
            } catch {
                // ignore local cleanup errors
            }
        }
    };

    const handleSaveCourse = () => {
        if (!newCourse.id || !newCourse.name) {
            alert("يرجى إدخال كود واسم المادة");
            return;
        }
        if (!String(newCourse.college || "").trim()) {
            alert("يرجى تحديد الكلية/التخصص للمادة");
            return;
        }
        const templateComponents = mapTemplateToComponents(getTemplateById(addCourseTemplateOptions, newCourse.assessmentTemplateId));
        const templateTotal = toAssessmentTotal(templateComponents);
        const manualComponents = normalizeAssessmentComponents(newCourse.assessmentOverrideComponents || []);
        const baseComponents = newCourse.allowAssessmentOverride ? manualComponents : templateComponents;
        const targetTotal = Number(newCourse.assessmentTotalMax || templateTotal || 0);
        const activeComponents = scaleComponentsToTotal(baseComponents, targetTotal);
        const activeTotal = toAssessmentTotal(activeComponents);
        const persistedTemplateComponents = templateComponents.length > 0 ? templateComponents : baseComponents;
        if (newCourse.allowAssessmentOverride && manualComponents.length === 0) {
            alert("يرجى إضافة عنصر تقييم واحد على الأقل");
            return;
        }
        if (!Number.isFinite(targetTotal) || targetTotal <= 0) {
            alert("يرجى اختيار المجموع الكلي للمادة");
            return;
        }
        const nextLecture = {
            ...newCourse.lecture,
            day: toDayOptionValue(newCourse?.lecture?.day || DAY_OPTIONS[0]),
            start: String(newCourse?.lecture?.start || "").trim() || START_TIME_OPTIONS[0],
            duration: Number(newCourse?.lecture?.duration || 2),
            hall: String(newCourse?.lecture?.hall || "").trim(),
            instructor: String(newCourse?.lecture?.instructor || "").trim(),
            targetGroupId: String(newCourse?.lecture?.targetGroupId || buildDefaultLectureTargetGroupId(newCourse)).trim(),
        };
        nextLecture.time = buildTimeRange(nextLecture.start || START_TIME_OPTIONS[0], Number(nextLecture.duration || 2));
        const lectureChronologyError = validateSessionChronology(nextLecture, "المحاضرة");
        if (lectureChronologyError) {
            openScheduleAlert(lectureChronologyError, "خطأ في وقت المحاضرة");
            return;
        }
        const lectureWindow = parseSessionWindow(nextLecture);
        if (!lectureWindow) {
            openScheduleAlert("وقت المحاضرة غير صحيح. استخدم صيغة HH:MM.");
            return;
        }
        if (!nextLecture.targetGroupId) {
            openScheduleAlert("يرجى تحديد المجموعة المستهدفة.");
            return;
        }
        const targetScopeKey = toCourseScopeKey(newCourse);
        const lectureRoomKey = normalizeScheduleToken(nextLecture.hall);
        const lectureInstructorKey = normalizeScheduleToken(nextLecture.instructor);
        const lectureGroupKey = normalizeScheduleToken(nextLecture.targetGroupId);
        const lectureSemesterKey = normalizeKeyPart(newCourse?.semester || "");
        const courseConflicts = [];
        (Array.isArray(courses) ? courses : []).forEach((course) => {
            const sameSemester = normalizeKeyPart(course?.semester || "") === lectureSemesterKey;
            if (!sameSemester) return;
            const isEditingSameCourse = Boolean(editingCourseKey) && getCourseKey(course) === editingCourseKey;

            if (!isEditingSameCourse) {
                const existingLecture = course?.lecture || {};
                const existingLectureWindow = parseSessionWindow(existingLecture);
                if (existingLectureWindow && hasWindowOverlap(lectureWindow, existingLectureWindow)) {
                    const existingRoomKey = normalizeScheduleToken(existingLecture?.hall);
                    if (lectureRoomKey && existingRoomKey && lectureRoomKey === existingRoomKey) {
                        courseConflicts.push("This room is already occupied at this time.");
                    }
                    const existingInstructorKey = normalizeScheduleToken(existingLecture?.instructor);
                    if (lectureInstructorKey && existingInstructorKey && lectureInstructorKey === existingInstructorKey) {
                        courseConflicts.push("This instructor already has a class at this time.");
                    }
                    const existingScopeKey = toCourseScopeKey(course);
                    const existingGroupKey = normalizeScheduleToken(existingLecture?.targetGroupId || buildDefaultLectureTargetGroupId(course));
                    if (lectureGroupKey && existingGroupKey && lectureGroupKey === existingGroupKey && targetScopeKey === existingScopeKey) {
                        courseConflicts.push("This student group already has another section at this time.");
                    }
                }
            }

            const groups = Array.isArray(course?.groups) ? course.groups : [];
            groups.forEach((group) => {
                const groupWindow = parseSessionWindow(group);
                if (!groupWindow || !hasWindowOverlap(lectureWindow, groupWindow)) return;
                const groupRoomKey = normalizeScheduleToken(group?.hall);
                if (lectureRoomKey && groupRoomKey && lectureRoomKey === groupRoomKey) {
                    courseConflicts.push("This room is already occupied at this time.");
                }
                const groupInstructorKey = normalizeScheduleToken(group?.instructor);
                if (lectureInstructorKey && groupInstructorKey && lectureInstructorKey === groupInstructorKey) {
                    courseConflicts.push("This instructor already has a class at this time.");
                }
                const groupScopeKey = toCourseScopeKey(course);
                const groupTargetKey = normalizeScheduleToken(group?.targetGroupId || group?.name || group?.id);
                if (lectureGroupKey && groupTargetKey && lectureGroupKey === groupTargetKey && targetScopeKey === groupScopeKey) {
                    courseConflicts.push("This student group already has another section at this time.");
                }
            });
        });
        const uniqueCourseConflicts = [...new Set(courseConflicts)];
        if (uniqueCourseConflicts.length > 0) {
            openScheduleAlert(uniqueCourseConflicts, "يوجد تعارض في المحاضرة");
            return;
        }

        const legacyScores = mapComponentsToLegacyScores(activeComponents);
        const payload = {
            ...newCourse,
            id: String(newCourse.id || "").trim(),
            name: String(newCourse.name || "").trim(),
            prereq: String(newCourse.prereq || "").trim(),
            hours: Number(newCourse.hours || 0),
            college: String(newCourse.college || "").trim(),
            collegeId: String(newCourse.collegeId || newCourse.college || "").trim(),
            assessmentTemplateId: String(newCourse.assessmentTemplateId || "").trim(),
            gradingScaleId: String(newCourse.gradingScaleId || "").trim(),
            allowAssessmentOverride: Boolean(newCourse.allowAssessmentOverride),
            assessmentComponents: persistedTemplateComponents,
            assessment_components: persistedTemplateComponents,
            templateComponents: persistedTemplateComponents,
            assessmentOverrideComponents: newCourse.allowAssessmentOverride ? manualComponents : [],
            assessment_override_components: newCourse.allowAssessmentOverride ? manualComponents : [],
            assessmentTotalMax: activeTotal,
            maxTotal: activeTotal,
            markingScheme: {
                mid1: Number(legacyScores.mid1 || 0),
                mid2: Number(legacyScores.mid2 || 0),
                yearWork: Number(legacyScores.yearWork || 0),
                final: Number(legacyScores.final || 0),
            },
            mid1: Number(legacyScores.mid1 || 0),
            mid2: Number(legacyScores.mid2 || 0),
            yearWork: Number(legacyScores.yearWork || 0),
            ywork: Number(legacyScores.yearWork || 0),
            final: Number(legacyScores.final || 0),
            lecture: {
                ...nextLecture,
            },
        };
        if (editingCourseKey) {
            setCourses(
                courses.map((course) =>
                    getCourseKey(course) === editingCourseKey
                        ? {
                              ...course,
                              ...payload,
                              groups: Array.isArray(course.groups) ? course.groups : [],
                          }
                        : course
                )
            );
        } else {
            setCourses([
                ...courses,
                {
                    ...payload,
                    groups: [],
                },
            ]);
        }
        setShowAddModal(false);
        setEditingCourseKey("");
        setNewCourse({
            id: "",
            name: "",
            year: "1",
            semester: selectedSemester,
            hours: 3,
            prereq: "",
            college: "",
            collegeId: "",
            trackId: "",
            trackName: "",
            assessmentTemplateId: "",
            gradingScaleId: "",
            allowAssessmentOverride: false,
            assessmentOverrideComponents: [],
            assessmentTotalMax: 0,
            category: "تخصص",
            lecture: { day: "الاحد", time: "08:00 - 10:00", start: "08:00", duration: 2, hall: "", instructor: "", targetGroupId: "" },
        });
    };

    const handleAddCollege = async () => {
        const id = String(collegeForm.id || "").trim().toUpperCase();
        const name = String(collegeForm.name || "").trim();
        if (!id || !name) {
            alert("يرجى إدخال كود واسم الكلية");
            return;
        }
        const exists = colleges.some((college) => String(college.id || "").toUpperCase() === id);
        if (exists) {
            alert("كود الكلية موجود بالفعل");
            return;
        }
        const nextColleges = normalizeCollegeList([...colleges, { id, name }]);
        setColleges(nextColleges);
        if (localStorage.getItem("access_token")) {
            try {
                await saveCollegesState(nextColleges);
            } catch (error) {
                alert(error?.message || "فشل حفظ الكلية على الخادم");
            }
        }
        setCollegeForm({ id: "", name: "" });
        setShowCollegeModal(false);
    };

    const handleDeleteCollege = async (collegeId) => {
        const hasCourses = courses.some((course) => String(course.collegeId || "").toUpperCase() === String(collegeId || "").toUpperCase());
        if (hasCourses) {
            alert("لا يمكن حذف الكلية لوجود مواد مرتبطة بها");
            return;
        }
        if (!window.confirm("هل أنت متأكد من حذف الكلية؟")) return;
        const nextColleges = normalizeCollegeList(colleges.filter((college) => String(college.id || "").toUpperCase() !== String(collegeId || "").toUpperCase()));
        setColleges(nextColleges);
        if (localStorage.getItem("access_token")) {
            try {
                await saveCollegesState(nextColleges);
            } catch (error) {
                alert(error?.message || "فشل حذف الكلية من الخادم");
            }
        }
    };

    const handleAddYear = () => {
        const selectedId = String(yearForm.id || "").trim();
        if (!selectedId) {
            alert("يرجى اختيار الدفعة من القائمة");
            return;
        }
        const exists = years.some((y) => String(y.id) === selectedId);
        if (exists) {
            alert("هذه الدفعة موجودة بالفعل");
            return;
        }
        const preset = YEAR_PRESET_OPTIONS.find((option) => option.id === selectedId);
        const selectedName = preset?.name || `السنة ${selectedId}`;
        const nextYears = [...years, { id: selectedId, name: selectedName }].sort((a, b) => Number(a.id) - Number(b.id));
        setYears(nextYears);
        setYearForm({ id: "" });
        setShowYearModal(false);
    };

    const handleDeleteYear = (yearId) => {
        const hasCourses = courses.some((c) => c.year === yearId);
        if (hasCourses) {
            alert("لا يمكن حذف هذه السنة لوجود مواد مرتبطة بها. قم بحذف المواد أولاً.");
            return;
        }
        if (window.confirm("هل أنت متأكد من حذف هذه السنة الدراسية؟")) {
            setYears(years.filter((y) => y.id !== yearId));
            if (selectedYear === yearId) setSelectedYear("all");
        }
    };

    const upsertCollegePolicy = (policyKey, updater) => {
        setRegistrationSettings((prev) => {
            const currentPolicy = prev?.collegePolicies?.[policyKey] || {};
            const nextPolicy = updater(currentPolicy);
            return {
                ...prev,
                collegePolicies: {
                    ...(prev?.collegePolicies || {}),
                    [policyKey]: nextPolicy,
                },
            };
        });
    };

    const addCollegeTrack = (policyKey) => {
        const draft = String(trackDraftByCollege?.[policyKey] || "").trim();
        if (!draft) return;
        upsertCollegePolicy(policyKey, (currentPolicy) => ({
            ...currentPolicy,
            branchingYear: currentPolicy?.branchingYear || "",
            totalYears: Number(currentPolicy?.totalYears || years.length || 4) || years.length || 4,
            yearIds: normalizeYearIds(currentPolicy?.yearIds, buildSequentialYearIds(currentPolicy?.totalYears || years.length || 4, years)),
            tracks: normalizeTracks([...(currentPolicy?.tracks || []), { id: draft, name: draft }]),
        }));
        setTrackDraftByCollege((prev) => ({ ...prev, [policyKey]: "" }));
    };

    const removeCollegeTrack = (policyKey, trackId) => {
        upsertCollegePolicy(policyKey, (currentPolicy) => ({
            ...currentPolicy,
            branchingYear: currentPolicy?.branchingYear || "",
            totalYears: Number(currentPolicy?.totalYears || years.length || 4) || years.length || 4,
            yearIds: normalizeYearIds(currentPolicy?.yearIds, buildSequentialYearIds(currentPolicy?.totalYears || years.length || 4, years)),
            tracks: normalizeTracks(currentPolicy?.tracks || []).filter((track) => normalizeKey(track.id) !== normalizeKey(trackId)),
        }));
    };

    const getThresholdDraft = (policyKey, currentPolicy) => {
        const existingDraft = levelThresholdDraftByCollege?.[policyKey];
        if (existingDraft && typeof existingDraft === "object") return existingDraft;
        const initial = {};
        const normalized = normalizeLevelThresholds(currentPolicy?.levelThresholds || {});
        Object.entries(normalized).forEach(([yearId, minHours]) => {
            initial[yearId] = String(minHours);
        });
        return initial;
    };

    const setThresholdDraftValue = (policyKey, yearId, value) => {
        setLevelThresholdDraftByCollege((prev) => ({
            ...prev,
            [policyKey]: {
                ...(prev?.[policyKey] || {}),
                [yearId]: value,
            },
        }));
    };

    const saveCollegePolicy = async (policyKey) => {
        if (!policyKey) return;
        setPolicySavingByCollege((prev) => ({ ...prev, [policyKey]: true }));
        setPolicySaveStatusByCollege((prev) => ({ ...prev, [policyKey]: { type: "", message: "" } }));
        const prevPolicies = registrationSettings?.collegePolicies || {};
        const currentPolicy = prevPolicies?.[policyKey] || {};
        const draft = getThresholdDraft(policyKey, currentPolicy);
        const policyYears = resolvePolicyYears(currentPolicy, years);
        const allowedYearIds = new Set(policyYears.map((year) => String(year?.id || "")));
        const nextThresholds = {};

        Object.entries(draft || {}).forEach(([yearId, rawValue]) => {
            if (!allowedYearIds.has(String(yearId))) return;
            const parsed = Number(rawValue);
            if (!Number.isFinite(parsed)) return;
            nextThresholds[yearId] = Math.max(0, parsed);
        });

        const totalYears = Number(currentPolicy?.totalYears || policyYears.length || years.length || 4);
        const yearIds = normalizeYearIds(currentPolicy?.yearIds, buildSequentialYearIds(totalYears, years));
        const nextCollegePolicies = {
            ...prevPolicies,
            [policyKey]: {
                ...currentPolicy,
                branchingYear: String(currentPolicy?.branchingYear || ""),
                totalYears: Math.max(1, Math.min(MAX_COLLEGE_YEARS, totalYears)),
                yearIds,
                tracks: normalizeTracks(currentPolicy?.tracks || []),
                levelThresholds: normalizeLevelThresholds(nextThresholds),
            },
        };

        const result = await saveRegistrationSettingsNow({ collegePolicies: nextCollegePolicies });
        if (result?.ok) {
            setPolicySaveStatusByCollege((prev) => ({ ...prev, [policyKey]: { type: "success", message: "تم حفظ الساعات بنجاح" } }));
        } else {
            setPolicySaveStatusByCollege((prev) => ({
                ...prev,
                [policyKey]: { type: "error", message: result?.message || "فشل الحفظ على الخادم" },
            }));
        }
        setPolicySavingByCollege((prev) => ({ ...prev, [policyKey]: false }));
    };

    const setPolicyTotalYears = (policyKey, rawValue) => {
        const parsed = Number(rawValue);
        const totalYears = Number.isFinite(parsed) ? Math.max(1, Math.min(MAX_COLLEGE_YEARS, parsed)) : Math.max(1, years.length || 4);
        upsertCollegePolicy(policyKey, (currentPolicy) => {
            const yearIds = buildSequentialYearIds(totalYears, years);
            const currentThresholds = normalizeLevelThresholds(currentPolicy?.levelThresholds || {});
            const nextThresholds = {};
            yearIds.forEach((id) => {
                if (currentThresholds[id] !== undefined) nextThresholds[id] = currentThresholds[id];
            });
            return {
                ...currentPolicy,
                totalYears,
                yearIds,
                branchingYear: currentPolicy?.branchingYear || "",
                tracks: normalizeTracks(currentPolicy?.tracks || []),
                levelThresholds: nextThresholds,
            };
        });
    };

    const filteredCourses = useMemo(() => {
        return courses.filter((c) => {
            const matchCollege = selectedCollegeFilter === "all" || String(c.collegeId || c.college) === selectedCollegeFilter;
            const matchYear = selectedYear === "all" || c.year === selectedYear;
            const matchSemester = c.semester === selectedSemester;
            return matchCollege && matchYear && matchSemester;
        });
    }, [courses, selectedCollegeFilter, selectedYear, selectedSemester]);
    
    const coursesFilterCollege = useMemo(
        () => colleges.find((college) => String(college.id) === String(selectedCollegeFilter)) || null,
        [colleges, selectedCollegeFilter]
    );

    const filterYearOptions = useMemo(() => {
        if (!coursesFilterCollege) return years;
        const policyKey = normalizeKey(coursesFilterCollege.id);
        const policy = collegePolicies[policyKey] || {};
        return resolveCollegeScopedYears({
            policy,
            allYears: years,
            collegeId: coursesFilterCollege.id,
            collegeName: coursesFilterCollege.name,
        });
    }, [coursesFilterCollege, collegePolicies, years]);
    const policyModalCollege = useMemo(
        () => colleges.find((college) => String(college.id) === String(showCollegePolicyModal)) || null,
        [colleges, showCollegePolicyModal]
    );
    const policyModalKey = policyModalCollege ? normalizeKey(policyModalCollege.id) : "";
    const policyModalData = policyModalKey ? collegePolicies[policyModalKey] || {} : {};
    const policyModalTracks = normalizeTracks(policyModalData?.tracks || []);
    const policyModalYears = resolvePolicyYears(policyModalData, years);
    const policyModalThresholdDraft = policyModalKey ? getThresholdDraft(policyModalKey, policyModalData) : {};
    const policyModalTotalYears = Math.max(1, Number(policyModalData?.totalYears || policyModalYears.length || years.length || 4));
    const yearsFilterCollege = useMemo(
        () => colleges.find((college) => String(college.id) === String(yearsCollegeFilter)) || null,
        [colleges, yearsCollegeFilter]
    );
    const yearsFilterPolicyKey = yearsFilterCollege ? normalizeKey(yearsFilterCollege.id) : "";
    const yearsFilterPolicy = yearsFilterPolicyKey ? collegePolicies[yearsFilterPolicyKey] || {} : {};
    const yearsCards = yearsFilterCollege ? resolvePolicyYears(yearsFilterPolicy, years) : years;
    const dataStatus = useMemo(() => {
        if (activeTab === "years") {
            return {
                label: "عدد الدفعات المعروضة",
                value: yearsCards.length,
                ratio: Math.min((yearsCards.length / 10) * 100, 100),
            };
        }
        if (activeTab === "colleges") {
            return {
                label: "عدد الكليات المعروضة",
                value: colleges.length,
                ratio: Math.min((colleges.length / 10) * 100, 100),
            };
        }
        return {
            label: "عدد المواد المعروضة",
            value: filteredCourses.length,
            ratio: Math.min((filteredCourses.length / 20) * 100, 100),
        };
    }, [activeTab, yearsCards.length, colleges.length, filteredCourses.length]);
    const getCourseCountForYearCard = useCallback((yearId) => {
        return courses.filter((c) => {
            if (String(c.year) !== String(yearId)) return false;
            if (yearsFilterCollege) {
                return String(c.collegeId || c.college) === String(yearsFilterCollege.id);
            }
            return true;
        }).length;
    }, [courses, yearsFilterCollege]);

    const semesters = [
        { id: "autumn", label: t("course_mgmt_semester_autumn"), icon: <CloudRain size={16} /> },
        { id: "spring", label: t("course_mgmt_semester_spring"), icon: <Flower2 size={16} /> },
        { id: "summer", label: t("course_mgmt_semester_summer"), icon: <Sun size={16} /> },
    ];

    return (
        <div className="min-h-screen pb-6 flex flex-col font-sans text-right select-none" dir={isArabic ? "rtl" : "ltr"}>
            {/* Header */}
            <header className="sticky top-0 z-50 py-2 flex justify-start">
                <MobileHorizontalScroll
                    className="w-auto"
                    contentClassName="flex gap-1 bg-white p-2 rounded-[2.5rem] border border-cyan-100 shadow-sm"
                    hintText="فلتر عرض المواد حسب الفصل"
                >
                    {semesters.map((sem) => (
                        <button
                            key={sem.id}
                            onClick={() => setSelectedSemester(sem.id)}
                            className={`shrink-0 px-3 sm:px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-black flex items-center gap-2 border transition-all ${
                                selectedSemester === sem.id
                                    ? "bg-white shadow-md border-cyan-200 text-[#05ADCF]"
                                    : "bg-white shadow-sm border-slate-100 text-slate-500 hover:text-slate-700 hover:border-slate-200"
                            }`}
                        >
                            {sem.icon}
                            {sem.label}
                        </button>
                    ))}
                </MobileHorizontalScroll>
            </header>

            <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
                {/* Sidebar */}
                <nav className="w-full lg:w-64 bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                    <div className="mb-4 px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">{t("course_mgmt_academic_admin")}</div>
                    <button
                        onClick={() => setActiveTab("courses")}
                        className={`flex items-center gap-3 p-4 rounded-2xl transition-all ${activeTab === "courses" ? "bg-cyan-50" : "text-gray-500 hover:bg-gray-50"}`}
                        style={activeTab === "courses" ? { color: theme.primaryDark } : {}}>
                        <Layers size={20} /> <span className="font-bold">{t("course_mgmt_sidebar_courses")}</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("years")}
                        className={`flex items-center gap-3 p-4 rounded-2xl transition-all ${activeTab === "years" ? "bg-cyan-50" : "text-gray-500 hover:bg-gray-50"}`}
                        style={activeTab === "years" ? { color: theme.primaryDark } : {}}>
                        <Calendar size={20} /> <span className="font-bold">{t("course_mgmt_sidebar_batches")}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("colleges")}
                        className={`flex items-center gap-3 p-4 rounded-2xl transition-all ${activeTab === "colleges" ? "bg-cyan-50" : "text-gray-500 hover:bg-gray-50"}`}
                        style={activeTab === "colleges" ? { color: theme.primaryDark } : {}}>
                        <BookOpen size={20} /> <span className="font-bold">{t("course_mgmt_sidebar_colleges")}</span>
                    </button>

                    <div className="mt-auto p-5 bg-gradient-to-br from-gray-50 to-white rounded-[2rem] border-2 border-dashed border-gray-200">
                        <div className="flex items-center gap-2 mb-3 text-cyan-600 font-black uppercase text-[10px]">
                            <AlertCircle size={14} /> حالة البيانات
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-400">{dataStatus.label}</span>
                                <span className="text-sm font-black text-gray-700">{dataStatus.value}</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-400 rounded-full transition-all duration-500" style={{ width: `${dataStatus.ratio}%` }}></div>
                            </div>
                        </div>
                    </div>
                </nav>

                {/* Content */}
                <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                    {activeTab === "courses" && (
                        <div className="space-y-6 max-w-6xl mx-auto">
                            <div className={`flex flex-col lg:flex-row ${isArabic ? "lg:flex-row-reverse" : ""} justify-between lg:items-center gap-4`}>
                                <div className={isArabic ? "text-right" : "text-left"}>
                                    <h2 className="text-[1.8rem] sm:text-[2.1rem] font-extrabold text-slate-800 leading-tight tracking-tight">{t("course_mgmt_term_title", { semester: semesters.find((s) => s.id === selectedSemester)?.label })}</h2>
                                    <p className="text-gray-400 font-medium mt-1">{t("course_mgmt_term_subtitle")}</p>
                                </div>
                                <div className={`flex flex-col sm:flex-row gap-3 w-full lg:w-auto ${isArabic ? "lg:justify-start" : "lg:justify-end"}`}>
                                    <select
                                        value={selectedCollegeFilter}
                                        onChange={(e) => {
                                            setSelectedCollegeFilter(e.target.value);
                                            setSelectedYear("all");
                                        }}
                                        className="w-full sm:w-auto border-2 border-white rounded-2xl px-5 py-3 outline-none bg-white font-bold text-gray-700 shadow-sm focus:border-cyan-300 transition-all">
                                        <option value="all">{t("course_mgmt_all_colleges")}</option>
                                        {colleges.map((col) => (
                                            <option key={`course-filter-col-${col.id}`} value={col.id}>{col.name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        className="w-full sm:w-auto border-2 border-white rounded-2xl px-5 py-3 outline-none bg-white font-bold text-gray-700 shadow-sm focus:border-cyan-300 transition-all">
                                        <option value="all">{t("course_mgmt_all_years")}</option>
                                        {filterYearOptions.map((y) => (
                                            <option key={`course-filter-yr-${y.id}`} value={y.id}>
                                                {formatYearLabel(y)}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => {
                                            setEditingCourseKey("");
                                            setNewCourse({
                                                id: "",
                                                name: "",
                                                year: "1",
                                                semester: selectedSemester,
                                                hours: 3,
                                                prereq: "",
                                                college: "",
                                                collegeId: "",
                                                trackId: "",
                                                trackName: "",
                                                assessmentTemplateId: "",
                                                gradingScaleId: "",
                                                allowAssessmentOverride: false,
            assessmentOverrideComponents: [],
            assessmentTotalMax: 0,
            category: "تخصص",
                                                lecture: { day: "الاحد", time: "08:00 - 10:00", start: "08:00", duration: 2, hall: "", instructor: "", targetGroupId: "" },
                                            });
                                            setShowAssessmentBuilder(false);
                                            setShowAddModal(true);
                                        }}
                                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-2xl text-white font-black shadow-xl shadow-cyan-200 hover:scale-[1.02] active:scale-95 transition-all"
                                        style={{ backgroundColor: theme.primary }}>
                                        <Plus size={20} /> {t("course_mgmt_add_course")}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {filteredCourses.length === 0 ? (
                                    <div className="col-span-full py-32 text-center bg-white rounded-[3rem] border-4 border-dashed border-gray-100 text-gray-300">
                                        <div className="mb-6 flex justify-center">
                                            <BookOpen size={80} className="opacity-10" />
                                        </div>
                                        <p className="text-xl font-black">{t("course_mgmt_empty_title")}</p>
                                        <p className="text-sm font-medium italic text-gray-400">{t("course_mgmt_empty_subtitle")}</p>
                                    </div>
                                ) : (
                                    filteredCourses.map((course) => (
                                        <div
                                            key={course.id}
                                            className={`rounded-[1.5em] border shadow-sm hover:shadow-xl transition-all group relative ${
                                                isDarkMode
                                                    ? "bg-[#162b4d] border-[#27456d] hover:border-cyan-500/60"
                                                    : "bg-white border-gray-100 hover:border-cyan-100"
                                            }`}
                                        >
                                            {/* زر الحذف - تم التأكد من بقائه في الواجهة للضغط المباشر */}
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleDeleteCourse(course);
                                                }}
                                                className="absolute left-4 sm:left-6 top-4 sm:top-6 w-10 sm:w-11 h-10 sm:h-11 flex items-center justify-center rounded-2xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all z-40 border border-red-100 shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                                <Trash2 size={20} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    openEditCourseModal(course);
                                                }}
                                                className="absolute left-16 sm:left-20 top-4 sm:top-6 w-10 sm:w-11 h-10 sm:h-11 flex items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600 hover:bg-cyan-600 hover:text-white transition-all z-40 border border-cyan-100 shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                                <Pencil size={18} />
                                            </button>

                                            <div className="p-5 sm:p-8">
                                                <div className="mb-6 flex items-center gap-2">
                                                    <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase bg-cyan-50 text-cyan-600 border border-cyan-100">{course.category}</span>
                                                    <span className="px-3 py-1 rounded-lg text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                        {course.college || course.collegeId || "غير محدد"}
                                                    </span>
                                                    {Boolean(course.trackId || course.trackName) && (
                                                        <span className="px-3 py-1 rounded-lg text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-100">
                                                            {course.trackName || course.trackId}
                                                        </span>
                                                    )}
                                                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black border ${isDarkMode ? "bg-[#1d365c] text-slate-200 border-[#335680]" : "bg-gray-50 text-gray-500 border-gray-100"}`}>
                                                        {years.find((y) => y.id === course.year)?.name || "غير محدد"}
                                                    </span>
                                                </div>

                                                <h3 className={`text-xl sm:text-2xl font-black mb-2 ${isDarkMode ? "text-slate-100" : "text-gray-800"}`}>{course.name}</h3>
                                                <div className={`flex items-center gap-3 ${isDarkMode ? "text-slate-300" : "text-gray-400"}`}>
                                                    <span className="text-xs font-mono font-black">{course.id}</span>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? "bg-slate-600" : "bg-gray-200"}`}></span>
                                                    <span className="text-xs font-bold">{course.hours} ساعة معتمدة</span>
                                                </div>
                                                {course.prereq && (
                                                    <p className={`mt-2 text-[11px] font-bold ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>
                                                        المتطلب السابق: <span className={isDarkMode ? "text-slate-100" : "text-slate-700"}>{course.prereq}</span>
                                                    </p>
                                                )}

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                                                    <div className={`p-5 rounded-3xl border ${isDarkMode ? "bg-[#1a3154] border-[#355883]" : "bg-[#FBFDFE] border-gray-50"}`}>
                                                        <div className={`flex items-center gap-2 mb-2 ${isDarkMode ? "text-slate-300" : "text-gray-400"}`}>
                                                            <Clock size={14} />
                                                            <span className="text-[9px] font-black uppercase tracking-widest">المحاضرة</span>
                                                        </div>
                                                        <p className={`text-xs font-black ${isDarkMode ? "text-slate-100" : "text-gray-700"}`}>{course.lecture.day}</p>
                                                        <p className={`text-[10px] font-medium mt-0.5 ${isDarkMode ? "text-slate-300" : "text-gray-400"}`}>{course.lecture.time}</p>
                                                        <p className={`text-[9px] mt-3 font-black inline-block px-2 py-1 rounded-md ${isDarkMode ? "text-cyan-200 bg-cyan-950/50" : "text-cyan-600 bg-cyan-50"}`}>{course.lecture.hall || "لا يوجد قاعة"}</p>
                                                    </div>
                                                    <div className={`p-5 rounded-3xl border flex flex-col justify-between ${isDarkMode ? "bg-[#1a3154] border-[#355883]" : "bg-[#FBFDFE] border-gray-50"}`}>
                                                        <div>
                                                            <div className={`flex items-center gap-2 mb-2 ${isDarkMode ? "text-slate-300" : "text-gray-400"}`}>
                                                                <Users size={14} />
                                                                <span className="text-[9px] font-black uppercase tracking-widest">المجموعات</span>
                                                            </div>
                                                            <p className={`text-xs font-black ${isDarkMode ? "text-slate-100" : "text-gray-700"}`}>{course.groups.length} سكشن متاح</p>
                                                        </div>
                                                        <button
                                                            onClick={() => openGroupsManager(course)}
                                                            className={`text-[10px] font-black mt-4 flex items-center gap-1 hover:gap-2 transition-all ${isDarkMode ? "text-cyan-300" : "text-cyan-600"}`}>
                                                            إدارة السكاشن <ChevronRight size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === "years" && (
                        <div className="space-y-6 max-w-6xl mx-auto">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
                                <div>
                                    <h2 className="text-2xl sm:text-3xl font-black text-gray-900">هيكل الدفعات</h2>
                                    <p className="text-gray-400 mt-1">عرض الدفعات العامة أو دفعات كلية محددة مع تعديل مباشر</p>
                                </div>
                                <button
                                    onClick={() => setShowYearModal(true)}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-2xl text-white font-black shadow-lg"
                                    style={{ backgroundColor: theme.primary }}>
                                    <Plus size={20} /> إضافة دفعة
                                </button>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-slate-700">فلترة حسب الكلية</span>
                                        <select
                                            value={yearsCollegeFilter}
                                            onChange={(e) => setYearsCollegeFilter(e.target.value)}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
                                        >
                                            <option value="all">كل الكليات (سنين افتراضية)</option>
                                            {colleges.map((college) => (
                                                <option key={`years-filter-${college.id}`} value={college.id}>
                                                    {college.name} ({college.id})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {yearsFilterCollege && (
                                        <button
                                            type="button"
                                            onClick={() => setShowCollegePolicyModal(yearsFilterCollege.id)}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 text-sm font-black hover:bg-cyan-100 transition-all"
                                        >
                                            <SlidersHorizontal size={16} />
                                            تعديل سياسة {yearsFilterCollege.name}
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 text-[12px] font-black">
                                    <span className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                                        {yearsFilterCollege ? `الكلية: ${yearsFilterCollege.name}` : "الوضع: سنين افتراضية مشتركة"}
                                    </span>
                                    <span className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                                        عدد السنوات المعروضة: {yearsCards.length}
                                    </span>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {yearsCards.map((year, idx) => (
                                    <div
                                        key={year.id}
                                        className="bg-white p-6 rounded-[2rem] border-2 border-white shadow-sm flex items-center justify-between group hover:border-cyan-100 transition-all">
                                        <div className="flex items-center gap-5">
                                            <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-black text-xl shadow-inner">{idx + 1}</div>
                                            <div>
                                                <h4 className="font-black text-gray-800">{formatYearLabel(year)}</h4>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">{getCourseCountForYearCard(year.id)} مادة مسجلة</p>
                                            </div>
                                        </div>
                                        {yearsCollegeFilter === "all" && (
                                            <button
                                                onClick={() => handleDeleteYear(year.id)}
                                                className="p-3 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                                <Trash2 size={20} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === "colleges" && (
                        <div className="space-y-6 max-w-5xl mx-auto">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
                                <div>
                                    <h2 className="text-2xl sm:text-3xl font-black text-gray-900">إدارة الكليات</h2>
                                    <p className="text-gray-400 mt-1">إضافة وحذف الكليات الرسمية التي تظهر عند إنشاء المادة</p>
                                </div>
                                <button
                                    onClick={() => setShowCollegeModal(true)}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-2xl text-white font-black shadow-lg"
                                    style={{ backgroundColor: theme.primary }}>
                                    <Plus size={20} /> إضافة كلية
                                </button>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {colleges.map((college) => {
                                    const relatedCoursesCount = courses.filter((course) => String(course.collegeId || "").toUpperCase() === String(college.id || "").toUpperCase()).length;
                                    const policyKey = normalizeKey(college.id);
                                    const collegePolicy = collegePolicies[policyKey] || {};
                                    const collegeTracks = normalizeTracks(collegePolicy.tracks || []);
                                    const policyYears = resolvePolicyYears(collegePolicy, years);
                                    return (
                                        <div key={college.id} className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm hover:border-cyan-200 transition-all space-y-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <h4 className="font-black text-gray-800">{college.name}</h4>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">ID: {college.id}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{relatedCoursesCount} مادة</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCollegePolicyModal(college.id)}
                                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-200 text-cyan-700 bg-cyan-50 text-xs font-black hover:bg-cyan-100 transition-all">
                                                        <SlidersHorizontal size={16} />
                                                        إعدادات الكلية
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteCollege(college.id)}
                                                        className={`p-2.5 rounded-xl transition-all ${relatedCoursesCount > 0 ? "cursor-not-allowed text-gray-300 opacity-40" : "text-gray-300 hover:text-red-500 hover:bg-red-50"}`}
                                                        disabled={relatedCoursesCount > 0}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                                                <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                                    <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                                                        عدد السنين: {Math.max(1, Number(collegePolicy?.totalYears || policyYears.length || 4))}
                                                    </span>
                                                    <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                                                        التشعيب: {collegePolicy?.branchingYear ? `من السنة ${collegePolicy.branchingYear}` : "غير مفعل"}
                                                    </span>
                                                    <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">التخصصات: {collegeTracks.length}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {policyYears.map((year) => (
                                            <span key={`card-year-${policyKey}-${year.id}`} className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600">
                                                            {formatYearLabel(year)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {showCollegePolicyModal && policyModalCollege && (
                <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[1.5rem] sm:rounded-[2rem] w-full max-w-2xl max-h-[88vh] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/60">
                            <div>
                                <h3 className="text-lg sm:text-xl font-black text-gray-900">إعدادات {policyModalCollege.name}</h3>
                                <p className="text-[11px] text-slate-500 font-bold mt-1">ID: {policyModalCollege.id}</p>
                            </div>
                            <button onClick={() => setShowCollegePolicyModal(null)} className="p-2 hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200">
                                <X size={22} />
                            </button>
                        </div>
                        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[66vh] cm-soft-scroll">
                            <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50 space-y-3">
                                <p className="text-xs font-black text-slate-700 border-b border-slate-200 pb-2">سياسات الكلية</p>
                                <select
                                    value={policyModalData.branchingYear || ""}
                                    onChange={(e) =>
                                        upsertCollegePolicy(policyModalKey, (currentPolicy) => ({
                                            ...currentPolicy,
                                            branchingYear: e.target.value,
                                            totalYears: Number(currentPolicy?.totalYears || policyModalTotalYears),
                                            yearIds: normalizeYearIds(currentPolicy?.yearIds, buildSequentialYearIds(currentPolicy?.totalYears || policyModalTotalYears, years)),
                                            tracks: normalizeTracks(currentPolicy?.tracks || []),
                                            levelThresholds: normalizeLevelThresholds(currentPolicy?.levelThresholds || {}),
                                        }))
                                    }
                                    className="rounded-xl border border-slate-200 p-2.5 text-sm font-bold bg-white w-full"
                                >
                                    <option value="">بدون تشعيب</option>
                                    {policyModalYears.map((year) => (
                                        <option key={`modal-branch-${policyModalCollege.id}-${year.id}`} value={year.id}>
                                            يفتح التشعيب من {formatYearLabel(year)}
                                        </option>
                                    ))}
                                </select>
                                <div className="rounded-xl border border-slate-200 p-3 bg-white space-y-2">
                                    <p className="text-[11px] font-black text-slate-600">سياسة الساعات لكل Level</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-slate-600">عدد سنوات الكلية</span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={MAX_COLLEGE_YEARS}
                                            step={1}
                                            value={policyModalTotalYears}
                                            onChange={(e) => setPolicyTotalYears(policyModalKey, e.target.value)}
                                            className="flex-1 accent-cyan-600"
                                        />
                                        <span className="px-2 py-1 rounded-lg border border-cyan-200 bg-cyan-50 text-center text-xs font-black text-cyan-700 whitespace-nowrap">
                                            {policyModalTotalYears} سنوات
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {policyModalYears.map((year) => (
                                            <span key={`modal-year-${policyModalKey}-${year.id}`} className="px-2 py-1 rounded-lg border border-cyan-100 bg-cyan-50 text-[11px] font-black text-cyan-700">
                                                {formatYearLabel(year)}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="space-y-2">
                                        {policyModalYears.map((year) => (
                                            <label key={`threshold-${policyModalKey}-${year.id}`} className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-700">
                                                <span className="truncate">{formatYearLabel(year)}</span>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={220}
                                                    step={1}
                                                    value={Number(policyModalThresholdDraft?.[year.id] ?? 0)}
                                                    onChange={(e) => setThresholdDraftValue(policyModalKey, year.id, e.target.value)}
                                                    className="flex-1 accent-cyan-600"
                                                />
                                                <span className="w-10 text-center text-xs font-black text-slate-700">{Number(policyModalThresholdDraft?.[year.id] ?? 0)}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50 space-y-3">
                                <p className="text-xs font-black text-slate-700 border-b border-slate-200 pb-2">التخصصات</p>
                                <div className="rounded-xl border border-slate-200 p-3 bg-white space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                        {policyModalTracks.length === 0 && <span className="text-[11px] font-bold text-slate-400">لا يوجد تخصصات مضافة</span>}
                                        {policyModalTracks.map((track) => (
                                            <span key={`${policyModalKey}-${track.id}`} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700">
                                                {track.name || track.id}
                                                <button
                                                    type="button"
                                                    onClick={() => removeCollegeTrack(policyModalKey, track.id)}
                                                    className="text-rose-500 hover:text-rose-700"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                        <input
                                            value={trackDraftByCollege?.[policyModalKey] || ""}
                                            onChange={(e) => setTrackDraftByCollege((prev) => ({ ...prev, [policyModalKey]: e.target.value }))}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    addCollegeTrack(policyModalKey);
                                                }
                                            }}
                                            placeholder="اكتب تخصص واحد"
                                            className="flex-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-bold bg-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => addCollegeTrack(policyModalKey)}
                                            className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-cyan-600 text-white text-xs font-black"
                                        >
                                            إضافة
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    {policySaveStatusByCollege?.[policyModalKey]?.message && (
                                        <p
                                            className={`text-[12px] font-bold ${
                                                policySaveStatusByCollege?.[policyModalKey]?.type === "success" ? "text-emerald-600" : "text-rose-600"
                                            }`}
                                        >
                                            {policySaveStatusByCollege?.[policyModalKey]?.message}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => saveCollegePolicy(policyModalKey)}
                                    disabled={Boolean(policySavingByCollege?.[policyModalKey])}
                                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-cyan-600 text-white text-sm font-black shadow-lg shadow-cyan-600/20 disabled:opacity-60 transition-all hover:bg-cyan-700"
                                >
                                    {policySavingByCollege?.[policyModalKey] ? "جاري الحفظ..." : "حفظ إعدادات الكلية"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Add Course */}
            {showAddModal && (
                <div
                    className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${
                        isDarkMode ? "bg-transparent backdrop-blur-[1px]" : "bg-gray-900/60 backdrop-blur-md"
                    }`}
                >
                    <div
                        className={`rounded-[1.5rem] sm:rounded-[2rem] w-full max-w-3xl max-h-[88vh] overflow-hidden animate-in zoom-in-95 duration-200 ${
                            isDarkMode
                                ? "bg-[#112746] border border-[#2a486d] shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
                                : "bg-white shadow-2xl"
                        }`}
                    >
                        <div className={`p-4 sm:p-5 border-b flex justify-between items-center ${isDarkMode ? "border-[#2a486d] bg-[#10243f]" : "border-gray-200 bg-gray-50/50"}`}>
                            <h3 className="text-lg sm:text-xl font-black text-gray-900">{editingCourseKey ? "تعديل بيانات المادة" : "بيانات المادة"}</h3>
                            <button
                                onClick={() => {
                                    setShowAddModal(false);
                                    setEditingCourseKey("");
                                }}
                                className="p-2 hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-4 sm:p-5 grid grid-cols-2 gap-3 sm:gap-4 overflow-y-auto max-h-[64vh] cm-soft-scroll">
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">كود المادة</label>
                                <input
                                    value={newCourse.id}
                                    onChange={(e) => setNewCourse({ ...newCourse, id: e.target.value })}
                                    type="text"
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none focus:border-cyan-200 transition-all text-sm font-bold bg-gray-50/30"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">اسم المادة</label>
                                <input
                                    value={newCourse.name}
                                    onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                                    type="text"
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none focus:border-cyan-200 transition-all text-sm font-bold bg-gray-50/30"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">المتطلب السابق</label>
                                <input
                                    value={newCourse.prereq || ""}
                                    onChange={(e) => setNewCourse({ ...newCourse, prereq: e.target.value })}
                                    type="text"
                                    placeholder="مثال: CS101"
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none focus:border-cyan-200 transition-all text-sm font-bold bg-gray-50/30"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">السنة المستهدفة</label>
                                    <select
                                        value={newCourse.year}
                                        onChange={(e) => setNewCourse({ ...newCourse, year: e.target.value })}
                                        className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white">
                                    {addCourseYearOptions.map((y) => (
                                        <option key={y.id} value={y.id}>
                                            {formatYearLabel(y)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">عدد الساعات</label>
                                <select
                                    value={newCourse.hours}
                                    onChange={(e) => setNewCourse({ ...newCourse, hours: Number(e.target.value || 3) })}
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white">
                                    {[1, 2, 3, 4, 5, 6].map((hour) => (
                                        <option key={`hours-${hour}`} value={hour}>
                                            {hour}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">الكلية / التخصص</label>
                                <div className="flex gap-2">
                                    <select
                                        value={newCourse.collegeId}
                                        onChange={(e) =>
                                            setNewCourse((prev) => {
                                                const selectedCollege = colleges.find((item) => item.id === e.target.value);
                                                const nextPolicyKey = normalizeKey(selectedCollege?.id || "");
                                                const nextPolicy = nextPolicyKey ? collegePolicies[nextPolicyKey] || {} : {};
                                                const nextYearOptions = resolveCollegeScopedYears({
                                                    policy: nextPolicy,
                                                    allYears: years,
                                                    collegeId: selectedCollege?.id || "",
                                                    collegeName: selectedCollege?.name || "",
                                                });
                                                const nextYearIds = new Set(nextYearOptions.map((year) => String(year?.id || "")));
                                                const nextYear = nextYearIds.has(String(prev.year || ""))
                                                    ? String(prev.year || "")
                                                    : String(nextYearOptions[0]?.id || "1");
                                                return {
                                                    ...prev,
                                                    collegeId: selectedCollege?.id || "",
                                                    college: selectedCollege?.name || "",
                                                    year: nextYear,
                                                    trackId: "",
                                                    trackName: "",
                                                    assessmentTemplateId: "",
                                                    gradingScaleId: "",
                                                    assessmentOverrideComponents: [],
                                                    assessmentTotalMax: 0,
                                                };
                                            })
                                        }
                                        className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white">
                                        <option value="">اختر الكلية</option>
                                        {colleges.map((college) => (
                                            <option key={college.id} value={college.id}>
                                                {college.name} ({college.id})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">الفئة</label>
                                <select
                                    value={newCourse.category}
                                    onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })}
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white">
                                    <option value="إجباري">إجباري</option>
                                    <option value="تخصص">تخصص</option>
                                    <option value="اختياري">اختياري</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">المسار/التخصص</label>
                                <select
                                    value={newCourse.trackId || ""}
                                    onChange={(e) =>
                                        setNewCourse((prev) => {
                                            const picked = selectedCollegeTracks.find((track) => String(track.id || track.name || "") === e.target.value);
                                            return {
                                                ...prev,
                                                trackId: picked?.id || "",
                                                trackName: picked?.name || "",
                                                assessmentTemplateId: "",
                                                assessmentOverrideComponents: [],
                                                assessmentTotalMax: 0,
                                            };
                                        })
                                    }
                                    disabled={selectedCollegeTracks.length === 0}
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white disabled:opacity-60">
                                    <option value="">عام (بدون تشعيب)</option>
                                    {selectedCollegeTracks.map((track) => {
                                        const key = String(track.id || track.name || "");
                                        return (
                                            <option key={`track-${key}`} value={key}>
                                                {track.name || track.id}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">المجموع الكلي</label>
                                <select
                                    value={String(Number(newCourse.assessmentTotalMax || selectedTemplateTotal || 0) || "")}
                                    onChange={(e) => {
                                        const nextTotal = Number(e.target.value || 0);
                                        if (!Number.isFinite(nextTotal) || nextTotal <= 0) return;
                                        setNewCourse((prev) => ({ ...prev, assessmentTotalMax: nextTotal }));
                                    }}
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white"
                                >
                                    {!newCourse.assessmentTemplateId && <option value="">اختر المجموع</option>}
                                    {customTotalOptions.map((total) => (
                                        <option key={`total-option-${total}`} value={String(total)}>
                                            {total} درجة
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Grading Scale</label>
                                {singleScaleOption ? (
                                    <div className="w-full border-2 border-gray-50 p-3 rounded-xl font-bold text-sm bg-gray-50/70 text-slate-700">
                                        نظام التقدير: {singleScaleLabel}
                                    </div>
                                ) : (
                                    <select
                                        value={newCourse.gradingScaleId || ""}
                                        onChange={(e) => setNewCourse({ ...newCourse, gradingScaleId: e.target.value })}
                                        className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white">
                                        <option value="">اختر نظام التقدير</option>
                                        {addCourseScaleOptions.map((scale) => {
                                            const key = String(scale?.id ?? scale?.code ?? "");
                                            const label = String(scale?.name_ar || scale?.name_en || scale?.code || key);
                                            return (
                                                <option key={`scale-${key}`} value={key}>
                                                    {label}
                                                </option>
                                            );
                                        })}
                                    </select>
                                )}
                            </div>
                            <div className="col-span-2">
                                <label className="inline-flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(newCourse.allowAssessmentOverride)}
                                        onChange={(e) =>
                                            setNewCourse((prev) => {
                                                const nextFlag = e.target.checked;
                                                const templateComponents = mapTemplateToComponents(getTemplateById(addCourseTemplateOptions, prev.assessmentTemplateId));
                                                const currentManual = normalizeAssessmentComponents(prev.assessmentOverrideComponents || []);
                                                return {
                                                    ...prev,
                                                    allowAssessmentOverride: nextFlag,
                                                    assessmentOverrideComponents: nextFlag && currentManual.length === 0 ? templateComponents : prev.assessmentOverrideComponents,
                                                    assessmentTotalMax: toAssessmentTotal(templateComponents),
                                                };
                                            })
                                        }
                                        className="accent-cyan-500"
                                    />
                                    <span className="text-xs font-bold text-slate-600">السماح بتخصيص الدرجات لهذه المادة فقط</span>
                                </label>
                            </div>
                            <div
                                className={`col-span-2 rounded-2xl border px-3 py-3 ${
                                    isDarkMode
                                        ? "border-cyan-300/40 bg-[#17324a]"
                                        : "border-cyan-100 bg-cyan-50/50"
                                }`}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className={`text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-slate-600"}`}>
                                        مجموع القالب: <span className={isDarkMode ? "text-cyan-300" : "text-cyan-700"}>{selectedTemplateTotal || 0}</span>
                                        <span className="mr-2">| المجموع المعتمد: <span className={isDarkMode ? "text-cyan-300" : "text-cyan-700"}>{Number(newCourse.assessmentTotalMax || selectedTemplateTotal || 0)}</span></span>
                                        {newCourse.allowAssessmentOverride ? (
                                            <span className="mr-2">| مجموع التخصيص: <span className={isDarkMode ? "text-cyan-300" : "text-cyan-700"}>{overrideTotal}</span></span>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowAssessmentBuilder(true)}
                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-60 ${
                                            isDarkMode
                                                ? "border-cyan-300/40 bg-[#10263d] text-cyan-300 hover:bg-[#133151]"
                                                : "border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                                        }`}
                                        disabled={!newCourse.allowAssessmentOverride}
                                    >
                                        <SlidersHorizontal size={14} />
                                        تخصيص التوزيع
                                    </button>
                                </div>
                                {newCourse.allowAssessmentOverride && selectedTemplateTotal > 0 && overrideTotal !== selectedTemplateTotal ? (
                                    <p className="mt-2 text-[11px] font-bold text-rose-600">يجب أن يساوي مجموع التخصيص مجموع القالب ({selectedTemplateTotal}).</p>
                                ) : null}
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">اليوم</label>
                                <select
                                    value={toDayOptionValue(newCourse.lecture.day)}
                                    onChange={(e) => setNewCourse({ ...newCourse, lecture: { ...newCourse.lecture, day: toDayOptionValue(e.target.value) } })}
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white">
                                    {DAY_OPTIONS.map((day) => (
                                        <option key={`course-day-${day}`} value={day}>
                                            {day}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">الوقت</label>
                                <input
                                    value={newCourse.lecture.time}
                                    readOnly
                                    className="w-full border-2 border-gray-100 bg-gray-50 p-3 rounded-xl outline-none text-sm font-bold text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">بداية المحاضرة</label>
                                <select
                                    value={newCourse.lecture.start || ""}
                                    onChange={(e) =>
                                        setNewCourse({
                                            ...newCourse,
                                            lecture: {
                                                ...newCourse.lecture,
                                                start: e.target.value,
                                                time: buildTimeRange(e.target.value, Number(newCourse.lecture.duration || 2)),
                                            },
                                        })
                                    }
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white">
                                    {START_TIME_OPTIONS.map((start) => (
                                        <option key={`course-start-${start}`} value={start}>
                                            {start}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">مدة المحاضرة (ساعة)</label>
                                <select
                                    value={Number(newCourse.lecture.duration || 2)}
                                    onChange={(e) =>
                                        setNewCourse({
                                            ...newCourse,
                                            lecture: {
                                                ...newCourse.lecture,
                                                duration: Number(e.target.value || 2),
                                                time: buildTimeRange(newCourse.lecture.start || START_TIME_OPTIONS[0], Number(e.target.value || 2)),
                                            },
                                        })
                                    }
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none font-bold text-sm bg-white">
                                    {DURATION_OPTIONS.map((duration) => (
                                        <option key={`lecture-duration-${duration}`} value={duration}>
                                            {duration}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">القاعة</label>
                                <input
                                    value={newCourse.lecture.hall}
                                    onChange={(e) => setNewCourse({ ...newCourse, lecture: { ...newCourse.lecture, hall: e.target.value } })}
                                    type="text"
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none text-sm font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">المحاضر/المعيد</label>
                                <input
                                    value={newCourse.lecture.instructor || ""}
                                    onChange={(e) => setNewCourse({ ...newCourse, lecture: { ...newCourse.lecture, instructor: e.target.value } })}
                                    type="text"
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none text-sm font-bold"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">المجموعة المستهدفة للمحاضرة</label>
                                <select
                                    value={String(newCourse.lecture.targetGroupId || "").trim().toUpperCase()}
                                    onChange={(e) =>
                                        setNewCourse({
                                            ...newCourse,
                                            lecture: {
                                                ...newCourse.lecture,
                                                targetGroupId: String(e.target.value || "").trim().toUpperCase(),
                                            },
                                        })
                                    }
                                    className="w-full border-2 border-gray-50 p-3 rounded-xl outline-none text-sm font-bold bg-white"
                                >
                                    {lectureTargetGroupOptions.map((option) => (
                                        <option key={`lecture-target-${option.value}`} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-1 text-[11px] font-bold text-slate-400">
                                    اختر "لكل الدفعة" للمحاضرة المشتركة، أو اختر جروب محدد من نفس المادة.
                                </p>
                            </div>
                        </div>

                        {showAssessmentBuilder && (
                            <div className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                                <div className="w-full max-w-2xl rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden">
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                                        <div>
                                            <h4 className="text-base font-black text-slate-800">تخصيص توزيع الدرجات</h4>
                                            <p className="text-xs font-bold text-slate-500 mt-1">مجموع القالب: {selectedTemplateTotal || 0} | مجموع التخصيص: {overrideTotal}</p>
                                        </div>
                                        <button type="button" onClick={() => setShowAssessmentBuilder(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="p-5 space-y-3 max-h-[70vh] overflow-auto">
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                                            <select
                                                value={builderSelectedComponentKey}
                                                onChange={(e) => {
                                                    const nextKey = e.target.value;
                                                    setBuilderSelectedComponentKey(nextKey);
                                                    addBuilderComponentByKey(nextKey);
                                                }}
                                                className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none font-bold text-sm bg-white"
                                            >
                                                {availableBuilderComponents.map((item) => (
                                                    <option key={`builder-comp-${item.key}`} value={item.key}>
                                                        {item.label_ar || item.label_en || item.key}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={addBuilderComponent}
                                                disabled={availableBuilderComponents.length === 0}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-xs font-black text-white hover:bg-cyan-700 disabled:opacity-50"
                                            >
                                                <Plus size={14} /> إضافة عنصر
                                            </button>
                                        </div>

                                        {normalizedOverrideComponents.length === 0 ? (
                                            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-bold text-slate-400">
                                                لا توجد عناصر بعد. قم بإضافة عنصر من القائمة بالأعلى.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {normalizedOverrideComponents.map((component) => (
                                                    <div key={`ass-comp-${component.key}`} className="grid grid-cols-[1fr_120px_auto] gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-2">
                                                        <input
                                                            type="text"
                                                            value={component.label_ar || component.label_en || component.key}
                                                            onChange={(e) => updateBuilderComponent(component.key, { label_ar: e.target.value })}
                                                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-cyan-400"
                                                        />
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={Number(component.max_marks || 0)}
                                                            onChange={(e) => updateBuilderComponent(component.key, { max_marks: Number(e.target.value || 0) })}
                                                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-cyan-400 text-center"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => removeBuilderComponent(component.key)}
                                                            className="inline-flex items-center justify-center rounded-xl bg-rose-50 px-3 py-2 text-rose-600 hover:bg-rose-100"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t border-slate-100 px-5 py-4 flex justify-end gap-2 bg-slate-50">
                                        <button type="button" onClick={() => setShowAssessmentBuilder(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600">
                                            تم
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className={`p-4 sm:p-5 flex flex-col sm:flex-row gap-3 border-t ${isDarkMode ? "bg-[#10243f] border-[#2a486d]" : "bg-gray-50/50 border-gray-200"}`}>
                            <button
                                onClick={handleSaveCourse}
                                className={`flex-[2] py-3 sm:py-3.5 rounded-2xl text-white font-black active:scale-95 transition-all ${
                                    isDarkMode ? "shadow-[0_6px_16px_rgba(0,0,0,0.28)]" : "shadow-2xl shadow-cyan-100"
                                }`}
                                style={{ backgroundColor: theme.primary }}>
                                {editingCourseKey ? "حفظ التعديل" : "حفظ المادة"}
                            </button>
                            <button
                                onClick={() => {
                                    setShowAddModal(false);
                                    setShowAssessmentBuilder(false);
                                    setEditingCourseKey("");
                                }}
                                className={`flex-1 py-3 sm:py-3.5 rounded-2xl border font-bold ${
                                    isDarkMode ? "bg-[#112746] border-[#2a486d] text-slate-300" : "bg-white border-gray-200 text-gray-400"
                                }`}>
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Add Year */}
            {showYearModal && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-sm shadow-2xl p-6 sm:p-10 animate-in zoom-in-95">
                        <h3 className="text-xl font-black text-gray-900 mb-2 text-center">إضافة دفعة</h3>
                        <select
                            autoFocus
                            value={yearForm.id}
                            onChange={(e) => setYearForm({ id: e.target.value })}
                            className="w-full border-2 border-gray-100 p-4 rounded-2xl outline-none focus:border-cyan-400 transition-all mb-8 text-sm font-bold text-center bg-white"
                        >
                            <option value="">اختر الدفعة من القائمة</option>
                            {YEAR_PRESET_OPTIONS.map((option) => {
                                const isExists = years.some((year) => String(year.id) === option.id);
                                return (
                                    <option key={`preset-year-${option.id}`} value={option.id} disabled={isExists}>
                                        {option.name} {isExists ? "(مضافة)" : ""}
                                    </option>
                                );
                            })}
                        </select>
                        <div className="flex flex-col gap-3">
                            <button onClick={handleAddYear} className="w-full py-4 rounded-2xl text-white font-black shadow-lg" style={{ backgroundColor: theme.primary }}>
                                تأكيد
                            </button>
                            <button onClick={() => setShowYearModal(false)} className="w-full py-4 rounded-2xl bg-gray-50 font-bold text-gray-400">
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCollegeModal && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-sm shadow-2xl p-6 sm:p-10 animate-in zoom-in-95">
                        <h3 className="text-xl font-black text-gray-900 mb-2 text-center">إضافة كلية</h3>
                        <div className="space-y-3 mb-8">
                            <input
                                autoFocus
                                value={collegeForm.id}
                                onChange={(e) => setCollegeForm((prev) => ({ ...prev, id: e.target.value }))}
                                placeholder="كود الكلية (مثال: ENG)"
                                className="w-full border-2 border-gray-100 p-4 rounded-2xl outline-none focus:border-cyan-400 transition-all text-sm font-bold text-center"
                            />
                            <input
                                value={collegeForm.name}
                                onChange={(e) => setCollegeForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="اسم الكلية"
                                className="w-full border-2 border-gray-100 p-4 rounded-2xl outline-none focus:border-cyan-400 transition-all text-sm font-bold text-center"
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <button onClick={handleAddCollege} className="w-full py-4 rounded-2xl text-white font-black shadow-lg" style={{ backgroundColor: theme.primary }}>
                                تأكيد
                            </button>
                            <button onClick={() => setShowCollegeModal(false)} className="w-full py-4 rounded-2xl bg-gray-50 font-bold text-gray-400">
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Manage Groups */}
            {showGroupsModal && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] shadow-2xl overflow-hidden p-4 sm:p-6 flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black">إدارة المجموعات (السكاشن)</h3>
                            <button onClick={() => setShowGroupsModal(null)} className="p-2 bg-gray-100 rounded-xl">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="text-xs text-slate-500 mb-4">
                            المادة: <span className="font-black text-slate-700">{showGroupsModal.name}</span> • القاعة الأساسية:{" "}
                            <span className="font-bold">{showGroupsModal.lecture?.hall || "-"}</span>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto cm-soft-scroll pr-1 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                            <input
                                value={editingGroupId || buildGroupAutoId(showGroupsModal, groupForm.name || "SEC", (showGroupsModal?.groups?.length || 0) + 1)}
                                readOnly
                                placeholder="كود المجموعة (تلقائي من كود المادة)"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-700"
                            />
                            <input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="اسم المجموعة" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                            <input
                                value={groupForm.targetGroupId}
                                onChange={(e) => setGroupForm({ ...groupForm, targetGroupId: e.target.value })}
                                placeholder="المجموعة المستهدفة (مثال: G1)"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            />
                            <select value={toDayOptionValue(groupForm.day)} onChange={(e) => setGroupForm({ ...groupForm, day: toDayOptionValue(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
                                {DAY_OPTIONS.map((day) => (
                                    <option key={`group-day-${day}`} value={day}>
                                        {day}
                                    </option>
                                ))}
                            </select>
                            <input value={groupForm.time} readOnly className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-700" />
                            <select
                                value={groupForm.start}
                                onChange={(e) => setGroupForm({ ...groupForm, start: e.target.value, time: buildTimeRange(e.target.value, Number(groupForm.duration || 2)) })}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
                                {START_TIME_OPTIONS.map((start) => (
                                    <option key={`group-start-${start}`} value={start}>
                                        {start}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={Number(groupForm.duration || 2)}
                                onChange={(e) => setGroupForm({ ...groupForm, duration: Number(e.target.value || 2), time: buildTimeRange(groupForm.start || START_TIME_OPTIONS[0], Number(e.target.value || 2)) })}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
                                {DURATION_OPTIONS.map((duration) => (
                                    <option key={`group-duration-${duration}`} value={duration}>
                                        مدة السكشن: {duration} ساعة
                                    </option>
                                ))}
                            </select>
                            <input value={groupForm.hall} onChange={(e) => setGroupForm({ ...groupForm, hall: e.target.value })} placeholder="القاعة/المعمل" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                            <input value={groupForm.instructor} onChange={(e) => setGroupForm({ ...groupForm, instructor: e.target.value })} placeholder="المحاضر/المعيد" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                            <select
                                value={String(groupForm.capacity || "")}
                                onChange={(e) => setGroupForm({ ...groupForm, capacity: e.target.value })}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2 bg-white">
                                <option value="">السعة</option>
                                {[...new Set([...CAPACITY_OPTIONS, String(groupForm.capacity || "").trim()].filter(Boolean))].map((cap) => (
                                    <option key={`group-cap-${cap}`} value={cap}>
                                        {cap}
                                    </option>
                                ))}
                            </select>
                            <button onClick={handleSaveGroup} className="sm:col-span-2 bg-cyan-600 text-white font-black rounded-xl py-2">
                                {editingGroupId ? "تحديث المجموعة" : "إضافة مجموعة"}
                            </button>
                        </div>

                        <div className="space-y-3">
                            {(showGroupsModal.groups || []).map((group) => (
                                <div key={group.id} className="border border-slate-100 rounded-xl p-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-black text-slate-800">{group.name}</p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {group.day} • {group.time} • {group.hall} • {group.instructor || "-"} • {group.capacity || "-"} • {group.id}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            المجموعة المستهدفة: {group.targetGroupId || group.name || "-"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleEditGroup(group)} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold">
                                            تعديل
                                        </button>
                                        <button onClick={() => handleDeleteGroup(group.id)} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold">
                                            حذف
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {(showGroupsModal.groups || []).length === 0 && (
                                <div className="py-10 text-center text-slate-400 border border-dashed rounded-xl">
                                    لا توجد مجموعات حتى الآن.
                                </div>
                            )}
                        </div>
                        </div>
                        <button onClick={() => setShowGroupsModal(null)} className="mt-8 w-full py-4 bg-gray-100 rounded-2xl font-black text-gray-500">
                            تم
                        </button>
                    </div>
                </div>
            )}
            {scheduleAlert.open && (
                <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-3xl border border-cyan-100 bg-white shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white">
                            <h4 className="text-lg font-black">{scheduleAlert.title}</h4>
                        </div>
                        <div className="px-6 py-5 space-y-2 text-slate-700 text-sm leading-7">
                            {scheduleAlert.lines.map((line, index) => (
                                <p key={`schedule-alert-line-${index}`} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                                    {line}
                                </p>
                            ))}
                        </div>
                        <div className="px-6 pb-6">
                            <button
                                onClick={() => setScheduleAlert({ open: false, title: "", lines: [] })}
                                className="w-full rounded-2xl py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-black transition-colors">
                                فهمت
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default App;

