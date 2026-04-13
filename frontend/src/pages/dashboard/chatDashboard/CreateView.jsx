import React, { useMemo, useRef, useState } from "react";
import { Bold, Database, Image, Italic, Link, Type } from "lucide-react";
import { apiFetch } from "../../../services/api";
import { useAccountRequestCatalog } from "../../../hooks/useAccountRequestCatalog";

const initialForm = {
    to: "",
    toCollege: "",
    toBatch: "",
    subject: "",
    category: "General Information",
    contentType: "text",
    tags: "",
    program: "",
    academicYear: "",
    semester: "",
    displayPriority: "0",
    fileUrl: "",
    content: "",
};

const CATEGORIES = [
    { value: "General Information", label: "معلومات عامة" },
    { value: "Academic Affairs", label: "الشؤون الأكاديمية" },
    { value: "Technical Support", label: "الدعم الفني" },
];
const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;
const CONTENT_TYPES = [
    { value: "text", label: "نص" },
    { value: "image", label: "صورة" },
    { value: "pdf", label: "PDF" },
    { value: "schedule", label: "جدول" },
    { value: "guide", label: "دليل" },
];

const ARABIC_YEAR_LABELS = {
    ALL: "كل السنين",
    "1": "السنة الأولى",
    "2": "السنة الثانية",
    "3": "السنة الثالثة",
    "4": "السنة الرابعة",
    "5": "السنة الخامسة",
    "6": "السنة السادسة",
    "7": "السنة السابعة",
    "8": "السنة الثامنة",
};
const ARABIC_YEAR_WORD_MAP = {
    "الاولى": "1",
    "الأولى": "1",
    "اولى": "1",
    "الثانيه": "2",
    "الثانية": "2",
    "ثانيه": "2",
    "الثالثه": "3",
    "الثالثة": "3",
    "ثالثه": "3",
    "الرابعه": "4",
    "الرابعة": "4",
    "رابعه": "4",
    "الخامسه": "5",
    "الخامسة": "5",
    "خامسه": "5",
    "السادسه": "6",
    "السادسة": "6",
    "سادسه": "6",
    "السابعه": "7",
    "السابعة": "7",
    "سابعه": "7",
    "الثامنه": "8",
    "الثامنة": "8",
    "ثامنه": "8",
};

