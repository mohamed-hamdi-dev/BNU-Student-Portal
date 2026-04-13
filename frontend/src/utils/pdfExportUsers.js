import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

let cachedArabicFontBase64 = null;

const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
};

export const ensureArabicFont = async (doc) => {
    if (!cachedArabicFontBase64) {
        const response = await fetch("/fonts/arial.ttf");
        if (!response.ok) throw new Error("Failed to load Arabic font");
        const buffer = await response.arrayBuffer();
        cachedArabicFontBase64 = arrayBufferToBase64(buffer);
    }
    doc.addFileToVFS("arial.ttf", cachedArabicFontBase64);
    doc.addFont("arial.ttf", "ArialUnicode", "normal");
    doc.setFont("ArialUnicode", "normal");
};

const pick = (user, keys) => {
    for (const key of keys) {
        const value = user?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            return String(value);
        }
    }
    return "-";
};

const roleLabel = (role) => {
    const normalized = String(role || "").toLowerCase();
    if (normalized === "admin") return "Admin";
    if (normalized === "doctor") return "Doctor";
    if (normalized === "super_admin") return "Super Admin";
    return "Student";
};

export const exportUsersToPdf = async (users) => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    await ensureArabicFont(doc);
    const now = new Date();
    const dateText = now.toLocaleString("en-GB");

    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("Users List", 40, 40);

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Export Date: ${dateText}`, 40, 62);
    doc.text(`Total: ${users.length}`, 40, 80);

    const processText = (value) => {
        const txt = String(value ?? "");
        return typeof doc.processArabic === "function" ? doc.processArabic(txt) : txt;
    };

    const body = users.map((user, index) => [
        index + 1,
        processText(pick(user, ["username"])),
        processText(pick(user, ["full_name", "name"])),
        roleLabel(user?.role),
        processText(pick(user, ["student_code", "studentId", "student_id"])),
        processText(pick(user, ["college"])),
        processText(pick(user, ["email"])),
    ]);

    autoTable(doc, {
        startY: 98,
        margin: { left: 40, right: 40 },
        theme: "grid",
        head: [["#", "Username", "Full Name", "Role", "Student ID", "College", "Email"]],
        body,
        styles: {
            font: "ArialUnicode",
            fontSize: 9,
            halign: "center",
            valign: "middle",
            cellPadding: 6,
            textColor: [15, 23, 42],
            lineColor: [226, 232, 240],
            lineWidth: 0.6,
        },
        headStyles: {
            font: "ArialUnicode",
            fillColor: [5, 173, 207],
            textColor: 255,
            fontStyle: "bold",
        },
        columnStyles: {
            2: { halign: "right" }, // Full Name
            5: { halign: "right" }, // College
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252],
        },
        bodyStyles: {
            fillColor: [255, 255, 255],
        },
    });

    doc.save(`users-${now.getTime()}.pdf`);
};
