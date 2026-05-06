import React, { useEffect, useMemo, useRef, useState } from "react";
import { Filter, MoreVertical, Plus, Search } from "lucide-react";
import { useAccountRequestCatalog } from "../../../hooks/useAccountRequestCatalog";
import { apiFetch } from "../../../services/api";

const FILTERS = [
  { id: "all", label: "الكل" },
  { id: "favorites", label: "المفضلة" },
];

const ALL_COLLEGES = "__all_colleges__";
const ALL_YEARS = "__all_years__";

const ARABIC_YEAR_LABELS = {
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

const normalizeDigits = (value = "") =>
  String(value).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

const normalizeKey = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

const toArabicCollegeLabel = (raw) => {
  const value = String(raw || "").trim();
  const n = normalizeKey(value);
  if (!n) return "";
  if (n.includes("computer") || n === "cs" || n.includes("حاسب")) return "علوم الحاسب";
  if (n.includes("engineer") || n === "eng" || n.includes("هندس")) return "الهندسة";
  if (n.includes("business") || n.includes("اداره") || n.includes("إدارة")) return "إدارة الأعمال";
  if (n.includes("medic") || n === "med" || n.includes("طب")) return "الطب";
  if (n.includes("pharm") || n === "phr" || n.includes("صيدل")) return "الصيدلة";
  if (n.includes("dent") || n === "den" || n.includes("اسنان")) return "طب الأسنان";
  return value;
};

const extractLevelIdFromScope = (value = "") => {
  const raw = String(value || "");
  const englishLevel = raw.match(/level\s*(\d+)/i)?.[1];
  if (englishLevel) return String(englishLevel);

  const normalizedRaw = normalizeDigits(raw);
  const arabicLevel = normalizedRaw.match(/(?:دفعة|لائحة|السنة|سنة|الفرقة|فرقة)\s*(\d+)/)?.[1];
  if (arabicLevel) return String(arabicLevel);

  const normalizedText = normalizeKey(normalizedRaw);
  const hasYearContext = /(السنه|السنة|الفرقه|الفرقة|سنه|سنة|فرقه|فرقة)/.test(normalizedText);
  if (hasYearContext) {
    for (const [word, id] of Object.entries(ARABIC_YEAR_WORD_MAP)) {
      if (normalizedText.includes(normalizeKey(word))) return id;
    }
  }

  const justDigits = normalizedRaw.match(/^\s*(\d+)\s*$/)?.[1];
  return justDigits ? String(justDigits) : "";
};

const toArabicYearLabel = (raw = "") => {
  const value = String(raw || "").trim();
  if (!value) return "";
  const id = extractLevelIdFromScope(value) || normalizeDigits(value).match(/\d+/)?.[0] || "";
  if (id && ARABIC_YEAR_LABELS[id]) return ARABIC_YEAR_LABELS[id];
  return value.replace(/level/gi, "السنة").replace("الفرقة", "السنة");
};

const extractCollegeFromScope = (value = "") => {
  const raw = String(value || "");
  const english = raw.match(/college\s*:\s*([^|]+)/i)?.[1]?.trim();
  if (english) return toArabicCollegeLabel(english);

  const englishPlain = raw.match(/\b(computer science|engineering|business|medicine|pharmacy|dentistry)\b/i)?.[1]?.trim();
  if (englishPlain) return toArabicCollegeLabel(englishPlain);

  const arabic = raw.match(/كلية\s+([^|\-]+)/)?.[1]?.trim();
  if (arabic) return toArabicCollegeLabel(arabic);
  return "";
};

const formatToday = () => {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const isIndexableStorageItem = (file = {}) => {
  const fileName = String(file?.fileName || "").trim().toLowerCase();
  const storedName = String(file?.storedName || "").trim().toLowerCase();
  return (
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".docx") ||
    fileName.includes(" pdf") ||
    fileName.includes(".pdf") ||
    fileName.includes(" docx") ||
    fileName.includes(".docx") ||
    storedName.endsWith(".pdf") ||
    storedName.endsWith(".docx")
  );
};

const normalizeFileStem = (value = "") =>
  String(value || "")
    .replace(/\.[^.]+$/i, "")
    .replace(/(_edited)+$/i, "")
    .trim()
    .toLowerCase();

const extractStorageRouteNames = (value = "") => {
  const matches = String(value || "").match(/\/api\/storage\/files\/([^"'?#\s>]+)/gi) || [];
  return matches
    .map((match) => match.split("/api/storage/files/")[1]?.split(/[?#]/)[0] || "")
    .filter(Boolean);
};

export default function StorageView({ data = [], createdContent = [], loading = false, onCreate, onUpdate, onDelete, onIndex, onToggleFavorite, onOpenAdvancedEdit }) {
  const isRTL = typeof document !== "undefined" && document?.documentElement?.dir === "rtl";
  const [items, setItems] = useState(data);
  const [search, setSearch] = useState("");
  const [filterBy, setFilterBy] = useState("all");
  const [collegeFilter, setCollegeFilter] = useState(ALL_COLLEGES);
  const [yearFilter, setYearFilter] = useState(ALL_YEARS);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [actionError, setActionError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [indexingId, setIndexingId] = useState(null);
  const [reuploadTarget, setReuploadTarget] = useState(null);
  const fileInputRef = useRef(null);
  const [previewText, setPreviewText] = useState(null);
  const [previewWarnings, setPreviewWarnings] = useState([]);
  const [previewTitle, setPreviewTitle] = useState("");

  useEffect(() => {
    setItems(data);
  }, [data]);

  const { colleges: configuredColleges, getLevelsByCollege } = useAccountRequestCatalog();

  const collegesFromLocalManagement = useMemo(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("system.colleges") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .map((item) => String(item?.name || item?.id || "").trim())
        .filter(Boolean)
        .map(toArabicCollegeLabel);
    } catch {
      return [];
    }
  }, []);

  const collegeOptions = useMemo(() => {
    const configured = configuredColleges.map(toArabicCollegeLabel).filter(Boolean);
    const fromLocalManagement = collegesFromLocalManagement.map(toArabicCollegeLabel).filter(Boolean);
    const fromFiles = items.map((file) => extractCollegeFromScope(file.level)).filter(Boolean);
    const values = Array.from(new Set([...configured, ...fromLocalManagement, ...fromFiles]));
    return [{ id: ALL_COLLEGES, label: "كل الكليات" }, ...values.map((name) => ({ id: name, label: name }))];
  }, [items, configuredColleges, collegesFromLocalManagement]);

  const yearOptions = useMemo(() => {
    const selectedCollegeName = collegeFilter === ALL_COLLEGES ? "" : collegeFilter;
    const configuredYears = getLevelsByCollege(selectedCollegeName)
      .map((year) => {
        const id = String(year?.id || "").trim();
        if (!id) return null;
        return { id, label: toArabicYearLabel(year?.name || id) };
      })
      .filter(Boolean);

    const configuredMap = new Map(configuredYears.map((y) => [y.id, y.label]));
    items
      .map((file) => extractLevelIdFromScope(file.level))
      .filter(Boolean)
      .forEach((id) => {
        if (!configuredMap.has(id)) configuredMap.set(id, toArabicYearLabel(id));
      });

    const sorted = [...configuredMap.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([id, label]) => ({ id, label }));

    return [{ id: ALL_YEARS, label: "كل السنوات" }, ...sorted];
  }, [items, collegeFilter, getLevelsByCollege]);

  const enrichedItems = useMemo(() => {
    const contentList = Array.isArray(createdContent) ? createdContent : [];
    return items.map((file) => {
      const fileName = String(file?.fileName || "").trim();
      const normalizedName = normalizeFileStem(fileName);
      const storedName = String(file?.storedName || "").trim();
      const matchedContent =
        contentList.find((item) => extractStorageRouteNames(item?.body).includes(storedName)) ||
        contentList.find((item) => normalizeFileStem(item?.subject) === normalizedName) ||
        null;

      return {
        ...file,
        linkedContentId: matchedContent?.id ?? null,
        displayTitle: String(matchedContent?.subject || fileName || "بدون عنوان").trim(),
        subLabel:
          matchedContent && fileName && String(matchedContent?.subject || "").trim() !== fileName
            ? fileName
            : "",
      };
    });
  }, [items, createdContent]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = enrichedItems.filter((file) => {
      const scopeYearId = extractLevelIdFromScope(file.level);
      const scopeCollege = extractCollegeFromScope(file.level);
      const searchable = `${file.displayTitle || ""} ${file.fileName || ""} ${file.owner || ""} ${file.level || ""} ${scopeCollege}`.toLowerCase();

      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesPrimaryFilter = filterBy === "all" || (filterBy === "favorites" ? file.fav : true);
      const matchesCollege = collegeFilter === ALL_COLLEGES || scopeCollege === collegeFilter;
      const matchesYear = yearFilter === ALL_YEARS || scopeYearId === yearFilter;

      return matchesSearch && matchesPrimaryFilter && matchesCollege && matchesYear;
    });

    const unique = [];
    const seen = new Set();
    for (const file of filtered) {
      const signature = [
        String(file.displayTitle || "").trim().toLowerCase(),
        String(file.subLabel || "").trim().toLowerCase(),
        String(file.level || "").trim().toLowerCase(),
        String(file.category || "").trim().toLowerCase(),
        String(file.owner || "").trim().toLowerCase(),
      ].join("::");
      if (seen.has(signature)) continue;
      seen.add(signature);
      unique.push(file);
    }
    return unique;
  }, [enrichedItems, search, filterBy, collegeFilter, yearFilter]);

  const toggleFavorite = async (id) => {
    setItems((prev) => prev.map((file) => (file.id === id ? { ...file, fav: !file.fav } : file)));
    if (onToggleFavorite) await onToggleFavorite(id);
  };

  const handleDelete = async (id) => {
    setItems((prev) => prev.filter((file) => file.id !== id));
    setMenuOpenFor(null);
    if (onDelete) await onDelete(id);
  };

  const openEdit = (id) => {
    const currentName = items.find((f) => f.id === id)?.fileName || "";
    setEditingId(id);
    setEditingName(currentName);
    setMenuOpenFor(null);
  };

  const saveEdit = async (id) => {
    const nextName = editingName.trim();
    if (!nextName) return;
    setActionError("");
    try {
      if (onUpdate) await onUpdate(id, { fileName: nextName });
      setItems((prev) => prev.map((file) => (file.id === id ? { ...file, fileName: nextName } : file)));
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setActionError(err?.message || "تعذر إعادة تسمية الملف.");
    }
  };

  const buildScopeLabel = () => {
    if (collegeFilter === ALL_COLLEGES && yearFilter === ALL_YEARS) return "الكل";
    if (collegeFilter === ALL_COLLEGES && yearFilter !== ALL_YEARS) return ARABIC_YEAR_LABELS[yearFilter] || `السنة ${yearFilter}`;
    if (collegeFilter !== ALL_COLLEGES && yearFilter === ALL_YEARS) return `كلية ${collegeFilter}`;
    return `كلية ${collegeFilter} | ${ARABIC_YEAR_LABELS[yearFilter] || `السنة ${yearFilter}`}`;
  };

  const handleNewFile = () => {
    setActionError("");
    setReuploadTarget(null);
    fileInputRef.current?.click();
  };

  const handleReuploadForItem = (file) => {
    setActionError("");
    setReuploadTarget(file || null);
    fileInputRef.current?.click();
  };

  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const lowerName = String(file.name || "").toLowerCase();
    const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
    const isDocx =
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lowerName.endsWith(".docx");
    if (lowerName.endsWith(".doc")) {
      setActionError("ملفات DOC غير مدعومة حاليًا. استخدم DOCX أو PDF.");
      event.target.value = "";
      return;
    }
    if (!isPdf && !isDocx) {
      setActionError("يرجى اختيار ملف PDF أو DOCX فقط.");
      event.target.value = "";
      return;
    }

    setUploadingDocument(true);
    setActionError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const targetFileName = String(reuploadTarget?.fileName || "").trim();
      const targetLevel = String(reuploadTarget?.level || "").trim();
      const targetCategory = String(reuploadTarget?.category || "").trim();
      formData.append("file_name", targetFileName || String(file.name || "").replace(/\.(pdf|docx)$/i, "").trim() || "مستند");
      formData.append("level", targetLevel || buildScopeLabel());
      formData.append("category", targetCategory || "General Information");
      if (reuploadTarget?.id) {
        formData.append("replace_existing", "true");
      }
      const result = await apiFetch("/api/storage/upload-and-index", {
        method: "POST",
        body: formData,
      });
      const created = result?.item;
      if (created) {
        const loggedUser = (() => {
          try {
            return JSON.parse(localStorage.getItem("loggedUser") || "{}");
          } catch {
            return {};
          }
        })();
        const mapped = {
          id: created.id,
          fileName: created.file_name,
          level: created.level,
          owner: loggedUser?.name || loggedUser?.full_name || loggedUser?.username || "Admin",
          category: created.category,
          date: formatToday(),
          fav: Boolean(created.is_favorite),
          isIndexed: Boolean(created.is_indexed),
          indexingStatus: created.indexing_status || "pending",
          indexingError: created.indexing_error,
          extractedText: created.extracted_text,
          chunksCount: created.chunks_count || 0,
          storedName: created.stored_name || null,
        };
        if (reuploadTarget?.id && onDelete) {
          await onDelete(reuploadTarget.id).catch(() => null);
        }
        setItems((prev) =>
          [mapped, ...prev.filter((item) => item.id !== mapped.id && item.id !== reuploadTarget?.id)]
        );

        if (result?.extraction_warnings?.length) {
          setPreviewWarnings(result.extraction_warnings);
          setPreviewTitle("تحذيرات رفع الملف");
        }
      }
    } catch (err) {
      setActionError(err?.message || "تعذر رفع الملف وفهرسته.");
    } finally {
      setUploadingDocument(false);
      setReuploadTarget(null);
      event.target.value = "";
    }
  };

  const handleIndexNow = async (id) => {
    setActionError("");
    try {
      setIndexingId(id);
      
      const formData = new FormData();
      formData.append("replace_existing", "true");
      const result = await apiFetch(`/api/storage/${id}/index`, {
        method: "POST",
        body: formData,
      });

      const updated = result?.item || null;
      if (updated) {
        setItems((prev) =>
          prev.map((file) =>
            Number(file.id) === Number(id)
              ? {
                  ...file,
                  isIndexed: Boolean(updated.is_indexed ?? updated.isIndexed),
                  indexingStatus: updated.indexing_status || "pending",
                  indexingError: updated.indexing_error,
                  extractedText: updated.extracted_text,
                  chunksCount: updated.chunks_count || 0,
                  storedName: updated.stored_name ?? updated.storedName ?? file.storedName ?? null,
                  date: formatToday(),
                }
              : file
          )
        );
        if (result?.extraction_warnings?.length) {
          setPreviewWarnings(result.extraction_warnings);
          setPreviewTitle("تحذيرات إعادة الفهرسة");
        }
      } else {
        setItems((prev) => prev.map((file) => (Number(file.id) === Number(id) ? { ...file, isIndexed: true } : file)));
      }
    } catch (err) {
      const rawMessage = String(err?.message || "").trim();
      const normalized = rawMessage.toLowerCase();
      if (normalized.includes("no stored binary reference") || normalized.includes("re-upload required")) {
        setActionError("هذا الملف قديم وغير مرتبط بنسخة محفوظة قابلة للفهرسة. يرجى إعادة رفعه ثم فهرسته.");
      } else {
        setActionError(rawMessage || "تعذر فهرسة الملف.");
      }
    } finally {
      setIndexingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black italic sm:text-2xl">إدارة التخزين</h2>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleDocumentUpload}
            className="hidden"
          />
          <button className="rounded-xl border-2 border-black bg-white p-3 transition hover:bg-slate-50" title="تصفية">
            <Filter size={20} />
          </button>

          <button onClick={handleNewFile} className="flex items-center gap-2 rounded-xl bg-black px-6 py-2 font-bold text-white transition hover:bg-slate-800">
            <Plus size={20} />
            {uploadingDocument ? "جارٍ الرفع..." : "رفع مستند للشات"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-3xl border-2 border-black bg-white p-3 sm:p-4 md:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الملف أو المالك أو السنة..."
            className="w-full rounded-xl border-2 border-transparent bg-slate-100 py-3 pl-10 pr-3 outline-none transition focus:border-cyan-400"
          />
        </div>

        <select value={filterBy} onChange={(e) => setFilterBy(e.target.value)} className="rounded-xl border-2 border-transparent bg-slate-100 px-3 py-3 outline-none transition focus:border-cyan-400">
          {FILTERS.map((filter) => (
            <option key={filter.id} value={filter.id}>
              {filter.label}
            </option>
          ))}
        </select>

        <select
          value={collegeFilter}
          onChange={(e) => {
            setCollegeFilter(e.target.value);
            setYearFilter(ALL_YEARS);
          }}
          className="rounded-xl border-2 border-transparent bg-slate-100 px-3 py-3 outline-none transition focus:border-cyan-400"
        >
          {collegeOptions.map((college) => (
            <option key={college.id} value={college.id}>
              {college.label}
            </option>
          ))}
        </select>

        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="rounded-xl border-2 border-transparent bg-slate-100 px-3 py-3 outline-none transition focus:border-cyan-400">
          {yearOptions.map((year) => (
            <option key={year.id} value={year.id}>
              {year.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredItems.map((file) => (
          <div key={file.id} className="flex flex-col gap-4 rounded-[30px] border-2 border-black bg-white p-4 transition-all hover:shadow-lg sm:p-5 md:flex-row md:items-center md:justify-between md:p-6">
            {(() => {
              const indexableDocument = isIndexableStorageItem(file);
              const statusClass = !indexableDocument
                ? "bg-slate-100 text-slate-600"
                : file.isIndexed
                ? "bg-emerald-100 text-emerald-700"
                : file.storedName
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-700";
              const statusLabel = !indexableDocument
                ? "محتوى عادي"
                : file.isIndexed
                ? "مفهرس"
                : file.storedName
                ? "غير مفهرس"
                : "إعادة رفع مطلوبة";
              return (
                <>
            <div className="flex items-start gap-4 sm:items-center sm:gap-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-black bg-cyan-100">
                <span className="font-black text-cyan-700">DB</span>
              </div>

              <div>
                {editingId === file.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(file.id)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-cyan-400"
                      autoFocus
                    />
                    <button onClick={() => saveEdit(file.id)} className="rounded-md bg-cyan-500 px-2 py-1 text-xs font-bold text-white">حفظ</button>
                    <button onClick={() => { setEditingId(null); setEditingName(""); }} className="rounded-md bg-slate-200 px-2 py-1 text-xs font-bold">إلغاء</button>
                  </div>
                ) : (
                  <div>
                    <h4 className="text-base font-black sm:text-lg">{file.displayTitle || file.fileName}</h4>
                    {file.subLabel ? <p className="mt-1 text-[11px] font-semibold text-slate-400">الملف: {file.subLabel}</p> : null}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                  <span>السنة: {toArabicYearLabel(extractLevelIdFromScope(file.level) || file.level)}</span>
                  <span>المالك: {file.owner}</span>
                  <span>التاريخ: {file.date}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusClass}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              {indexableDocument ? (file.indexingStatus === "indexed" || file.isIndexed ? (
                <button
                  type="button"
                  disabled
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
                  title={`الملف مفهرس وجاهز. عدد القطع: ${file.chunksCount || "غير معروف"}`}
                >
                  جاهز للشات
                </button>
              ) : file.indexingStatus === "failed" ? (
                <button
                  onClick={() => (file.storedName ? handleIndexNow(file.id) : handleReuploadForItem(file))}
                  disabled={indexingId === file.id || uploadingDocument}
                  className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  title={file.indexingError || "فشلت الفهرسة"}
                >
                  فشل (إعادة المحاولة)
                </button>
              ) : (
                <button
                  onClick={() => (file.storedName ? handleIndexNow(file.id) : handleReuploadForItem(file))}
                  disabled={indexingId === file.id || uploadingDocument}
                  className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700 hover:bg-cyan-100 disabled:opacity-60"
                  title="فهرسة الملف للشات"
                >
                  {indexingId === file.id
                    ? "جارٍ الفهرسة..."
                    : uploadingDocument && reuploadTarget?.id === file.id
                    ? "جارٍ إعادة الرفع..."
                    : file.storedName
                    ? "فهرسة الآن"
                    : "إعادة رفع ثم فهرسة"}
                </button>
              )) : null}

              <div className="relative">
                <button onClick={() => setMenuOpenFor((prev) => (prev === file.id ? null : file.id))} className="ml-1 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" title="المزيد">
                  <MoreVertical size={20} />
                </button>
                {menuOpenFor === file.id && (
                  <div className={`absolute top-11 z-20 min-w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ${isRTL ? "left-0" : "right-0"}`}>
                    {indexableDocument && (
                      <button onClick={() => {
                        setPreviewTitle(`معاينة النص: ${file.fileName}`);
                        setPreviewText(file.extractedText || "لم يتم العثور على نص مستخرج. قد يكون الملف عبارة عن صور فقط (Scanned PDF) أو لم تتم فهرسته بعد.");
                        setPreviewWarnings([]);
                        setMenuOpenFor(null);
                      }} className={`block w-full rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-100 ${isRTL ? "text-right" : "text-left"}`}>
                        معاينة النص المستخرج
                      </button>
                    )}
                    <button onClick={() => { onOpenAdvancedEdit?.(file); setMenuOpenFor(null); }} className={`block w-full rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-100 ${isRTL ? "text-right" : "text-left"}`}>تعديل المحتوى</button>
                    <button onClick={() => openEdit(file.id)} className={`block w-full rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-100 ${isRTL ? "text-right" : "text-left"}`}>إعادة تسمية</button>
                    <button onClick={() => toggleFavorite(file.id)} className={`block w-full rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-100 ${isRTL ? "text-right" : "text-left"}`}>
                      {file.fav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                    </button>
                    <button onClick={() => handleDelete(file.id)} className={`block w-full rounded-lg px-3 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50 ${isRTL ? "text-right" : "text-left"}`}>حذف</button>
                  </div>
                )}
              </div>
            </div>
                </>
              );
            })()}
          </div>
        ))}
      </div>

      {!filteredItems.length && !loading && <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">لا توجد ملفات مطابقة.</div>}
      {actionError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{actionError}</div>}
      {loading && <div className="text-xs font-semibold text-slate-500">جاري تحميل بيانات التخزين...</div>}

      {/* Preview Modal */}
      {(previewText !== null || previewWarnings.length > 0) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-[32px] bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-xl font-black">{previewTitle}</h3>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {previewWarnings.length > 0 && (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
                  <h4 className="font-bold text-amber-800 mb-2">تنبيهات جودة الاستخراج:</h4>
                  <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">
                    {previewWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-amber-600 font-bold">قد لا يتمكن الشات بوت من الإجابة بدقة من هذا الملف.</p>
                </div>
              )}
              
              {previewText !== null && (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap border-2 border-slate-200 font-mono" dir="auto">
                  {previewText}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setPreviewText(null);
                  setPreviewWarnings([]);
                }}
                className="rounded-xl bg-slate-900 px-6 py-2.5 font-bold text-white transition hover:bg-slate-700"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

