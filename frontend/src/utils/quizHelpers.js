export function normalizeQuizTitle(value) {
    return String(value || "").trim();
}

export function isQuizValid(quiz) {
    return Boolean(normalizeQuizTitle(quiz?.title));
}
