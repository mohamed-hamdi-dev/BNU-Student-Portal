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

const normalizeKey = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي");

const yearSort = (a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b), "ar");
};

const toArabicCollegeLabel = (raw) => {
    const value = String(raw || "").trim();
    const n = normalizeKey(value);
    if (!n) return "";
    if (n.includes("computer") || n === "cs" || n.includes("حاسب")) return "علوم الحاسب";
    if (n.includes("engineer") || n === "eng" || n.includes("هندس")) return "الهندسة";
    if (n.includes("business") || n.includes("اداره") || n.includes("إدارة")) return "إدارة الأعمال";
    if (n.includes("medic") || n === "med" || n.includes("الطب")) return "الطب";
    if (n.includes("pharm") || n === "phr" || n.includes("صيدل")) return "الصيدلة";
    if (n.includes("dent") || n === "den" || n.includes("اسنان")) return "طب الأسنان";
    return value;
};

const getCollegeAliasTokens = (raw) => {
    const n = normalizeKey(raw);
    if (!n) return [];
    if (n.includes("computer") || n === "cs" || n.includes("حاسب")) return ["cs", "computer", "علوم الحاسب", "حاسب"];
    if (n.includes("engineer") || n === "eng" || n.includes("هندس")) return ["eng", "engineering", "الهندسة"];
    if (n.includes("business") || n.includes("اداره") || n.includes("إدارة")) return ["bus", "business", "إدارة الأعمال"];
    if (n.includes("medic") || n === "med" || n.includes("الطب")) return ["med", "medicine", "الطب"];
    if (n.includes("pharm") || n === "phr" || n.includes("صيدل")) return ["phr", "pharmacy", "الصيدلة"];
    if (n.includes("dent") || n === "den" || n.includes("اسنان")) return ["den", "dentistry", "طب الأسنان"];
    return [n];
};

const inferCollegeDefaultTotalYears = (collegeName) => {
    const n = normalizeKey(collegeName);
    if (!n) return 0;
    if (n.includes("computer") || n === "cs" || n.includes("حاسب")) return 4;
    if (n.includes("engineer") || n === "eng" || n.includes("هندس")) return 5;
    return 0;
};

const buildSequentialYearIds = (totalYears, years = []) => {
    const safeTotal = Math.max(1, Math.min(MAX_COLLEGE_YEARS, Number(totalYears) || 1));
    const ids = [];
    for (let i = 1; i <= safeTotal; i += 1) ids.push(String(i));
    (Array.isArray(years) ? years : [])
        .map((item) => String(item?.id || "").trim())
        .filter(Boolean)
        .forEach((id) => {
            if (!ids.includes(id) && ids.length < safeTotal) ids.push(id);
        });
    return ids.slice(0, safeTotal).sort(yearSort);
};

const resolveYearName = (raw, yearsMap) => {
    const value = String(raw || "").trim();
    if (!value) return "";
    const direct = yearsMap.get(value) || yearsMap.get(normalizeKey(value));
    if (direct) return direct;
    const digits = value.match(/\d+/)?.[0] || "";
    if (digits && ARABIC_YEAR_LABELS[digits]) return ARABIC_YEAR_LABELS[digits];
    return value.replace("الفرقة", "السنة");
};

export const getLocalAccountRequestSource = () => ({
    colleges: [],
    years: [],
    settings: {},
});

export const getAccountRequestCollegesFromSource = (source = {}) => {
    const stored = Array.isArray(source?.colleges) ? source.colleges : [];
    const values = stored.map((item) => String(item?.name || item?.id || "").trim()).filter(Boolean);
    return [...new Set(values.map(toArabicCollegeLabel).filter(Boolean))];
};

export const getAccountRequestLevelsByCollegeFromSource = (source = {}, selectedCollege = "") => {
    const years = Array.isArray(source?.years) ? source.years : [];
    const settings = source?.settings && typeof source.settings === "object" ? source.settings : {};
    const policies = settings?.collegePolicies && typeof settings.collegePolicies === "object" ? settings.collegePolicies : {};

    const yearsMap = new Map();
    years.forEach((year) => {
        const id = String(year?.id || "").trim();
        const name = String(year?.name || "").trim();
        if (!id && !name) return;
        if (id) {
            yearsMap.set(id, name || resolveYearName(id, new Map()));
            yearsMap.set(normalizeKey(id), name || resolveYearName(id, new Map()));
        }
        if (name) yearsMap.set(normalizeKey(name), name);
    });

    const allYears = years
        .map((y) => {
            const id = String(y?.id || "").trim();
            const name = resolveYearName(String(y?.name || y?.id || "").trim(), yearsMap);
            return { id: id || name, name };
        })
        .filter((y) => y.name);

    if (!selectedCollege) return allYears;

    const selectedKey = normalizeKey(selectedCollege);
    const selectedTokens = getCollegeAliasTokens(selectedCollege).map((t) => normalizeKey(t));
    let matchedPolicy = null;
    for (const [policyKey, policyValue] of Object.entries(policies)) {
        const policyNormalized = normalizeKey(policyKey);
        if (policyNormalized === selectedKey || selectedTokens.some((token) => token && (policyNormalized.includes(token) || token.includes(policyNormalized)))) {
            matchedPolicy = policyValue;
            break;
        }
    }

    const policyYearIds = Array.isArray(matchedPolicy?.yearIds)
        ? matchedPolicy.yearIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [];
    const policyTotalYears = Number(matchedPolicy?.totalYears || 0);
    const defaultTotalYears = inferCollegeDefaultTotalYears(selectedCollege);
    const maxFromPolicyTotal =
        Number.isFinite(policyTotalYears) && policyTotalYears > 0
            ? Math.max(1, Math.min(MAX_COLLEGE_YEARS, policyTotalYears))
            : 0;
    const maxFromDefaults =
        Number.isFinite(defaultTotalYears) && defaultTotalYears > 0
            ? Math.max(1, Math.min(MAX_COLLEGE_YEARS, defaultTotalYears))
            : 0;
    const effectiveCap = maxFromPolicyTotal || maxFromDefaults;

    const targetYearIds =
        policyYearIds.length > 0
            ? policyYearIds
                  .sort(yearSort)
                  .slice(0, effectiveCap || undefined)
            : policyTotalYears > 0
              ? buildSequentialYearIds(policyTotalYears, years)
              : defaultTotalYears > 0
                ? buildSequentialYearIds(defaultTotalYears, years)
                : [];

    if (targetYearIds.length === 0) return allYears;

    const scopedYears = targetYearIds
        .map((id) => ({ id, name: resolveYearName(id, yearsMap) }))
        .filter((y) => y.name);

    return scopedYears.length > 0 ? scopedYears : allYears;
};

export const getAccountRequestColleges = () => getAccountRequestCollegesFromSource(getLocalAccountRequestSource());
export const getAccountRequestLevelsByCollege = (selectedCollege) => getAccountRequestLevelsByCollegeFromSource(getLocalAccountRequestSource(), selectedCollege);
