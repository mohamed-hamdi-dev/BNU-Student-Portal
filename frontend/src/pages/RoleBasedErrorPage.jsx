import React from "react";
import { useNavigate } from "react-router-dom";

export default function RoleBasedErrorPage() {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6" dir="rtl">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center max-w-md shadow-sm">
                <h1 className="text-xl font-black text-gray-800 mb-2">غير مصرح</h1>
                <p className="text-sm text-gray-500 mb-6">هذه الصفحة غير متاحة لدور حسابك الحالي.</p>
                <button onClick={() => navigate("/")} className="rounded-xl bg-[#05ADCF] px-5 py-2 text-white font-bold">
                    الرجوع للرئيسية
                </button>
            </div>
        </div>
    );
}
