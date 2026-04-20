import React, { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Printer, Award, Clock, ChevronDown, GraduationCap, Calendar } from "lucide-react";
import { SystemContext } from "../context/SystemContext";
import { calculateSemesterGpa, normalizeCourse, normalizeSemesterValue } from "../utils/academicData";
import { listMyAdvisorRequests, getMyStudentProfile } from "../services/advisorRegistrationApi";

const APPROVED_REGISTRATION_STATUSES = new Set(["registered", "approved", "locked", "graded"]);
const safeParse = (value, fallback) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};
const selectionKey = (academicYear, semester, cycle) => `${academicYear || ""}__${semester || ""}__${cycle}`;

const displayValue = (value) => (value === undefined || value === null || value === "" ? "-" : value);
const hasActualValue = (value) => value !== undefined && value !== null && String(value).trim() !== "";
const pendingPillClass = "inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] leading-none font-black text-amber-700";
const completedPillClass = "inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] leading-none font-black text-emerald-700";
const normalizeGradeValue = (grade) => String(grade || "").trim().toUpperCase().replace(/\s+/g, "");
const gradeBadgeClass = (grade) => {
    const normalized = normalizeGradeValue(grade);
    if (!normalized) return "bg-slate-100 text-slate-600 border-slate-200";
    const palette = {
        "A+": "bg-emerald-100 text-emerald-700 border-emerald-200",
        A: "bg-emerald-50 text-emerald-700 border-emerald-200",
        "A-": "bg-green-50 text-green-700 border-green-200",
        "B+": "bg-cyan-100 text-cyan-700 border-cyan-200",
        B: "bg-sky-100 text-sky-700 border-sky-200",
        "B-": "bg-blue-100 text-blue-700 border-blue-200",
        "C+": "bg-amber-100 text-amber-700 border-amber-200",
        C: "bg-yellow-100 text-yellow-700 border-yellow-200",
        "C-": "bg-orange-100 text-orange-700 border-orange-200",
        "D+": "bg-rose-100 text-rose-700 border-rose-200",
        D: "bg-red-100 text-red-700 border-red-200",
        F: "bg-red-200 text-red-800 border-red-300",
    };
    return palette[normalized] || "bg-violet-100 text-violet-700 border-violet-200";
};
const statusLabel = (status, t) => {
    if (status === "graded") return t("course_table_status_completed");
    if (status === "registered") return t("course_table_status_registered");
    return t("course_table_status_pending");
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
    const overrideRaw = course?.assessmentOverrideComponents || course?.assessment_override_components || parseAssessmentJson(course?.assessment_override_components_json);
    const overrideComponents = normalizeAssessmentComponents(overrideRaw);
    if (allowOverride && overrideComponents.length > 0) return overrideComponents;

    const templateRaw = course?.assessmentComponents || course?.assessment_components || course?.templateComponents || parseAssessmentJson(course?.assessment_components_json);
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

    const legacy = [
        { key: "mid1", label_ar: "ميد 1", max_marks: Number(course?.mid1 ?? record?.mid1 ?? 0), display_order: 1 },
        { key: "mid2", label_ar: "ميد 2", max_marks: Number(course?.mid2 ?? record?.mid2 ?? 0), display_order: 2 },
        { key: "coursework", label_ar: "أعمال السنة", max_marks: Number(course?.yearWork ?? course?.ywork ?? record?.yearWork ?? 0), display_order: 3 },
        { key: "final", label_ar: "النهائي", max_marks: Number(course?.final ?? record?.final ?? 0), display_order: 4 },
    ];
    return legacy.filter((item) => Number(item.max_marks || 0) > 0);
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
const recordHasPublishedFallback = (record = {}, cycleKey = "") => {
    const cycleValue = getRecordComponentValue(record, cycleKey);
    if (hasActualValue(cycleValue)) return true;
    if (cycleKey === "final" && hasActualValue(record?.grade)) return true;
    if (hasActualValue(record?.total)) return true;
    return String(record?.status || "").trim().toLowerCase() === "graded";
};
const toArabicComponentLabel = (component = {}) => {
    const key = String(component?.key || "").trim();
    if (key === "mid1") return "ميد1";
    if (key === "mid2") return "ميد2";
    if (key === "coursework" || key === "yearWork") return "أعمال السنة";
    if (key === "final") return "نهائي";
    return String(component?.label_ar || component?.label_en || key);
};
const buildDistributionText = (components = []) =>
    (Array.isArray(components) ? components : [])
        .map((component) => `${toArabicComponentLabel(component)} ${Number(component?.max_marks || 0)}`)
        .join(" | ");

const SemesterTable = ({ records, publishMap }) => {
    const { t } = useTranslation("global");
    const tableComponents = useMemo(() => {
        const byKey = new Map();
        records.forEach((record) => {
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
            { key: "mid1", label_ar: t("course_table_mid_1"), display_order: 1 },
            { key: "mid2", label_ar: t("course_table_mid_2"), display_order: 2 },
            { key: "coursework", label_ar: t("course_table_year_work"), display_order: 3 },
            { key: "final", label_ar: t("course_table_final"), display_order: 4 },
        ];
    }, [records, t]);

    const isCyclePublished = (record, cycle) => {
        const key = selectionKey(record.academicYear, record.semester, cycle);
        const status = publishMap?.[key];
        if (!status) return recordHasPublishedFallback(record, cycle);
        return status === "Published";
    };

    const renderTable = () => (
        <table dir="rtl" className="w-full table-fixed text-right border-separate border-spacing-0">
            <thead>
                <tr className="bg-gradient-to-l from-[#05ADCF] to-[#0496B4] text-white">
                    <th className="px-5 py-3 text-sm font-bold rounded-tr-2xl">{t("course_table_code")}</th>
                    <th className="px-5 py-3 text-sm font-bold">{t("course_table_course_name")}</th>
                    <th className="px-5 py-3 text-sm font-bold text-center">{t("course_table_credits")}</th>
                    {tableComponents.map((component) => (
                        <th key={`head-${component.key}`} className="px-5 py-3 text-sm font-bold text-center">
                            {component.label_ar || component.label_en || component.key}
                        </th>
                    ))}
                    <th className="px-5 py-3 text-sm font-bold text-center">{t("course_table_total")}</th>
                    <th className="px-5 py-3 text-sm font-bold text-center">{t("course_table_grade")}</th>
                    <th className="px-5 py-3 text-sm font-bold text-center rounded-tl-2xl">{t("course_table_status")}</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {records.map((record) => {
                    const rowComponents = getCourseAssessmentComponents(record);
                    const rowKeys = new Set(rowComponents.map((item) => String(item.key || "")));
                    const hasFinalComponent = rowKeys.has("final");
                    const total = rowComponents.reduce((sum, component) => sum + (parseFloat(getRecordComponentValue(record, component.key)) || 0), 0);
                    const distributionText = buildDistributionText(rowComponents);
                const canShowTotal = rowComponents.length > 0;
                const hasAnyVisibleMark = rowComponents.some((component) => isCyclePublished(record, component.key));
                const finalVisible = hasFinalComponent && isCyclePublished(record, "final");
                const finalScore = getRecordComponentValue(record, "final");
                const hasFinalScore = hasActualValue(finalScore);
                const hasGradeValue = hasActualValue(record.grade);
                const isFullyCompleted = finalVisible && hasFinalScore && hasGradeValue;
                const gradeValue = isFullyCompleted ? displayValue(record.grade) : t("course_table_status_pending");

                return (
                        <tr
                            key={`${record.studentId}__${record.code}__${record.semester}__${record.academicYear || ""}`}
                            className="relative z-0 hover:z-20 hover:bg-[#05ADCF]/5 transition-colors"
                        >
                            <td className="px-3 py-3 text-sm font-bold text-gray-700 break-words">{record.code}</td>
                            <td className="px-5 py-3 text-sm text-gray-600">
                                <div className="group relative inline-block max-w-full">
                                    <button
                                        type="button"
                                        className="max-w-full text-right font-medium text-gray-700 transition-colors hover:text-cyan-700 focus:outline-none focus:text-cyan-700"
                                    >
                                        {record.name}
                                    </button>
                                    {distributionText && (
                                        <div className="pointer-events-none invisible absolute right-0 top-full z-[120] mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 text-[10px] text-slate-600 shadow-xl opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                                            <div className="mb-1 border-b border-slate-100 pb-1">
                                                <p className="font-black text-slate-800 leading-tight">{record.name}</p>
                                                <p className="text-[9px] font-bold text-slate-400">{record.code}</p>
                                            </div>
                                            <div className="flex flex-wrap gap-1 leading-relaxed">
                                                {rowComponents.map((component) => (
                                                    <span key={`${record.code}-${component.key}`} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                                                        <span className="text-slate-500">{toArabicComponentLabel(component)}</span>
                                                        <span className="font-black text-cyan-700">{Number(component?.max_marks || 0)}</span>
                                                    </span>
                                                ))}
                                            </div>
                                            <span className="absolute -top-1 right-5 h-2 w-2 rotate-45 border-l border-t border-slate-200 bg-white" />
                                        </div>
                                    )}
                                </div>
                            </td>
                            <td className="px-5 py-3 text-center font-bold text-[#05ADCF]">{displayValue(record.credits)}</td>
                            {tableComponents.map((component) => {
                                const enabled = rowKeys.has(String(component.key || ""));
                                const published = enabled ? isCyclePublished(record, component.key) : false;
                                const value = enabled ? getRecordComponentValue(record, component.key) : "-";
                                return (
                                    <td key={`${record.code}-${record.studentId}-${component.key}`} className="px-5 py-3 text-center text-gray-500">
                                        {!enabled ? (
                                            <span className="text-slate-300" title="غير مطبق على هذه المادة">
                                                —
                                            </span>
                                        ) : published ? (
                                            displayValue(value)
                                        ) : (
                                            "-"
                                        )}
                                    </td>
                                );
                            })}
                            <td className="px-5 py-3 text-center font-black text-gray-700">{canShowTotal ? displayValue(total) : "-"}</td>
                            <td className="px-5 py-3 text-center">
                                {isFullyCompleted ? (
                                    <span className={`inline-flex items-center justify-center min-w-14 rounded-full border px-2.5 py-1 text-xs font-black ${gradeBadgeClass(gradeValue)}`}>
                                        {gradeValue}
                                    </span>
                                ) : (
                                    <span className={pendingPillClass}>
                                        {gradeValue}
                                    </span>
                                )}
                            </td>
                            <td className="px-5 py-3 text-center">
                                <span className={isFullyCompleted ? completedPillClass : pendingPillClass}>
                                    {isFullyCompleted ? t("course_table_status_completed") : t("course_table_status_pending")}
                                </span>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    const renderMobileCards = () => (
        <div className="md:hidden space-y-2 p-2">
            {records.map((record) => {
                const rowComponents = getCourseAssessmentComponents(record);
                const rowKeys = new Set(rowComponents.map((item) => String(item.key || "")));
                const hasFinalComponent = rowKeys.has("final");
                const total = rowComponents.reduce((sum, component) => sum + (parseFloat(getRecordComponentValue(record, component.key)) || 0), 0);
                const maxTotal = rowComponents.reduce((sum, component) => sum + Number(component?.max_marks || 0), 0);
                const canShowTotal = rowComponents.length > 0;
                const finalVisible = hasFinalComponent && isCyclePublished(record, "final");
                const finalScore = getRecordComponentValue(record, "final");
                const hasFinalScore = hasActualValue(finalScore);
                const hasGradeValue = hasActualValue(record.grade);
                const isFullyCompleted = finalVisible && hasFinalScore && hasGradeValue;
                const visibleGrade = isFullyCompleted ? displayValue(record.grade) : t("course_table_status_pending");
                const visibleStatus = isFullyCompleted ? t("course_table_status_completed") : t("course_table_status_pending");
                const statusBadgeClass =
                    isFullyCompleted
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : "bg-amber-100 text-amber-700 border-amber-200";

                return (
                    <article
                        key={`${record.studentId}__${record.code}__${record.semester}__${record.academicYear || ""}__mobile`}
                        className="overflow-hidden rounded-xl border border-cyan-200/90 bg-white shadow-sm"
                    >
                        <div className="border-b border-slate-100 px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <span
                                        className={
                                            isFullyCompleted
                                                ? `inline-flex items-center justify-center min-w-12 rounded-full border px-2 py-0.5 text-[11px] font-black ${gradeBadgeClass(visibleGrade)}`
                                                : pendingPillClass
                                        }
                                    >
                                        {visibleGrade}
                                    </span>
                                    <p className="text-[9px] font-bold text-slate-400">
                                        {canShowTotal ? `${displayValue(total)}/${maxTotal || 0}` : "-"}
                                    </p>
                                </div>
                                <div className="min-w-0 text-left">
                                    <p className="text-[13px] font-black text-slate-800 truncate">{record.name}</p>
                                    <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[9px] font-bold text-slate-400">
                                        <span className="font-black text-slate-500">{record.code}</span>
                                        <span aria-hidden="true">•</span>
                                        <span>{displayValue(record.credits)} {t("course_table_credits")}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-1.5">
                            <div className="grid grid-cols-4 gap-1">
                            {tableComponents.map((component) => {
                                const enabled = rowKeys.has(String(component.key || ""));
                                const published = enabled ? isCyclePublished(record, component.key) : false;
                                const value = enabled ? getRecordComponentValue(record, component.key) : "-";
                                const shownValue = !enabled ? "—" : published ? displayValue(value) : "-";
                                return (
                                    <div key={`${record.code}-${record.studentId}-${component.key}-mobile`} className="rounded-lg border border-slate-200 bg-slate-50 px-1 py-1 text-center">
                                        <p className="text-[9px] font-black text-slate-500 truncate">{component.label_ar || component.label_en || component.key}</p>
                                        <p className="mt-0.5 text-base leading-none font-black text-slate-800">{shownValue}</p>
                                    </div>
                                );
                            })}
                            </div>

                            <div className="mt-1.5 rounded-lg border border-cyan-100 bg-cyan-50/70 px-2 py-1.5 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-black text-slate-700">{t("course_table_status")}:</span>
                                    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] leading-none font-black ${statusBadgeClass}`}>
                                        {visibleStatus}
                                    </span>
                                </div>
                                <div className="text-[11px] font-black text-cyan-800">
                                    {t("course_table_total")}: {canShowTotal ? displayValue(total) : "-"}
                                </div>
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );

    return (
        <div className="relative z-10 rounded-2xl border border-gray-100 bg-white/50 backdrop-blur-md shadow-sm overflow-visible">
            {renderMobileCards()}
            <div className="hidden md:block w-full overflow-visible">{renderTable()}</div>
        </div>
    );
};

const AccordionItem = ({ item, isOpen, onToggle, publishMap }) => {
    const { t } = useTranslation("global");
    const gpa = calculateSemesterGpa(item.records);

    return (
        <div className="mb-5">
            <button
                onClick={onToggle}
                className={`w-full flex justify-between items-center p-5 rounded-2xl transition-all ${isOpen ? "bg-white shadow-xl ring-2 ring-[#05ADCF]/20" : "bg-white/60 hover:bg-white shadow-md"}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${isOpen ? "bg-[#05ADCF] text-white" : "bg-[#05ADCF]/10 text-[#05ADCF]"}`}>
                        <Calendar size={22} />
                    </div>
                    <div className="text-right">
                        <h3 className="font-black text-gray-800 text-lg">{item.title}</h3>
                        <p className="text-xs text-gray-400">{t("course_table_academic_semester_block")}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-left">
                        <p className="text-[10px] text-gray-400">{t("course_table_semester_gpa")}</p>
                        <p className="text-lg font-black text-[#05ADCF]">{gpa.toFixed(2)}</p>
                    </div>
                    <ChevronDown className={`transition-transform ${isOpen ? "rotate-180 text-[#05ADCF]" : "text-gray-300"}`} size={22} />
                </div>
            </button>

            <div className={`transition-[max-height,opacity,margin] duration-300 ${isOpen ? "overflow-visible max-h-[2200px] opacity-100 mt-3" : "overflow-hidden max-h-0 opacity-0 mt-0 pointer-events-none"}`}>
                <SemesterTable records={item.records} publishMap={publishMap} />
            </div>
        </div>
    );
};

export default function CourseTablePage() {
    const { t } = useTranslation("global");
    const navigate = useNavigate();
    const { academicRecords, semesterNames, courses: systemCourses, studentRegistrations = [], gradePublishMap: publishMap = {} } = useContext(SystemContext);
    const [approvedTermsFromRequests, setApprovedTermsFromRequests] = useState(() => new Set());
    const [profileStats, setProfileStats] = useState({ gpa: 0, hours: 0 });
    const [hasServerProfile, setHasServerProfile] = useState(false);

    const student = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("loggedUser") || "{}");
        } catch {
            return {};
        }
    }, []);

    const studentId = String(student.studentId || student.username || "");
    useEffect(() => {
        let active = true;
        const loadRequestTerms = async () => {
            try {
                getMyStudentProfile()
                    .then((p) => {
                        if (!active || !p) return;
                        setProfileStats({ gpa: Number(p.gpa || 0), hours: Number(p.passed_hours || 0) });
                        setHasServerProfile(true);
                    })
                    .catch(() => {});
                
                const res = await listMyAdvisorRequests();
                if (!active) return;
                const rows = Array.isArray(res?.items) ? res.items : [];
                const approved = new Set();
                rows.forEach((item) => {
                    const status = String(item?.status || "").trim().toLowerCase();
                    if (!APPROVED_REGISTRATION_STATUSES.has(status)) return;
                    const year = String(item?.academic_year_label || "").trim();
                    const semester = String(item?.semester || "").trim();
                    if (!year || !semester) return;
                    approved.add(`${year}__${semester}`);
                });
                setApprovedTermsFromRequests(approved);
            } catch {
                if (active) setApprovedTermsFromRequests(new Set());
            }
        };
        loadRequestTerms();
        const onVis = () => {
            if (document.visibilityState !== "visible") return;
            getMyStudentProfile()
                .then((p) => {
                    if (!p) return;
                    setProfileStats({ gpa: Number(p.gpa || 0), hours: Number(p.passed_hours || 0) });
                    setHasServerProfile(true);
                })
                .catch(() => {});
        };
        document.addEventListener("visibilitychange", onVis);
        return () => {
            active = false;
            document.removeEventListener("visibilitychange", onVis);
        };
    }, []);

    const grouped = useMemo(() => {
        const catalog = new Map();
        (Array.isArray(systemCourses) ? systemCourses : []).forEach((course) => {
            const normalized = normalizeCourse(course);
            const keys = [normalized.id, normalized.code, course?.id, course?.code]
                .map((item) => String(item || "").trim())
                .filter(Boolean);
            keys.forEach((key) => catalog.set(key, normalized));
        });

        const registrationStatusByKey = new Map();
        (Array.isArray(studentRegistrations) ? studentRegistrations : []).forEach((item) => {
            const sid = String(item?.studentId || "");
            const code = String(item?.id || item?.code || "").trim();
            const semester = String(item?.semester || "");
            if (!sid || !code || !semester) return;
            registrationStatusByKey.set(`${sid}__${code}__${semester}`, String(item?.status || "").toLowerCase());
        });

        const records = academicRecords
            .filter((item) => String(item.studentId) === studentId)
            .map((item) => {
                const code = String(item.code || item.id || "");
                const course = catalog.get(code);
                return {
                    ...item,
                    code,
                    name: course?.name || item.name,
                    credits: course?.credits || item.credits,
                    courseMeta: course || null,
                };
            })
            .filter((item) => catalog.has(String(item.code || "")))
            .filter((item) => {
                const recordStatus = String(item?.status || "").toLowerCase();
                if (recordStatus === "graded") return true;
                const termKey = `${String(item?.academicYear || "").trim()}__${String(item?.semester || "").trim()}`;
                if (approvedTermsFromRequests.has(termKey)) return true;
                const semesterOnlyKey = String(item?.semester || "").trim();
                if (
                    semesterOnlyKey &&
                    Array.from(approvedTermsFromRequests).some((k) => String(k || "").split("__")[1] === semesterOnlyKey)
                ) {
                    return true;
                }
                const key = `${String(item?.studentId || "")}__${String(item?.code || "").trim()}__${String(item?.semester || "")}`;
                const registrationStatus = registrationStatusByKey.get(key);
                if (!registrationStatus) return false;
                return APPROVED_REGISTRATION_STATUSES.has(registrationStatus);
            });
        const map = new Map();

        records.forEach((record) => {
            const semesterLabel = semesterNames?.[record.semester] || record.semester || "-";
            const academicYear = record.academicYear || t("course_table_not_set");
            const key = `${academicYear}__${record.semester}`;
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    academicYear,
                    semester: record.semester,
                    title: `${semesterLabel} ${academicYear}`,
                    records: [],
                });
            }
            map.get(key).records.push(record);
        });

        const semesterRank = { autumn: 1, spring: 2, summer: 3 };
        const getAcademicYearRank = (value) => {
            const years = String(value || "").match(/\d{4}/g) || [];
            if (!years.length) return 0;
            return Math.max(...years.map((year) => Number(year) || 0));
        };

        return [...map.values()].sort((a, b) => {
            const yearDiff = getAcademicYearRank(b.academicYear) - getAcademicYearRank(a.academicYear);
            if (yearDiff !== 0) return yearDiff;

            const semA = normalizeSemesterValue(a.semester || "", "");
            const semB = normalizeSemesterValue(b.semester || "", "");
            return (semesterRank[semB] || 0) - (semesterRank[semA] || 0);
        });
    }, [academicRecords, semesterNames, studentId, systemCourses, studentRegistrations, t, approvedTermsFromRequests]);

    const [openKey, setOpenKey] = useState(() => grouped[0]?.key || null);
    const hasApprovedRegistration = useMemo(() => {
        if (approvedTermsFromRequests.size > 0) return true;
        return (Array.isArray(studentRegistrations) ? studentRegistrations : []).some((item) => {
            const sid = String(item?.studentId || "");
            if (sid !== studentId) return false;
            const status = String(item?.status || "").toLowerCase();
            return APPROVED_REGISTRATION_STATUSES.has(status);
        });
    }, [studentId, studentRegistrations, approvedTermsFromRequests]);

    const totalCredits = useMemo(() => {
        if (hasServerProfile) return profileStats.hours;
        return grouped.reduce((acc, group) => acc + group.records.reduce((sum, row) => sum + (parseFloat(row.credits) || 0), 0), 0);
    }, [hasServerProfile, profileStats.hours, grouped]);

    const cumulativeGpa = useMemo(() => {
        if (hasServerProfile) return profileStats.gpa;
        const flat = grouped.flatMap((group) => group.records);
        return calculateSemesterGpa(flat);
    }, [hasServerProfile, profileStats.gpa, grouped]);

    return (
        <div className="bg-[#F8FAFC] mt-[4em] sm:mt-[4.5em] font-sans" dir="rtl">
            <div className="absolute top-0 left-0 right-0 h-[280px] sm:h-[340px] lg:h-[390px] bg-gradient-to-br from-[#05ADCF] via-[#0496B4] to-[#037A92]" />

            <main className="relative z-10 container mx-auto px-3 sm:px-4 pt-8 sm:pt-12 pb-10 sm:pb-14 max-w-[56rem] xl:max-w-[62rem]">
                <div className="fixed left-3 sm:left-6 top-4 sm:top-6 z-50 group">
                    <button
                        onClick={() => navigate("/course-table-print")}
                        className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gray-900 text-white hover:bg-black transition-all shadow-lg">
                        <Printer size={18} />
                    </button>
                    <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 left-14 rounded-md bg-black text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {t("course_table_print_result")}
                    </span>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 sm:mb-8 gap-4 sm:gap-6">
                    <div className="text-white">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-bold mb-4">
                            <GraduationCap size={14} />
                            <span>{t("course_table_student_affairs_system")}</span>
                        </div>
                        <h1 className="text-[clamp(1.55rem,2.8vw,2.2rem)] font-black tracking-tight mb-1.5">{t("course_table_title")}</h1>
                        <p className="text-cyan-50/80 font-medium">{t("course_table_subtitle")}</p>
                    </div>

                    <div className="flex gap-4 w-full md:w-auto">
                        <div className="flex-1 md:flex-none bg-white border-2 border-cyan-200 md:border md:border-white/30 md:bg-white/15 p-3 rounded-2xl min-w-[130px] shadow-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-cyan-100 text-cyan-700 md:bg-white/30 md:text-white rounded-lg">
                                    <Clock size={20} />
                                </div>
                                <span className="text-xs font-bold text-slate-700 md:text-white uppercase tracking-widest">{t("course_table_passed_hours")}</span>
                            </div>
                            <div className="text-[clamp(1.3rem,2vw,1.6rem)] font-black text-slate-900 md:text-white">{totalCredits}</div>
                        </div>

                        <div className="flex-1 md:flex-none bg-white border-2 border-cyan-200 md:border md:border-white/30 md:bg-white/15 p-3 rounded-2xl min-w-[130px] shadow-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-cyan-100 text-cyan-700 md:bg-white/30 md:text-white rounded-lg">
                                    <Award size={20} />
                                </div>
                                <span className="text-[10px] font-black text-slate-700 md:text-white uppercase tracking-widest">GPA</span>
                            </div>
                            <div className="text-[clamp(1.3rem,2vw,1.6rem)] font-black text-slate-900 md:text-white">{cumulativeGpa.toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                <div className="bg-white/40 backdrop-blur-2xl rounded-[1.3rem] sm:rounded-[1.8rem] p-2 sm:p-3 md:p-5 lg:p-6 border border-white/50">
                    {!hasApprovedRegistration ? (
                        <div className="text-center py-14 text-gray-500">بانتظار موافقة المرشد على التسجيل.</div>
                    ) : (
                        <>
                            <div className="space-y-4">
                                {grouped.map((item) => (
                                    <AccordionItem
                                        key={item.key}
                                        item={item}
                                        isOpen={openKey === item.key}
                                        publishMap={publishMap}
                                        onToggle={() => setOpenKey((prev) => (prev === item.key ? null : item.key))}
                                    />
                                ))}
                            </div>

                            {grouped.length === 0 && <div className="text-center py-14 text-gray-500">{t("course_table_no_data")}</div>}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}








