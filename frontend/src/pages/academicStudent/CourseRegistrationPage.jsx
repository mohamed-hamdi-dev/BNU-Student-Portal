import React, { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, AlertCircle, Plus, Monitor, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SystemContext } from "../../context/SystemContext.jsx";
import { CoursesContext } from "../../context/CoursesContext.jsx";
import { useNavigate } from "react-router-dom";
import { getCurrentAcademicYear, normalizeAcademicYearValue, normalizeCourse } from "../../utils/academicData.js";
import { resolveCollegePolicyForStudent } from "../../utils/collegePolicy.js";
import { getMyRegistrationCreditPolicy } from "../../services/registrationPolicyApi.js";
import { getCurrentRegistrationPeriodStatus, getMyRegistration, listMyAdvisorRequests, listMyAvailableOfferings } from "../../services/advisorRegistrationApi.js";
import { getMyPaymentOverview } from "../../services/paymentApi.js";

const getCollegeKey = (student = {}) =>
  String(student.collegeId || student.college_id || student.college || student.faculty || student.major || "").trim().toLowerCase();

const inferCollegeDefaultYears = (collegeValue) => {
  const key = String(collegeValue || "")
    .trim()
    .toLowerCase();
  if (!key) return 0;
  if (key.includes("\u0639\u0644\u0648\u0645 \u0627\u0644\u062d\u0627\u0633\u0628") || key.includes("\u062d\u0627\u0633\u0628") || key.includes("computer science") || key === "cs") return 4;
  if (key.includes("\u0627\u0644\u0647\u0646\u062f\u0633\u0629") || key.includes("engineering") || key === "eng") return 5;
  return 0;
};

