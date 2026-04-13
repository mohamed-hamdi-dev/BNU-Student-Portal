import { apiFetch } from "./api";

export const getMyTrackSelectionStatus = () => apiFetch("/api/academic/track-selection/me");

export const selectMyTrack = (trackId) =>
  apiFetch("/api/academic/track-selection/select", {
    method: "POST",
    body: JSON.stringify({ trackId }),
  });

export const submitMyTrackPreferences = (trackIds) =>
  apiFetch("/api/academic/track-selection/preferences", {
    method: "POST",
    body: JSON.stringify({ trackIds }),
  });

export const listTrackSelectionStudents = (params = {}) => {
  const query = new URLSearchParams();
  if (params.college) query.set("college", params.college);
  if (params.status) query.set("status", params.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(`/api/academic/track-selection/admin/students${suffix}`);
};

export const patchTrackCoordinationStatus = (studentId, coordinationStatus) =>
  apiFetch("/api/academic/track-selection/admin/status", {
    method: "PATCH",
    body: JSON.stringify({ studentId, coordinationStatus }),
  });

export const assignFinalTrackForStudent = (studentId, trackId) =>
  apiFetch("/api/academic/track-selection/admin/assign", {
    method: "POST",
    body: JSON.stringify({ studentId, trackId }),
  });

export const assignTracksByGpa = ({ college = null, capacities = {} } = {}) =>
  apiFetch("/api/academic/track-selection/admin/assign-by-gpa", {
    method: "POST",
    body: JSON.stringify({ college, capacities }),
  });
