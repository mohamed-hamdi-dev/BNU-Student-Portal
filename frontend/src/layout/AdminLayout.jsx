import React from "react";
import { Outlet } from "react-router-dom";

export default function AdminLayout() {
    return (
        <div className="min-h-screen bg-[#F8FAFC]" dir="rtl">
            <Outlet />
        </div>
    );
}
