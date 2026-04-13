import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createStudentFeeAdjustment,
  deleteBankAccountSetting,
  createGpaDiscountPolicy,
  createPaymentFeeItem,
  deleteStudentFeeAdjustment,
  deleteGpaDiscountPolicy,
  deletePaymentFeeItem,
  listBankAccountSettings,
  listGpaDiscountPolicies,
  listLatePenaltyRules,
  listPaymentConfigs,
  listPaymentFeeItems,
  listStudentFeeAdjustments,
  upsertBankAccountSetting,
  upsertLatePenaltyRule,
  upsertPaymentConfig,
} from "../../services/paymentApi";
import { listAcademicCoreColleges } from "../../services/registrationPolicyApi";
import { getCurrentAcademicYear } from "../../utils/academicData";
import { apiFetch } from "../../services/api";

const GRACE_DAYS_OPTIONS = [0, 7, 14, 21, 28, 35, 42];
const GPA_OPTIONS = Array.from({ length: 41 }, (_, i) => (i / 10).toFixed(1));
const normalizeDigits = (value) =>
  String(value ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const sameNullableNumber = (a, b) => {
  const na = a === "" || a === null || a === undefined ? null : Number(a);
  const nb = b === "" || b === null || b === undefined ? null : Number(b);
  return na === nb;
};

export default function AdminPaymentSetupPage() {
  const { t } = useTranslation("admin");
  const SEMESTERS = [
    { value: "autumn", label: t("admin.payment.semesters.autumn") },
    { value: "spring", label: t("admin.payment.semesters.spring") },
    { value: "summer", label: t("admin.payment.semesters.summer") },
  ];
  const [configs, setConfigs] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [feeItems, setFeeItems] = useState([]);
  const [penaltyRules, setPenaltyRules] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [bankSettings, setBankSettings] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [cfgForm, setCfgForm] = useState({
    academic_year_label: getCurrentAcademicYear(),
    semester: "autumn",
    college_id: "",
    batch_year: "",
    pricing_mode: "FIXED_TERM",
    split_main_terms: true,
    credit_hour_rate: "",
    base_amount: 25000,
    currency: "EGP",
    allow_online: true,
    allow_fawry: true,
    allow_bank_transfer: true,
    is_active: true,
  });

  const [policyForm, setPolicyForm] = useState({
    academic_year_label: getCurrentAcademicYear(),
    semester: "autumn",
    college_id: "",
    min_gpa: 3.5,
    max_gpa: 4,
    discount_type: "PERCENT",
    discount_value: 10,
    priority: 100,
    is_active: true,
  });

  const [feeForm, setFeeForm] = useState({
    academic_year_label: getCurrentAcademicYear(),
    semester: "autumn",
    college_id: "",
    name_ar: "",
    name_en: "",
    item_code: "",
    amount_type: "FIXED",
    amount_value: 0,
    base_scope: "TOTAL",
    is_mandatory: true,
    is_active: true,
    sort_order: 100,
  });

  const [penaltyForm, setPenaltyForm] = useState({
    academic_year_label: getCurrentAcademicYear(),
    semester: "autumn",
    college_id: "",
    grace_period_days: 21,
    penalty_type: "FIXED",
    penalty_value: 0,
    repeats_weekly: false,
    max_penalty_amount: "",
    is_active: true,
  });

  const [adjustmentForm, setAdjustmentForm] = useState({
    student_user_id: "",
    academic_year_label: getCurrentAcademicYear(),
    semester: "autumn",
    adjustment_type: "EXEMPT_ITEM",
    fee_item_id: "",
    value: 0,
    reason: "",
    is_active: true,
  });
  const [bankForm, setBankForm] = useState({
    academic_year_label: getCurrentAcademicYear(),
    semester: "autumn",
    college_id: "",
    bank_name: "Bank of Cairo",
    account_holder_name: "",
    account_number: "",
    iban: "",
    swift_code: "",
    branch_name: "",
    payment_note: "",
    is_active: true,
  });

  const collegeOptions = useMemo(() => {
    const rows = Array.isArray(colleges) ? colleges : [];
    return [{ id: "", name_ar: t("admin.payment.allColleges") }, ...rows];
  }, [colleges, t]);
  const penaltyGraceDays = Number(penaltyForm.grace_period_days || 0);
  const penaltyTitleHint = penaltyGraceDays > 0 ? t("admin.payment.afterDays", { days: penaltyGraceDays }) : t("admin.payment.byConfiguration");

  const toNullableCollege = (value) => (value === "" || value === null || value === undefined ? null : Number(value));

  const load = async () => {
    try {
      setLoading(true);
      const [cfgRows, polRows, feeRows, penRows, adjRows, bankRows, collegeRows] = await Promise.all([
        listPaymentConfigs({}),
        listGpaDiscountPolicies({}),
        listPaymentFeeItems({}),
        listLatePenaltyRules({}),
        listStudentFeeAdjustments({}),
        listBankAccountSettings({}),
        listAcademicCoreColleges().catch(() => []),
      ]);
      const usersRows = await apiFetch("/api/users").catch(() => []);
      const usersMap = {};
      (Array.isArray(usersRows) ? usersRows : []).forEach((u) => {
        const id = Number(u?.id);
        if (!Number.isFinite(id) || id <= 0) return;
        usersMap[id] = {
          name: String(u?.full_name || u?.name || "").trim(),
          username: String(u?.username || "").trim(),
          studentCode: String(u?.student_code || "").trim(),
        };
      });
      setConfigs(Array.isArray(cfgRows) ? cfgRows : []);
      setPolicies(Array.isArray(polRows) ? polRows : []);
      setFeeItems(Array.isArray(feeRows) ? feeRows : []);
      setPenaltyRules(Array.isArray(penRows) ? penRows : []);
      setAdjustments(Array.isArray(adjRows) ? adjRows : []);
      setBankSettings(Array.isArray(bankRows) ? bankRows : []);
      setColleges(Array.isArray(collegeRows) ? collegeRows : []);
      setUsersById(usersMap);
    } catch (err) {
      setMessage(String(err?.message || t("admin.payment.messages.loadError")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!Array.isArray(configs) || !configs.length) return;
    const target = configs.find((row) =>
      String(row.academic_year_label || "") === String(cfgForm.academic_year_label || "") &&
      String(row.semester || "") === String(cfgForm.semester || "") &&
      sameNullableNumber(row.college_id, cfgForm.college_id) &&
      sameNullableNumber(row.batch_year, cfgForm.batch_year)
    );
    if (!target) return;
    setCfgForm((prev) => {
      const next = {
        ...prev,
        pricing_mode: String(target.pricing_mode || "FIXED_TERM"),
        split_main_terms: Boolean(target.split_main_terms),
        credit_hour_rate: target.credit_hour_rate == null ? "" : Number(target.credit_hour_rate),
        base_amount: Number(target.base_amount || 0),
        currency: String(target.currency || "EGP"),
        allow_online: Boolean(target.allow_online),
        allow_fawry: Boolean(target.allow_fawry),
        allow_bank_transfer: Boolean(target.allow_bank_transfer),
        is_active: Boolean(target.is_active),
      };
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
      return next;
    });
  }, [configs, cfgForm.academic_year_label, cfgForm.semester, cfgForm.college_id, cfgForm.batch_year]);

  useEffect(() => {
    if (!Array.isArray(bankSettings) || !bankSettings.length) return;
    const target = bankSettings.find((row) =>
      String(row.academic_year_label || "") === String(bankForm.academic_year_label || "") &&
      String(row.semester || "") === String(bankForm.semester || "") &&
      sameNullableNumber(row.college_id, bankForm.college_id)
    );
    if (!target) return;
    setBankForm((prev) => {
      const next = {
        ...prev,
        bank_name: String(target.bank_name || ""),
        account_holder_name: String(target.account_holder_name || ""),
        account_number: String(target.account_number || ""),
        iban: String(target.iban || ""),
        swift_code: String(target.swift_code || ""),
        branch_name: String(target.branch_name || ""),
        payment_note: String(target.payment_note || ""),
        is_active: Boolean(target.is_active),
      };
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
      return next;
    });
  }, [bankSettings, bankForm.academic_year_label, bankForm.semester, bankForm.college_id]);

  const saveConfig = async () => {
    try {
      await upsertPaymentConfig({
        ...cfgForm,
        college_id: toNullableCollege(cfgForm.college_id),
        batch_year: cfgForm.batch_year === "" ? null : Number(cfgForm.batch_year),
        pricing_mode: cfgForm.pricing_mode,
        split_main_terms: Boolean(cfgForm.split_main_terms),
        credit_hour_rate: cfgForm.credit_hour_rate === "" ? null : Number(cfgForm.credit_hour_rate),
        base_amount: Number(cfgForm.base_amount || 0),
      });
      setMessage(t("admin.payment.messages.feesSaved"));
      await load();
    } catch (err) {
      setMessage(String(err?.message || t("admin.payment.messages.feesSaveError")));
    }
  };

  const addPolicy = async () => {
    try {
      await createGpaDiscountPolicy({
        ...policyForm,
        college_id: toNullableCollege(policyForm.college_id),
        min_gpa: Number(policyForm.min_gpa || 0),
        max_gpa: policyForm.max_gpa === "" ? null : Number(policyForm.max_gpa || 0),
        discount_value: Number(policyForm.discount_value || 0),
        priority: Number(policyForm.priority || 100),
      });
      setMessage(t("admin.payment.messages.discountPolicyAdded"));
      await load();
    } catch (err) {
      setMessage(String(err?.message || t("admin.payment.messages.discountPolicyError")));
    }
  };

  const addFeeItem = async () => {
    try {
      await createPaymentFeeItem({
        ...feeForm,
        college_id: toNullableCollege(feeForm.college_id),
        amount_value: Number(feeForm.amount_value || 0),
        sort_order: Number(feeForm.sort_order || 100),
      });
      setMessage(t("admin.payment.messages.feeItemAdded"));
      setFeeForm((p) => ({ ...p, name_ar: "", name_en: "", item_code: "", amount_value: 0 }));
      await load();
    } catch (err) {
      setMessage(String(err?.message || t("admin.payment.messages.feeItemError")));
    }
  };

  const savePenaltyRule = async () => {
    try {
      await upsertLatePenaltyRule({
        ...penaltyForm,
        college_id: toNullableCollege(penaltyForm.college_id),
        grace_period_days: Number(penaltyForm.grace_period_days || 0),
        penalty_value: Number(penaltyForm.penalty_value || 0),
        max_penalty_amount: penaltyForm.max_penalty_amount === "" ? null : Number(penaltyForm.max_penalty_amount || 0),
      });
      setMessage(t("admin.payment.messages.penaltySaved"));
      await load();
    } catch (err) {
      setMessage(String(err?.message || t("admin.payment.messages.penaltySaveError")));
    }
  };

  const addStudentAdjustment = async () => {
    try {
      const studentRefRaw = normalizeDigits(adjustmentForm.student_user_id).trim();
      const parsedStudentRef = Number(studentRefRaw);
      if (!studentRefRaw || !Number.isFinite(parsedStudentRef) || parsedStudentRef <= 0) {
        setMessage(t("admin.payment.messages.invalidStudentNumber"));
        return;
      }
      await createStudentFeeAdjustment({
        ...adjustmentForm,
        student_user_id: parsedStudentRef,
        fee_item_id: adjustmentForm.fee_item_id ? Number(adjustmentForm.fee_item_id) : null,
        value: Number(adjustmentForm.value || 0),
      });
      setMessage(t("admin.payment.messages.studentExceptionSaved"));
      setAdjustmentForm((p) => ({ ...p, student_user_id: "", fee_item_id: "", value: 0, reason: "" }));
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail) && detail.length) {
        setMessage(detail.map((d) => `${d.loc?.join?.(".") || "field"}: ${d.msg || ""}`).join(" | "));
      } else {
        setMessage(String(err?.message || t("admin.payment.messages.studentExceptionError")));
      }
    }
  };

  const saveBankSetting = async () => {
    try {
      await upsertBankAccountSetting({
        ...bankForm,
        college_id: toNullableCollege(bankForm.college_id),
        bank_name: String(bankForm.bank_name || "").trim(),
        account_holder_name: String(bankForm.account_holder_name || "").trim(),
        account_number: String(bankForm.account_number || "").trim(),
        iban: String(bankForm.iban || "").trim() || null,
        swift_code: String(bankForm.swift_code || "").trim() || null,
        branch_name: String(bankForm.branch_name || "").trim() || null,
        payment_note: String(bankForm.payment_note || "").trim() || null,
      });
      setMessage(t("admin.payment.messages.bankSaved"));
      await load();
    } catch (err) {
      setMessage(String(err?.message || t("admin.payment.messages.bankSaveError")));
    }
  };

  const renderSemesterOptions = (value, onChange) => (
    <select className="rounded-xl border p-2" value={value} onChange={onChange}>
      {SEMESTERS.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
  const getSemesterLabel = (value) => {
    const key = String(value || "").trim().toLowerCase();
    const found = SEMESTERS.find((s) => String(s.value || "").trim().toLowerCase() === key);
    return found?.label || value || "-";
  };

  const renderCollegeOptions = (value, onChange) => (
    <select className="rounded-xl border p-2" value={value} onChange={onChange}>
      {collegeOptions.map((c) => (
        <option key={String(c.id)} value={String(c.id)}>{c.name_ar || c.name_en || `College #${c.id}`}</option>
      ))}
    </select>
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6" dir="rtl">
      <div className="bg-white rounded-3xl border border-slate-200 p-6">
        <h1 className="text-2xl font-black text-slate-800">{t("admin.payment.title")}</h1>
        <p className="text-sm text-slate-500 mt-2">{t("admin.payment.subtitle")}</p>
        {!!message && <p className="mt-2 text-sm font-bold text-cyan-700">{message}</p>}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-black text-slate-800">{t("admin.payment.feesSettings")}</h2>
        <div className="grid md:grid-cols-6 gap-3">
          <input className="rounded-xl border p-2" value={cfgForm.academic_year_label} onChange={(e) => setCfgForm((p) => ({ ...p, academic_year_label: e.target.value }))} placeholder={t("admin.common.academicYear")} />
          {renderSemesterOptions(cfgForm.semester, (e) => setCfgForm((p) => ({ ...p, semester: e.target.value })))}
          {renderCollegeOptions(cfgForm.college_id, (e) => setCfgForm((p) => ({ ...p, college_id: e.target.value })))}
          <input
            className="rounded-xl border p-2"
            type="number"
            min="2000"
            max="2100"
            step="1"
            value={cfgForm.batch_year}
            onChange={(e) => setCfgForm((p) => ({ ...p, batch_year: e.target.value }))}
            placeholder={t("admin.payment.acceptanceBatch")}
          />
          <select className="rounded-xl border p-2" value={cfgForm.pricing_mode} onChange={(e) => setCfgForm((p) => ({ ...p, pricing_mode: e.target.value }))}>
            <option value="FIXED_TERM">{t("admin.payment.fixedTerm")}</option>
            <option value="CREDIT_HOUR">{t("admin.payment.creditHour")}</option>
          </select>
          <input className="rounded-xl border p-2" type="number" min="0" step="100" value={cfgForm.base_amount} onChange={(e) => setCfgForm((p) => ({ ...p, base_amount: e.target.value }))} placeholder={t("admin.payment.baseAmount")} />
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            className="rounded-xl border p-2"
            type="number"
            min="0"
            step="10"
            value={cfgForm.credit_hour_rate}
            onChange={(e) => setCfgForm((p) => ({ ...p, credit_hour_rate: e.target.value }))}
            placeholder={t("admin.payment.creditHourRate")}
          />
          <label className="flex items-center gap-2"><input type="checkbox" checked={cfgForm.split_main_terms} onChange={(e) => setCfgForm((p) => ({ ...p, split_main_terms: e.target.checked }))} /> {t("admin.payment.installmentSplit")}</label>
          <div className="text-xs text-slate-500 flex items-center">
            {t("admin.payment.installmentSplitHint")}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <label><input type="checkbox" checked={cfgForm.allow_online} onChange={(e) => setCfgForm((p) => ({ ...p, allow_online: e.target.checked }))} /> {t("admin.payment.online")}</label>
          <label><input type="checkbox" checked={cfgForm.allow_fawry} onChange={(e) => setCfgForm((p) => ({ ...p, allow_fawry: e.target.checked }))} /> {t("admin.payment.fawry")}</label>
          <label><input type="checkbox" checked={cfgForm.allow_bank_transfer} onChange={(e) => setCfgForm((p) => ({ ...p, allow_bank_transfer: e.target.checked }))} /> {t("admin.payment.bank")}</label>
          <label><input type="checkbox" checked={cfgForm.is_active} onChange={(e) => setCfgForm((p) => ({ ...p, is_active: e.target.checked }))} /> {t("admin.common.enabled")}</label>
        </div>
        <button onClick={saveConfig} className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm font-black">{t("admin.payment.saveFeesSettings")}</button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-black text-slate-800">{t("admin.payment.bankTransferData")}</h2>
        <div className="grid md:grid-cols-6 gap-3">
          <input className="rounded-xl border p-2" value={bankForm.academic_year_label} onChange={(e) => setBankForm((p) => ({ ...p, academic_year_label: e.target.value }))} placeholder={t("admin.common.academicYear")} />
          {renderSemesterOptions(bankForm.semester, (e) => setBankForm((p) => ({ ...p, semester: e.target.value })))}
          {renderCollegeOptions(bankForm.college_id, (e) => setBankForm((p) => ({ ...p, college_id: e.target.value })))}
          <input className="rounded-xl border p-2" value={bankForm.bank_name} onChange={(e) => setBankForm((p) => ({ ...p, bank_name: e.target.value }))} placeholder={t("admin.payment.bankName")} />
          <input className="rounded-xl border p-2" value={bankForm.account_holder_name} onChange={(e) => setBankForm((p) => ({ ...p, account_holder_name: e.target.value }))} placeholder={t("admin.payment.beneficiaryName")} />
          <input className="rounded-xl border p-2" value={bankForm.account_number} onChange={(e) => setBankForm((p) => ({ ...p, account_number: e.target.value }))} placeholder={t("admin.payment.accountNumber")} />
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <input className="rounded-xl border p-2" value={bankForm.iban} onChange={(e) => setBankForm((p) => ({ ...p, iban: e.target.value }))} placeholder={t("admin.payment.iban")} />
          <input className="rounded-xl border p-2" value={bankForm.swift_code} onChange={(e) => setBankForm((p) => ({ ...p, swift_code: e.target.value }))} placeholder={t("admin.payment.swift")} />
          <input className="rounded-xl border p-2" value={bankForm.branch_name} onChange={(e) => setBankForm((p) => ({ ...p, branch_name: e.target.value }))} placeholder={t("admin.payment.branch")} />
        </div>
        <input className="rounded-xl border p-2 w-full" value={bankForm.payment_note} onChange={(e) => setBankForm((p) => ({ ...p, payment_note: e.target.value }))} placeholder={t("admin.payment.note")} />
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={bankForm.is_active} onChange={(e) => setBankForm((p) => ({ ...p, is_active: e.target.checked }))} /> {t("admin.common.enabled")}</label>
        </div>
        <button onClick={saveBankSetting} className="rounded-xl bg-sky-700 text-white px-4 py-2 text-sm font-black">{t("admin.payment.saveBankData")}</button>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="p-2 text-right">ID</th>
                <th className="p-2 text-right">النطاق</th>
                <th className="p-2 text-right">البنك</th>
                <th className="p-2 text-right">المستفيد</th>
                <th className="p-2 text-right">رقم الحساب</th>
                <th className="p-2 text-right">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {bankSettings.map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="p-2">{b.id}</td>
                  <td className="p-2">{b.academic_year_label} - {getSemesterLabel(b.semester)}</td>
                  <td className="p-2">{b.bank_name}</td>
                  <td className="p-2">{b.account_holder_name || "-"}</td>
                  <td className="p-2">{b.account_number || "-"}</td>
                  <td className="p-2">
                    <button onClick={async () => { await deleteBankAccountSetting(b.id); await load(); }} className="rounded-lg bg-rose-600 text-white px-3 py-1 text-xs font-black">حذف</button>
                  </td>
                </tr>
              ))}
              {!bankSettings.length && !loading && <tr><td colSpan={6} className="p-3 text-slate-500">لا توجد بيانات حساب بنكي محفوظة.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-black text-slate-800">بنود الرسوم الإضافية</h2>
        <div className="grid md:grid-cols-6 gap-3">
          <input className="rounded-xl border p-2" value={feeForm.academic_year_label} onChange={(e) => setFeeForm((p) => ({ ...p, academic_year_label: e.target.value }))} placeholder="العام الأكاديمي" />
          {renderSemesterOptions(feeForm.semester, (e) => setFeeForm((p) => ({ ...p, semester: e.target.value })))}
          {renderCollegeOptions(feeForm.college_id, (e) => setFeeForm((p) => ({ ...p, college_id: e.target.value })))}
          <input className="rounded-xl border p-2" value={feeForm.name_ar} onChange={(e) => setFeeForm((p) => ({ ...p, name_ar: e.target.value }))} placeholder="اسم البند بالعربي" />
          <input className="rounded-xl border p-2" value={feeForm.item_code} onChange={(e) => setFeeForm((p) => ({ ...p, item_code: e.target.value }))} placeholder="كود البند (اختياري)" />
          <input className="rounded-xl border p-2" type="number" value={feeForm.amount_value} onChange={(e) => setFeeForm((p) => ({ ...p, amount_value: e.target.value }))} placeholder="القيمة" />
        </div>
        <div className="grid md:grid-cols-5 gap-3">
          <select className="rounded-xl border p-2" value={feeForm.amount_type} onChange={(e) => setFeeForm((p) => ({ ...p, amount_type: e.target.value }))}>
            <option value="FIXED">مبلغ ثابت</option>
            <option value="PERCENT">نسبة مئوية</option>
          </select>
          <select className="rounded-xl border p-2" value={feeForm.base_scope} onChange={(e) => setFeeForm((p) => ({ ...p, base_scope: e.target.value }))}>
            <option value="TOTAL">على الإجمالي</option>
            <option value="BASE_TUITION">على الرسوم الأساسية</option>
          </select>
          <input className="rounded-xl border p-2" type="number" value={feeForm.sort_order} onChange={(e) => setFeeForm((p) => ({ ...p, sort_order: e.target.value }))} placeholder="الترتيب" />
          <label className="flex items-center gap-2"><input type="checkbox" checked={feeForm.is_mandatory} onChange={(e) => setFeeForm((p) => ({ ...p, is_mandatory: e.target.checked }))} /> إلزامي</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={feeForm.is_active} onChange={(e) => setFeeForm((p) => ({ ...p, is_active: e.target.checked }))} /> مفعل</label>
        </div>
        <button onClick={addFeeItem} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-black">إضافة بند رسوم</button>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="p-2 text-right">ID</th>
                <th className="p-2 text-right">البند</th>
                <th className="p-2 text-right">القيمة</th>
                <th className="p-2 text-right">النطاق</th>
                <th className="p-2 text-right">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {feeItems.map((f) => (
                <tr key={f.id} className="border-b">
                  <td className="p-2">{f.id}</td>
                  <td className="p-2">{f.name_ar} ({f.item_code || "-"})</td>
                  <td className="p-2">{f.amount_value} {f.amount_type === "PERCENT" ? "%" : "EGP"}</td>
                  <td className="p-2">{f.academic_year_label} - {getSemesterLabel(f.semester)}</td>
                  <td className="p-2">
                    <button onClick={async () => { await deletePaymentFeeItem(f.id); await load(); }} className="rounded-lg bg-rose-600 text-white px-3 py-1 text-xs font-black">حذف</button>
                  </td>
                </tr>
              ))}
              {!feeItems.length && !loading && <tr><td colSpan={5} className="p-3 text-slate-500">لا توجد بنود رسوم إضافية</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-black text-slate-800">غرامة التأخير ({penaltyTitleHint})</h2>
        <div className="grid md:grid-cols-6 gap-3">
          <input className="rounded-xl border p-2" value={penaltyForm.academic_year_label} onChange={(e) => setPenaltyForm((p) => ({ ...p, academic_year_label: e.target.value }))} placeholder="العام الأكاديمي" />
          {renderSemesterOptions(penaltyForm.semester, (e) => setPenaltyForm((p) => ({ ...p, semester: e.target.value })))}
          {renderCollegeOptions(penaltyForm.college_id, (e) => setPenaltyForm((p) => ({ ...p, college_id: e.target.value })))}
          <select
            className="rounded-xl border p-2"
            value={String(penaltyForm.grace_period_days)}
            onChange={(e) => setPenaltyForm((p) => ({ ...p, grace_period_days: Number(e.target.value) }))}
          >
            {GRACE_DAYS_OPTIONS.map((days) => (
              <option key={`grace-days-${days}`} value={days}>
                {days} يوم
              </option>
            ))}
          </select>
          <select className="rounded-xl border p-2" value={penaltyForm.penalty_type} onChange={(e) => setPenaltyForm((p) => ({ ...p, penalty_type: e.target.value }))}>
            <option value="FIXED">مبلغ ثابت</option>
            <option value="PERCENT">نسبة مئوية</option>
          </select>
          <input className="rounded-xl border p-2" type="number" value={penaltyForm.penalty_value} onChange={(e) => setPenaltyForm((p) => ({ ...p, penalty_value: e.target.value }))} placeholder="قيمة الغرامة" />
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <input className="rounded-xl border p-2" type="number" value={penaltyForm.max_penalty_amount} onChange={(e) => setPenaltyForm((p) => ({ ...p, max_penalty_amount: e.target.value }))} placeholder="حد أقصى للغرامة (اختياري)" />
          <label className="flex items-center gap-2"><input type="checkbox" checked={penaltyForm.repeats_weekly} onChange={(e) => setPenaltyForm((p) => ({ ...p, repeats_weekly: e.target.checked }))} /> تتكرر أسبوعيًا</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={penaltyForm.is_active} onChange={(e) => setPenaltyForm((p) => ({ ...p, is_active: e.target.checked }))} /> مفعل</label>
        </div>
        <button onClick={savePenaltyRule} className="rounded-xl bg-amber-500 text-white px-4 py-2 text-sm font-black">حفظ قاعدة الغرامة</button>

        <div className="text-xs text-slate-600 space-y-1">
          {penaltyRules.map((r) => (
            <p key={r.id}>#{r.id} | {r.academic_year_label} - {getSemesterLabel(r.semester)} | grace: {r.grace_period_days} days | {r.penalty_type} {r.penalty_value}</p>
          ))}
          {!penaltyRules.length && !loading && <p>لا توجد قواعد غرامة محفوظة.</p>}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-black text-slate-800">استثناءات الطالب (ذوي الهمم/قرارات خاصة)</h2>
        <div className="grid md:grid-cols-6 gap-3">
          <input className="rounded-xl border p-2" type="number" value={adjustmentForm.student_user_id} onChange={(e) => setAdjustmentForm((p) => ({ ...p, student_user_id: e.target.value }))} placeholder="رقم الطالب (user_id أو كود الطالب)" />
          <input className="rounded-xl border p-2" value={adjustmentForm.academic_year_label} onChange={(e) => setAdjustmentForm((p) => ({ ...p, academic_year_label: e.target.value }))} placeholder="العام الأكاديمي" />
          {renderSemesterOptions(adjustmentForm.semester, (e) => setAdjustmentForm((p) => ({ ...p, semester: e.target.value })))}
          <select className="rounded-xl border p-2" value={adjustmentForm.adjustment_type} onChange={(e) => setAdjustmentForm((p) => ({ ...p, adjustment_type: e.target.value }))}>
            <option value="EXEMPT_ITEM">إعفاء من بند</option>
            <option value="EXTRA_DISCOUNT_FIXED">خصم إضافي مبلغ</option>
            <option value="EXTRA_DISCOUNT_PERCENT">خصم إضافي نسبة</option>
          </select>
          <select className="rounded-xl border p-2" value={adjustmentForm.fee_item_id} onChange={(e) => setAdjustmentForm((p) => ({ ...p, fee_item_id: e.target.value }))}>
            <option value="">اختر بند رسوم (اختياري)</option>
            {feeItems.map((f) => (
              <option key={f.id} value={f.id}>{f.name_ar} ({f.item_code || "-"})</option>
            ))}
          </select>
          <input className="rounded-xl border p-2" type="number" step="0.01" value={adjustmentForm.value} onChange={(e) => setAdjustmentForm((p) => ({ ...p, value: e.target.value }))} placeholder="قيمة الاستثناء" />
        </div>
        <input className="rounded-xl border p-2 w-full" value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm((p) => ({ ...p, reason: e.target.value }))} placeholder="سبب الاستثناء" />
        <button onClick={addStudentAdjustment} className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-black">حفظ استثناء الطالب</button>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="p-2 text-right">ID</th>
                <th className="p-2 text-right">الطالب</th>
                <th className="p-2 text-right">النوع</th>
                <th className="p-2 text-right">القيمة</th>
                <th className="p-2 text-right">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="p-2">{a.id}</td>
                  <td className="p-2">
                    {usersById?.[Number(a.student_user_id)] ? (
                      <div className="leading-6">
                        <div className="font-bold text-slate-800">{usersById[Number(a.student_user_id)]?.name || "-"}</div>
                        <div className="text-xs text-slate-500">
                          {usersById[Number(a.student_user_id)]?.username || "-"}
                          {usersById[Number(a.student_user_id)]?.studentCode ? ` • ${usersById[Number(a.student_user_id)]?.studentCode}` : ""}
                        </div>
                      </div>
                    ) : (
                      <span>{a.student_user_id}</span>
                    )}
                  </td>
                  <td className="p-2">{a.adjustment_type}</td>
                  <td className="p-2">{a.value}</td>
                  <td className="p-2">
                    <button onClick={async () => { await deleteStudentFeeAdjustment(a.id); await load(); }} className="rounded-lg bg-rose-600 text-white px-3 py-1 text-xs font-black">حذف</button>
                  </td>
                </tr>
              ))}
              {!adjustments.length && !loading && <tr><td colSpan={5} className="p-3 text-slate-500">لا توجد استثناءات طلاب حالية</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-black text-slate-800">سياسات خصم GPA</h2>
        <div className="grid md:grid-cols-6 gap-3">
          <input className="rounded-xl border p-2" value={policyForm.academic_year_label} onChange={(e) => setPolicyForm((p) => ({ ...p, academic_year_label: e.target.value }))} placeholder="العام الأكاديمي" />
          {renderSemesterOptions(policyForm.semester, (e) => setPolicyForm((p) => ({ ...p, semester: e.target.value })))}
          {renderCollegeOptions(policyForm.college_id, (e) => setPolicyForm((p) => ({ ...p, college_id: e.target.value })))}
          <select className="rounded-xl border p-2 bg-white" value={String(policyForm.min_gpa)} onChange={(e) => setPolicyForm((p) => ({ ...p, min_gpa: e.target.value }))}>
            {GPA_OPTIONS.map((gpa) => (
              <option key={`policy-min-gpa-${gpa}`} value={gpa}>
                حد GPA الأدنى: {gpa}
              </option>
            ))}
          </select>
          <select className="rounded-xl border p-2 bg-white" value={policyForm.max_gpa === "" ? "" : String(policyForm.max_gpa)} onChange={(e) => setPolicyForm((p) => ({ ...p, max_gpa: e.target.value }))}>
            <option value="">حد GPA الأعلى (اختياري)</option>
            {GPA_OPTIONS.map((gpa) => (
              <option key={`policy-max-gpa-${gpa}`} value={gpa}>
                حد GPA الأعلى: {gpa}
              </option>
            ))}
          </select>
          <select className="rounded-xl border p-2" value={policyForm.discount_type} onChange={(e) => setPolicyForm((p) => ({ ...p, discount_type: e.target.value }))}>
            <option value="PERCENT">نسبة مئوية</option>
            <option value="FIXED">مبلغ ثابت</option>
          </select>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <input className="rounded-xl border p-2" value={policyForm.discount_value} type="number" step="0.01" onChange={(e) => setPolicyForm((p) => ({ ...p, discount_value: e.target.value }))} placeholder="قيمة الخصم" />
          <input className="rounded-xl border p-2" value={policyForm.priority} type="number" onChange={(e) => setPolicyForm((p) => ({ ...p, priority: e.target.value }))} placeholder="الأولوية" />
        </div>
        <button onClick={addPolicy} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-black">إضافة سياسة خصم</button>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="p-2 text-right">ID</th>
                <th className="p-2 text-right">النطاق</th>
                <th className="p-2 text-right">النوع</th>
                <th className="p-2 text-right">القيمة</th>
                <th className="p-2 text-right">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-3 text-slate-500">جاري التحميل...</td></tr>
              ) : policies.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="p-2">{p.id}</td>
                  <td className="p-2">{p.academic_year_label} - {getSemesterLabel(p.semester)} - GPA {p.min_gpa} إلى {p.max_gpa ?? "4.0"}</td>
                  <td className="p-2">{p.discount_type}</td>
                  <td className="p-2">{p.discount_value}</td>
                  <td className="p-2"><button onClick={async () => { await deleteGpaDiscountPolicy(p.id); await load(); }} className="rounded-lg bg-rose-600 text-white px-3 py-1 text-xs font-black">حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-black text-slate-800">التهيئات الحالية للرسوم</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="p-2 text-right">العام/الترم</th>
                <th className="p-2 text-right">الكلية/الدفعة</th>
                <th className="p-2 text-right">النمط</th>
                <th className="p-2 text-right">الثابت</th>
                <th className="p-2 text-right">سعر الساعة</th>
                <th className="p-2 text-right">تقسيط الترمين</th>
              </tr>
            </thead>
            <tbody>
              {(configs || []).map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-2">{c.academic_year_label} - {c.semester}</td>
                  <td className="p-2">{c.college_id ?? "كل الكليات"} / {c.batch_year ?? "كل الدفعات"}</td>
                  <td className="p-2">{c.pricing_mode === "CREDIT_HOUR" ? "بالساعة" : "ثابت"}</td>
                  <td className="p-2">{Number(c.base_amount || 0).toLocaleString()} EGP</td>
                  <td className="p-2">{c.credit_hour_rate != null ? `${Number(c.credit_hour_rate).toLocaleString()} EGP` : "-"}</td>
                  <td className="p-2">{c.split_main_terms ? "مفعل" : "غير مفعل"}</td>
                </tr>
              ))}
              {!configs.length && !loading && <tr><td colSpan={6} className="p-3 text-slate-500">لا توجد إعدادات رسوم محفوظة.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6">
        <h3 className="font-black text-slate-800 mb-2">الإعدادات الحالية</h3>
        <div className="text-xs text-slate-600 space-y-1">
          {configs.map((c) => (
            <p key={c.id}>#{c.id} | {c.academic_year_label} - {c.semester} | الأساسي: {c.base_amount} | online:{String(c.allow_online)} fawry:{String(c.allow_fawry)} bank:{String(c.allow_bank_transfer)}</p>
          ))}
          {!configs.length && !loading && <p>لا توجد إعدادات رسوم بعد.</p>}
        </div>
      </div>
    </div>
  );
}
