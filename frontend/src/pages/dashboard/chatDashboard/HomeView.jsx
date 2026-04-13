import React, { useEffect, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Card } from "./shared";
import { useTranslation } from "react-i18next";

export default function HomeView({ studentsData = [], askedData = [], dailyUsersData = [], dailyUsersTrend = [], mostUsedFeaturesData = [], loading = false, error = "" }) {
    const { t } = useTranslation("admin");
    const chartsRootRef = useRef(null);
    const renderFeatureTick = ({ x, y, payload }) => (
        <text
            x={x - 8}
            y={y}
            fill="#334155"
            textAnchor="end"
            dominantBaseline="middle"
            style={{ fontSize: 12 }}
        >
            {String(payload?.value || "")}
        </text>
    );

    useEffect(() => {
        const root = chartsRootRef.current;
        if (!root) return undefined;

        const disableChartKeyboardFocus = () => {
            root.querySelectorAll("[tabindex]").forEach((node) => {
                node.setAttribute("tabindex", "-1");
            });
        };

        disableChartKeyboardFocus();
        const observer = new MutationObserver(disableChartKeyboardFocus);
        observer.observe(root, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={chartsRootRef} className="dashboard-charts space-y-4 animate-in fade-in duration-500 sm:space-y-6">
            {!!error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</div>}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
                <Card title={t("home_students")}>
                    <div className="h-52 w-full sm:h-60 md:h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={studentsData} accessibilityLayer={false}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip />
                                <Line type="monotone" dataKey="value" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 6, fill: "#fff", strokeWidth: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card title={t("home_most_asked")}>
                    <div className="h-52 w-full sm:h-60 md:h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={askedData} accessibilityLayer={false}>
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: "transparent" }} />
                                <Bar dataKey="value" fill="#A78BFA" radius={[20, 20, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            <Card title={t("home_daily_users")}>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <div className="h-52 sm:h-60 md:h-64 xl:col-span-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dailyUsersTrend} accessibilityLayer={false}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf1f7" />
                                <XAxis dataKey="day" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip />
                                <Line type="monotone" dataKey="users" stroke="#22d3ee" strokeWidth={3} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="h-52 rounded-2xl border border-slate-100 p-3 sm:h-60 md:h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart accessibilityLayer={false}>
                                <Pie data={dailyUsersData} innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                                    {dailyUsersData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </Card>

            <Card title={t("home_most_used_features")}>
                <div className="h-64 w-full sm:h-72" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mostUsedFeaturesData} layout="vertical" margin={{ left: 26, right: 12, top: 6, bottom: 6 }} accessibilityLayer={false}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#edf1f7" />
                            <XAxis type="number" axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="feature" axisLine={false} tickLine={false} width={130} tick={renderFeatureTick} />
                            <Tooltip cursor={{ fill: "transparent" }} />
                            <Bar dataKey="value" fill="#6366F1" radius={[0, 14, 14, 0]} barSize={22} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>
            {loading && <div className="text-xs text-slate-500 font-semibold">{t("home_loading_dashboard")}</div>}
        </div>
    );
}
