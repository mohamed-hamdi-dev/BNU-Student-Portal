import React from "react";
import { useNavigate } from "react-router-dom";

export default function AdminErrorPage() {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6" dir="rtl">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center max-w-md shadow-sm">
                <h1 className="text-xl font-black text-gray-800 mb-2">خطأ في لوحة الأدمن</h1>
                <p className="text-sm text-gray-500 mb-6">تعذر فتح لوحة الأدمن حالياً، حاول مرة أخرى.</p>
                <button onClick={() => navigate("/HomeDashboard")} className="rounded-xl bg-[#05ADCF] px-5 py-2 text-white font-bold">
                    العودة للوحة الأدمن
                </button>
            </div>
        </div>
    );
}
