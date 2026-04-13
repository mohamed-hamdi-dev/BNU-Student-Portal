import React, { useEffect, useState, useContext } from "react";
import { Bell } from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import { apiFetch } from "../services/api";

export default function NotificationBell() {
    const { currentUser } = useContext(AuthContext);
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!currentUser) return;
        const fetchNotifs = async () => {
            try {
                const res = await apiFetch("/api/academic-core/notifications/my");
                if (Array.isArray(res)) setNotifications(res);
            } catch (ignore) {}
        };
        fetchNotifs();
        const interval = setInterval(fetchNotifs, 15000);
        return () => clearInterval(interval);
    }, [currentUser]);

    const markAsRead = async (id) => {
        try {
            await apiFetch(`/api/academic-core/notifications/${id}/read`, { method: "PATCH" });
            setNotifications((prev) => prev.filter((n) => n.id !== id));
        } catch (ignore) {}
    };

    if (!currentUser || currentUser.role === "student") return null;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-slate-600 hover:text-[#05ADCF] transition-colors rounded-full hover:bg-slate-100"
            >
                <Bell size={24} />
                {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                        {notifications.length}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-80 rounded-xl bg-white p-4 shadow-xl border border-slate-100 z-50">
                    <h3 className="text-sm font-bold text-slate-800 mb-3 border-b pb-2">الإشعارات</h3>
                    {notifications.length === 0 ? (
                        <p className="text-center text-sm text-slate-500 py-4">لا توجد إشعارات جديدة</p>
                    ) : (
                        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                            {notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className="rounded-lg bg-slate-50 p-3 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-100"
                                    onClick={() => markAsRead(n.id)}
                                >
                                    <div className="text-xs font-bold text-[#05ADCF] mb-1">{n.title}</div>
                                    <div className="text-xs text-slate-600 font-medium leading-relaxed">{n.message}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
