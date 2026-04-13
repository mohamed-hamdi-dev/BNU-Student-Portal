import { formatAttendanceForPdf } from "./attendanceUtils";

export const exportAttendancePdf = ({ attendanceList = [], sessionTitle = "كشف حضور المحاضرة" }) => {
    const rows = formatAttendanceForPdf(attendanceList);
    const now = new Date();

    const html = `
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8" />
          <title>${sessionTitle}</title>
          <style>
            body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 10px; color: #0b7285; }
            .meta { margin-bottom: 14px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #dbe4ea; padding: 8px; text-align: center; }
            th { background: #05ADCF; color: #fff; }
          </style>
        </head>
        <body>
          <h1>${sessionTitle}</h1>
          <div class="meta">التاريخ: ${now.toLocaleDateString("ar-EG")} - الوقت: ${now.toLocaleTimeString("ar-EG")} - إجمالي الطلاب: ${attendanceList.length}</div>
          <table>
            <thead>
              <tr>
                <th>م</th>
                <th>الكود الجامعي</th>
                <th>اسم الطالب</th>
                <th>الكلية</th>
                <th>وقت التسجيل</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                  .map(
                      (row) => `
                <tr>
                  <td>${row[0]}</td>
                  <td>${row[1]}</td>
                  <td>${row[2]}</td>
                  <td>${row[3]}</td>
                  <td>${row[4]}</td>
                  <td>${row[5]}</td>
                </tr>
              `
                  )
                  .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=980,height=900");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
};

