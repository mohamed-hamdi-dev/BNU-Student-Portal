import React, { useMemo, useState, useEffect, useCallback } from "react";
import { BookOpen, Users, ClipboardList, PlusCircle, CheckCircle, Trash2, Calendar, Clock, ChevronLeft, Filter, ImagePlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createQuiz, deleteQuiz, listQuizzesScoped, queryQuizSubmissions, updateQuiz } from "../../services/quizApi";
import { fetchCollegesState } from "../../services/academicApi";

const StatCard = ({ label, value, icon }) => (
  <div className="group rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_6px_24px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.1)] md:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold tracking-wide text-slate-500 md:text-xs">{label}</p>
        <p className="mt-2 text-3xl font-black leading-none text-slate-900 md:text-4xl">{value}</p>
      </div>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors duration-200 group-hover:bg-slate-100 md:h-12 md:w-12">
        {icon}
      </div>
    </div>
  </div>
);

const initialFilters = {
  scope: "current",
  status: "all",
  courseCode: "",
  term: "",
  academicYear: "",
  section: "",
  studentQuery: "",
  page: 1,
  pageSize: 25,
  sortBy: "submittedAt",
  sortDir: "desc",
};

const emptyForm = {
  id: null,
  title: "",
  duration: 15,
  courseCode: "",
  academicYear: "",
  term: "autumn",
  section: "",
  collegeId: "",
  visibility: "college",
  startTime: "",
  endTime: "",
  questions: [],
};

const normalizeTextKey = (value) => String(value ?? "").trim().toLowerCase();
const getUserCollegeKey = (user = {}) => normalizeTextKey(user.collegeId ?? user.college_id ?? user.college ?? user.faculty ?? user.major ?? user.program ?? "");
const normalizeArabic = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "");
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
const toAcademicYearLabel = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/\d+/)?.[0] || "";
  if (digits && ARABIC_YEAR_LABELS[digits]) return ARABIC_YEAR_LABELS[digits];
  return raw.replace("الفرقة", "السنة");
};
const extractYearDigits = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .match(/\d+/)?.[0] || "";

const COLLEGE_CODE_BY_ALIAS = {
  cs: ["cs", "computer science", "علوم الحاسب", "حاسبات", "حاسبات ومعلومات"],
  eng: ["eng", "engineering", "الهندسه", "الهندسة"],
  den: ["den", "dentistry", "dental", "طب الاسنان", "طب الأسنان"],
  med: ["med", "medicine", "الطب"],
  phr: ["phr", "pharmacy", "الصيدله", "الصيدلة"],
  bus: ["bus", "business", "business administration", "اداره الاعمال", "إدارة الأعمال"],
};

const resolveCollegeCode = (value) => {
  const key = normalizeArabic(value);
  if (!key) return "";
  for (const [code, aliases] of Object.entries(COLLEGE_CODE_BY_ALIAS)) {
    if (aliases.some((item) => normalizeArabic(item) === key)) return code;
  }
  return "";
};
const getCollegeMatchKey = (value) => {
  const code = resolveCollegeCode(value);
  if (code) return code;
  return normalizeArabic(value);
};
const normalizeTermKey = (value) => {
  const key = normalizeArabic(value);
  if (!key) return "";
  if (key.includes("autumn") || key.includes("fall") || key.includes("الخريف")) return "autumn";
  if (key.includes("spring") || key.includes("الربيع")) return "spring";
  if (key.includes("summer") || key.includes("الصيف")) return "summer";
  return key;
};
const toArabicTermLabel = (value) => {
  const normalized = normalizeTermKey(value);
  if (normalized === "autumn") return "الخريف";
  if (normalized === "spring") return "الربيع";
  if (normalized === "summer") return "الصيف";
  return String(value || "-");
};

const formatCollegeLabel = (rawValue) => {
  const code = resolveCollegeCode(rawValue);
  const clean = String(rawValue || "").trim();
  if (!clean) return "";
  if (code) {
    const nameByCode = {
      cs: "علوم الحاسب",
      eng: "الهندسة",
      den: "طب الأسنان",
      med: "الطب",
      phr: "الصيدلة",
      bus: "إدارة الأعمال",
    };
    return `${nameByCode[code] || clean} (${code.toUpperCase()})`;
  }
  return clean;
};
const isAdminUser = (user = {}) => {
  const role = normalizeTextKey(user.role ?? user.userRole ?? user.type ?? "");
  return role === "admin";
};

