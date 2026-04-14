import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../services/api";
import { normalizeAcademicYearValue } from "../utils/academicData";
import { getMyTrackSelectionStatus } from "../services/trackSelectionApi";
import { getMyApprovedProfilePhoto } from "../services/profilePhotoApi";

export const AuthContext = createContext(null);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_WARNING_MS = 60 * 1000;
const CHAT_CACHE_KEYS = [
  "campusAssistantChats",
  "campusAssistantActiveChat",
];

const withToken = (url, token) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const t = String(token || "").trim();
  if (!t || raw.includes("token=")) return raw;
  const join = raw.includes("?") ? "&" : "?";
  return `${raw}${join}token=${encodeURIComponent(t)}`;
};

const normalizeProfilePhotoUrl = (url, token = "") => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return withToken(raw, token);
  }
  if (raw.startsWith("/api/")) {
    const apiBase = String(import.meta.env.VITE_API_BASE_URL || "").trim();
    if (apiBase) return withToken(`${apiBase}${raw}`, token);
  }
  return withToken(raw, token);
};

const normalizeTextKey = (value) => String(value || "").trim().toLowerCase();
const compactTextKey = (value) => normalizeTextKey(value).replace(/\s+/g, "");
const isGeneralMajor = (value) => {
  const key = compactTextKey(value);
  return ["", "general", "عام", "بدونتخصص", "none", "-", "null"].includes(key);
};

const normalizeUser = (rawUser) => {
  if (!rawUser) return null;

  const rawMajor = rawUser.major || "";
  const rawSpecialization =
    rawUser.specialization ||
    rawUser.trackName ||
    rawUser.track ||
    rawUser.trackId ||
    rawUser.track_id ||
    "";
  const effectiveSpecialization = String(rawSpecialization || "").trim();
  const effectiveMajor = effectiveSpecialization && isGeneralMajor(rawMajor) ? effectiveSpecialization : rawMajor || "علوم الحاسب";

  const token = String(localStorage.getItem("access_token") || "").trim();

  return {
    ...rawUser,
    id: rawUser.id || rawUser.userId || rawUser.username || "",
    universityName: rawUser.universityName || rawUser.full_name || rawUser.fullName || rawUser.name || rawUser.username || "User",
    name: rawUser.displayName || rawUser.display_name || rawUser.name || rawUser.full_name || rawUser.fullName || rawUser.username || "User",
    displayName: rawUser.displayName || rawUser.display_name || rawUser.name || rawUser.full_name || rawUser.fullName || rawUser.username || "User",
    role: rawUser.role || "student",
    username: rawUser.username || rawUser.id || "",
    universityEmail: rawUser.universityEmail || rawUser.email || "",
    recoveryEmail: rawUser.recoveryEmail || rawUser.recovery_email || rawUser.email || "",
    phoneNumber: rawUser.phoneNumber || rawUser.phone_number || "",
    nationalId: rawUser.nationalId || rawUser.national_id || "",
    birthPlace: rawUser.birthPlace || rawUser.birth_place || "",
    nationality: rawUser.nationality || "",
    gender: rawUser.gender || "",
    academicYear: normalizeAcademicYearValue(rawUser.academicYear || rawUser.year || rawUser.level, "1"),
    maxHours: Number(rawUser.maxHours || 18),
    major: effectiveMajor,
    specialization: effectiveSpecialization || rawUser.specialization || "",
    mustChangePassword: Boolean(rawUser.mustChangePassword ?? rawUser.must_change_password),
    passwordExpired: Boolean(rawUser.passwordExpired ?? rawUser.password_expired),
    passwordExpiresAt: rawUser.passwordExpiresAt ?? rawUser.password_expires_at ?? null,
    passwordPolicyDays: Number(rawUser.passwordPolicyDays ?? rawUser.password_policy_days ?? 0),
    themePreference: rawUser.themePreference || rawUser.theme_preference || "system",
    avatarSizePx: Number(rawUser.avatarSizePx ?? rawUser.avatar_size_px ?? 48) || 48,
    avatarObjectX: Math.max(0, Math.min(100, Number(rawUser.avatarObjectX ?? rawUser.avatar_object_x ?? 50) || 50)),
    avatarObjectY: Math.max(0, Math.min(100, Number(rawUser.avatarObjectY ?? rawUser.avatar_object_y ?? 50) || 50)),
    profilePhotoUrl: normalizeProfilePhotoUrl(rawUser.profilePhotoUrl || rawUser.profile_photo_url || "", token),
  };
};

const clearSessionStorage = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("loggedUser");
  CHAT_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
};

