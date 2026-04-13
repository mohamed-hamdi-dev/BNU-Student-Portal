// Centralized API Client for FastAPI Backend
const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function resolveApiBase() {
  // Prefer same-origin /api when frontend is served over HTTPS but env points to HTTP.
  if (!RAW_API_BASE) return "";
  try {
    const parsed = new URL(RAW_API_BASE);
    const pageProtocol = typeof window !== "undefined" ? window.location.protocol : "";
    if (pageProtocol === "https:" && parsed.protocol === "http:") {
      return "";
    }
    return RAW_API_BASE;
  } catch {
    // If it's already a relative base, keep it.
    return RAW_API_BASE;
  }
}

const API_BASE = resolveApiBase();
const CHAT_CACHE_KEYS = ["campusAssistantChats", "campusAssistantActiveChat"];

function withLoopbackFallback(url) {
  const urls = [url];

  if (url.includes("localhost")) {
    urls.push(url.replace("localhost", "127.0.0.1"));
  } else if (url.includes("127.0.0.1")) {
    urls.push(url.replace("127.0.0.1", "localhost"));
  }

  // If frontend is opened via LAN IP (e.g. 192.168.x.x), localhost APIs won't be reachable.
  try {
    const base = new URL(url);
    const frontendHost = window?.location?.hostname;
    const isLoopbackBase = base.hostname === "127.0.0.1" || base.hostname === "localhost";
    const isFrontendRemote = frontendHost && frontendHost !== "127.0.0.1" && frontendHost !== "localhost";
    if (isLoopbackBase && isFrontendRemote) {
      const remoteUrl = `${base.protocol}//${frontendHost}:${base.port}${base.pathname}`;
      urls.push(remoteUrl);
    }
  } catch {
    // ignore malformed URL and keep defaults
  }

  try {
    const parsed = new URL(url);
    const isLoopbackHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (isLoopbackHost) {
      const swappedProtocol = parsed.protocol === "https:" ? "http:" : parsed.protocol === "http:" ? "https:" : "";
      if (swappedProtocol) {
        urls.push(`${swappedProtocol}//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`);
      }
    }
  } catch {
    // ignore malformed URL and keep defaults
  }

  return [...new Set(urls)];
}

function getToken() {
  return localStorage.getItem("access_token");
}

function clearClientSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("loggedUser");
  CHAT_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
}

function normalizeApiErrorDetail(detail, status) {
  if (Array.isArray(detail)) {
    const lines = detail
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const field = Array.isArray(item.loc) ? item.loc.slice(1).join(".") : "";
        const msg = String(item.msg || "").trim();
        if (!msg) return "";
        return field ? `${field}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (lines.length) return lines.join(" | ");
  }
  if (detail && typeof detail === "object") {
    const message = String(detail.message || "").trim();
    if (message) return message;
  }
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  return `Request failed: ${status}`;
}

function normalizeNetworkErrorMessage(path, err) {
  const raw = String(err?.message || "").trim();
  const target = String(path || "").trim() || "/";
  if (!raw) return `تعذر الوصول إلى الخادم (${target}).`;
  const lowered = raw.toLowerCase();
  if (
    lowered.includes("failed to fetch")
    || lowered.includes("networkerror")
    || lowered.includes("network error")
    || lowered.includes("load failed")
  ) {
    return `تعذر الوصول إلى الخادم (${target}). تأكد أن الـ backend يعمل وأن عنوان الـ API والبروتوكول متطابقان.`;
  }
  return raw;
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const urls = withLoopbackFallback(`${API_BASE}${path}`);
  let res;
  let networkError;
  const isFormDataBody = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const defaultHeaders = {
    ...(isFormDataBody ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  for (const url of urls) {
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...(options.headers || {}),
        },
      });
      networkError = undefined;
      break;
    } catch (err) {
      networkError = err;
    }
  }

  if (!res) {
    throw new Error(normalizeNetworkErrorMessage(path, networkError));
  }

  if (res.status === 401 && path !== "/api/auth/login") {
    // Token expired or invalid
    clearClientSession();
    window.location.replace("/");
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = normalizeApiErrorDetail(err.detail, res.status);
    if (res.status === 403 && detail.toLowerCase().includes("access denied")) {
      throw new Error("ليس لديك صلاحية للدخول");
    }
    const apiError = new Error(detail);
    apiError.status = res.status;
    apiError.detail = err?.detail;
    apiError.body = err;
    throw apiError;
  }

  return res.status === 204 ? null : res.json();
}

export async function apiFetchPublic(path, options = {}) {
  const urls = withLoopbackFallback(`${API_BASE}${path}`);
  let res;
  let networkError;
  const isFormDataBody = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const defaultHeaders = {
    ...(isFormDataBody ? {} : { "Content-Type": "application/json" }),
  };

  for (const url of urls) {
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...(options.headers || {}),
        },
      });
      networkError = undefined;
      break;
    } catch (err) {
      networkError = err;
    }
  }

  if (!res) {
    throw new Error(normalizeNetworkErrorMessage(path, networkError));
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = normalizeApiErrorDetail(err.detail, res.status);
    const apiError = new Error(detail);
    apiError.status = res.status;
    apiError.detail = err?.detail;
    apiError.body = err;
    throw apiError;
  }

  return res.status === 204 ? null : res.json();
}
