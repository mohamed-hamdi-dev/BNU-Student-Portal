import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Clock3, Loader2, QrCode, Save, ShieldAlert, Users } from "lucide-react";
import jsQR from "jsqr";
import { QRCodeSVG } from "qrcode.react";
import {
  closeAttendanceSession,
  createAttendanceSession,
  getAttendanceSessionRecords,
  listAttendanceOfferings,
  listAttendanceSessions,
  markAttendanceAbsent,
  scanAttendance,
  upsertAttendanceRecord,
} from "../../services/attendanceApi";
import { getCurrentAcademicYear } from "../../utils/academicData";
import { isQRCodeExpired, parseStudentQR } from "../../utils/attendanceUtils";

const semesterOptions = [
  { value: "autumn", label: "الخريف" },
  { value: "spring", label: "الربيع" },
  { value: "summer", label: "الصيفي" },
];

const statusMeta = {
  present: { label: "حاضر", chip: "bg-emerald-100 text-emerald-700" },
  absent: { label: "غائب", chip: "bg-rose-100 text-rose-700" },
  late: { label: "متأخر", chip: "bg-amber-100 text-amber-700" },
  unmarked: { label: "غير محدد", chip: "bg-slate-100 text-slate-600" },
};

const todayValue = () => new Date().toISOString().slice(0, 10);

const SESSION_QR_PREFIX = "ATTENDANCE_SESSION";

const buildDefaultTitle = (offering) => {
  if (!offering) return "جلسة حضور";
  return `حضور ${offering.display_title || offering.course_title_ar || offering.course_code || "المادة"} - ${offering.section || ""}`.trim();
};

const buildSessionQrValue = (session) => {
  if (!session?.id || !session?.qr_token) return "";
  return `${SESSION_QR_PREFIX}|SID:${session.id}|TOKEN:${session.qr_token}`;
};

