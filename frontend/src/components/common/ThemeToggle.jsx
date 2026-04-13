import React, { useContext } from "react";
import { Moon, Sun } from "lucide-react";
import { ThemeContext } from "../../context/ThemeContext.jsx";

export default function ThemeToggle({ compact = false }) {
  const { isDarkMode, toggleDarkMode } = useContext(ThemeContext);

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleDarkMode}
        aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        title={isDarkMode ? "Light mode" : "Dark mode"}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-100 bg-white text-[#22C7F2] shadow-[0_8px_18px_rgba(34,199,242,0.16)] transition-all duration-300 active:scale-95 hover:border-sky-200 hover:shadow-[0_10px_22px_rgba(34,199,242,0.22)]"
      >
        {isDarkMode ? <Moon size={15} fill="currentColor" strokeWidth={1.8} /> : <Sun size={15} fill="currentColor" strokeWidth={1.8} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleDarkMode}
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative w-40 h-16 rounded-full p-1.5 transition-all duration-500 outline-none group active:scale-95 ${
        isDarkMode
          ? "bg-slate-900 border-2 border-sky-500/30 shadow-[0_0_50px_rgba(56,189,248,0.15)]"
          : "bg-white border-2 border-sky-100 shadow-[0_15px_40px_rgba(0,0,0,0.04)]"
      }`}
    >
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.68,-0.6,0.32,1.6)] z-10 ${
          isDarkMode
            ? "left-[92px] bg-gradient-to-tr from-slate-800 to-slate-700 text-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.35)]"
            : "left-2 bg-gradient-to-tr from-sky-400 to-sky-300 text-white shadow-[0_8px_16px_rgba(56,189,248,0.28)]"
        }`}
      >
        {isDarkMode ? <Moon size={24} fill="currentColor" strokeWidth={1.5} /> : <Sun size={24} fill="currentColor" strokeWidth={1.5} />}
      </div>

      <div className="flex justify-between items-center h-full px-6">
        <Sun size={18} className={`transition-all duration-700 ${!isDarkMode ? "opacity-10 text-sky-500" : "opacity-0 scale-50"}`} />
        <Moon size={18} className={`transition-all duration-700 ${isDarkMode ? "opacity-10 text-sky-400" : "opacity-0 scale-50"}`} />
      </div>
    </button>
  );
}
