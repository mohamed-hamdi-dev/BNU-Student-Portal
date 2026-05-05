import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import { SystemContext } from "../../context/SystemContext.jsx";
import { getMyAttendanceByCourse, getMyAttendanceSummary } from "../../services/attendanceApi";
import { getCurrentAcademicYear } from "../../utils/academicData";

const statusMeta = {
  present: { label: "حاضر", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  absent: { label: "غائب", cls: "bg-rose-100 text-rose-700", icon: XCircle },
  late: { label: "متأخر", cls: "bg-amber-100 text-amber-700", icon: Clock3 },
  unmarked: { label: "غير محدد", cls: "bg-slate-100 text-slate-600", icon: CalendarDays },
};

export default function StudentAttendancePage() {
  const { openSemester } = React.useContext(SystemContext);
  const [summary, setSummary] = useState([]);
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [historyPayload, setHistoryPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await getMyAttendanceSummary({
          academic_year_label: getCurrentAcademicYear(),
          semester: openSemester || "autumn",
        });
        if (cancelled) return;
        const items = Array.isArray(response?.items) ? response.items : [];
        setSummary(items);
        setSelectedOfferingId(items[0] ? String(items[0].offering_id) : "");
      } catch (err) {
        if (!cancelled) {
          setSummary([]);
          setSelectedOfferingId("");
          setError(err?.message || "تعذر تحميل بيانات الغياب.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [openSemester]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selectedOfferingId) {
        setHistoryPayload(null);
        return;
      }
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const response = await getMyAttendanceByCourse(selectedOfferingId);
        if (!cancelled) setHistoryPayload(response);
      } catch (err) {
        if (!cancelled) {
          setHistoryPayload(null);
          setHistoryError(err?.message || "تعذر تحميل سجل الجلسات.");
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedOfferingId]);

  const selectedSummary = useMemo(
    () => summary.find((item) => String(item?.offering_id) === String(selectedOfferingId)) || historyPayload?.summary || null,
    [summary, selectedOfferingId, historyPayload]
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 pb-10 pt-28 font-[Tajawal]" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black text-slate-900">الغياب والحضور</h1>
          <p className="mt-2 text-sm text-slate-500">
            متابعة نسبة الحضور والغياب لكل مادة مسجلة خلال {openSemester || "الترم الحالي"}.
          </p>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <div className="col-span-full rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center text-slate-400">
              <Loader2 size={22} className="mx-auto mb-3 animate-spin" />
              جارٍ تحميل ملخص الغياب...
            </div>
          ) : null}

          {!loading && summary.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-slate-400">
              لا توجد بيانات حضور متاحة حتى الآن.
            </div>
          ) : null}

          {summary.map((item) => {
            const isActive = String(item.offering_id) === String(selectedOfferingId);
            return (
              <button
                key={item.offering_id}
                type="button"
                onClick={() => setSelectedOfferingId(String(item.offering_id))}
                className={`rounded-3xl border p-5 text-right shadow-sm transition ${
                  isActive ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white hover:border-cyan-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{item.display_title || item.course_title_ar || item.course_code || "مادة"}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.course_code || "-"} • الشعبة {item.section || "-"}
                    </p>
                  </div>
                  {item.warning ? (
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-black text-rose-700">تحذير غياب</span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">مستقر</span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-xs text-slate-500">إجمالي الجلسات</div>
                    <div className="mt-1 text-xl font-black text-slate-900">{item.total_sessions}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-xs text-slate-500">نسبة الحضور</div>
                    <div className="mt-1 text-xl font-black text-cyan-700">{item.attendance_percentage}%</div>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-3 py-3">
                    <div className="text-xs text-emerald-700">حاضر</div>
                    <div className="mt-1 text-xl font-black text-emerald-700">{item.present_count}</div>
                  </div>
                  <div className="rounded-2xl bg-amber-50 px-3 py-3">
                    <div className="text-xs text-amber-700">متأخر</div>
                    <div className="mt-1 text-xl font-black text-amber-700">{item.late_count}</div>
                  </div>
                  <div className="col-span-2 rounded-2xl bg-rose-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-rose-700">غياب</span>
                      <span className="text-sm font-black text-rose-700">
                        {item.absent_count} جلسة • {item.absence_percentage}%
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-rose-100">
                      <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, Number(item.absence_percentage || 0))}%` }} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h3 className="text-xl font-black text-slate-900">
              {selectedSummary?.display_title || selectedSummary?.course_title_ar || "سجل الجلسات"}
              {selectedSummary?.section ? ` - ${selectedSummary.section}` : ""}
            </h3>
            {selectedSummary?.warning ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                <AlertTriangle size={16} />
                نسبة الغياب وصلت إلى {selectedSummary.absence_percentage}% وهي أعلى من الحد المسموح للتحذير.
              </div>
            ) : null}
            {historyError ? <p className="mt-3 text-sm text-rose-600">{historyError}</p> : null}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-right">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3">الجلسة</th>
                  <th className="px-4 py-3">التاريخ</th>
                  <th className="px-4 py-3">الوقت</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">طريقة التسجيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {historyLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      جارٍ تحميل السجل...
                    </td>
                  </tr>
                ) : null}
                {!historyLoading && (!Array.isArray(historyPayload?.history) || historyPayload.history.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      لا توجد جلسات معروضة لهذه المادة حتى الآن.
                    </td>
                  </tr>
                ) : null}
                {(historyPayload?.history || []).map((item) => {
                  const meta = statusMeta[String(item?.status || "unmarked").toLowerCase()] || statusMeta.unmarked;
                  const Icon = meta.icon;
                  return (
                    <tr key={item.session_id}>
                      <td className="px-4 py-3 font-bold text-slate-800">{item.title}</td>
                      <td className="px-4 py-3 text-slate-600">{item.session_date}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.start_time || "-"} {item.end_time ? `- ${item.end_time}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${meta.cls}`}>
                          <Icon size={13} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{item.marked_method || item.session_status || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
