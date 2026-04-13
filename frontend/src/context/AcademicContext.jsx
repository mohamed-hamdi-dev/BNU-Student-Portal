import React, { createContext, useContext, useMemo } from "react";
import { calculateSemesterGpa, normalizeAcademicRecord } from "../utils/academicData";
import { SystemContext } from "./SystemContext";

export const AcademicContext = createContext(null);

export default function AcademicContextProvider({ children }) {
    const { academicRecords, setAcademicRecords, mergeGradeRecords } = useContext(SystemContext);

    const uploadedResults = useMemo(() => academicRecords.map((item) => normalizeAcademicRecord(item)), [academicRecords]);

    const refreshUploadedResults = () => {
        // no-op with unified context state, kept for backward compatibility
    };

    const getTranscriptDataForStudent = (studentId) => {
        const courses = uploadedResults.filter((item) => String(item.studentId) === String(studentId));
        return {
            courses,
            semesterGpa: calculateSemesterGpa(courses),
        };
    };

    const value = useMemo(
        () => ({
            uploadedResults,
            setUploadedResults: setAcademicRecords,
            refreshUploadedResults,
            getTranscriptDataForStudent,
            mergeGradeRecords,
        }),
        [uploadedResults, setAcademicRecords, mergeGradeRecords]
    );

    return <AcademicContext.Provider value={value}>{children}</AcademicContext.Provider>;
}

