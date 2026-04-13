import { apiFetch } from "./api";

const normalizeQuiz = (item = {}) => ({
  ...item,
  courseCode: item.courseCode ?? item.course_code ?? "",
  academicYear: item.academicYear ?? item.academic_year ?? "",
  term: item.term ?? "",
  section: item.section ?? "",
  collegeId: item.collegeId ?? item.college_id ?? "",
  visibility: item.visibility ?? "college",
  startTime: item.startTime ?? item.start_time ?? null,
  endTime: item.endTime ?? item.end_time ?? null,
  questions: Array.isArray(item.questions)
    ? item.questions.map((question = {}) => ({
        ...question,
        imageUrl: question.imageUrl ?? question.image_url ?? "",
      }))
    : [],
});

const normalizeSubmission = (item = {}) => ({
  ...item,
  quizId: item.quizId ?? item.quiz_id ?? "",
  studentId: item.studentId ?? item.student_id ?? "",
  studentName: item.studentName ?? item.student_name ?? "",
  quizTitle: item.quizTitle ?? item.quiz_title ?? "",
  courseCode: item.courseCode ?? item.course_code ?? "",
  academicYear: item.academicYear ?? item.academic_year ?? "",
  term: item.term ?? "",
  section: item.section ?? "",
  status: item.status ?? "submitted",
  submittedAt: item.submittedAt ?? item.submitted_at ?? null,
});

export const listQuizzes = async () => {
  const data = await apiFetch("/api/quizzes");
  return Array.isArray(data) ? data.map(normalizeQuiz) : [];
};

export const listQuizzesScoped = async (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const url = query.toString() ? `/api/quizzes?${query.toString()}` : "/api/quizzes";
  const data = await apiFetch(url);
  return Array.isArray(data) ? data.map(normalizeQuiz) : [];
};

export const createQuiz = (payload) => apiFetch("/api/quizzes", {
  method: "POST",
  body: JSON.stringify(payload),
});

export const updateQuiz = (quizId, payload) => apiFetch(`/api/quizzes/${quizId}`, {
  method: "PUT",
  body: JSON.stringify(payload),
});

export const deleteQuiz = (quizId) => apiFetch(`/api/quizzes/${quizId}`, {
  method: "DELETE",
});

export const submitQuiz = (quizId, payload) => apiFetch(`/api/quizzes/${quizId}/submit`, {
  method: "POST",
  body: JSON.stringify(payload),
}).then(normalizeSubmission);

export const listMyQuizResults = async () => {
  const data = await apiFetch("/api/quizzes/my-results");
  return Array.isArray(data) ? data.map(normalizeSubmission) : [];
};

export const listQuizSubmissions = async () => {
  const data = await apiFetch("/api/quizzes/submissions");
  return Array.isArray(data) ? data.map(normalizeSubmission) : [];
};

export const queryQuizSubmissions = async (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const url = query.toString() ? `/api/quizzes/submissions/query?${query.toString()}` : "/api/quizzes/submissions/query";
  const data = await apiFetch(url);
  return {
    ...data,
    items: Array.isArray(data?.items) ? data.items.map(normalizeSubmission) : [],
  };
};
