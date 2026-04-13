// SplineComponent.jsx
import React from "react";
import Spline from "@splinetool/react-spline";

export default function SplineComponent() {
    return (
        <div className="w-full h-screen">
            <Spline scene="https://prod.spline.design/your-new-link/scene.splinecode" />
        </div>
    );
}
