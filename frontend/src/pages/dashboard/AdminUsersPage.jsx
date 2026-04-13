import React, { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Download, FileUp, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import * as XLSX from "xlsx";
import { useTranslation } from "react-i18next";
import { exportUsersToPdf } from "../../utils/pdfExportUsers";
import { apiFetch } from "../../services/api";
import { fetchAcademicState, fetchCollegesState } from "../../services/academicApi";

const Toast = Swal.mixin({
    toast: true,
    position: "top",
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    background: "#4A4F53",
    color: "#fff",
    didOpen: (toast) => {
        toast.style.direction = "rtl";
        toast.style.textAlign = "right";
    },
});

const initialForm = {
    username: "",
    password: "",
    role: "student",
    studentId: "",
    name: "",
    college: "",
    major: "",
    nationalId: "",
    nationality: "",
    gender: "",
    birthPlace: "",
    email: "",
    recoveryEmail: "",
    level: "",
    admissionYear: "",
};

const REGISTRATION_SETTINGS_KEY = "system.registrationSettings";
const YEARS_KEY = "system.years";
const normalizeKey = (value) => String(value || "").trim().toLowerCase();
const normalizeCollegeAliasText = (value) =>
    normalizeKey(value)
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي");
const COLLEGE_LABELS_AR = {
    cs: "علوم الحاسب",
    eng: "الهندسة",
    bus: "إدارة الأعمال",
    med: "الطب",
    den: "طب الأسنان",
    phr: "الصيدلة",
};
const COLLEGE_ALIAS_TO_KEY = {
    cs: "cs",
    "علوم الحاسب": "cs",
    "حاسبات": "cs",
    "حاسبات ومعلومات": "cs",
    "computer science": "cs",
    "computerscience": "cs",
    eng: "eng",
    "الهندسة": "eng",
    engineering: "eng",
    bus: "bus",
    "إدارة الأعمال": "bus",
    "ادارة الاعمال": "bus",
    business: "bus",
    "business administration": "bus",
    med: "med",
    "الطب": "med",
    medicine: "med",
    den: "den",
    "طب الأسنان": "den",
    "طب الاسنان": "den",
    dentistry: "den",
    dental: "den",
    phr: "phr",
    "الصيدلة": "phr",
    pharmacy: "phr",
};
const COLLEGE_ALIAS_TO_KEY_NORMALIZED = Object.fromEntries(
    Object.entries(COLLEGE_ALIAS_TO_KEY).map(([alias, key]) => [normalizeCollegeAliasText(alias), key])
);
const getCollegeCanonicalKey = (value) => {
    const normalized = normalizeCollegeAliasText(value);
    return COLLEGE_ALIAS_TO_KEY_NORMALIZED[normalized] || normalized;
};
const getCollegeDisplayLabel = (value) => {
    const key = getCollegeCanonicalKey(value);
    return COLLEGE_LABELS_AR[key] || String(value || "").trim();
};
const toYearNumber = (value) => {
    const raw = String(value || "").trim();
    const mappedDigits = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    const digits = mappedDigits.match(/\d+/)?.[0];
    if (digits) return Number(digits);
    const lowered = normalizeKey(raw)
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي");
    const map = {
        "الفرقه الاولي": 1,
        "فرقه اولي": 1,
        "فرقة اولى": 1,
        "اولى": 1,
        "اولي": 1,
        "الفرقة الأولى": 1,
        "الفرقة الاولى": 1,
        "الفرقه الثانيه": 2,
        "فرقه ثانيه": 2,
        "الثانيه": 2,
        "ثانيه": 2,
        "الفرقة الثانية": 2,
        "الفرقه الثالثه": 3,
        "فرقه ثالثه": 3,
        "فرقه تالته": 3,
        "تالته": 3,
        "الثالثه": 3,
        "ثالثه": 3,
        "الفرقة الثالثة": 3,
        "الفرقه الرابعه": 4,
        "فرقه رابعه": 4,
        "رابعه": 4,
        "الرابعه": 4,
        "الرابعة": 4,
        "رابعة": 4,
        "تالثه": 3,
        "الفرقة الرابعة": 4,
        "الفرقه الخامسه": 5,
        "فرقه خامسه": 5,
        "خامسه": 5,
        "الخامسه": 5,
        "الخامسة": 5,
        "خامسة": 5,
        "الفرقة الخامسة": 5,
        "الفرقه السادسه": 6,
        "فرقه سادسه": 6,
        "سادسه": 6,
        "السادسه": 6,
        "السادسة": 6,
        "سادسة": 6,
        "الفرقة السادسة": 6,
        "الدفعه الاولى": 1,
        "الدفعة الاولى": 1,
        "الدفعه الثانيه": 2,
        "الدفعة الثانية": 2,
        "الدفعه الثالثه": 3,
        "الدفعة الثالثة": 3,
        "الدفعه الرابعه": 4,
        "الدفعة الرابعة": 4,
    };
    for (const [k, v] of Object.entries(map)) {
        if (lowered.includes(normalizeKey(k))) return v;
    }
    return 0;
};

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

const formatArabicYearLabel = (idOrName) => {
    const raw = String(idOrName || "").trim();
    if (!raw) return "";
    const digits = String(toYearNumber(raw) || "").trim();
    if (digits && ARABIC_YEAR_LABELS[digits]) return ARABIC_YEAR_LABELS[digits];
    return raw
        .replace(/الفرقة|الفرقه|فرقة|فرقه|الدفعة|الدفعه|دفعة|دفعه/g, "السنة")
        .replace(/\s+/g, " ")
        .trim();
};

const normalizeCollegeList = (items = []) => {
    const byKey = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
        const rawId = String(item?.id || "").trim();
        const normalizedId = rawId.toUpperCase();
        const rawName = String(item?.name || "").trim();
        const fallbackName = getCollegeDisplayLabel(rawId);
        const name = rawName || fallbackName || normalizedId;
        const canonicalKey = getCollegeCanonicalKey(rawId || name);
        if (!canonicalKey) return;
        if (!byKey.has(canonicalKey)) {
            byKey.set(canonicalKey, {
                id: normalizedId || canonicalKey.toUpperCase(),
                name,
            });
        }
    });
    return [...byKey.values()];
};

const parseCollegeTracksMap = (sourceSettings = null) => {
    const map = {};
    try {
        const settings = sourceSettings || JSON.parse(localStorage.getItem(REGISTRATION_SETTINGS_KEY) || "{}");
        const policies = settings?.collegePolicies && typeof settings.collegePolicies === "object" ? settings.collegePolicies : {};
        Object.entries(policies).forEach(([key, value]) => {
            const tracks = Array.isArray(value?.tracks)
                ? value.tracks.map((track) => String(track?.name || track?.id || track || "").trim()).filter(Boolean)
                : [];
            map[normalizeKey(key)] = [...new Set(tracks)];
        });
    } catch {
        // ignore
    }
    return map;
};

const parseCollegePoliciesMap = (settings = null) => {
    const map = {};
    try {
        const source = settings || JSON.parse(localStorage.getItem(REGISTRATION_SETTINGS_KEY) || "{}");
        const policies = source?.collegePolicies && typeof source.collegePolicies === "object" ? source.collegePolicies : {};
        Object.entries(policies).forEach(([key, value]) => {
            map[normalizeKey(key)] = value && typeof value === "object" ? value : {};
        });
    } catch {
        // ignore
    }
    return map;
};

const parseYears = () => {
    try {
        const stored = JSON.parse(localStorage.getItem(YEARS_KEY) || "null");
        if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch {
        // ignore
    }
    return [
        { id: "1", name: "السنة الأولى" },
        { id: "2", name: "السنة الثانية" },
        { id: "3", name: "السنة الثالثة" },
        { id: "4", name: "السنة الرابعة" },
    ];
};

const getRoleBadgeClass = (role) => {
    const normalizedRole = String(role || "").toLowerCase();
    if (normalizedRole === "super_admin") return "bg-rose-50 text-rose-700";
    if (normalizedRole === "admin") return "bg-amber-50 text-amber-700";
    if (normalizedRole === "doctor") return "bg-violet-50 text-violet-700";
    if (normalizedRole === "advisor") return "bg-indigo-50 text-indigo-700";
    return "bg-cyan-50 text-cyan-700";
};

const getCurrentAcademicStartYear = (date = new Date()) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    // Academic year starts in September and ends in June.
    return month >= 9 ? year : year - 1;
};

const getAdmissionYearOptions = (count = 8) => {
    const currentYear = getCurrentAcademicStartYear(new Date());
    return Array.from({ length: count }, (_, idx) => {
        const startYear = currentYear - idx;
        const endYear = startYear + 1;
        const value = `${startYear}-${endYear}`;
        return { id: value, name: value };
    });
};

