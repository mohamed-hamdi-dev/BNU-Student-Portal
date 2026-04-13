import React from "react";
import { services } from "../../components/hooks/servicesData.js";
import { NavLink } from "react-router-dom";
import HerobanerPortal from "../../components/HerobanerPortal.jsx";
import { useTranslation } from "react-i18next";




const ServicesGrid = () => {
    const { t } = useTranslation("global");
    
    return (
        <>
            <div className="w-full h-full pt-[10em] px-4" style={{ backgroundColor: "var(--page-bg)", color: "var(--page-text)" }}>
                <HerobanerPortal />

                <div className="mt-[4em] container mx-auto  grid  grid-cols-1  sm:grid-cols-2  md:grid-cols-3 lg:grid-cols-4  xl:grid-cols-5 gap-5 p-4  lg:!px-[5em] !mb-[5em]">
                    {services.map(({ id, label, Icon, color, iconBg, path }) => (
                        <NavLink
                            key={id}
                            to={path}
                            className="flex flex-col items-center justify-center p-5 h-32 rounded-2xl hover:shadow-xl transition-all cursor-pointer border"
                            style={{
                                backgroundColor: "var(--card-bg)",
                                borderColor: "rgba(139, 231, 245, 0.45)",
                                boxShadow: "0 8px 24px rgba(5, 173, 207, 0.18)",
                            }}>
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: iconBg || "transparent" }}>
                                <Icon size={28} color={color} />
                            </div>
                            <p className="mt-3 text-center font-semibold text-sm" style={{ color: "var(--page-text)" }}>
                                {t(label)}
                            </p>
                        </NavLink>
                    ))}
                </div>
            </div>
        </>
    );
};

export default ServicesGrid;
