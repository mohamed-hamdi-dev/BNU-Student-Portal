import React from "react";
import { useLocation } from "react-router-dom";

export default function Footer() {
    const location = useLocation();
    if (location.pathname === "/CourseTable") return null;

    return <div className="footer-container w-full h-[2em] bg-[#0288A3]"></div>;
}
