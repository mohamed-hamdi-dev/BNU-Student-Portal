import React, { useMemo } from "react";
import { Printer, ClipboardList } from "lucide-react";
import { SystemContext } from "../../context/SystemContext.jsx";
import { CoursesContext } from "../../context/CoursesContext.jsx";

const semesterLabels = {
  autumn: "الخريف",
  spring: "الربيع",
  summer: "الصيف",
};

export default function OpenSemesterSummaryPage() {
  const { openSemester } = React.useContext(SystemContext);
  const { selectedCourses } = React.useContext(CoursesContext);

  const currentCourses = useMemo(
    () => selectedCourses.filter((c) => c.semester === openSemester),
    [selectedCourses, openSemester]
  );

  const totalHours = currentCourses.reduce((acc, c) => acc + Number(c.hours || 0), 0);

  return (
    <div className="min-h-screen m-[10em] bg-[#F8FAFC] font-[Tajawal] p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-gray-800">ملخص الترم المفتوح</h2>
            <p className="text-sm text-gray-500">ترم {semesterLabels[openSemester]} • مواد {currentCourses.length}</p>
          </div>
          <button onClick={() => window.print()} className="rounded-2xl bg-slate-900 px-5 py-2 text-sm font-bold text-white">
            <Printer size={16} className="inline-block ml-2" />
            طباعة الملخص
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <ClipboardList size={18} /> مجموع الساعات: <span className="font-black">{totalHours}</span>
          </div>
          <div className="mt-4 space-y-3">
            {currentCourses.map((course) => (
              <div key={course.id} className="rounded-2xl border border-gray-100 p-4">
                <div className="font-black text-gray-800">{course.name}</div>
                <div className="text-xs text-gray-500">{course.id} • {course.hours} ساعات • {course.selectedGroup?.name || "-"}</div>
              </div>
            ))}
            {currentCourses.length === 0 && (
              <div className="text-center text-gray-400">لا توجد مواد في هذا الترم.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
