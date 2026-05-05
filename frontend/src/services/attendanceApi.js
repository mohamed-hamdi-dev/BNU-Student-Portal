import { apiFetch } from "./api";

export const listAttendanceOfferings = (params = {}) => {
  const search = new URLSearchParams();
  if (params.academic_year_label) search.set("academic_year_label", String(params.academic_year_label));
  if (params.semester) search.set("semester", String(params.semester));
  return apiFetch(`/api/attendance/offerings${search.toString() ? `?${search.toString()}` : ""}`);
};

export const createAttendanceSession = (payload) =>
  apiFetch("/api/attendance/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listAttendanceSessions = (offeringId) =>
  apiFetch(`/api/attendance/sessions?offering_id=${encodeURIComponent(String(offeringId || ""))}`);

export const getAttendanceSession = (sessionId) =>
  apiFetch(`/api/attendance/sessions/${encodeURIComponent(String(sessionId || ""))}`);

export const closeAttendanceSession = (sessionId) =>
  apiFetch(`/api/attendance/sessions/${encodeURIComponent(String(sessionId || ""))}/close`, {
    method: "PATCH",
  });

export const upsertAttendanceRecord = (sessionId, payload) =>
  apiFetch(`/api/attendance/sessions/${encodeURIComponent(String(sessionId || ""))}/records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const markAttendanceAbsent = (sessionId, payload = {}) =>
  apiFetch(`/api/attendance/sessions/${encodeURIComponent(String(sessionId || ""))}/mark-absent`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getAttendanceSessionRecords = (sessionId) =>
  apiFetch(`/api/attendance/sessions/${encodeURIComponent(String(sessionId || ""))}/records`);

export const scanAttendance = (sessionId, payload) =>
  apiFetch(`/api/attendance/sessions/${encodeURIComponent(String(sessionId || ""))}/scan`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getMyAttendanceSummary = (params = {}) => {
  const search = new URLSearchParams();
  if (params.academic_year_label) search.set("academic_year_label", String(params.academic_year_label));
  if (params.semester) search.set("semester", String(params.semester));
  return apiFetch(`/api/attendance/me${search.toString() ? `?${search.toString()}` : ""}`);
};

export const getMyAttendanceByCourse = (offeringId) =>
  apiFetch(`/api/attendance/me/by-course/${encodeURIComponent(String(offeringId || ""))}`);
