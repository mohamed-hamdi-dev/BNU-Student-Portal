import React from "react";
import { Outlet } from "react-router-dom";

export default function AdminQuizLayout() {
    return (
        <div className="min-h-screen bg-gray-50" dir="rtl">
            <Outlet />
        </div>
    );
}
