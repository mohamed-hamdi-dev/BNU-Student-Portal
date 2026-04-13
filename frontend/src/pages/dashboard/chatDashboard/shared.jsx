import React from "react";

export function SidebarItem({ icon, label, active, onClick, rtl = false, collapsed = false }) {
    const IconComponent = icon;

    return (
        <button
            onClick={onClick}
            title={collapsed ? label : undefined}
            className={`group w-full rounded-2xl px-4 py-3 transition-all duration-300 ${
                active ? "bg-white text-slate-900 shadow-lg shadow-black/10" : "text-white/90 hover:bg-white/20 hover:text-white"
            }`}>
            <span className={`flex items-center gap-3 ${rtl ? "flex-row-reverse text-right justify-end" : "text-left"} ${collapsed ? "justify-center" : ""}`}>
                <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                        active ? "bg-cyan-100 text-cyan-700" : "bg-white/15 text-white group-hover:bg-white/25"
                    }`}>
                    <IconComponent className="h-4 w-4" />
                </span>
                {!collapsed && <span className="text-sm font-bold">{label}</span>}
            </span>
        </button>
    );
}

export const Card = ({ title, subtitle, children, className = "" }) => (
    <section
        className={`rounded-3xl border border-indigo-100/70 bg-white/90 p-4 shadow-[0_10px_30px_rgba(30,41,59,0.08)] backdrop-blur-sm transition hover:shadow-[0_14px_34px_rgba(30,41,59,0.13)] sm:p-5 md:p-6 ${className}`}>
        {title && (
            <header className="mb-5">
                <h3 className="text-base font-extrabold tracking-tight text-slate-800 sm:text-lg">{title}</h3>
                {subtitle && <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>}
            </header>
        )}
        {children}
    </section>
);
