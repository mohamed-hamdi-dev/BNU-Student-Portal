import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPublicAcademicCatalog } from "../services/academicApi";
import {
    getAccountRequestCollegesFromSource,
    getAccountRequestLevelsByCollegeFromSource,
} from "../utils/accountRequestOptions";

const FALLBACK_SOURCE = {
    colleges: [
        { id: "CS", name: "علوم الحاسب" },
        { id: "ENG", name: "الهندسة" },
        { id: "BUS", name: "إدارة الأعمال" },
        { id: "MED", name: "الطب" },
        { id: "DEN", name: "طب الأسنان" },
        { id: "PHR", name: "الصيدلة" },
    ],
    years: [
        { id: "1", name: "السنة الأولى" },
        { id: "2", name: "السنة الثانية" },
        { id: "3", name: "السنة الثالثة" },
        { id: "4", name: "السنة الرابعة" },
        { id: "5", name: "السنة الخامسة" },
    ],
    settings: {},
};

export function useAccountRequestCatalog() {
    const [source, setSource] = useState(FALLBACK_SOURCE);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const data = await fetchPublicAcademicCatalog();
                if (cancelled) return;

                setSource({
                    colleges: Array.isArray(data?.colleges) && data.colleges.length > 0 ? data.colleges : FALLBACK_SOURCE.colleges,
                    years: Array.isArray(data?.years) && data.years.length > 0 ? data.years : FALLBACK_SOURCE.years,
                    settings: data?.settings && typeof data.settings === "object" ? data.settings : {},
                });
            } catch {
                if (!cancelled) setSource(FALLBACK_SOURCE);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    const colleges = useMemo(() => getAccountRequestCollegesFromSource(source), [source]);
    const getLevelsByCollege = useCallback(
        (selectedCollege) => getAccountRequestLevelsByCollegeFromSource(source, selectedCollege),
        [source]
    );

    return { colleges, getLevelsByCollege, loading };
}
