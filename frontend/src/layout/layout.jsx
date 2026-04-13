import React from "react";
import Navbar from "./Navbar";
import { Outlet, useLocation } from "react-router-dom";
import Footer from "./Footer";
import Chatbot from "../pages/Chatbot";
import ScrollToTop from "../components/common/ScrollToTop";



export default function Layout() {
    const location = useLocation();

    return (
        <>
            <ScrollToTop />
            <Navbar />
            <div key={location.pathname}>
                <Outlet />
            </div>
            <Footer />
            <Chatbot />
        </>
    );
}
