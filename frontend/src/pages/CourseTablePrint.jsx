import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, GraduationCap, Printer, QrCode, ShieldCheck } from "lucide-react";
import { SystemContext } from "../context/SystemContext";
import { calculateSemesterGpa, normalizeCourse } from "../utils/academicData";

const BNU_LOGO_SRC = "/assets/images/logo.png";
const APPROVED_REGISTRATION_STATUSES = new Set(["registered", "approved", "locked", "graded"]);
const displayValue = (value) => (value === undefined || value === null || value === "" ? "-" : value);

const resolveStudentKeys = (student) => {
    const keys = new Set();
    [student?.studentId, student?.username, student?.id].forEach((key) => {
        if (key !== undefined && key !== null && String(key).trim() !== "") keys.add(String(key));
    });
    return [...keys];
};

const matchStudent = (item, studentKeys) => {
    const itemKeys = [item?.studentId, item?.username, item?.userId]
        .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
        .map((v) => String(v));
    if (itemKeys.length === 0) return true;
    return itemKeys.some((k) => studentKeys.includes(k));
};

const parseAssessmentJson = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "string") return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const normalizeAssessmentComponents = (raw = []) =>
    (Array.isArray(raw) ? raw : [])
        .map((item, index) => {
            const key = String(item?.key || "").trim();
            if (!key) return null;
            const maxMarks = Number(item?.max_marks ?? item?.maxMarks ?? item?.max ?? 0);
            return {
                key,
                label_ar: String(item?.label_ar || item?.labelAr || item?.label || item?.name || key).trim(),
                label_en: String(item?.label_en || item?.labelEn || key).trim(),
                max_marks: Number.isFinite(maxMarks) ? maxMarks : 0,
                display_order: Number(item?.display_order ?? item?.displayOrder ?? index + 1) || index + 1,
            };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));

const getCourseAssessmentComponents = (record = {}) => {
    const course = record.courseMeta || {};
    const allowOverride = Boolean(course?.allowAssessmentOverride ?? course?.allow_assessment_override);
    const overrideRaw =
        course?.assessmentOverrideComponents ||
        course?.assessment_override_components ||
        parseAssessmentJson(course?.assessment_override_components_json);
    const overrideComponents = normalizeAssessmentComponents(overrideRaw);
    if (allowOverride && overrideComponents.length > 0) return overrideComponents;

    const templateRaw =
        course?.assessmentComponents ||
        course?.assessment_components ||
        course?.templateComponents ||
        parseAssessmentJson(course?.assessment_components_json);
    const templateComponents = normalizeAssessmentComponents(templateRaw);
    if (templateComponents.length > 0) return templateComponents;

    const hasLegacyKeys =
        Object.prototype.hasOwnProperty.call(record || {}, "mid1") ||
        Object.prototype.hasOwnProperty.call(record || {}, "mid2") ||
        Object.prototype.hasOwnProperty.call(record || {}, "yearWork") ||
        Object.prototype.hasOwnProperty.call(record || {}, "final");

    if (hasLegacyKeys) {
        return [
            { key: "mid1", label_ar: "ميد 1", max_marks: 15, display_order: 1 },
            { key: "mid2", label_ar: "ميد 2", max_marks: 15, display_order: 2 },
            { key: "coursework", label_ar: "أعمال السنة", max_marks: 30, display_order: 3 },
            { key: "final", label_ar: "النهائي", max_marks: 40, display_order: 4 },
        ];
    }

    return [];
};

const getRecordComponentValue = (record, componentKey) => {
    const key = String(componentKey || "");
    if (key === "mid1") return record?.mid1;
    if (key === "mid2") return record?.mid2;
    if (key === "coursework" || key === "yearWork") return record?.yearWork ?? record?.ywork;
    if (key === "final") return record?.final;
    if (record?.componentScores && typeof record.componentScores === "object") return record.componentScores[key];
    return "";
};

const getStatusLabel = (status) => (status === "graded" ? "مكتمل" : "قيد الانتظار");

