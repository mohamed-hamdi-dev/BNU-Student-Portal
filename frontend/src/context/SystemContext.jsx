import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentAcademicYear, normalizeAcademicRecord, normalizeCourse, normalizeAcademicYearValue, normalizeSemesterValue } from "../utils/academicData";
import { fetchAcademicState, saveAcademicState } from "../services/academicApi";

export const SystemContext = createContext(null);

const COURSES_KEY = "system.courses";
const YEARS_KEY = "system.years";
const OPEN_SEMESTERS_KEY = "system.openSemesters";
const ACTIVE_OPEN_SEMESTER_KEY = "system.activeOpenSemester";
const REGISTRATION_SETTINGS_KEY = "system.registrationSettings";
const STUDENT_REGISTRATIONS_KEY = "system.studentRegistrations";
const ACADEMIC_RECORDS_KEY = "system.academicRecords";
const LEGACY_SELECTED_COURSES_KEY = "selectedCourses";
const LEGACY_GRADES_KEY = "admin.gradesData";

const semesterNames = {
    autumn: "الخريف",
    spring: "الربيع",
    summer: "الصيفي",
};

const defaultYears = [
    { id: "1", name: "السنة الأولى" },
    { id: "2", name: "السنة الثانية" },
    { id: "3", name: "السنة الثالثة" },
    { id: "4", name: "السنة الرابعة" },
];

const defaultCourses = [];

const defaultOpenSemesters = {
    autumn: true,
    spring: false,
    summer: false,
};

const defaultRegistrationSettings = {
    activeAcademicYear: "1",
    activeAcademicYearByCollege: {},
    enforcePrerequisites: true,
    enforceMaxHours: true,
    collegePolicies: {},
};

/** Workflow statuses for a student's term registration row (not catalog flags like "available"). */
const STUDENT_REGISTRATION_STATUS_WHITELIST = new Set([
    "draft",
    "pending_advisor",
    "advisor_requested",
    "submitted",
    "advisor_approved",
    "registered",
    "approved",
    "locked",
    "rejected",
    "need_info",
]);

const safeParse = (key, fallback) => {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
};

const recordKey = (record) => `${record.studentId}__${record.code}__${record.semester}__${record.academicYear || ""}`;

const normalizeRegistration = (registration = {}) =>
    normalizeCourse({
        ...registration,
        lecture: registration.lecture || { day: "", time: "", start: "", hall: "" },
        groups: registration.groups ?? registration.sections ?? registration.groupOptions ?? registration.labs ?? [],
    });

const buildRegistrationKey = (registration = {}) => {
    const studentId = normalizeStudentIdKey(registration?.studentId ?? registration?.student_id);
    const courseCode = normalizeCourseCode(registration?.id ?? registration?.code);
    const semester = normalizeSemesterValue(registration?.semester, "");
    if (!studentId || !courseCode || !semester) return "";
    return `${studentId}__${courseCode}__${semester}`;
};

const getLoggedUserSnapshot = () => {
    try {
        return JSON.parse(localStorage.getItem("loggedUser") || "{}");
    } catch {
        return {};
    }
};

const getLoggedUserRole = () => normalizeTextKey(getLoggedUserSnapshot()?.role);

const dedupeRegistrations = (items = []) => {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
        const normalized = normalizeRegistration(item);
        const key = buildRegistrationKey(normalized);
        if (!key) return;
        map.set(key, normalized);
    });
    return [...map.values()];
};

const toGradeValue = (value) => (value === undefined || value === null || value === "" ? "" : value);

const isCourseMatchingActiveYear = (courseYear, activeYear) => {
    const normalizedCourseYear = normalizeAcademicYearValue(courseYear, "");
    const normalizedActiveYear = normalizeAcademicYearValue(activeYear, "");
    const rawCourseYear = String(courseYear ?? "").trim();
    const rawActiveYear = String(activeYear ?? "").trim();

    if (normalizedCourseYear && normalizedActiveYear) {
        return normalizedCourseYear === normalizedActiveYear;
    }

    return Boolean(rawCourseYear) && rawCourseYear === rawActiveYear;
};

const isCourseEligibleForStudyYear = (courseYear, studentYear) => {
    const normalizedCourseYear = normalizeAcademicYearValue(courseYear, "");
    const normalizedStudentYear = normalizeAcademicYearValue(studentYear, "");
    if (!normalizedCourseYear || !normalizedStudentYear) return true;

    const courseYearNumber = Number(normalizedCourseYear);
    const studentYearNumber = Number(normalizedStudentYear);
    if (!Number.isFinite(courseYearNumber) || !Number.isFinite(studentYearNumber)) return true;
    return courseYearNumber <= studentYearNumber;
};

const toNumber = (value, fallback = NaN) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const normalizeLevelThresholds = (rawThresholds) => {
    const map = {};
    if (!rawThresholds || typeof rawThresholds !== "object") return map;

    if (Array.isArray(rawThresholds)) {
        rawThresholds.forEach((item) => {
            const year = normalizeAcademicYearValue(item?.year ?? item?.level, "");
            const minHours = toNumber(item?.minHours ?? item?.hours ?? item?.from, NaN);
            if (!year || !Number.isFinite(minHours)) return;
            map[year] = Math.max(0, minHours);
        });
        return map;
    }

    Object.entries(rawThresholds).forEach(([yearKey, minHoursValue]) => {
        const year = normalizeAcademicYearValue(yearKey, "");
        const minHours = toNumber(minHoursValue, NaN);
        if (!year || !Number.isFinite(minHours)) return;
        map[year] = Math.max(0, minHours);
    });
    return map;
};

