import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";
import { AuthContext } from "./AuthContext.jsx";

const LOCAL_THEME_KEY = "theme_preference";
const VALID_THEMES = new Set(["light", "dark", "system"]);

export const ThemeContext = createContext({
  themePreference: "system",
  resolvedTheme: "light",
  isDarkMode: false,
  setThemePreference: () => {},
  toggleDarkMode: () => {},
});

const normalizeTheme = (value) => {
  const next = String(value || "").trim().toLowerCase();
  return VALID_THEMES.has(next) ? next : "system";
};

const getSystemTheme = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export default function ThemeContextProvider({ children }) {
  const { currentUser, setCurrentUser } = useContext(AuthContext);
  const [themePreference, setThemePreferenceState] = useState(() => normalizeTheme(localStorage.getItem(LOCAL_THEME_KEY) || "system"));
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  const resolvedTheme = themePreference === "system" ? systemTheme : themePreference;
  const isDarkMode = resolvedTheme === "dark";

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event) => setSystemTheme(event.matches ? "dark" : "light");
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }
    media.addListener(handler);
    return () => media.removeListener(handler);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolvedTheme);
    root.classList.toggle("dark", isDarkMode);
  }, [isDarkMode, resolvedTheme]);

  useEffect(() => {
    localStorage.setItem(LOCAL_THEME_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (!currentUser) return;
    const fromUser = normalizeTheme(currentUser.themePreference || currentUser.theme_preference);
    if (fromUser && fromUser !== "system") {
      setThemePreferenceState(fromUser);
      return;
    }
    let mounted = true;
    apiFetch("/api/users/me/preferences")
      .then((data) => {
        if (!mounted || !data) return;
        const next = normalizeTheme(data.theme_preference);
        const avatarSize = Number(data.avatar_size_px || 48) || 48;
        setThemePreferenceState(next);
        const savedRaw = localStorage.getItem("loggedUser");
        if (!savedRaw) return;
        const saved = JSON.parse(savedRaw);
        const patched = { ...saved, themePreference: next, theme_preference: next, avatarSizePx: avatarSize, avatar_size_px: avatarSize };
        localStorage.setItem("loggedUser", JSON.stringify(patched));
        window.dispatchEvent(new Event("loggedUserUpdated"));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [currentUser]);

  const persistTheme = useCallback(
    async (nextTheme) => {
      if (!currentUser) return;
      try {
        await apiFetch("/api/users/me/preferences", {
          method: "PUT",
          body: JSON.stringify({ theme_preference: nextTheme }),
        });
      } catch {
        return;
      }
      const savedRaw = localStorage.getItem("loggedUser");
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        const patched = { ...saved, themePreference: nextTheme, theme_preference: nextTheme };
        localStorage.setItem("loggedUser", JSON.stringify(patched));
        window.dispatchEvent(new Event("loggedUserUpdated"));
      }
      if (typeof setCurrentUser === "function") {
        setCurrentUser((prev) => (prev ? { ...prev, themePreference: nextTheme, theme_preference: nextTheme } : prev));
      }
    },
    [currentUser, setCurrentUser]
  );

  const setThemePreference = useCallback(
    (value) => {
      const next = normalizeTheme(value);
      setThemePreferenceState(next);
      persistTheme(next);
    },
    [persistTheme]
  );

  const toggleDarkMode = useCallback(() => {
    const next = isDarkMode ? "light" : "dark";
    setThemePreference(next);
  }, [isDarkMode, setThemePreference]);

  const value = useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      isDarkMode,
      setThemePreference,
      toggleDarkMode,
    }),
    [themePreference, resolvedTheme, isDarkMode, setThemePreference, toggleDarkMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
