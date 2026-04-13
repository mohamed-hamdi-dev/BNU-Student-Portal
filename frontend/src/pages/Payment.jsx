import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CreditCard, Info, Landmark, Loader2, Lock, Printer, Receipt, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SystemContext } from "../context/SystemContext";
import { getCurrentAcademicYear } from "../utils/academicData";
import TuitionPaymentPermit from "../components/payment/TuitionPaymentPermit";
import {
  confirmProviderWebhook,
  createPaymentOrder,
  getMyPaymentOverview,
  initiatePaymentTransaction,
  submitBankReceipt,
  uploadPublicStorageFile,
} from "../services/paymentApi";

const isArabicLanguage = (lang) => String(lang || "ar").toLowerCase().startsWith("ar");
const tx = (isAr, ar, en) => (isAr ? ar : en);
const getSemesterLabel = (semester, isAr) => {
  const key = String(semester || "").trim().toLowerCase();
  if (key === "autumn" || key === "fall") return isAr ? "الخريف" : "Autumn";
  if (key === "spring") return isAr ? "الربيع" : "Spring";
  if (key === "summer") return isAr ? "الصيف" : "Summer";
  return isAr ? "غير محدد" : "Not specified";
};

export default function PaymentPage() {
  const { i18n } = useTranslation("global");
  const isAr = isArabicLanguage(i18n.language);
  const { openSemester } = useContext(SystemContext);

  const [loggedUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("loggedUser") || "{}");
    } catch {
      return {};
    }
  });

  const [step, setStep] = useState("input");
  const [studentId, setStudentId] = useState(() => loggedUser?.username || loggedUser?.studentId || "");
  const [paymentMethod, setPaymentMethod] = useState("ONLINE");
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPrintedSlip, setHasPrintedSlip] = useState(false);
  const [message, setMessage] = useState("");
  const [bankReceiptFile, setBankReceiptFile] = useState(null);
  const [bankReceiptFileName, setBankReceiptFileName] = useState("");
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState("");

  const [overview, setOverview] = useState(null);
  const [order, setOrder] = useState(null);
  const [activeTransaction, setActiveTransaction] = useState(null);
  const [fawryPaymentLink, setFawryPaymentLink] = useState("");

  const brandColor = "#05ADCF";
  const slipRef = useRef(null);

  const studentName = loggedUser?.full_name || loggedUser?.NameID || loggedUser?.name || tx(isAr, "غير مسجل", "Not provided");
  const studentCollege = loggedUser?.college || tx(isAr, "غير محدد", "Not specified");
  const academicYearLabel = useMemo(() => getCurrentAcademicYear(), []);
  const semesterValue = String(openSemester || "autumn");
  const semesterLabel = useMemo(() => getSemesterLabel(semesterValue, isAr), [semesterValue, isAr]);

  const finalTotal = Number(order?.amount_due || 0);
  const discountAmount = Number(order?.discount_amount || 0);
  const baseAmount = Number(order?.amount_before_discount || 0);
  const additionalFeesAmount = Number(order?.additional_fees_amount || 0);
  const latePenaltyAmount = Number(order?.late_penalty_amount || 0);
  const orderDueDate = order?.due_date ? new Date(order.due_date) : null;
  const breakdown = useMemo(() => {
    try {
      return order?.breakdown_json ? JSON.parse(order.breakdown_json) : null;
    } catch {
      return null;
    }
  }, [order?.breakdown_json]);
  const breakdownItems = Array.isArray(breakdown?.fee_items) ? breakdown.fee_items : [];
  const bankAccount = overview?.bank_account || null;
  const bankNameForSlip = String(bankAccount?.bank_name || "Bank of Cairo");
  const issueDate = useMemo(() => new Date().toLocaleDateString(isAr ? "ar-EG" : "en-US"), [isAr]);
  const paymentReference = useMemo(() => String(order?.order_no || "-"), [order?.order_no]);
  const clearanceStatus = String(overview?.clearance?.clearance_status || "").toUpperCase();
  const isCleared = clearanceStatus === "CLEARED";
  const clearanceSource = String(overview?.clearance?.source || "").toUpperCase();
  const clearanceNotes = String(overview?.clearance?.notes || "").trim();
  const isBankReceiptRejected = clearanceSource === "BANK_REJECTED";
  const isBankReceiptPendingReview = !isCleared && (clearanceSource === "ORDER_CREATED" || clearanceSource === "BANK_TRANSFER" || clearanceSource === "BANK_SUBMITTED");
  const buildFawryLink = (orderNo, sid) => {
    const ref = encodeURIComponent(String(orderNo || ""));
    const student = encodeURIComponent(String(sid || ""));
    return `https://www.fawry.com/pay?ref=${ref}&student=${student}`;
  };

  const loadOverview = async () => {
    try {
      const data = await getMyPaymentOverview(academicYearLabel, semesterValue);
      setOverview(data || null);
      if (data?.order) setOrder(data.order);
      const txs = Array.isArray(data?.transactions) ? data.transactions : [];
      if (txs.length) setActiveTransaction(txs[0]);
    } catch (err) {
      setMessage(String(err?.message || ""));
    }
  };

  useEffect(() => {
    loadOverview();
  }, [academicYearLabel, semesterValue]);

  const ensureOrder = async () => {
    const created = await createPaymentOrder({ academic_year_label: academicYearLabel, semester: semesterValue });
    setOrder(created);
    await loadOverview();
    return created;
  };

  const handleNextFromInput = async () => {
    if (!studentId) return;
    try {
      setIsProcessing(true);
      await ensureOrder();
      setStep("summary");
    } catch (err) {
      setMessage(String(err?.message || tx(isAr, "تعذر إنشاء أمر الدفع", "Could not create payment order")));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintSlip = () => {
    if (!slipRef.current) return;
    const wnd = window.open("", "_blank", "width=900,height=1000");
    if (!wnd) return;
    wnd.document.write(`
      <html dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
      <head>
        <meta charset="UTF-8" />
        <base href="${window.location.origin}/" />
        <title>${tx(isAr, "إذن دفع بنكي", "Bank Payment Slip")}</title>
        <style>
          @page { size: A4; margin: 10mm; }
          html, body { margin: 0; padding: 0; background: #fff; font-family: "Cairo", "Noto Kufi Arabic", Tahoma, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style>
      </head>
      <body>${slipRef.current.outerHTML}</body>
      </html>
    `);
    wnd.document.close();
    const finalizePrint = () => {
      try {
        wnd.focus();
        wnd.print();
      } finally {
        wnd.close();
        setHasPrintedSlip(true);
      }
    };
    const imgs = Array.from(wnd.document.images || []);
    if (!imgs.length) {
      finalizePrint();
      return;
    }
    let remaining = imgs.length;
    let done = false;
    const completeOnce = () => {
      if (done) return;
      remaining -= 1;
      if (remaining <= 0) {
        done = true;
        setTimeout(finalizePrint, 120);
      }
    };
    imgs.forEach((img) => {
      if (img.complete) {
        completeOnce();
      } else {
        img.addEventListener("load", completeOnce, { once: true });
        img.addEventListener("error", completeOnce, { once: true });
      }
    });
    setTimeout(() => {
      if (!done) {
        done = true;
        finalizePrint();
      }
    }, 2500);
  };

  const startPayment = async () => {
    try {
      setIsProcessing(true);
      setMessage("");
      const ord = await ensureOrder();

      if (paymentMethod === "ONLINE") {
        const txRow = await initiatePaymentTransaction(ord.id, { method: "ONLINE", provider: "BANK_GATEWAY" });
        setActiveTransaction(txRow);
        setStep("gateway");
        return;
      }

      if (paymentMethod === "FAWRY") {
        const txRow = await initiatePaymentTransaction(ord.id, { method: "FAWRY", provider: "FAWRY" });
        setActiveTransaction(txRow);
        const maybeUrl = String(txRow?.provider_ref || "").startsWith("http") ? String(txRow?.provider_ref) : "";
        setFawryPaymentLink(maybeUrl || buildFawryLink(ord.order_no, studentId));
        setStep("fawry");
        return;
      }

      if (!hasPrintedSlip) {
        setMessage(tx(isAr, "اطبع إذن الدفع البنكي أولًا", "Print the bank slip first"));
        return;
      }
      if (!bankReceiptFile) {
        setMessage(tx(isAr, "ارفع صورة/ملف الإيصال أولًا", "Please upload receipt file first"));
        return;
      }
      const txRow = await initiatePaymentTransaction(ord.id, { method: "BANK_TRANSFER", provider: "BANK_OF_CAIRO" });
      const uploaded = await uploadPublicStorageFile(bankReceiptFile);
      const uploadedUrl = String(uploaded?.url || "").trim();
      if (!uploadedUrl) {
        throw new Error(tx(isAr, "فشل رفع ملف الإيصال", "Failed to upload receipt file"));
      }
      setUploadedReceiptUrl(uploadedUrl);
      await submitBankReceipt(ord.id, txRow.id, {
        bank_name: bankNameForSlip,
        receipt_no: String(order?.order_no || ""),
        uploaded_file_url: uploadedUrl,
      });
      await loadOverview();
      setStep("success");
      setMessage(tx(isAr, "تم رفع الإيصال وبانتظار مراجعة الحسابات", "Receipt submitted and pending finance review"));
    } catch (err) {
      setMessage(String(err?.message || tx(isAr, "تعذرت عملية الدفع", "Payment failed")));
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmOnlineGateway = async () => {
    if (!activeTransaction?.idempotency_key) return;
    try {
      setIsProcessing(true);
      await confirmProviderWebhook("online", {
        provider_ref: `ONL-${Date.now()}`,
        idempotency_key: activeTransaction.idempotency_key,
        confirmed_amount: finalTotal,
        status: "SUCCESS",
      });
      await loadOverview();
      setStep("success");
    } catch (err) {
      setMessage(String(err?.message || tx(isAr, "فشل تأكيد الدفع", "Confirmation failed")));
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmFawryPaid = async () => {
    if (!activeTransaction?.idempotency_key) return;
    try {
      setIsProcessing(true);
      await confirmProviderWebhook("fawry", {
        provider_ref: `FWR-${Date.now()}`,
        idempotency_key: activeTransaction.idempotency_key,
        confirmed_amount: finalTotal,
        status: "SUCCESS",
      });
      await loadOverview();
      setStep("success");
    } catch (err) {
      setMessage(String(err?.message || tx(isAr, "فشل تأكيد دفع فوري", "Fawry confirmation failed")));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="tuition-shell" dir="rtl">
      <main className="tuition-wrap">
        <div className="tuition-panel">
          <div className="tuition-head">
            <div className="tuition-head-title">
              <span className="title-badge">{tx(isAr, "منظومة التحصيل المالي", "Financial Collection System")}</span>
              <h1>{tx(isAr, "تحصيل المصروفات", "Fee Collection")}</h1>
              <p>{tx(isAr, "كشف حساب ورسوم دراسية معتمد", "Official Tuition Financial Statement")}</p>
            </div>
            <div className="head-meta-grid">
              <div className="meta-chip">
                <span>{tx(isAr, "العام الأكاديمي", "Academic Year")}</span>
                <strong>{academicYearLabel}</strong>
              </div>
              <div className="meta-chip">
                <span>{tx(isAr, "الفصل", "Term")}</span>
                <strong>{semesterLabel}</strong>
              </div>
              <div className={`meta-chip ${isCleared ? "ok" : ""}`}>
                <span>{tx(isAr, "الحالة المالية", "Finance Status")}</span>
                <strong>{isCleared ? tx(isAr, "مسدد ومفعل", "Paid & Unlocked") : tx(isAr, "قيد السداد", "Pending Payment")}</strong>
              </div>
            </div>
            {isBankReceiptRejected && (
              <div className="status-banner status-banner-rejected">
                <strong>{tx(isAr, "تم رفض إيصال البنك", "Bank receipt was rejected")}</strong>
                <span>
                  {clearanceNotes
                    ? `${tx(isAr, "سبب الرفض", "Rejection reason")}: ${clearanceNotes}`
                    : tx(isAr, "يرجى رفع إيصال جديد واضح لإعادة المراجعة.", "Please upload a clearer/new receipt for re-review.")}
                </span>
              </div>
            )}
            {!isBankReceiptRejected && isBankReceiptPendingReview && (
              <div className="status-banner status-banner-pending">
                <strong>{tx(isAr, "إيصال البنك قيد المراجعة", "Bank receipt is under review")}</strong>
                <span>{tx(isAr, "سيتم إخطارك بعد الاعتماد أو الرفض.", "You will be notified after approve/reject review.")}</span>
              </div>
            )}
            {!!message && <p className="head-msg">{message}</p>}
          </div>

          {step === "input" && (
            <div className="stage-box space-y-4">
              <div className="field-wrap">
                <label className="field-label">{tx(isAr, "اسم الطالب", "Student Name")}</label>
                <input readOnly value={studentName} className="field-input readonly" />
              </div>
              <div className="field-wrap">
                <label className="field-label">{tx(isAr, "الرقم الجامعي", "Student ID")}</label>
                <input value={studentId} onChange={(e) => setStudentId(e.target.value)} className="field-input" />
              </div>
              <button disabled={!studentId || isProcessing} onClick={handleNextFromInput} className="btn-primary w-full">
                {isProcessing ? tx(isAr, "جارٍ التحضير...", "Preparing...") : tx(isAr, "استعلام عن المصروفات", "Check fees")} <ArrowRight className="inline-block" size={16} />
              </button>
            </div>
          )}

          {step === "summary" && (
            <div className="stage-box">
              <div className="section-head">
                <h2 className="section-title">{tx(isAr, "كشف الحساب", "Statement")}</h2>
                <span className="section-subtitle">{tx(isAr, "ملخص الرسوم المعتمد", "Official fee summary")}</span>
              </div>
              <div className="summary-top-grid">
                <div className="top-chip">
                  <span>{tx(isAr, "العام الأكاديمي", "Academic year")}</span>
                  <b>{academicYearLabel}</b>
                </div>
                <div className="top-chip">
                  <span>{tx(isAr, "الفصل", "Term")}</span>
                  <b>{semesterLabel}</b>
                </div>
                <div className="top-chip total-emphasis">
                  <span>{tx(isAr, "المبلغ المطلوب سداده", "Amount due")}</span>
                  <b>{finalTotal.toLocaleString()} EGP</b>
                </div>
              </div>
              <div className="statement-block">
                <div className="statement-group">
                  <div className="statement-row">
                    <span>{tx(isAr, "الرسوم الأساسية", "Base fees")}</span>
                    <b>{baseAmount.toLocaleString()} EGP</b>
                  </div>
                  <div className="statement-row discount">
                    <span>{tx(isAr, "الخصم", "Discount")}</span>
                    <b>-{discountAmount.toLocaleString()} EGP</b>
                  </div>
                  <div className="statement-row">
                    <span>{tx(isAr, "الرسوم والخدمات الإضافية", "Additional fees")}</span>
                    <b>{additionalFeesAmount.toLocaleString()} EGP</b>
                  </div>
                  {latePenaltyAmount > 0 && (
                    <div className="statement-row late">
                      <span>{tx(isAr, "غرامة التأخير", "Late penalty")}</span>
                      <b>{latePenaltyAmount.toLocaleString()} EGP</b>
                    </div>
                  )}
                </div>
                <div className="statement-row total">
                  <span>{tx(isAr, "الإجمالي النهائي", "Final total")}</span>
                  <b>{finalTotal.toLocaleString()} EGP</b>
                </div>
                {!!breakdownItems.length && (
                  <div className="receipt-details">
                    <p className="receipt-details-title">{tx(isAr, "تفاصيل البنود على الوصل", "Receipt fee items")}</p>
                    {breakdownItems.map((it, idx) => (
                      <div key={`${it.code || it.name_ar}-${idx}`} className="receipt-line">
                        <span>{it.name_ar || it.code || "-"}</span>
                        <b>{Number(it.amount || 0).toLocaleString()} EGP</b>
                      </div>
                    ))}
                  </div>
                )}
                {orderDueDate && (
                  <div className="due-badge">
                    {tx(isAr, "تاريخ الاستحقاق", "Due date")}: {orderDueDate.toLocaleDateString(isAr ? "ar-EG" : "en-US")}
                  </div>
                )}
              </div>
              <div className="actions-row">
                <button onClick={() => setStep("input")} className="btn-ghost flex-1"><ArrowLeft className="inline-block" size={14} /> {tx(isAr, "رجوع", "Back")}</button>
                <button onClick={() => setStep("payment")} className="btn-primary flex-1">{tx(isAr, "المتابعة للدفع", "Continue")}</button>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className="stage-box space-y-6">
              <div className="method-grid">
                <button onClick={() => setPaymentMethod("ONLINE")} className={`method-btn ${paymentMethod === "ONLINE" ? "active-online" : ""}`}><CreditCard className="mb-2" size={18} />{tx(isAr, "بطاقة بنكية", "Online")}</button>
                <button onClick={() => setPaymentMethod("FAWRY")} className={`method-btn ${paymentMethod === "FAWRY" ? "active-fawry" : ""}`}><Receipt className="mb-2" size={18} />{tx(isAr, "فوري", "Fawry")}</button>
                <button onClick={() => setPaymentMethod("BANK_TRANSFER")} className={`method-btn ${paymentMethod === "BANK_TRANSFER" ? "active-bank" : ""}`}><Landmark className="mb-2" size={18} />{tx(isAr, "إذن دفع بنكي", "Bank transfer")}</button>
              </div>

              {paymentMethod === "BANK_TRANSFER" && (
                <div className="space-y-3">
                  <div ref={slipRef}>
                    <TuitionPaymentPermit
                      studentName={studentName}
                      studentId={studentId}
                      college={studentCollege}
                      issueDate={issueDate}
                      reference={paymentReference}
                      amount={finalTotal}
                      exemptionAmount={discountAmount}
                      tahyaMisrAmount={null}
                      bankName={bankNameForSlip}
                      accountHolderName={bankAccount?.account_holder_name}
                      accountNumber={bankAccount?.account_number}
                      iban={bankAccount?.iban}
                      swiftCode={bankAccount?.swift_code}
                      branchName={bankAccount?.branch_name}
                      paymentNote={bankAccount?.payment_note}
                      breakdownItems={breakdownItems}
                    />
                  </div>
                  <button onClick={handlePrintSlip} className="btn-dark w-full"><Printer size={16} />{tx(isAr, "طباعة إذن الدفع", "Print slip")}</button>
                  <div className="upload-panel">
                    <label className="field-label">
                      {tx(isAr, "رفع صورة/ملف الإيصال (إجباري)", "Upload receipt file (required)")}
                    </label>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setBankReceiptFile(file);
                        setBankReceiptFileName(file?.name || "");
                        setUploadedReceiptUrl("");
                      }}
                      className="upload-input"
                    />
                    {!!bankReceiptFileName && (
                      <p className="upload-filename">
                        {tx(isAr, "الملف المختار", "Selected file")}: {bankReceiptFileName}
                      </p>
                    )}
                  </div>
                  <div className="hint-panel"><Info size={14} />{tx(isAr, "اطبع الإذن وسلّمه للبنك ثم ارفع الإيصال للمراجعة.", "Print slip and submit to bank, then upload receipt for review.")}</div>
                  {!!uploadedReceiptUrl && (
                    <div className="ok-panel">
                      {tx(isAr, "تم رفع ملف الإيصال بنجاح", "Receipt file uploaded successfully")}
                    </div>
                  )}
                </div>
              )}

              <div className="actions-row border-top">
                <button onClick={() => setStep("summary")} className="btn-ghost"><ArrowLeft className="inline-block" size={14} /> {tx(isAr, "رجوع", "Back")}</button>
                <button
                  onClick={startPayment}
                  disabled={isProcessing || isCleared || (paymentMethod === "BANK_TRANSFER" && (!hasPrintedSlip || !bankReceiptFile))}
                  className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? <Loader2 className="animate-spin inline-block" size={16} /> : null} {isCleared ? tx(isAr, "تم السداد", "Already paid") : tx(isAr, "تأكيد وإرسال", "Confirm")}
                </button>
              </div>
            </div>
          )}

          {step === "gateway" && (
            <div className="stage-box">
              <div className="gateway-panel"><Lock size={18} className="text-cyan-700" /><div><b>{tx(isAr, "بوابة بنكية آمنة", "Secure bank gateway")}</b><p>{tx(isAr, "أكمل الدفع لتفعيل التسجيل", "Complete payment to unlock registration")}</p></div></div>
              <button onClick={confirmOnlineGateway} className="btn-primary w-full">{isProcessing ? <Loader2 className="animate-spin inline-block" size={16} /> : null} {tx(isAr, "إتمام الدفع", "Complete payment")}</button>
            </div>
          )}

          {step === "fawry" && (
            <div className="stage-box">
              <div className="fawry-panel">
                <h3>{tx(isAr, "صفحة دفع فوري", "Fawry Payment Page")}</h3>
                <div className="fawry-grid">
                  <div className="fawry-item"><span>{tx(isAr, "كود الطالب", "Student Code")}: </span><b>{studentId || "-"}</b></div>
                  <div className="fawry-item"><span>{tx(isAr, "مرجع الدفع", "Payment Ref")}: </span><b>{paymentReference}</b></div>
                </div>
                <div className="fawry-link-box">
                  <p>{tx(isAr, "لينك الدفع في فوري", "Fawry Payment Link")}</p>
                  <a href={fawryPaymentLink || "#"} target="_blank" rel="noreferrer">
                    {fawryPaymentLink || tx(isAr, "غير متاح", "Not available")}
                  </a>
                </div>
                <div className="actions-row">
                  <button onClick={() => setStep("payment")} className="btn-ghost">{tx(isAr, "رجوع", "Back")}</button>
                  <button onClick={confirmFawryPaid} className="btn-primary">
                    {isProcessing ? <Loader2 className="animate-spin inline-block" size={16} /> : null} {tx(isAr, "تم الدفع", "I've Paid")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="stage-box success-stage">
              <div className="success-icon"><CheckCircle2 size={34} /></div>
              <h2>{tx(isAr, "تم استلام طلب الدفع", "Payment request received")}</h2>
              <p>{paymentMethod === "BANK_TRANSFER" ? tx(isAr, "بانتظار مراجعة الحسابات لإيصال البنك", "Waiting finance review for bank receipt") : tx(isAr, "تم السداد وفتح التسجيل تلقائيًا", "Payment completed and registration unlocked")}</p>
              <div className="success-meta">
                <div><span>{tx(isAr, "المرجع", "Reference")}</span><b>{paymentReference}</b></div>
                <div><span>{tx(isAr, "الطريقة", "Method")}</span><b>{paymentMethod}</b></div>
                <div><span>{tx(isAr, "المبلغ", "Amount")}</span><b>{finalTotal.toLocaleString()} EGP</b></div>
              </div>
            </div>
          )}
        </div>
      </main>
      <style>{`
        .tuition-shell { min-height: 100vh; background: radial-gradient(1200px 620px at 5% -10%, #e7eff8 0%, transparent 60%), radial-gradient(900px 500px at 95% -20%, #edf5ff 0%, transparent 60%), #f4f7fb; padding: 20px 14px 40px; color: #0f1f3a; }
        .tuition-wrap { max-width: 980px; margin: 5em auto 0; }
        .tuition-panel { background: #fff; border: 1px solid #e4eaf3; border-radius: 18px; box-shadow: 0 10px 28px rgba(15, 31, 58, 0.08); overflow: hidden; }
        .tuition-head { padding: 24px 24px 18px; background: linear-gradient(180deg, #f8fbff 0%, #f2f7ff 100%); border-bottom: 1px solid #e5edf7; position: relative; }
        .tuition-head::after { content:""; position:absolute; right:24px; left:24px; bottom:0; height:1px; background:linear-gradient(90deg, transparent 0%, #d9e4f5 12%, #d9e4f5 88%, transparent 100%); }
        .tuition-head-title { text-align: center; margin-bottom: 14px; }
        .title-badge { display: inline-block; font-size: 11px; color: #1f4f8f; background: #eaf2ff; border: 1px solid #d4e2fb; border-radius: 999px; padding: 4px 12px; margin-bottom: 8px; font-weight: 700; }
        .tuition-head h1 { margin: 0; font-size: 29px; line-height: 1.2; color: #102544; font-weight: 900; letter-spacing: -0.2px; }
        .tuition-head-title p { margin: 4px 0 0; color: #5f6f87; font-size: 13px; font-weight: 600; }
        .head-meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
        .meta-chip { border: 1px solid #dfe8f4; background: #fff; border-radius: 12px; padding: 10px 12px; display:flex; flex-direction:column; gap: 3px; min-height: 56px; justify-content:center; }
        .meta-chip span { color:#64748b; font-size:11px; }
        .meta-chip strong { color:#0f2848; font-size:16px; font-weight:900; }
        .meta-chip.ok { border-color:#a7e8c9; background:#f3fef8; }
        .meta-chip.ok strong { color:#0d8a55; }
        .head-msg { margin:10px 0 0; font-size:13px; font-weight:700; color:#975a16; text-align:center; }
        .status-banner { margin-top: 10px; border-radius: 12px; padding: 10px 12px; display:flex; flex-direction:column; gap:4px; font-size:13px; text-align:right; }
        .status-banner strong { font-size:13px; font-weight:900; }
        .status-banner span { font-size:12px; font-weight:700; }
        .status-banner-rejected { border:1px solid #f1b7b7; background:#fff2f2; color:#b42318; }
        .status-banner-pending { border:1px solid #f2ddb0; background:#fff9eb; color:#8a5b0a; }
        .stage-box { padding: 24px; display:flex; flex-direction:column; gap:14px; }
        .section-head { display:flex; align-items:flex-end; justify-content:space-between; gap:8px; margin-bottom:2px; }
        .section-subtitle { color:#698099; font-size:12px; font-weight:700; }
        .field-wrap { display:flex; flex-direction:column; gap:6px; }
        .field-label { color:#41556f; font-size:13px; font-weight:800; }
        .field-input { border:1px solid #dce5f2; border-radius:12px; background:#fff; padding:12px 14px; font-size:15px; color:#0f1f3a; outline:none; }
        .field-input.readonly { background:#f8fbff; }
        .btn-primary,.btn-ghost,.btn-dark { border:0; border-radius:12px; height:44px; padding:0 16px; font-size:14px; font-weight:900; display:inline-flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; transition:all .15s ease; }
        .btn-primary { color:#fff; background:linear-gradient(180deg, #0aa5cc 0%, #058fb2 100%); box-shadow:0 8px 18px rgba(5,145,180,.25); }
        .btn-ghost { color:#334155; background:#fff; border:1px solid #d7e0ec; }
        .btn-dark { color:#fff; background:#102544; }
        .section-title { margin:0; color:#122847; font-size:24px; font-weight:900; }
        .summary-top-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:2px; }
        .top-chip { border:1px solid #dfe8f4; border-radius:12px; background:#f9fcff; padding:11px 12px; display:flex; flex-direction:column; gap:4px; min-height:60px; justify-content:center; }
        .top-chip span { color:#60758f; font-size:11px; font-weight:700; }
        .top-chip b { color:#152d4d; font-size:16px; font-weight:900; }
        .top-chip.total-emphasis { background:linear-gradient(180deg,#f3f8ff 0%,#ecf4ff 100%); border-color:#c9dcf8; }
        .top-chip.total-emphasis b { color:#0b3b74; font-size:18px; }
        .statement-block { border:1px solid #dfe8f4; border-radius:14px; overflow:hidden; background:linear-gradient(180deg,#fbfdff 0%,#f7fafe 100%); padding:12px; display:flex; flex-direction:column; gap:10px; }
        .statement-group { border:1px solid #e5ecf6; border-radius:12px; overflow:hidden; background:#fff; }
        .statement-row { display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:13px 14px; border-bottom:1px solid #edf2f8; }
        .statement-group .statement-row:last-child { border-bottom:0; }
        .statement-row span { color:#2a3c57; font-weight:700; font-size:15px; }
        .statement-row b { color:#132949; font-size:17px; font-weight:900; }
        .statement-row.discount { background:#f4fbf7; }
        .statement-row.discount span,.statement-row.discount b { color:#0f8a58; }
        .statement-row.late { background:#fff6f6; }
        .statement-row.late span,.statement-row.late b { color:#b42318; }
        .statement-row.total { background:linear-gradient(180deg,#edf4ff 0%,#e7f0ff 100%); border:1px solid #d4e2fb; border-radius:12px; }
        .statement-row.total span { font-size:16px; color:#0f2848; }
        .statement-row.total b { font-size:24px; color:#0b2958; }
        .receipt-details { border:1px solid #dfe8f4; border-radius:12px; background:#fff; padding:12px; margin:0; }
        .receipt-details-title { margin:0 0 8px; font-size:14px; color:#27466f; font-weight:900; border-right:3px solid #3f76c2; padding-right:8px; }
        .receipt-line { display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; border-bottom:1px dashed #dbe5f3; padding:7px 2px; font-size:14px; color:#304764; }
        .receipt-line:last-child { border-bottom:0; }
        .due-badge { margin:0; border:1px solid #f2ddb0; background:#fff9eb; border-radius:12px; color:#8a5b0a; font-size:13px; padding:10px 12px; font-weight:700; }
        .actions-row { display:flex; gap:10px; justify-content:space-between; }
        .actions-row.border-top { border-top:1px solid #e8edf6; padding-top:12px; }
        .method-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .method-btn { border:1px solid #d9e3f0; border-radius:12px; background:#fff; min-height:72px; padding:10px 12px; text-align:right; display:flex; flex-direction:column; gap:8px; color:#304862; font-weight:800; cursor:pointer; }
        .method-btn.active-online { background:#eef8ff; border-color:#7ac4ea; }
        .method-btn.active-fawry { background:#fff7e9; border-color:#f5c474; }
        .method-btn.active-bank { background:#f6f8fb; border-color:#b9c7da; }
        .upload-panel { border:1px solid #dce5f2; background:#fff; border-radius:12px; padding:11px; }
        .upload-input { width:100%; border:1px solid #dbe5f2; border-radius:10px; padding:8px; font-size:13px; background:#fbfdff; }
        .upload-filename { margin:8px 0 0; color:#4b617d; font-size:12px; font-weight:700; }
        .hint-panel { border:1px solid #cce9f5; background:#f2fbff; border-radius:10px; padding:10px 11px; color:#0b6080; display:flex; align-items:center; gap:7px; font-size:12px; font-weight:700; }
        .ok-panel { border:1px solid #b7e9cf; background:#f1fdf6; color:#0f8b58; border-radius:10px; padding:10px 11px; font-size:12px; font-weight:800; }
        .gateway-panel { border:1px solid #cae6f4; background:#f2fbff; border-radius:14px; padding:14px; display:flex; align-items:center; gap:10px; color:#1f4f8f; }
        .gateway-panel p { margin:2px 0 0; font-size:12px; color:#496581; font-weight:700; }
        .fawry-panel { border:1px solid #dce4f1; border-radius:14px; background:#fff; padding:16px; display:flex; flex-direction:column; gap:10px; }
        .fawry-panel h3 { margin:0; font-size:20px; color:#132949; font-weight:900; }
        .fawry-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .fawry-item { border:1px solid #e0e9f5; border-radius:10px; padding:9px 10px; background:#f8fbff; display:flex; justify-content:space-between; gap:8px; align-items:center; }
        .fawry-item span { color:#516680; font-size:12px; font-weight:700; }
        .fawry-item b { color:#122847; font-size:14px; font-weight:900; }
        .fawry-link-box { border:1px solid #cae6f4; background:#f1fbff; border-radius:10px; padding:10px; }
        .fawry-link-box p { margin:0 0 5px; font-size:12px; font-weight:900; color:#155b7a; }
        .fawry-link-box a { color:#0b6890; font-size:12px; text-decoration:underline; word-break:break-all; font-weight:700; }
        .success-stage { align-items:center; text-align:center; gap:10px; }
        .success-stage h2 { margin:0; font-size:24px; color:#122847; font-weight:900; }
        .success-stage p { margin:0; color:#5a6f88; font-size:13px; font-weight:700; }
        .success-icon { width:64px; height:64px; border-radius:999px; background:#e9fbf1; color:#0f8b58; display:grid; place-items:center; }
        .success-meta { margin-top:6px; width:min(520px,100%); border:1px solid #dbe5f2; border-radius:12px; overflow:hidden; text-align:right; }
        .success-meta > div { display:grid; grid-template-columns:1fr auto; padding:10px 12px; border-bottom:1px solid #edf2f8; }
        .success-meta > div:last-child { border-bottom:0; }
        .success-meta span { color:#50657f; font-size:12px; font-weight:700; }
        .success-meta b { color:#122847; font-size:14px; font-weight:900; }
        @media (max-width: 900px) { .head-meta-grid,.method-grid,.fawry-grid,.actions-row,.summary-top-grid { grid-template-columns:1fr; display:grid; } .tuition-head h1 { font-size:24px; } .section-head { align-items:flex-start; flex-direction:column; } }
        @media print {
          .tuition-shell { padding:0 !important; background:#fff !important; }
          .tuition-panel { box-shadow:none !important; border-radius:0 !important; border:1px solid #d7dfea !important; }
          .tuition-head,.stage-box { padding:10px !important; }
          .btn-primary,.btn-ghost,.btn-dark,.method-grid,.upload-panel,.hint-panel,.ok-panel { display:none !important; }
        }
      `}</style>
    </div>
  );
}
