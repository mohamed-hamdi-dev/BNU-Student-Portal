import React from "react";

export default function QuizShell({ title = "Quiz Module", children }) {
    return (
        <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-lg font-black text-gray-800 mb-4">{title}</h2>
            {children}
        </section>
    );
}
