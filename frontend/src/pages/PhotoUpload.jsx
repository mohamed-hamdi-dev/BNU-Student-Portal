import React, { useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Move, Search, Upload, User, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getMyProfilePhoto, uploadMyProfilePhoto } from "../services/profilePhotoApi";
import { ThemeContext } from "../context/ThemeContext";

const statusMap = {
  pending_review: { key: "photo_upload_status_pending", tone: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock3 },
  approved: { key: "photo_upload_status_approved", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  rejected: { key: "photo_upload_status_rejected", tone: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle },
};

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
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image");

  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;

  // Target portrait ratio close to ID card preview (width:height = 4:5)
  const targetW = 800;
  const targetH = 1000;
  const targetAspect = targetW / targetH;
  const srcAspect = w / h;

  // Base "cover" crop area before zoom
  let baseCropW;
  let baseCropH;
  if (srcAspect > targetAspect) {
    baseCropH = h;
    baseCropW = h * targetAspect;
  } else {
    baseCropW = w;
    baseCropH = w / targetAspect;
  }

  const safeZoom = Math.max(1, Number(zoom || 1));
  const cropW = baseCropW / safeZoom;
  const cropH = baseCropH / safeZoom;

  const maxMoveX = Math.max(0, (w - cropW) / 2);
  const maxMoveY = Math.max(0, (h - cropH) / 2);
  const shiftX = (Math.max(-100, Math.min(100, Number(cropX || 0))) / 100) * maxMoveX;
  const shiftY = (Math.max(-100, Math.min(100, Number(cropY || 0))) / 100) * maxMoveY;

  const sx = Math.max(0, Math.min(w - cropW, (w - cropW) / 2 + shiftX));
  const sy = Math.max(0, Math.min(h - cropH, (h - cropH) / 2 + shiftY));

  canvas.width = targetW;
  canvas.height = targetH;
  ctx.drawImage(image, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not save image"))),
      "image/jpeg",
      0.92
    );
  });
};

