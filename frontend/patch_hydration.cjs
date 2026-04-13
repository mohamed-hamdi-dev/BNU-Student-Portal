const fs = require('fs');
const filepath = 'c:/React Course - (Udmey)/PORTAL-STUDENT-BNU/frontend/src/pages/academicStudent/CourseRegistrationPage.jsx';
let text = fs.readFileSync(filepath, 'utf8');

const lines = text.split('\n');
let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const sectionToken = String(sel?.section || "").trim().toUpperCase();')) {
    startIdx = i;
  }
  if (startIdx !== -1 && lines[i].includes('.filter(Boolean);')) {
    endIdx = i;
    break;
  }
}

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `            const sectionToken = String(sel?.section || "").trim().toUpperCase();
            const pickedGroup =
              (base.groups || []).find((g) => String(g?.name || "").toUpperCase().includes(sectionToken)) ||
              (base.groups || []).find((g) => String(g?.section || "").toUpperCase() === sectionToken) ||
              null;

            let hydratedLecture = base.lecture || {};
            let hydratedGroup = pickedGroup || base.selectedGroup || null;

            if (sel?.day_of_week || sel?.start_time) {
                hydratedLecture = {
                    ...hydratedLecture,
                    day: sel.day_of_week || hydratedLecture?.day || "",
                    time: (sel.start_time && sel.end_time)
                        ? \`\${sel.start_time} - \${sel.end_time}\`
                        : sel.start_time || hydratedLecture?.time || "",
                    start: sel.start_time || hydratedLecture?.start || "",
                    end: sel.end_time || hydratedLecture?.end || "",
                    hall: sel.room_name || hydratedLecture?.hall || "",
                };
            }

            if (hydratedGroup) {
                if (!hydratedGroup.day && sel?.day_of_week) {
                    hydratedGroup = {
                        ...hydratedGroup,
                        day: sel.day_of_week,
                        time: (sel.start_time && sel.end_time)
                            ? \`\${sel.start_time} - \${sel.end_time}\`
                            : sel.start_time || hydratedGroup.time || "",
                        start: sel.start_time || hydratedGroup.start || "",
                        end: sel.end_time || hydratedGroup.end || "",
                        hall: sel.room_name || hydratedGroup.hall || "",
                    };
                }
            } else if (sel?.section && sel?.day_of_week) {
                hydratedGroup = {
                    id: sel.section,
                    name: sel.section,
                    section: sel.section,
                    day: sel.day_of_week,
                    time: (sel.start_time && sel.end_time)
                        ? \`\${sel.start_time} - \${sel.end_time}\`
                        : sel.start_time || "",
                    start: sel.start_time || "",
                    end: sel.end_time || "",
                    hall: sel.room_name || "",
                };
            }

            return {
              ...base,
              semester: openSemester,
              status: requestStatus === "registered" || requestStatus === "approved" || requestStatus === "locked" ? "registered" : "pending_advisor",
              offering_id: Number(sel?.offering_id || 0) || undefined,
              selectedGroup: hydratedGroup,
              lecture: hydratedLecture,
            };
          })
          .filter(Boolean);`;

  const newLines = [...lines.slice(0, startIdx), replacement, ...lines.slice(endIdx + 1)];
  fs.writeFileSync(filepath, newLines.join('\n'), 'utf8');
  console.log('Successfully replaced lines ' + startIdx + ' to ' + endIdx);
} else {
  console.log('Unable to find target boundaries');
}
