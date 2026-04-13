import React, { useMemo } from "react";
import { Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import { SystemContext } from "../../context/SystemContext.jsx";
import { CoursesContext } from "../../context/CoursesContext.jsx";
import { useNavigate } from "react-router-dom";
import { deleteMyRegistrationSelection, getMyRegistration } from "../../services/advisorRegistrationApi.js";
import { getCurrentAcademicYear } from "../../utils/academicData.js";

const showAlert = (message, icon = "warning") =>
  Swal.fire({
    icon,
    text: String(message || ""),
    confirmButtonText: "OK",
    buttonsStyling: false,
    background: "#0f1720",
    color: "#e7f9f7",
    customClass: {
      popup: "rounded-3xl border border-[#1f3640]",
      confirmButton: "px-5 py-2.5 rounded-full font-bold text-slate-900 bg-[#79e6df] border-2 border-[#79e6df]",
    },
    didOpen: (el) => {
      el.style.direction = "rtl";
      el.style.textAlign = "right";
    },
  });

const confirmDeleteAlert = async (message) => {
  const result = await Swal.fire({
    title: "تأكيد الحذف",
    text: String(message || "هل أنت متأكد من حذف هذه المادة؟"),
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "حذف",
    cancelButtonText: "إلغاء",
    buttonsStyling: false,
    background: "#0f1720",
    color: "#e7f9f7",
    customClass: {
      popup: "rounded-3xl border border-[#1f3640]",
      confirmButton: "px-5 py-2.5 rounded-full font-bold text-slate-900 bg-[#79e6df] border-2 border-[#79e6df] mx-1",
      cancelButton: "px-5 py-2.5 rounded-full font-bold text-[#d7f6f2] bg-[#0e7f79] border border-[#0e7f79] mx-1",
    },
    didOpen: (el) => {
      el.style.direction = "rtl";
      el.style.textAlign = "right";
    },
  });
  return Boolean(result?.isConfirmed);
};

export default function RegisteredCoursesPage() {
  const navigate = useNavigate();
  const { openSemester, removePreliminaryAcademicRecord } = React.useContext(SystemContext);
  const { selectedCourses, removeSelectedCourse } = React.useContext(CoursesContext);

  const currentCourses = useMemo(
    () => selectedCourses.filter((c) => c.semester === openSemester),
    [selectedCourses, openSemester]
  );

  const totalHours = currentCourses.reduce((acc, c) => acc + Number(c.hours || 0), 0);

  const handleRemoveCourse = async (courseId) => {
    const current = currentCourses.find((c) => String(c?.id || c?.code || "") === String(courseId || ""));
    const lockedStatuses = new Set(["advisor_approved", "registered", "approved", "locked"]);
    const status = String(current?.status || "").trim().toLowerCase();
    if (lockedStatuses.has(status)) {
      await showAlert("لا يمكن حذف المادة بعد اعتماد/تنفيذ التسجيل. راجع المرشد الأكاديمي.", "info");
      return;
    }

    const confirmed = await confirmDeleteAlert("هل أنت متأكد من حذف هذه المادة من تسجيلك الحالي؟");
    if (!confirmed) return;

    const courseCode = String(current?.id || current?.code || courseId || "").trim();
    if (!courseCode) {
      await showAlert("تعذر تحديد كود المادة للحذف.", "error");
      return;
    }

    const user = JSON.parse(localStorage.getItem("loggedUser") || "{}");
    const studentId = user?.studentId || user?.username || "";
    try {
      const snapshot = await getMyRegistration(String(getCurrentAcademicYear()), openSemester);
      const requestStatus = String(snapshot?.request?.status || "").trim().toLowerCase();
      if (requestStatus) {
        const result = await deleteMyRegistrationSelection({
          academic_year_label: String(getCurrentAcademicYear()),
          semester: openSemester,
          course_code: courseCode,
          student_id_hint: String(user?.studentId || user?.username || "").trim(),
        });
        const reason = String(result?.reason || "").trim().toLowerCase();
        if (!result?.deleted) {
          if (reason === "selection_not_found" || reason === "request_not_found") {
            removeSelectedCourse(courseCode, openSemester);
            removePreliminaryAcademicRecord({ studentId, code: courseCode, semester: openSemester });
            await showAlert("المادة غير موجودة على السيرفر (بيانات محلية قديمة). تم تنظيف الواجهة وإعادة المزامنة.", "info");
            await getMyRegistration(String(getCurrentAcademicYear()), openSemester);
            return;
          }
          await showAlert(`Server did not delete this course (reason: ${reason || "unknown"}).`, "error");
          return;
        }
      }
    } catch (err) {
      await showAlert(err?.message || "تعذر حذف المادة من طلب التسجيل الحالي.", "error");
      return;
    }

    removeSelectedCourse(courseCode, openSemester);
    removePreliminaryAcademicRecord({ studentId, code: courseCode, semester: openSemester });
    await getMyRegistration(String(getCurrentAcademicYear()), openSemester);
  };

  return (
    <div className="min-h-screen m-[6em] bg-[#F8FAFC] font-[Tajawal] p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
          <h2 className="text-2xl font-black text-gray-800">المواد المسجلة</h2>
          <p className="text-sm text-gray-500">عدد المواد: {currentCourses.length} • مجموع الساعات: {totalHours}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {currentCourses.map((course) => (
            <div key={course.id} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-black text-gray-800">{course.name}</h3>
                  <p className="text-xs text-gray-500">{course.id}</p>
                </div>
                <button
                  onClick={() => handleRemoveCourse(course.id)}
                  disabled={["advisor_approved", "registered", "approved", "locked"].includes(String(course?.status || "").trim().toLowerCase())}
                  className="rounded-2xl border border-rose-200 text-rose-600 px-3 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                <div>المحاضرة: {course.lecture?.day} • {course.lecture?.time}</div>
                <div>السكشن: {course.selectedGroup?.name || "-"}</div>
                <div>عدد الساعات: {course.hours}</div>
              </div>
            </div>
          ))}
          {currentCourses.length === 0 && (
            <div className="col-span-full bg-white rounded-3xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
              لا توجد مواد مسجلة لهذا الترم.
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate("/student/summary")}
            className="rounded-2xl bg-slate-900 px-6 py-2 text-sm font-bold text-white"
          >
            الانتقال لملخص الترم
          </button>
          <button
            onClick={() => navigate("/student/registration")}
            className="rounded-2xl border border-gray-200 px-6 py-2 text-sm font-bold text-gray-700"
          >
            إضافة مواد أخرى
          </button>
        </div>
      </div>
    </div>
  );
}
