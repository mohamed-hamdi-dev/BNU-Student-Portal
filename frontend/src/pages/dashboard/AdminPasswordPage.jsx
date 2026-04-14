import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Move, Search, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../../context/AuthContext";
import { getMyApprovedProfilePhoto, uploadMyProfilePhoto } from "../../services/profilePhotoApi";
import { apiFetch } from "../../services/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8001";
const CROP_PREVIEW_SIZE = 224;

const withToken = (url) => {
    if (!url) return "";
    const token = localStorage.getItem("access_token") || "";
    if (!token) return url;
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}token=${encodeURIComponent(token)}`;
};

const loadImage = (src) =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });

const buildCroppedBlob = async (src, cropX, cropY, zoom) => {
    const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    const outSize = 900;
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare image");

    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    const minSide = Math.min(w, h);
    const clampedZoom = Math.max(1, Math.min(2.5, Number(zoom || 1)));
    const cropSide = minSide / clampedZoom;
    const maxX = Math.max(0, (w - cropSide) / 2);
    const maxY = Math.max(0, (h - cropSide) / 2);
    // Keep exported crop aligned with on-screen preview movement direction.
    const cx = w / 2 - (Number(cropX || 0) / 100) * maxX;
    const cy = h / 2 - (Number(cropY || 0) / 100) * maxY;
    const sx = Math.max(0, Math.min(w - cropSide, cx - cropSide / 2));
    const sy = Math.max(0, Math.min(h - cropSide, cy - cropSide / 2));

    ctx.drawImage(image, sx, sy, cropSide, cropSide, 0, 0, outSize, outSize);
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save image"))), "image/jpeg", 0.92);
    });
};

export default function AdminPasswordPage() {
    const { t } = useTranslation("global");
    const isRTL = String(document?.documentElement?.dir || "rtl").toLowerCase() === "rtl";
    const { currentUser, setCurrentUser } = useContext(AuthContext);

    const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState(null);

    const [avatarUrl, setAvatarUrl] = useState("");
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [cropOpen, setCropOpen] = useState(false);
    const [cropSource, setCropSource] = useState("");
    const [cropFileName, setCropFileName] = useState("profile");
    const [cropX, setCropX] = useState(0);
    const [cropY, setCropY] = useState(0);
    const [zoom, setZoom] = useState(1.2);
    const [cropImageMeta, setCropImageMeta] = useState({ width: 0, height: 0 });
    const [isDraggingCrop, setIsDraggingCrop] = useState(false);
    const [avatarSizePx, setAvatarSizePx] = useState(() => Number(currentUser?.avatarSizePx ?? currentUser?.avatar_size_px ?? 48) || 48);
    const [avatarObjectX, setAvatarObjectX] = useState(() => Math.max(0, Math.min(100, Number(currentUser?.avatarObjectX ?? currentUser?.avatar_object_x ?? 50) || 50)));
    const [avatarObjectY, setAvatarObjectY] = useState(() => Math.max(0, Math.min(100, Number(currentUser?.avatarObjectY ?? currentUser?.avatar_object_y ?? 50) || 50)));
    const [isSavingAvatarSize, setIsSavingAvatarSize] = useState(false);
    const fileInputRef = useRef(null);
    const cropDragRef = useRef({ active: false, pointerId: null, startX: 0, startY: 0, startCropX: 0, startCropY: 0 });

    const displayName = useMemo(() => currentUser?.name || currentUser?.full_name || currentUser?.username || "User", [currentUser]);
    const displayUsername = useMemo(() => currentUser?.username || currentUser?.id || "-", [currentUser]);
    const fallbackAvatar = useMemo(
        () => `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || "User")}&background=05ADCF&color=fff&size=128`,
        [displayName]
    );

    useEffect(() => {
        let active = true;
        const loadPhoto = async () => {
            try {
                const row = await getMyApprovedProfilePhoto();
                if (!active) return;
                setAvatarLoadFailed(false);
                setAvatarUrl(withToken(row?.fileUrl || ""));
            } catch {
                if (!active) return;
                setAvatarUrl("");
                setAvatarLoadFailed(false);
            }
        };
        loadPhoto();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        const loadPreferences = async () => {
            try {
                const data = await apiFetch("/api/users/me/preferences");
                if (!active || !data) return;
                const serverSize = Number(data.avatar_size_px || 48) || 48;
                setAvatarSizePx(Math.max(32, Math.min(120, serverSize)));
            } catch {
                // ignore
            }
        };
        loadPreferences();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        if (!cropSource) {
            setCropImageMeta({ width: 0, height: 0 });
            return () => {
                active = false;
            };
        }
        const loadCropMeta = async () => {
            try {
                const image = await loadImage(cropSource);
                if (!active) return;
                setCropImageMeta({
                    width: Number(image?.naturalWidth || image?.width || 0),
                    height: Number(image?.naturalHeight || image?.height || 0),
                });
            } catch {
                if (!active) return;
                setCropImageMeta({ width: 0, height: 0 });
            }
        };
        loadCropMeta();
        return () => {
            active = false;
        };
    }, [cropSource]);

    const cropPreviewMetrics = useMemo(() => {
        const w = Number(cropImageMeta.width || 0);
        const h = Number(cropImageMeta.height || 0);
        if (!w || !h) {
            return {
                style: {
                    width: "100%",
                    height: "100%",
                    transform: "translate(-50%, -50%)",
                },
                maxOffsetX: 0,
                maxOffsetY: 0,
            };
        }
        const safeZoom = Math.max(1, Math.min(2.5, Number(zoom || 1)));
        const minSide = Math.max(1, Math.min(w, h));
        const baseScale = CROP_PREVIEW_SIZE / minSide;
        const renderedWidth = w * baseScale * safeZoom;
        const renderedHeight = h * baseScale * safeZoom;
        const maxOffsetX = Math.max(0, (renderedWidth - CROP_PREVIEW_SIZE) / 2);
        const maxOffsetY = Math.max(0, (renderedHeight - CROP_PREVIEW_SIZE) / 2);
        const offsetX = (Number(cropX || 0) / 100) * maxOffsetX;
        const offsetY = (Number(cropY || 0) / 100) * maxOffsetY;

        return {
            style: {
                width: `${renderedWidth}px`,
                height: `${renderedHeight}px`,
                transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
            },
            maxOffsetX,
            maxOffsetY,
        };
    }, [cropImageMeta.height, cropImageMeta.width, cropX, cropY, zoom]);
    const cropPreviewStyle = cropPreviewMetrics.style;

    const handleCropPointerDown = (event) => {
        if (!cropSource) return;
        const pointerId = event.pointerId;
        cropDragRef.current = {
            active: true,
            pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startCropX: Number(cropX || 0),
            startCropY: Number(cropY || 0),
        };
        setIsDraggingCrop(true);
        event.currentTarget.setPointerCapture(pointerId);
    };

    const handleCropPointerMove = (event) => {
        const drag = cropDragRef.current;
        if (!drag.active || drag.pointerId !== event.pointerId) return;
        const dx = Number(event.clientX || 0) - Number(drag.startX || 0);
        const dy = Number(event.clientY || 0) - Number(drag.startY || 0);
        const maxOffsetX = Number(cropPreviewMetrics.maxOffsetX || 0);
        const maxOffsetY = Number(cropPreviewMetrics.maxOffsetY || 0);
        const deltaX = maxOffsetX > 0 ? (dx / maxOffsetX) * 100 : 0;
        const deltaY = maxOffsetY > 0 ? (dy / maxOffsetY) * 100 : 0;
        const nextX = Math.max(-100, Math.min(100, drag.startCropX + deltaX));
        const nextY = Math.max(-100, Math.min(100, drag.startCropY + deltaY));
        setCropX(nextX);
        setCropY(nextY);
    };

    const handleCropPointerEnd = (event) => {
        const drag = cropDragRef.current;
        if (drag.pointerId !== event.pointerId) return;
        cropDragRef.current = { active: false, pointerId: null, startX: 0, startY: 0, startCropX: 0, startCropY: 0 };
        setIsDraggingCrop(false);
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // no-op
        }
    };

    const handleSaveAvatarSize = async () => {
        setIsSavingAvatarSize(true);
        try {
            const normalizedSize = Math.max(32, Math.min(120, Number(avatarSizePx || 48)));
            const normalizedObjectX = Math.max(0, Math.min(100, Number(avatarObjectX || 50)));
            const normalizedObjectY = Math.max(0, Math.min(100, Number(avatarObjectY || 50)));
            const nextTheme = String(currentUser?.themePreference || currentUser?.theme_preference || "system");
            const data = await apiFetch("/api/users/me/preferences", {
                method: "PUT",
                body: JSON.stringify({
                    theme_preference: nextTheme,
                    avatar_size_px: normalizedSize,
                }),
            });
            const savedSize = Number(data?.avatar_size_px || normalizedSize) || normalizedSize;
            const raw = JSON.parse(localStorage.getItem("loggedUser") || "{}");
            const nextUser = {
                ...raw,
                avatarSizePx: savedSize,
                avatar_size_px: savedSize,
                avatarObjectX: normalizedObjectX,
                avatar_object_x: normalizedObjectX,
                avatarObjectY: normalizedObjectY,
                avatar_object_y: normalizedObjectY,
            };
            localStorage.setItem("loggedUser", JSON.stringify(nextUser));
            window.dispatchEvent(new Event("loggedUserUpdated"));
            if (typeof setCurrentUser === "function") {
                setCurrentUser((prev) => ({
                    ...(prev || {}),
                    avatarSizePx: savedSize,
                    avatar_size_px: savedSize,
                    avatarObjectX: normalizedObjectX,
                    avatar_object_x: normalizedObjectX,
                    avatarObjectY: normalizedObjectY,
                    avatar_object_y: normalizedObjectY,
                }));
            }
            setStatus({ type: "success", message: "تم حفظ إعدادات عرض الصورة بنجاح" });
        } catch (error) {
            setStatus({ type: "error", message: error?.message || "تعذر حفظ إعدادات الصورة" });
        } finally {
            setIsSavingAvatarSize(false);
        }
    };

    const handlePhotoChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        const allowed = ["image/jpeg", "image/jpg", "image/png"];
        if (!allowed.includes(file.type)) {
            setStatus({ type: "error", message: t("admin_profile_only_jpg_png") });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setStatus({ type: "error", message: t("admin_profile_photo_max_5mb") });
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setCropSource(String(reader.result || ""));
            setCropFileName(file.name || "profile");
            setCropX(0);
            setCropY(0);
            setZoom(1.2);
            setCropOpen(true);
        };
        reader.readAsDataURL(file);
    };

    const handleUploadCroppedPhoto = async () => {
        if (!cropSource) return;
        setIsUploadingPhoto(true);
        try {
            const blob = await buildCroppedBlob(cropSource, cropX, cropY, zoom);
            const uploadFile = new File([blob], `${cropFileName.replace(/\.[^.]+$/, "")}_profile.jpg`, { type: "image/jpeg" });
            const uploaded = await uploadMyProfilePhoto(uploadFile);
            const baseUrl = withToken(uploaded?.fileUrl || "");
            const cacheBuster = Date.now();
            const join = baseUrl.includes("?") ? "&" : "?";
            const nextUrl = `${baseUrl}${join}v=${cacheBuster}`;

            setAvatarUrl(nextUrl);

            const raw = JSON.parse(localStorage.getItem("loggedUser") || "{}");
            const nextUser = { ...raw, profilePhotoUrl: nextUrl };
            localStorage.setItem("loggedUser", JSON.stringify(nextUser));
            window.dispatchEvent(new Event("loggedUserUpdated"));
            if (typeof setCurrentUser === "function") {
                setCurrentUser((prev) => ({ ...(prev || {}), profilePhotoUrl: nextUrl }));
            }

            setCropOpen(false);
            setCropSource("");
            setStatus({ type: "success", message: t("admin_profile_photo_updated") });
        } catch (error) {
            setStatus({ type: "error", message: error?.message || t("admin_profile_photo_upload_failed") });
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const currentPassword = String(form.currentPassword || "");
        const newPassword = String(form.newPassword || "");
        const confirmPassword = String(form.confirmPassword || "");

        if (!currentPassword || !newPassword || !confirmPassword) {
            setStatus({ type: "error", message: t("admin_profile_fill_all_fields") });
            return;
        }
        if (newPassword.length < 6) {
            setStatus({ type: "error", message: t("admin_profile_new_password_min_6") });
            return;
        }
        if (newPassword !== confirmPassword) {
            setStatus({ type: "error", message: t("admin_profile_confirm_mismatch") });
            return;
        }
        if (newPassword === currentPassword) {
            setStatus({ type: "error", message: t("admin_profile_new_diff_current") });
            return;
        }

        setIsSubmitting(true);
        setStatus(null);
        try {
            const token = localStorage.getItem("access_token") || "";
            const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.detail || t("admin_profile_change_password_failed"));

            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setStatus({ type: "success", message: t("admin_profile_change_password_success") });
        } catch (error) {
            setStatus({ type: "error", message: error?.message || t("admin_profile_change_password_failed") });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={`mx-auto w-full max-w-3xl ${isRTL ? "text-right" : "text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_40px_-28px_rgba(15,23,42,.45)] md:p-8">
                <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className={`flex items-center gap-3 ${isRTL ? "" : "flex-row-reverse"}`}>
                            <img
                                src={(avatarLoadFailed ? "" : (avatarUrl || currentUser?.profilePhotoUrl || "")) || fallbackAvatar}
                                alt="profile"
                                className="rounded-2xl border-2 border-white object-cover bg-slate-100 shadow-md"
                                style={{
                                    width: `${Math.max(56, Math.min(120, Number(avatarSizePx || 48)))}px`,
                                    height: `${Math.max(56, Math.min(120, Number(avatarSizePx || 48)))}px`,
                                    objectPosition: `${Math.max(0, Math.min(100, Number(avatarObjectX || 50)))}% ${Math.max(0, Math.min(100, Number(avatarObjectY || 50)))}%`,
                                }}
                                onError={(event) => {
                                    if (event.currentTarget.src !== fallbackAvatar) {
                                        setAvatarLoadFailed(true);
                                        event.currentTarget.src = fallbackAvatar;
                                    }
                                }}
                            />
                        <div className={isRTL ? "text-right" : "text-left"}>
                            <p className="text-sm text-slate-500">{t("admin_profile_account_data")}</p>
                            <p className="text-base font-black text-slate-800">{displayName}</p>
                            <p className="text-xs font-medium text-slate-500">{displayUsername}</p>
                        </div>
                    </div>

                    <div className="shrink-0">
                        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={handlePhotoChange} />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingPhoto}
                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-700 hover:bg-cyan-50 disabled:opacity-60"
                        >
                            {isUploadingPhoto ? <Upload size={14} className="animate-pulse" /> : <Camera size={14} />}
                            {isUploadingPhoto ? t("admin_profile_uploading_photo") : t("admin_profile_change_photo")}
                        </button>
                    </div>
                </div>

                <h2 className="text-xl font-black text-slate-800">{t("admin_profile_security_title")}</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("admin_profile_password_hint")}</p>

                <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
                    <label className="text-sm font-bold text-slate-700">
                        {t("admin_profile_current_password")}
                        <input
                            type="password"
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-cyan-400 focus:bg-white"
                            value={form.currentPassword}
                            onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                        />
                    </label>

                    <label className="text-sm font-bold text-slate-700">
                        {t("admin_profile_new_password")}
                        <input
                            type="password"
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-cyan-400 focus:bg-white"
                            value={form.newPassword}
                            onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                        />
                    </label>

                    <label className="text-sm font-bold text-slate-700">
                        {t("admin_profile_confirm_password")}
                        <input
                            type="password"
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-cyan-400 focus:bg-white"
                            value={form.confirmPassword}
                            onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        />
                    </label>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                    >
                        {isSubmitting ? t("admin_profile_changing_password") : t("admin_profile_change_password_btn")}
                    </button>
                </form>

                {status && (
                    <div
                        className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${
                            status.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
                        }`}
                    >
                        {status.message}
                    </div>
                )}
            </div>

            {cropOpen && (
                <div className="fixed inset-0 z-[130] bg-black/55 flex items-center justify-center p-4">
                    <div className="absolute inset-0" onClick={() => setCropOpen(false)} />
                    <div className="relative w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-base font-black text-slate-800">{isRTL ? "قص الصورة قبل الرفع" : "Crop image before upload"}</h3>
                            <button type="button" onClick={() => setCropOpen(false)} className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <div
                                className={`mx-auto relative h-56 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white touch-none ${isDraggingCrop ? "cursor-grabbing" : "cursor-grab"}`}
                                onPointerDown={handleCropPointerDown}
                                onPointerMove={handleCropPointerMove}
                                onPointerUp={handleCropPointerEnd}
                                onPointerCancel={handleCropPointerEnd}
                            >
                                <img
                                    src={cropSource}
                                    alt="crop-preview"
                                    className="absolute left-1/2 top-1/2 max-w-none select-none pointer-events-none object-cover"
                                    style={cropPreviewStyle}
                                />
                                <div className="pointer-events-none absolute inset-0 border border-cyan-200/70 rounded-2xl" />
                            </div>
                        </div>

                        <div className="mt-4 space-y-3">
                            <label className="block text-[12px] text-slate-600">
                                <span className="mb-1 inline-flex items-center gap-1 font-bold"><Search size={12} /> {isRTL ? `تكبير (${zoom.toFixed(2)}x)` : `Zoom (${zoom.toFixed(2)}x)`}</span>
                                <input type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="mt-1 w-full accent-cyan-600" />
                            </label>
                            <label className="block text-[12px] text-slate-600">
                                <span className="mb-1 inline-flex items-center gap-1 font-bold"><Move size={12} /> {isRTL ? `تحريك أفقي (${cropX})` : `Horizontal move (${cropX})`}</span>
                                <input type="range" min="-100" max="100" step="1" value={cropX} onChange={(e) => setCropX(Number(e.target.value))} className="mt-1 w-full accent-cyan-600" />
                            </label>
                            <label className="block text-[12px] text-slate-600">
                                <span className="mb-1 inline-flex items-center gap-1 font-bold"><Move size={12} /> {isRTL ? `تحريك رأسي (${cropY})` : `Vertical move (${cropY})`}</span>
                                <input type="range" min="-100" max="100" step="1" value={cropY} onChange={(e) => setCropY(Number(e.target.value))} className="mt-1 w-full accent-cyan-600" />
                            </label>
                        </div>

                        <div className={`mt-5 flex flex-col-reverse gap-2 sm:flex-row ${isRTL ? "sm:justify-end" : "sm:justify-start"}`}>
                            <button type="button" onClick={() => setCropOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600">
                                {isRTL ? "إلغاء" : "Cancel"}
                            </button>
                            <button
                                type="button"
                                onClick={handleUploadCroppedPhoto}
                                disabled={isUploadingPhoto}
                                className="rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-60"
                            >
                                {isUploadingPhoto ? (isRTL ? "جاري الرفع..." : "Uploading...") : isRTL ? "قص ورفع الصورة" : "Crop and upload"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