export default function CourseTablePrint() {
    const navigate = useNavigate();
    const {
        academicRecords = [],
        studentRegistrations = [],
        semesterNames = {},
        courses: systemCourses = [],
    } = useContext(SystemContext);

    const student = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("loggedUser") || "{}");
        } catch {
            return {};
        }
    }, []);

    const studentKeys = useMemo(() => resolveStudentKeys(student), [student]);
    const studentId = String(student?.studentId || student?.username || student?.id || "");
    const studentNationalId = String(student?.nationalId || "-");

    const mergedRecords = useMemo(() => {
        const catalog = new Map();
        (Array.isArray(systemCourses) ? systemCourses : []).forEach((course) => {
            const normalized = normalizeCourse(course);
            const keys = [normalized.id, normalized.code, course?.id, course?.code]
                .map((item) => String(item || "").trim())
                .filter(Boolean);
            keys.forEach((key) => catalog.set(key, normalized));
        });

        const fromAcademic = academicRecords
            .filter((item) => matchStudent(item, studentKeys))
            .map((item) => {
                const code = String(item.code || item.id || "");
                const course = catalog.get(code);
                return {
                    ...item,
                    studentId: String(item.studentId || item.username || studentId),
                    code,
                    name: course?.name || item.name || item.courseName,
                    credits: Number(course?.credits || item.credits || item.hours || 0),
                    status: item.status || "pending_advisor",
                    semester: item.semester || "autumn",
                    academicYear: item.academicYear || "-",
                    courseMeta: course || null,
                };
            });

        const fromRegistrations = studentRegistrations
            .filter((item) => matchStudent(item, studentKeys))
            .map((item) => {
                const code = String(item.id || item.code || "");
                const course = catalog.get(code);
                return {
                    studentId: String(item.studentId || item.username || studentId),
                    code,
                    name: course?.name || item.name || item.courseName,
                    credits: Number(course?.credits || item.hours || item.credits || 0),
                    semester: item.semester || "autumn",
                    academicYear: item.academicYear || "-",
                    status: String(item.status || "pending_advisor").toLowerCase(),
                    mid1: "",
                    mid2: "",
                    yearWork: "",
                    final: "",
                    total: "",
                    grade: "",
                    courseMeta: course || null,
                };
            });

        const map = new Map();
        [...fromRegistrations, ...fromAcademic].forEach((row) => {
            const key = `${row.studentId}__${row.code}__${row.semester}`;
            const old = map.get(key);
            if (!old || row.status === "graded") map.set(key, { ...old, ...row });
        });
        return [...map.values()].filter((row) => APPROVED_REGISTRATION_STATUSES.has(String(row?.status || "").toLowerCase()));
    }, [academicRecords, studentRegistrations, studentKeys, studentId, systemCourses]);

    const hasApprovedRegistration = useMemo(() => {
        return (Array.isArray(studentRegistrations) ? studentRegistrations : []).some((item) => {
            if (!matchStudent(item, studentKeys)) return false;
            const status = String(item?.status || "").toLowerCase();
            return APPROVED_REGISTRATION_STATUSES.has(status);
        });
    }, [studentRegistrations, studentKeys]);

    const grouped = useMemo(() => {
        const map = new Map();
        mergedRecords.forEach((record) => {
            const semesterLabel = semesterNames?.[record.semester] || record.semester || "-";
            const academicYear = record.academicYear || "غير محدد";
            const key = `${academicYear}__${record.semester}`;
            if (!map.has(key)) {
                map.set(key, { key, title: `${semesterLabel} - العام الجامعي ${academicYear}`, records: [] });
            }
            map.get(key).records.push(record);
        });
        return [...map.values()];
    }, [mergedRecords, semesterNames]);

    const cumulativeGpa = useMemo(() => calculateSemesterGpa(mergedRecords).toFixed(2), [mergedRecords]);
    const registeredTerm = useMemo(() => grouped.map((g) => g.title).join(" | ") || "-", [grouped]);

    return (
        <div className="min-h-screen bg-slate-200 py-4 sm:py-10 px-2 sm:px-4 flex flex-col items-center font-sans" dir="rtl">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; padding: 0 !important; margin: 0 !important; }
                    .print-container {
                        box-shadow: none !important;
                        border: none !important;
                        margin: 0 !important;
                        width: 210mm !important;
                        min-height: 297mm !important;
                        padding: 15mm !important;
                    }
                    @page { size: A4 portrait; margin: 0; }
                    .watermark-bg {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 500px;
                        opacity: 0.05 !important;
                        z-index: 0;
                        pointer-events: none;
                    }
                }
                @media screen and (max-width: 768px) {
                    .print-container {
                        width: 100% !important;
                        min-height: auto !important;
                        padding: 12px !important;
                        border-radius: 12px;
                    }
                    .watermark-bg {
                        width: 280px !important;
                        top: 52% !important;
                    }
                }
            `}</style>

            <div className="no-print w-full max-w-5xl mb-6 flex items-center justify-between bg-white/80 backdrop-blur p-4 rounded-xl shadow-lg border border-white">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-6 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all font-bold">
                    <ArrowLeft size={20} />
                    رجوع للنظام
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-black text-white hover:bg-slate-900 shadow-lg hover:shadow-black/30 transition-all font-bold text-sm">
                    <Printer size={16} />
                    طباعة الوثيقة الرسمية
                </button>
            </div>

            <section className="print-container relative w-full max-w-[210mm] min-h-[297mm] bg-white border border-slate-300 shadow-[0_0_50px_rgba(0,0,0,0.1)] p-3 sm:p-[15mm] overflow-hidden flex flex-col">
                <img src={BNU_LOGO_SRC} className="watermark-bg absolute opacity-[0.03] pointer-events-none" alt="BNU Watermark" style={{ top: "55%", left: "50%", width: "450px" }} />

                <header className="relative z-10 flex flex-col-reverse gap-4 sm:flex-row sm:items-start sm:justify-between border-b-4 border-[#00acd5] pb-4 sm:pb-6 mb-6 sm:mb-8">
                    <div className="text-right space-y-1 w-full">
                        <h1 className="text-3xl font-black text-[#00acd5] leading-tight">جامعة بنها الأهلية</h1>
                        <h2 className="text-sm font-bold text-slate-500 tracking-[0.2em] mb-4">BENHA NATIONAL UNIVERSITY</h2>
                        <div className="mt-4 sm:mt-6 space-y-2 text-xs sm:text-sm text-slate-800 bg-slate-50 p-3 sm:p-4 rounded-lg border border-slate-100">
                            <p><span className="inline-block w-24 font-black text-slate-900">اسم الطالب:</span> {student?.name || "-"}</p>
                            <p><span className="inline-block w-24 font-black text-slate-900">الرقم القومي:</span> <span className="font-mono text-lg text-[#00acd5]">{studentNationalId}</span></p>
                            <p><span className="inline-block w-24 font-black text-slate-900">الكلية:</span> {student?.college || student?.faculty || student?.major || "غير محدد"}</p>
                            <p><span className="inline-block w-24 font-black text-slate-900">الترم المسجل:</span> {registeredTerm}</p>
                            <p><span className="inline-block w-24 font-black text-slate-900">GPA:</span> <span className="font-black text-[#00acd5]">{cumulativeGpa}</span></p>
                        </div>
                    </div>

                    <div className="flex flex-col items-center self-center sm:self-auto">
                        <div className="w-20 h-20 sm:w-32 sm:h-32 flex items-center justify-center p-2 mb-2 bg-white rounded-xl">
                            <img src={BNU_LOGO_SRC} alt="BNU Logo" className="max-w-full max-h-full object-contain" />
                        </div>
                        <div className="px-3 sm:px-4 py-1.5 rounded-full bg-[#00acd5] text-white text-[9px] sm:text-[10px] font-black shadow-md uppercase tracking-widest">Academic Transcript</div>
                    </div>
                </header>

                <main className="relative z-10 flex-grow">
                    <div className="flex items-center gap-2 sm:gap-3 mb-6 sm:mb-8 border-r-8 border-[#00acd5] bg-[#00acd5]/5 p-3 sm:p-4 rounded-l-xl">
                        <GraduationCap className="text-[#00acd5]" size={26} />
                        <div>
                            <h3 className="text-xl font-black text-slate-800">بيان الحالة الأكاديمية والدرجات</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">Official Student Grading Information</p>
                        </div>
                    </div>

                    {!hasApprovedRegistration ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-60">
                            <p className="text-xl font-bold">بانتظار موافقة المرشد على التسجيل</p>
                        </div>
                    ) : grouped.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-40">
                            <p className="text-xl font-bold">لا يوجد سجلات للعرض</p>
                        </div>
                    ) : (
                        grouped.map((group) => {
                            const tableComponents = (() => {
                                const byKey = new Map();
                                group.records.forEach((record) => {
                                    getCourseAssessmentComponents(record).forEach((component, index) => {
                                        const key = String(component?.key || "").trim();
                                        if (!key || byKey.has(key)) return;
                                        byKey.set(key, {
                                            ...component,
                                            key,
                                            display_order: Number(component?.display_order || index + 1) || index + 1,
                                        });
                                    });
                                });
                                const dynamic = Array.from(byKey.values()).sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
                                if (dynamic.length > 0) return dynamic;
                                return [
                                    { key: "mid1", label_ar: "ميد 1", display_order: 1 },
                                    { key: "mid2", label_ar: "ميد 2", display_order: 2 },
                                    { key: "coursework", label_ar: "أعمال السنة", display_order: 3 },
                                    { key: "final", label_ar: "النهائي", display_order: 4 },
                                ];
                            })();

                            return (
                                <div key={group.key} className="mb-10">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="h-4 w-4 rounded-full bg-[#00acd5]" />
                                        <h4 className="text-sm font-black text-[#00acd5] bg-[#00acd5]/10 px-4 py-1 rounded-full border border-[#00acd5]/20">{group.title}</h4>
                                    </div>
                                    <div className="overflow-x-auto md:overflow-x-visible rounded-xl border border-slate-200 shadow-sm">
                                        <table className="w-full min-w-[920px] md:min-w-0 border-collapse">
                                            <thead>
                                                <tr className="bg-[#00acd5] text-white">
                                                    <th className="p-3 text-[11px] w-24 border-l border-[#00acd5]/20">كود المقرر</th>
                                                    <th className="p-3 text-sm text-right border-l border-[#00acd5]/20">اسم المقرر الدراسي</th>
                                                    <th className="p-3 text-[11px] w-12 text-center border-l border-[#00acd5]/20">ساعة</th>
                                                    {tableComponents.map((component) => (
                                                        <th key={`head-${group.key}-${component.key}`} className="p-3 text-[11px] w-16 text-center border-l border-[#00acd5]/20">
                                                            {component.label_ar || component.label_en || component.key}
                                                        </th>
                                                    ))}
                                                    <th className="p-3 text-sm w-16 text-center font-black border-l border-[#00acd5]/20">المجموع</th>
                                                    <th className="p-3 text-sm w-14 text-center font-black border-l border-[#00acd5]/20">التقدير</th>
                                                    <th className="p-3 text-sm w-20 text-center font-black">الحالة</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-slate-800">
                                                {group.records.map((record, idx) => {
                                                    const rowComponents = getCourseAssessmentComponents(record);
                                                    const rowKeys = new Set(rowComponents.map((item) => String(item.key || "")));
                                                    const total = rowComponents.reduce((sum, component) => sum + (parseFloat(getRecordComponentValue(record, component.key)) || 0), 0);
                                                    const hasAnyScore = rowComponents.some((component) => {
                                                        const v = getRecordComponentValue(record, component.key);
                                                        return v !== undefined && v !== null && String(v).trim() !== "";
                                                    });

                                                    return (
                                                        <tr key={idx} className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                                            <td className="border border-slate-200 p-2.5 text-center font-mono text-xs">{displayValue(record.code)}</td>
                                                            <td className="border border-slate-200 p-2.5 font-bold text-sm text-slate-700">{displayValue(record.name)}</td>
                                                            <td className="border border-slate-200 p-2.5 text-center text-sm">{displayValue(record.credits)}</td>
                                                            {tableComponents.map((component) => {
                                                                const enabled = rowKeys.has(String(component.key || ""));
                                                                const value = enabled ? getRecordComponentValue(record, component.key) : "";
                                                                return (
                                                                    <td key={`${group.key}-${record.code}-${component.key}`} className="border border-slate-200 p-2.5 text-center text-sm text-slate-500">
                                                                        {enabled ? displayValue(value) : "-"}
                                                                    </td>
                                                                );
                                                            })}
                                                            <td className="border border-slate-200 p-2.5 text-center text-base font-black text-[#00acd5]">{hasAnyScore ? displayValue(total) : "-"}</td>
                                                            <td className="border border-slate-200 p-2.5 text-center font-black text-lg">{record.status === "graded" ? displayValue(record.grade) : "-"}</td>
                                                            <td className="border border-slate-200 p-2.5 text-center text-sm font-bold text-slate-700">{getStatusLabel(record.status)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </main>

                <footer className="mt-auto pt-10 border-t-2 border-slate-100">
                    <div className="grid grid-cols-3 gap-8 items-end">
                        <div className="text-center space-y-12">
                            <p className="text-sm font-black text-slate-800 underline decoration-[#00acd5] decoration-2 underline-offset-8">مسجل شؤون الطلاب</p>
                            <div className="w-full border-b border-dashed border-slate-300" />
                        </div>

                        <div className="flex flex-col items-center justify-center gap-4">
                            <div className="w-32 h-32 border-4 border-double border-[#00acd5]/40 rounded-full flex flex-col items-center justify-center relative bg-white shadow-inner">
                                <ShieldCheck size={40} className="text-[#00acd5]/20 mb-1" />
                                <span className="text-[7px] text-[#00acd5] font-black uppercase text-center leading-tight">Benha National<br />University Seal</span>
                            </div>
                        </div>

                        <div className="text-center space-y-12">
                            <p className="text-sm font-black text-slate-800 underline decoration-[#00acd5] decoration-2 underline-offset-8">يعتمد، عميد الكلية</p>
                            <div className="w-full border-b border-dashed border-slate-300" />
                        </div>
                    </div>

                    <div className="mt-12 flex justify-between items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="space-y-1">
                            <p className="text-[10px] text-slate-500 font-bold">مستند رسمي موثق رقميًا</p>
                            <p className="text-[10px] text-slate-400 font-bold">
                                تاريخ استخراج الوثيقة: {new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                            </p>
                        </div>
                        <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200">
                            <QrCode size={48} className="text-slate-800" strokeWidth={1.5} />
                        </div>
                    </div>
                </footer>
            </section>
        </div>
    );
}