const normalizeArabicDigits = (value) =>
  String(value || "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

const normalizeDayKey = (value) => {
  const raw = normalizeArabicDigits(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[._-]/g, "")
    .replace(/\s+/g, "");
  if (!raw) return "";
  if (["0", "7", "sun", "sunday", "الاحد", "الأحد", "ahad"].includes(raw)) return "sunday";
  if (["1", "mon", "monday", "الاثنين", "الإثنين", "اثنين"].includes(raw)) return "monday";
  if (["2", "tue", "tuesday", "الثلاثاء", "ثلاثاء"].includes(raw)) return "tuesday";
  if (["3", "wed", "wednesday", "الاربعاء", "الأربعاء", "اربعاء"].includes(raw)) return "wednesday";
  if (["4", "thu", "thursday", "الخميس"].includes(raw)) return "thursday";
  if (["5", "fri", "friday", "الجمعة", "جمعه", "جمعة"].includes(raw)) return "friday";
  if (["6", "sat", "saturday", "السبت", "سبت"].includes(raw)) return "saturday";
  return raw;
};

const parseTimeToMinutes = (value) => {
  const raw = normalizeArabicDigits(String(value || "").toLowerCase()).trim();
  if (!raw) return NaN;
  const match = raw.match(/(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return NaN;
  let h = Number(match[1]);
  let m = Number(match[2] || 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  const hasPm = /(pm|مساء|\bم\b)/.test(raw);
  const hasAm = /(am|صباح|\bص\b)/.test(raw);
  if (hasPm && h < 12) h += 12;
  if (hasAm && h === 12) h = 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
};







const parseSessionWindow = (session) => {
  const day = normalizeDayKey(session?.day);
  if (!day) return null;
  const range = normalizeArabicDigits(String(session?.time || ""))
    .replace(/[–—]/g, "-")
    .replace(/\s*to\s*/gi, "-")
    .replace(/[??]/g, "-");
  const startText = String(session?.start || "").trim() || range.split("-")[0]?.trim() || "";
  let endText = range.split("-")[1]?.trim() || "";
  const start = parseTimeToMinutes(startText);
  if (!Number.isFinite(start)) return null;
  const rawEnd = parseTimeToMinutes(endText);
  const partA = parseTimeToMinutes(range.split("-")[0]?.trim() || "");
  const partB = parseTimeToMinutes(range.split("-")[1]?.trim() || "");
  let end = rawEnd;
  if (Number.isFinite(rawEnd) && rawEnd <= start) {
    if (Number.isFinite(partA) && Number.isFinite(partB) && partA > partB) {
      return { day, start: partB, end: partA };
    }
    end = start + 60;
  }
  if (!Number.isFinite(end)) {
    const fallbackDurationHours = Number(session?.duration || 2);
    end = start + (Number.isFinite(fallbackDurationHours) && fallbackDurationHours > 0 ? fallbackDurationHours : 2) * 60;
  }
  if (!Number.isFinite(end) || end <= start) return null;
  return { day, start, end };
};

const overlaps = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end;

export default function CourseRegistrationPage() {
  const { t } = useTranslation("global");
  const navigate = useNavigate();
  const { registrationOpen, openSemester, years, getAvailableCoursesForStudent, registrationSettings, upsertPreliminaryAcademicRecord, resolveEffectiveStudyYear } = React.useContext(SystemContext);
  const { selectedCourses, setSelectedCourses, addSelectedCourse, removeSelectedCourse } = React.useContext(CoursesContext);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedCourseForGroups, setSelectedCourseForGroups] = useState(null);
  const [periodStatus, setPeriodStatus] = useState("CLOSED");
  const [periodWindow, setPeriodWindow] = useState(null);
  const [termRequestStatus, setTermRequestStatus] = useState("");
  const [paymentUnlocked, setPaymentUnlocked] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentDueAmount, setPaymentDueAmount] = useState(0);
  const [availableOfferings, setAvailableOfferings] = useState([]);
  const [availableOfferingsLoaded, setAvailableOfferingsLoaded] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("loggedUser") || "{}");
      return parsed?.trackId || parsed?.track || "";
    } catch {
      return "";
    }
  });

  const studentInfo = useMemo(() => {
    const saved = localStorage.getItem("loggedUser");
    const data = saved ? JSON.parse(saved) : {};
    return {
      name: data?.name || data?.NameID || "طالب",
      id: data?.studentId || data?.username || "-",
      collegeId: data?.collegeId || data?.college_id || "",
      college: data?.college || data?.faculty || data?.major || "",
      trackId: data?.trackId || data?.track_id || data?.track || "",
      completedHours: Number(data?.completedHours || data?.completed_hours || 0),
      academicYear: normalizeAcademicYearValue(data?.academicYear || data?.year || data?.level, registrationSettings.activeAcademicYear || "1"),
      maxHours: Number(data?.maxHours || 18),
    };
  }, [registrationSettings.activeAcademicYear]);
  const [policyHoursLimit, setPolicyHoursLimit] = useState(null);
  useEffect(() => {
    let active = true;
    const loadPolicyHours = async () => {
      try {
        const data = await getMyRegistrationCreditPolicy();
        const max = Number(data?.allowed_credit_hours?.max);
        const min = Number(data?.allowed_credit_hours?.min);
        if (!active) return;
        if (Number.isFinite(max) && max > 0) {
          setPolicyHoursLimit({
            max,
            min: Number.isFinite(min) && min >= 0 ? min : 0,
          });
        } else {
          setPolicyHoursLimit(null);
        }
      } catch {
        if (active) setPolicyHoursLimit(null);
      }
    };
    loadPolicyHours();
    return () => {
      active = false;
    };
  }, []);
  const fallbackMaxHoursByGpa = useMemo(() => {
    const gpa = Number(studentInfo?.gpa || 0);
    if (gpa >= 3) return 21;
    if (gpa >= 2) return 18;
    return 12;
  }, [studentInfo?.gpa]);
  const fallbackMinHoursByGpa = useMemo(() => {
    const gpa = Number(studentInfo?.gpa || 0);
    if (gpa >= 3) return 18;
    if (gpa >= 2) return 12;
    return 9;
  }, [studentInfo?.gpa]);
  const effectiveMaxHours = Number(policyHoursLimit?.max || fallbackMaxHoursByGpa || studentInfo.maxHours || 18);
  const effectiveMinHours = Number((policyHoursLimit?.min ?? 0) > 0 ? policyHoursLimit.min : fallbackMinHoursByGpa);
  const effectiveAcademicYear = useMemo(() => resolveEffectiveStudyYear(studentInfo), [resolveEffectiveStudyYear, studentInfo]);
  const academicYearLabel = useMemo(() => getCurrentAcademicYear(), []);
  const periodOpen = String(periodStatus || "CLOSED").toUpperCase() === "OPEN";
  const inWindowTime = useMemo(() => {
    if (!periodWindow) return false;
    const now = Date.now();
    const startRaw = periodWindow.open_at || periodWindow.starts_at;
    const endRaw = periodWindow.close_at || periodWindow.ends_at;
    const start = startRaw ? new Date(startRaw).getTime() : NaN;
    const end = endRaw ? new Date(endRaw).getTime() : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return now >= start && now <= end;
  }, [periodWindow]);
  const canRegisterNow = Boolean(registrationOpen && periodOpen && inWindowTime);
  const isTermLockedByAdvisorFlow = ["advisor_approved", "registered", "approved", "locked"].includes(
    String(termRequestStatus || "").trim().toLowerCase()
  );

  useEffect(() => {
    let active = true;
    const loadPeriod = async () => {
      try {
        const res = await getCurrentRegistrationPeriodStatus({
          academic_year_label: academicYearLabel,
          semester: openSemester,
        });
        if (!active) return;
        setPeriodStatus(String(res?.status || "CLOSED").toUpperCase());
        setPeriodWindow(res?.window || null);
      } catch {
        if (!active) return;
        setPeriodStatus("CLOSED");
        setPeriodWindow(null);
      }
    };
    if (openSemester) loadPeriod();
    return () => {
      active = false;
    };
  }, [academicYearLabel, openSemester]);

  useEffect(() => {
    let active = true;
    const loadPaymentGate = async () => {
      try {
        if (!openSemester) {
          if (active) {
            setPaymentUnlocked(false);
            setPaymentLoading(false);
          }
          return;
        }
        setPaymentLoading(true);
        const overview = await getMyPaymentOverview(academicYearLabel, openSemester);
        if (!active) return;
        const clearance = String(overview?.clearance?.clearance_status || "").toUpperCase();
        const orderPaymentStatus = String(overview?.order?.status || "").toUpperCase();
        const unlockStatus = String(overview?.order?.registration_unlock_status || "").toUpperCase();
        const dueAmount = Number(overview?.order?.amount_due || 0);
        setPaymentDueAmount(Number.isFinite(dueAmount) ? dueAmount : 0);
        // Open registration when backend marks term as paid/cleared/unlocked.
        const unlocked =
          orderPaymentStatus === "PAID" ||
          unlockStatus === "UNLOCKED" ||
          clearance === "CLEARED";
        setPaymentUnlocked(unlocked);
      } catch {
        if (!active) return;
        setPaymentDueAmount(0);
        setPaymentUnlocked(false);
      } finally {
        if (active) setPaymentLoading(false);
      }
    };
    loadPaymentGate();
    return () => {
      active = false;
    };
  }, [academicYearLabel, openSemester]);

  useEffect(() => {
    let active = true;
    const loadAvailableOfferings = async () => {
      try {
        if (!openSemester) {
          if (active) {
            setAvailableOfferings([]);
            setAvailableOfferingsLoaded(false);
          }
          return;
        }
        const res = await listMyAvailableOfferings(String(academicYearLabel || ""), openSemester);
        if (!active) return;
        setAvailableOfferings(Array.isArray(res?.items) ? res.items : []);
        setAvailableOfferingsLoaded(true);
      } catch {
        if (!active) return;
        setAvailableOfferings([]);
        setAvailableOfferingsLoaded(false);
      }
    };
    loadAvailableOfferings();
    return () => {
      active = false;
    };
  }, [academicYearLabel, openSemester]);

  useEffect(() => {
    let active = true;
    const loadTermStatus = async () => {
      try {
        if (!openSemester) return;
        const res = await listMyAdvisorRequests({ academic_year_label: academicYearLabel, semester: openSemester });
        if (!active) return;
        const rows = Array.isArray(res?.items) ? res.items : [];
        if (!rows.length) {
          setTermRequestStatus("");
          return;
        }
        const latest = [...rows].sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0];
        setTermRequestStatus(String(latest?.status || "").trim().toLowerCase());
      } catch {
        if (active) setTermRequestStatus("");
      }
    };
    loadTermStatus();
    return () => {
      active = false;
    };
  }, [academicYearLabel, openSemester]);

  const collegePolicy = useMemo(
    () => resolveCollegePolicyForStudent(studentInfo, registrationSettings?.collegePolicies || {}),
    [registrationSettings, studentInfo]
  );
  const yearOptions = useMemo(() => {
    const normalizedYears = Array.isArray(years) ? years : [];
    const yearMap = new Map(normalizedYears.map((year) => [String(year?.id || "").trim(), year]));
    const rawYearIds = Array.isArray(collegePolicy?.yearIds)
      ? collegePolicy.yearIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const totalYears = Number(collegePolicy?.totalYears || 0);

    let ids = rawYearIds;
    if (ids.length === 0 && Number.isFinite(totalYears) && totalYears > 0) {
      ids = Array.from({ length: Math.max(1, totalYears) }, (_, idx) => String(idx + 1));
    }
    if (ids.length === 0) {
      const fallbackYears = inferCollegeDefaultYears(studentInfo.college || studentInfo.collegeId);
      if (fallbackYears > 0) {
        ids = Array.from({ length: fallbackYears }, (_, idx) => String(idx + 1));
      }
    }
    if (ids.length === 0) {
      ids = normalizedYears.map((year) => String(year?.id || "").trim()).filter(Boolean);
    }

    return ids.map((id) => {
      const fromGlobal = yearMap.get(id);
      if (fromGlobal) return fromGlobal;
      return { id, name: `السنة ${id}` };
    });
  }, [collegePolicy, years, studentInfo.college, studentInfo.collegeId]);
  const branchingYear = normalizeAcademicYearValue(collegePolicy?.branchingYear, "");
  const isBranchingOpen = Boolean(branchingYear && Number(effectiveAcademicYear || 0) >= Number(branchingYear || 0));
  const trackOptions = useMemo(() => (Array.isArray(collegePolicy?.tracks) ? collegePolicy.tracks : []), [collegePolicy]);
  const currentSpecialization = useMemo(() => {
    const picked = trackOptions.find((track) => String(track.id || track.name || "") === String(selectedTrack || studentInfo.trackId || ""));
    return picked?.name || picked?.id || studentInfo.trackId || "";
  }, [trackOptions, selectedTrack, studentInfo.trackId]);

  const persistTrack = (trackId) => {
    setSelectedTrack(trackId);
    try {
      const raw = JSON.parse(localStorage.getItem("loggedUser") || "{}");
      const matched = trackOptions.find((track) => String(track.id || track.name || "") === trackId);
      const next = {
        ...raw,
        trackId: trackId || "",
        track: trackId || "",
        specialization: matched?.name || matched?.id || raw?.specialization || "",
      };
      localStorage.setItem("loggedUser", JSON.stringify(next));
    } catch {
      // ignore persistence errors
    }
  };

  const registeredHours = useMemo(
    () =>
      selectedCourses
        .filter((course) => course.semester === openSemester)
        .reduce((acc, course) => acc + Number(course.hours || course.credits || 0), 0),
    [selectedCourses, openSemester]
  );

  const availableCourses = useMemo(
    () => {
      if (!availableOfferingsLoaded) {
        return getAvailableCoursesForStudent({
          ...studentInfo,
          collegeId: studentInfo.collegeId || getCollegeKey(studentInfo),
          trackId: selectedTrack || studentInfo.trackId || "",
        }).map((course) => normalizeCourse(course));
      }

      const statusRank = { allowed: 0, advisor_required: 1, admin_override: 2, blocked: 3 };
      const grouped = new Map();
      (Array.isArray(availableOfferings) ? availableOfferings : []).forEach((item) => {
        const courseCode = String(item?.course_code || item?.course_id || "").trim().toUpperCase();
        if (!courseCode) return;
        const status = String(item?.eligibility_status || "blocked").trim().toLowerCase();
        const groupItem = {
          id: String(item?.section || item?.offering_id || ""),
          name: String(item?.section || "-"),
          section: String(item?.section || ""),
          day: String(item?.day_of_week || ""),
          time: `${String(item?.start_time || "")} - ${String(item?.end_time || "")}`.trim(),
          hall: String(item?.room_name || ""),
          capacity: Number(item?.available_seats ?? item?.capacity ?? 0),
          full: !Boolean(item?.is_open),
          offering_id: Number(item?.offering_id || 0) || undefined,
          offeringId: Number(item?.offering_id || 0) || undefined,
          eligibility_status: status,
          eligibility_reasons: Array.isArray(item?.eligibility_reasons) ? item.eligibility_reasons : [],
          eligibility_warnings: Array.isArray(item?.eligibility_warnings) ? item.eligibility_warnings : [],
        };
        if (!grouped.has(courseCode)) {
          grouped.set(courseCode, {
            id: courseCode,
            code: courseCode,
            name: String(item?.course_title_ar || item?.course_code || courseCode),
            hours: Number(item?.credit_hours || 0),
            credits: Number(item?.credit_hours || 0),
            year: item?.study_year ?? "",
            lecture: {
              day: String(item?.day_of_week || ""),
              time: `${String(item?.start_time || "")} - ${String(item?.end_time || "")}`.trim(),
              hall: String(item?.room_name || ""),
              start: String(item?.start_time || ""),
              end: String(item?.end_time || ""),
            },
            groups: [],
            eligibility_status: status,
            eligibility_reasons: Array.isArray(item?.eligibility_reasons) ? item.eligibility_reasons : [],
            eligibility_warnings: Array.isArray(item?.eligibility_warnings) ? item.eligibility_warnings : [],
            status: status === "blocked" ? "locked" : "open",
          });
        }
        const current = grouped.get(courseCode);
        current.groups.push(groupItem);
        const currentRank = statusRank[String(current.eligibility_status || "blocked").toLowerCase()] ?? 99;
        const nextRank = statusRank[status] ?? 99;
        if (nextRank < currentRank) {
          current.eligibility_status = status;
          current.eligibility_reasons = Array.isArray(item?.eligibility_reasons) ? item.eligibility_reasons : [];
          current.eligibility_warnings = Array.isArray(item?.eligibility_warnings) ? item.eligibility_warnings : [];
          current.status = status === "blocked" ? "locked" : "open";
        }
      });
      return Array.from(grouped.values()).map((course) => normalizeCourse(course));
    },
    [availableOfferings, availableOfferingsLoaded, getAvailableCoursesForStudent, selectedTrack, studentInfo]
  );

  const filteredCourses = useMemo(() => {
    return availableCourses.filter((course) => {
      const matchesSearch = course.name.includes(searchQuery) || course.id.includes(searchQuery);
      const matchesYear =
        selectedYear === "all" ||
        normalizeAcademicYearValue(course.year, "") === normalizeAcademicYearValue(selectedYear, "");
      return matchesSearch && matchesYear;
    });
  }, [availableCourses, searchQuery, selectedYear]);

  const getEligibilityBadgeMeta = (status) => {
    const normalized = String(status || "blocked").trim().toLowerCase();
    if (normalized === "allowed") {
      return { label: "Allowed", classes: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    if (normalized === "advisor_required") {
      return { label: "Advisor Required", classes: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    if (normalized === "admin_override") {
      return { label: "Admin Override", classes: "bg-purple-50 text-purple-700 border-purple-200" };
    }
    return { label: "Blocked", classes: "bg-rose-50 text-rose-700 border-rose-200" };
  };

  const getSelectedCourseBadgeMeta = (status) => {
    const normalized = String(status || "").trim().toLowerCase();
    if (["registered", "approved", "locked", "advisor_approved", "admin_override_approved"].includes(normalized)) {
      return { label: "Registered", classes: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    if (normalized === "admin_override_pending") {
      return { label: "Admin Override", classes: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" };
    }
    if (["pending_advisor", "advisor_requested", "draft", "need_info"].includes(normalized)) {
      return { label: "Pending Advisor", classes: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    if (normalized === "advisor_rejected" || normalized === "admin_override_rejected") {
      return { label: "Rejected", classes: "bg-rose-50 text-rose-700 border-rose-200" };
    }
    return null;
  };

  useEffect(() => {
    let active = true;
    const hydrateRegisteredFromBackend = async () => {
      try {
        if (!openSemester || availableCourses.length === 0) return;
        const academicYearLabel = String(getCurrentAcademicYear());
        const res = await getMyRegistration(academicYearLabel, openSemester);
        if (!active) return;
        const requestStatus = String(res?.request?.status || "").trim().toLowerCase();
        const selections = Array.isArray(res?.selections) ? res.selections : [];
        if (!selections.length) return;
        const canHydrate = ["advisor_requested", "advisor_approved", "registered", "approved", "locked", "need_info", "admin_override_pending", "admin_override_approved"].includes(requestStatus);
        if (!canHydrate) return;

        const byCode = new Map();
        availableCourses.forEach((course) => {
          const key = String(course?.id || course?.code || "").trim().toUpperCase();
          if (key) byCode.set(key, normalizeCourse(course));
        });

        const mapped = selections
          .map((sel) => {
            const code = String(sel?.course_code || "").trim().toUpperCase();
            const base = byCode.get(code);
            if (!base) return null;
            const sectionToken = String(sel?.section || "").trim().toUpperCase();
            const pickedGroup =
              (base.groups || []).find((g) => String(g?.name || "").toUpperCase().includes(sectionToken)) ||
              (base.groups || []).find((g) => String(g?.section || "").toUpperCase() === sectionToken) ||
              null;

            let hydratedLecture = base.lecture || {};
            let hydratedGroup = pickedGroup || base.selectedGroup || null;

            if (sel?.day_of_week || sel?.start_time) {
                hydratedLecture = {
                    ...hydratedLecture,
                    day: sel.day_of_week || hydratedLecture?.day || "",
                    time: (sel.start_time && sel.end_time)
                        ? `${sel.start_time} - ${sel.end_time}`
                        : sel.start_time || hydratedLecture?.time || "",
                    start: sel.start_time || hydratedLecture?.start || "",
                    end: sel.end_time || hydratedLecture?.end || "",
                    hall: sel.room_name || hydratedLecture?.hall || "",
                };
            }

            if (hydratedGroup) {
                if (!hydratedGroup.day && sel?.day_of_week) {
                    hydratedGroup = {
                        ...hydratedGroup,
                        day: sel.day_of_week,
                        time: (sel.start_time && sel.end_time)
                            ? `${sel.start_time} - ${sel.end_time}`
                            : sel.start_time || hydratedGroup.time || "",
                        start: sel.start_time || hydratedGroup.start || "",
                        end: sel.end_time || hydratedGroup.end || "",
                        hall: sel.room_name || hydratedGroup.hall || "",
                    };
                }
            } else if (sel?.section && sel?.day_of_week) {
                hydratedGroup = {
                    id: sel.section,
                    name: sel.section,
                    section: sel.section,
                    day: sel.day_of_week,
                    time: (sel.start_time && sel.end_time)
                        ? `${sel.start_time} - ${sel.end_time}`
                        : sel.start_time || "",
                    start: sel.start_time || "",
                    end: sel.end_time || "",
                    hall: sel.room_name || "",
                };
            }

            return {
              ...base,
              semester: openSemester,
              status: requestStatus === "registered" || requestStatus === "approved" || requestStatus === "locked" ? "registered" : "pending_advisor",
              offering_id: Number(sel?.offering_id || 0) || undefined,
              selectedGroup: hydratedGroup,
              lecture: hydratedLecture,
            };
          })
          .filter(Boolean);

        if (!mapped.length) return;
        setSelectedCourses((prev) => {
          const base = Array.isArray(prev) ? prev : [];
          const others = base.filter((item) => String(item?.semester || "") !== String(openSemester || ""));
          return [...others, ...mapped];
        });
      } catch {
        // Keep current local state if backend hydration fails.
      }
    };
    hydrateRegisteredFromBackend();
    return () => {
      active = false;
    };
  }, [openSemester, availableCourses]);
  useEffect(() => {
    if (selectedYear === "all") return;
    const isAllowed = yearOptions.some((year) => String(year.id) === String(selectedYear));
    if (!isAllowed) setSelectedYear("all");
  }, [selectedYear, yearOptions]);

  const confirmRegistration = (course, group) => {
    if (!canRegisterNow) {
      alert("لا يمكن تسجيل المواد الآن. فترة التسجيل غير متاحة حاليًا.");
      return;
    }
    const hoursAfterAdd = registeredHours + Number(course.hours || 0);
    if (registrationSettings.enforceMaxHours && hoursAfterAdd > effectiveMaxHours) {
      alert("لا يمكن إضافة المادة لأنك ستتجاوز الحد الأقصى للساعات المسموح بها.");
    }
    if (group?.full || String(group?.eligibility_status || course?.eligibility_status || "").trim().toLowerCase() === "blocked") {
      alert("هذه المجموعة ممتلئة ولا توجد أماكن شاغرة.");
      return;
    }

    const incomingWindows = [parseSessionWindow(course?.lecture), parseSessionWindow(group)].filter(Boolean);
    if (incomingWindows.length > 0) {
      const currentSemesterRegs = selectedCourses.filter(
        (item) =>
          String(item?.semester || "") === String(openSemester || "") &&
          String(item?.id || item?.code || "") !== String(course?.id || course?.code || "")
      );
      for (const existing of currentSemesterRegs) {
        const existingWindows = [parseSessionWindow(existing?.lecture), parseSessionWindow(existing?.selectedGroup)].filter(Boolean);
        for (const nextSlot of incomingWindows) {
          for (const oldSlot of existingWindows) {
            if (overlaps(nextSlot, oldSlot)) {
              alert(`يوجد تعارض في المواعيد مع المادة ${existing?.name || existing?.id || existing?.code || "أخرى"}.`);
              return;
            }
          }
        }
      }
    }

    const payload = { ...course, selectedGroup: group, semester: openSemester };
    const registrationResult = addSelectedCourse(payload);
    if (!registrationResult?.ok) {
      alert(registrationResult?.error || "تعذر تسجيل المادة.");
      return;
    }

    const preliminaryResult = upsertPreliminaryAcademicRecord({
      studentId: studentInfo.id,
      studentName: studentInfo.name,
      course,
      semester: openSemester,
      academicYear: getCurrentAcademicYear(),
      year: course.year,
      lecture: course.lecture,
      selectedGroup: group,
      student: studentInfo,
    });
    if (!preliminaryResult?.ok) {
      removeSelectedCourse(course.id, openSemester);
      alert(preliminaryResult?.error || "تعذر حفظ بيانات التسجيل المبدئية.");
      return;
    }
    setSelectedCourseForGroups(null);
    navigate("/student/registered", { replace: true });
  };

  return (
    <div className="min-h-screen m-[10em] bg-[#F8FAFC] font-[Tajawal] p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
          <h2 className="text-2xl font-black text-gray-800">تسجيل المواد</h2>
          <p className="text-sm text-gray-500">{t("academic_reg_allowed_hours_short", { minHours: effectiveMinHours, maxHours: effectiveMaxHours })}</p>
          <p className="mt-1 text-sm text-slate-600">التخصص الحالي: <span className="font-black text-slate-800">{currentSpecialization || "غير محدد"}</span></p>
          {isBranchingOpen && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-600">المسار:</span>
              <select
                value={selectedTrack || studentInfo.trackId || ""}
                onChange={(e) => persistTrack(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
              >
                <option value="">اختر المسار</option>
                {trackOptions.map((track) => {
                  const key = String(track.id || track.name || "");
                  return (
                    <option key={`student-track-${key}`} value={key}>
                      {track.name || track.id}
                    </option>
                  );
                })}
              </select>
              {!selectedTrack && <span className="text-xs text-amber-600">يجب اختيار المسار قبل متابعة تسجيل المواد</span>}
            </div>
          )}
          {!canRegisterNow && (
            <div className="mt-3 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600 space-y-2">
              <p>التسجيل الذاتي غير متاح الآن. يمكنك إرسال طلب للمرشد الأكاديمي بدلًا من ذلك.</p>
              <button
                onClick={() => navigate("/student/advisor-request")}
                className="rounded-xl bg-slate-900 text-white px-4 py-2 text-xs font-black hover:bg-black transition-colors"
              >
                اذهب إلى طلب المرشد
              </button>
            </div>
          )}
        </div>

        {paymentLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">
            جاري التحقق من حالة الدفع...
          </div>
        ) : !paymentUnlocked ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <p className="text-sm font-bold text-amber-800">
              {canRegisterNow
                ? "يجب سداد المصروفات الدراسية قبل فتح التسجيل الأكاديمي لهذا الفصل."
                : "يجب سداد المصروفات الدراسية قبل إرسال طلب التسجيل لهذا الفصل."}
            </p>
            <div className="mt-2 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm">
              <span className="text-amber-700 font-bold">المبلغ المطلوب سداده: </span>
              <span className="font-black text-slate-800">{Number(paymentDueAmount || 0).toLocaleString()} EGP</span>
            </div>
            <p className="mt-1 text-xs text-amber-700">
              {canRegisterNow
                ? "بعد إتمام الدفع سيتم فتح صفحة تسجيل المواد مباشرة."
                : "بعد إتمام الدفع ستتمكن من إرسال طلب التسجيل للمرشد."}
            </p>
            <button
              onClick={() => navigate("/payment")}
              className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-black"
            >
              اذهب إلى الدفع
            </button>
          </div>
        ) : (
          <>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المادة أو الكود"
              className="w-full rounded-2xl border border-gray-200 bg-white px-12 py-3 text-sm"
            />
          </div>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm"
          >
            <option value="all">كل السنوات</option>
            {yearOptions.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {filteredCourses.map((course) => {
            const isRegistered = selectedCourses.some(
              (c) => c.id === course.id && c.semester === openSemester
            );
            const selectedCourse = selectedCourses.find(
              (c) => c.id === course.id && c.semester === openSemester
            );
            const blockedByMaxHours = registrationSettings.enforceMaxHours && (registeredHours + Number(course.hours || 0)) > effectiveMaxHours;
            const selectionBadgeMeta = isRegistered ? getSelectedCourseBadgeMeta(selectedCourse?.status) : null;
            const eligibilityMeta = selectionBadgeMeta || getEligibilityBadgeMeta(course?.eligibility_status);
            const eligibilityTitle = [
              ...(Array.isArray(course?.eligibility_reasons) ? course.eligibility_reasons : []),
              ...(Array.isArray(course?.eligibility_warnings) ? course.eligibility_warnings : []),
            ]
              .filter(Boolean)
              .join(" | ");
            const displayTitle = isRegistered
              ? selectionBadgeMeta?.label || ""
              : eligibilityTitle || eligibilityMeta.label;
            return (
              <div key={course.id} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-gray-800">{course.name}</h3>
                      <span title={displayTitle} className={`rounded-full border px-2 py-1 text-[10px] font-black ${eligibilityMeta.classes}`}>
                        {eligibilityMeta.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{course.id} - السنة {course.year}</p>
                  </div>
                  <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-bold text-gray-600">
                    {course.hours} ساعة
                  </span>
                </div>
                <div className="mt-4 space-y-2 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar size={14} /> {course.lecture.day} - {course.lecture.time}
                  </div>
                  <div className="flex items-center gap-1">
                    <Monitor size={14} /> {course.groups?.length || 0} مجموعة
                  </div>
                  {course.prereq && (
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertCircle size={14} /> المتطلب السابق: {course.prereq}
                    </div>
                  )}
                  {blockedByMaxHours && (
                    <div className="flex items-center gap-1 text-rose-600">
                      <AlertCircle size={14} /> لا يمكن إضافة المادة لأنها ستتجاوز الحد الأقصى للساعات.
                    </div>
                  )}
                  {!isRegistered && eligibilityTitle && (
                    <div className="flex items-start gap-1 text-amber-700">
                      <AlertCircle size={14} className="mt-0.5" /> {eligibilityTitle}
                    </div>
                  )}
                </div>
                <button
                  disabled={!canRegisterNow || isRegistered || isTermLockedByAdvisorFlow || String(course?.eligibility_status || "").trim().toLowerCase() === "blocked"}
                  onClick={() => setSelectedCourseForGroups(course)}
                  className={`mt-4 w-full rounded-2xl px-4 py-3 text-xs font-black transition-all ${
                    isRegistered
                      ? "bg-emerald-500 text-white"
                      : canRegisterNow && !isTermLockedByAdvisorFlow && String(course?.eligibility_status || "").trim().toLowerCase() !== "blocked"
                      ? "bg-slate-900 text-white hover:bg-black"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isRegistered
                    ? ["advisor_approved", "registered", "approved", "locked"].includes(
                        String(
                          selectedCourses.find((c) => c.id === course.id && c.semester === openSemester)?.status || ""
                        )
                          .trim()
                          .toLowerCase()
                      )
                      ? t("academic_reg_registered_executed")
                      : t("academic_reg_saved_pending_advisor")
                    : isTermLockedByAdvisorFlow
                    ? t("academic_reg_request_sent_locked")
                    : t("academic_reg_add_course")}
                </button>
              </div>
            );
          })}
          {filteredCourses.length === 0 && (
            <div className="col-span-full bg-white rounded-3xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
              لا توجد مواد متاحة مطابقة لخيارات البحث الحالية.
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {selectedCourseForGroups && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedCourseForGroups(null)}></div>
          <div className="bg-white w-full max-w-xl rounded-[2rem] shadow-2xl relative z-10 overflow-hidden">
            <div className="bg-[#05ADCF] p-6 text-white">
              <h2 className="text-xl font-black">اختر المجموعة</h2>
              <p className="text-xs opacity-80">يرجى اختيار المجموعة المناسبة لمسارك لتجنب التعارضات.</p>
            </div>
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              {(selectedCourseForGroups.groups || []).length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
                  لا توجد أي مجموعات متاحة لهذه المادة.
                </div>
              )}
              {selectedCourseForGroups.groups?.map((group) => (
                (() => {
                  const incomingWindows = [parseSessionWindow(selectedCourseForGroups?.lecture), parseSessionWindow(group)].filter(Boolean);
                  const currentSemesterRegs = selectedCourses.filter(
                    (item) =>
                      String(item?.semester || "") === String(openSemester || "") &&
                      String(item?.id || item?.code || "") !== String(selectedCourseForGroups?.id || selectedCourseForGroups?.code || "")
                  );
                  let conflictCourseName = "";
                  if (incomingWindows.length > 0) {
                    for (const existing of currentSemesterRegs) {
                      const existingWindows = [parseSessionWindow(existing?.lecture), parseSessionWindow(existing?.selectedGroup)].filter(Boolean);
                      for (const nextSlot of incomingWindows) {
                        for (const oldSlot of existingWindows) {
                          if (overlaps(nextSlot, oldSlot)) {
                            conflictCourseName = existing?.name || existing?.id || existing?.code || "مادة أخرى";
                            break;
                          }
                        }
                        if (conflictCourseName) break;
                      }
                      if (conflictCourseName) break;
                    }
                  }

                  const isFull = Boolean(group?.full);
                  const isEligibilityBlocked = String(group?.eligibility_status || selectedCourseForGroups?.eligibility_status || "").trim().toLowerCase() === "blocked";
                  const isBlocked = isFull || Boolean(conflictCourseName) || isEligibilityBlocked;
                  const groupMeta = getEligibilityBadgeMeta(group?.eligibility_status || selectedCourseForGroups?.eligibility_status);
                  const backendReason = [
                    ...(Array.isArray(group?.eligibility_reasons) ? group.eligibility_reasons : []),
                    ...(Array.isArray(group?.eligibility_warnings) ? group.eligibility_warnings : []),
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  const blockReason = isFull
                    ? "مغلقة (المجموعة ممتلئة)"
                    : conflictCourseName
                    ? `يوجد تعارض مع المادة ${conflictCourseName}`
                    : backendReason
                    ? backendReason
                    : "";

                  return (
                    <button
                      key={group.id}
                      disabled={isBlocked}
                      onClick={() => confirmRegistration(selectedCourseForGroups, group)}
                      className={`w-full rounded-2xl border p-4 text-right transition-colors ${
                        isBlocked
                          ? "border-rose-200 bg-rose-50 text-rose-700 cursor-not-allowed"
                          : "border-gray-100 hover:border-[#05ADCF]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-gray-800">{group.name}</div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${groupMeta.classes}`}>{groupMeta.label}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {group.day} - {group.time} - {group.hall}
                      </div>
                      {blockReason && <div className="mt-1 text-[11px] font-bold text-rose-600">{blockReason}</div>}
                    </button>
                  );
                })()
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}







