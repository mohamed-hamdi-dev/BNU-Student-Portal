import { apiFetch } from "./api";

export const listAcademicCoreColleges = () => apiFetch("/api/academic-core/colleges");

export const createAcademicCoreCollege = (payload) =>
  apiFetch("/api/academic-core/colleges", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const bootstrapAcademicCoreColleges = () =>
  apiFetch("/api/academic-core/bootstrap/default-colleges", {
    method: "POST",
  });

export const getCollegeCreditPolicies = (collegeId) =>
  apiFetch(`/api/academic-core/colleges/${collegeId}/credit-policies`);

export const replaceCollegeCreditPolicies = (collegeId, tiers) =>
  apiFetch(`/api/academic-core/colleges/${collegeId}/credit-policies`, {
    method: "PUT",
    body: JSON.stringify({ tiers }),
  });

export const getMyRegistrationCreditPolicy = () =>
  apiFetch("/api/academic-core/registration/credit-policy/me");

export const listAssessmentTemplates = (params = {}) => {
  const search = new URLSearchParams();
  if (params.college_id) search.set("college_id", String(params.college_id));
  if (params.track_id) search.set("track_id", String(params.track_id));
  if (params.study_year) search.set("study_year", String(params.study_year));
  if (params.semester) search.set("semester", String(params.semester));
  const qs = search.toString();
  return apiFetch(`/api/academic-core/assessment-templates${qs ? `?${qs}` : ""}`);
};

export const listGradingScales = (params = {}) => {
  const search = new URLSearchParams();
  if (params.college_id) search.set("college_id", String(params.college_id));
  const qs = search.toString();
  return apiFetch(`/api/academic-core/grading-scales${qs ? `?${qs}` : ""}`);
};
