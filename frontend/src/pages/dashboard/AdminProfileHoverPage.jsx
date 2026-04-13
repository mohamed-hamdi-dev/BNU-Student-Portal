import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { Building2, CheckCircle2, Clock3, IdCard, Mail, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { apiFetch } from "../../services/api";

const hiddenKeys = new Set([
    "password",
    "token",
    "accessToken",
    "refreshToken",
    "full_name",
    "fullName",
    "nationality",
    "gender",
    "birth_place",
    "birthPlace",
]);

const normalizeCount = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function AdminProfileHoverPage() {
    const { currentUser } = useContext(AuthContext);
    const navigate = useNavigate();
    const [stats, setStats] = useState({ students: 0, chats: 0, pending: 0 });

    const sourceUser = useMemo(() => {
        try {
            const raw = JSON.parse(localStorage.getItem("loggedUser") || "{}");
            return { ...raw, ...currentUser };
        } catch {
            return currentUser || {};
        }
    }, [currentUser]);

    const displayName = sourceUser?.name || sourceUser?.displayName || sourceUser?.username || "المستخدم";
    const roleTitle = sourceUser?.role === "doctor" ? "د." : sourceUser?.role === "advisor" ? "المرشد" : "الأستاذ";
    const roleLabel = String(sourceUser?.role || "admin");
    const username = sourceUser?.username || sourceUser?.id || "-";
    const email = sourceUser?.email || "-";
    const college = sourceUser?.college || sourceUser?.faculty || "-";

    useEffect(() => {
        let cancelled = false;

        const loadStats = async () => {
            try {
                const [usersRes, convRes, pendingRes] = await Promise.all([
                    apiFetch("/api/users"),
                    apiFetch("/api/conversations"),
                    apiFetch("/api/users/requests/account-requests?status=pending"),
                ]);

                if (cancelled) return;
                const users = Array.isArray(usersRes) ? usersRes : [];
                const conversations = Array.isArray(convRes) ? convRes : [];
                const pendingRequests = Array.isArray(pendingRes) ? pendingRes : [];

                const students = users.filter((u) => String(u?.role || "").toLowerCase() === "student").length;
                const unreadLiveChats = conversations.reduce(
                    (sum, conv) => sum + Number(conv?.unread_for_admin || conv?.unreadForAdmin || 0),
                    0
                );

                setStats({
                    students: normalizeCount(students),
                    chats: normalizeCount(unreadLiveChats),
                    pending: normalizeCount(pendingRequests.length),
                });
            } catch {
                if (cancelled) return;
                setStats({
                    students: normalizeCount(sourceUser?.stats?.students || sourceUser?.studentsCount),
                    chats: normalizeCount(sourceUser?.stats?.liveChats || sourceUser?.liveChatsCount),
                    pending: normalizeCount(sourceUser?.stats?.pendingRequests || sourceUser?.pendingCount),
                });
            }
        };

        loadStats();
        const timer = setInterval(loadStats, 20000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [sourceUser]);

    const quickActions = useMemo(() => {
        const role = String(sourceUser?.role || "").toLowerCase();
        const base = [{ label: "أمان الحساب", to: "/admin/password-security", icon: ShieldCheck }];

        if (role === "admin") {
            base.unshift({ label: "محادثات الدعم", to: "/admin/live-chat", icon: MessageCircle });
            base.unshift({ label: "إدارة الحسابات", to: "/admin/users", icon: Users });
            base.push({ label: "مراجعة الصور", to: "/admin/photo-reviews", icon: CheckCircle2 });
        }
        return base;
    }, [sourceUser?.role]);

    const accountFields = [
        { key: "username", label: "اسم المستخدم", value: username, icon: IdCard },
        { key: "email", label: "البريد", value: email, icon: Mail },
        { key: "role", label: "الدور", value: roleLabel, icon: ShieldCheck },
        { key: "college", label: "الكلية", value: college, icon: Building2 },
    ].filter((field) => !hiddenKeys.has(field.key) && String(field.value || "").trim() !== "");

    return (
        <section className="space-y-4">
            <div className="rounded-2xl border border-cyan-200 bg-[#05ADCF] text-white px-4 py-3 shadow-sm">
                <p className="text-xs text-cyan-50">مرحباً بك</p>
                <p className="text-lg md:text-xl font-black mt-0.5">
                    {roleTitle} {displayName}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                    <div>
                        <h2 className="text-base font-black text-slate-800">نظرة سريعة</h2>
                        <p className="text-xs text-slate-500 mt-1">مؤشرات سريعة وإجراءات يومية للأدمن</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-semibold">إجمالي الطلاب المسجلين</span>
                                <Users size={16} className="text-cyan-600" />
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-800">{stats.students}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-semibold">رسائل Live Chat غير المقروءة</span>
                                <MessageCircle size={16} className="text-cyan-600" />
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-800">{stats.chats}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-semibold">طلبات معلّقة</span>
                                <Clock3 size={16} className="text-cyan-600" />
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-800">{stats.pending}</p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <h3 className="text-sm font-black text-slate-800 mb-3">إجراءات سريعة</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {quickActions.map((action) => {
                                const Icon = action.icon;
                                return (
                                    <button
                                        key={action.to}
                                        type="button"
                                        onClick={() => navigate(action.to)}
                                        className="w-full text-right rounded-xl border border-slate-200 bg-slate-50 hover:bg-cyan-50 hover:border-cyan-200 px-3 py-2.5 transition-colors flex items-center justify-between"
                                    >
                                        <span className="text-sm font-bold text-slate-700">{action.label}</span>
                                        <Icon size={16} className="text-cyan-600" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <aside className="rounded-xl border border-slate-200 bg-white p-4 h-fit">
                    <h3 className="text-sm font-black text-slate-800 mb-3">بيانات الحساب</h3>
                    <div className="space-y-2">
                        {accountFields.map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.key} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                    <div className="flex items-center justify-between text-slate-500">
                                        <span className="text-[11px] font-semibold">{item.label}</span>
                                        <Icon size={14} className="text-cyan-600" />
                                    </div>
                                    <p className="text-sm font-black text-slate-800 mt-1 break-words">{item.value}</p>
                                </div>
                            );
                        })}
                    </div>
                </aside>
            </div>
        </section>
    );
}
