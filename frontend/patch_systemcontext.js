const fs = require('fs');
const filepath = 'c:/React Course - (Udmey)/PORTAL-STUDENT-BNU/frontend/src/context/SystemContext.jsx';
let text = fs.readFileSync(filepath, 'utf8');

text = text.replace(
    'if (!studentId || !courseId || !semesterId) return { ok: false, error: "بيانات التسجيل غير مكتملة" };',
    'if (!studentId || !courseId || !semesterId) return { ok: false, error: `بيانات غير مكتملة. (Student: ${studentId ? "Yes" : "No"}, Course: ${courseId ? "Yes" : "No"}, Semester: ${semesterId ? "Yes" : "No"})` };'
);

text = text.replace(
    /if \(!studentId \|\| !courseId \|\| !semesterId\) return \{ ok: false, error: "بيانات التسجيل غير مكتملة" \};/g,
    'if (!studentId || !courseId || !semesterId) return { ok: false, error: `بيانات غير مكتملة. (Student: ${studentId ? "Yes" : "No"}, Course: ${courseId ? "Yes" : "No"}, Semester: ${semesterId ? "Yes" : "No"})` };'
);

fs.writeFileSync(filepath, text, 'utf8');
console.log("Patched SystemContext debugging!");
