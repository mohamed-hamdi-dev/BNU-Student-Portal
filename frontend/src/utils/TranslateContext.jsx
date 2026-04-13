import { createContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const TranslateContext = createContext();

function TranslateProvider({ children }) {
    const { i18n } = useTranslation("global");
    const [lang, setLang] = useState(i18n.resolvedLanguage || i18n.language || "ar");

    useEffect(() => {
        const syncLanguage = (lng) => {
            const next = String(lng || i18n.resolvedLanguage || "ar");
            setLang(next);
            document.documentElement.setAttribute("dir", next === "ar" ? "rtl" : "ltr");
        };
        syncLanguage(i18n.resolvedLanguage || i18n.language || "ar");
        i18n.on("languageChanged", syncLanguage);
        return () => {
            i18n.off("languageChanged", syncLanguage);
        };
    }, [i18n]);

    async function handleChangeLang(newLang) {
        const next = String(newLang || "").toLowerCase();
        if (!next || next === lang) return;
        await i18n.changeLanguage(next);
    }

    return <TranslateContext.Provider value={{ lang, handleChangeLang }}>{children}</TranslateContext.Provider>;
}

export { TranslateContext, TranslateProvider };
