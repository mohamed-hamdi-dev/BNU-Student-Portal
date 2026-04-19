import { apiFetch } from "./api";

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8001";

const normalizeApiBase = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("localhost") || value.startsWith("127.0.0.1")) return `http://${value}`;
  return `https://${value}`;
};

const API_BASE = normalizeApiBase(RAW_API_BASE);

export const toAbsoluteFileUrl = (value = "") => {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/api/")) return `${API_BASE}${value}`;
  const normalizedPath = value.startsWith("/") ? value : `/${value}`;
  let base = API_BASE;
  try {
    const parsed = new URL(API_BASE);
    const frontendHost = window?.location?.hostname;
    const isLoopbackBase = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    const isFrontendRemote = frontendHost && frontendHost !== "127.0.0.1" && frontendHost !== "localhost";
    if (isLoopbackBase && isFrontendRemote) {
      base = `${parsed.protocol}//${frontendHost}:${parsed.port}`;
    }
  } catch {
    base = API_BASE;
  }
  return `${base}${normalizedPath}`;
};

const stripTokenParam = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, window.location.origin);
    parsed.searchParams.delete("token");
    const next = parsed.toString();
    if (/^https?:\/\//i.test(raw)) return next;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return raw
      .replace(/([?&])token=[^&#]*(&)?/gi, (_, prefix, suffix) => (prefix === "?" && suffix ? "?" : prefix === "&" && suffix ? "&" : ""))
      .replace(/[?&]$/, "");
  }
};

export const withAccessToken = (value = "", token = "") => {
  const absoluteUrl = toAbsoluteFileUrl(stripTokenParam(value));
  const rawToken = String(token || "").trim();
  if (!absoluteUrl || !rawToken) return absoluteUrl;
  const join = absoluteUrl.includes("?") ? "&" : "?";
  return `${absoluteUrl}${join}token=${encodeURIComponent(rawToken)}`;
};

const normalizePhoto = (item = {}) => ({
  ...item,
  userId: item.userId ?? item.user_id ?? null,
  userName: item.userName ?? item.user_name ?? "",
  username: item.username ?? "",
  studentCode: item.studentCode ?? item.student_code ?? "",
  college: item.college ?? "",
  level: item.level ?? "",
  rejectionReason: item.rejectionReason ?? item.rejection_reason ?? "",
  fileUrl: toAbsoluteFileUrl(item.fileUrl ?? item.file_url ?? ""),
  createdAt: item.createdAt ?? item.created_at ?? null,
  reviewedAt: item.reviewedAt ?? item.reviewed_at ?? null,
  reviewedBy: item.reviewedBy ?? item.reviewed_by ?? null,
  status: item.status ?? "pending_review",
});

export const uploadMyProfilePhoto = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const data = await apiFetch("/api/users/me/profile-photo", {
    method: "POST",
    body: formData,
  });
  return normalizePhoto(data);
};

export const getMyProfilePhoto = async () => {
  const data = await apiFetch("/api/users/me/profile-photo");
  return data ? normalizePhoto(data) : null;
};

export const getMyApprovedProfilePhoto = async () => {
  const data = await apiFetch("/api/users/me/profile-photo/approved");
  return data ? normalizePhoto(data) : null;
};

export const getMyDisplayProfilePhoto = async () => {
  const approved = await getMyApprovedProfilePhoto().catch(() => null);
  if (approved?.fileUrl) return approved;
  const latest = await getMyProfilePhoto().catch(() => null);
  return latest?.fileUrl ? latest : null;
};

export const listPendingProfilePhotos = async () => {
  const data = await apiFetch("/api/users/profile-photos/pending");
  return Array.isArray(data) ? data.map(normalizePhoto) : [];
};

export const approveProfilePhoto = async (photoId) => {
  const data = await apiFetch(`/api/users/profile-photos/${photoId}/approve`, {
    method: "POST",
  });
  return normalizePhoto(data);
};

export const rejectProfilePhoto = async (photoId, reason) => {
  const data = await apiFetch(`/api/users/profile-photos/${photoId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return normalizePhoto(data);
};

export const listProfilePhotosForReview = async (params = {}) => {
  const search = new URLSearchParams();
  if (params.college) search.set("college", String(params.college));
  if (params.level) search.set("level", String(params.level));
  if (params.search) search.set("search", String(params.search));
  if (params.status) search.set("status", String(params.status));
  const data = await apiFetch(`/api/users/profile-photos/review?${search.toString()}`);
  return {
    items: Array.isArray(data?.items) ? data.items.map(normalizePhoto) : [],
    summary: data?.summary || { total_students: 0, with_approved: 0, without_approved: 0 },
  };
};

export const exportProfileCardPack = async (params = {}) => {
  const API_BASE_URL = API_BASE;
  const token = localStorage.getItem("access_token") || "";
  const search = new URLSearchParams();
  search.set("college", String(params.college || ""));
  search.set("level", String(params.level || ""));
  search.set("include_non_approved", String(Boolean(params.includeNonApproved)));
  search.set("include_without_photo", String(Boolean(params.includeWithoutPhoto)));
  if (params.search) search.set("search", String(params.search));
  const url = `${API_BASE_URL}/api/users/profile-photos/export-cards?${search.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const err = await res.json();
      if (err?.detail) {
        if (typeof err.detail === "string") message = err.detail;
        else if (Array.isArray(err.detail)) message = err.detail.map((d) => d?.msg || "").filter(Boolean).join(" | ") || message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const nameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const fileName = nameMatch?.[1] || "card-photos.zip";
  return { blob, fileName };
};

export const buildProfileCardExportUrl = (params = {}) => {
  const API_BASE_URL = API_BASE;
  const token = localStorage.getItem("access_token") || "";
  const search = new URLSearchParams();
  search.set("college", String(params.college || ""));
  search.set("level", String(params.level || ""));
  search.set("include_non_approved", String(Boolean(params.includeNonApproved)));
  search.set("include_without_photo", String(Boolean(params.includeWithoutPhoto)));
  if (params.search) search.set("search", String(params.search));
  if (token) search.set("token", token);
  return `${API_BASE_URL}/api/users/profile-photos/export-cards?${search.toString()}`;
};