export default function AuthContextProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem("loggedUser");
    return normalizeUser(saved ? JSON.parse(saved) : null);
  });
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(Math.ceil(IDLE_WARNING_MS / 1000));
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const idleDeadlineRef = useRef(0);
  const lastActivityRef = useRef(0);

  const clearIdleTimers = useCallback(() => {
    if (warningTimerRef.current) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearIdleTimers();
    clearSessionStorage();
    setShowIdleWarning(false);
    setWarningSecondsLeft(Math.ceil(IDLE_WARNING_MS / 1000));
    idleDeadlineRef.current = 0;
    setCurrentUser(null);
  }, [clearIdleTimers]);

  const armIdleTimers = useCallback(() => {
    clearIdleTimers();
    if (!localStorage.getItem("access_token")) return;

    const now = Date.now();
    idleDeadlineRef.current = now + IDLE_TIMEOUT_MS;
    setShowIdleWarning(false);
    setWarningSecondsLeft(Math.ceil(IDLE_WARNING_MS / 1000));

    warningTimerRef.current = window.setTimeout(() => {
      setShowIdleWarning(true);
      setWarningSecondsLeft(Math.ceil(IDLE_WARNING_MS / 1000));
      countdownTimerRef.current = window.setInterval(() => {
        const remainingMs = Math.max(0, idleDeadlineRef.current - Date.now());
        setWarningSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
      }, 1000);
    }, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);

    logoutTimerRef.current = window.setTimeout(() => {
      logout();
      window.location.replace("/");
    }, IDLE_TIMEOUT_MS);
  }, [clearIdleTimers, logout]);

  const login = useCallback(
    async (username, password) => {
      try {
        const data = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });

        localStorage.setItem("access_token", data.access_token);
        let normalized = normalizeUser(data.user);
        try {
          const contactSettings = await apiFetch("/api/users/me/contact-settings");
          if (contactSettings) {
            normalized = normalizeUser({
              ...normalized,
              display_name: contactSettings.display_name || normalized.displayName || normalized.name,
              displayName: contactSettings.display_name || normalized.displayName || normalized.name,
              recovery_email: contactSettings.recovery_email || normalized.recoveryEmail || normalized.universityEmail,
              phone_number: contactSettings.phone_number || normalized.phoneNumber || "",
            });
          }
        } catch {
          // Contact settings sync is optional during login.
        }
        try {
          const approvedPhoto = await getMyApprovedProfilePhoto();
          if (approvedPhoto?.fileUrl) {
            normalized = normalizeUser({
              ...normalized,
              profilePhotoUrl: approvedPhoto.fileUrl,
            });
          }
        } catch {
          // Photo sync is optional during login.
        }
        if (String(normalized?.role || "").toLowerCase() === "student") {
          try {
            const trackStatus = await getMyTrackSelectionStatus();
            const selectedTrackId = trackStatus?.selectedTrackId || "";
            const selectedTrackName = trackStatus?.selectedTrackName || selectedTrackId || "";
            normalized = {
              ...normalized,
              trackId: selectedTrackId,
              track: selectedTrackId,
              specialization: selectedTrackName,
              major: selectedTrackName || normalized.major,
              trackLocked: Boolean(selectedTrackId),
            };
          } catch {
            // Track selection sync is optional during login.
          }
        }

        localStorage.setItem("loggedUser", JSON.stringify(normalized));
        setCurrentUser(normalized);
        armIdleTimers();
        return { success: true };
      } catch (error) {
        console.error("Login Error:", error);
        return { success: false, error: error.message };
      }
    },
    [armIdleTimers]
  );

  useEffect(() => {
    const onStorageChange = (event) => {
      if (event.key === "loggedUser") {
        const nextUser = event.newValue ? JSON.parse(event.newValue) : null;
        setCurrentUser(normalizeUser(nextUser));
      } else if (event.key === "access_token" && !event.newValue) {
        clearIdleTimers();
        setShowIdleWarning(false);
        setCurrentUser(null);
      }
    };

    const onLoggedUserUpdated = () => {
      const saved = localStorage.getItem("loggedUser");
      const nextUser = saved ? JSON.parse(saved) : null;
      setCurrentUser(normalizeUser(nextUser));
    };

    window.addEventListener("storage", onStorageChange);
    window.addEventListener("loggedUserUpdated", onLoggedUserUpdated);
    return () => {
      window.removeEventListener("storage", onStorageChange);
      window.removeEventListener("loggedUserUpdated", onLoggedUserUpdated);
    };
  }, [clearIdleTimers]);

  useEffect(() => {
    if (!currentUser || !localStorage.getItem("access_token")) {
      clearIdleTimers();
      setShowIdleWarning(false);
      return undefined;
    }

    armIdleTimers();
    lastActivityRef.current = Date.now();

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < 5000) return;
      lastActivityRef.current = now;
      armIdleTimers();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleActivity();
      }
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, handleActivity, true));
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, handleActivity, true));
      document.removeEventListener("visibilitychange", handleVisibility);
      clearIdleTimers();
    };
  }, [armIdleTimers, clearIdleTimers, currentUser]);

  const value = useMemo(
    () => ({
      currentUser,
      role: currentUser?.role || null,
      login,
      logout,
      setCurrentUser,
      showIdleWarning,
      warningSecondsLeft,
      refreshSession: armIdleTimers,
    }),
    [armIdleTimers, currentUser, login, logout, showIdleWarning, warningSecondsLeft]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showIdleWarning ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4" dir="rtl">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-right shadow-2xl">
            <h2 className="text-lg font-black text-slate-900">الجلسة هتنتهي قريب</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              لسه فاضل حوالي {warningSecondsLeft} ثانية قبل تسجيل الخروج التلقائي بسبب عدم النشاط.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={logout}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                تسجيل خروج
              </button>
              <button
                type="button"
                onClick={armIdleTimers}
                className="rounded-2xl bg-[#05ADCF] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
              >
                استمرار الجلسة
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}
