import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import "./css/Reset.css";

import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import AR_LANG from "./locales/ar/common.json";
import EN_LANG from "./locales/en/common.json";
import AR_ADMIN_LANG from "./locales/ar/admin.json";
import EN_ADMIN_LANG from "./locales/en/admin.json";

import { I18nextProvider } from "react-i18next";
import { TranslateProvider } from "./utils/TranslateContext.jsx";
import CoursesContextProvider from "./context/CoursesContext.jsx";
import SystemContextProvider from "./context/SystemContext.jsx";
import AuthContextProvider from "./context/AuthContext.jsx";
import AcademicContextProvider from "./context/AcademicContext.jsx";
import ThemeContextProvider from "./context/ThemeContext.jsx";
import "leaflet/dist/leaflet.css";

// *** IMPORTANT ***
i18next.use(initReactI18next).init({
  interpolation: {
    escapeValue: false,
  },
  resources: {
    en: { global: EN_LANG, admin: EN_ADMIN_LANG },
    ar: { global: AR_LANG, admin: AR_ADMIN_LANG },
  },
  lng: "ar", // اللغة الافتراضية
  fallbackLng: "ar", // لو في كلمة ناقصة
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <I18nextProvider i18n={i18next}>
      <TranslateProvider>
        <AuthContextProvider>
          <ThemeContextProvider>
            <SystemContextProvider>
              <CoursesContextProvider>
                <AcademicContextProvider>
                  <App />
                </AcademicContextProvider>
              </CoursesContextProvider>
            </SystemContextProvider>
          </ThemeContextProvider>
        </AuthContextProvider>
      </TranslateProvider>
    </I18nextProvider>
  </StrictMode>
);