export default function AdminAttendancePage() {
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [semester, setSemester] = useState("autumn");
  const [offerings, setOfferings] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [sessionPayload, setSessionPayload] = useState(null);
  const [sessionTitle, setSessionTitle] = useState("جلسة حضور");
  const [sessionDate, setSessionDate] = useState(todayValue());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scannerEnabled, setScannerEnabled] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("جاهز للمسح");
  const [scannerError, setScannerError] = useState("");
  const [manualStudentCode, setManualStudentCode] = useState("");
  const [lastScanResult, setLastScanResult] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanFrameRef = useRef(null);
  const lastDecodedRef = useRef({ value: "", at: 0 });

  const courseOptions = useMemo(() => {
    const map = new Map();
    (Array.isArray(offerings) ? offerings : []).forEach((item) => {
      const key = String(item?.course_id || item?.course_code || item?.offering_id || "");
      if (!key || map.has(key)) return;
        map.set(key, {
          value: key,
          label: `${item?.display_title || item?.course_title_ar || "مادة"}${item?.course_code ? ` (${item.course_code})` : ""}`,
        });
    });
    return [...map.values()];
  }, [offerings]);

  const filteredOfferings = useMemo(() => {
    if (!selectedCourseId) return offerings;
    return (Array.isArray(offerings) ? offerings : []).filter(
      (item) => String(item?.course_id || item?.course_code || "") === String(selectedCourseId)
    );
  }, [offerings, selectedCourseId]);

  const selectedOffering = useMemo(
    () => (Array.isArray(offerings) ? offerings : []).find((item) => String(item?.offering_id) === String(selectedOfferingId)) || null,
    [offerings, selectedOfferingId]
  );

  const stopScanner = React.useCallback(() => {
    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore stop errors from browser APIs.
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await listAttendanceOfferings({ academic_year_label: academicYear, semester });
        if (cancelled) return;
        const nextOfferings = Array.isArray(response?.items) ? response.items : [];
        setOfferings(nextOfferings);
        const nextCourseId = nextOfferings[0]?.course_id || nextOfferings[0]?.course_code || "";
        setSelectedCourseId((prev) => {
          const exists = nextOfferings.some((item) => String(item?.course_id || item?.course_code || "") === String(prev));
          return exists ? prev : String(nextCourseId || "");
        });
      } catch (err) {
        if (!cancelled) {
          setOfferings([]);
          setError(err?.message || "تعذر تحميل الشعب المتاحة للغياب.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [academicYear, semester]);

  useEffect(() => {
    const firstOfferingId = filteredOfferings[0]?.offering_id || "";
    setSelectedOfferingId((prev) => {
      const exists = filteredOfferings.some((item) => String(item?.offering_id) === String(prev));
      return exists ? prev : String(firstOfferingId || "");
    });
  }, [filteredOfferings]);

  useEffect(() => {
    setSessionTitle(buildDefaultTitle(selectedOffering));
  }, [selectedOfferingId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selectedOfferingId) {
        setSessions([]);
        setActiveSessionId("");
        setSessionPayload(null);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await listAttendanceSessions(selectedOfferingId);
        if (cancelled) return;
        const items = Array.isArray(response?.items) ? response.items : [];
        setSessions(items);
        const preferredSession =
          items.find((item) => String(item?.status || "").toLowerCase() === "open") ||
          items[0] ||
          null;
        setActiveSessionId(preferredSession ? String(preferredSession.id) : "");
      } catch (err) {
        if (!cancelled) {
          setSessions([]);
          setActiveSessionId("");
          setSessionPayload(null);
          setError(err?.message || "تعذر تحميل جلسات الغياب.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedOfferingId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!activeSessionId) {
        setSessionPayload(null);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await getAttendanceSessionRecords(activeSessionId);
        if (!cancelled) setSessionPayload(response);
      } catch (err) {
        if (!cancelled) {
          setSessionPayload(null);
          setError(err?.message || "تعذر تحميل سجل الجلسة.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  useEffect(() => () => stopScanner(), [stopScanner]);

  const totals = sessionPayload?.totals || {};
  const activeSession = sessionPayload?.session || sessions.find((item) => String(item?.id) === String(activeSessionId)) || null;
  const activeSessionOpen = String(activeSession?.status || "").toLowerCase() === "open";
  const sessionQrValue = buildSessionQrValue(activeSession);

  const refreshActiveSession = async () => {
    if (!activeSessionId) return;
    const response = await getAttendanceSessionRecords(activeSessionId);
    setSessionPayload(response);
  };

  const submitQrAttendance = async ({ studentCode, rawValue }) => {
    if (!activeSessionId || !activeSession?.qr_token) {
      throw new Error("لا توجد جلسة مفتوحة أو QR token غير متاح.");
    }
    const normalizedCode = String(studentCode || "").trim();
    if (!normalizedCode) {
      throw new Error("تعذر استخراج كود الطالب من QR.");
    }
    const response = await scanAttendance(activeSessionId, {
      student_code: normalizedCode,
      qr_token: activeSession.qr_token,
    });
    await refreshActiveSession();
    setLastScanResult({
      type: "success",
      studentCode: normalizedCode,
      rawValue: rawValue || normalizedCode,
      at: new Date().toISOString(),
      response,
    });
    setScannerStatus(`تم تسجيل حضور الطالب ${normalizedCode}`);
    return response;
  };

  const handleDecodedQr = React.useCallback(
    async (rawValue) => {
      const trimmed = String(rawValue || "").trim();
      if (!trimmed || saving) return;
      const now = Date.now();
      if (lastDecodedRef.current.value === trimmed && now - lastDecodedRef.current.at < 2500) {
        return;
      }
      lastDecodedRef.current = { value: trimmed, at: now };
      setSaving(true);
      setScannerError("");
      try {
        const parsed = parseStudentQR(trimmed);
        if (parsed) {
          if (isQRCodeExpired(parsed.factor, { allowPreviousFactors: 1 })) {
            throw new Error("رمز الطالب منتهي الصلاحية. اطلب من الطالب فتح QR الحالي من البوابة.");
          }
          await submitQrAttendance({ studentCode: parsed.studentId, rawValue: trimmed });
          return;
        }
        await submitQrAttendance({ studentCode: trimmed, rawValue: trimmed });
      } catch (err) {
        const message = err?.message || "تعذر قراءة QR الطالب.";
        setScannerError(message);
        setScannerStatus(message);
        setLastScanResult({
          type: "error",
          rawValue: trimmed,
          at: new Date().toISOString(),
          message,
        });
      } finally {
        setSaving(false);
      }
    },
    [activeSessionId, activeSession?.qr_token, saving]
  );

  useEffect(() => {
    if (!scannerEnabled || !activeSessionOpen) {
      stopScanner();
      return;
    }
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        scanFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height);
          if (result?.data) {
            handleDecodedQr(result.data);
          }
        }
      }
      scanFrameRef.current = requestAnimationFrame(tick);
    };

    const start = async () => {
      try {
        setScannerError("");
        setScannerStatus("جارٍ تشغيل الكاميرا...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScannerStatus("وجّه الكاميرا إلى QR الطالب.");
        tick();
      } catch (err) {
        const message = err?.message || "تعذر تشغيل الكاميرا.";
        setScannerError(message);
        setScannerStatus(message);
        setScannerEnabled(false);
      }
    };

    start();
    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [scannerEnabled, activeSessionOpen, handleDecodedQr, stopScanner]);

  const handleCreateSession = async () => {
    if (!selectedOfferingId) {
      setError("اختر الشعبة أولاً.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await createAttendanceSession({
        offering_id: Number(selectedOfferingId),
        title: sessionTitle || buildDefaultTitle(selectedOffering),
        session_date: sessionDate,
        start_time: startTime || null,
        end_time: endTime || null,
      });
      const sessionId = String(response?.session?.id || "");
      setSessionPayload(response);
      setActiveSessionId(sessionId);
      const refreshed = await listAttendanceSessions(selectedOfferingId);
      setSessions(Array.isArray(refreshed?.items) ? refreshed.items : []);
    } catch (err) {
      setError(err?.message || "تعذر إنشاء جلسة الغياب.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (studentUserId, status) => {
    if (!activeSessionId) return;
    setSaving(true);
    setError("");
    try {
      const response =
        status === "absent"
          ? await markAttendanceAbsent(activeSessionId, { student_user_id: Number(studentUserId) })
          : await upsertAttendanceRecord(activeSessionId, {
              student_user_id: Number(studentUserId),
              status,
              marked_method: "manual",
            });
      setSessionPayload(response);
    } catch (err) {
      setError(err?.message || "تعذر تحديث حالة الحضور.");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseSession = async () => {
    if (!activeSessionId) return;
    setSaving(true);
    setError("");
    try {
      const response = await closeAttendanceSession(activeSessionId);
      setSessionPayload(response);
      const refreshed = await listAttendanceSessions(selectedOfferingId);
      setSessions(Array.isArray(refreshed?.items) ? refreshed.items : []);
    } catch (err) {
      setError(err?.message || "تعذر غلق الجلسة.");
    } finally {
      setSaving(false);
    }
  };

  const handleManualQrSubmit = async () => {
    if (!manualStudentCode.trim()) {
      setScannerError("أدخل كود الطالب أو نص QR أولًا.");
      return;
    }
    await handleDecodedQr(manualStudentCode.trim());
    setManualStudentCode("");
  };

  useEffect(() => {
    if (!activeSessionOpen && scannerEnabled) {
      setScannerEnabled(false);
    }
  }, [activeSessionOpen, scannerEnabled]);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">إدارة حضور الطلاب</h1>
            <p className="mt-1 text-sm text-slate-500">
              ربط الغياب بالشعبة المسجل بها الطالب وتسجيل الحضور يدويًا من خلال قاعدة البيانات.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <ShieldAlert size={18} className="text-cyan-700" />
            <span>نسخة MVP: تسجيل يدوي أولًا، وQR جاهز للربط لاحقًا من نفس الـ session.</span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">اختيار المادة والشعبة</h2>
            <div className="mt-4 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-500">السنة الأكاديمية</span>
                <input
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-500">الفصل الدراسي</span>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  {semesterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-500">المادة</span>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  {courseOptions.length === 0 && <option value="">لا توجد مواد</option>}
                  {courseOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-500">الشعبة / السكشن</span>
                <select
                  value={selectedOfferingId}
                  onChange={(e) => setSelectedOfferingId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  {filteredOfferings.length === 0 && <option value="">لا توجد شعب</option>}
                  {filteredOfferings.map((item) => (
                    <option key={item.offering_id} value={item.offering_id}>
                      {item.section} • {item.target_group_name || item.room_name || "بدون اسم"} • طلاب {item.registered_students_count || 0}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">إنشاء جلسة حضور</h2>
            <div className="mt-4 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-500">عنوان الجلسة</span>
                <input
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-500">التاريخ</span>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-500">من</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-500">إلى</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={saving || !selectedOfferingId}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#05ADCF] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                إنشاء Session جديد
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">جلسات الشعبة</h2>
            <div className="mt-4 space-y-2">
              {sessions.length === 0 && <p className="text-sm text-slate-400">لا توجد جلسات لهذه الشعبة حتى الآن.</p>}
              {sessions.map((item) => {
                const isActive = String(item?.id) === String(activeSessionId);
                const isOpen = String(item?.status || "").toLowerCase() === "open";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSessionId(String(item.id))}
                    className={`w-full rounded-2xl border px-4 py-3 text-right transition ${
                      isActive ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-slate-900">{item.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.session_date} {item.start_time ? `• ${item.start_time}` : ""}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                        {isOpen ? "مفتوحة" : "مغلقة"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {selectedOffering?.display_title || selectedOffering?.course_title_ar || "سجل الجلسة"}
                  {selectedOffering?.section ? ` - ${selectedOffering.section}` : ""}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {activeSession?.title || "اختر Session من القائمة أو أنشئ واحدة جديدة"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span className="font-black text-slate-900">{totals.registered_students || 0}</span> طالب مسجل
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <span className="font-black">{totals.present || 0}</span> حاضر
                </div>
                <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <span className="font-black">{totals.late || 0}</span> متأخر
                </div>
                <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <span className="font-black">{totals.absent || 0}</span> غائب
                </div>
              </div>
            </div>

            {error ? (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            ) : null}

            {activeSession ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleCloseSession}
                    disabled={saving || !activeSessionOpen}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    غلق الجلسة واعتماد الغياب
                  </button>
                  {!activeSessionOpen ? (
                    <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
                      الجلسة مغلقة ولا يمكن تعديلها
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-700">
                      <QrCode size={18} className="text-cyan-700" />
                      <h3 className="font-black">QR الجلسة</h3>
                    </div>
                    <div className="mt-4 flex justify-center rounded-3xl bg-white p-4 shadow-sm">
                      {sessionQrValue ? (
                        <QRCodeSVG value={sessionQrValue} size={180} level="M" includeMargin />
                      ) : (
                        <div className="flex h-[180px] w-[180px] items-center justify-center text-sm text-slate-400">
                          لا يوجد QR متاح
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-xs leading-6 text-slate-500">
                      الطالب يفتح QR الشخصي من البوابة، والماسح هنا يقرأه ثم يربطه تلقائيًا بـ session المفتوحة باستخدام token الجلسة.
                    </p>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-black text-slate-900">ماسح QR</h3>
                        <p className="mt-1 text-xs text-slate-500">{scannerStatus}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScannerEnabled((prev) => !prev)}
                        disabled={!activeSessionOpen}
                        className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white disabled:opacity-50 ${
                          scannerEnabled ? "bg-slate-700" : "bg-[#05ADCF]"
                        }`}
                      >
                        {scannerEnabled ? <CameraOff size={16} /> : <Camera size={16} />}
                        {scannerEnabled ? "إيقاف الماسح" : "تشغيل الماسح"}
                      </button>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950">
                      <video ref={videoRef} muted playsInline className="h-[260px] w-full object-cover" />
                      {!scannerEnabled ? (
                        <div className="flex h-[260px] items-center justify-center text-center text-sm text-slate-300">
                          اضغط تشغيل الماسح ثم وجّه الكاميرا إلى QR الطالب.
                        </div>
                      ) : null}
                      <canvas ref={canvasRef} className="hidden" />
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                      <input
                        value={manualStudentCode}
                        onChange={(e) => setManualStudentCode(e.target.value)}
                        placeholder="أدخل كود الطالب أو نص QR يدويًا"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleManualQrSubmit}
                        disabled={!activeSessionOpen || saving}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-cyan-700 border border-cyan-200 disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        اعتماد يدوي
                      </button>
                    </div>

                    {scannerError ? (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {scannerError}
                      </div>
                    ) : null}

                    {lastScanResult ? (
                      <div
                        className={`mt-3 rounded-2xl px-4 py-3 text-sm ${
                          lastScanResult.type === "success"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        <div className="font-black">
                          {lastScanResult.type === "success" ? "آخر مسح تم بنجاح" : "آخر مسح لم يكتمل"}
                        </div>
                        <div className="mt-1">
                          {lastScanResult.studentCode || lastScanResult.rawValue || "-"}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
              <Users size={18} className="text-cyan-700" />
              <h3 className="font-black text-slate-900">قائمة الطلاب المسجلين</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-right">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-3">الكود</th>
                    <th className="px-4 py-3">اسم الطالب</th>
                    <th className="px-4 py-3">الكلية</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-4 py-3">آخر تحديث</th>
                    <th className="px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loading && !sessionPayload ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        جارٍ التحميل...
                      </td>
                    </tr>
                  ) : null}
                  {!loading && (!sessionPayload || !Array.isArray(sessionPayload?.records) || sessionPayload.records.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        اختر Session لعرض الطلاب أو أنشئ جلسة جديدة.
                      </td>
                    </tr>
                  ) : null}
                  {(sessionPayload?.records || []).map((item) => {
                    const currentStatus = String(item?.attendance_status || "unmarked").toLowerCase();
                    const meta = statusMeta[currentStatus] || statusMeta.unmarked;
                    return (
                      <tr key={item.student_user_id}>
                        <td className="px-4 py-3 font-bold text-slate-700">{item.student_code || item.student_user_id}</td>
                        <td className="px-4 py-3 text-slate-800">{item.student_name}</td>
                        <td className="px-4 py-3 text-slate-500">{item.college || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-bold ${meta.chip}`}>{meta.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {item.marked_at ? new Date(item.marked_at).toLocaleString("ar-EG") : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!activeSessionOpen || saving}
                              onClick={() => handleStatusChange(item.student_user_id, "present")}
                              className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-50"
                            >
                              حاضر
                            </button>
                            <button
                              type="button"
                              disabled={!activeSessionOpen || saving}
                              onClick={() => handleStatusChange(item.student_user_id, "late")}
                              className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              <Clock3 size={13} />
                              متأخر
                            </button>
                            <button
                              type="button"
                              disabled={!activeSessionOpen || saving}
                              onClick={() => handleStatusChange(item.student_user_id, "absent")}
                              className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50"
                            >
                              غائب
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
