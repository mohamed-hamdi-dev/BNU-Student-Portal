import React, { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { SystemContext } from "../../context/SystemContext";
import { CoursesContext } from "../../context/CoursesContext";
import { getMyRegistration } from "../../services/advisorRegistrationApi";
import { getCurrentAcademicYear } from "../../utils/academicData";

const display = (value, fallback = "-") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

export default function RegistrationFormPage() {
  const { t, i18n } = useTranslation("global");
  const { openSemester, semesterNames } = useContext(SystemContext);
  const { selectedCourses } = useContext(CoursesContext);
  const [serverCourses, setServerCourses] = useState([]);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("loggedUser") || "{}");
    } catch {
      return {};
    }
  }, []);
  const officialName = useMemo(
    () => user?.universityName || user?.full_name || user?.NameID || user?.name || user?.displayName || user?.username || "",
    [user]
  );

  const localSemesterCourses = useMemo(
    () => selectedCourses.filter((course) => String(course.semester || "") === String(openSemester || "")),
    [selectedCourses, openSemester]
  );

  useEffect(() => {
    let active = true;
    const hydrateFromBackend = async () => {
      try {
        if (!openSemester) {
          if (active) setServerCourses([]);
          return;
        }
        const response = await getMyRegistration(String(getCurrentAcademicYear()), String(openSemester));
        if (!active) return;

        const selections = Array.isArray(response?.selections) ? response.selections : [];
        const localByCode = new Map(
          localSemesterCourses.map((course) => [String(course?.id || course?.code || "").trim().toUpperCase(), course])
        );

        const mapped = selections
          .map((selection, index) => {
            const courseCode = String(selection?.course_code || "").trim();
            const normalizedCode = courseCode.toUpperCase();
            const localCourse = localByCode.get(normalizedCode);
            return {
              id: localCourse?.id || courseCode || `srv-${index}`,
              code: courseCode || localCourse?.code || "-",
              name: localCourse?.name || selection?.course_name || selection?.offering_title || "-",
              semester: String(openSemester || ""),
              lecture: {
                day: selection?.day_of_week || localCourse?.lecture?.day || "",
                time:
                  selection?.start_time && selection?.end_time
                    ? `${selection.start_time} - ${selection.end_time}`
                    : localCourse?.lecture?.time || "",
              },
              selectedGroup: {
                name: selection?.section || localCourse?.selectedGroup?.name || "-",
              },
              hours: Number(localCourse?.hours || localCourse?.credits || selection?.credit_hours || 0) || 0,
              credits: Number(localCourse?.credits || localCourse?.hours || selection?.credit_hours || 0) || 0,
            };
          })
          .filter((course) => String(course.code || "").trim());

        setServerCourses(mapped);
      } catch {
        if (active) setServerCourses([]);
      }
    };

    hydrateFromBackend();
    return () => {
      active = false;
    };
  }, [openSemester, localSemesterCourses]);

  const semesterCourses = useMemo(() => {
    if (serverCourses.length > 0) return serverCourses;
    return localSemesterCourses;
  }, [serverCourses, localSemesterCourses]);

  const totalHours = useMemo(
    () => semesterCourses.reduce((sum, course) => sum + Number(course.hours || course.credits || 0), 0),
    [semesterCourses]
  );

  const issueDate = useMemo(
    () =>
      new Date().toLocaleDateString(i18n.language === "ar" ? "ar-EG" : "en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    [i18n.language]
  );

  const semesterLabel = semesterNames?.[openSemester] || openSemester || "-";

  return (
    <div className="min-h-screen bg-[#F6F8FB] py-8 px-4" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="print:hidden flex items-center justify-between">
          <h1 className="text-2xl font-black text-slate-800">{t("registration_form")}</h1>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#05ADCF] px-4 py-2 text-sm font-bold text-white hover:brightness-110"
          >
            <Printer size={16} />
            {i18n.language === "ar" ? "طباعة" : "Print"}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 border-b border-slate-100 pb-4">
            <h2 className="text-xl font-black text-slate-800">{i18n.language === "ar" ? "استمارة تسجيل المواد" : "Course Registration Form"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {i18n.language === "ar" ? "الفصل الدراسي" : "Semester"}: <span className="font-bold text-slate-700">{display(semesterLabel)}</span>
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{i18n.language === "ar" ? "اسم الطالب" : "Student Name"}</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{display(officialName)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{i18n.language === "ar" ? "كود الطالب" : "Student ID"}</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{display(user?.studentId || user?.username)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{i18n.language === "ar" ? "الكلية" : "College"}</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{display(user?.college || user?.faculty || user?.major)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{i18n.language === "ar" ? "تاريخ الإصدار" : "Issue Date"}</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{issueDate}</p>
            </div>
          </div>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-start font-bold text-slate-600">{i18n.language === "ar" ? "كود المادة" : "Course Code"}</th>
                  <th className="px-4 py-3 text-start font-bold text-slate-600">{i18n.language === "ar" ? "اسم المادة" : "Course Name"}</th>
                  <th className="px-4 py-3 text-start font-bold text-slate-600">{i18n.language === "ar" ? "المحاضرة" : "Lecture"}</th>
                  <th className="px-4 py-3 text-start font-bold text-slate-600">{i18n.language === "ar" ? "السكشن" : "Section"}</th>
                  <th className="px-4 py-3 text-center font-bold text-slate-600">{i18n.language === "ar" ? "الساعات" : "Hours"}</th>
                </tr>
              </thead>
              <tbody>
                {semesterCourses.map((course) => (
                  <tr key={`${course.id}-${course.semester}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold text-slate-700">{display(course.id || course.code)}</td>
                    <td className="px-4 py-3 text-slate-700">{display(course.name)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {display(course?.lecture?.day)} - {display(course?.lecture?.time)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{display(course?.selectedGroup?.name)}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-800">{Number(course.hours || course.credits || 0)}</td>
                  </tr>
                ))}
                {semesterCourses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      {i18n.language === "ar" ? "لا توجد مواد مسجلة لهذا الفصل حتى الآن." : "No registered courses for this semester yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl bg-[#05ADCF]/10 px-4 py-3">
            <span className="text-sm font-bold text-slate-700">{i18n.language === "ar" ? "عدد المواد المسجلة" : "Registered Courses"}</span>
            <span className="text-sm font-black text-[#037C95]">{semesterCourses.length}</span>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-[#05ADCF]/10 px-4 py-3">
            <span className="text-sm font-bold text-slate-700">{i18n.language === "ar" ? "إجمالي الساعات" : "Total Hours"}</span>
            <span className="text-sm font-black text-[#037C95]">{totalHours}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
