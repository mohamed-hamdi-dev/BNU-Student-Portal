const COLLEGE_ALIASES = {
  cs: ["علوم الحاسب", "حاسبات", "حاسبات ومعلومات", "computer science", "cs"],
  eng: ["الهندسة", "engineering", "eng"],
  bus: ["ادارة الاعمال", "إدارة الأعمال", "business", "business administration", "bus"],
  med: ["الطب", "medicine", "med"],
  den: ["طب الاسنان", "طب الأسنان", "dentistry", "dental", "den"],
  phr: ["الصيدلة", "pharmacy", "phr"],
};

const normalizeTextKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "");

const compactTextKey = (value) => normalizeTextKey(value).replace(/\s+/g, "");

const normalizeCollegeAliasSet = (rawValue) => {
  const normalized = normalizeTextKey(rawValue);
  const compact = compactTextKey(rawValue);
  const keys = new Set([normalized, compact].filter(Boolean));

  const directCode = compact.toLowerCase();
  if (COLLEGE_ALIASES[directCode]) {
    COLLEGE_ALIASES[directCode].forEach((item) => {
      keys.add(normalizeTextKey(item));
      keys.add(compactTextKey(item));
    });
  }

  Object.entries(COLLEGE_ALIASES).forEach(([code, labels]) => {
    const normalizedLabels = labels.map((item) => normalizeTextKey(item));
    const compactLabels = labels.map((item) => compactTextKey(item));
    if (normalizedLabels.includes(normalized) || compactLabels.includes(compact)) {
      keys.add(code);
      labels.forEach((item) => {
        keys.add(normalizeTextKey(item));
        keys.add(compactTextKey(item));
      });
    }
  });

  return keys;
};

const collectCollegeKeys = (...values) => {
  const keys = new Set();
  values.forEach((value) => {
    normalizeCollegeAliasSet(value).forEach((item) => keys.add(item));
  });
  return keys;
};

const getStudentCollegeKeys = (student = {}) =>
  collectCollegeKeys(student.collegeId, student.college_id, student.college, student.faculty, student.program);

const resolveCollegePolicyForStudent = (student, collegePolicies = {}) => {
  if (!collegePolicies || typeof collegePolicies !== "object") return null;
  const studentKeys = getStudentCollegeKeys(student || {});
  if (!studentKeys.size) return null;

  const policyMap = {};
  Object.entries(collegePolicies).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    normalizeCollegeAliasSet(key).forEach((k) => {
      policyMap[k] = value;
    });
  });

  for (const key of studentKeys) {
    if (policyMap[key]) return policyMap[key];
  }
  return null;
};

export { resolveCollegePolicyForStudent };
