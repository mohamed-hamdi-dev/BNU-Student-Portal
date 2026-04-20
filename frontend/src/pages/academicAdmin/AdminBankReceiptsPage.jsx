import React, { useEffect, useState } from "react";
import { listAdminBankReceipts, reviewAdminBankReceipt } from "../../services/paymentApi";

export default function AdminBankReceiptsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(0);
  const [noteById, setNoteById] = useState({});
  const [preview, setPreview] = useState({ open: false, url: "", title: "" });
  const [downloadScope, setDownloadScope] = useState("APPROVED");
  const [viewMode, setViewMode] = useState("PENDING");

  const load = async () => {
    try {
      setLoading(true);
      const params = viewMode === "PENDING" ? { review_status: "PENDING" } : {};
      const data = await listAdminBankReceipts(params);
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [viewMode]);

  const review = async (id, status) => {
    try {
      setBusyId(id);
      await reviewAdminBankReceipt(id, {
        review_status: status,
        review_note: String(noteById[id] || "").trim() || undefined,
      });
      await load();
    } catch (err) {
      alert(String(err?.message || "تعذر تنفيذ المراجعة"));
    } finally {
      setBusyId(0);
    }
  };

  const resolveReceiptUrl = (url) => {
    const value = String(url || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return `${window.location.origin}${value}`;
    return `${window.location.origin}/${value}`;
  };

  const withAccessToken = (url) => {
    const clean = String(url || "").trim();
    if (!clean) return "";
    const token = localStorage.getItem("access_token");
    if (!token) return clean;
    const sep = clean.includes("?") ? "&" : "?";
    return `${clean}${sep}token=${encodeURIComponent(token)}`;
  };

  const downloadReceipt = (row) => {
    const url = withAccessToken(resolveReceiptUrl(row?.uploaded_file_url));
    if (!url) return;
    let ext = "";
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname || "";
      const m = pathname.match(/\.([a-zA-Z0-9]+)$/);
      if (m?.[1]) ext = `.${String(m[1]).toLowerCase()}`;
    } catch {
      // ignore
    }
    if (!ext && String(row?.uploaded_file_url || "").toLowerCase().includes(".pdf")) ext = ".pdf";
    if (!ext && String(row?.uploaded_file_url || "").toLowerCase().match(/\.(png|jpe?g|webp|gif|bmp|svg)\b/)) {
      const mm = String(row?.uploaded_file_url || "").toLowerCase().match(/\.(png|jpe?g|webp|gif|bmp|svg)\b/);
      ext = mm?.[0] || "";
    }
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = `receipt-${row?.receipt_no || row?.id || "file"}${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllReceipts = () => {
    const items = rows.filter((item) => {
      const hasFile = !!resolveReceiptUrl(item?.uploaded_file_url);
      if (!hasFile) return false;
      if (downloadScope === "ALL") return true;
      return String(item?.review_status || "").toUpperCase() === "APPROVED";
    });
    items.forEach((item, index) => {
      window.setTimeout(() => downloadReceipt(item), index * 120);
    });
  };

  const openPreview = (row) => {
    const url = withAccessToken(resolveReceiptUrl(row?.uploaded_file_url));
    if (!url) return;
    setPreview({
      open: true,
      url,
      title: row?.receipt_no || row?.id || "receipt",
    });
  };

  const closePreview = () => setPreview({ open: false, url: "", title: "" });

  const isImageUrl = (url) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(String(url || ""));
  const isPdfUrl = (url) => /\.pdf(\?.*)?$/i.test(String(url || ""));

  return (
    <div className="max-w-6xl mx-auto p-6" dir="rtl">
      <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-800">مراجعة إيصالات البنك</h1>
        <p className="text-sm text-slate-500 mt-2">اعتماد إيصالات البنك لفتح تسجيل الطالب تلقائيًا.</p>
      </div>

      <div className="mt-4 rounded-3xl bg-white border border-slate-200 p-4 shadow-sm overflow-auto">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("PENDING")}
              className={`rounded-xl px-3 py-2 text-xs font-black border ${
                viewMode === "PENDING"
                  ? "bg-amber-50 text-amber-800 border-amber-300"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              قيد المراجعة
            </button>
            <button
              type="button"
              onClick={() => setViewMode("ARCHIVE")}
              className={`rounded-xl px-3 py-2 text-xs font-black border ${
                viewMode === "ARCHIVE"
                  ? "bg-slate-100 text-slate-800 border-slate-300"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              الأرشيف
            </button>
          </div>
          <p className="text-xs text-slate-500">
            عدد الوصولات: {rows.length} {viewMode === "PENDING" ? "(قيد المراجعة)" : "(كل الحالات)"}
          </p>
          <div className="flex items-center gap-2">
            <select
              value={downloadScope}
              onChange={(e) => setDownloadScope(String(e.target.value || "APPROVED"))}
              className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700"
            >
              <option value="APPROVED">المعتمد فقط</option>
              <option value="ALL">الكل</option>
            </select>
            <button
              type="button"
              disabled={
                downloadScope === "ALL"
                  ? !rows.some((item) => item.uploaded_file_url)
                  : !rows.some(
                      (item) =>
                        item.uploaded_file_url &&
                        String(item.review_status || "").toUpperCase() === "APPROVED"
                    )
              }
              onClick={downloadAllReceipts}
              className="rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-black disabled:opacity-50"
            >
              تنزيل صور الوصولات
            </button>
          </div>
        </div>

        {loading ? (
          <p className="p-4 text-slate-500">جاري التحميل...</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-slate-500">لا توجد إيصالات حاليًا.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b">
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">اسم الطالب</th>
                <th className="p-2 text-right">اسم المستخدم</th>
                <th className="p-2 text-right">رقم الإيصال</th>
                <th className="p-2 text-right">صورة الوصل</th>
                <th className="p-2 text-right">البنك</th>
                <th className="p-2 text-right">الحالة</th>
                <th className="p-2 text-right">ملاحظة</th>
                <th className="p-2 text-right">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b align-top">
                  <td className="p-2 font-bold">{row.id}</td>
                  <td className="p-2 font-bold text-slate-700">{row.student_name || "-"}</td>
                  <td className="p-2 font-bold text-slate-700">{row.student_username || "-"}</td>
                  <td className="p-2">{row.receipt_no || "-"}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!row.uploaded_file_url}
                        onClick={() => openPreview(row)}
                        className="rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-black disabled:opacity-50"
                      >
                        عرض الوصل
                      </button>
                      <button
                        type="button"
                        disabled={!row.uploaded_file_url}
                        onClick={() => downloadReceipt(row)}
                        className="rounded-xl bg-slate-800 text-white px-3 py-2 text-xs font-black disabled:opacity-50"
                      >
                        تنزيل الوصل
                      </button>
                    </div>
                  </td>
                  <td className="p-2">{row.bank_name || "-"}</td>
                  <td className="p-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-black ${
                        row.review_status === "APPROVED"
                          ? "bg-emerald-100 text-emerald-700"
                          : row.review_status === "REJECTED"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {row.review_status}
                    </span>
                  </td>
                  <td className="p-2 min-w-[240px]">
                    <textarea
                      value={noteById[row.id] || ""}
                      onChange={(e) => setNoteById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 p-2 text-xs"
                      placeholder="ملاحظة المراجعة"
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <button
                        disabled={busyId === row.id || String(row?.review_status || "").toUpperCase() !== "PENDING"}
                        onClick={() => review(row.id, "APPROVED")}
                        className="rounded-xl bg-emerald-600 text-white px-3 py-2 text-xs font-black disabled:opacity-50"
                      >
                        اعتماد
                      </button>
                      <button
                        disabled={busyId === row.id || String(row?.review_status || "").toUpperCase() !== "PENDING"}
                        onClick={() => review(row.id, "REJECTED")}
                        className="rounded-xl bg-rose-600 text-white px-3 py-2 text-xs font-black disabled:opacity-50"
                      >
                        رفض
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {preview.open && (
        <div className="fixed inset-0 z-[9999] bg-black/60 p-4 md:p-8 flex items-center justify-center">
          <div className="w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm md:text-base font-black text-slate-800">معاينة الوصل: {preview.title}</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-bold"
                >
                  إغلاق
                </button>
              </div>
            </div>

            <div className="bg-slate-50 p-3 md:p-4 h-[75vh] overflow-auto">
              {isImageUrl(preview.url) ? (
                <img
                  src={preview.url}
                  alt="receipt"
                  className="mx-auto max-w-full h-auto rounded-xl border border-slate-200 bg-white"
                />
              ) : isPdfUrl(preview.url) ? (
                <iframe src={preview.url} title="receipt-pdf-preview" className="w-full h-full rounded-xl border border-slate-200 bg-white" />
              ) : (
                <div className="h-full flex items-center justify-center text-center text-slate-600">
                  <div>
                    <p className="font-bold mb-2">لا يمكن معاينة هذا النوع داخل الصفحة.</p>
                    <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline font-bold">
                      اضغط هنا لفتح الملف
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
