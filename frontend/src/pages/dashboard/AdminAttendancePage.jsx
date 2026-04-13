import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, CameraOff, CheckCircle2, Download, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createAttendanceRecord, isDuplicateAttendance, isQRCodeExpired, parseStudentQR } from "../../utils/attendanceUtils";
import { exportAttendancePdf } from "../../utils/exportAttendancePdf";

const ATTENDANCE_STORAGE_KEY = "admin.attendance.session";

const readStoredAttendance = () => {
    try {
        const raw = localStorage.getItem(ATTENDANCE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export default function AdminAttendancePage() {
    const { t } = useTranslation("admin");
    const [attendanceList, setAttendanceList] = useState(readStoredAttendance);
    const [scannerEnabled, setScannerEnabled] = useState(false);
    const [sessionTitle, setSessionTitle] = useState("كشف حضور المحاضرة");
    const [manualQrInput, setManualQrInput] = useState("");
    const [lastScanStatus, setLastScanStatus] = useState({ type: "paused", payload: null });
    const [cameraErrorText, setCameraErrorText] = useState("");

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const scanLoopRef = useRef(null);
    const lastRawRef = useRef({ value: "", at: 0 });
    const qrDecoderRef = useRef(null);
    const audioCtxRef = useRef(null);
    const statusStyles = useMemo(() => ({
        valid: { text: t("admin.attendance.status.valid"), color: "text-emerald-600", icon: CheckCircle2 },
        duplicate: { text: t("admin.attendance.status.duplicate"), color: "text-amber-600", icon: AlertCircle },
        expired: { text: t("admin.attendance.status.expired"), color: "text-rose-600", icon: XCircle },
        invalid: { text: t("admin.attendance.status.invalid"), color: "text-rose-600", icon: XCircle },
        camera_error: { text: t("admin.attendance.status.cameraError"), color: "text-rose-600", icon: XCircle },
        paused: { text: t("admin.attendance.status.paused"), color: "text-slate-500", icon: CameraOff },
        idle: { text: t("admin.attendance.status.idle"), color: "text-slate-500", icon: AlertCircle },
    }), [t]);

    useEffect(() => {
        localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(attendanceList));
    }, [attendanceList]);

    useEffect(() => {
        return () => {
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(() => {});
                audioCtxRef.current = null;
            }
        };
    }, []);

    const playTone = (ctx, { frequency = 880, duration = 0.12, volume = 0.15, type = "sine", startAt = 0 }) => {
        const when = ctx.currentTime + startAt;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, when);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(volume, when + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(when);
        osc.stop(when + duration + 0.01);
    };

    const playScanSound = (kind) => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;

            if (!audioCtxRef.current) {
                audioCtxRef.current = new AudioCtx();
            }

            const ctx = audioCtxRef.current;
            if (ctx.state === "suspended") {
                ctx.resume();
            }

            if (kind === "valid") {
                // "تيت" قصير للقراءة الصحيحة
                playTone(ctx, { frequency: 1320, duration: 0.09, volume: 0.18, type: "sine" });
                return;
            }

            if (kind === "duplicate") {
                // نغمتين قصيرتين للمسجل بالفعل
                playTone(ctx, { frequency: 620, duration: 0.07, volume: 0.16, type: "triangle", startAt: 0 });
                playTone(ctx, { frequency: 620, duration: 0.07, volume: 0.16, type: "triangle", startAt: 0.1 });
                return;
            }

            // نغمة رفض (هابط)
            playTone(ctx, { frequency: 780, duration: 0.1, volume: 0.16, type: "sawtooth", startAt: 0 });
            playTone(ctx, { frequency: 420, duration: 0.14, volume: 0.16, type: "sawtooth", startAt: 0.12 });
        } catch {
            // ignore audio errors
        }
    };

    const processQrPayload = (rawValue) => {
        const parsed = parseStudentQR(rawValue);
        if (!parsed) {
            setLastScanStatus({ type: "invalid", payload: null });
            playScanSound("rejected");
            return;
        }

        if (isQRCodeExpired(parsed.factor, { allowPreviousFactors: 0 })) {
            setLastScanStatus({ type: "expired", payload: parsed });
            playScanSound("rejected");
            return;
        }

        if (isDuplicateAttendance(attendanceList, parsed.studentId)) {
            setLastScanStatus({ type: "duplicate", payload: parsed });
            playScanSound("duplicate");
            return;
        }

        const next = createAttendanceRecord(parsed);
        setAttendanceList((prev) => [...prev, next]);
        setLastScanStatus({ type: "valid", payload: parsed });
        playScanSound("valid");
    };

    const handleManualSubmit = () => {
        if (!manualQrInput.trim()) return;
        processQrPayload(manualQrInput.trim());
        setManualQrInput("");
    };

    useEffect(() => {
        if (!scannerEnabled) {
            setLastScanStatus({ type: "paused", payload: null });
            return undefined;
        }

        let active = true;

        const startCamera = async () => {
            try {
                let detector = null;
                const supportsBarcodeDetector = "BarcodeDetector" in window;
                if (supportsBarcodeDetector) {
                    detector = new window.BarcodeDetector({ formats: ["qr_code"] });
                    qrDecoderRef.current = null;
                    setCameraErrorText("");
                } else {
                    try {
                        const mod = await import("jsqr");
                        qrDecoderRef.current = mod?.default || mod;
                        setCameraErrorText(t("admin.attendance.camera.compatMode"));
                    } catch {
                        setCameraErrorText(t("admin.attendance.camera.jsQrMissing"));
                        setLastScanStatus({ type: "camera_error", payload: null });
                        return;
                    }
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "environment" },
                    audio: false,
                });

                if (!active) return;
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                const loop = async () => {
                    if (!active || !videoRef.current) return;
                    try {
                        let raw = "";

                        if (detector) {
                            const codes = await detector.detect(videoRef.current);
                            raw = codes?.[0]?.rawValue || "";
                        } else if (qrDecoderRef.current && canvasRef.current) {
                            const video = videoRef.current;
                            const canvas = canvasRef.current;
                            const width = video.videoWidth || 0;
                            const height = video.videoHeight || 0;
                            if (width > 0 && height > 0) {
                                if (canvas.width !== width || canvas.height !== height) {
                                    canvas.width = width;
                                    canvas.height = height;
                                }
                                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                                if (ctx) {
                                    ctx.drawImage(video, 0, 0, width, height);
                                    const img = ctx.getImageData(0, 0, width, height);
                                    const qr = qrDecoderRef.current(img.data, width, height, { inversionAttempts: "dontInvert" });
                                    raw = qr?.data || "";
                                }
                            }
                        }

                        if (raw) {
                            const now = Date.now();
                            if (lastRawRef.current.value !== raw || now - lastRawRef.current.at > 2000) {
                                lastRawRef.current = { value: raw, at: now };
                                processQrPayload(raw);
                            }
                        }
                    } catch {
                        // ignore detector loop errors
                    }
                    scanLoopRef.current = requestAnimationFrame(loop);
                };

                loop();
            } catch (error) {
                if (error?.name === "NotAllowedError") {
                    setCameraErrorText(t("admin.attendance.camera.permissionDenied"));
                } else if (error?.name === "NotReadableError") {
                    setCameraErrorText(t("admin.attendance.camera.inUse"));
                } else if (error?.name === "NotFoundError") {
                    setCameraErrorText(t("admin.attendance.camera.notFound"));
                } else {
                    setCameraErrorText(t("admin.attendance.camera.startFailed"));
                }
                setLastScanStatus({ type: "camera_error", payload: null });
            }
        };

        startCamera();

        return () => {
            active = false;
            if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
        };
    }, [scannerEnabled, attendanceList, t]);

    const statusMeta = useMemo(() => statusStyles[lastScanStatus.type] || statusStyles.idle, [lastScanStatus.type]);
    const StatusIcon = statusMeta.icon;

    const handleRemove = (studentId) => {
        setAttendanceList((prev) => prev.filter((item) => String(item.studentId) !== String(studentId)));
    };

    const clearAll = () => {
        setAttendanceList([]);
        setLastScanStatus({ type: scannerEnabled ? "idle" : "paused", payload: null });
    };

    return (
        <div className="space-y-5" dir="rtl">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-black text-slate-800">{t("admin.attendance.title")}</h1>
                        <p className="text-sm text-slate-500 mt-1">{t("admin.attendance.subtitle")}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setScannerEnabled((prev) => !prev)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${
                                scannerEnabled ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-cyan-50 text-cyan-700 border border-cyan-100"
                            }`}
                        >
                            {scannerEnabled ? <CameraOff size={16} /> : <Camera size={16} />}
                            {scannerEnabled ? t("admin.attendance.stopScanner") : t("admin.attendance.enableScanner")}
                        </button>
                        <button onClick={clearAll} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-2">
                            <RefreshCw size={16} /> {t("admin.attendance.clearSession")}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 max-w-xl mx-auto">
                        <video ref={videoRef} className="w-full h-[280px] object-cover" muted playsInline />
                        <canvas ref={canvasRef} className="hidden" />
                    </div>

                    <div className={`mt-3 p-3 rounded-xl border flex items-center gap-2 ${statusMeta.color} bg-white`}>
                        <StatusIcon size={18} />
                        <p className="text-sm font-bold">{statusMeta.text}</p>
                        {lastScanStatus?.payload?.studentName && <span className="text-xs opacity-80">({lastScanStatus.payload.studentName})</span>}
                    </div>
                    {lastScanStatus.type === "camera_error" && cameraErrorText ? <p className="mt-2 text-xs text-rose-600">{cameraErrorText}</p> : null}

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                        <input value={manualQrInput} onChange={(e) => setManualQrInput(e.target.value)} placeholder={t("admin.attendance.manualQrPlaceholder")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                        <button onClick={handleManualSubmit} className="px-4 py-2 rounded-xl bg-[#05ADCF] text-white text-sm font-black">
                            {t("admin.attendance.manualApprove")}
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                    <label className="text-xs font-bold text-slate-500">{t("admin.attendance.sessionTitle")}</label>
                    <input value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3">
                        <p className="text-xs text-cyan-700">{t("admin.attendance.totalAttendance")}</p>
                        <p className="text-2xl font-black text-cyan-700">{attendanceList.length}</p>
                    </div>
                    <button
                        onClick={() => exportAttendancePdf({ attendanceList, sessionTitle })}
                        disabled={attendanceList.length === 0}
                        className="w-full rounded-xl px-4 py-3 bg-slate-900 text-white font-bold text-sm disabled:bg-slate-300 flex items-center justify-center gap-2"
                    >
                        <Download size={16} /> {t("admin.attendance.exportPdf")}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 font-black text-slate-700">{t("admin.attendance.currentAttendanceList")}</div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-right">
                        <thead className="bg-slate-50 text-slate-600 text-xs">
                            <tr>
                                <th className="px-4 py-3">{t("admin.attendance.table.studentCode")}</th>
                                <th className="px-4 py-3">{t("admin.attendance.table.studentName")}</th>
                                <th className="px-4 py-3">{t("admin.attendance.table.college")}</th>
                                <th className="px-4 py-3">{t("admin.attendance.table.registeredAt")}</th>
                                <th className="px-4 py-3">{t("admin.attendance.table.status")}</th>
                                <th className="px-4 py-3">{t("admin.attendance.table.actions")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {attendanceList.map((item) => (
                                <tr key={item.studentId}>
                                    <td className="px-4 py-3 font-bold text-slate-700">{item.studentId}</td>
                                    <td className="px-4 py-3">{item.studentName}</td>
                                    <td className="px-4 py-3">{item.college}</td>
                                    <td className="px-4 py-3">{new Date(item.scannedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">{t("admin.attendance.present")}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => handleRemove(item.studentId)} className="px-2 py-1 rounded-lg text-rose-600 bg-rose-50 text-xs font-bold flex items-center gap-1">
                                            <Trash2 size={13} /> {t("admin.common.delete")}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {attendanceList.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center px-4 py-8 text-slate-400">
                                        {t("admin.attendance.empty")}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
