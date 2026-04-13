const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toText = (value) => (value === undefined || value === null ? "" : String(value).trim());

const pickGroupList = (course = {}) => {
    const candidates = [
        course.groups,
        course.sections,
        course.sectionGroups,
        course.groupOptions,
        course.group_options,
        course.labs,
        course.labSections,
        course.tutorials,
    ];
    const found = candidates.find((entry) => Array.isArray(entry));
    return Array.isArray(found) ? found : [];
};

const normalizeGroupItem = (group = {}, index = 0) => {
    const day = toText(group.day ?? group.weekday ?? group.dayName ?? group.day_name ?? group.sessionDay);
    const time = toText(group.time ?? group.timeRange ?? group.time_range ?? group.sessionTime ?? group.slot);
    const hall = toText(group.hall ?? group.room ?? group.location ?? group.lab ?? group.classroom);
    const capacity = Number(group.capacity ?? group.seats ?? group.maxSeats ?? group.max_seats ?? 0);
    const enrolled = Number(group.enrolled ?? group.reserved ?? group.registered ?? 0);
    const fullFlag = Boolean(group.full ?? group.isFull ?? group.closed);
    const computedFull = Number.isFinite(capacity) && capacity > 0 ? enrolled >= capacity : false;

    return {
        ...group,
        id: String(group.id ?? group.groupId ?? group.group_id ?? group.code ?? `group-${index + 1}`),
        name: toText(group.name ?? group.title ?? group.label ?? group.sectionName ?? group.section_name ?? `سكشن ${index + 1}`),
        day,
        time,
        hall,
        capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 0,
        full: fullFlag || computedFull,
    };
};

const semesterAliases = {
    autumn: "autumn",
    fall: "autumn",
    "term 1": "autumn",
    "semester 1": "autumn",
    spring: "spring",
    "term 2": "spring",
    "semester 2": "spring",
    summer: "summer",
    "term 3": "summer",
    "semester 3": "summer",
    "الأول": "autumn",
    "الاول": "autumn",
    "الخريف": "autumn",
    "الثاني": "spring",
    "الربيع": "spring",
    "الصيف": "summer",
    "الصيفي": "summer",
};

export const gradeToPoints = (grade) => {
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

    if (!grade) return 0;
    const normalizedGrade = String(grade).toUpperCase().trim();
    return pointsMap[normalizedGrade] ?? 0;
};

export const normalizeSemesterValue = (value, fallback = "autumn") => {
    if (value === undefined || value === null || value === "") return fallback;
    const raw = String(value).trim();
    if (!raw) return fallback;
    const lower = raw.toLowerCase();
    return semesterAliases[lower] ?? semesterAliases[raw] ?? lower;
};

export const normalizeCourse = (course = {}) => {
    const hours = toNumber(course.hours ?? course.credits, 0);
    const yearWork = toNumber(course.yearWork ?? course.ywork, 0);
    const normalizedGroups = pickGroupList(course).map((group, index) => normalizeGroupItem(group, index));

    return {
        ...course,
        id: String(course.id ?? course.code ?? ""),
        code: String(course.code ?? course.id ?? ""),
        name: course.name ?? course.courseName ?? "",
        year: String(course.year ?? ""),
        hours,
        credits: toNumber(course.credits ?? course.hours, hours),
        ywork: yearWork,
        yearWork,
        mid1: toNumber(course.mid1, 0),
        mid2: toNumber(course.mid2, 0),
        final: toNumber(course.final, 0),
        grade: course.grade ?? "",
        semester: normalizeSemesterValue(course.semester ?? "", ""),
        lecture: course.lecture ?? { day: "", time: "", hall: "" },
        groups: normalizedGroups,
        selectedGroup: course.selectedGroup ?? null,
        trackId: course.trackId ?? course.track_id ?? "",
        trackName: course.trackName ?? course.track_name ?? course.track ?? "",
        prereq: course.prereq ?? "",
        category: course.category ?? "",
        status: course.status ?? "available",
    };
};

export const normalizeAcademicRecord = (record = {}) => {
    const normalized = normalizeCourse(record);
    return {
        ...normalized,
        studentId: String(record.studentId ?? ""),
        studentName: record.studentName ?? "",
        academicYear: record.academicYear ?? "",
        semesterName: record.semesterName ?? "",
        status: record.status ?? normalized.status ?? "pending_advisor",
    };
};

export const calculateSemesterGpa = (courses = []) => {
    if (!Array.isArray(courses) || courses.length === 0) return 0;

    let totalPoints = 0;
    let totalCredits = 0;
    const validGrades = new Set(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"]);

    courses.forEach((course) => {
        const normalized = normalizeCourse(course);
        const grade = String(normalized.grade || "").toUpperCase().trim();
        const credits = Number(normalized.credits || 0);
        if (!validGrades.has(grade)) return;
        if (!Number.isFinite(credits) || credits <= 0) return;
        totalPoints += gradeToPoints(grade) * credits;
        totalCredits += credits;
    });

    return totalCredits > 0 ? totalPoints / totalCredits : 0;
};

export const calculateTotalScore = (course = {}) => {
    const normalized = normalizeCourse(course);
    return normalized.mid1 + normalized.mid2 + normalized.yearWork + normalized.final;
};

export const getCurrentAcademicYear = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const ARABIC_INDIC_DIGITS = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
};

const YEAR_WORD_ALIASES = {
    first: "1",
    second: "2",
    third: "3",
    fourth: "4",
    "level 1": "1",
    "level 2": "2",
    "level 3": "3",
    "level 4": "4",
    "الاول": "1",
    "الأول": "1",
    "الأولى": "1",
    "الاولي": "1",
    "الثاني": "2",
    "الثانية": "2",
    "الثالث": "3",
    "الثالثة": "3",
    "الرابع": "4",
    "الرابعة": "4",
};

export const normalizeAcademicYearValue = (value, fallback = "1") => {
    if (value === undefined || value === null || value === "") return String(fallback);
    const raw = String(value).trim();
    if (!raw) return String(fallback);

    const normalizedDigits = raw
        .normalize("NFKC")
        .split("")
        .map((char) => ARABIC_INDIC_DIGITS[char] ?? char)
        .join("");

    const lowered = normalizedDigits.toLowerCase();
    for (const [label, year] of Object.entries(YEAR_WORD_ALIASES)) {
        if (lowered.includes(label)) return year;
    }

    const direct = normalizedDigits.match(/^\d+$/);
    if (direct) return direct[0];

    const firstNumber = normalizedDigits.match(/\d+/);
    if (firstNumber) return firstNumber[0];

    return String(fallback);
};

