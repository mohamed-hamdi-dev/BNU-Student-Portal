import React, { useMemo } from "react";

export default function TuitionPaymentPermit({
  studentName,
  studentId,
  college,
  issueDate,
  reference,
  amount,
  exemptionAmount,
  tahyaMisrAmount,
  bankName,
  accountHolderName,
  accountNumber,
  iban,
  swiftCode,
  branchName,
  paymentNote,
  breakdownItems = [],
  currency = "EGP",
  logoUrl = "/assets/images/logo.png",
}) {
  const formatMoney = (value) => `${Number(value || 0).toLocaleString()} ${currency}`;

  const tahyaFromBreakdown = useMemo(() => {
    if (tahyaMisrAmount !== undefined && tahyaMisrAmount !== null) return Number(tahyaMisrAmount || 0);
    const item = (breakdownItems || []).find((row) => String(row?.name_ar || row?.code || "").includes("تحيا مصر"));
    return Number(item?.amount || 0);
  }, [breakdownItems, tahyaMisrAmount]);

  return (
    <section className="permit-page" dir="rtl" lang="ar">
      <article className="permit-sheet">
        <header className="permit-header">
          <div className="permit-logo-wrap" aria-label="University Logo">
            {logoUrl ? <img src={logoUrl} alt="University Logo" className="permit-logo-img" /> : <span className="permit-logo-placeholder">LOGO</span>}
          </div>

          <div className="permit-head-text">
            <h2 className="university-ar">جامعة بنها الأهلية</h2>
            <p className="university-en">Benha National University</p>
            <h1 className="doc-title-ar">إذن دفع المصروفات الدراسية</h1>
            <p className="doc-title-en">Tuition Payment Permit</p>
          </div>

          <div className="permit-head-meta">
            <div className="meta-label">المرجع</div>
            <div className="meta-value">{reference || "-"}</div>
            <div className="meta-check">✔ تم التحقق</div>
            <div className="bank-brand-mini">
              <img src="/assets/images/Banque-Misr.png" alt="Banque Misr" className="bank-mini-img" />
            </div>
          </div>
        </header>

        <div className="permit-divider" />

        <main className="permit-body">
          <section className="key-amount-strip">
            <div className="amount-card">
              <span className="label">المبلغ الإجمالي</span>
              <strong className="value">{formatMoney(amount)}</strong>
            </div>
            <div className="amount-card">
              <span className="label">الإعفاء</span>
              <strong className="value">{formatMoney(exemptionAmount)}</strong>
            </div>
            <div className="amount-card">
              <span className="label">صندوق تحيا مصر</span>
              <strong className="value">{formatMoney(tahyaFromBreakdown)}</strong>
            </div>
          </section>

          <section className="info-grid">
            <div className="info-item info-item-wide">
              <span className="k">اسم الطالب</span>
              <span className="v emph">{studentName || "-"}</span>
            </div>
            <div className="info-item">
              <span className="k">ID</span>
              <span className="v">{studentId || "-"}</span>
            </div>
            <div className="info-item">
              <span className="k">الكلية</span>
              <span className="v">{college || "-"}</span>
            </div>
            <div className="info-item">
              <span className="k">التاريخ</span>
              <span className="v">{issueDate || "-"}</span>
            </div>
            <div className="info-item">
              <span className="k">المرجع</span>
              <span className="v emph">{reference || "-"}</span>
            </div>
            <div className="info-item">
              <span className="k">المبلغ</span>
              <span className="v emph">{formatMoney(amount)}</span>
            </div>
          </section>

          <section className="bank-section">
            <h3 className="section-title">بيانات السداد البنكي</h3>
            <div className="bank-grid">
              <div className="bank-item">
                <span className="k">البنك</span>
                <span className="v">{bankName || "-"}</span>
              </div>
              <div className="bank-item">
                <span className="k">اسم المستفيد</span>
                <span className="v">{accountHolderName || "-"}</span>
              </div>
              <div className="bank-item">
                <span className="k">رقم الحساب</span>
                <span className="v">{accountNumber || "-"}</span>
              </div>
              <div className="bank-item">
                <span className="k">IBAN</span>
                <span className="v">{iban || "-"}</span>
              </div>
              <div className="bank-item">
                <span className="k">SWIFT</span>
                <span className="v">{swiftCode || "-"}</span>
              </div>
              <div className="bank-item">
                <span className="k">الفرع</span>
                <span className="v">{branchName || "-"}</span>
              </div>
              {paymentNote ? (
                <div className="bank-item bank-item-wide">
                  <span className="k">ملاحظة</span>
                  <span className="v">{paymentNote}</span>
                </div>
              ) : null}
            </div>
            <div className="bank-brand-footer">
              <img src="/assets/images/Banque-Misr.png" alt="Banque Misr" className="bank-footer-img" />
            </div>
          </section>
        </main>

        <footer className="permit-footer">
          <p>يرجى تقديم هذا الإذن عند السداد.</p>
          <p>هذه الوثيقة صالحة للاستخدام الرسمي.</p>
        </footer>
      </article>

      <style>{`
        .permit-page {
          width: 100%;
          display: flex;
          justify-content: center;
          padding: 6px;
          background: linear-gradient(180deg, #eef2f8 0%, #f8fafc 100%);
          box-sizing: border-box;
          font-family: "Cairo", "Noto Kufi Arabic", "Segoe UI", Tahoma, Arial, sans-serif;
          color: #10233d;
        }

        .permit-sheet {
          width: min(920px, 100%);
          background: #ffffff;
          border: 1px solid #e7edf6;
          box-shadow: 0 8px 18px rgba(15, 39, 72, 0.08);
          border-radius: 14px;
          padding: 14px 16px 12px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .permit-header {
          display: grid;
          grid-template-columns: 90px 1fr 210px;
          gap: 10px;
          align-items: center;
        }

        .permit-logo-wrap {
          width: 78px;
          height: 78px;
          border-radius: 12px;
          border: 1px dashed #d4deec;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f9fbff;
          overflow: hidden;
        }

        .permit-logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        .permit-logo-placeholder {
          color: #64748b;
          font-size: 11px;
          letter-spacing: 1px;
          font-weight: 700;
        }

        .permit-head-text {
          text-align: center;
        }

        .university-ar {
          margin: 0;
          font-size: 20px;
          line-height: 1.2;
          color: #0f2748;
          font-weight: 800;
        }

        .university-en {
          margin: 2px 0 4px;
          color: #64748b;
          font-size: 10px;
        }

        .doc-title-ar {
          margin: 0;
          font-size: 17px;
          line-height: 1.2;
          color: #10233d;
          font-weight: 800;
        }

        .doc-title-en {
          margin: 1px 0 0;
          color: #64748b;
          font-size: 10px;
        }

        .permit-head-meta {
          border: 1px solid #ebf0f7;
          border-radius: 10px;
          padding: 6px 8px;
          text-align: center;
          background: #ffffff;
        }

        .meta-label {
          color: #64748b;
          font-size: 11px;
          margin-bottom: 2px;
        }

        .meta-value {
          color: #0f2748;
          font-size: 13px;
          font-weight: 800;
          word-break: break-word;
        }

        .meta-check {
          margin-top: 4px;
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          color: #0a7d56;
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          border-radius: 999px;
          padding: 2px 8px;
        }

        .bank-brand-mini {
          margin-top: 6px;
          display: flex;
          justify-content: center;
        }

        .bank-mini-img {
          max-width: 165px;
          max-height: 50px;
          object-fit: contain;
          opacity: 1;
        }

        .permit-divider {
          height: 1px;
          background: linear-gradient(to left, transparent, #c8d5e7, transparent);
        }

        .permit-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .key-amount-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 4px;
          border: 1px solid #e9eef7;
          background: #ffffff;
          border-radius: 10px;
          padding: 4px;
        }

        .amount-card {
          border: 0;
          background: transparent;
          border-radius: 6px;
          padding: 6px;
          text-align: center;
          border-left: 1px solid #eef2f7;
        }

        .amount-card:last-child {
          border-left: 0;
        }

        .amount-card .label {
          display: block;
          font-size: 10px;
          color: #6b7280;
          margin-bottom: 1px;
        }

        .amount-card .value {
          font-size: 14px;
          color: #0f2748;
          font-weight: 800;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
        }

        .info-item {
          border: 1px solid #edf1f7;
          border-radius: 10px;
          padding: 6px 8px;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-height: 42px;
          justify-content: center;
        }

        .info-item-wide {
          grid-column: span 3;
        }

        .info-item .k {
          color: #64748b;
          font-size: 10px;
        }

        .info-item .v {
          color: #10233d;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.25;
          word-break: break-word;
        }

        .info-item .v.emph {
          color: #0f2748;
          font-weight: 800;
        }

        .bank-section {
          border: 1px solid #edf1f7;
          border-radius: 10px;
          background: #ffffff;
          padding: 6px;
        }

        .section-title {
          margin: 0 0 4px;
          color: #0f2748;
          font-size: 12px;
          font-weight: 800;
        }

        .bank-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 5px;
        }

        .bank-item {
          border: 1px solid #eef2f7;
          border-radius: 8px;
          background: #fff;
          padding: 5px 6px;
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-height: 38px;
        }

        .bank-item-wide {
          grid-column: span 3;
        }

        .bank-item .k {
          color: #64748b;
          font-size: 9px;
        }

        .bank-item .v {
          color: #10233d;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.2;
          word-break: break-word;
        }

        .bank-brand-footer {
          margin-top: 4px;
          display: flex;
          justify-content: flex-start;
        }

        .bank-footer-img {
          max-width: 240px;
          max-height: 64px;
          object-fit: contain;
          opacity: 1;
        }

        .permit-footer {
          margin-top: auto;
          border-top: 1px dashed #d5dde9;
          padding-top: 6px;
          text-align: center;
          color: #334155;
          font-size: 10px;
          line-height: 1.35;
        }

        @media (max-width: 700px) {
          .permit-header {
            grid-template-columns: 74px 1fr;
          }

          .permit-head-meta {
            grid-column: 1 / -1;
          }

          .key-amount-strip,
          .bank-grid {
            grid-template-columns: 1fr;
          }

          .info-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .amount-card {
            border-left: 0;
            border-bottom: 1px solid #eef2f7;
          }

          .amount-card:last-child {
            border-bottom: 0;
          }

          .info-item-wide,
          .bank-item-wide {
            grid-column: span 2;
          }
        }

        @page {
          size: A4;
          margin: 8mm;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .permit-page {
            background: #fff !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .permit-sheet {
            width: 100% !important;
            border: 1px solid #d4ddea !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin: 0 !important;
            padding: 10px 12px 8px !important;
            gap: 6px !important;
            max-height: 276mm;
            overflow: hidden;
          }

          .permit-logo-img,
          .bank-mini-img,
          .bank-footer-img {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }

          .permit-header {
            grid-template-columns: 72px 1fr 180px !important;
            gap: 8px !important;
          }

          .permit-logo-wrap {
            width: 68px !important;
            height: 68px !important;
          }

          .university-ar {
            font-size: 18px !important;
          }

          .doc-title-ar {
            font-size: 15px !important;
          }

          .university-en,
          .doc-title-en {
            font-size: 9px !important;
          }

          .key-amount-strip {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            padding: 3px !important;
            gap: 3px !important;
          }

          .amount-card {
            padding: 4px !important;
          }

          .amount-card .label {
            font-size: 9px !important;
          }

          .amount-card .value {
            font-size: 12px !important;
          }

          .info-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 4px !important;
          }

          .info-item {
            min-height: 34px !important;
            padding: 4px 6px !important;
            gap: 1px !important;
          }

          .info-item-wide {
            grid-column: span 3 !important;
          }

          .info-item .k {
            font-size: 9px !important;
          }

          .info-item .v {
            font-size: 11px !important;
          }

          .bank-section {
            padding: 5px !important;
          }

          .section-title {
            font-size: 11px !important;
            margin-bottom: 3px !important;
          }

          .bank-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 4px !important;
          }

          .bank-item {
            min-height: 30px !important;
            padding: 4px 5px !important;
          }

          .bank-item-wide {
            grid-column: span 3 !important;
          }

          .bank-item .k {
            font-size: 8px !important;
          }

          .bank-item .v {
            font-size: 10px !important;
          }

          .bank-brand-footer {
            margin-top: 2px !important;
          }

          .bank-mini-img {
            max-width: 170px !important;
            max-height: 50px !important;
          }

          .bank-footer-img {
            max-width: 190px !important;
            max-height: 48px !important;
          }

          .permit-footer {
            padding-top: 4px !important;
            font-size: 9px !important;
            line-height: 1.2 !important;
          }
        }
      `}</style>
    </section>
  );
}