const normalizePolicyYearIds = (rawYearIds = [], fallbackYears = []) => {
    const fallback = (Array.isArray(fallbackYears) ? fallbackYears : [])
        .map((item) => String(item?.id || "").trim())
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

const resolveStudyYearByCompletedHours = (student = {}, levelThresholds = {}, fallbackYear = "1", yearsList = [], collegePolicy = null) => {
    const completedHours = toNumber(student?.completedHours ?? student?.completed_hours, NaN);
    const thresholds = normalizeLevelThresholds(levelThresholds);
    if (!Number.isFinite(completedHours) || Object.keys(thresholds).length === 0) return "";

    const sorted = Object.entries(thresholds)
        .map(([year, minHours]) => ({ year: normalizeAcademicYearValue(year, ""), minHours: toNumber(minHours, NaN) }))
        .filter((item) => item.year && Number.isFinite(item.minHours))
        .sort((a, b) => Number(a.year) - Number(b.year));

    if (sorted.length === 0) return "";

    let resolvedYear = sorted[0].year;
    sorted.forEach((item) => {
        if (completedHours >= item.minHours) {
            resolvedYear = item.year;
        }
    });

    const policyYearIds = normalizePolicyYearIds(collegePolicy?.yearIds || [], yearsList);
    const referenceYears = policyYearIds.length > 0
        ? policyYearIds.map((id) => ({ id }))
        : (Array.isArray(yearsList) ? yearsList : []);
    const maxYearFromYears = Math.max(
        0,
        ...(referenceYears
            .map((item) => toNumber(normalizeAcademicYearValue(item?.id, ""), 0))
            .filter((n) => Number.isFinite(n) && n > 0))
    );
    if (maxYearFromYears > 0 && toNumber(resolvedYear, 0) > maxYearFromYears) {
        return String(maxYearFromYears);
    }

    return resolvedYear || normalizeAcademicYearValue(fallbackYear, "1");
};

const resolveStudentStudyYear = (student = {}, fallbackActiveYear = "1", collegePolicy = null, yearsList = []) => {
    const byCompletedHours = resolveStudyYearByCompletedHours(student, collegePolicy?.levelThresholds || {}, fallbackActiveYear, yearsList, collegePolicy);
    if (byCompletedHours) return byCompletedHours;

    const byLevel = normalizeAcademicYearValue(student?.level, "");
    const byYear = normalizeAcademicYearValue(student?.year, "");
    const byAcademicYear = normalizeAcademicYearValue(student?.academicYear, "");

    const compactCandidates = [byLevel, byYear, byAcademicYear].filter(Boolean);
    const validStudyYear = compactCandidates.find((candidate) => {
        const n = Number(candidate);
        return Number.isFinite(n) && n > 0 && n <= 10;
    });

    if (validStudyYear) return validStudyYear;
    return normalizeAcademicYearValue(fallbackActiveYear, "1");
};

const COLLEGE_ALIASES = {
    cs: ["علوم الحاسب", "حاسب", "حاسبات", "computer science"],
    eng: ["الهندسة", "engineering"],
    bus: ["إدارة الأعمال", "business", "business administration"],
    med: ["الطب", "medicine"],
    den: ["طب الأسنان", "dentistry", "dental"],
    phr: ["الصيدلة", "pharmacy"],
};

const normalizeCollegeAliasSet = (rawValue) => {
    const normalized = normalizeTextKey(rawValue);
    const compact = compactTextKey(rawValue);
    const keys = new Set([normalized, compact].filter(Boolean));

    const directCode = compact.toLowerCase();
    if (COLLEGE_ALIASES[directCode]) {
        COLLEGE_ALIASES[directCode].forEach((item) => keys.add(compactTextKey(item)));
    }

    Object.entries(COLLEGE_ALIASES).forEach(([code, labels]) => {
        const labelKeys = labels.map((item) => compactTextKey(item));
        if (labelKeys.includes(compact)) {
            keys.add(code);
            labelKeys.forEach((k) => keys.add(k));
        }
    });

    return keys;
};

const normalizeTextKey = (value) => String(value ?? "").trim().toLowerCase();
const compactTextKey = (value) => normalizeTextKey(value).replace(/\s+/g, "");
const collectCollegeKeys = (...values) => {
    const keys = new Set();
    values.forEach((value) => {
        normalizeCollegeAliasSet(value).forEach((item) => keys.add(item));
    });
    return keys;
};
const getStudentCollegeKeys = (student = {}) =>
    collectCollegeKeys(
        student.collegeId,
        student.college_id,
        student.college,
        student.faculty,
        student.major,
        student.program
    );
const getCourseCollegeKeys = (course = {}) =>
    collectCollegeKeys(
        course.collegeId,
        course.college_id,
        course.college,
        course.faculty,
        course.major,
        course.program
    );
const hasCollegeIntersection = (firstKeys, secondKeys) => {
    if (!firstKeys?.size || !secondKeys?.size) return true;
    for (const key of firstKeys) {
        if (secondKeys.has(key)) return true;
    }
    return false;
};
const normalizeCourseCode = (value) => String(value ?? "").trim().toUpperCase();
const normalizeStudentIdKey = (value) => String(value ?? "").trim();
const normalizeArabicDigits = (value) =>
    String(value || "")
        .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
        .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
const normalizeDayToken = (value) => {
    const raw = normalizeArabicDigits(value)
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u064B-\u0652]/g, "")
        .replace(/[._-]/g, "")
        .replace(/\s+/g, "");
    if (!raw) return "";
    if (["0", "7", "sun", "sunday", "الاحد", "الأحد", "ahad"].includes(raw)) return "sunday";
    if (["1", "mon", "monday", "الاثنين", "الإثنين", "اثنين"].includes(raw)) return "monday";
    if (["2", "tue", "tuesday", "الثلاثاء", "ثلاثاء"].includes(raw)) return "tuesday";
    if (["3", "wed", "wednesday", "الاربعاء", "الأربعاء", "اربعاء"].includes(raw)) return "wednesday";
    if (["4", "thu", "thursday", "الخميس"].includes(raw)) return "thursday";
    if (["5", "fri", "friday", "الجمعة", "جمعه", "جمعة"].includes(raw)) return "friday";
    if (["6", "sat", "saturday", "السبت", "سبت"].includes(raw)) return "saturday";
    return raw;
};
const toMinutes = (value) => {
    const raw = normalizeArabicDigits(String(value || "").toLowerCase()).trim();
    if (!raw) return NaN;
    const match = raw.match(/(\d{1,2})(?::(\d{1,2}))?/);
    if (!match) return NaN;
    let h = Number(match[1]);
    let m = Number(match[2] || 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    const hasPm = /(pm|مساء|\bم\b)/.test(raw);
    const hasAm = /(am|صباح|\bص\b)/.test(raw);
    if (hasPm && h < 12) h += 12;
    if (hasAm && h === 12) h = 0;
    if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
    return h * 60 + m;
};
const parseSessionWindow = (session) => {
    if (!session || typeof session !== "object") return null;
    const day = normalizeDayToken(session.day || session.weekday || session.dayName || session.day_name);
    if (!day) return null;
    const explicitStart = String(session.start || "").trim();
    const range = normalizeArabicDigits(String(session.time || ""))
        .replace(/[–—]/g, "-")
        .replace(/\s*to\s*/gi, "-")
        .trim();
    const rangeParts = range.includes("-") ? range.split("-").map((x) => String(x || "").trim()) : [];
    const startText = explicitStart || rangeParts[0] || "";
    let endText = rangeParts[1] || "";
    let startMin = toMinutes(startText);
    if (!Number.isFinite(startMin)) return null;
    let endMin = toMinutes(endText);
    if (Number.isFinite(endMin) && endMin <= startMin) {
        const partA = toMinutes(rangeParts[0] || "");
        const partB = toMinutes(rangeParts[1] || "");
        if (Number.isFinite(partA) && Number.isFinite(partB) && partA > partB) {
            startMin = partB;
            endMin = partA;
        } else {
            const swap = startMin;
            startMin = endMin;
            endMin = swap;
        }
    }
    if (!Number.isFinite(endMin)) {
        const duration = Number(session.duration || 2);
        endMin = startMin + (Number.isFinite(duration) && duration > 0 ? duration : 2) * 60;
    }
    if (endMin <= startMin) endMin = startMin + 60;
    return { day, startMin, endMin };
};
const hasTimeOverlap = (a, b) => a.day === b.day && a.startMin < b.endMin && b.startMin < a.endMin;
const getSessionKindLabel = (kind) => {
    const key = normalizeTextKey(kind);
    if (key === "group" || key === "lab" || key === "section") return "سكشن";
    return "محاضرة";
};
const formatTimeWindowText = (slot = {}) => {
    const startHour = Math.floor(Number(slot?.startMin || 0) / 60);
    const startMinute = Number(slot?.startMin || 0) % 60;
    const endHour = Math.floor(Number(slot?.endMin || 0) / 60);
    const endMinute = Number(slot?.endMin || 0) % 60;
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(startHour)}:${pad(startMinute)} - ${pad(endHour)}:${pad(endMinute)}`;
};
const formatConflictSlot = (slot = {}) => `${getSessionKindLabel(slot?.kind)} ${slot?.day || ""} ${formatTimeWindowText(slot)}`.trim();
const parsePrerequisiteCodes = (prereqRaw) => {
    if (!prereqRaw) return [];
    if (Array.isArray(prereqRaw)) {
        return [...new Set(prereqRaw.map((item) => normalizeCourseCode(item)).filter(Boolean))];
    }
    const text = String(prereqRaw || "").trim();
    if (!text) return [];
    const codeMatches = text.match(/[A-Za-z]{2,}\s*[-]?\s*\d+[A-Za-z0-9-]*/g);
    if (Array.isArray(codeMatches) && codeMatches.length > 0) {
        return [...new Set(codeMatches.map((item) => normalizeCourseCode(item.replace(/\s+/g, ""))).filter(Boolean))];
    }
    return [
        ...new Set(
            text
                .split(/[,;|/+&]|\\s+من\\s+|\s+and\s+/i)
                .map((item) => normalizeCourseCode(item))
                .filter(Boolean)
        ),
    ];
};
const isPassingGrade = (rawGrade, rawStatus) => {
    const grade = String(rawGrade || "").trim().toUpperCase();
    const status = normalizeTextKey(rawStatus);
    const failTokens = new Set(["f", "ff", "fa", "w", "iw", "withdrawn", "failed", "راسب", "منسحب", "محروم"]);
    const passTokens = new Set(["p", "pass", "passed", "ناجح", "success"]);
    if (passTokens.has(status) || passTokens.has(normalizeTextKey(grade))) return true;
    if (failTokens.has(status) || failTokens.has(normalizeTextKey(grade))) return false;
    const letterPass = new Set(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D"]);
    if (letterPass.has(grade)) return true;
    const numeric = Number(String(rawGrade || "").trim());
    if (Number.isFinite(numeric)) return numeric >= 50;
    return false;
};

const normalizePolicyMap = (policies) => {
    if (!policies || typeof policies !== "object") return {};
    const map = {};
    Object.entries(policies).forEach(([key, value]) => {
        const normalizedKey = normalizeTextKey(key);
        if (!normalizedKey || !value || typeof value !== "object") return;
        const tracks = Array.isArray(value.tracks)
            ? value.tracks
                  .map((track) => ({
                      id: String(track?.id || track || "").trim(),
                      name: String(track?.name || track || "").trim(),
                  }))
                  .filter((track) => track.id || track.name)
            : [];
        map[normalizedKey] = {
            branchingYear: normalizeAcademicYearValue(value.branchingYear, ""),
            tracks,
            levelThresholds: normalizeLevelThresholds(value.levelThresholds || value.creditLevelThresholds || value.yearByHours),
            totalYears: toNumber(value.totalYears, 0),
            yearIds: normalizePolicyYearIds(value.yearIds || [], []),
        };
    });
    return map;
};

const resolveCollegePolicyForStudent = (student, collegePolicies = {}) => {
    const policyMap = normalizePolicyMap(collegePolicies);
    const studentKeys = getStudentCollegeKeys(student || {});
    if (!studentKeys.size) return null;
    for (const key of studentKeys) {
        if (policyMap[key]) return policyMap[key];
    }
    return null;
};

const getStudentTrackKey = (student = {}) =>
    normalizeTextKey(student.trackId ?? student.track_id ?? student.track ?? student.specialization ?? "");

const getCourseTrackKey = (course = {}) =>
    normalizeTextKey(course.trackId ?? course.track_id ?? course.track ?? course.trackName ?? "");

export default function SystemContextProvider({ children }) {
    const applyingRemoteRef = useRef(false);
    const autosaveTimerRef = useRef(null);
    const lastAutosaveHashRef = useRef("");
    const [isServerHydrated, setIsServerHydrated] = useState(false);
    const hasAccessToken = () => Boolean(localStorage.getItem("access_token"));
    const stableHash = useCallback((value) => {
        try {
            const normalize = (v) => {
                if (Array.isArray(v)) return v.map(normalize);
                if (v && typeof v === "object") {
                    return Object.keys(v)
                        .sort()
                        .reduce((acc, key) => {
                            acc[key] = normalize(v[key]);
                            return acc;
                        }, {});
                }
                return v;
            };
            return JSON.stringify(normalize(value));
        } catch {
            return JSON.stringify(value ?? null);
        }
    }, []);

    const [openSemesters, setOpenSemestersState] = useState(() => safeParse(OPEN_SEMESTERS_KEY, defaultOpenSemesters));
    const [registrationSettings, setRegistrationSettingsState] = useState(() => safeParse(REGISTRATION_SETTINGS_KEY, defaultRegistrationSettings));
    const [courses, setCoursesState] = useState(() => {
        const storedCourses = safeParse(COURSES_KEY, defaultCourses);
        return Array.isArray(storedCourses) ? storedCourses.map((course) => normalizeCourse(course)) : defaultCourses.map((course) => normalizeCourse(course));
    });
    const [years, setYearsState] = useState(() => safeParse(YEARS_KEY, defaultYears));
    const [studentRegistrations, setStudentRegistrationsState] = useState(() => {
        if (getLoggedUserRole() !== "admin") return [];
        const stored = safeParse(STUDENT_REGISTRATIONS_KEY, safeParse(LEGACY_SELECTED_COURSES_KEY, []));
        return dedupeRegistrations(stored);
    });
    const [academicRecords, setAcademicRecordsState] = useState(() => {
        const stored = safeParse(ACADEMIC_RECORDS_KEY, safeParse(LEGACY_GRADES_KEY, []));
        return Array.isArray(stored) ? stored.map((item) => normalizeAcademicRecord(item)) : [];
    });

    const openSemester = useMemo(() => {
        const preferred = String(localStorage.getItem(ACTIVE_OPEN_SEMESTER_KEY) || "").trim();
        if (preferred && openSemesters?.[preferred]) return preferred;
        const [firstOpenSemester] = Object.entries(openSemesters).find(([, isOpen]) => Boolean(isOpen)) || ["autumn"];
        return firstOpenSemester;
    }, [openSemesters]);
    const registrationOpen = Object.values(openSemesters).some(Boolean);
    const activeAcademicYear = normalizeAcademicYearValue(registrationSettings.activeAcademicYear, "1");
    
    const getActiveYearForCollege = useCallback((collegeId) => {
        const byCollege = registrationSettings?.activeAcademicYearByCollege || {};
        return normalizeAcademicYearValue(byCollege[collegeId] || registrationSettings?.activeAcademicYear, "1");
    }, [registrationSettings]);

    const persistRegistrations = (nextRegistrations) => {
        localStorage.setItem(STUDENT_REGISTRATIONS_KEY, JSON.stringify(nextRegistrations));
        localStorage.setItem(LEGACY_SELECTED_COURSES_KEY, JSON.stringify(nextRegistrations));
    };

    const persistAcademicRecords = (nextRecords) => {
        localStorage.setItem(ACADEMIC_RECORDS_KEY, JSON.stringify(nextRecords));
        localStorage.setItem(LEGACY_GRADES_KEY, JSON.stringify(nextRecords));
    };

    const setOpenSemester = (semesterId) => {
        setOpenSemestersState((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((key) => {
                next[key] = key === semesterId;
            });
            localStorage.setItem(OPEN_SEMESTERS_KEY, JSON.stringify(next));
            localStorage.setItem(ACTIVE_OPEN_SEMESTER_KEY, String(semesterId || "autumn"));
            return next;
        });
    };

    const setRegistrationOpen = (isOpen) => {
        if (!isOpen) {
            const closed = { autumn: false, spring: false, summer: false };
            setOpenSemestersState(closed);
            localStorage.setItem(OPEN_SEMESTERS_KEY, JSON.stringify(closed));
            localStorage.removeItem(ACTIVE_OPEN_SEMESTER_KEY);
            return;
        }

        setOpenSemestersState((prev) => {
            if (Object.values(prev).some(Boolean)) return prev;
            const next = { ...prev, autumn: true };
            localStorage.setItem(OPEN_SEMESTERS_KEY, JSON.stringify(next));
            localStorage.setItem(ACTIVE_OPEN_SEMESTER_KEY, "autumn");
            return next;
        });
    };

    const setCourses = (nextCourses) => {
        setCoursesState((prev) => {
            const resolvedCourses = typeof nextCourses === "function" ? nextCourses(prev) : nextCourses;
            const normalized = (resolvedCourses || []).map((course) => normalizeCourse(course));
            localStorage.setItem(COURSES_KEY, JSON.stringify(normalized));
            return normalized;
        });
    };

    const setYears = (nextYears) => {
        setYearsState((prev) => {
            const resolvedYears = typeof nextYears === "function" ? nextYears(prev) : nextYears;
            localStorage.setItem(YEARS_KEY, JSON.stringify(resolvedYears));
            return resolvedYears;
        });
    };

    const setOpenSemesters = (nextOpenSemesters) => {
        setOpenSemestersState((prev) => {
            const resolved = typeof nextOpenSemesters === "function" ? nextOpenSemesters(prev) : nextOpenSemesters;
            localStorage.setItem(OPEN_SEMESTERS_KEY, JSON.stringify(resolved));
            const previousActive = String(localStorage.getItem(ACTIVE_OPEN_SEMESTER_KEY) || "").trim();
            const newlyOpened = Object.keys(resolved || {}).find((key) => Boolean(resolved?.[key]) && !Boolean(prev?.[key]));
            const fallbackOpen = Object.keys(resolved || {}).find((key) => Boolean(resolved?.[key])) || "";
            const nextActive =
                newlyOpened ||
                (previousActive && resolved?.[previousActive] ? previousActive : fallbackOpen);
            if (nextActive) {
                localStorage.setItem(ACTIVE_OPEN_SEMESTER_KEY, nextActive);
            } else {
                localStorage.removeItem(ACTIVE_OPEN_SEMESTER_KEY);
            }
            return resolved;
        });
    };

    const setRegistrationSettings = (nextSettings) => {
        setRegistrationSettingsState((prev) => {
            const resolvedPatch = typeof nextSettings === "function" ? nextSettings(prev) : nextSettings;
            const merged = { ...prev, ...resolvedPatch };
            localStorage.setItem(REGISTRATION_SETTINGS_KEY, JSON.stringify(merged));
            return merged;
        });
    };

    const setStudentRegistrations = (nextRegistrations) => {
        setStudentRegistrationsState((prev) => {
            const resolved = typeof nextRegistrations === "function" ? nextRegistrations(prev) : nextRegistrations;
            const normalized = dedupeRegistrations(resolved);
            persistRegistrations(normalized);
            return normalized;
        });
    };

    const setAcademicRecords = (nextRecords) => {
        setAcademicRecordsState((prev) => {
            const resolved = typeof nextRecords === "function" ? nextRecords(prev) : nextRecords;
            const normalized = (resolved || []).map((item) => normalizeAcademicRecord(item));
            persistAcademicRecords(normalized);
            return normalized;
        });
    };
    const saveRegistrationSettingsNow = useCallback(
        async (nextSettings) => {
            let mergedSettings = null;
            setRegistrationSettingsState((prev) => {
                const resolvedPatch = typeof nextSettings === "function" ? nextSettings(prev) : nextSettings;
                mergedSettings = { ...prev, ...(resolvedPatch || {}) };
                localStorage.setItem(REGISTRATION_SETTINGS_KEY, JSON.stringify(mergedSettings));
                return mergedSettings;
            });

            if (!hasAccessToken()) {
                return { ok: true, localOnly: true, message: "تم الحفظ محليًا (بدون تسجيل دخول)." };
            }

            try {
                const isAdminUser = getLoggedUserRole() === "admin";
                const payload = {
                    courses,
                    years,
                    openSemesters,
                    registrationSettings: mergedSettings || registrationSettings,
                    studentRegistrations: isAdminUser ? studentRegistrations : [],
                    academicRecords,
                };
                await saveAcademicState(payload);
                return { ok: true };
            } catch {
                return { ok: false, message: "فشل الحفظ على الخادم. تحقّق من الاتصال ثم أعد المحاولة." };
            }
        },
        [courses, years, openSemesters, registrationSettings, studentRegistrations, academicRecords]
    );
    const getPassedCourseCodesForStudent = (studentId) => {
        const sid = normalizeStudentIdKey(studentId);
        const passed = new Set();
        academicRecords.forEach((record) => {
            const recStudentId = normalizeStudentIdKey(record?.studentId ?? record?.student_id);
            if (!sid || !recStudentId || sid !== recStudentId) return;
            if (!isPassingGrade(record?.grade, record?.status)) return;
            const code = normalizeCourseCode(record?.code ?? record?.courseCode ?? record?.id);
            if (code) passed.add(code);
        });
        return passed;
    };

    const getRegistrationSessions = (registration) => {
        const slots = [];
        const lectureWindow = parseSessionWindow(registration?.lecture || {});
        if (lectureWindow) slots.push({ ...lectureWindow, courseCode: normalizeCourseCode(registration?.id || registration?.code), kind: "lecture" });
        const groupWindow = parseSessionWindow(registration?.selectedGroup || {});
        if (groupWindow) slots.push({ ...groupWindow, courseCode: normalizeCourseCode(registration?.id || registration?.code), kind: "group" });
        return slots;
    };
    const canStudentRegisterCourse = ({ student, course, semester, existingRegistrations = [], skipAcademicRules = false }) => {
        const studentCollegeKeys = getStudentCollegeKeys(student || {});
        const courseCollegeKeys = getCourseCollegeKeys(course || {});
        if (studentCollegeKeys.size && courseCollegeKeys.size && !hasCollegeIntersection(studentCollegeKeys, courseCollegeKeys)) {
            return { ok: false, error: "لا يمكن تسجيل مقرر من كلية مختلفة عن كلية الطالب." };
        }
        if (skipAcademicRules) return { ok: true };

        const studentId = normalizeStudentIdKey(student?.studentId || student?.username || student?.id);
        const courseCode = normalizeCourseCode(course?.id || course?.code);
        const semesterId = String(semester || course?.semester || openSemester || "").trim();
        if (!studentId || !courseCode || !semesterId) return { ok: true };

        const passedCodes = getPassedCourseCodesForStudent(studentId);
        if (passedCodes.has(courseCode)) {
            return { ok: false, error: `المقرر ${courseCode} مجتاز بالفعل.` };
        }

        const studentYear = normalizeAcademicYearValue(
            student?.current_study_year || student?.currentStudyYear || student?.academicYear || student?.year || student?.level,
            ""
        );
        const courseYear = normalizeAcademicYearValue(course?.year || course?.study_year, "");
        if (!isCourseEligibleForStudyYear(courseYear, studentYear)) {
            return { ok: false, error: `ظ„ط§ ظٹظ…ظƒظ† طھط³ط¬ظٹظ„ ${courseCode} ظ„أظ†ظ‡ ظ…ظ† ط³ظ†ط© ط¯ط±ط§ط³ظٹط© ظ…ط³طھظ‚ط¨ظ„ظٹط©.` };
        }

        const sameTermDuplicate = (Array.isArray(existingRegistrations) ? existingRegistrations : []).some(
            (item) =>
                normalizeStudentIdKey(item?.studentId || item?.student_id) === studentId &&
                String(item?.semester || "").trim() === semesterId &&
                normalizeCourseCode(item?.id || item?.code) === courseCode
        );
        if (sameTermDuplicate) {
            return { ok: false, error: `ط§ظ„ظ…ظ‚ط±ط± ${courseCode} ظ…ط³ط¬ظ„ ط¨ط§ظ„ظپط¹ظ„ ظپظٹ ظ†ظپط³ ط§ظ„ظپطµظ„.` };
        }

        if (registrationSettings?.enforcePrerequisites) {
            const prereqCodes = parsePrerequisiteCodes(course?.prereq);
            if (prereqCodes.length > 0) {
                const missing = prereqCodes.filter((code) => !passedCodes.has(normalizeCourseCode(code)));
                if (missing.length > 0) {
                    return { ok: false, error: `لا يمكن التسجيل قبل اجتياز المتطلب: ${missing.join(", ")}` };
                }
            }
        }

        const currentSemesterRegs = (Array.isArray(existingRegistrations) ? existingRegistrations : []).filter(
            (item) =>
                normalizeStudentIdKey(item?.studentId || item?.student_id) === studentId &&
                String(item?.semester || "").trim() === semesterId &&
                normalizeCourseCode(item?.id || item?.code) !== courseCode
        );

        if (registrationSettings?.enforceMaxHours) {
            const maxHours = Number(student?.maxHours || 0);
            if (Number.isFinite(maxHours) && maxHours > 0) {
                const currentHours = currentSemesterRegs.reduce((sum, item) => sum + Number(item?.hours || item?.credits || 0), 0);
                const nextHours = currentHours + Number(course?.hours || course?.credits || 0);
                if (nextHours > maxHours) {
                    return { ok: false, error: "تجاوزت الحد الأقصى للساعات المسموح بها." };
                }
            }
        }

        const incomingRegistration = normalizeCourse({
            ...course,
            semester: semesterId,
            selectedGroup: course?.selectedGroup || null,
        });
        const newSlots = getRegistrationSessions(incomingRegistration);
        if (newSlots.length > 0) {
            for (const existing of currentSemesterRegs) {
                const existingSlots = getRegistrationSessions(existing);
                for (const a of newSlots) {
                    for (const b of existingSlots) {
                        if (hasTimeOverlap(a, b)) {
                            return {
                                ok: false,
                                error: `يوجد تعارض في الجدول مع المقرر ${existing?.id || existing?.code || "آخر"}: ${formatConflictSlot(a)} يتداخل مع ${formatConflictSlot(b)}.`,
                            };
                        }
                    }
                }
            }
        }

        return { ok: true };
    };
    const getAvailableCoursesForStudent = (student) => {
        const allowedSemesters = Object.entries(openSemesters)
            .filter(([, isOpen]) => Boolean(isOpen))
            .map(([semester]) => normalizeSemesterValue(semester, ""));
        const studentCollegeKeys = getStudentCollegeKeys(student || {});
        const collegePolicy = resolveCollegePolicyForStudent(student || {}, registrationSettings?.collegePolicies || {});
        const primaryCollegeKey = [...studentCollegeKeys][0] || "";
        const activeYearForCollege = getActiveYearForCollege(primaryCollegeKey);
        const studentYear = resolveStudentStudyYear(student || {}, activeYearForCollege || "1", collegePolicy, years);
        const branchingYear = normalizeAcademicYearValue(collegePolicy?.branchingYear, "");
        const studentTrackKey = getStudentTrackKey(student || {});
        const isBranchingActive = Boolean(branchingYear && Number(studentYear || 0) >= Number(branchingYear || 0));
        const semesterScopedCourses = courses.filter((course) => {
            const normalizedSemester = normalizeSemesterValue(course.semester, "");
            return allowedSemesters.includes(normalizedSemester);
        });

        const strictMatches = semesterScopedCourses.filter((course) => {
            const hasCourseYear = Boolean(String(course.year || "").trim());
            const isMatchingYear = !hasCourseYear || !studentYear || isCourseEligibleForStudyYear(course.year, studentYear);
            const courseCollegeKeys = getCourseCollegeKeys(course);
            const isMatchingCollege = hasCollegeIntersection(studentCollegeKeys, courseCollegeKeys);
            const courseTrackKey = getCourseTrackKey(course);
            const isGeneralCourse = !courseTrackKey;
            const isTrackMatched = !isBranchingActive || isGeneralCourse || (studentTrackKey && courseTrackKey === studentTrackKey);
            if (!(isMatchingYear && isMatchingCollege && isTrackMatched)) return false;
            const guard = canStudentRegisterCourse({
                student,
                course,
                semester: course.semester,
                // Keep the catalog visible for eligible/open offerings.
                // Final duplicate blocking still happens during add/save and in backend.
                existingRegistrations: [],
            });
            return guard.ok;
        });

        if (strictMatches.length > 0) return strictMatches;

        const collegeOnlyFallback = semesterScopedCourses.filter((course) => {
            const courseCollegeKeys = getCourseCollegeKeys(course);
            const isMatchingCollege = hasCollegeIntersection(studentCollegeKeys, courseCollegeKeys);
            const hasCourseYear = Boolean(String(course?.year || "").trim());
            const courseTrackKey = getCourseTrackKey(course);
            const isGeneralCourse = !courseTrackKey;
            const isTrackMatched = !isBranchingActive || isGeneralCourse || (studentTrackKey && courseTrackKey === studentTrackKey);
            // Fallback should never leak courses assigned to another academic year.
            // It is only meant for generic courses with no explicit year.
            return !hasCourseYear && isMatchingCollege && isTrackMatched;
        });
        if (collegeOnlyFallback.length > 0) return collegeOnlyFallback;

        return [];
    };

    const getStudentRegistrations = (studentId, semester = null) =>
        studentRegistrations.filter((item) => {
            const matchesStudent = normalizeStudentIdKey(item.studentId || item.student_id) === normalizeStudentIdKey(studentId);
            const matchesSemester = semester ? normalizeSemesterValue(item.semester, "") === normalizeSemesterValue(semester, "") : true;
            return matchesStudent && matchesSemester;
        });

    const upsertStudentRegistration = ({ studentId, studentName, course, semester, selectedGroup, student = null }) => {
        const courseId = String(course?.id || course?.code || "").trim();
        const semesterId = String(semester || course?.semester || openSemester || "").trim();
        let fallbackStudent = {};
        try {
            fallbackStudent = JSON.parse(localStorage.getItem("loggedUser") || "{}");
        } catch {
            fallbackStudent = {};
        }
        const effectiveStudentId = String(studentId || fallbackStudent.id || fallbackStudent.studentId || fallbackStudent.username || "").trim();

        if (!effectiveStudentId || !courseId || !semesterId) return { ok: false, error: `بيانات غير مكتملة. (Student: ${effectiveStudentId ? "Yes" : "No"}, Course: ${courseId ? "Yes" : "No"}, Semester: ${semesterId ? "Yes" : "No"})` };

        const studentPayload = student && typeof student === "object" ? student : fallbackStudent;
        const guard = canStudentRegisterCourse({
            student: studentPayload,
            course: { ...course, selectedGroup: selectedGroup || course.selectedGroup || null },
            semester: semesterId,
            existingRegistrations: studentRegistrations,
        });
        if (!guard.ok) return guard;

        const statusNorm = String(course?.status || "")
            .trim()
            .toLowerCase();
        const registrationStatus = STUDENT_REGISTRATION_STATUS_WHITELIST.has(statusNorm) ? statusNorm : "pending_advisor";

        const normalizedCourse = normalizeCourse({
            ...course,
            id: courseId,
            code: String(course?.code || courseId),
            semester: semesterId,
            selectedGroup: selectedGroup || course.selectedGroup || null,
            studentId: String(studentId),
            studentName: studentName || "",
            status: registrationStatus,
        });

        setStudentRegistrations((prev) => {
            const key = `${normalizeStudentIdKey(studentId)}__${normalizeCourseCode(normalizedCourse.id || normalizedCourse.code)}__${normalizeSemesterValue(semesterId, "")}`;
            const index = prev.findIndex((item) => buildRegistrationKey(item) === key);
            if (index >= 0) {
                const next = [...prev];
                next[index] = {
                    ...next[index],
                    ...normalizedCourse,
                    studentId: String(studentId),
                    studentName: studentName || next[index].studentName || "",
                };
                return next;
            }
            return [...prev, normalizedCourse];
        });
        return { ok: true };
    };

    const removeStudentRegistration = ({ studentId, code, semester }) => {
        const targetKey = `${normalizeStudentIdKey(studentId)}__${normalizeCourseCode(code)}__${normalizeSemesterValue(semester, "")}`;
        setStudentRegistrations((prev) =>
            prev.filter((item) => buildRegistrationKey(item) !== targetKey)
        );
    };

    const upsertPreliminaryAcademicRecord = ({
        studentId,
        studentName,
        course,
        semester,
        academicYear = getCurrentAcademicYear(),
        year = "",
        lecture = null,
        selectedGroup = null,
        student = null,
    }) => {
        const courseId = String(course?.id || course?.code || "").trim();
        const semesterId = String(semester || course?.semester || openSemester || "").trim();
        let fallbackStudent = {};
        try {
            fallbackStudent = JSON.parse(localStorage.getItem("loggedUser") || "{}");
        } catch {
            fallbackStudent = {};
        }
        const effectiveStudentId = String(studentId || fallbackStudent.id || fallbackStudent.studentId || fallbackStudent.username || "").trim();

        if (!effectiveStudentId || !courseId || !semesterId) return { ok: false, error: `بيانات غير مكتملة. (Student: ${effectiveStudentId ? "Yes" : "No"}, Course: ${courseId ? "Yes" : "No"}, Semester: ${semesterId ? "Yes" : "No"})` };

        const studentPayload = student && typeof student === "object" ? student : fallbackStudent;
        const guard = canStudentRegisterCourse({
            student: studentPayload,
            course,
            semester: semesterId,
            existingRegistrations: studentRegistrations,
            skipAcademicRules: true,
        });
        if (!guard.ok) return guard;

        const baseRecord = normalizeAcademicRecord({
            studentId: String(studentId),
            studentName: studentName || "",
            code: courseId,
            name: course.name || "",
            credits: Number(course.hours || course.credits || 0),
            semester: semesterId,
            semesterName: semesterNames[semesterId] || semesterId,
            academicYear,
            year: String(year || course.year || ""),
            lecture: lecture || course.lecture || {},
            selectedGroup: selectedGroup || course.selectedGroup || null,
            mid1: "",
            mid2: "",
            yearWork: "",
            final: "",
            total: "",
            grade: "",
            status: "pending_advisor",
        });

        setAcademicRecords((prev) => {
            const key = recordKey(baseRecord);
            const index = prev.findIndex((item) => recordKey(item) === key);
            if (index >= 0) {
                const existing = prev[index];
                const merged = normalizeAcademicRecord({
                    ...existing,
                    ...baseRecord,
                    mid1: toGradeValue(existing.mid1),
                    mid2: toGradeValue(existing.mid2),
                    yearWork: toGradeValue(existing.yearWork),
                    final: toGradeValue(existing.final),
                    total: toGradeValue(existing.total),
                    grade: existing.grade || "",
                    status: existing.status === "graded" ? "graded" : "pending_advisor",
                });
                const next = [...prev];
                next[index] = merged;
                return next;
            }
            return [...prev, baseRecord];
        });
        return { ok: true };
    };

    const removePreliminaryAcademicRecord = ({ studentId, code, semester }) => {
        setAcademicRecords((prev) =>
            prev.filter((item) => {
                if (`${item.studentId}__${item.code}__${item.semester}` !== `${studentId}__${code}__${semester}`) return true;
                return item.status === "graded";
            })
        );
    };

    const mergeGradeRecords = (incomingRecords = []) => {
        if (!Array.isArray(incomingRecords) || incomingRecords.length === 0) return;

        setAcademicRecords((prev) => {
            const map = new Map(prev.map((item) => [recordKey(item), normalizeAcademicRecord(item)]));

            incomingRecords.forEach((item) => {
                const normalizedIncoming = normalizeAcademicRecord(item);
                if (!normalizedIncoming.studentId || !normalizedIncoming.code || !normalizedIncoming.semester) return;
                const key = recordKey(normalizedIncoming);
                const existing = map.get(key);

                if (existing) {
                    map.set(
                        key,
                        normalizeAcademicRecord({
                            ...existing,
                            componentScores:
                                normalizedIncoming.componentScores && typeof normalizedIncoming.componentScores === "object"
                                    ? normalizedIncoming.componentScores
                                    : existing.componentScores && typeof existing.componentScores === "object"
                                    ? existing.componentScores
                                    : {},
                            mid1: toGradeValue(normalizedIncoming.mid1),
                            mid2: toGradeValue(normalizedIncoming.mid2),
                            yearWork: toGradeValue(normalizedIncoming.yearWork ?? normalizedIncoming.ywork),
                            final: toGradeValue(normalizedIncoming.final),
                            total: toGradeValue(normalizedIncoming.total),
                            grade: normalizedIncoming.grade || existing.grade || "",
                            status: "graded",
                        })
                    );
                    return;
                }

                const generated = normalizeAcademicRecord({
                    ...normalizedIncoming,
                    semesterName: normalizedIncoming.semesterName || semesterNames[normalizedIncoming.semester] || normalizedIncoming.semester,
                    academicYear: normalizedIncoming.academicYear || getCurrentAcademicYear(),
                    status: "graded",
                });
                map.set(key, generated);
            });

            return [...map.values()];
        });
    };

    const updateAcademicRecord = (updatedRecord) => {
        if (!updatedRecord) return;
        const previousKey = String(updatedRecord.previousRecordKey || updatedRecord._previousRecordKey || "").trim();
        const sanitized = { ...updatedRecord };
        delete sanitized.previousRecordKey;
        delete sanitized._previousRecordKey;
        const normalized = normalizeAcademicRecord(sanitized);
        const key = recordKey(normalized);
        setAcademicRecords((prev) => {
            const previousIndex = previousKey ? prev.findIndex((item) => recordKey(item) === previousKey) : -1;
            const currentIndex = prev.findIndex((item) => recordKey(item) === key);

            // Prefer the exact row that the admin edited, even if another row already has the new key.
            let index = previousIndex >= 0 ? previousIndex : currentIndex;
            if (index < 0) return [...prev, normalized];

            const next = [...prev];
            next[index] = normalized;

            // If key changed and another row already exists with the same new key, keep only one row.
            if (previousIndex >= 0 && currentIndex >= 0 && currentIndex !== previousIndex) {
                next.splice(currentIndex, 1);
            }
            return next;
        });
    };

    const value = useMemo(
        () => ({
            registrationOpen,
            setRegistrationOpen,
            openSemester,
            setOpenSemester,
            courses,
            setCourses,
            years,
            setYears,
            openSemesters,
            setOpenSemesters,
            registrationSettings,
            setRegistrationSettings,
            saveRegistrationSettingsNow,
            activeAcademicYear,
            resolveEffectiveStudyYear: (student = {}) => {
                const collegePolicy = resolveCollegePolicyForStudent(student || {}, registrationSettings?.collegePolicies || {});
                return resolveStudentStudyYear(student || {}, activeAcademicYear || "1", collegePolicy, years);
            },
            availableCourses: (() => {
                const openSemesterCourses = courses.filter((course) => {
                    const normalizedSemester = normalizeSemesterValue(course.semester, "");
                    return Boolean(openSemesters[normalizedSemester]);
                });
                return openSemesterCourses;
            })(),
            getAvailableCoursesForStudent,
            studentRegistrations,
            setStudentRegistrations,
            getStudentRegistrations,
            upsertStudentRegistration,
            removeStudentRegistration,
            academicRecords,
            setAcademicRecords,
            upsertPreliminaryAcademicRecord,
            removePreliminaryAcademicRecord,
            mergeGradeRecords,
            updateAcademicRecord,
            semesterNames,
        }),
        [registrationOpen, openSemester, courses, years, openSemesters, registrationSettings, saveRegistrationSettingsNow, activeAcademicYear, studentRegistrations, academicRecords]
    );

    useEffect(() => {
        const hydrateFromServer = async () => {
            if (!hasAccessToken()) {
                // Not logged in: keep local state only and avoid unauthorized API spam.
                setIsServerHydrated(true);
                return;
            }
            try {
                applyingRemoteRef.current = true;
                const state = await fetchAcademicState();
                if (!state) return;

                const hasCoursesFromServer = Array.isArray(state.courses);
                const nextCourses = hasCoursesFromServer ? state.courses.map((course) => normalizeCourse(course)) : [];
                const nextYears = Array.isArray(state.years) ? state.years : defaultYears;
                const nextOpenSemesters = state.openSemesters && typeof state.openSemesters === "object" ? state.openSemesters : defaultOpenSemesters;
                const nextRegistrationSettings =
                    state.registrationSettings && typeof state.registrationSettings === "object" ? state.registrationSettings : defaultRegistrationSettings;
                const isAdminUser = getLoggedUserRole() === "admin";
                const nextRegistrations = isAdminUser ? dedupeRegistrations(state.studentRegistrations) : [];
                const nextRecords = Array.isArray(state.academicRecords) ? state.academicRecords.map((item) => normalizeAcademicRecord(item)) : [];
                const serverActiveSemester = String(state?.openSemester || state?.activeOpenSemester || "").trim();
                const localActiveSemester = String(localStorage.getItem(ACTIVE_OPEN_SEMESTER_KEY) || "").trim();
                const preferredActiveSemester =
                    (serverActiveSemester && nextOpenSemesters?.[serverActiveSemester] && serverActiveSemester) ||
                    (localActiveSemester && nextOpenSemesters?.[localActiveSemester] && localActiveSemester) ||
                    (Object.entries(nextOpenSemesters).find(([, isOpen]) => Boolean(isOpen))?.[0] || "");

                setCoursesState((prev) => (hasCoursesFromServer ? nextCourses : prev));
                setYearsState(nextYears);
                setOpenSemestersState(nextOpenSemesters);
                setRegistrationSettingsState((prev) => ({ ...prev, ...nextRegistrationSettings }));
                setStudentRegistrationsState(nextRegistrations);
                setAcademicRecordsState(nextRecords);
                lastAutosaveHashRef.current = stableHash({
                    courses: nextCourses,
                    years: nextYears,
                    openSemesters: nextOpenSemesters,
                    registrationSettings: { ...defaultRegistrationSettings, ...nextRegistrationSettings },
                    studentRegistrations: nextRegistrations,
                    academicRecords: nextRecords,
                });

                if (hasCoursesFromServer) {
                    localStorage.setItem(COURSES_KEY, JSON.stringify(nextCourses));
                }
                localStorage.setItem(YEARS_KEY, JSON.stringify(nextYears));
                localStorage.setItem(OPEN_SEMESTERS_KEY, JSON.stringify(nextOpenSemesters));
                if (preferredActiveSemester) {
                    localStorage.setItem(ACTIVE_OPEN_SEMESTER_KEY, preferredActiveSemester);
                } else {
                    localStorage.removeItem(ACTIVE_OPEN_SEMESTER_KEY);
                }
                localStorage.setItem(REGISTRATION_SETTINGS_KEY, JSON.stringify({ ...defaultRegistrationSettings, ...nextRegistrationSettings }));
                persistRegistrations(nextRegistrations);
                persistAcademicRecords(nextRecords);
            } catch {
                // Keep local state as fallback if backend state is unavailable.
            } finally {
                applyingRemoteRef.current = false;
                setIsServerHydrated(true);
            }
        };

        hydrateFromServer();
    }, [stableHash]);

    useEffect(() => {
        if (!isServerHydrated || applyingRemoteRef.current) return;
        if (!hasAccessToken()) return;

        const isAdminUser = getLoggedUserRole() === "admin";
        const payload = {
            courses,
            years,
            openSemesters,
            registrationSettings,
            studentRegistrations: isAdminUser ? studentRegistrations : [],
            academicRecords,
        };
        const payloadHash = stableHash(payload);
        if (payloadHash === lastAutosaveHashRef.current) return;

        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = setTimeout(() => {
            saveAcademicState(payload)
                .then(() => {
                    lastAutosaveHashRef.current = payloadHash;
                })
                .catch(() => {
                    // Local storage is still the fallback source.
                });
        }, 800);

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
        };
    }, [courses, years, openSemesters, registrationSettings, studentRegistrations, academicRecords, isServerHydrated, stableHash]);

    return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}