export default function PhotoUpload() {
  const { t } = useTranslation("global");
  const { isDarkMode } = useContext(ThemeContext);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState("");
  const [cardPreview, setCardPreview] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [serverPhoto, setServerPhoto] = useState(null);
  const [serverPhotoFailed, setServerPhotoFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [zoom, setZoom] = useState(1.2);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("loggedUser") || "{}");
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    setServerPhotoFailed(false);
  }, [serverPhoto?.fileUrl]);

  useEffect(() => {
    const load = async () => {
      try {
        const row = await getMyProfilePhoto();
        setServerPhoto(row);
      } catch {
        setServerPhoto(null);
      }
    };
    load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const renderPreview = async () => {
      if (!preview) {
        setCardPreview("");
        return;
      }
      try {
        const blob = await buildCroppedBlob(preview, cropX, cropY, zoom);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setCardPreview((prev) => {
          if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        if (!cancelled) setCardPreview("");
      }
    };
    renderPreview();
    return () => {
      cancelled = true;
    };
  }, [preview, cropX, cropY, zoom]);

  useEffect(() => {
    return () => {
      if (cardPreview && cardPreview.startsWith("blob:")) URL.revokeObjectURL(cardPreview);
    };
  }, [cardPreview]);

  const handleSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage(t("photo_upload_error_file_too_large"));
      return;
    }
    setSelectedFile(file);
    setFileName(file.name);
    setMessage("");
    setCropX(0);
    setCropY(0);
    setZoom(1.2);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage(t("photo_upload_error_select_first"));
      return;
    }
    try {
      setUploading(true);
      const blob = await buildCroppedBlob(preview, cropX, cropY, zoom);
      const uploadFile = new File([blob], `${selectedFile.name.replace(/\.[^.]+$/, "")}_profile.jpg`, { type: "image/jpeg" });
      const row = await uploadMyProfilePhoto(uploadFile);
      setServerPhoto(row);
      setSelectedFile(null);
      setPreview("");
      setFileName("");
      setCropX(0);
      setCropY(0);
      setZoom(1.2);
      setMessage(t("photo_upload_message_uploaded"));
    } catch (error) {
      setMessage(error.message || t("photo_upload_error_upload_failed"));
    } finally {
      setUploading(false);
    }
  };

  const statusInfo = statusMap[serverPhoto?.status] || statusMap.pending_review;
  const StatusIcon = statusInfo.icon;
  const uploadButtonLabel = uploading
    ? t("photo_upload_uploading")
    : serverPhoto?.status === "approved"
    ? t("photo_upload_action_upload_new")
    : serverPhoto?.status === "rejected"
    ? t("photo_upload_action_upload_replacement")
    : t("photo_upload_action_upload_for_review");
  const serverPhotoUrl = withToken(serverPhoto?.fileUrl);
  const previewImageSrc = cardPreview || (!serverPhotoFailed && serverPhotoUrl) || "";
  const previewInitials = String(user?.name || "Student")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div
      className={`min-h-screen px-4 py-8 pt-[3em] sm:px-6 ${
        isDarkMode
          ? "bg-gradient-to-b from-[#0b1730] via-[#0e2140] to-[#0b1730]"
          : "bg-gradient-to-b from-slate-100 via-cyan-50/40 to-white"
      }`}
      dir="rtl"
    >
      <div className="mx-auto flex min-h-[78vh] max-w-3xl items-center justify-center">
        <div
          className={`mt-[3em] w-full rounded-[2rem] p-7 backdrop-blur ${
            isDarkMode
              ? "border border-[#2a476e] bg-[#132a49] shadow-[0_22px_50px_rgba(0,0,0,0.38)]"
              : "border border-slate-200 bg-white/95 shadow-[0_20px_45px_rgba(2,12,27,0.08)]"
          }`}
        >
          <div className="mb-5 text-center">
            <h1 className={`text-3xl font-black ${isDarkMode ? "text-slate-100" : "text-slate-800"}`}>{t("photo_upload_title")}</h1>
            <p className={`mt-2 text-sm ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>{t("photo_upload_subtitle")}</p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className={`rounded-2xl p-4 text-center ${isDarkMode ? "border border-[#2a476e] bg-[#10243f]" : "border border-slate-200 bg-slate-50"}`}>
              <p className={`mb-2 text-xs font-bold ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>{t("photo_upload_preview_title")}</p>
              <div className={`mx-auto w-fit rounded-2xl p-2 shadow-sm ${isDarkMode ? "border border-[#2a476e] bg-[#0f2038]" : "border border-slate-200 bg-white"}`}>
                <div className={`relative h-40 w-32 overflow-hidden rounded-xl ${isDarkMode ? "border border-[#355980] bg-[#0f223d]" : "border border-slate-100 bg-slate-100"}`}>
                  {previewImageSrc ? (
                    <img
                      src={previewImageSrc}
                      alt={t("photo_upload_preview_alt")}
                      className="h-full w-full object-contain bg-white"
                      onError={() => {
                        if (!cardPreview) setServerPhotoFailed(true);
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white">
                      {previewInitials ? (
                        <span className="text-3xl font-black text-[#05ADCF]">{previewInitials}</span>
                      ) : (
                        <User className="h-12 w-12 text-[#05ADCF]" />
                      )}
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/20 to-transparent p-2 text-[10px] font-bold text-white">
                    BNU ID
                  </div>
                </div>
              </div>
            </div>

            <div className={`space-y-4 rounded-2xl p-4 ${isDarkMode ? "border border-[#2a476e] bg-[#112746]" : "border border-slate-200 bg-white"}`}>
              <label className={`inline-flex cursor-pointer items-center rounded-xl bg-[#05ADCF] px-5 py-2.5 font-bold text-white hover:brightness-95 ${isDarkMode ? "shadow-[0_6px_16px_rgba(0,0,0,0.28)]" : "shadow-lg shadow-cyan-100"}`}>
                {t("photo_upload_choose_image")}
                <input type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={handleSelect} />
              </label>
              <p className={`min-h-5 text-xs ${isDarkMode ? "text-slate-300" : "text-slate-500"}`}>{fileName || t("photo_upload_no_file_selected")}</p>

              {preview && (
                <div className={`space-y-3 rounded-xl border p-3 ${isDarkMode ? "border-[#2a476e] bg-gradient-to-b from-[#10243f] to-[#0f2038]" : "border-slate-200 bg-gradient-to-b from-slate-50 to-white"}`}>
                  <p className={`text-[11px] font-black ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>{t("photo_upload_adjust_before_upload")}</p>

                  <label className={`block text-[11px] ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                    <span className="mb-1 inline-flex items-center gap-1 font-bold"><Search size={12} /> {t("photo_upload_zoom")} ({zoom.toFixed(2)}x)</span>
                    <input type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="mt-1 w-full accent-cyan-600" />
                  </label>
                  <label className={`block text-[11px] ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                    <span className="mb-1 inline-flex items-center gap-1 font-bold"><Move size={12} /> {t("photo_upload_vertical_move")} ({cropY})</span>
                    <input type="range" min="-100" max="100" step="1" value={cropY} onChange={(e) => setCropY(Number(e.target.value))} className="mt-1 w-full accent-cyan-600" />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1.2);
                      setCropX(0);
                      setCropY(0);
                    }}
                    className={`w-full rounded-lg border py-2 text-xs font-bold ${isDarkMode ? "border-[#355980] bg-[#112746] text-slate-200 hover:bg-[#153154]" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    {t("photo_upload_reset")}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload size={16} /> {uploadButtonLabel}
              </button>

              {serverPhoto && (
                <div className={`flex w-fit items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${statusInfo.tone}`}>
                  <StatusIcon size={14} /> {t(statusInfo.key)}
                </div>
              )}

              {serverPhoto?.status === "rejected" && serverPhoto?.rejectionReason && (
                <p className="rounded-xl bg-rose-50 p-2 text-xs text-rose-700">{t("photo_upload_rejection_reason")}: {serverPhoto.rejectionReason}</p>
              )}
              {serverPhoto?.status === "approved" && (
                <p className="text-xs text-emerald-700">{t("photo_upload_approved_hint")}</p>
              )}
            </div>
          </div>

          {message && (
            <div className="mt-5 rounded-xl border border-cyan-100 bg-cyan-50/70 p-3 text-center text-xs text-cyan-800">{message}</div>
          )}

          <div className={`mt-4 rounded-xl border p-3 text-xs ${isDarkMode ? "border-[#2a476e] bg-[#10243f] text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{t("photo_upload_rules")}</div>
        </div>
      </div>
    </div>
  );
}