const pick = (user, keys) => {
    for (const key of keys) {
        const value = user?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "-";
};
const normalizeLevelId = (value) => {
    const n = toYearNumber(value);
    return n > 0 ? String(n) : "";
};

const normalizeCsvHeader = (value) =>
    normalizeKey(value)
        .replace(/[_\-\s]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي");

const CSV_HEADER_ALIASES = {
    username: ["username", "user_name", "اسم المستخدم"],
    password: ["password", "كلمة المرور"],
    role: ["role", "الدور"],
    studentCode: ["student_code", "studentid", "student_id", "studentcode", "كود الطالب"],
    fullName: ["full_name", "fullname", "name", "الاسم", "الاسم الكامل"],
    college: ["college", "الكليه", "الكلية"],
    major: ["major", "specialization", "التخصص"],
    nationalId: ["national_id", "nationalid", "رقم البطاقة", "الرقم القومي"],
    nationality: ["nationality", "الجنسية"],
    gender: ["gender", "النوع"],
    birthPlace: ["birth_place", "birthplace", "محل الميلاد"],
    email: ["email", "university_email", "البريد", "البريد الجامعي"],
    recoveryEmail: ["recovery_email", "recoveryemail", "email_recovery", "otp_recovery_email", "بريد الاسترداد", "ايميل الاسترداد"],
    level: ["level", "year", "batch", "الفرقه", "الفرقة", "الدفعه", "الدفعة"],
    admissionYear: ["admission_year", "admissionyear", "academic_year", "سنة الدخول", "عام القبول"],
};

const resolveCsvHeaderKey = (header) => {
    const normalized = normalizeCsvHeader(header);
    for (const [canonical, aliases] of Object.entries(CSV_HEADER_ALIASES)) {
        if (aliases.some((alias) => normalizeCsvHeader(alias) === normalized)) return canonical;
    }
    return null;
};

const parseCsvLine = (line) => {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === "," && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result.map((item) => item.replace(/\r/g, ""));
};

const parseCsvToObjects = (text) => {
    const lines = String(text || "")
        .replace(/^\uFEFF/, "")
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length < 2) return [];

    const rawHeaders = parseCsvLine(lines[0]);
    const headers = rawHeaders.map((h) => resolveCsvHeaderKey(h));
    return lines.slice(1).map((line, idx) => {
        const cols = parseCsvLine(line);
        const row = { __line: idx + 2 };
        headers.forEach((canonical, colIdx) => {
            if (!canonical) return;
            row[canonical] = String(cols[colIdx] || "").trim();
        });
        return row;
    });
};

const normalizeRoleForImport = (value) => {
    const role = normalizeKey(value);
    if (["admin", "ادمن", "أدمن"].includes(role)) return "admin";
    if (["doctor", "دكتور"].includes(role)) return "doctor";
    if (["advisor", "مرشد", "مرشد اكاديمي", "مرشد أكاديمي"].includes(role)) return "advisor";
    return "student";
};

const toLatinDigits = (value) =>
    String(value || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

const ARABIC_TO_LATIN = {
    ا: "a",
    أ: "a",
    إ: "e",
    آ: "a",
    ب: "b",
    ت: "t",
    ث: "th",
    ج: "g",
    ح: "h",
    خ: "kh",
    د: "d",
    ذ: "z",
    ر: "r",
    ز: "z",
    س: "s",
    ش: "sh",
    ص: "s",
    ض: "d",
    ط: "t",
    ظ: "z",
    ع: "a",
    غ: "gh",
    ف: "f",
    ق: "q",
    ك: "k",
    ل: "l",
    م: "m",
    ن: "n",
    ه: "h",
    ة: "h",
    و: "w",
    ي: "y",
    ى: "a",
    ئ: "e",
    ؤ: "o",
};

const transliterateArabic = (value) =>
    String(value || "")
        .split("")
        .map((ch) => ARABIC_TO_LATIN[ch] || ch)
        .join("");

const sanitizeUsernameToken = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 20);

const sanitizeNumericUsername = (value) =>
    toLatinDigits(String(value || ""))
        .replace(/\D/g, "")
        .slice(0, 20);

const generateTempPassword = (length = 10) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let result = "";
    for (let i = 0; i < length; i += 1) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
};

