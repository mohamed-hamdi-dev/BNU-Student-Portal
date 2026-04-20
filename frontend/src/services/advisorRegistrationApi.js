import { apiFetch } from "./api";

export const createAdvisorRequest = (payload) =>
  apiFetch("/api/academic-core/registration/advisor-request", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const submitStudentRegistration = (payload) =>
  apiFetch("/api/academic-core/registration/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listMyAdvisorRequests = (params = {}) => {
  const search = new URLSearchParams();
  if (params.academic_year_label) search.set("academic_year_label", String(params.academic_year_label));
  if (params.semester) search.set("semester", String(params.semester));
  const qs = search.toString();
  return apiFetch(`/api/academic-core/registration/requests/my${qs ? `?${qs}` : ""}`);
};

export const listAdvisorRequests = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return apiFetch(`/api/academic-core/registration/requests${qs ? `?${qs}` : ""}`);
};

export const advisorDecisionOnRequest = (requestId, payload) =>
  apiFetch(`/api/academic-core/registration/requests/${requestId}/advisor-decision`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const advisorRegisterRequest = (requestId) =>
  apiFetch(`/api/academic-core/registration/requests/${requestId}/advisor-register`, {
    method: "POST",
  });

export const updateStudentAcademicMetrics = (studentUserId, payload) =>
  apiFetch(`/api/academic-core/student-profiles/${studentUserId}/academic-metrics`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const getStudentProfileByAdvisor = (studentUserId) =>
  apiFetch(`/api/academic-core/student-profiles/${studentUserId}`);

export const exportSectionsReportUrl = (params = {}) => {
  const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:8001";
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  return `${base}/api/academic-core/registration/sections-report.csv${search.toString() ? `?${search.toString()}` : ""}`;
};

export const listDoctorAdvisorOversight = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return apiFetch(`/api/academic-core/registration/doctor-oversight${qs ? `?${qs}` : ""}`);
};

export const listMyAvailableOfferings = (academicYearLabel, semester) => {
  const search = new URLSearchParams();
  search.set("academic_year_label", String(academicYearLabel || ""));
  search.set("semester", String(semester || ""));
  return apiFetch(`/api/academic-core/offerings/me-available?${search.toString()}`);
};

export const listOfferingsForStudent = (studentUserId, academicYearLabel, semester, options = {}) => {
  const search = new URLSearchParams();
  search.set("student_user_id", String(studentUserId || ""));
  search.set("academic_year_label", String(academicYearLabel || ""));
  search.set("semester", String(semester || ""));
  if (options.openOnly) search.set("open_only", "true");
  return apiFetch(`/api/academic-core/offerings/by-student?${search.toString()}`);
};

export const advisorManageRegistrationForStudent = (payload) =>
  apiFetch("/api/academic-core/registration/advisor-manage", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listAdvisorStudents = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return apiFetch(`/api/academic-core/registration/advisor-students${qs ? `?${qs}` : ""}`);
};

export const listRegistrationWindows = () => apiFetch("/api/academic-core/registration-windows");

export const createRegistrationWindow = (payload) =>
  apiFetch("/api/academic-core/registration-windows", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteRegistrationWindow = (windowId) =>
  apiFetch(`/api/academic-core/registration-windows/${windowId}`, {
    method: "DELETE",
  });

export const updateRegistrationWindow = (windowId, payload) =>
  apiFetch(`/api/academic-core/registration-windows/${windowId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const patchRegistrationWindowStatus = (windowId, status) =>
  apiFetch(`/api/academic-core/registration-windows/${windowId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const getCurrentRegistrationPeriodStatus = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  return apiFetch(`/api/academic-core/registration/current-period-status?${search.toString()}`);
};

export const getActiveRegistrationTerm = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return apiFetch(`/api/academic-core/registration/active-term${qs ? `?${qs}` : ""}`);
};

export const getStudentRegistrationByAdvisor = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  return apiFetch(`/api/academic-core/registration/by-student?${search.toString()}`);
};

export const getMyRegistration = (academicYearLabel, semester) => {
  const search = new URLSearchParams();
  search.set("academic_year_label", String(academicYearLabel || ""));
  search.set("semester", String(semester || ""));
  return apiFetch(`/api/academic-core/registration/me?${search.toString()}`);
};

export const deleteMyRegistrationSelection = ({ academic_year_label, semester, course_code, student_id_hint }) => {
  const search = new URLSearchParams();
  search.set("academic_year_label", String(academic_year_label || ""));
  search.set("semester", String(semester || ""));
  search.set("course_code", String(course_code || ""));
  if (student_id_hint !== undefined && student_id_hint !== null && String(student_id_hint).trim()) {
    search.set("student_id_hint", String(student_id_hint).trim());
  }
  return apiFetch(`/api/academic-core/registration/my-selection?${search.toString()}`, {
    method: "DELETE",
  });
};

export const searchAdvisorStudents = (q) => {
  const search = new URLSearchParams();
  if (q) search.set("q", String(q));
  search.set("limit", "20");
  return apiFetch(`/api/academic-core/registration/advisor-students?${search.toString()}`);
};

export const listStudentRegistrationTermsByAdvisor = (studentUserId) => {
  const search = new URLSearchParams();
  search.set("student_user_id", String(studentUserId || ""));
  return apiFetch(`/api/academic-core/registration/student-terms?${search.toString()}`);
};

export const getMyStudentProfile = () => {
  return apiFetch(`/api/academic-core/student-profiles/me`);
};
