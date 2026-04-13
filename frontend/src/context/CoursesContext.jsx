import { createContext, useContext, useMemo, useCallback } from "react";
import { SystemContext } from "./SystemContext";

// eslint-disable-next-line react-refresh/only-export-components
export const CoursesContext = createContext();

export default function CoursesContextProvider({ children }) {
    const { openSemester, getStudentRegistrations, upsertStudentRegistration, removeStudentRegistration } = useContext(SystemContext);

    const loggedUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("loggedUser") || "{}");
        } catch {
            return {};
        }
    }, []);

    const studentId = String(loggedUser?.id || loggedUser?.studentId || loggedUser?.username || "");
    const studentName = loggedUser?.name || loggedUser?.NameID || "طالب";

    const selectedCourses = useMemo(() => getStudentRegistrations(studentId), [getStudentRegistrations, studentId]);

    const setSelectedCourses = useCallback(
        (nextCourses) => {
            const resolved = typeof nextCourses === "function" ? nextCourses(selectedCourses) : nextCourses;
            if (!Array.isArray(resolved)) return;

            // Keep the same public API while persisting through unified SystemContext store.
            const currentKeys = new Set(selectedCourses.map((item) => `${item.id || item.code}__${item.semester}`));
            resolved.forEach((course) => {
                upsertStudentRegistration({
                    studentId,
                    studentName,
                    semester: course.semester || openSemester,
                    course,
                    selectedGroup: course.selectedGroup || null,
                    student: loggedUser,
                });
                currentKeys.delete(`${course.id || course.code}__${course.semester || openSemester}`);
            });

            currentKeys.forEach((key) => {
                const [code, semester] = key.split("__");
                removeStudentRegistration({ studentId, code, semester });
            });
        },
        [loggedUser, openSemester, removeStudentRegistration, selectedCourses, studentId, studentName, upsertStudentRegistration]
    );

    const addSelectedCourse = useCallback(
        (course) => {
            return upsertStudentRegistration({
                studentId,
                studentName,
                semester: course?.semester || openSemester,
                course,
                selectedGroup: course?.selectedGroup || null,
                student: loggedUser,
            });
        },
        [loggedUser, openSemester, studentId, studentName, upsertStudentRegistration]
    );

    const removeSelectedCourse = useCallback(
        (courseId, semester = openSemester) => {
            removeStudentRegistration({ studentId, code: courseId, semester });
        },
        [openSemester, removeStudentRegistration, studentId]
    );

    const value = useMemo(
        () => ({
            selectedCourses,
            setSelectedCourses,
            addSelectedCourse,
            removeSelectedCourse,
        }),
        [selectedCourses, setSelectedCourses, addSelectedCourse, removeSelectedCourse]
    );

    return <CoursesContext.Provider value={value}>{children}</CoursesContext.Provider>;
}