export default function AdminUsersPage() {
    const { i18n } = useTranslation("admin");
    const isRTL = String(i18n.language || "ar").toLowerCase().startsWith("ar");
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [batchFilter, setBatchFilter] = useState("all");
    const [collegeFilter, setCollegeFilter] = useState("all");
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showRequestsModal, setShowRequestsModal] = useState(false);
    const [accountRequests, setAccountRequests] = useState([]);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
    const [requestStatusFilter, setRequestStatusFilter] = useState("pending");
    const [requestsLoading, setRequestsLoading] = useState(false);
    const [requestActionLoadingId, setRequestActionLoadingId] = useState(null);
    const [editingUserId, setEditingUserId] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importRowsRaw, setImportRowsRaw] = useState([]);
    const [importFileName, setImportFileName] = useState("");
    const [importDefaultPassword, setImportDefaultPassword] = useState("");
    const [importSelectedCollege, setImportSelectedCollege] = useState("");
    const [colleges, setColleges] = useState([]);
    const [collegeTracksMap, setCollegeTracksMap] = useState({});
    const [collegePoliciesMap, setCollegePoliciesMap] = useState({});
    const [yearOptions, setYearOptions] = useState([]);
    const [admissionYearOptions] = useState(() => getAdmissionYearOptions(10));
    const currentAcademicYearValue = useMemo(() => {
        const start = getCurrentAcademicStartYear(new Date());
        return `${start}-${start + 1}`;
    }, []);
    const tableSwipeRef = useRef(null);
    const [swipeDot, setSwipeDot] = useState(0);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await apiFetch("/api/users");
            setUsers(Array.isArray(data) ? data : []);
        } catch (error) {
            Toast.fire({ icon: "error", title: error.message || "فشل تحميل المستخدمين", iconColor: "#ef4444" });
        } finally {
            setLoading(false);
        }
    };

    const loadSelectionOptions = async () => {
        let serverSettings = null;
        let serverYears = null;
        let serverColleges = [];
        try {
            const state = await fetchAcademicState();
            if (state && typeof state === "object") {
                serverSettings = state.registrationSettings && typeof state.registrationSettings === "object" ? state.registrationSettings : null;
                serverYears = Array.isArray(state.years) ? state.years : null;
            }
            serverColleges = await fetchCollegesState();
            const policies = serverSettings?.collegePolicies && typeof serverSettings.collegePolicies === "object"
                ? serverSettings.collegePolicies
                : {};
            if (Object.keys(policies).length === 0) {
                const boot = await apiFetch("/api/academic/college-policies/bootstrap/defaults", { method: "POST" });
                if (boot?.collegePolicies && typeof boot.collegePolicies === "object") {
                    serverSettings = { ...(serverSettings || {}), collegePolicies: boot.collegePolicies };
                }
            }
        } catch {
            // Keep defaults when backend is unavailable.
        }

        const policyMap = parseCollegePoliciesMap(serverSettings);
        const policyColleges = Object.keys(policyMap).map((key) => ({
            id: String(key || "").trim().toUpperCase(),
            name: getCollegeDisplayLabel(key),
        }));
        const mergedColleges = normalizeCollegeList([...(Array.isArray(serverColleges) ? serverColleges : []), ...policyColleges]);

        setColleges(normalizeCollegeList(mergedColleges));
        setCollegePoliciesMap(policyMap);
        setCollegeTracksMap(parseCollegeTracksMap(serverSettings));
        setYearOptions(serverYears || parseYears());
    };

    useEffect(() => {
        loadUsers();
        loadSelectionOptions();
        loadPendingRequestsCount();
    }, []);

    useEffect(() => {
        if (!showAddModal) return;
        loadSelectionOptions();
    }, [showAddModal]);

    const getUserBatch = (user) =>
        String(
            user?.level ??
                user?.year ??
                user?.academic_year ??
                user?.academicYear ??
                user?.student_year ??
                ""
        )
            .trim()
            .toLowerCase();

    const matchesBatchFilter = (normalizedBatch, filterValue) => {
        if (filterValue === "all") return true;
        const digit = String(filterValue).match(/\d+/)?.[0];
        if (!digit) return normalizedBatch === filterValue;
        return normalizedBatch.includes(digit);
    };

    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter((user) => {
            const normalizedRole = String(user.role || "").toLowerCase();
            const matchesRole = roleFilter === "all" ? true : normalizedRole === roleFilter;
            const userCollege = getCollegeCanonicalKey(user?.college);
            const matchesCollege = collegeFilter === "all" ? true : userCollege === collegeFilter;
            const normalizedBatch = getUserBatch(user);
            const matchesBatch =
                normalizedRole === "student" ? matchesBatchFilter(normalizedBatch, batchFilter) : true;
            const matchesSearch =
                !q ||
                [user.username, user.full_name, user.name, user.student_code, user.studentId, user.email, user.national_id, user.nationalId, user.level, user.year, user.academic_year, user.college, user.major, user.specialization].some((field) =>
                    String(field || "").toLowerCase().includes(q)
                );
            return matchesRole && matchesCollege && matchesBatch && matchesSearch;
        });
    }, [users, search, roleFilter, collegeFilter, batchFilter]);

    const resolveCollegeCode = (collegeName) => {
        const normalized = getCollegeCanonicalKey(collegeName);
        if (!normalized) return "00";
        const idx = colleges.findIndex(
            (college) => getCollegeCanonicalKey(college?.name || college?.id) === normalized
        );
        return idx >= 0 ? String(idx + 1).padStart(2, "0") : "00";
    };

    const resolveBatchCode = (levelValue) => {
        const level = normalizeLevelId(levelValue);
        return level ? String(level).padStart(2, "0") : "00";
    };

    const resolveCollegeDomainCode = (collegeName) => {
        const canonical = getCollegeCanonicalKey(collegeName);
        if (/^[a-z][a-z0-9]{1,8}$/.test(canonical || "")) return canonical;
        return "";
    };

    const extractFirstNameToken = (fullName) => {
        const parts = String(fullName || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        return parts[0] || "";
    };

    const buildEmailLocalFromName = (fullName) => {
        const firstName = extractFirstNameToken(fullName);
        if (!firstName) return "";
        const normalizedArabic = firstName
            .replace(/[ًٌٍَُِّْـ]/g, "")
            .replace(/[أإآ]/g, "ا")
            .replace(/ة/g, "ه")
            .replace(/ى/g, "ي");
        const commonArabicMap = {
            محمد: "mohamed",
            احمد: "ahmed",
            محمود: "mahmoud",
            منى: "mona",
            علي: "ali",
            حسن: "hassan",
            حسين: "hussein",
            ابراهيم: "ibrahim",
            يوسف: "youssef",
            عمر: "omar",
        };
        if (commonArabicMap[normalizedArabic]) return commonArabicMap[normalizedArabic];
        const asciiFirst = firstName.replace(/[^A-Za-z0-9]/g, "");
        if (asciiFirst) return sanitizeUsernameToken(asciiFirst);
        return sanitizeUsernameToken(transliterateArabic(firstName));
    };

    const buildUniqueUsername = (base, ignoredUserId = null) => {
        const normalizedBase = sanitizeUsernameToken(base);
        const fallbackSeed = `std${String(Date.now()).slice(-5)}`;
        const seed = normalizedBase || fallbackSeed;
        const taken = new Set(
            users
                .filter((u) => (ignoredUserId ? Number(u?.id) !== Number(ignoredUserId) : true))
                .map((u) => normalizeKey(u?.username))
                .filter(Boolean)
        );
        if (!taken.has(normalizeKey(seed))) return seed;
        let index = 2;
        while (index < 10000) {
            const candidate = `${seed}${index}`;
            if (!taken.has(normalizeKey(candidate))) return candidate;
            index += 1;
        }
        return `${seed}${Math.floor(Math.random() * 90000) + 10000}`;
    };

    const buildUniversityEmailFromName = (fullName, collegeValue, usernameValue = "", ignoredUserId = null) => {
        const localBase = buildEmailLocalFromName(fullName);
        if (!localBase) return "";
        const numericSuffix = sanitizeNumericUsername(usernameValue);
        const composedLocalBase = `${localBase}${numericSuffix}`.slice(0, 30);
        const collegeCode = resolveCollegeDomainCode(collegeValue);
        const domain = collegeCode ? `${collegeCode}.bnu.edu.eg` : "bnu.edu.eg";
        const taken = new Set(
            users
                .filter((u) => (ignoredUserId ? Number(u?.id) !== Number(ignoredUserId) : true))
                .map((u) => normalizeKey(u?.email))
                .filter(Boolean)
        );
        let localPart = composedLocalBase;
        let candidate = `${localPart}@${domain}`;
        let idx = 2;
        while (taken.has(normalizeKey(candidate)) && idx < 10000) {
            localPart = `${composedLocalBase}${idx}`;
            candidate = `${localPart}@${domain}`;
            idx += 1;
        }
        return candidate;
    };

    const importPreviewRows = useMemo(() => {
        const usernames = new Set();
        const studentCodes = new Set();
        const batchSequenceCounter = new Map();

        users.forEach((user) => {
            const username = normalizeKey(user?.username);
            if (username) usernames.add(username);
            const studentCode = normalizeKey(user?.student_code || user?.studentId || user?.student_id);
            if (studentCode) studentCodes.add(studentCode);

            const role = String(user?.role || "").toLowerCase();
            if (role === "student") {
                const key = `${resolveCollegeCode(user?.college)}-${resolveBatchCode(user?.level || user?.year || user?.student_year)}`;
                const current = batchSequenceCounter.get(key) || 0;
                batchSequenceCounter.set(key, current + 1);
            }
        });

        const seenUsernames = new Set();
        const seenStudentCodes = new Set();
        const seenEmails = new Set();

        return importRowsRaw.map((raw, idx) => {
            const errors = [];
            const role = normalizeRoleForImport(raw.role);
            const requestedUsername = String(raw.username || "").trim();
            const fullName = String(raw.fullName || "").trim();
            const importedUsername = sanitizeNumericUsername(requestedUsername);
            let username = importedUsername;
            const inputStudentCode = String(raw.studentCode || "").trim();
            const level = normalizeLevelId(raw.level || "");
            const admissionYear = String(raw.admissionYear || "").trim();
            const college = String(raw.college || importSelectedCollege || "").trim();
            const major = String(raw.major || "").trim();
            const recoveryEmail = String(raw.recoveryEmail || "").trim().toLowerCase();
            const rawPassword = String(raw.password || importDefaultPassword || "").trim();
            const password = rawPassword.length >= 6 ? rawPassword : generateTempPassword(10);
            const collegeCode = resolveCollegeCode(college);
            const batchCode = resolveBatchCode(level);
            let email = "";

            let studentCode = inputStudentCode;
            if (role === "student" && !studentCode && college && level) {
                const seqKey = `${collegeCode}-${batchCode}`;
                const next = (batchSequenceCounter.get(seqKey) || 0) + 1;
                batchSequenceCounter.set(seqKey, next);
                const seq = String(next).padStart(4, "0");
                studentCode = `BNU-${collegeCode}-${batchCode}-${seq}`;
            }

            if (!username) {
                const admissionYearDigits = String(admissionYear || "").match(/\d{4}/)?.[0];
                const yy = admissionYearDigits ? admissionYearDigits.slice(-2) : String(new Date().getFullYear()).slice(-2);
                const studentDigits = toLatinDigits(inputStudentCode).replace(/\D/g, "");
                const seq = studentDigits
                    ? studentDigits.slice(-4).padStart(4, "0")
                    : String(Math.floor(Math.random() * 10000)).padStart(4, "0");
                username = sanitizeNumericUsername(`${yy}${collegeCode}${seq}`);
            }
            if (!username) errors.push("تعذر توليد اسم المستخدم");
            if (!fullName) errors.push("الاسم مطلوب");
            if (!recoveryEmail) errors.push("إيميل الاسترداد مطلوب");
            if (recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) errors.push("إيميل الاسترداد غير صالح");
            // Password is auto-generated when missing/short, so no validation error here.

            if (role === "student") {
                if (!studentCode && college && level) {
                    errors.push("تعذر توليد كود الطالب تلقائيًا");
                }
                if (!level) errors.push("الفرقة/الدفعة مطلوبة");
                if (!admissionYear) errors.push("سنة الدخول مطلوبة");
                if (!college) errors.push("الكلية مطلوبة");
            }
            if ((role === "doctor" || role === "advisor" || role === "student") && !college) {
                if (!errors.includes("الكلية مطلوبة")) errors.push("الكلية مطلوبة");
            }
            if (role === "doctor" && !major) errors.push("التخصص مطلوب للدكتور");

            const normalizedStudentCode = normalizeKey(studentCode);

            if (!importedUsername && username) {
                let counter = 1;
                while (seenUsernames.has(normalizeKey(username)) || usernames.has(normalizeKey(username))) {
                    username = sanitizeNumericUsername(String(Number(username || "0") + counter));
                    counter += 1;
                }
            }
            const normalizedUsername = normalizeKey(username);
            email = buildUniversityEmailFromName(fullName, college, username);

            if (!email) errors.push("تعذر توليد البريد الجامعي");

            if (normalizedUsername && usernames.has(normalizedUsername)) errors.push("اسم المستخدم موجود بالفعل");
            if (normalizedStudentCode && studentCodes.has(normalizedStudentCode)) errors.push("كود الطالب موجود بالفعل");
            if (normalizedUsername && seenUsernames.has(normalizedUsername)) errors.push("اسم المستخدم مكرر داخل الملف");
            if (normalizedStudentCode && seenStudentCodes.has(normalizedStudentCode)) errors.push("كود الطالب مكرر داخل الملف");
            if (email && seenEmails.has(normalizeKey(email))) errors.push("البريد الجامعي مكرر داخل الملف");

            if (normalizedUsername) seenUsernames.add(normalizedUsername);
            if (normalizedStudentCode) seenStudentCodes.add(normalizedStudentCode);
            if (email) seenEmails.add(normalizeKey(email));

            return {
                id: `${raw.__line || idx + 2}-${idx}`,
                line: raw.__line || idx + 2,
                username,
                fullName,
                role,
                studentCode,
                college,
                level: level || String(raw.level || "").trim(),
                admissionYear,
                email,
                recoveryEmail,
                errors,
                valid: errors.length === 0,
                payload: {
                    username,
                    password,
                    role,
                    student_code: role === "student" ? studentCode : null,
                    full_name: fullName,
                    college: role === "admin" ? null : college || null,
                    major: role === "doctor" ? major || null : null,
                    specialization: role === "doctor" ? major || null : null,
                    national_id: String(raw.nationalId || "").trim() || null,
                    nationality: String(raw.nationality || "").trim() || null,
                    gender: String(raw.gender || "").trim() || null,
                    birth_place: String(raw.birthPlace || "").trim() || null,
                    email,
                    recovery_email: recoveryEmail || null,
                    level: role === "student" ? level || null : null,
                    admission_year: role === "student" ? admissionYear || null : null,
                },
            };
        });
    }, [importRowsRaw, importDefaultPassword, importSelectedCollege, users, colleges]);

    const importStats = useMemo(() => {
        const total = importPreviewRows.length;
        const valid = importPreviewRows.filter((row) => row.valid).length;
        const invalid = total - valid;
        return { total, valid, invalid };
    }, [importPreviewRows]);

    const normalizedFormRole = String(form.role || "student").toLowerCase();
    const isStudentRole = normalizedFormRole === "student";
    const isDoctorRole = normalizedFormRole === "doctor";
    const isAdvisorRole = normalizedFormRole === "advisor";
    const needsCollegeMajor = isStudentRole || isDoctorRole || isAdvisorRole;
    const trimmedSpecialization = String(form.major || "").trim();

    const collegeFilterOptions = useMemo(() => {
        const options = new Map();
        colleges.forEach((college) => {
            const value = String(college?.name || college?.id || "").trim();
            if (!value) return;
            const key = getCollegeCanonicalKey(value);
            if (!options.has(key)) options.set(key, getCollegeDisplayLabel(value));
        });
        users.forEach((user) => {
            const value = String(user?.college || "").trim();
            if (!value) return;
            const key = getCollegeCanonicalKey(value);
            if (!options.has(key)) options.set(key, getCollegeDisplayLabel(value));
        });
        return [...options.entries()].map(([key, label]) => ({ key, label }));
    }, [colleges, users]);

    const importCollegeOptions = useMemo(() => {
        const options = new Map();
        colleges.forEach((college) => {
            const value = String(college?.name || college?.id || "").trim();
            if (!value) return;
            const key = getCollegeCanonicalKey(value);
            if (!options.has(key)) options.set(key, getCollegeDisplayLabel(value));
        });
        return [...options.values()];
    }, [colleges]);

    const selectedCollegePolicy = useMemo(() => {
        const selectedCollege = String(form.college || "").trim();
        const matchingCollege = colleges.find(
            (college) =>
                normalizeKey(college?.name) === normalizeKey(selectedCollege) ||
                normalizeKey(college?.id) === normalizeKey(selectedCollege)
        );
        const keys = [
            normalizeKey(selectedCollege),
            normalizeKey(matchingCollege?.id),
            normalizeKey(matchingCollege?.name),
        ].filter(Boolean);
        for (const key of keys) {
            if (collegePoliciesMap[key] && typeof collegePoliciesMap[key] === "object") return collegePoliciesMap[key];
        }
        return null;
    }, [form.college, colleges, collegePoliciesMap]);

    const selectedYearDigit = toYearNumber(form.level);
    const selectedBranchingYearDigit = toYearNumber(selectedCollegePolicy?.branchingYear);
    const isStudentBeforeBranching =
        isStudentRole &&
        selectedBranchingYearDigit > 0 &&
        selectedYearDigit > 0 &&
        selectedYearDigit < selectedBranchingYearDigit;
    const shouldShowMajorForStudent =
        isStudentRole &&
        selectedYearDigit > 0 &&
        (selectedBranchingYearDigit === 0 || selectedYearDigit >= selectedBranchingYearDigit);
    const shouldRenderMajorField = isDoctorRole;
    const branchingHintText = useMemo(() => {
        if (!isStudentRole || !form.college || !form.level) return "";
        if (selectedBranchingYearDigit <= 0) return "لا توجد سنة تشعيب محددة لهذه الكلية (مواد عامة فقط).";
        if (selectedYearDigit <= 0) return `التشعيب يبدأ من السنة ${selectedBranchingYearDigit}.`;
        if (selectedYearDigit < selectedBranchingYearDigit) {
            return `التشعيب يبدأ من السنة ${selectedBranchingYearDigit} - غير مسموح اختيار تخصص الآن.`;
        }
        return `التشعيب يبدأ من السنة ${selectedBranchingYearDigit} - مسموح اختيار التخصص الآن.`;
    }, [isStudentRole, form.college, form.level, selectedBranchingYearDigit, selectedYearDigit]);

    const majorOptions = useMemo(() => {
        let tracks = [];
        if (Array.isArray(selectedCollegePolicy?.tracks)) {
            tracks = selectedCollegePolicy.tracks.map((track) => String(track?.name || track?.id || track || "").trim());
        } else {
            const selectedCollege = String(form.college || "").trim();
            const matchingCollege = colleges.find(
                (college) =>
                    normalizeKey(college?.name) === normalizeKey(selectedCollege) ||
                    normalizeKey(college?.id) === normalizeKey(selectedCollege)
            );
            const keys = [
                normalizeKey(selectedCollege),
                normalizeKey(matchingCollege?.id),
                normalizeKey(matchingCollege?.name),
            ].filter(Boolean);
            keys.forEach((key) => {
                if (Array.isArray(collegeTracksMap[key])) tracks = [...tracks, ...collegeTracksMap[key]];
            });
        }
        tracks = [...new Set(tracks.map((item) => String(item || "").trim()).filter(Boolean))];
        const selectedYearDigit = toYearNumber(form.level);
        const branchingYear = toYearNumber(selectedCollegePolicy?.branchingYear);
        const studentBeforeBranching =
            isStudentRole &&
            branchingYear > 0 &&
            selectedYearDigit > 0 &&
            selectedYearDigit < branchingYear;

        const base = studentBeforeBranching ? [] : tracks;
        const current = String(form.major || "").trim();
        if (current && !base.some((item) => normalizeKey(item) === normalizeKey(current))) base.push(current);
        return base;
    }, [selectedCollegePolicy, colleges, collegeTracksMap, form.college, form.major, form.level, isStudentRole]);
    const doctorMajorSelectValue = useMemo(() => {
        if (!isDoctorRole) return "";
        if (!trimmedSpecialization) return "";
        return majorOptions.some((item) => normalizeKey(item) === normalizeKey(trimmedSpecialization))
            ? trimmedSpecialization
            : "";
    }, [isDoctorRole, majorOptions, trimmedSpecialization]);

    const getSpecializationDisplay = (user) => {
        const role = String(user?.role || "").toLowerCase();
        const value = pick(user, ["major", "specialization", "track", "trackId", "department"]);
        if (role === "doctor") return value === "-" ? "غير مسجل" : value;
        if (role === "advisor") return value === "-" ? "غير مطلوب" : value;
        if (role === "student") return value === "-" ? "يحدد لاحقًا" : value;
        return value;
    };

    const collegeOptions = useMemo(() => {
        const optionsMap = new Map();
        colleges.forEach((college) => {
            const rawValue = String(college?.name || college?.id || "").trim();
            if (!rawValue) return;
            const key = getCollegeCanonicalKey(rawValue);
            if (!key) return;
            const label = getCollegeDisplayLabel(rawValue);
            if (!optionsMap.has(key)) optionsMap.set(key, { id: String(college?.id || "").trim().toUpperCase(), name: label });
        });
        const currentCollege = String(form.college || "").trim();
        const currentKey = getCollegeCanonicalKey(currentCollege);
        if (currentCollege && currentKey && !optionsMap.has(currentKey)) {
            optionsMap.set(currentKey, { id: currentKey.toUpperCase(), name: getCollegeDisplayLabel(currentCollege) });
        }
        return [...optionsMap.values()];
    }, [colleges, form.college]);

    const yearSelectOptions = useMemo(() => {
        const selectedCollege = String(form.college || "").trim();
        if (!selectedCollege) return [];
        const policyYearIds = Array.isArray(selectedCollegePolicy?.yearIds)
            ? selectedCollegePolicy.yearIds.map((id) => String(id || "").trim()).filter(Boolean)
            : [];
        const policyTotalYears = Number(selectedCollegePolicy?.totalYears || 0);
        const optionsMap = new Map((yearOptions || []).map((year) => [String(year?.id || "").trim(), year]));
        let options = [];
        if (policyYearIds.length > 0) {
            options = policyYearIds.map((id) => optionsMap.get(id) || { id, name: formatArabicYearLabel(id) || `السنة ${id}` });
        } else if (Number.isFinite(policyTotalYears) && policyTotalYears > 0) {
            options = Array.from({ length: policyTotalYears }, (_, idx) => {
                const id = String(idx + 1);
                return optionsMap.get(id) || { id, name: formatArabicYearLabel(id) || `السنة ${id}` };
            });
        } else {
            options = [...yearOptions];
        }
        return options;
    }, [yearOptions, form.level, form.college, selectedCollegePolicy]);

    const buildAutoUsername = () => {
        const admissionYear = String(form.admissionYear || "").match(/\d{4}/)?.[0];
        const yy = admissionYear ? admissionYear.slice(-2) : String(new Date().getFullYear()).slice(-2);
        const collegeCode = resolveCollegeCode(form.college);
        const studentDigits = toLatinDigits(form.studentId).replace(/\D/g, "");
        const seq = studentDigits
            ? studentDigits.slice(-4).padStart(4, "0")
            : String(Math.floor(Math.random() * 10000)).padStart(4, "0");
        return sanitizeNumericUsername(`${yy}${collegeCode}${seq}`);
    };

    const buildAutoStudentCode = () => {
        const collegeCode = resolveCollegeCode(form.college);
        const batchCode = resolveBatchCode(form.level);
        const nextSeq =
            users.filter(
                (u) =>
                    String(u?.role || "").toLowerCase() === "student" &&
                    normalizeKey(u?.college) === normalizeKey(form.college) &&
                    normalizeLevelId(u?.level || u?.year || u?.student_year) === normalizeLevelId(form.level)
            ).length + 1;
        return `BNU-${collegeCode}-${batchCode}-${String(nextSeq).padStart(4, "0")}`;
    };

    const handleGenerateUsername = () => {
        setForm((prev) => ({ ...prev, username: buildAutoUsername() }));
    };

    const handleGeneratePassword = () => {
        setForm((prev) => ({ ...prev, password: generateTempPassword(10) }));
    };

    const handleGenerateStudentCode = () => {
        setForm((prev) => ({ ...prev, studentId: buildAutoStudentCode() }));
    };

    useEffect(() => {
        setForm((prev) => ({
            ...prev,
            email: buildUniversityEmailFromName(prev.name, prev.college, prev.username, editingUserId),
        }));
    }, [form.name, form.college, form.username, editingUserId]);

    useEffect(() => {
        if (!isStudentRole) return;
        const current = normalizeLevelId(form.level);
        const allowed = new Set(yearSelectOptions.map((year) => String(year?.id || "").trim()).filter(Boolean));
        if (current && !allowed.has(current)) {
            setForm((prev) => ({ ...prev, level: "" }));
        }
    }, [form.level, isStudentRole, yearSelectOptions]);

    const handleRoleChange = (nextRole) => {
        const normalized = String(nextRole || "student").toLowerCase();
        setForm((prev) => ({
            ...prev,
            role: normalized,
            studentId: normalized === "student" ? prev.studentId : "",
            level: normalized === "student" ? prev.level : "",
            admissionYear: normalized === "student" ? prev.admissionYear : "",
            college: normalized === "admin" ? "" : prev.college,
            major: normalized === "admin" ? "" : prev.major || "",
        }));
    };

    useEffect(() => {
        if (!isStudentRole) return;
        if (isStudentBeforeBranching && form.major) {
            setForm((prev) => ({ ...prev, major: "" }));
        }
    }, [isStudentRole, isStudentBeforeBranching, form.major]);

    useEffect(() => {
        if (!isStudentRole) return;
        if (String(form.admissionYear || "").trim()) return;
        setForm((prev) => ({ ...prev, admissionYear: currentAcademicYearValue }));
    }, [isStudentRole, form.admissionYear, currentAcademicYearValue]);

    useEffect(() => {
        const el = tableSwipeRef.current;
        if (!el) return;

        const updateDot = () => {
            const maxScroll = Math.max(1, el.scrollWidth - el.clientWidth);
            const progress = Math.min(1, Math.max(0, Math.abs(el.scrollLeft) / maxScroll));
            setSwipeDot(progress >= 0.5 ? 1 : 0);
        };

        updateDot();
        el.addEventListener("scroll", updateDot, { passive: true });
        window.addEventListener("resize", updateDot);
        return () => {
            el.removeEventListener("scroll", updateDot);
            window.removeEventListener("resize", updateDot);
        };
    }, [filteredUsers.length]);

    const resetFormState = () => {
        setShowAddModal(false);
        setEditingUserId(null);
        setForm(initialForm);
    };

    const mapUserToForm = (user) => ({
        username: pick(user, ["username"]) === "-" ? "" : pick(user, ["username"]),
        password: "",
        role: (() => {
            const normalizedRole = String(user?.role || "student").toLowerCase();
            return normalizedRole === "super_admin" ? "admin" : normalizedRole;
        })(),
        studentId: pick(user, ["student_code", "studentId", "student_id"]) === "-" ? "" : pick(user, ["student_code", "studentId", "student_id"]),
        name: pick(user, ["full_name", "name"]) === "-" ? "" : pick(user, ["full_name", "name"]),
        college: pick(user, ["college"]) === "-" ? "" : getCollegeDisplayLabel(pick(user, ["college"])),
        major: pick(user, ["major", "specialization", "track", "trackId"]) === "-" ? "" : pick(user, ["major", "specialization", "track", "trackId"]),
        nationalId: pick(user, ["national_id", "nationalId"]) === "-" ? "" : pick(user, ["national_id", "nationalId"]),
        nationality: pick(user, ["nationality"]) === "-" ? "" : pick(user, ["nationality"]),
        gender: pick(user, ["gender"]) === "-" ? "" : pick(user, ["gender"]),
        birthPlace: pick(user, ["birth_place", "birthPlace", "birthplace"]) === "-" ? "" : pick(user, ["birth_place", "birthPlace", "birthplace"]),
        email: pick(user, ["email"]) === "-" ? "" : pick(user, ["email"]),
        recoveryEmail:
            pick(user, ["recovery_email", "recoveryEmail"]) === "-"
                ? (pick(user, ["email"]) === "-" ? "" : pick(user, ["email"]))
                : pick(user, ["recovery_email", "recoveryEmail"]),
        level: normalizeLevelId(pick(user, ["level", "year", "student_year"]) === "-" ? "" : pick(user, ["level", "year", "student_year"])),
        admissionYear: pick(user, ["admission_year", "admissionYear", "academic_year", "academicYear"]) === "-" ? "" : pick(user, ["admission_year", "admissionYear", "academic_year", "academicYear"]),
    });

    const validateUserForm = (mode = "add") => {
        const requiredFields = [];
        const formatIssues = [];
        const candidateEmail = buildUniversityEmailFromName(form.name, form.college, form.username, editingUserId);

        if (!String(form.name || "").trim()) requiredFields.push("الاسم");
        if (!String(candidateEmail || "").trim()) requiredFields.push("البريد الجامعي");
        if (mode === "add" && !String(form.recoveryEmail || "").trim()) requiredFields.push("إيميل الاسترداد");

        if (mode === "add") {
            if (!String(form.password || "").trim()) requiredFields.push("كلمة المرور");
        }

        if (String(form.password || "").trim() && String(form.password || "").trim().length < 6) {
            formatIssues.push("كلمة المرور لا تقل عن 6 أحرف");
        }
        if (String(form.recoveryEmail || "").trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.recoveryEmail || "").trim())) {
            formatIssues.push("إيميل الاسترداد غير صالح");
        }

        if (isStudentRole && !String(form.studentId || "").trim()) requiredFields.push("كود الطالب");
        if (needsCollegeMajor && !String(form.college || "").trim()) requiredFields.push("الكلية");
        if (isDoctorRole && !String(trimmedSpecialization || "").trim()) requiredFields.push("التخصص");
        if (isStudentRole && !String(form.level || "").trim()) requiredFields.push("السنة");
        if (isStudentRole && !String(form.admissionYear || "").trim()) requiredFields.push("سنة الدخول");

        if (isStudentRole && String(form.level || "").trim()) {
            const allowed = new Set(yearSelectOptions.map((year) => String(year?.id || "").trim()).filter(Boolean));
            if (!allowed.has(String(form.level || "").trim())) {
                formatIssues.push("يرجى اختيار السنة من القائمة فقط");
            }
        }

        if (!requiredFields.length && !formatIssues.length) return "";

        const parts = [];
        if (requiredFields.length) parts.push(`يرجى إدخال: ${requiredFields.join(" - ")}`);
        if (formatIssues.length) parts.push(formatIssues.join(" - "));
        return parts.join(" | ");
    };

    const handleAddUser = async () => {
        const generatedUsername = sanitizeNumericUsername(form.username) || buildAutoUsername();
        const generatedUniversityEmail = buildUniversityEmailFromName(form.name, form.college, generatedUsername);
        if (!String(form.username || "").trim() && generatedUsername) {
            setForm((prev) => ({ ...prev, username: generatedUsername, email: generatedUniversityEmail }));
        }
        const validationMessage = validateUserForm("add");
        if (validationMessage) {
            Toast.fire({ icon: "error", title: validationMessage, iconColor: "#ef4444" });
            return;
        }

        try {
            setSaving(true);
            await apiFetch("/api/users", {
                method: "POST",
                body: JSON.stringify({
                    username: generatedUsername || null,
                    password: form.password,
                    role: form.role,
                    student_code: isStudentRole ? form.studentId : null,
                    full_name: form.name,
                    college: needsCollegeMajor ? form.college : null,
                    major: isDoctorRole ? trimmedSpecialization : null,
                    specialization: isDoctorRole ? trimmedSpecialization : null,
                    national_id: form.nationalId,
                    nationality: form.nationality,
                    gender: form.gender,
                    birth_place: form.birthPlace,
                    email: generatedUniversityEmail,
                    recovery_email: String(form.recoveryEmail || "").trim().toLowerCase() || null,
                    level: isStudentRole ? form.level : null,
                    admission_year: isStudentRole ? form.admissionYear : null,
                }),
            });

            Toast.fire({ icon: "success", title: "تمت إضافة المستخدم بنجاح", iconColor: "#05ADCF" });
            resetFormState();
            await loadUsers();
        } catch (error) {
            Toast.fire({ icon: "error", title: error.message || "فشل إضافة المستخدم", iconColor: "#ef4444" });
        } finally {
            setSaving(false);
        }
    };

    const openEditModal = (user) => {
        setEditingUserId(user.id);
        setForm(mapUserToForm(user));
        setShowAddModal(true);
    };

    const handleUpdateUser = async () => {
        if (!editingUserId) return;
        const validationMessage = validateUserForm("edit");
        if (validationMessage) {
            Toast.fire({ icon: "error", title: validationMessage, iconColor: "#ef4444" });
            return;
        }

        try {
            setSaving(true);
            const universityEmailForUpdate = buildUniversityEmailFromName(form.name, form.college, form.username, editingUserId);
            const payload = {
                email: universityEmailForUpdate,
                full_name: form.name,
                role: form.role,
                student_code: isStudentRole ? form.studentId : null,
                college: needsCollegeMajor ? form.college : null,
                major: isDoctorRole ? trimmedSpecialization : null,
                specialization: isDoctorRole ? trimmedSpecialization : null,
                national_id: form.nationalId,
                nationality: form.nationality,
                gender: form.gender,
                birth_place: form.birthPlace,
                level: isStudentRole ? form.level : null,
                admission_year: isStudentRole ? form.admissionYear : null,
                recovery_email: String(form.recoveryEmail || "").trim().toLowerCase() || null,
            };
            if (form.password) payload.password = form.password;

            await apiFetch(`/api/users/${editingUserId}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
            });

            Toast.fire({ icon: "success", title: "تم تعديل المستخدم بنجاح", iconColor: "#05ADCF" });
            resetFormState();
            await loadUsers();
        } catch (error) {
            Toast.fire({ icon: "error", title: error.message || "فشل تعديل المستخدم", iconColor: "#ef4444" });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUser = async (user) => {
        const confirm = await Swal.fire({
            title: "حذف المستخدم؟",
            text: `سيتم حذف ${pick(user, ["full_name", "name", "username"])} نهائياً`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "حذف",
            cancelButtonText: "إلغاء",
            confirmButtonColor: "#ef4444",
            reverseButtons: true,
        });

        if (!confirm.isConfirmed) return;

        try {
            await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
            Toast.fire({ icon: "success", title: "تم حذف المستخدم", iconColor: "#05ADCF" });
            await loadUsers();
        } catch (error) {
            Toast.fire({ icon: "error", title: error.message || "فشل حذف المستخدم", iconColor: "#ef4444" });
        }
    };

    const handleDownloadCsvTemplate = () => {
        const selectedCollege = String(importSelectedCollege || "").trim();
        const sampleCollege = selectedCollege || "علوم الحاسب";
        const sampleFullName = "Ahmed Ali";
        const sampleUsername = `${String(currentAcademicYearValue).slice(2, 4)}${resolveCollegeCode(sampleCollege)}0001`;
        const sampleUniversityEmail = buildUniversityEmailFromName(sampleFullName, sampleCollege, sampleUsername);
        const headers = [
            "username",
            "password",
            "role",
            "student_code",
            "full_name",
            "college",
            "major",
            "national_id",
            "nationality",
            "gender",
            "birth_place",
            "email",
            "recovery_email",
            "level",
            "admission_year",
        ];
        const sample = [
            sampleUsername,
            "temp123",
            "student",
            `BNU-${resolveCollegeCode(sampleCollege)}-01-0001`,
            sampleFullName,
            sampleCollege,
            "",
            "30201011234567",
            "Egypt",
            "Male",
            "Alexandria",
            sampleUniversityEmail,
            "ahmed.personal@gmail.com",
            "1",
            currentAcademicYearValue,
        ];
        const csv = `\uFEFF${headers.join(",")}\n${sample.join(",")}\n`;
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "users-import-template.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownloadXlsxTemplate = () => {
        const selectedCollege = String(importSelectedCollege || "").trim();
        const sampleCollege = selectedCollege || "علوم الحاسب";
        const sampleFullName = "Ahmed Ali";
        const sampleUsername = `${String(currentAcademicYearValue).slice(2, 4)}${resolveCollegeCode(sampleCollege)}0001`;
        const sampleUniversityEmail = buildUniversityEmailFromName(sampleFullName, sampleCollege, sampleUsername);
        const row = {
            username: sampleUsername,
            password: "temp123",
            role: "student",
            student_code: `BNU-${resolveCollegeCode(sampleCollege)}-01-0001`,
            full_name: sampleFullName,
            college: sampleCollege,
            major: "",
            national_id: "30201011234567",
            nationality: "Egypt",
            gender: "Male",
            birth_place: "Alexandria",
            email: sampleUniversityEmail,
            recovery_email: "ahmed.personal@gmail.com",
            level: "1",
            admission_year: currentAcademicYearValue,
        };
        const ws = XLSX.utils.json_to_sheet([row], {
            header: [
                "username",
                "password",
                "role",
                "student_code",
                "full_name",
                "college",
                "major",
                "national_id",
                "nationality",
                "gender",
                "birth_place",
                "email",
                "recovery_email",
                "level",
                "admission_year",
            ],
        });
        ws["!cols"] = [
            { wch: 14 },
            { wch: 12 },
            { wch: 10 },
            { wch: 14 },
            { wch: 24 },
            { wch: 22 },
            { wch: 16 },
            { wch: 16 },
            { wch: 12 },
            { wch: 10 },
            { wch: 14 },
            { wch: 24 },
            { wch: 26 },
            { wch: 10 },
            { wch: 14 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "UsersTemplate");
        XLSX.writeFile(wb, "users-import-template.xlsx");
    };

    const handleCsvFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const fileNameLower = file.name.toLowerCase();
        const isCsv = fileNameLower.endsWith(".csv");
        const isExcel = fileNameLower.endsWith(".xlsx") || fileNameLower.endsWith(".xls");
        if (!isCsv && !isExcel) {
            Toast.fire({ icon: "error", title: "يرجى رفع ملف CSV أو XLSX", iconColor: "#ef4444" });
            event.target.value = "";
            return;
        }
        try {
            let parsed = [];
            if (isCsv) {
                const text = await file.text();
                parsed = parseCsvToObjects(text || "");
            } else {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: "array" });
                const firstSheetName = workbook.SheetNames?.[0];
                const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
                const aoa = worksheet ? XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) : [];
                if (!Array.isArray(aoa) || aoa.length < 2) {
                    parsed = [];
                } else {
                    const headers = (aoa[0] || []).map((h) => resolveCsvHeaderKey(String(h || "")));
                    parsed = aoa
                        .slice(1)
                        .filter((cols) => Array.isArray(cols) && cols.some((cell) => String(cell || "").trim() !== ""))
                        .map((cols, idx) => {
                            const row = { __line: idx + 2 };
                            headers.forEach((canonical, colIdx) => {
                                if (!canonical) return;
                                row[canonical] = String(cols[colIdx] || "").trim();
                            });
                            return row;
                        });
                }
            }
            if (!parsed.length) {
                Toast.fire({ icon: "error", title: "الملف فارغ أو غير صالح", iconColor: "#ef4444" });
                setImportRowsRaw([]);
                setImportFileName(file.name);
            } else {
                setImportRowsRaw(parsed);
                setImportFileName(file.name);
            }
        } catch {
            Toast.fire({ icon: "error", title: "تعذر قراءة الملف", iconColor: "#ef4444" });
        }
        event.target.value = "";
    };

    const resetImportState = () => {
        setShowImportModal(false);
        setImportRowsRaw([]);
        setImportFileName("");
        setImportDefaultPassword("");
        setImportSelectedCollege("");
    };

    const handleImportUsers = async () => {
        const validRows = importPreviewRows.filter((row) => row.valid);
        if (!validRows.length) {
            Toast.fire({ icon: "error", title: "لا يوجد صفوف صالحة للاستيراد", iconColor: "#ef4444" });
            return;
        }
        try {
            setImporting(true);
            let success = 0;
            let failed = 0;
            for (const row of validRows) {
                try {
                    await apiFetch("/api/users", { method: "POST", body: JSON.stringify(row.payload) });
                    success += 1;
                } catch {
                    failed += 1;
                }
            }
            Toast.fire({ icon: success ? "success" : "error", title: `تم استيراد ${success} مستخدم${failed ? ` - فشل ${failed}` : ""}`, iconColor: success ? "#05ADCF" : "#ef4444" });
            if (success > 0) {
                await loadUsers();
                resetImportState();
            }
        } finally {
            setImporting(false);
        }
    };

    const loadAccountRequests = async (statusValue = requestStatusFilter) => {
        try {
            setRequestsLoading(true);
            const data = await apiFetch(`/api/users/requests/account-requests?status=${encodeURIComponent(statusValue)}`);
            setAccountRequests(Array.isArray(data) ? data : []);
        } catch (error) {
            Toast.fire({ icon: "error", title: error.message || "فشل تحميل طلبات إنشاء الحساب", iconColor: "#ef4444" });
        } finally {
            setRequestsLoading(false);
        }
    };

    const loadPendingRequestsCount = async () => {
        try {
            const data = await apiFetch("/api/users/requests/account-requests?status=pending");
            setPendingRequestsCount(Array.isArray(data) ? data.length : 0);
        } catch {
            setPendingRequestsCount(0);
        }
    };

    const openRequestsModal = async () => {
        setShowRequestsModal(true);
        await loadAccountRequests(requestStatusFilter);
    };

    const handleChangeRequestStatusFilter = async (nextStatus) => {
        setRequestStatusFilter(nextStatus);
        await loadAccountRequests(nextStatus);
    };

    const handleReviewRequest = async (requestItem, action) => {
        if (!requestItem?.id) return;

        let reviewNote = "";
        if (action === "reject") {
            const result = await Swal.fire({
                title: "سبب الرفض (اختياري)",
                input: "text",
                inputPlaceholder: "اكتب ملاحظة للطالب",
                showCancelButton: true,
                confirmButtonText: "تأكيد الرفض",
                cancelButtonText: "إلغاء",
                confirmButtonColor: "#ef4444",
                reverseButtons: true,
            });
            if (!result.isConfirmed) return;
            reviewNote = String(result.value || "").trim();
        }

        try {
            setRequestActionLoadingId(requestItem.id);
            const response = await apiFetch(`/api/users/requests/account-requests/${requestItem.id}/review`, {
                method: "POST",
                body: JSON.stringify({
                    action,
                    review_note: reviewNote || null,
                }),
            });

            if (action === "approve") {
                const extra = response?.email_sent === false ? " (تعذر الإرسال على الإيميل - تم عرض البيانات للأدمن)" : "";
                Toast.fire({ icon: "success", title: `تمت الموافقة وإنشاء الحساب${extra}`, iconColor: "#05ADCF" });
                if (response?.email_sent === false && response?.username && response?.temp_password) {
                    await Swal.fire({
                        icon: "info",
                        title: "تعذر إرسال البريد",
                        html: `<div style="text-align:right">
                                <p>Username: <b>${response.username}</b></p>
                                <p>Temporary Password: <b>${response.temp_password}</b></p>
                               </div>`,
                    });
                }
            } else {
                Toast.fire({ icon: "success", title: "تم رفض الطلب", iconColor: "#05ADCF" });
            }

            await loadAccountRequests(requestStatusFilter);
            await loadPendingRequestsCount();
            await loadUsers();
        } catch (error) {
            Toast.fire({ icon: "error", title: error.message || "فشل تنفيذ المراجعة", iconColor: "#ef4444" });
        } finally {
            setRequestActionLoadingId(null);
        }
    };

    return (
        <div className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <Users size={24} className="text-[#05ADCF]" />
                        {isRTL ? "إدارة المستخدمين" : "User Management"}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={async () => {
                                try {
                                    await exportUsersToPdf(filteredUsers);
                                } catch (error) {
                                    Toast.fire({ icon: "error", title: error.message || "فشل تصدير PDF", iconColor: "#ef4444" });
                                }
                            }}
                            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors">
                            <Download size={16} />
                            تصدير PDF
                        </button>
                        <button onClick={() => setShowImportModal(true)} className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors">
                            <FileUp size={16} />
                            استيراد CSV
                        </button>
                        <button onClick={openRequestsModal} className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors">
                            <Users size={16} />
                            طلبات إنشاء الحساب
                            {pendingRequestsCount > 0 && (
                                <span className="inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-black text-white">
                                    {pendingRequestsCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => {
                                setEditingUserId(null);
                                setForm(initialForm);
                                setShowAddModal(true);
                            }}
                            className="px-4 py-2 rounded-xl bg-[#05ADCF] text-white text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity">
                            <Plus size={16} />
                            إضافة مستخدم
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-5">
                    <div className="relative md:col-span-2">
                        <Search size={16} className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRTL ? "right-3" : "left-3"}`} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={isRTL ? "ابحث باسم المستخدم أو الاسم أو البريد أو الرقم القومي..." : "Search by username, name, email, or national ID..."}
                            className={`w-full rounded-xl border border-slate-200 py-2.5 outline-none focus:border-[#05ADCF] ${isRTL ? "pr-10 pl-3" : "pl-10 pr-3"}`}
                        />
                    </div>
                    <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF] bg-white">
                        <option value="all">كل الأدوار</option>
                        <option value="admin">أدمن</option>
                        <option value="student">طالب</option>
                        <option value="doctor">دكتور</option>
                        <option value="advisor">مرشد أكاديمي</option>
                    </select>
                    <select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF] bg-white">
                        <option value="all">كل الكليات</option>
                        {collegeFilterOptions.map((college) => (
                            <option key={`filter-college-${college.key}`} value={college.key}>
                                {college.label}
                            </option>
                        ))}
                    </select>
                    <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF] bg-white">
                        <option value="all">كل الدُفعات</option>
                        <option value="year 1">السنة الأولى</option>
                        <option value="year 2">السنة الثانية</option>
                        <option value="year 3">السنة الثالثة</option>
                        <option value="year 4">السنة الرابعة</option>
                    </select>
                </div>

                <div ref={tableSwipeRef} className="dot-scroll overflow-x-auto rounded-2xl border border-slate-100 touch-pan-x cursor-grab active:cursor-grabbing" style={{ WebkitOverflowScrolling: "touch" }}>
                    <table className="min-w-[1200px] w-full">
                        <thead className="bg-slate-50">
                            <tr className="text-xs text-slate-600">
                                {["المعرف", "اسم المستخدم", "الاسم", "الدور", "السنة", "كود الطالب", "الكلية", "التخصص", "الرقم القومي", "البريد الجامعي", "النوع", "الجنسية", "محل الميلاد", "الإجراءات"].map((head) => (
                                    <th key={head} className={`px-3 py-3 font-black border-b border-slate-100 ${isRTL ? "text-right" : "text-left"}`}>{head}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={14} className="text-center py-10 text-slate-400 font-bold">جاري التحميل...</td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={14} className="text-center py-10 text-slate-400 font-bold">لا يوجد مستخدمون مطابقون</td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => (
                                    <tr key={user.id} className="text-sm border-b border-slate-100 hover:bg-slate-50/70">
                                        <td className="px-3 py-3">{user.id}</td>
                                        <td className="px-3 py-3 font-bold">{pick(user, ["username"])}</td>
                                        <td className="px-3 py-3">{pick(user, ["full_name", "name"])}</td>
                                        <td className="px-3 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${getRoleBadgeClass(user.role)}`}>
                                                {String(user.role || "").toLowerCase() === "admin"
                                                    ? "Admin"
                                                    : String(user.role || "").toLowerCase() === "doctor"
                                                    ? "Doctor"
                                                    : String(user.role || "").toLowerCase() === "advisor"
                                                    ? "Advisor"
                                                    : String(user.role || "").toLowerCase() === "student"
                                                    ? "Student"
                                                    : String(user.role || "").toLowerCase()}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3">{pick(user, ["level", "year", "academic_year", "academicYear"])}</td>
                                        <td className="px-3 py-3">{pick(user, ["student_code", "studentId", "student_id"])}</td>
                                        <td className="px-3 py-3">{pick(user, ["college"])}</td>
                                        <td className="px-3 py-3">{getSpecializationDisplay(user)}</td>
                                        <td className="px-3 py-3">{pick(user, ["national_id", "nationalId"])}</td>
                                        <td className="px-3 py-3">{pick(user, ["email"])}</td>
                                        <td className="px-3 py-3">{pick(user, ["gender", "Gender"])}</td>
                                        <td className="px-3 py-3">{pick(user, ["nationality", "Nationality"])}</td>
                                        <td className="px-3 py-3">{pick(user, ["birth_place", "birthPlace", "birthplace"])}</td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => openEditModal(user)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-bold hover:bg-cyan-100 transition-colors">
                                                    <Pencil size={13} />
                                                    تعديل
                                                </button>
                                                <button onClick={() => handleDeleteUser(user)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100 transition-colors">
                                                    <Trash2 size={13} />
                                                    حذف
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full transition-colors ${swipeDot === 0 ? "bg-[#05ADCF]" : "bg-slate-300"}`} />
                    <span className={`w-1.5 h-1.5 rounded-full transition-colors ${swipeDot === 1 ? "bg-[#05ADCF]" : "bg-slate-300"}`} />
                </div>
            </div>

            {showRequestsModal && (
                <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0" onClick={() => setShowRequestsModal(false)} />
                    <div className="relative bg-white w-full max-w-6xl rounded-3xl border border-slate-100 shadow-xl p-5 max-h-[85vh] flex flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h3 className="text-lg md:text-xl font-black text-slate-800">طلبات إنشاء الحساب</h3>
                            <div className="flex items-center gap-2">
                                <select
                                    value={requestStatusFilter}
                                    onChange={(e) => handleChangeRequestStatusFilter(e.target.value)}
                                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#05ADCF] bg-white">
                                    <option value="pending">قيد الانتظار</option>
                                    <option value="approved">تمت الموافقة</option>
                                    <option value="rejected">مرفوضة</option>
                                    <option value="all">الكل</option>
                                </select>
                                <button
                                    onClick={() => loadAccountRequests(requestStatusFilter)}
                                    className="h-10 px-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50">
                                    تحديث
                                </button>
                                <button
                                    onClick={() => setShowRequestsModal(false)}
                                    className="h-10 px-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200">
                                    إغلاق
                                </button>
                            </div>
                        </div>

                        <div className="overflow-auto rounded-2xl border border-slate-200">
                            <table className="min-w-[980px] w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr className="text-slate-600">
                                        {["#", "الاسم", "الرقم القومي", "الكلية", "السنة", "البريد", "الحالة", "تاريخ الطلب", "الإجراءات"].map((head) => (
                                            <th key={head} className={`px-3 py-2 font-black border-b border-slate-200 ${isRTL ? "text-right" : "text-left"}`}>{head}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {requestsLoading ? (
                                        <tr>
                                            <td colSpan={9} className="py-10 text-center text-slate-400 font-bold">جاري تحميل الطلبات...</td>
                                        </tr>
                                    ) : accountRequests.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="py-10 text-center text-slate-400 font-bold">لا توجد طلبات</td>
                                        </tr>
                                    ) : (
                                        accountRequests.map((item) => {
                                            const statusValue = String(item?.status || "").toLowerCase();
                                            const isPending = statusValue === "pending";
                                            const statusClass =
                                                statusValue === "approved"
                                                    ? "bg-emerald-50 text-emerald-700"
                                                    : statusValue === "rejected"
                                                    ? "bg-rose-50 text-rose-700"
                                                    : "bg-amber-50 text-amber-700";

                                            return (
                                                <tr key={item.id} className="border-b border-slate-100">
                                                    <td className="px-3 py-2 font-bold">{item.id}</td>
                                                    <td className="px-3 py-2">{item.full_name || "-"}</td>
                                                    <td className="px-3 py-2">{item.national_id || "-"}</td>
                                                    <td className="px-3 py-2">{item.college || "-"}</td>
                                                    <td className="px-3 py-2">{item.level || "-"}</td>
                                                    <td className="px-3 py-2">{item.email || "-"}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-black ${statusClass}`}>
                                                            {statusValue === "approved" ? "تمت الموافقة" : statusValue === "rejected" ? "مرفوض" : "قيد الانتظار"}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">{item.created_at ? new Date(item.created_at).toLocaleString("ar-EG") : "-"}</td>
                                                    <td className="px-3 py-2">
                                                        {isPending ? (
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    disabled={requestActionLoadingId === item.id}
                                                                    onClick={() => handleReviewRequest(item, "approve")}
                                                                    className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black hover:bg-emerald-100 disabled:opacity-60">
                                                                    موافقة
                                                                </button>
                                                                <button
                                                                    disabled={requestActionLoadingId === item.id}
                                                                    onClick={() => handleReviewRequest(item, "reject")}
                                                                    className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-black hover:bg-rose-100 disabled:opacity-60">
                                                                    رفض
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-slate-400 font-bold">تمت المراجعة</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0" onClick={resetImportState} />
                    <div className="relative bg-white w-full max-w-6xl rounded-3xl border border-slate-100 shadow-xl p-5">
                        <h3 className="text-lg font-black text-slate-800 mb-3">استيراد مستخدمين من ملف</h3>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
                            <label className="md:col-span-2 flex h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-2.5 text-xs md:text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-100">
                                <FileUp size={14} />
                                {importFileName ? `تم اختيار: ${importFileName}` : "اختر ملف CSV / XLSX"}
                                <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={handleCsvFileChange} />
                            </label>
                            <select
                                value={importSelectedCollege}
                                onChange={(e) => setImportSelectedCollege(e.target.value)}
                                className="h-11 rounded-xl border border-slate-200 px-2.5 text-sm outline-none focus:border-[#05ADCF] bg-white">
                                <option value="">الكلية الافتراضية (اختياري)</option>
                                {importCollegeOptions.map((collegeName) => (
                                    <option key={`import-college-${collegeName}`} value={collegeName}>
                                        {collegeName}
                                    </option>
                                ))}
                            </select>
                            <input
                                value={importDefaultPassword}
                                onChange={(e) => setImportDefaultPassword(e.target.value)}
                                type="text"
                                placeholder="كلمة مرور افتراضية (اختياري)"
                                className="h-11 rounded-xl border border-slate-200 px-2.5 text-sm outline-none focus:border-[#05ADCF]"
                            />
                            <div className="flex gap-2">
                                <button onClick={handleDownloadXlsxTemplate} className="flex-1 h-11 rounded-xl border border-slate-200 px-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                                    تنزيل XLSX
                                </button>
                                <button onClick={handleDownloadCsvTemplate} className="flex-1 h-11 rounded-xl border border-slate-200 px-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                                    تنزيل CSV
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">إجمالي الصفوف: {importStats.total}</div>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">صالحة: {importStats.valid}</div>
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">غير صالحة: {importStats.invalid}</div>
                        </div>

                        <div className="max-h-[52vh] overflow-auto rounded-2xl border border-slate-200">
                            <table className="min-w-[1300px] w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr className="text-slate-600">
                                        {["#", "الحالة", "اسم المستخدم", "الاسم", "الدور", "كود الطالب", "الكلية", "السنة", "سنة الدخول", "البريد الجامعي", "إيميل الاسترداد", "الأخطاء"].map((head) => (
                                            <th key={head} className={`px-3 py-2 font-black border-b border-slate-200 ${isRTL ? "text-right" : "text-left"}`}>{head}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {importPreviewRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={12} className="py-10 text-center text-slate-400 font-bold">ارفع ملف CSV لعرض المعاينة</td>
                                        </tr>
                                    ) : (
                                        importPreviewRows.map((row) => (
                                            <tr key={row.id} className={`border-b border-slate-100 ${row.valid ? "bg-white" : "bg-rose-50/40"}`}>
                                                <td className="px-3 py-2">{row.line}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-black ${row.valid ? "bg-emerald-50 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                                        {row.valid ? "صالح" : "خطأ"}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 font-semibold">{row.username || "-"}</td>
                                                <td className="px-3 py-2">{row.fullName || "-"}</td>
                                                <td className="px-3 py-2">{row.role}</td>
                                                <td className="px-3 py-2">{row.studentCode || "-"}</td>
                                                <td className="px-3 py-2">{row.college || "-"}</td>
                                                <td className="px-3 py-2">{row.level || "-"}</td>
                                                <td className="px-3 py-2">{row.admissionYear || "-"}</td>
                                                <td className="px-3 py-2">{row.email || "-"}</td>
                                                <td className="px-3 py-2">{row.recoveryEmail || "-"}</td>
                                                <td className="px-3 py-2 text-xs text-rose-700 font-bold">{row.errors.join("، ") || "-"}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={resetImportState} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">إلغاء</button>
                            <button
                                onClick={handleImportUsers}
                                disabled={importing || importStats.valid === 0}
                                className="px-4 py-2 rounded-xl bg-[#05ADCF] text-white font-bold disabled:opacity-60">
                                {importing ? "جاري الاستيراد..." : `استيراد الصفوف الصالحة (${importStats.valid})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0" onClick={resetFormState} />
                    <div className="relative bg-white w-full max-w-4xl rounded-3xl border border-slate-100 shadow-xl p-6">
                        <h3 className="text-xl font-black text-slate-800 mb-4">{editingUserId ? "تعديل المستخدم" : "إضافة مستخدم جديد"}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-1">
                            <div className="w-full rounded-xl border border-slate-200 bg-white pl-2 pr-2.5 py-1.5 flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="اسم المستخدم (رقمي)"
                                    value={form.username}
                                    onChange={(e) => setForm((prev) => ({ ...prev, username: sanitizeNumericUsername(e.target.value) }))}
                                    disabled={Boolean(editingUserId)}
                                    className="flex-1 min-w-0 bg-transparent outline-none disabled:bg-slate-100 rounded-lg px-1.5 py-1.5"
                                />
                                {!editingUserId && (
                                    <button
                                        type="button"
                                        onClick={handleGenerateUsername}
                                        className="shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5"
                                    >
                                        توليد
                                    </button>
                                )}
                            </div>
                            <div className="w-full rounded-xl border border-slate-200 bg-white pl-2 pr-2.5 py-1.5 flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder={editingUserId ? "كلمة المرور (اختياري)" : "كلمة المرور"}
                                    value={form.password}
                                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                                    className="flex-1 min-w-0 bg-transparent outline-none rounded-lg px-1.5 py-1.5"
                                />
                                <button
                                    type="button"
                                    onClick={handleGeneratePassword}
                                    className="shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5"
                                >
                                    توليد
                                </button>
                            </div>
                            {[
                                ["name", "الاسم"],
                                ["nationalId", "الرقم القومي"],
                                ["nationality", "الجنسية"],
                                ["gender", "النوع"],
                                ["birthPlace", "محل الميلاد"],
                            ].map(([key, label]) => (
                                <input
                                    key={key}
                                    type={key === "password" ? "password" : "text"}
                                    placeholder={label}
                                    value={form[key]}
                                    onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF] disabled:bg-slate-100"
                                />
                            ))}
                            <input
                                type="text"
                                placeholder="البريد الجامعي (تلقائي)"
                                value={form.email}
                                readOnly
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none bg-slate-50 text-slate-600"
                            />
                            <input
                                type="email"
                                placeholder="إيميل الاسترداد"
                                value={form.recoveryEmail}
                                onChange={(e) => setForm((prev) => ({ ...prev, recoveryEmail: e.target.value }))}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF]"
                            />
                            {isStudentRole && (
                                <div className="w-full rounded-xl border border-slate-200 bg-white pl-2 pr-2.5 py-1.5 flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="كود الطالب"
                                        value={form.studentId}
                                        onChange={(e) => setForm((prev) => ({ ...prev, studentId: e.target.value }))}
                                        className="flex-1 min-w-0 bg-transparent outline-none rounded-lg px-1.5 py-1.5"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleGenerateStudentCode}
                                        className="shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5"
                                    >
                                        توليد
                                    </button>
                                </div>
                            )}
                            {isStudentRole && (
                                <select
                                    value={form.admissionYear}
                                    onChange={(e) => setForm((prev) => ({ ...prev, admissionYear: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF] bg-white">
                                    <option value="">سنة الدخول</option>
                                    {admissionYearOptions.map((year) => (
                                        <option key={`admission-${year.id}`} value={year.id}>
                                            {year.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {isStudentRole && (
                                <div className="space-y-1">
                                    <select
                                        value={form.level}
                                        onChange={(e) => setForm((prev) => ({ ...prev, level: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF] bg-white">
                                        <option value="">اختر السنة *</option>
                                        {yearSelectOptions.map((year) => (
                                            <option key={`user-year-${year.id}`} value={year.id || year.name || ""}>
                                                {formatArabicYearLabel(year.name || year.id)}
                                            </option>
                                        ))}
                                    </select>
                                    {branchingHintText && (
                                        <p className={`text-xs font-bold ${shouldShowMajorForStudent ? "text-emerald-700" : "text-amber-700"}`}>
                                            {branchingHintText}
                                        </p>
                                    )}
                                </div>
                            )}
                            {needsCollegeMajor && (
                                <select
                                    value={form.college}
                                    onChange={(e) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            college: e.target.value,
                                            level: "",
                                            major: "",
                                        }))
                                    }
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF] bg-white">
                                    <option value="">الكلية</option>
                                    {collegeOptions.map((college) => (
                                        <option key={`user-college-${college.id || college.name}`} value={college.name || college.id || ""}>
                                            {college.name || college.id}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {isStudentRole && selectedYearDigit > 0 && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600">
                                    التخصص النهائي للطالب لا يتم تحديده من هذه الشاشة. يتم اعتماده من لوحة التنسيق الداخلي بعد مراجعة رغبات الطالب.
                                </div>
                            )}
                            {shouldRenderMajorField && (
                                <div className="space-y-1">
                                    <select
                                        value={doctorMajorSelectValue}
                                        onChange={(e) => setForm((prev) => ({ ...prev, major: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF] bg-white"
                                    >
                                        <option value="">اختر التخصص</option>
                                        {majorOptions.map((major) => (
                                            <option key={`user-major-${major}`} value={major}>{major}</option>
                                        ))}
                                    </select>
                                    {majorOptions.length > 0 && (
                                        <p className="text-xs font-bold text-slate-500">
                                            الأقسام المتاحة للكلية تظهر بالكامل في القائمة.
                                        </p>
                                    )}
                                    {majorOptions.length === 0 && (
                                        <p className="text-xs font-bold text-rose-700">
                                            لا توجد تخصصات مضافة لهذه الكلية. أضفها من إدارة المقررات.
                                        </p>
                                    )}
                                </div>
                            )}
                            <select value={form.role} onChange={(e) => handleRoleChange(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[#05ADCF] bg-white">
                                <option value="student">طالب</option>
                                <option value="admin">أدمن</option>
                                <option value="doctor">دكتور</option>
                                <option value="advisor">مرشد أكاديمي</option>
                            </select>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={resetFormState} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">إلغاء</button>
                            <button onClick={editingUserId ? handleUpdateUser : handleAddUser} disabled={saving} className="px-4 py-2 rounded-xl bg-[#05ADCF] text-white font-bold disabled:opacity-60">
                                {saving ? "جاري الحفظ..." : editingUserId ? "حفظ التعديلات" : "حفظ المستخدم"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


