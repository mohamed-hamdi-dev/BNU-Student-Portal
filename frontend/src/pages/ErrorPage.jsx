import React, { useState } from "react";

// مكون أيقونة SVG مخصص لإعطاء مظهر عصري بدلاً من المكتبات الخارجية
const ErrorIllustration = () => (
    <svg width="250" height="250" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-bounce-slow">
        <circle cx="100" cy="100" r="90" fill="#E0F7FA" />
        <path d="M100 60V110" stroke="#05ADCF" strokeWidth="12" strokeLinecap="round" />
        <circle cx="100" cy="140" r="8" fill="#05ADCF" />
        <path d="M50 160C70 140 130 140 150 160" stroke="#05ADCF" strokeWidth="8" strokeLinecap="round" opacity="0.3" />
    </svg>
);

export default function App() {
    const [isHovered, setIsHovered] = useState(false);

    // ستايل إضافي للحركة اللطيفة
    const customStyles = `
    @keyframes float {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-20px); }
      100% { transform: translateY(0px); }
    }
    .animate-float {
      animation: float 4s ease-in-out infinite;
    }
    .animate-bounce-slow {
      animation: bounce 3s infinite;
    }
  `;

    return (
        <div className="min-h-screen pt-20 bg-slate-50 flex flex-col items-center justify-center text-center px-6 font-sans box-border">
            <style>{customStyles}</style>

            {/* Container للجزء العلوي */}
            <div className="relative mb-8 animate-float">
                <div className="absolute inset-0 bg-[#05ADCF] blur-[80px] opacity-10 rounded-full"></div>
                <ErrorIllustration />
            </div>

            {/* النص الأساسي */}
            <div className="max-w-md z-10">
                <h1 className="text-7xl font-black text-gray-900 mb-4 tracking-tighter">404</h1>
                <h2 className="text-2xl font-bold text-gray-800 mb-3">عذراً، الصفحة غير موجودة</h2>
                <p className="text-gray-500 mb-10 leading-relaxed">يبدو أنك سلكت طريقاً خاطئاً. الصفحة التي تبحث عنها ربما تم نقلها أو حذفها نهائياً.</p>

                {/* الزر الرئيسي */}
                <button
                    onClick={() => (window.location.href = "/dashboardstudent")}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    className={`
            relative inline-flex items-center justify-center px-8 py-4 
            bg-[#05ADCF] text-white font-bold text-lg rounded-2xl 
            shadow-[0_10px_20px_-10px_rgba(5,173,207,0.5)]
            transition-all duration-300 ease-out overflow-hidden
            ${isHovered ? "scale-105 shadow-[0_15px_30px_-10px_rgba(5,173,207,0.7)]" : "scale-100"}
          `}>
                    <span className="relative z-10 flex items-center gap-2">
                        <span>العودة للرئيسية</span>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-5 w-5 transition-transform duration-300 ${isHovered ? "translate-x-1" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </span>

                    {/* تأثير اللمعان عند التمرير */}
                    <div
                        className={`
            absolute inset-0 bg-white/10 transition-transform duration-500
            ${isHovered ? "translate-x-0" : "-translate-x-full"}
          `}
                        style={{ transform: isHovered ? "skewX(-20deg) translateX(100%)" : "skewX(-20deg) translateX(-100%)" }}></div>
                </button>
            </div>

            {/* لمسة جمالية في الخلفية */}
            <div className="fixed bottom-0 left-0 w-full overflow-hidden leading-[0] rotate-180 opacity-5">
                <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="relative block w-[200%] h-[150px]">
                    <path
                        d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
                        fill="#05ADCF"></path>
                </svg>
            </div>
        </div>
    );
}