const isBlank = (value) => !value || !value.trim();
const stripHtml = (html = "") => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const firstStorageUrl = (html = "") => String(html || "").match(/\/api\/storage\/files\/[^"'?\s>]+/i)?.[0] || "";
const normalizeDigits = (value = "") => String(value).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const normalizeKey = (value = "") =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي");
const toArabicYearLabel = (value = "") => {
    const raw = String(value || "").trim();
    const normalizedRaw = normalizeKey(raw);
    if (normalizedRaw === "all" || normalizedRaw.includes("كل السنين") || normalizedRaw.includes("كل السنوات")) {
        return ARABIC_YEAR_LABELS.ALL;
    }
    const digits = normalizeDigits(raw).match(/\d+/)?.[0] || "";
    if (digits && ARABIC_YEAR_LABELS[digits]) return ARABIC_YEAR_LABELS[digits];
    return raw.replace(/level/gi, "السنة").replace("الفرقة", "السنة");
};
const escapeHtml = (value = "") =>
    String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
const normalizeTagsInput = (value = "") =>
    String(value || "")
        .split(/[,\n،]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item, index, arr) => arr.findIndex((entry) => normalizeKey(entry) === normalizeKey(item)) === index)
        .join(", ");
const getAccessToken = () => localStorage.getItem("access_token") || "";
const buildPreviewUrl = (url = "") => {
    const cleanUrl = String(url || "").trim();
    const token = getAccessToken();
    if (!cleanUrl || !token || !/\/api\/storage\/files\//i.test(cleanUrl)) return cleanUrl;
    const separator = cleanUrl.includes("?") ? "&" : "?";
    return `${cleanUrl}${separator}token=${encodeURIComponent(token)}`;
};
const stripPreviewTokens = (html = "") =>
    String(html || "")
        .replace(/\sdata-storage-src=(["'])[^"']*\1/gi, "")
        .replace(/([?&])token=[^"'&>\s]+/gi, (match, prefix) => (prefix === "?" ? "" : ""));
const hydrateStoragePreviewHtml = (html = "") => {
    const token = getAccessToken();
    if (!token) return String(html || "");
    return String(html || "").replace(
        /<img\b([^>]*?)src=(["'])(\/api\/storage\/files\/[^"'?]+)(?:\?[^"']*)?\2([^>]*)>/gi,
        (_match, before, quote, src, after) => `<img${before}src=${quote}${buildPreviewUrl(src)}${quote} data-storage-src=${quote}${src}${quote}${after}>`
    );
};

const toTargetScope = (college, batchLabel) => `كلية: ${college} | ${batchLabel}`;
const normalizeCategoryValue = (value = "") => {
    const raw = String(value || "").trim();
    if (!raw) return "General Information";
    const key = normalizeKey(raw);
    if (key === "general information" || key.includes("معلومات عام")) return "General Information";
    if (key === "academic affairs" || key.includes("شؤون اكاديم")) return "Academic Affairs";
    if (key === "technical support" || key.includes("دعم فني")) return "Technical Support";
    return raw;
};

const parseTargetScope = (value = "") => {
    const raw = String(value || "").trim();
    if (!raw) return { toCollege: "", toBatch: "" };

    const directCollege = raw.match(/college\s*:\s*([^|]+)/i)?.[1]?.trim() || "";
    const directBatch = raw.match(/level\s*(\d+)/i)?.[1]?.trim() || "";
    if (directCollege || directBatch) {
        return { toCollege: directCollege, toBatch: directBatch || "" };
    }

    const arabicCollege = raw.match(/كلية\s*:\s*([^|]+)/)?.[1]?.trim() || raw.match(/كلية\s+([^|\-]+)/)?.[1]?.trim() || "";
    const arabicBatchDigits = normalizeDigits(raw).match(/(?:دفعة|لائحة|سنة|السنة|فرقة|الفرقة)\s*(\d+)/)?.[1]?.trim() || "";
    if (arabicBatchDigits) {
        return { toCollege: arabicCollege, toBatch: arabicBatchDigits };
    }
    if (/كل\s*(السنين|السنوات)/.test(normalizeKey(raw))) {
        return { toCollege: arabicCollege, toBatch: "ALL" };
    }

    const normalizedText = normalizeKey(raw);
    const hasYearContext = /(السنه|السنة|الفرقه|الفرقة|سنه|سنة|فرقه|فرقة|لائحه|لائحة|دفعه|دفعة)/.test(normalizedText);
    if (hasYearContext) {
        for (const [word, id] of Object.entries(ARABIC_YEAR_WORD_MAP)) {
            if (normalizedText.includes(normalizeKey(word))) {
                return { toCollege: arabicCollege, toBatch: id };
            }
        }
    }
    return { toCollege: arabicCollege, toBatch: "" };
};

export default function CreateView({ initialData = null, onCreate, onUpdate, onFinish, actionBusy = false }) {
    const [form, setForm] = useState(initialForm);
    const [errors, setErrors] = useState({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [indexedDocumentReady, setIndexedDocumentReady] = useState(false);
    const imageInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const editorRef = useRef(null);

    const { colleges, getLevelsByCollege } = useAccountRequestCatalog();
    const batchOptions = useMemo(
        () => {
            const levels = getLevelsByCollege(form.toCollege || "")
                .map((level) => {
                    const id = String(level?.id || "").trim();
                    if (!id) return null;
                    return { id, label: toArabicYearLabel(level?.name || id) };
                })
                .filter(Boolean);
            return [{ id: "ALL", label: ARABIC_YEAR_LABELS.ALL }, ...levels];
        },
        [form.toCollege, getLevelsByCollege]
    );

    const contentCounter = useMemo(() => stripHtml(form.content).length, [form.content]);
    const isEditMode = Boolean(initialData?.id);
    const requiresScopedTarget = form.category === "Academic Affairs";

    React.useEffect(() => {
        if (!initialData) return;
        const parsedTarget = parseTargetScope(initialData?.to || "");
        const nextForm = {
            to: initialData?.to || "",
            toCollege: parsedTarget.toCollege,
            toBatch: parsedTarget.toBatch,
            subject: initialData?.subject || "",
            category: normalizeCategoryValue(initialData?.category || "General Information"),
            contentType: initialData?.content_type || initialData?.contentType || "text",
            tags: initialData?.tags || "",
            program: initialData?.program || "",
            academicYear: initialData?.academic_year || initialData?.academicYear || "",
            semester: initialData?.semester || "",
            displayPriority: String(initialData?.display_priority ?? initialData?.displayPriority ?? 0),
            fileUrl: initialData?.file_url || initialData?.fileUrl || "",
            content: initialData?.content || "",
        };
        setForm(nextForm);
        setErrors({});
        setIsSubmitted(false);
        setIndexedDocumentReady(/\/api\/storage\/files\//i.test(String(nextForm.content || "")));
        if (editorRef.current) editorRef.current.innerHTML = hydrateStoragePreviewHtml(nextForm.content || "");
    }, [initialData]);

    React.useEffect(() => {
        if (!form.toBatch) return;
        const exists = batchOptions.some((item) => String(item.id) === String(form.toBatch));
        if (!exists) {
            const digits = normalizeDigits(form.toBatch).match(/\d+/)?.[0] || "";
            if (digits && batchOptions.some((item) => item.id === digits)) {
                setForm((prev) => ({ ...prev, toBatch: digits }));
            }
        }
    }, [form.toBatch, batchOptions]);

    const handleChange = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => ({ ...prev, [key]: "" }));
        if (key !== "content") setIsSubmitted(false);
    };

    const syncContentFromEditor = () => {
        const html = editorRef.current?.innerHTML || "";
        setForm((prev) => ({ ...prev, content: stripPreviewTokens(html) }));
        setIndexedDocumentReady((prev) => (prev ? /\/api\/storage\/files\//i.test(String(html || "")) : prev));
        setErrors((prev) => ({ ...prev, content: "" }));
    };

    const focusEditor = () => editorRef.current?.focus();

    const handleToolbarAction = (action) => {
        focusEditor();
        if (action === "bold") {
            document.execCommand("bold");
            syncContentFromEditor();
            return;
        }
        if (action === "italic") {
            document.execCommand("italic");
            syncContentFromEditor();
            return;
        }
        if (action === "link") {
            const url = window.prompt("أدخل الرابط", "https://");
            if (url) {
                document.execCommand("createLink", false, url);
                syncContentFromEditor();
            }
            return;
        }
        if (action === "image") {
            imageInputRef.current?.click();
            return;
        }
        if (action === "file") {
            if (uploadingAttachment) return;
            fileInputRef.current?.click();
            return;
        }
        if (action === "text") {
            document.execCommand("formatBlock", false, "h3");
            syncContentFromEditor();
        }
    };

    const handleImageSelected = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setErrors((prev) => ({ ...prev, content: "يرجى اختيار صورة صحيحة." }));
            event.target.value = "";
            return;
        }
        try {
            setUploadingAttachment(true);
            if (Number(file.size || 0) > MAX_DOCUMENT_FILE_SIZE) {
                throw new Error("حجم الصورة كبير جدًا. الحد الأقصى 10MB.");
            }
            if (requiresScopedTarget && (isBlank(form.toCollege) || isBlank(form.toBatch))) {
                throw new Error("قبل رفع الصورة في الشؤون الأكاديمية، اختر الكلية والسنة أولًا.");
            }

            const selectedBatchLabel = batchOptions.find((item) => String(item.id) === String(form.toBatch))?.label || toArabicYearLabel(form.toBatch);
            const canBuildScopedTarget = !isBlank(form.toCollege) && !isBlank(selectedBatchLabel);
            const targetScope = canBuildScopedTarget ? toTargetScope(form.toCollege, selectedBatchLabel) : "";
            const formData = new FormData();
            formData.append("file", file);
            formData.append("file_name", String(file.name || "").replace(/\.[^.]+$/i, "").trim() || "صورة");
            formData.append("level", targetScope);
            formData.append("category", form.category || "General Information");

            const uploaded = await apiFetch("/api/storage/upload-and-index", {
                method: "POST",
                body: formData,
            });
            const uploadedUrl = String(uploaded?.file?.url || uploaded?.url || "").trim();
            if (!uploadedUrl) {
                throw new Error("تعذر رفع الصورة. حاول مرة أخرى.");
            }

            const previewUrl = buildPreviewUrl(uploadedUrl);
            focusEditor();
            document.execCommand(
                "insertHTML",
                false,
                `<img src="${escapeHtml(previewUrl)}" data-storage-src="${escapeHtml(uploadedUrl)}" alt="${escapeHtml(file.name || "صورة")}" style="max-width:100%;height:auto;" /><br />`
            );
            syncContentFromEditor();
            setForm((prev) => ({
                ...prev,
                fileUrl: prev.fileUrl || uploadedUrl,
                contentType: prev.contentType === "text" ? "image" : prev.contentType,
            }));
            setIndexedDocumentReady(true);
        } catch (err) {
            setErrors((prev) => ({ ...prev, content: err?.message || "تعذر رفع الصورة. تأكد من الاتصال وحاول مرة أخرى." }));
        } finally {
            setUploadingAttachment(false);
            event.target.value = "";
        }
    };

    const handleFileSelected = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const extension = String(file.name || "").toLowerCase().split(".").pop() || "";
        const isPdf = file.type === "application/pdf" || extension === "pdf";
        const isDocx =
            file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx";
        const finalizeInsert = (url) => {
            const safeUrl = escapeHtml(url);
            const safeName = escapeHtml(file.name);
            const fileKindLabel = isPdf ? "PDF مرفق" : "Word مرفق";
            focusEditor();
            document.execCommand(
                "insertHTML",
                false,
                `
                <div style="margin:6px 0; border:1px solid #dbe7ef; background:#f8fbfe; border-radius:10px; padding:8px 10px; display:flex; align-items:center; gap:8px; max-width:460px;">
                  <div style="width:30px;height:30px;border-radius:8px;background:#e6f6fb;display:flex;align-items:center;justify-content:center;font-size:14px;">📄</div>
                  <div style="min-width:0;flex:1;">
                    <div style="font-weight:700;font-size:12px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeName}</div>
                    <div style="font-size:10px;color:#64748b;display:flex;gap:8px;align-items:center;">
                      <span>${fileKindLabel}</span>
                      <span style="color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:1px 6px;">مفهرس للشات</span>
                    </div>
                  </div>
                  <a href="${safeUrl}" download="${safeName}" style="font-size:10px;color:#0891b2;text-decoration:none;border:1px solid #cfe7ef;padding:3px 7px;border-radius:7px;">تنزيل</a>
                </div>
                <a href="${safeUrl}" download="${safeName}" style="display:none;">${safeName}</a>
                <br />
                `
            );
            syncContentFromEditor();
        };

        try {
            setUploadingAttachment(true);
            if (!isPdf && !isDocx) {
                throw new Error("يرجى اختيار ملف PDF أو DOCX فقط.");
            }
            if (extension === "doc") {
                throw new Error("ملفات DOC غير مدعومة حاليًا. استخدم DOCX أو PDF.");
            }
            if (Number(file.size || 0) > MAX_DOCUMENT_FILE_SIZE) {
                throw new Error("حجم الملف كبير جدًا. الحد الأقصى 10MB.");
            }
            if (requiresScopedTarget && (isBlank(form.toCollege) || isBlank(form.toBatch))) {
                throw new Error("قبل رفع الملف وفهرسته في الشؤون الأكاديمية، اختر الكلية والسنة أولًا.");
            }

            const selectedBatchLabel = batchOptions.find((item) => String(item.id) === String(form.toBatch))?.label || toArabicYearLabel(form.toBatch);
            const canBuildScopedTarget = !isBlank(form.toCollege) && !isBlank(selectedBatchLabel);
            const targetScope = canBuildScopedTarget ? toTargetScope(form.toCollege, selectedBatchLabel) : "";
            const formData = new FormData();
            formData.append("file", file);
            formData.append("file_name", String(file.name || "").replace(/\.(pdf|docx)$/i, "").trim() || "مستند");
            formData.append("level", targetScope);
            formData.append("category", form.category || "General Information");
            const uploaded = await apiFetch("/api/storage/upload-and-index", {
                method: "POST",
                body: formData,
            });
            const uploadedUrl = String(uploaded?.file?.url || uploaded?.url || "").trim();
            if (!uploadedUrl) {
                throw new Error("تعذر رفع الملف. حاول مرة أخرى.");
            }
            finalizeInsert(uploadedUrl);
            setForm((prev) => ({
                ...prev,
                fileUrl: prev.fileUrl || uploadedUrl,
                contentType: prev.contentType === "text" ? (isPdf ? "pdf" : "guide") : prev.contentType,
            }));
            setIndexedDocumentReady(true);
        } catch (err) {
            setErrors((prev) => ({ ...prev, content: err?.message || "تعذر رفع الملف. تأكد من الاتصال وحاول مرة أخرى." }));
        } finally {
            setUploadingAttachment(false);
            event.target.value = "";
        }
    };


    const validate = () => {
        const nextErrors = {};
        if (requiresScopedTarget && isBlank(form.toCollege)) nextErrors.toCollege = "الكلية مطلوبة في الشؤون الأكاديمية.";
        if (requiresScopedTarget && isBlank(form.toBatch)) nextErrors.toBatch = "السنة مطلوبة في الشؤون الأكاديمية.";
        if (isBlank(form.subject)) nextErrors.subject = "حقل الموضوع مطلوب.";
        if (isBlank(form.category)) nextErrors.category = "حقل التصنيف مطلوب.";
        if (isBlank(form.contentType)) nextErrors.contentType = "نوع المحتوى مطلوب.";

        const hasText = stripHtml(form.content).length >= 10;
        const hasImage = /<img\b/i.test(form.content);
        if (!hasText && !hasImage) {
            nextErrors.content = "المحتوى يجب أن يكون 10 أحرف على الأقل أو يحتوي على صورة.";
        }
        const hasPdfLink = /\/api\/storage\/files\//i.test(String(form.content || ""));
        if (requiresScopedTarget && hasPdfLink && !indexedDocumentReady) {
            nextErrors.content = "الملف المرفوع غير مفهرس بعد. استخدم زر رفع وفهرسة المستند قبل الإرسال.";
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!validate()) return;
        const selectedBatchLabel = batchOptions.find((item) => String(item.id) === String(form.toBatch))?.label || toArabicYearLabel(form.toBatch);
        const canBuildScopedTarget = !isBlank(form.toCollege) && !isBlank(selectedBatchLabel);
        const targetScope = canBuildScopedTarget ? toTargetScope(form.toCollege, selectedBatchLabel) : "";
        const normalizedTags = normalizeTagsInput(form.tags);
        const payload = {
            ...form,
            tags: normalizedTags,
            fileUrl: form.fileUrl || firstStorageUrl(form.content),
            to: targetScope,
        };

        if (isEditMode && onUpdate) {
            await onUpdate(initialData.id, payload, { linkedStorageId: initialData?.linkedStorageId || null });
        } else if (onCreate) {
            await onCreate(payload, { skipStorage: Boolean(initialData?.linkedStorageId) });
        }

        setIsSubmitted(true);
        setForm(initialForm);
        setIndexedDocumentReady(false);
        if (editorRef.current) editorRef.current.innerHTML = "";
        if (onFinish) onFinish();
    };

    return (
        <form onSubmit={handleSubmit} className="mx-auto max-w-5xl animate-in space-y-6 slide-in-from-top-4 duration-500">
            <div className="rounded-[32px] border-2 border-black bg-white p-4 shadow-xl sm:rounded-[40px] sm:p-6 md:p-8">
                <h2 className="mb-6 inline-block border-b-4 border-cyan-400 pb-2 text-xl font-black sm:mb-8 sm:text-2xl">إنشاء محتوى جديد</h2>

                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3" dir="rtl">
                    <div className="space-y-2">
                        <label className="block text-sm font-black">الكلية:</label>
                        <select
                            value={form.toCollege}
                            onChange={(e) => handleChange("toCollege", e.target.value)}
                            className={`w-full rounded-2xl border-2 bg-slate-100 p-4 outline-none transition ${errors.toCollege ? "border-red-400" : "border-transparent focus:border-cyan-400"}`}>
                            <option value="">اختر الكلية</option>
                            {colleges.map((college) => (
                                <option key={college} value={college}>
                                    {college}
                                </option>
                            ))}
                        </select>
                        {errors.toCollege && <p className="text-xs font-bold text-red-500">{errors.toCollege}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-black">السنة:</label>
                        <select
                            value={form.toBatch}
                            onChange={(e) => handleChange("toBatch", e.target.value)}
                            className={`w-full rounded-2xl border-2 bg-slate-100 p-4 outline-none transition ${errors.toBatch ? "border-red-400" : "border-transparent focus:border-cyan-400"}`}>
                            <option value="">اختر السنة</option>
                            {batchOptions.map((batch) => (
                                <option key={batch.id} value={batch.id}>
                                    {batch.label}
                                </option>
                            ))}
                        </select>
                        {errors.toBatch && <p className="text-xs font-bold text-red-500">{errors.toBatch}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-black">التصنيف:</label>
                        <select
                            value={form.category}
                            onChange={(e) => handleChange("category", e.target.value)}
                            className={`w-full rounded-2xl border-2 bg-slate-100 p-4 outline-none transition ${errors.category ? "border-red-400" : "border-transparent focus:border-cyan-400"}`}>
                            {CATEGORIES.map((category) => (
                                <option key={category.value} value={category.value}>
                                    {category.label}
                                </option>
                            ))}
                        </select>
                        {errors.category && <p className="text-xs font-bold text-red-500">{errors.category}</p>}
                    </div>
                </div>
                <p className="mb-6 text-right text-xs font-bold text-slate-500" dir="rtl">
                    {requiresScopedTarget
                        ? "في الشؤون الأكاديمية لازم تحدد الكلية والسنة قبل الحفظ."
                        : "في المعلومات العامة والدعم الفني تحديد الكلية والسنة اختياري."}
                </p>

                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2" dir="rtl">
                    <div className="space-y-2">
                        <label className="block text-sm font-black">نوع المحتوى:</label>
                        <select
                            value={form.contentType}
                            onChange={(e) => handleChange("contentType", e.target.value)}
                            className={`w-full rounded-2xl border-2 bg-slate-100 p-4 outline-none transition ${errors.contentType ? "border-red-400" : "border-transparent focus:border-cyan-400"}`}>
                            {CONTENT_TYPES.map((item) => (
                                <option key={item.value} value={item.value}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                        {errors.contentType && <p className="text-xs font-bold text-red-500">{errors.contentType}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-black">البرنامج:</label>
                        <input
                            type="text"
                            value={form.program}
                            onChange={(e) => handleChange("program", e.target.value)}
                            placeholder="مثال: SAD, AI, CS"
                            className="w-full rounded-2xl border-2 border-transparent bg-slate-100 p-4 outline-none transition focus:border-cyan-400"
                        />
                    </div>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3" dir="rtl">
                    <div className="space-y-2 md:col-span-2">
                        <label className="block text-sm font-black">الكلمات المفتاحية:</label>
                        <input
                            type="text"
                            value={form.tags}
                            onChange={(e) => handleChange("tags", e.target.value)}
                            onBlur={(e) => handleChange("tags", normalizeTagsInput(e.target.value))}
                            placeholder="مثال: جدول, SAD, 2025-2026, دفعة, سكشن"
                            className="w-full rounded-2xl border-2 border-transparent bg-slate-100 p-4 outline-none transition focus:border-cyan-400"
                        />
                        <p className="text-xs font-bold text-slate-500">افصل الكلمات بفاصلة. سنرتبها تلقائيًا عند الحفظ.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-black">أولوية العرض:</label>
                        <input
                            type="number"
                            min="0"
                            value={form.displayPriority}
                            onChange={(e) => handleChange("displayPriority", e.target.value)}
                            className="w-full rounded-2xl border-2 border-transparent bg-slate-100 p-4 outline-none transition focus:border-cyan-400"
                        />
                    </div>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2" dir="rtl">
                    <div className="space-y-2">
                        <label className="block text-sm font-black">العام الدراسي:</label>
                        <input
                            type="text"
                            value={form.academicYear}
                            onChange={(e) => handleChange("academicYear", e.target.value)}
                            placeholder="مثال: 2025-2026"
                            className="w-full rounded-2xl border-2 border-transparent bg-slate-100 p-4 outline-none transition focus:border-cyan-400"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-black">الفصل الدراسي:</label>
                        <input
                            type="text"
                            value={form.semester}
                            onChange={(e) => handleChange("semester", e.target.value)}
                            placeholder="مثال: Autumn / Spring"
                            className="w-full rounded-2xl border-2 border-transparent bg-slate-100 p-4 outline-none transition focus:border-cyan-400"
                        />
                    </div>
                </div>

                <div className="mb-6 space-y-2" dir="rtl">
                    <label className="block text-sm font-black">الموضوع:</label>
                    <input
                        type="text"
                        value={form.subject}
                        onChange={(e) => handleChange("subject", e.target.value)}
                        placeholder="عنوان المحتوى..."
                        className={`w-full rounded-2xl border-2 bg-slate-100 p-4 outline-none transition ${errors.subject ? "border-red-400" : "border-transparent focus:border-cyan-400"}`}
                    />
                    {errors.subject && <p className="text-xs font-bold text-red-500">{errors.subject}</p>}
                </div>

                <div className="overflow-hidden rounded-2xl border-2 border-black sm:rounded-3xl">
                    <div className="flex flex-wrap gap-3 border-b-2 border-black bg-slate-100 p-4">
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction("bold")} className="rounded-lg p-2 transition-colors hover:bg-white"><Bold size={18} /></button>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction("italic")} className="rounded-lg p-2 transition-colors hover:bg-white"><Italic size={18} /></button>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction("link")} className="rounded-lg p-2 transition-colors hover:bg-white"><Link size={18} /></button>
                        <div className="mx-2 h-6 w-px bg-slate-300" />
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction("image")} className="rounded-lg p-2 transition-colors hover:bg-white"><Image size={18} /></button>
                        <button
                            type="button"
                            title="رفع مستند PDF أو DOCX وفهرسته للشات"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleToolbarAction("file")}
                            disabled={uploadingAttachment}
                            className={`rounded-lg p-2 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 ${uploadingAttachment ? "bg-cyan-50" : ""}`}>
                            <Database size={18} />
                        </button>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction("text")} className="rounded-lg p-2 transition-colors hover:bg-white"><Type size={18} /></button>
                    </div>

                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
                    <input ref={fileInputRef} type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleFileSelected} />
                    <div className="bg-white p-4" dir="rtl">
                        <div
                            ref={editorRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={syncContentFromEditor}
                            className={`min-h-56 w-full rounded-2xl border bg-white p-3 text-right font-serif text-base outline-none transition sm:min-h-64 sm:p-4 sm:text-lg ${errors.content ? "border-red-400" : "border-gray-200 focus-within:border-cyan-400"}`}
                            style={{ whiteSpace: "pre-wrap" }}
                        />
                        {!stripHtml(form.content) && !/<img\b/i.test(form.content) && (
                            <div className="pointer-events-none -mt-56 mr-4 text-slate-400">اكتب محتواك هنا...</div>
                        )}
                        <div className="mt-2 flex items-center justify-between text-xs font-bold">
                            <span className={errors.content ? "text-red-500" : "text-slate-500"}>
                                {errors.content || (uploadingAttachment ? "جارٍ رفع الملف..." : "يمكنك إضافة نص منسق وروابط وصور، وملف PDF أو DOCX لمعارف الشات.")}
                            </span>
                            {indexedDocumentReady && !uploadingAttachment && (
                                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">المستند مفهرس ✅</span>
                            )}
                            <span className="text-slate-500">{contentCounter} حرف</span>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end">
                    <button
                        type="submit"
                        disabled={actionBusy}
                        className="w-full rounded-2xl border-2 border-black bg-cyan-400 px-6 py-3 text-base font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-cyan-500 active:translate-y-1 active:shadow-none disabled:opacity-60 sm:w-auto sm:px-12 sm:py-4 sm:text-lg">
                        {actionBusy ? "جارٍ الحفظ..." : isEditMode ? "حفظ التعديلات" : "إرسال الآن"}
                    </button>
                </div>
            </div>

            {isSubmitted && (
                <div className="rounded-2xl border-2 border-black bg-cyan-100 px-6 py-4 text-right font-bold text-slate-800" dir="rtl">
                    تم إرسال المحتوى بنجاح.
                </div>
            )}
        </form>
    );
}