const safeJsonParse = (raw, fallback) => {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const normalizeQuestion = (item = {}) => {
  const options = Array.isArray(item?.options) ? item.options.map((opt) => String(opt ?? "")) : ["", "", "", ""];
  const imageUrl = String(item?.imageUrl ?? item?.image_url ?? "").trim();
  return {
    question: String(item?.question ?? "").trim(),
    options: options.length === 4 ? options : [...options, "", "", "", ""].slice(0, 4),
    correct: Number(item?.correct ?? 0) || 0,
    imageUrl,
  };
};

const AdminAddQuiz = ({ onSave, onCancel, initialQuiz, adminCollegeId, isSuperAdmin, openCourseOptions, academicYearOptions, managedColleges = [] }) => {
  const [form, setForm] = useState(emptyForm);
  const [q, setQ] = useState({ question: "", options: ["", "", "", ""], correct: 0, imageUrl: "" });
  const [saving, setSaving] = useState(false);
  const collegeOptions = useMemo(() => {
    const optionsMap = new Map();

    const pushOption = (rawId, rawName) => {
      const id = String(rawId || "").trim().toUpperCase();
      const name = String(rawName || "").trim();
      const labelBase = name || id;
      if (!labelBase) return;
      const canonicalCode = resolveCollegeCode(id) || resolveCollegeCode(name);
      const key = canonicalCode || normalizeArabic(labelBase);
      if (!key) return;
      const readableName = name
        ? (canonicalCode ? formatCollegeLabel(name).replace(/\s*\([A-Z]{2,4}\)\s*$/, "") : name)
        : formatCollegeLabel(id).replace(/\s*\([A-Z]{2,4}\)\s*$/, "") || id;
      const normalizedName = normalizeArabic(readableName);
      const normalizedId = normalizeArabic(id);
      const label = canonicalCode
        ? `${readableName} (${canonicalCode.toUpperCase()})`
        : (normalizedName && normalizedName === normalizedId ? readableName : formatCollegeLabel(labelBase));
      optionsMap.set(key, {
        value: id || labelBase,
        label,
      });
    };

    (Array.isArray(managedColleges) ? managedColleges : []).forEach((item) => {
      pushOption(item?.id, item?.name);
    });

    if (adminCollegeId) pushOption(adminCollegeId, adminCollegeId);
    if (form.collegeId) pushOption(form.collegeId, form.collegeId);

    return Array.from(optionsMap.values());
  }, [adminCollegeId, form.collegeId, managedColleges]);

  const scopedAcademicYearOptions = useMemo(() => {
    const all = Array.isArray(academicYearOptions) ? academicYearOptions : [];
    const selectedCollegeRaw = String(form.collegeId || adminCollegeId || "").trim();
    const isGlobalVisibility = String(form.visibility || "college").toLowerCase() === "global";
    if (!selectedCollegeRaw || isGlobalVisibility) return all;

    const settings = safeJsonParse(localStorage.getItem("system.registrationSettings") || "{}", {});
    const policies = settings?.collegePolicies && typeof settings.collegePolicies === "object" ? settings.collegePolicies : {};
    const collegeKeyCandidates = [
      normalizeTextKey(selectedCollegeRaw),
      normalizeTextKey(resolveCollegeCode(selectedCollegeRaw)),
      normalizeArabic(selectedCollegeRaw),
      normalizeArabic(resolveCollegeCode(selectedCollegeRaw)),
    ].filter(Boolean);

    let policy = null;
    for (const candidate of collegeKeyCandidates) {
      if (policies[candidate] && typeof policies[candidate] === "object") {
        policy = policies[candidate];
        break;
      }
    }
    if (!policy) return all;

    const allowed = new Set();
    if (Array.isArray(policy?.yearIds) && policy.yearIds.length > 0) {
      policy.yearIds.forEach((id) => {
        const y = String(id || "").trim();
        if (y) allowed.add(y);
      });
    } else {
      const total = Number(policy?.totalYears || 0);
      if (Number.isFinite(total) && total > 0) {
        for (let i = 1; i <= total; i += 1) allowed.add(String(i));
      }
    }

    if (allowed.size === 0) return all;
    const filtered = all.filter((item) => {
      const value = String(item?.value || "").trim();
      const digits = value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/\d+/)?.[0] || "";
      return digits ? allowed.has(String(Number(digits))) || allowed.has(digits) : allowed.has(value);
    });
    return filtered.length > 0 ? filtered : all;
  }, [academicYearOptions, adminCollegeId, form.collegeId, form.visibility]);

  const scopedOpenCourseOptions = useMemo(() => {
    const all = Array.isArray(openCourseOptions) ? openCourseOptions : [];
    if (all.length === 0) return [];

    const selectedYearDigits = extractYearDigits(form.academicYear);
    const selectedCollege = getCollegeMatchKey(form.collegeId || adminCollegeId || "");
    const selectedTerm = normalizeTermKey(form.term);
    const isGlobalVisibility = String(form.visibility || "college").toLowerCase() === "global";

    return all.filter((course) => {
      const courseYearDigits = extractYearDigits(course?.year || course?.studyYear || course?.academicYear);
      const matchesYear = !selectedYearDigits || !courseYearDigits || courseYearDigits === selectedYearDigits;
      if (!matchesYear) return false;

      const courseTerm = normalizeTermKey(course?.semester || course?.term || course?.semesterLabel);
      const matchesTerm = !selectedTerm || !courseTerm || courseTerm === selectedTerm;
      if (!matchesTerm) return false;

      if (isGlobalVisibility) return true;
      const courseCollege = getCollegeMatchKey(course?.collegeId || course?.college_id || course?.college || "");
      const matchesCollege = !selectedCollege || !courseCollege || courseCollege === selectedCollege;
      return matchesCollege;
    });
  }, [adminCollegeId, form.academicYear, form.collegeId, form.term, form.visibility, openCourseOptions]);

  useEffect(() => {
    if (!initialQuiz) {
      setForm({ ...emptyForm, collegeId: adminCollegeId || "", visibility: "college" });
      return;
    }
    setForm({
      id: initialQuiz.id,
      title: initialQuiz.title || "",
      duration: initialQuiz.duration || 15,
      courseCode: initialQuiz.courseCode || "",
      academicYear: initialQuiz.academicYear || "",
      term: initialQuiz.term || "autumn",
      section: initialQuiz.section || "",
      collegeId: initialQuiz.collegeId || adminCollegeId || "",
      visibility: initialQuiz.visibility || "college",
      startTime: initialQuiz.startTime ? new Date(initialQuiz.startTime).toISOString().slice(0, 16) : "",
      endTime: initialQuiz.endTime ? new Date(initialQuiz.endTime).toISOString().slice(0, 16) : "",
      questions: Array.isArray(initialQuiz.questions) ? initialQuiz.questions.map((item) => normalizeQuestion(item)) : [],
    });
  }, [adminCollegeId, initialQuiz, isSuperAdmin]);

  useEffect(() => {
    const allowed = new Set((scopedAcademicYearOptions || []).map((item) => String(item?.value || "").trim()).filter(Boolean));
    const current = String(form.academicYear || "").trim();
    if (!current || allowed.size === 0) return;
    if (!allowed.has(current)) {
      setForm((prev) => ({ ...prev, academicYear: "" }));
    }
  }, [form.academicYear, scopedAcademicYearOptions]);

  useEffect(() => {
    const current = String(form.courseCode || "").trim();
    if (!current) return;
    const allowed = new Set((scopedOpenCourseOptions || []).map((item) => String(item?.code || "").trim()).filter(Boolean));
    if (allowed.size > 0 && !allowed.has(current)) {
      setForm((prev) => ({ ...prev, courseCode: "" }));
    }
  }, [form.courseCode, scopedOpenCourseOptions]);

  const addQuestion = () => {
    if (!q.question && !q.imageUrl) return;
    const nextQuestion = normalizeQuestion({
      ...q,
      options: Array.isArray(q.options) ? [...q.options] : ["", "", "", ""],
    });
    setForm((prev) => ({ ...prev, questions: [...prev.questions, nextQuestion] }));
    setQ({ question: "", options: ["", "", "", ""], correct: 0, imageUrl: "" });
  };

  const handleQuestionImageFile = (file) => {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      alert("يرجى اختيار ملف صورة فقط");
      return;
    }
    const maxSizeMb = 2;
    if (Number(file.size || 0) > maxSizeMb * 1024 * 1024) {
      alert("حجم الصورة كبير، الحد الأقصى 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      setQ((prev) => ({ ...prev, imageUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const saveQuizRequest = async () => {
    if (!form.title.trim()) return;
    try {
      setSaving(true);
      if (!isSuperAdmin && !adminCollegeId) {
        alert("لا يمكن حفظ الاختبار لأن حسابك غير مرتبط بكلية");
        return;
      }
      const effectiveVisibility = isSuperAdmin ? (form.visibility || "college") : "college";
      const effectiveCollegeId = effectiveVisibility === "global" ? null : (form.collegeId || adminCollegeId || null);
      if (effectiveVisibility === "college" && !String(effectiveCollegeId || "").trim()) {
        alert("يرجى اختيار الكلية قبل حفظ الاختبار داخل الكلية");
        return;
      }
      const payload = {
        title: form.title,
        duration: Number(form.duration || 15),
        courseCode: form.courseCode || null,
        academicYear: form.academicYear || null,
        term: form.term || null,
        section: form.section || null,
        collegeId: effectiveCollegeId,
        visibility: effectiveVisibility,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        questions: (Array.isArray(form.questions) ? form.questions : []).map((item) => {
          const normalized = normalizeQuestion(item);
          return {
            question: normalized.question,
            options: normalized.options,
            correct: normalized.correct,
            imageUrl: normalized.imageUrl || null,
          };
        }),
      };
      if (form.id) {
        await updateQuiz(form.id, payload);
      } else {
        await createQuiz(payload);
      }
      onSave();
    } catch (error) {
      alert(error.message || "تعذر حفظ الاختبار");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-right" dir="rtl">
      <div className="space-y-8 rounded-[24px] border border-slate-100 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-50 pb-4">
          <h2 className="text-2xl font-black text-slate-800">{form.id ? "تعديل الاختبار" : "انشاء اختبار جديد"}</h2>
          <div className="rounded-2xl bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-700">الاسئلة الحالية: {form.questions.length}</div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-black text-slate-500">اسم الاختبار</label>
            <input type="text" className="w-full rounded-2xl bg-slate-50 p-4 outline-none" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-black text-slate-500">كود المادة</label>
            <select
              className="w-full rounded-2xl bg-slate-50 p-4 outline-none"
              value={form.courseCode}
              onChange={(e) => {
                const nextCode = e.target.value;
                const picked = (scopedOpenCourseOptions || []).find((item) => String(item.code || "") === String(nextCode || ""));
                setForm((prev) => ({
                  ...prev,
                  courseCode: nextCode,
                  title: prev.title?.trim() ? prev.title : (picked?.name || prev.title),
                  term: picked?.semester || prev.term || "autumn",
                  collegeId:
                    String(prev.visibility || "college").toLowerCase() === "college"
                      ? (prev.collegeId || picked?.collegeId || prev.collegeId)
                      : prev.collegeId,
                }));
              }}
            >
              <option value="">اختر مادة مفتوحة</option>
              {(scopedOpenCourseOptions || []).map((course) => (
                <option key={`open-course-${course.code}-${course.semester}`} value={course.code}>
                  {course.code} - {course.name} ({course.semesterLabel})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] font-bold text-slate-400">
              يتم عرض المواد المفتوحة فقط حسب إعدادات الترم.
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-black text-slate-500">السنة الأكاديمية</label>
            <select
              className="w-full rounded-2xl bg-slate-50 p-4 outline-none"
              value={form.academicYear}
              onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
            >
              <option value="">اختر السنة الأكاديمية</option>
              {(scopedAcademicYearOptions || []).map((year) => (
                <option key={`quiz-year-${year.value}`} value={year.value}>
                  {year.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-black text-slate-500">الترم</label>
            <select className="w-full rounded-2xl bg-slate-50 p-4 outline-none" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
              <option value="autumn">الخريف</option>
              <option value="spring">الربيع</option>
              <option value="summer">الصيف</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-black text-slate-500">الشعبة/السيكشن</label>
            <input type="text" className="w-full rounded-2xl bg-slate-50 p-4 outline-none" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="A" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-black text-slate-500">نطاق الرؤية</label>
            <select
              className="w-full rounded-2xl bg-slate-50 p-4 outline-none"
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
              disabled={!isSuperAdmin}
            >
              <option value="college">داخل الكلية</option>
              {isSuperAdmin && <option value="global">عام لكل الكليات</option>}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-black text-slate-500">الكلية المستهدفة</label>
            {isSuperAdmin ? (
              <select
                className="w-full rounded-2xl bg-slate-50 p-4 outline-none disabled:opacity-70"
                value={form.collegeId || adminCollegeId || ""}
                onChange={(e) => setForm({ ...form, collegeId: e.target.value })}
                disabled={form.visibility === "global"}
              >
                <option value="">اختر الكلية</option>
                {collegeOptions.map((college) => (
                  <option key={`quiz-college-${college.value}`} value={college.value}>
                    {college.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="w-full rounded-2xl bg-slate-50 p-4 outline-none disabled:opacity-70"
                value={adminCollegeId || form.collegeId || ""}
                disabled
              />
            )}
            <p className="mt-1 text-[11px] font-bold text-slate-400">
              {isSuperAdmin
                ? "اختر الكلية من القائمة. إذا كانت الرؤية عامة سيتم تعطيل هذا الحقل تلقائيًا."
                : "هذه القيمة مرتبطة بحسابك الإداري، لذلك لا يمكن تعديلها من هنا."}
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-black text-slate-500">بداية الاختبار</label>
            <input type="datetime-local" className="w-full rounded-2xl bg-slate-50 p-4" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-black text-slate-500">نهاية الاختبار</label>
            <input type="datetime-local" className="w-full rounded-2xl bg-slate-50 p-4" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-black text-slate-500">المدة بالدقائق</label>
            <input type="number" className="w-full rounded-2xl bg-slate-50 p-4" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </div>
        </div>

        <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-6">
          <h3 className="flex items-center gap-2 font-black text-slate-700">
            <PlusCircle size={18} className="text-cyan-600" /> اضافة سؤال
          </h3>
          <textarea
            className="min-h-[100px] w-full rounded-2xl bg-white p-4 outline-none"
            value={q.question}
            onChange={(e) => setQ({ ...q, question: e.target.value })}
            placeholder="اكتب نص السؤال (اختياري إذا أضفت صورة)"
          />
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-700 hover:bg-cyan-100">
                <ImagePlus size={14} />
                رفع صورة للسؤال
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    handleQuestionImageFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {q.imageUrl ? (
                <button
                  type="button"
                  onClick={() => setQ((prev) => ({ ...prev, imageUrl: "" }))}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100"
                >
                  <X size={14} />
                  حذف الصورة
                </button>
              ) : null}
            </div>
            {q.imageUrl ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                <img src={q.imageUrl} alt="معاينة صورة السؤال" className="max-h-56 w-full rounded-lg object-contain" />
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {q.options.map((opt, i) => (
              <div key={i} className={`relative flex items-center rounded-2xl border bg-white p-2 ${q.correct === i ? "border-cyan-500" : "border-transparent"}`}>
                <input
                  type="text"
                  className="w-full bg-transparent p-3 pr-10 outline-none"
                  placeholder={`اختيار ${i + 1}`}
                  value={opt}
                  onChange={(e) => {
                    const n = [...q.options];
                    n[i] = e.target.value;
                    setQ({ ...q, options: n });
                  }}
                />
                <input type="radio" name="correct" className="absolute right-3 h-4 w-4 accent-cyan-600" checked={q.correct === i} onChange={() => setQ({ ...q, correct: i })} />
              </div>
            ))}
          </div>
          <button onClick={addQuestion} className="w-full rounded-2xl bg-slate-900 py-4 font-black text-white">تثبيت السؤال</button>
        </div>

        {form.questions.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4">
            {form.questions.map((item, index) => (
              <div key={`${item.question || "q"}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-700">{index + 1}. {item.question || "سؤال بصورة فقط"}</p>
                  {item.imageUrl || item.image_url ? <p className="mt-1 text-[11px] font-bold text-cyan-600">يتضمن صورة</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== index) }))}
                  className="rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-600"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-2xl py-4 font-black text-slate-500 hover:bg-slate-50">الغاء</button>
          <button disabled={saving} onClick={saveQuizRequest} className="flex-[2] rounded-2xl bg-cyan-600 py-4 font-black text-white disabled:opacity-60">{form.id ? "حفظ التعديل" : "حفظ الاختبار"}</button>
        </div>
      </div>
    </div>
  );
};

export default function AdminQuiz() {
  const { t, i18n } = useTranslation("global");
  const [quizzes, setQuizzes] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [managedColleges, setManagedColleges] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [filters, setFilters] = useState(initialFilters);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [pageMeta, setPageMeta] = useState({ total: 0, totalPages: 0, summary: { on_time: 0, late: 0, average_score: 0 } });
  const isArabic = String(i18n.language || "ar").toLowerCase().startsWith("ar");
  const loggedUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("loggedUser") || "{}");
    } catch {
      return {};
    }
  }, []);
  const adminCollegeId = getUserCollegeKey(loggedUser);
  const isSuperAdmin = isAdminUser(loggedUser);

  const refreshQuizzes = useCallback(async () => {
    try {
      const quizData = await listQuizzesScoped(isSuperAdmin ? {} : { collegeId: adminCollegeId });
      const safeData = Array.isArray(quizData) ? quizData : [];
      const filtered = safeData.filter((quiz) => {
        const visibility = String(quiz.visibility || "college").toLowerCase();
        if (isSuperAdmin) return true;
        if (visibility === "global") return true;
        return normalizeTextKey(quiz.collegeId) === adminCollegeId;
      });
      setQuizzes(filtered);
    } catch {
      // keep state
    }
  }, [adminCollegeId, isSuperAdmin]);

  const refreshSubmissions = useCallback(async (nextFilters = filters) => {
    try {
      const scopedFilters = isSuperAdmin ? nextFilters : { ...nextFilters, collegeId: adminCollegeId };
      const data = await queryQuizSubmissions(scopedFilters);
      setSubmissions(Array.isArray(data?.items) ? data.items : []);
      setPageMeta({
        total: Number(data?.total || 0),
        totalPages: Number(data?.totalPages || 0),
        summary: data?.summary || { on_time: 0, late: 0, average_score: 0 },
      });
    } catch {
      // keep state
    }
  }, [adminCollegeId, filters, isSuperAdmin]);

  useEffect(() => {
    const tick = async () => {
      await Promise.all([refreshQuizzes(), refreshSubmissions(filters)]);
    };
    tick();
    const interval = setInterval(tick, 3000);
    return () => clearInterval(interval);
  }, [filters, refreshQuizzes, refreshSubmissions]);

  useEffect(() => {
    let cancelled = false;
    const loadManagedColleges = async () => {
      try {
        const rows = await fetchCollegesState();
        if (cancelled) return;
        setManagedColleges(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setManagedColleges([]);
      }
    };
    loadManagedColleges();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (quizId) => {
    try {
      await deleteQuiz(quizId);
      await Promise.all([refreshQuizzes(), refreshSubmissions(filters)]);
    } catch (error) {
      alert(error.message || t("quiz_error_delete"));
    }
  };

  const applyFilters = (patch) => {
    const next = { ...filters, ...patch, page: patch?.page ?? 1 };
    setFilters(next);
  };

  const openCourseOptions = useMemo(() => {
    const openSemesters = safeJsonParse(localStorage.getItem("system.openSemesters") || "{}", {});
    const courseSource = safeJsonParse(localStorage.getItem("system.courses") || "[]", []);
    if (!Array.isArray(courseSource)) return [];
    const isOpenSemester = (semesterRaw) => {
      const normalized = normalizeTextKey(semesterRaw);
      if (!normalized) return true;
      if (normalized.includes("autumn") || normalized.includes("fall") || normalized.includes("الخريف")) return Boolean(openSemesters?.autumn);
      if (normalized.includes("spring") || normalized.includes("الربيع")) return Boolean(openSemesters?.spring);
      if (normalized.includes("summer") || normalized.includes("الصيف")) return Boolean(openSemesters?.summer);
      return true;
    };

    const map = new Map();
    courseSource.forEach((course) => {
      const code = String(course?.code || course?.id || "").trim();
      if (!code) return;
      const semester = String(course?.semester || "").trim();
      if (!isOpenSemester(semester)) return;
      const semesterLabel = semester || "all";
      const key = `${code}::${semesterLabel}`;
      map.set(key, {
        code,
        name: String(course?.name || course?.title || code).trim(),
        semester: semester || "autumn",
        year: String(course?.year || course?.study_year || course?.academicYear || "").trim(),
        collegeId: String(course?.collegeId || course?.college_id || course?.college || "").trim(),
        semesterLabel:
          semesterLabel === "autumn" ? "الخريف" : semesterLabel === "spring" ? "الربيع" : semesterLabel === "summer" ? "الصيف" : semesterLabel,
      });
    });
    return Array.from(map.values());
  }, []);

  const courseOptions = useMemo(() => {
    const values = new Set();

    (quizzes || []).forEach((quiz) => {
      const code = String(quiz?.courseCode || "").trim();
      if (code) values.add(code);
    });

    (submissions || []).forEach((submission) => {
      const code = String(submission?.courseCode || "").trim();
      if (code) values.add(code);
    });

    // Fallback: if quizzes/submissions don't carry codes yet, use open courses.
    if (values.size === 0) {
      (openCourseOptions || []).forEach((course) => {
        const code = String(course?.code || "").trim();
        if (code) values.add(code);
      });
    }

    const selectedCode = String(filters?.courseCode || "").trim();
    if (selectedCode) values.add(selectedCode);

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b, "ar", { numeric: true, sensitivity: "base" })
    );
  }, [quizzes, submissions, openCourseOptions, filters?.courseCode]);

  const academicYearOptions = useMemo(() => {
    const optionsMap = new Map();
    const yearsSource = safeJsonParse(localStorage.getItem("system.years") || "[]", []);
    if (Array.isArray(yearsSource)) {
      yearsSource.forEach((row) => {
        const value = String(row?.id || row?.name || "").trim();
        if (!value) return;
        const label = toAcademicYearLabel(row?.name || value) || value;
        if (!optionsMap.has(value)) optionsMap.set(value, label);
      });
    }

    const settings = safeJsonParse(localStorage.getItem("system.registrationSettings") || "{}", {});
    const active = String(settings?.activeAcademicYear || "").trim();
    if (active && !optionsMap.has(active)) optionsMap.set(active, toAcademicYearLabel(active) || active);

    (quizzes || []).forEach((quiz) => {
      const year = String(quiz?.academicYear || "").trim();
      if (!year) return;
      if (!optionsMap.has(year)) optionsMap.set(year, toAcademicYearLabel(year) || year);
    });

    return Array.from(optionsMap.entries()).map(([value, label]) => ({ value, label }));
  }, [quizzes]);

  const collegeLabelByKey = useMemo(() => {
    const map = new Map();
    (Array.isArray(managedColleges) ? managedColleges : []).forEach((item) => {
      const id = String(item?.id || "").trim().toUpperCase();
      const name = String(item?.name || "").trim();
      if (id) map.set(normalizeTextKey(id), name ? `${name} (${id})` : id);
      if (name) map.set(normalizeTextKey(name), name);
    });
    return map;
  }, [managedColleges]);

  return (
    <div className="admin-quiz-page w-full text-right" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="w-fit rounded-2xl border border-slate-100 bg-white p-2">
          <button onClick={() => setActiveTab("overview")} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "overview" ? "bg-slate-900 text-white" : "text-slate-600"}`}>{t("quiz_tab_overview")}</button>
          <button onClick={() => setActiveTab("quizzes")} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "quizzes" ? "bg-slate-900 text-white" : "text-slate-600"}`}>{t("quiz_tab_bank")}</button>
          <button onClick={() => setActiveTab("results")} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "results" ? "bg-slate-900 text-white" : "text-slate-600"}`}>{t("quiz_tab_submissions")}</button>
          <button onClick={() => { setEditingQuiz(null); setActiveTab("add"); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "add" ? "bg-cyan-600 text-white" : "text-slate-600"}`}>{t("quiz_tab_add")}</button>
        </div>

        {activeTab === "overview" && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label={t("quiz_stat_total_quizzes")} value={quizzes.length} icon={<BookOpen size={20} />} />
              <StatCard label={t("quiz_stat_total_submissions")} value={pageMeta.total} icon={<Users size={20} />} />
              <StatCard label={t("quiz_stat_avg_scores")} value={`${pageMeta.summary?.average_score ?? 0}%`} icon={<CheckCircle size={20} />} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard label={t("quiz_stat_on_time")} value={pageMeta.summary?.on_time ?? 0} icon={<Clock size={20} />} />
              <StatCard label={t("quiz_stat_late")} value={pageMeta.summary?.late ?? 0} icon={<Calendar size={20} />} />
            </div>
          </div>
        )}

        {activeTab === "quizzes" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {quizzes.map((q) => (
              <div key={q.id} className="rounded-[24px] border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-3">
                    <h3 className="text-xl font-black text-slate-800">{q.title}</h3>
                    <div className="text-xs text-slate-500">المادة: {q.courseCode || "-"} • الترم: {toArabicTermLabel(q.term)} • السنة: {q.academicYear || "-"}</div>
                    <div className="text-xs text-slate-500">
                      النطاق: {q.visibility === "global" ? "عام" : `كلية (${collegeLabelByKey.get(normalizeTextKey(q.collegeId)) || q.collegeId || "-"})`}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <Calendar size={14} /> من: {q.startTime ? new Date(q.startTime).toLocaleString("ar-EG") : "-"}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <Clock size={14} /> الى: {q.endTime ? new Date(q.endTime).toLocaleString("ar-EG") : "-"}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(q.id)} className="rounded-2xl p-3 text-slate-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={20} /></button>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                  <div className="flex gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-600">{q.questions.length} سؤال</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-600">{q.duration} دقيقة</span>
                  </div>
                  <button onClick={() => { setEditingQuiz(q); setActiveTab("add"); }} className="flex items-center gap-1 text-xs font-black text-cyan-600">تعديل <ChevronLeft size={14} /></button>
                </div>
              </div>
            ))}
            {quizzes.length === 0 && (
              <div className="col-span-full rounded-[24px] border border-dashed border-slate-200 bg-white py-16 text-center">
                <ClipboardList className="mx-auto mb-3 text-slate-300" size={34} />
                <p className="font-bold text-slate-400">لا توجد اختبارات حاليا</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "results" && (
          <div className="space-y-4 rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4 lg:grid-cols-8">
              <select value={filters.scope} onChange={(e) => applyFilters({ scope: e.target.value })} className="rounded-xl border border-slate-200 p-2 text-sm">
                <option value="current">الحالي</option>
                <option value="archive">الأرشيف</option>
                <option value="all">الكل</option>
              </select>
              <select value={filters.status} onChange={(e) => applyFilters({ status: e.target.value })} className="rounded-xl border border-slate-200 p-2 text-sm">
                <option value="all">كل الحالات</option>
                <option value="on_time">في الوقت</option>
                <option value="late">متأخر</option>
              </select>
              <select value={filters.courseCode} onChange={(e) => applyFilters({ courseCode: e.target.value })} className="rounded-xl border border-slate-200 p-2 text-sm">
                <option value="">كل المواد</option>
                {courseOptions.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
              <input value={filters.academicYear} onChange={(e) => setFilters((prev) => ({ ...prev, academicYear: e.target.value }))} onBlur={() => applyFilters({ academicYear: filters.academicYear })} placeholder="السنة الأكاديمية" className="rounded-xl border border-slate-200 p-2 text-sm" />
              <select value={filters.term} onChange={(e) => applyFilters({ term: e.target.value })} className="rounded-xl border border-slate-200 p-2 text-sm">
                <option value="">كل الترمات</option>
                <option value="autumn">الخريف</option>
                <option value="spring">الربيع</option>
                <option value="summer">الصيف</option>
              </select>
              <input value={filters.section} onChange={(e) => setFilters((prev) => ({ ...prev, section: e.target.value }))} onBlur={() => applyFilters({ section: filters.section })} placeholder="الشعبة" className="rounded-xl border border-slate-200 p-2 text-sm" />
              <input value={filters.studentQuery} onChange={(e) => setFilters((prev) => ({ ...prev, studentQuery: e.target.value }))} onBlur={() => applyFilters({ studentQuery: filters.studentQuery })} placeholder="بحث طالب" className="rounded-xl border border-slate-200 p-2 text-sm" />
              <button onClick={() => applyFilters({})} className="flex items-center justify-center gap-1 rounded-xl bg-slate-900 p-2 text-sm font-black text-white"><Filter size={14} /> تحديث</button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full border-collapse text-right">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-black text-slate-500">
                    <th className="p-3">الطالب</th>
                    <th className="p-3">المادة</th>
                    <th className="p-3">الاختبار</th>
                    <th className="p-3 text-center">الحالة</th>
                    <th className="p-3 text-center">الدرجة</th>
                    <th className="p-3">وقت التسليم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.map((s) => (
                    <tr key={s.id}>
                      <td className="p-3">
                        <p className="font-bold text-slate-800">{s.studentName}</p>
                        <p className="text-xs text-slate-400">{s.studentId}</p>
                      </td>
                      <td className="p-3 text-slate-700">{s.courseCode || "-"}</td>
                      <td className="p-3 font-bold text-slate-700">{s.quizTitle}</td>
                      <td className="p-3 text-center">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${s.status === "late" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{s.status === "late" ? "متأخر" : "في الوقت"}</span>
                      </td>
                      <td className="p-3 text-center"><span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">{s.score}%</span></td>
                      <td className="p-3 text-sm text-slate-500">{s.submittedAt ? new Date(s.submittedAt).toLocaleString("ar-EG") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {submissions.length === 0 && <div className="p-8 text-center font-bold text-slate-400">لا توجد تسليمات حسب الفلاتر</div>}
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="text-slate-500">الإجمالي: {pageMeta.total}</div>
              <div className="flex items-center gap-2">
                <button disabled={filters.page <= 1} onClick={() => applyFilters({ page: filters.page - 1 })} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50">السابق</button>
                <span className="text-slate-600">صفحة {filters.page} / {Math.max(1, pageMeta.totalPages || 1)}</span>
                <button disabled={filters.page >= Math.max(1, pageMeta.totalPages || 1)} onClick={() => applyFilters({ page: filters.page + 1 })} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50">التالي</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "add" && (
          <AdminAddQuiz
            initialQuiz={editingQuiz}
            adminCollegeId={adminCollegeId}
            isSuperAdmin={isSuperAdmin}
            openCourseOptions={openCourseOptions}
            academicYearOptions={academicYearOptions}
            managedColleges={managedColleges}
            onSave={async () => {
              setEditingQuiz(null);
              setActiveTab("quizzes");
              await Promise.all([refreshQuizzes(), refreshSubmissions(filters)]);
            }}
            onCancel={() => {
              setEditingQuiz(null);
              setActiveTab("quizzes");
            }}
          />
        )}
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html[data-theme="dark"] .admin-quiz-page [class*="bg-white"] {
              background-color: #13233f !important;
            }
            html[data-theme="dark"] .admin-quiz-page [class*="bg-slate-50"] {
              background-color: #0f223d !important;
            }
            html[data-theme="dark"] .admin-quiz-page [class*="bg-slate-100"] {
              background-color: #1a3355 !important;
            }
            html[data-theme="dark"] .admin-quiz-page [class*="border-slate-100"],
            html[data-theme="dark"] .admin-quiz-page [class*="border-slate-200"] {
              border-color: #2a4264 !important;
            }
            html[data-theme="dark"] .admin-quiz-page [class*="text-slate-900"],
            html[data-theme="dark"] .admin-quiz-page [class*="text-slate-800"],
            html[data-theme="dark"] .admin-quiz-page [class*="text-slate-700"] {
              color: #e2e8f0 !important;
            }
            html[data-theme="dark"] .admin-quiz-page [class*="text-slate-600"],
            html[data-theme="dark"] .admin-quiz-page [class*="text-slate-500"],
            html[data-theme="dark"] .admin-quiz-page [class*="text-slate-400"] {
              color: #9fb1c8 !important;
            }
            html[data-theme="dark"] .admin-quiz-page input,
            html[data-theme="dark"] .admin-quiz-page textarea,
            html[data-theme="dark"] .admin-quiz-page select {
              background-color: #0f223d !important;
              color: #e2e8f0 !important;
              border-color: #2a4264 !important;
            }
            html[data-theme="dark"] .admin-quiz-page input[type="date"]::-webkit-calendar-picker-indicator,
            html[data-theme="dark"] .admin-quiz-page input[type="time"]::-webkit-calendar-picker-indicator,
            html[data-theme="dark"] .admin-quiz-page input[type="datetime-local"]::-webkit-calendar-picker-indicator {
              filter: invert(1) brightness(1.25) saturate(1.1);
              opacity: 0.95;
              cursor: pointer;
            }
            html[data-theme="dark"] .admin-quiz-page input::placeholder,
            html[data-theme="dark"] .admin-quiz-page textarea::placeholder {
              color: #8ea3be !important;
            }
            html[data-theme="dark"] .admin-quiz-page select option {
              background-color: #13233f !important;
              color: #e2e8f0 !important;
            }
            html[data-theme="dark"] .admin-quiz-page select {
              color-scheme: dark;
            }
            html[data-theme="dark"] .admin-quiz-page select option:checked,
            html[data-theme="dark"] .admin-quiz-page select option:hover,
            html[data-theme="dark"] .admin-quiz-page select option:focus {
              background: #0ea7c6 !important;
              color: #ffffff !important;
              box-shadow: 0 0 0 1000px #0ea7c6 inset;
            }
            html[data-theme="dark"] .admin-quiz-page table thead tr {
              background-color: #10243f !important;
            }
            html[data-theme="dark"] .admin-quiz-page table tbody tr:hover {
              background-color: #183357 !important;
            }
          `,
        }}
      />
    </div>
  );
}









