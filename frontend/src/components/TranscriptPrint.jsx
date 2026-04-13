import React, { forwardRef, useEffect } from "react";


const TranscriptPrint = forwardRef(({ data }, ref) => {
    const fakeData = {
        studentName: "أحمد محمد علي",
        studentId: "2023001542",
        major: "Computer Science & Artificial Intelligence",
        degree: "Bachelor of Science",
        cumulativeGpa: 3.85,
        totalCredits: 120,
        academicStatus: "Excellent / Distinguished",
        semesters: [
            {
                semesterId: 1,
                name: "Fall Semester 2023",
                gpa: 3.9,
                courses: [
                    { code: "CS101", name: "Introduction to Programming", credits: 3, grade: "A" },
                    { code: "MATH201", name: "Calculus I", credits: 3, grade: "A-" },
                    { code: "ENG102", name: "Academic Writing", credits: 2, grade: "A" },
                    { code: "PHY110", name: "General Physics", credits: 4, grade: "B+" },
                ],
            },
            {
                semesterId: 1,
                name: "Fall Semester 2023",
                gpa: 3.9,
                courses: [
                    { code: "CS101", name: "Introduction to Programming", credits: 3, grade: "A" },
                    { code: "MATH201", name: "Calculus I", credits: 3, grade: "A-" },
                    { code: "ENG102", name: "Academic Writing", credits: 2, grade: "A" },
                    { code: "PHY110", name: "General Physics", credits: 4, grade: "B+" },
                ],
            },
        ],
    };

    const finalData = data || fakeData;

    // معالجة المتغيرات مع قيم افتراضية لمنع ظهور الخطأ (Error Handling)
    const { studentName = "N/A", studentId = "N/A", major = "N/A", degree = "N/A", cumulativeGpa = 0, totalCredits = 0, academicStatus = "Satisfactory", semesters = [] } = finalData;

    const primaryColor = "#05ADCF";

    useEffect(() => {
        const t = setTimeout(() => window.print(), 400);
        return () => clearTimeout(t);
    }, []);

    return (
        <div id="bnu-transcript-wrapper" className="bg-slate-100 p-10 min-h-screen flex justify-center items-start overflow-auto">
            <div
                ref={ref}
                className="transcript-container relative bg-white w-[210mm] min-h-[297mm] p-[15mm] shadow-[0_0_50px_rgba(0,0,0,0.1)] overflow-hidden text-[#1a1a1a] print:shadow-none screen-fit"
                id="transcript-content"
                style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                {/* Borders */}
                <div className="absolute inset-4 border-[1px] border-gray-200 pointer-events-none"></div>
                <div className={`absolute inset-5 border-[3px] pointer-events-none`} style={{ borderColor: primaryColor }}></div>

                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none select-none rotate-[-35deg]">
                    <div className="flex flex-col items-center text-center">
                        <div className="text-[100px] font-extrabold border-y-8 py-4" style={{ color: primaryColor, borderColor: primaryColor }}>
                            BNU
                        </div>
                        <div className="text-[50px] font-bold">BANHA NATIONAL UNIVERSITY</div>
                    </div>
                </div>

                {/* Header */}
                <div className="relative z-10 flex justify-between items-center mb-10 pb-6 border-b-4 border-double border-gray-200">
                    <div className="w-1/4">
                        <div className="font-serif font-bold text-xl leading-tight border-l-4 pl-3 uppercase" style={{ color: primaryColor, borderLeftColor: primaryColor }}>
                            Banha <br /> National <br /> University
                        </div>
                    </div>

                    <div className="w-1/2 flex flex-col items-center">
                        <div className="relative w-24 h-24 mb-2 flex items-center justify-center">
                            <div className="absolute inset-0 rotate-45 rounded-xl opacity-20" style={{ backgroundColor: primaryColor }}></div>
                            <div className="relative z-20 text-2xl font-black italic tracking-tighter" style={{ color: primaryColor }}>
                                BNU
                            </div>
                        </div>
                        <h1 className="text-3xl font-serif font-bold tracking-[0.2em] uppercase mt-4" style={{ color: primaryColor }}>
                            Official Transcript
                        </h1>
                    </div>

                    <div className="w-1/4 text-right">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document No.</div>
                        <div className="text-sm font-mono font-bold" style={{ color: primaryColor }}>
                            BNU-2025-AX992
                        </div>
                    </div>
                </div>

                {/* Student Info Section */}
                <div className="relative z-10 grid grid-cols-12 gap-0 mb-10 border" style={{ borderColor: primaryColor }}>
                    <div className="col-span-8 p-6 bg-white">
                        <div className="grid grid-cols-2 gap-y-4">
                            <div>
                                <label className="text-[9px] uppercase font-bold block mb-1" style={{ color: primaryColor }}>
                                    Student Full Name
                                </label>
                                <span className="text-lg font-bold">{studentName}</span>
                            </div>
                            <div>
                                <label className="text-[9px] uppercase font-bold block mb-1" style={{ color: primaryColor }}>
                                    Student ID / No.
                                </label>
                                <span className="text-lg font-mono">{studentId}</span>
                            </div>
                            <div className="col-span-2 border-t border-gray-100 pt-3">
                                <label className="text-[9px] uppercase font-bold block mb-1" style={{ color: primaryColor }}>
                                    Academic Program & Degree
                                </label>
                                <span className="text-md font-medium text-gray-700">
                                    {degree} in {major}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="col-span-4 p-6 border-l flex flex-col justify-center items-center text-center" style={{ backgroundColor: `${primaryColor}10`, borderLeftColor: primaryColor }}>
                        <div className="text-[9px] uppercase font-bold mb-2" style={{ color: primaryColor }}>
                            Academic Standing
                        </div>
                        <div className="text-md font-bold px-3 py-1 border rounded-sm" style={{ borderColor: primaryColor, color: primaryColor }}>
                            {academicStatus}
                        </div>
                    </div>
                </div>

                {/* Semester Tables */}
                <div className="relative z-10 space-y-10">
                    {semesters.map((sem, idx) => (
                        <div key={sem.semesterId || idx} className="break-inside-avoid">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="text-white px-4 py-1 text-sm font-bold skew-x-[-12deg]" style={{ backgroundColor: primaryColor }}>
                                    {(sem.name || "Semester").toUpperCase()}
                                </div>
                                <div className="h-[2px] flex-grow bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, ${primaryColor}, transparent)` }}></div>
                                <div className="text-xs font-bold text-gray-600">GPA: {(sem.gpa || 0).toFixed(2)}</div>
                            </div>

                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b-2 text-[10px] uppercase tracking-wider font-bold" style={{ borderColor: primaryColor, color: primaryColor }}>
                                        <th className="py-2 px-2">Code</th>
                                        <th className="py-2 px-2">Course Description</th>
                                        <th className="py-2 px-2 text-center">Credits</th>
                                        <th className="py-2 px-2 text-center">Grade</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[12px]">
                                    {(sem.courses || []).map((c, i) => (
                                        <tr key={i} className="border-b border-gray-100">
                                            <td className="py-2 px-2 font-mono font-bold" style={{ color: primaryColor }}>
                                                {c.code || "N/A"}
                                            </td>
                                            <td className="py-2 px-2 uppercase text-gray-700">{c.name || "N/A"}</td>
                                            <td className="py-2 px-2 text-center">{c.credits || 0}</td>
                                            <td className="py-2 px-2 text-center font-bold">{c.grade || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>

                {/* Summary Block */}
                <div className="relative z-10 mt-12 p-[1px]" style={{ backgroundColor: primaryColor }}>
                    <div className="bg-white p-6 border-[1px] flex justify-between items-center shadow-lg transform translate-y-[-4px] translate-x-[-4px]" style={{ borderColor: primaryColor }}>
                        <div className="grid grid-cols-3 gap-12">
                            <div className="border-r border-gray-200 pr-8">
                                <div className="text-[10px] font-bold uppercase" style={{ color: primaryColor }}>
                                    Cumulative Credits
                                </div>
                                <div className="text-2xl font-serif font-bold">{totalCredits}</div>
                            </div>
                            <div className="border-r border-gray-200 pr-8">
                                <div className="text-[10px] font-bold uppercase text-gray-400">Grading Scale</div>
                                <div className="text-sm font-medium">4.00 System</div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold uppercase" style={{ color: primaryColor }}>
                                    Cumulative GPA
                                </div>
                                <div className="text-3xl font-serif font-bold" style={{ color: primaryColor }}>
                                    {(cumulativeGpa || 0).toFixed(2)}
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 border p-3 text-[9px] leading-relaxed text-gray-500 max-w-[200px] italic">
                            "This transcript is official only if it bears the embossed seal of Banha National University and the signature of the Registrar."
                        </div>
                    </div>
                </div>

                {/* Footer with Seal & QR */}
                <div className="relative z-10 mt-16 grid grid-cols-3 gap-10 items-end">
                    <div className="flex flex-col items-center">
                        <div className="bg-white p-2 border-2 shadow-sm" style={{ borderColor: primaryColor }}>
                            <svg width="60" height="60" viewBox="0 0 100 100" style={{ fill: primaryColor }}>
                                <path d="M10 10h30v30h-30z M60 10h30v30h-30z M10 60h30v30h-30z" />
                            </svg>
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <div
                            className="w-24 h-24 border-[3px] border-double rounded-full flex flex-col items-center justify-center text-[7px] font-bold text-center p-2 uppercase transform -rotate-12 opacity-20"
                            style={{ borderColor: primaryColor, color: primaryColor }}>
                            <div>BNU Egypt</div>
                            <div className="text-[9px] my-1">OFFICIAL SEAL</div>
                        </div>
                    </div>

                    <div className="text-center border-t border-gray-300 pt-2">
                        <p className="text-[10px] font-bold uppercase" style={{ color: primaryColor }}>
                            Registrar
                        </p>
                    </div>
                </div>
            </div>

            <style>{`
        #bnu-transcript-wrapper.bg-slate-100 {
            padding: 2.5rem;
        }
        
        #transcript-content.transcript-container {
            padding: 15mm;
            margin-left: auto;
            margin-right: auto;
            display: block;
            box-sizing: border-box;
        }

        #transcript-content table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 10px;
        }

        @media print {
          #bnu-transcript-wrapper { padding: 0 !important; background: white !important; }
          #transcript-content { padding: 10mm !important; box-shadow: none !important; margin: 0 !important; width: 100% !important; }
        }
      `}</style>
        </div>
    );
});

export default TranscriptPrint;
