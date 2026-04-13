import React from "react";
import { BarChart2, Database, Home, MessageCircle, MessageSquare, PlusSquare, Settings } from "lucide-react";
import { SidebarItem } from "./shared";

const NAV_ITEMS = [
    { key: "home", label: "Home", icon: Home },
    { key: "summary", label: "Summary", icon: BarChart2 },
    { key: "create", label: "Create", icon: PlusSquare },
    { key: "storage", label: "Storage", icon: Database },
    { key: "chat", label: "Live Chat", icon: MessageCircle },
    { key: "feedback", label: "Feedback", icon: MessageSquare },
];

export default function DashboardSidebar({ activeTab, onChange, isRtl = false }) {
    return (
        <aside
            className={`z-10 flex h-full w-72 flex-col bg-gradient-to-b from-[#2f5bea] via-[#3183ef] to-[#22c1d6] p-5 text-white shadow-2xl ${
                isRtl ? "border-l border-white/20" : "border-r border-white/20"
            }`}>
            <div className="mb-6 rounded-3xl bg-white/15 p-5 backdrop-blur-sm">
                <h1 className={`mb-4 text-lg font-black tracking-wider ${isRtl ? "text-right" : ""}`}>BNU CHATBOT</h1>
                <div className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-white/70 bg-white/20 text-xl font-black">MS</div>
                    <div className={isRtl ? "text-right" : ""}>
                        <h2 className="text-sm font-extrabold">Mark Sherif</h2>
                        <button onClick={() => onChange("settings")} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-white/90 transition hover:text-white">
                            <Settings className="h-3.5 w-3.5" />
                            Settings
                        </button>
                    </div>
                </div>
            </div>

            <nav className="space-y-2">
                {NAV_ITEMS.map((item) => (
                    <SidebarItem key={item.key} icon={item.icon} label={item.label} active={activeTab === item.key} onClick={() => onChange(item.key)} rtl={isRtl} />
                ))}
            </nav>
        </aside>
    );
}
