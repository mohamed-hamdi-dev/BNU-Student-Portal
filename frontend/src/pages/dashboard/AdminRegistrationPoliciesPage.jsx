import React, { useContext, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { ChevronDown, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { ThemeContext } from "../../context/ThemeContext.jsx";
import {
  bootstrapAcademicCoreColleges,
  getCollegeCreditPolicies,
  listAcademicCoreColleges,
  replaceCollegeCreditPolicies,
} from "../../services/registrationPolicyApi";

const POLICIES_COLLEGE_KEY = "registration_policies_selected_college_id";

const emptyTier = () => ({
  min_gpa: 0,
  max_gpa: "",
  min_credits: 0,
  max_credits: 18,
});

const GPA_OPTIONS = Array.from({ length: 41 }, (_, index) => Number((index * 0.1).toFixed(2)));
const CREDIT_OPTIONS = Array.from({ length: 31 }, (_, index) => index);
const DARK_BASE = "#132B50";
const DARK_SURFACE = "#102747";
const DARK_SURFACE_ALT = "#16345F";
const DARK_BORDER = "#2B4F79";
const DARK_HOVER = "#1B3D6B";

const normalizeCollegeLabel = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");

const dedupeCollegesForDisplay = (rows = []) => {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.is_active === false) continue;
    const key = normalizeCollegeLabel(row?.name_ar || row?.name_en || row?.code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
};

const normalizeTier = (tier) => ({
  min_gpa: Number(tier.min_gpa || 0),
  max_gpa: tier.max_gpa === "" ? "" : Number(tier.max_gpa),
  min_credits: Number(tier.min_credits || 0),
  max_credits: Number(tier.max_credits || 0),
});

const sortTiers = (rows = []) => [...rows].sort((a, b) => Number(a.min_gpa || 0) - Number(b.min_gpa || 0));

const validateTiers = (rows = []) => {
  const normalized = sortTiers(rows.map(normalizeTier));
  for (let i = 0; i < normalized.length; i += 1) {
    const item = normalized[i];
    const minGpa = Number(item.min_gpa);
    const maxGpa = item.max_gpa === "" ? null : Number(item.max_gpa);
    const minCredits = Number(item.min_credits);
    const maxCredits = Number(item.max_credits);

    if (!Number.isFinite(minGpa) || minGpa < 0 || minGpa > 4) {
      return { ok: false, message: `قيمة GPA غير صحيحة في الشريحة رقم ${i + 1}` };
    }

    if (maxGpa !== null && (!Number.isFinite(maxGpa) || maxGpa < minGpa || maxGpa > 4)) {
      return { ok: false, message: `الحد الأقصى للـ GPA يجب أن يكون أكبر أو يساوي الحد الأدنى في الشريحة رقم ${i + 1}` };
    }

    if (!Number.isFinite(minCredits) || !Number.isFinite(maxCredits) || minCredits < 0 || maxCredits < 0 || maxCredits < minCredits) {
      return { ok: false, message: `حدود الساعات غير صحيحة في الشريحة رقم ${i + 1}` };
    }

    if (i > 0) {
      const prev = normalized[i - 1];
      const prevMax = prev.max_gpa === "" ? null : Number(prev.max_gpa);
      if (prevMax !== null && minGpa < prevMax) {
        return { ok: false, message: `يوجد تداخل بين الشرائح ${i} و${i + 1}` };
      }
    }
  }
  return { ok: true, tiers: normalized };
};

const SelectField = ({ value, onChange, children, isDarkMode }) => {
  const selectBaseClass = isDarkMode
    ? "mt-1 block w-full appearance-none rounded-xl border px-3 py-2.5 text-sm font-black text-slate-100 outline-none transition focus:border-[#05ADCF] focus:ring-2 focus:ring-cyan-900/40"
    : "mt-1 block w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-black text-slate-800 outline-none transition focus:border-[#05ADCF] focus:ring-2 focus:ring-cyan-100";

  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={selectBaseClass}
        style={isDarkMode ? { borderColor: DARK_BORDER, backgroundColor: DARK_SURFACE } : undefined}
      >
        {children}
      </select>
      <ChevronDown size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-slate-300" : "text-slate-500"}`} />
    </div>
  );
};

export default function AdminRegistrationPoliciesPage() {
  const { isDarkMode } = useContext(ThemeContext);
  const [colleges, setColleges] = useState([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState(() => localStorage.getItem(POLICIES_COLLEGE_KEY) || "");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [tiers, setTiers] = useState([emptyTier()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCollege = useMemo(
    () => colleges.find((item) => String(item.id) === String(selectedCollegeId)) || null,
    [colleges, selectedCollegeId]
  );

  const filteredColleges = useMemo(() => {
    const q = String(collegeSearch || "").trim().toLowerCase();
    if (!q) return colleges;
    return colleges.filter((item) =>
      [item?.name_ar, item?.name_en, item?.code]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q))
    );
  }, [colleges, collegeSearch]);

  const collegeOptions = useMemo(() => {
    const base = Array.isArray(filteredColleges) ? [...filteredColleges] : [];
    if (!selectedCollegeId) return base;
    const hasSelected = base.some((item) => String(item.id) === String(selectedCollegeId));
    if (hasSelected) return base;
    if (selectedCollege) return [selectedCollege, ...base];
    return base;
  }, [filteredColleges, selectedCollegeId, selectedCollege]);

  const loadColleges = async () => {
    try {
      setLoading(true);
      try {
        await bootstrapAcademicCoreColleges();
      } catch {
        // ignore
      }
      const coreRows = await listAcademicCoreColleges();
      const normalized = dedupeCollegesForDisplay(coreRows);
      setColleges(normalized);
      if (normalized.length > 0) {
        const hasSelected = normalized.some((item) => String(item.id) === String(selectedCollegeId));
        if (!hasSelected) setSelectedCollegeId(String(normalized[0].id));
      }
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "تعذر تحميل الكليات",
        text: error?.message || "حدث خطأ غير متوقع",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPolicies = async (collegeId) => {
    if (!collegeId) return;
    try {
      setLoading(true);
      const rows = await getCollegeCreditPolicies(collegeId);
      if (!Array.isArray(rows) || rows.length === 0) {
        setTiers([emptyTier()]);
        return;
      }
      setTiers(
        sortTiers(
          rows.map((row) => ({
            min_gpa: Number(row?.min_gpa ?? 0),
            max_gpa: row?.max_gpa === null || row?.max_gpa === undefined ? "" : Number(row.max_gpa),
            min_credits: Number(row?.min_credits ?? 0),
            max_credits: Number(row?.max_credits ?? 18),
          }))
        )
      );
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "تعذر تحميل السياسات",
        text: error?.message || "حدث خطأ غير متوقع",
      });
      setTiers([emptyTier()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadColleges();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", isDarkMode ? "dark" : "light");
    root.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    if (!selectedCollegeId) return;
    localStorage.setItem(POLICIES_COLLEGE_KEY, String(selectedCollegeId));
    loadPolicies(selectedCollegeId);
  }, [selectedCollegeId]);

  const shellCardClass = isDarkMode
    ? "rounded-3xl border p-6 shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
    : "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";

  const infoSurfaceClass = isDarkMode
    ? "rounded-xl border px-4 py-2.5 text-sm font-bold text-slate-100"
    : "rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700";

  const tierCardClass = isDarkMode
    ? "grid grid-cols-1 gap-3 rounded-2xl border bg-gradient-to-b p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
    : "grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]";

  const tierHeaderClass = isDarkMode
    ? "md:col-span-5 flex items-center justify-between rounded-xl border px-3 py-2"
    : "md:col-span-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2";

  const patchTier = (index, key, value) => {
    setTiers((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return { ...item, [key]: value };
      })
    );
  };

  const addTier = () => setTiers((prev) => [...prev, emptyTier()]);

  const removeTier = (index) =>
    setTiers((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [emptyTier()];
    });

  const savePolicies = async () => {
    if (!selectedCollegeId) {
      Swal.fire({ icon: "warning", title: "اختر كلية أولًا" });
      return;
    }

    const payload = tiers.map((tier) => ({
      min_gpa: Number(tier.min_gpa || 0),
      max_gpa: tier.max_gpa === "" ? null : Number(tier.max_gpa),
      min_credits: Number(tier.min_credits || 0),
      max_credits: Number(tier.max_credits || 0),
    }));

    const check = validateTiers(payload);
    if (!check.ok) {
      Swal.fire({ icon: "warning", title: "تحقق من الشرائح", text: check.message });
      return;
    }

    try {
      setSaving(true);
      const saved = await replaceCollegeCreditPolicies(selectedCollegeId, check.tiers);
      setTiers(
        sortTiers(
          (Array.isArray(saved) ? saved : []).map((row) => ({
            min_gpa: Number(row?.min_gpa ?? 0),
            max_gpa: row?.max_gpa === null || row?.max_gpa === undefined ? "" : Number(row.max_gpa),
            min_credits: Number(row?.min_credits ?? 0),
            max_credits: Number(row?.max_credits ?? 18),
          }))
        )
      );
      Swal.fire({ icon: "success", title: "تم حفظ السياسات", timer: 1200, showConfirmButton: false });
    } catch (error) {
      Swal.fire({ icon: "error", title: "فشل حفظ السياسات", text: error?.message || "حدث خطأ غير متوقع" });
    } finally {
      setSaving(false);
    }
  };

  const headingClass = isDarkMode ? "text-slate-100" : "text-slate-800";
  const subClass = isDarkMode ? "text-slate-300" : "text-slate-500";
  const labelClass = isDarkMode ? "text-slate-300" : "text-slate-600";

  return (
    <div className="space-y-5" dir="rtl">
      <div className={`${shellCardClass} ${isDarkMode ? "dark-card" : ""}`}>
        {isDarkMode && (
          <style>{`
            .dark-card { border-color: ${DARK_BORDER}; background-color: ${DARK_BASE}; }
            .dark-info { border-color: ${DARK_BORDER}; background-color: ${DARK_SURFACE}; }
            .dark-tier { border-color: ${DARK_BORDER}; background-image: linear-gradient(to bottom, ${DARK_SURFACE_ALT}, ${DARK_SURFACE}); }
            .dark-tier-head { border-color: ${DARK_BORDER}; background-color: ${DARK_SURFACE}; }
          `}</style>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className={`text-2xl font-black ${headingClass}`}>سياسات التسجيل والساعات</h1>
            <p className={`mt-1 text-sm font-bold ${subClass}`}>إدارة حدود الساعات حسب GPA لكل كلية</p>
          </div>
          <button
            onClick={loadColleges}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black transition ${
              isDarkMode
                ? "text-slate-100"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            style={isDarkMode ? { borderColor: DARK_BORDER, backgroundColor: DARK_SURFACE, color: "#f1f5f9" } : undefined}
            onMouseEnter={(e) => {
              if (isDarkMode) e.currentTarget.style.backgroundColor = DARK_HOVER;
            }}
            onMouseLeave={(e) => {
              if (isDarkMode) e.currentTarget.style.backgroundColor = DARK_SURFACE;
            }}
          >
            <RefreshCw size={15} /> تحديث
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[260px_300px_1fr]">
          <input
            type="text"
            placeholder="ابحث عن كلية..."
            value={collegeSearch}
            onChange={(e) => setCollegeSearch(e.target.value)}
            className={`rounded-xl border px-3 py-2.5 text-sm font-bold outline-none focus:border-[#05ADCF] ${
              isDarkMode
                ? "text-slate-100"
                : "border-slate-200 bg-white text-slate-800"
            }`}
            style={isDarkMode ? { borderColor: DARK_BORDER, backgroundColor: DARK_SURFACE } : undefined}
          />

          <SelectField isDarkMode={isDarkMode} value={selectedCollegeId} onChange={(e) => setSelectedCollegeId(e.target.value)}>
            {collegeOptions.length === 0 && <option value="">لا توجد كليات مطابقة</option>}
            {collegeOptions.map((college) => (
              <option key={`college-${college.id}`} value={String(college.id)}>
                {(college.name_ar || college.name_en || college.code || `College ${college.id}`) + ` (${college.code})`}
              </option>
            ))}
          </SelectField>

          <div className={`${infoSurfaceClass} ${isDarkMode ? "dark-info" : ""}`}>
            الكلية الحالية: <span className="font-black">{selectedCollege ? selectedCollege.name_ar || selectedCollege.name_en || selectedCollege.code : "-"}</span>
          </div>
        </div>
      </div>

      <div className={`${shellCardClass} ${isDarkMode ? "dark-card" : ""}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className={`text-lg font-black ${headingClass}`}>قواعد الساعات حسب المعدل التراكمي (GPA)</h2>
          <button
            onClick={addTier}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-black ${
              isDarkMode
                ? "border-cyan-900 bg-cyan-950/20 text-cyan-300"
                : "border-cyan-200 bg-cyan-50 text-cyan-700"
            }`}
          >
            <Plus size={14} /> إضافة شريحة
          </button>
        </div>

        {loading && <div className={`text-sm font-bold ${subClass}`}>جاري التحميل...</div>}

        {!loading && (
          <div className="space-y-3">
            {tiers.map((tier, index) => (
              <div key={`tier-${index}`} className={`${tierCardClass} ${isDarkMode ? "dark-tier" : ""}`}>
                <div className={`${tierHeaderClass} ${isDarkMode ? "dark-tier-head" : ""}`}>
                  <span className={`text-xs font-black ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>شريحة رقم {index + 1}</span>
                  <span className="text-xs font-bold text-cyan-700">
                    {Number(tier.min_gpa || 0).toFixed(2)} {tier.max_gpa === "" ? "- مفتوح" : `- ${Number(tier.max_gpa).toFixed(2)}`}
                  </span>
                </div>

                <label className={`text-xs font-black ${labelClass}`}>
                  الحد الأدنى للمعدل (GPA)
                  <SelectField isDarkMode={isDarkMode} value={tier.min_gpa} onChange={(e) => patchTier(index, "min_gpa", e.target.value)}>
                    {GPA_OPTIONS.map((value) => (
                      <option key={`gpa-min-${value}`} value={value}>
                        {value.toFixed(2)}
                      </option>
                    ))}
                  </SelectField>
                </label>

                <label className={`text-xs font-black ${labelClass}`}>
                  الحد الأقصى للمعدل (اتركه مفتوحًا إذا لا يوجد حد)
                  <SelectField isDarkMode={isDarkMode} value={tier.max_gpa} onChange={(e) => patchTier(index, "max_gpa", e.target.value)}>
                    <option value="">مفتوح (بدون حد أعلى)</option>
                    {GPA_OPTIONS.map((value) => (
                      <option key={`gpa-max-${value}`} value={value}>
                        {value.toFixed(2)}
                      </option>
                    ))}
                  </SelectField>
                </label>

                <label className={`text-xs font-black ${labelClass}`}>
                  أقل عدد ساعات مسموح
                  <SelectField isDarkMode={isDarkMode} value={tier.min_credits} onChange={(e) => patchTier(index, "min_credits", e.target.value)}>
                    {CREDIT_OPTIONS.map((value) => (
                      <option key={`credit-min-${value}`} value={value}>
                        {value}
                      </option>
                    ))}
                  </SelectField>
                </label>

                <label className={`text-xs font-black ${labelClass}`}>
                  أقصى عدد ساعات مسموح
                  <SelectField isDarkMode={isDarkMode} value={tier.max_credits} onChange={(e) => patchTier(index, "max_credits", e.target.value)}>
                    {CREDIT_OPTIONS.map((value) => (
                      <option key={`credit-max-${value}`} value={value}>
                        {value}
                      </option>
                    ))}
                  </SelectField>
                </label>

                <div className="flex items-end">
                  <button
                    onClick={() => removeTier(index)}
                    className={`inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-sm font-black ${
                      isDarkMode
                        ? "border-rose-900 bg-rose-950/20 text-rose-300"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                    title="حذف الشريحة"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          <button
            onClick={savePolicies}
            disabled={saving || loading || !selectedCollegeId}
            className="inline-flex items-center gap-2 rounded-xl bg-[#05ADCF] px-4 py-2 text-sm font-black text-white hover:opacity-90 disabled:opacity-60"
          >
            <Save size={15} /> {saving ? "جاري الحفظ..." : "حفظ السياسات"}
          </button>
        </div>
      </div>
    </div>
  );
}
