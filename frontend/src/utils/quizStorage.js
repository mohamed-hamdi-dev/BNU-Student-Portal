const QUIZZES_KEY = "quizzes";
const LEGACY_QUIZZES_KEY = "quiz_data";

export function loadQuizzes() {
    try {
        const primaryRaw = localStorage.getItem(QUIZZES_KEY);
        if (primaryRaw) return JSON.parse(primaryRaw);

        const legacyRaw = localStorage.getItem(LEGACY_QUIZZES_KEY);
        if (!legacyRaw) return [];

        const legacyData = JSON.parse(legacyRaw);
        // Keep both keys aligned to avoid disappearing quizzes across old/new pages.
        localStorage.setItem(QUIZZES_KEY, JSON.stringify(legacyData));
        return Array.isArray(legacyData) ? legacyData : [];
    } catch {
        return [];
    }
}

export function saveQuizzes(data) {
    const normalized = Array.isArray(data) ? data : [];
    localStorage.setItem(QUIZZES_KEY, JSON.stringify(normalized));
    localStorage.setItem(LEGACY_QUIZZES_KEY, JSON.stringify(normalized));
}
