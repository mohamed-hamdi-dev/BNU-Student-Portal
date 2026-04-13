import React, { useMemo, useState } from "react";
import { listDoctorAdvisorOversight } from "../../services/advisorRegistrationApi";

const statusOptions = ["all", "advisor_requested", "advisor_approved", "need_info", "rejected", "registered"];
const STATUS_LABELS = {
  all: "الكل",
  advisor_requested: "بانتظار المرشد",
  advisor_approved: "تم اعتماد المرشد",
  need_info: "يحتاج استكمال",
  rejected: "مرفوض",
  registered: "تم التسجيل",
};

const getStatusLabel = (status) => STATUS_LABELS[String(status || "").trim()] || String(status || "-");

export default function DoctorAdvisorOversightPage() {
  const [filters, setFilters] = useState({
    status: "all",
    semester: "",
    is_after_window: "",
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const stats = useMemo(
    () => ({
      total: rows.length,
      afterWindow: rows.filter((item) => item.is_after_window).length,
      registered: rows.filter((item) => item.status === "registered").length,
    }),
    [rows]
  );

  const loadRows = async () => {
    try {
      setLoading(true);
      const query = {};
      if (filters.status && filters.status !== "all") query.status = filters.status;
      if (filters.semester) query.semester = filters.semester;
      if (filters.is_after_window !== "") query.is_after_window = filters.is_after_window;
      const data = await listDoctorAdvisorOversight(query);
      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      alert(error?.message || "تعذر تحميل تقارير المتابعة");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadRows();
  }, [filters]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6" dir="rtl">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-800">متابعة الدكتور لتسجيلات المرشد</h1>
        <p className="text-sm text-slate-500 mt-1">عرض وفلاتر لكل الطلبات التي تمت عبر المرشد الأكاديمي.</p>
        <div className="grid md:grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold">إجمالي الحالات: {stats.total}</div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold">بعد غلق التسجيل: {stats.afterWindow}</div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold">تم التسجيل: {stats.registered}</div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="h-10 rounded-xl border border-slate-200 px-3 bg-white"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status)}
              </option>
            ))}
          </select>
          <select
            value={filters.semester}
            onChange={(e) => setFilters((prev) => ({ ...prev, semester: e.target.value }))}
            className="h-10 rounded-xl border border-slate-200 px-3 bg-white"
          >
            <option value="">كل الفصول</option>
            <option value="autumn">autumn</option>
            <option value="spring">spring</option>
            <option value="summer">summer</option>
          </select>
          <select
            value={filters.is_after_window}
            onChange={(e) => setFilters((prev) => ({ ...prev, is_after_window: e.target.value }))}
            className="h-10 rounded-xl border border-slate-200 px-3 bg-white"
          >
            <option value="">كل الطلبات</option>
            <option value="true">بعد الغلق فقط</option>
            <option value="false">داخل الفترة فقط</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">جاري التحميل...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد بيانات مطابقة.</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 overflow-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-right">رقم الطلب</th>
                  <th className="px-3 py-2 text-right">الطالب</th>
                  <th className="px-3 py-2 text-right">المرشد</th>
                  <th className="px-3 py-2 text-right">الفصل</th>
                  <th className="px-3 py-2 text-right">الحالة</th>
                  <th className="px-3 py-2 text-right">بعد الغلق</th>
                  <th className="px-3 py-2 text-right">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-bold">#{item.id}</td>
                    <td className="px-3 py-2">{item.student_user_id}</td>
                    <td className="px-3 py-2">{item.advisor_user_id || "-"}</td>
                    <td className="px-3 py-2">{item.academic_year_label} - {item.semester}</td>
                    <td className="px-3 py-2">{getStatusLabel(item.status)}</td>
                    <td className="px-3 py-2">{item.is_after_window ? "نعم" : "لا"}</td>
                    <td className="px-3 py-2">{item.advisor_note || item.requested_note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
