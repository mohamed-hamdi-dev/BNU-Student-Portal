export const UPDATE_INTERVAL = 20;

export const getCurrentFactor = (now = Date.now()) => Math.floor(now / (UPDATE_INTERVAL * 1000));

export const parseStudentQR = (rawValue = "") => {
    if (!rawValue || typeof rawValue !== "string") return null;

    const parts = rawValue.split("|");
    const data = {};

    parts.forEach((part) => {
        const [key, ...rest] = part.split(":");
        if (!key || rest.length === 0) return;
        data[key.trim()] = rest.join(":").trim();
    });

    const studentId = data.ID || data.id || "";
    const studentName = data.Name || data.name || "";
    const college = data.College || data.college || "غير محدد";
    const factor = data.F || data.f || "";

    if (!studentId || !studentName || !factor) return null;

    return {
        studentId,
        studentName,
        college,
        factor: String(factor),
    };
};

export const isQRCodeExpired = (factor, options = {}) => {
    const allowPreviousFactors = Number(options.allowPreviousFactors ?? 0);
    const parsedFactor = Number(factor);
    if (!Number.isFinite(parsedFactor)) return true;

    const currentFactor = getCurrentFactor();
    return parsedFactor < currentFactor - allowPreviousFactors || parsedFactor > currentFactor;
};

export const isDuplicateAttendance = (attendanceList = [], studentId = "") =>
    attendanceList.some((item) => String(item.studentId) === String(studentId));

export const createAttendanceRecord = ({ studentId, studentName, college }) => ({
    studentId,
    studentName,
    college: college || "غير محدد",
    scannedAt: new Date().toISOString(),
    status: "present",
    qrStatus: "valid",
});

export const formatAttendanceForPdf = (attendanceList = []) =>
    attendanceList.map((item, index) => [
        index + 1,
        item.studentId,
        item.studentName,
        item.college || "غير محدد",
        new Date(item.scannedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        item.status === "present" ? "حاضر" : item.status,
    ]);
