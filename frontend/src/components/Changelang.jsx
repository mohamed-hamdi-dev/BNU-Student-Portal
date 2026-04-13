import React, { useContext } from "react";
import { TranslateContext } from "../utils/TranslateContext";

const ChangeLang = ({ variant = "default" }) => {
    const { lang, handleChangeLang } = useContext(TranslateContext);
    const normalizedLang = String(lang || "").toLowerCase().startsWith("ar") ? "ar" : "en";
    const isNavbar = variant === "navbar" || variant === "admin-navbar";
    const isArabicActive = normalizedLang === "ar";
    const isEnglishActive = normalizedLang === "en";

    if (isNavbar) {
        return (
            <div
                dir="ltr"
                className="relative flex h-[1.95em] w-[5.1em] items-center rounded-full border border-sky-100 bg-white p-[0.16em] shadow-[0_8px_20px_rgba(34,199,242,0.12)] transition-all duration-300"
            >
                <div
                    className="pointer-events-none absolute top-1/2 h-[1.5em] w-[2.42em] -translate-y-1/2 rounded-full bg-gradient-to-r from-[#05ADCF] to-[#22C7F2] shadow-[0_8px_18px_rgba(34,199,242,0.34)] transition-all duration-300"
                    style={{
                        left: isArabicActive ? "0.16em" : "calc(100% - 0.16em - 2.42em)",
                    }}
                />
                <button
                    type="button"
                    onClick={() => handleChangeLang("ar")}
                    disabled={isArabicActive}
                    className={`relative z-10 inline-grid h-full w-1/2 place-items-center rounded-full text-[0.88em] font-semibold transition-colors duration-300 ${
                        isArabicActive
                            ? "cursor-default text-white"
                            : "cursor-pointer text-[#6b7b93] hover:text-[#1f334b]"
                    }`}
                >
                    AR
                </button>
                <button
                    type="button"
                    onClick={() => handleChangeLang("en")}
                    disabled={!isArabicActive}
                    className={`relative z-10 inline-grid h-full w-1/2 place-items-center rounded-full text-[0.88em] font-semibold transition-colors duration-300 ${
                        !isArabicActive
                            ? "cursor-default text-white"
                            : "cursor-pointer text-[#6b7b93] hover:text-[#1f334b]"
                    }`}
                >
                    EN
                </button>
            </div>
        );
    }

    const outerMarginTop = "mt-4";
    const knobTop = "top-1/2";
    const wrapWidth = isNavbar ? "w-[7.2em]" : "w-[5.8em]";
    const wrapHeight = isNavbar ? "h-[2.45em]" : "h-[2em]";
    const knobWidth = isNavbar ? "w-[3.35em]" : "w-[2.65em]";
    const knobHeight = isNavbar ? "h-[2.02em]" : "h-[1.54em]";
    const knobLeft = "left-[0.22em]";
    const btnWidth = isNavbar ? "w-[3.35em]" : "w-[2.65em]";
    const knobTranslate = isEnglishActive
        ? (isNavbar ? "translateX(3.4em)" : "translateX(2.74em)")
        : "translateX(0)";

    return (
        <div
            dir="ltr"
            className={`change-lang relative ${outerMarginTop} ${wrapHeight} ${wrapWidth} rounded-full border border-[#d7e2ef] bg-white p-[0.2em] overflow-hidden shadow-[0_10px_22px_rgba(34,199,242,0.14)] transition-all duration-500`}>
            <div
                className={`pointer-events-none absolute ${knobTop} -translate-y-1/2 ${knobHeight} ${knobWidth} rounded-full border border-cyan-50/85 bg-gradient-to-tr from-[#05ADCF] to-[#22C7F2] shadow-[0_6px_16px_rgba(34,199,242,0.35)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${knobLeft}`}
                style={knobTranslate ? { transform: `translateY(-50%) ${knobTranslate}` } : undefined}
            />
            <div className="relative z-10 flex h-full items-center gap-[0.08em]">
            <button
                type="button"
                onClick={() => handleChangeLang("ar")}
                disabled={isArabicActive}
                className={`inline-grid h-full ${btnWidth} shrink-0 place-items-center rounded-full text-center text-[1.12em] leading-none font-bold transition-colors duration-300 ${
                    isArabicActive
                        ? "text-white cursor-default"
                        : "text-[#44506b] hover:text-[#1f334b] cursor-pointer"
                }`}>
                <span className="block translate-x-[0.06em] -translate-y-[0.02em] leading-none">AR</span>
            </button>

            <button
                type="button"
                onClick={() => handleChangeLang("en")}
                disabled={isEnglishActive}
                className={`inline-grid h-full ${btnWidth} shrink-0 place-items-center rounded-full text-center text-[1.12em] leading-none font-bold transition-colors duration-300 ${
                    isEnglishActive
                        ? "text-white cursor-default"
                        : "text-[#44506b] hover:text-[#1f334b] cursor-pointer"
                }`}>
                <span className="block leading-none">EN</span>
            </button>
            </div>
        </div>
    );
};

export default ChangeLang;
