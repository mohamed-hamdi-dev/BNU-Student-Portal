import React, { useState } from "react";
import { Menu, X, LayoutDashboard, Calendar, GraduationCap, Settings, LogOut, Bell } from "lucide-react";
import { NavLink } from "react-router-dom";

const App = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [activeTab, setActiveTab] = useState("dashboard");

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    const menuItems = [
        { id: "dashboard", icon: LayoutDashboard, label: "لوحة التحكم" },
        { id: "schedule", to: "/CourseManagement", icon: Calendar, label: "الجدول الزمني" },
        { id: "grades", to: "/AdminDashboard", icon: GraduationCap, label: "رصد الدرجات" },
        { id: "settings", to: "/settings", icon: Settings, label: "الإعدادات" },
    ];

    return (
        <div className="flex h-screen bg-gray-50 font-sans" dir="rtl">
            {/* Overlay على الموبايل */}
            {isSidebarOpen && <div className="fixed inset-0 bg-black/30 md:hidden z-40" onClick={toggleSidebar}></div>}

            {/* Sidebar */}
            <aside
                className={`fixed md:relative z-50 h-screen bg-slate-900 text-white transition-all duration-300 ease-in-out flex flex-col ${
                    isSidebarOpen ? "w-72 translate-x-0" : "w-0 md:w-20 -translate-x-full md:translate-x-0"
                } overflow-hidden shadow-2xl md:shadow-none`}>
                <div className="p-6 flex items-center justify-between border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#05ADCF] p-2 rounded-lg">
                            <GraduationCap className="w-6 h-6 text-white" />
                        </div>
                        {isSidebarOpen && <span className="font-bold text-xl whitespace-nowrap">بوابة الدكتور</span>}
                    </div>
                    <button onClick={toggleSidebar} className="md:hidden text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 mt-6 px-3 space-y-1">
                    {menuItems.map((item) => (
                        <NavLink
                            key={item.id}
                            to={item.to}
                            className={({ isActive }) =>
                                `w-full flex items-center px-4 py-3.5 rounded-xl transition-all ${isActive ? "bg-[#05ADCF] text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`
                            }
                            onClick={() => setActiveTab(item.id)}>
                            <item.icon className={`w-6 h-6 min-w-[24px] ${activeTab === item.id ? "text-white" : "group-hover:scale-110 transition-transform"}`} />
                            {isSidebarOpen && <span className="mr-4 text-sm font-bold">{item.label}</span>}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <NavLink to="/" className="w-full flex items-center px-4 py-3 text-red-400 hover:bg-red-900/20 hover:text-red-300 rounded-xl transition-colors">
                        <LogOut className="w-6 h-6 min-w-[24px]" />
                        {isSidebarOpen && <span className="mr-4 text-sm font-bold">خروج</span>}
                    </NavLink>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="bg-white border-b border-black/10 h-16 flex items-center justify-between px-4 md:px-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={toggleSidebar} className="p-2.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all shadow-sm flex items-center justify-center">
                            {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                        <h1 className="font-bold text-gray-700">{menuItems.find((i) => i.id === activeTab)?.label || "الرئيسية"}</h1>
                    </div>

                    <div className="flex items-center gap-4 text-gray-500">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">د.أ</div>
                    </div>
                </header>

                <main className="flex-1 p-6 overflow-auto">
                    {activeTab === "dashboard" ? (
                        <div className="max-w-6xl mx-auto space-y-8">
                            {/* رسالة الترحيب */}
                            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
                                <div className="relative z-10">
                                    <h2 className="text-2xl font-bold text-gray-800 mb-2">مرحباً دكتور، طاب يومك! 👋</h2>
                                    <p className="text-gray-500">لديك محاضرة تبدأ بعد 45 دقيقة في القاعة المركزية.</p>
                                </div>

                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400 font-medium">
                            <div className="bg-gray-100 p-6 rounded-full mb-4">
                                <LayoutDashboard size={48} />
                            </div>
                            <p>قسم {menuItems.find((i) => i.id === activeTab)?.label} قيد التطوير حالياً</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default App;
