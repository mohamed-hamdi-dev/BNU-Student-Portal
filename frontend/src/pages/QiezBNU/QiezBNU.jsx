import React, { useState, useEffect, useCallback, useRef } from "react";
import Navbar from "../../layout/Navbar";
import { listMyQuizResults, listQuizzes, submitQuiz } from "../../services/quizApi";
import { useTranslation } from "react-i18next";
import { 
  Clock, Timer, Calendar, ChevronRight, 
  ChevronLeft, CheckCircle2, AlertCircle, PlayCircle,
  User as UserIcon, LogOut
} from "lucide-react";

const ACTIVE_QUIZ_SESSION_KEY = "qiezbnu.activeQuizSession";

/** Quiz Runner Component - Improved UI for better focus */
const QuizRunner = ({ quiz, onFinish }) => {
  const { t, i18n } = useTranslation("global");
  const tq = (key, defaultValue, options = {}) => t(key, { defaultValue, ...options });
  const locale = String(i18n?.language || "ar").toLowerCase().startsWith("ar") ? "ar-EG" : "en-US";
  const isArabic = locale.startsWith("ar");
  const [idx, setIdx] = useState(0);
  const [ans, setAns] = useState({});
  const safeDurationSeconds = Math.max(60, Number(quiz?.duration || 15) * 60);
  const [time, setTime] = useState(safeDurationSeconds);
  const finishCalledRef = useRef(false);
  const initialDeadlineMs = Number(quiz?._deadlineMs || 0);
  const deadlineMsRef = useRef(
    Number.isFinite(initialDeadlineMs) && initialDeadlineMs > Date.now()
      ? initialDeadlineMs
      : Date.now() + safeDurationSeconds * 1000
  );

  const finish = useCallback(() => {
    if (finishCalledRef.current) return;
    finishCalledRef.current = true;
    let score = 0;
    quiz.questions.forEach((q, i) => {
      if (q.type === "multiple_select") {
        const expected = Array.isArray(q.correct) ? q.correct : [];
        const submitted = Array.isArray(ans[i]) ? ans[i] : [];
        if (expected.length === submitted.length && expected.every(x => submitted.includes(x))) score++;
      } else {
        if (ans[i] === q.correct) score++;
      }
    });
    onFinish({
      quizId: quiz.id,
      score: Math.round((score / quiz.questions.length) * 100),
      answers: ans,
    });
  }, [ans, onFinish, quiz.id, quiz.questions]);

  const handleExitWithSubmit = useCallback(() => {
    const confirmExit = window.confirm(
      tq("quiz_exit_submit_confirm", "Leaving now will submit your current answers. Continue?")
    );
    if (!confirmExit) return;
    finish();
  }, [finish]);

  useEffect(() => {
    finishCalledRef.current = false;
    const restoredDeadlineMs = Number(quiz?._deadlineMs || 0);
    const nextDeadlineMs =
      Number.isFinite(restoredDeadlineMs) && restoredDeadlineMs > Date.now()
        ? restoredDeadlineMs
        : Date.now() + safeDurationSeconds * 1000;
    deadlineMsRef.current = nextDeadlineMs;
    setTime(Math.max(0, Math.ceil((nextDeadlineMs - Date.now()) / 1000)));
  }, [quiz.id, quiz?._deadlineMs, safeDurationSeconds]);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMsRef.current - Date.now()) / 1000));
      setTime(remaining);
      if (remaining <= 0) finish();
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    const onVisibilityChange = () => tick();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [finish]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (finishCalledRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (finishCalledRef.current) return;
      const key = String(event.key || "").toLowerCase();
      const wantsReload =
        key === "f5" || ((event.ctrlKey || event.metaKey) && key === "r");
      if (!wantsReload) return;
      event.preventDefault();
      alert(tq("quiz_reload_blocked", "Page refresh is blocked during the quiz."));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [t]);

  useEffect(() => {
    if (finishCalledRef.current) return undefined;
    window.history.pushState({ quizLocked: true }, "");
    const onPopState = () => {
      if (finishCalledRef.current) return;
      window.history.pushState({ quizLocked: true }, "");
      alert(tq("quiz_exit_blocked", "You cannot leave the quiz while it is running."));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [t]);

  const progress = ((idx + 1) / quiz.questions.length) * 100;
  const currentQuestion = quiz.questions[idx] || { question: "", options: [], imageUrl: "", image_url: "" };
  const currentQuestionImage = String(currentQuestion?.imageUrl || currentQuestion?.image_url || "").trim();

  return (
    <div className={`max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 ${isArabic ? "text-right" : "text-left"}`} dir={isArabic ? "rtl" : "ltr"}>
      {/* Header with Progress and Timer */}
      <div className="bg-white p-6 rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-100 flex justify-between items-center sticky top-0 z-50">
        <div className="flex flex-col gap-1 flex-1">
            <span className="font-black text-slate-800 text-lg">{tq("quiz_question_counter", "Question {{current}} of {{total}}", { current: idx + 1, total: quiz.questions.length })}</span>
            <div className="w-48 h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExitWithSubmit}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 hover:bg-rose-100"
          >
            {tq("quiz_exit_button", "Exit")}
          </button>
          <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-mono font-black text-xl transition-colors ${time < 60 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-slate-900 text-white'}`} dir="ltr">
            <Clock size={22} /> {Math.floor(time / 60)}:{(time % 60).toString().padStart(2, "0")}
          </div>
        </div>
      </div>

      {/* Question Card */}
      <div className="bg-white p-12 rounded-[40px] shadow-sm border border-slate-100 space-y-10 min-h-[500px] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-2 h-full bg-cyan-500/10"></div>
        
        <div className="space-y-4">
            <span className="px-4 py-1.5 bg-cyan-50 text-cyan-600 rounded-xl text-xs font-black uppercase tracking-widest">{tq("quiz_course_label", "Course: {{title}}", { title: quiz.title })}</span>
            <h2 className="text-3xl font-black leading-tight text-slate-800">{currentQuestion.question}</h2>
            {currentQuestionImage ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <img
                  src={currentQuestionImage}
                  alt={tq("quiz_question_image_alt", "Question image {{index}}", { index: idx + 1 })}
                  className="max-h-[420px] w-full rounded-xl object-contain"
                />
              </div>
            ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {currentQuestion.options.map((o, i) => { const isSelected = currentQuestion.type === "multiple_select" ? (Array.isArray(ans[idx]) && ans[idx].includes(i)) : ans[idx] === i; return ( <button key={i} onClick={() => { if (currentQuestion.type === "multiple_select") { const currentAns = Array.isArray(ans[idx]) ? ans[idx] : []; const newAns = currentAns.includes(i) ? currentAns.filter(x => x !== i) : [...currentAns, i]; setAns({ ...ans, [idx]: newAns }); } else { setAns({ ...ans, [idx]: i }); } }} className={`group w-full p-6 rounded-[24px] border-2 text-right transition-all duration-300 flex items-center justify-between ${isSelected ? "border-cyan-500 bg-cyan-50/50 text-cyan-800 shadow-md translate-x-[-8px]" : "border-slate-50 bg-slate-50/30 hover:bg-slate-50 hover:border-slate-200 text-slate-600"}`}> <span className="font-bold text-lg">{o}</span> {currentQuestion.type === "multiple_select" ? ( <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-300'}`}> {isSelected && <CheckCircle2 size={16} />} </div> ) : ( <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-300'}`}> {isSelected && <div className="w-2 h-2 bg-white rounded-full"></div>} </div> )} </button> ); })}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="flex justify-between items-center px-4 pb-10">
        <button 
          disabled={idx === 0} 
          onClick={() => setIdx(idx - 1)} 
          className="flex items-center gap-2 px-8 py-4 font-black text-slate-400 disabled:opacity-0 hover:text-slate-600 transition-all"
        >
          <ChevronRight size={20} /> {tq("quiz_previous", "Previous")}
        </button>

        {idx === quiz.questions.length - 1 ? (
          <button 
            onClick={finish} 
            className="px-12 py-5 bg-green-600 text-white rounded-[24px] font-black shadow-xl shadow-green-100 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
          >
            {tq("quiz_submit_final", "Submit final answers")} <CheckCircle2 size={20} />
          </button>
        ) : (
          <button 
            onClick={() => setIdx(idx + 1)} 
            className="px-12 py-5 bg-slate-900 text-white rounded-[24px] font-black shadow-xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
          >
            {tq("quiz_next_question", "Next question")} <ChevronLeft size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

/** Main Student Dashboard with Modern Layout */
const StudentDashboard = ({ user, quizzes, submissions, onSubmitQuiz }) => {
  const { t, i18n } = useTranslation("global");
  const tq = (key, defaultValue, options = {}) => t(key, { defaultValue, ...options });
  const [view, setView] = useState("list");
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const locale = String(i18n?.language || "ar").toLowerCase().startsWith("ar") ? "ar-EG" : "en-US";
  const isArabic = locale.startsWith("ar");
  const userInitials = (user?.name || t("academic_reg_student_default"))
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (view !== "list" || !Array.isArray(quizzes) || quizzes.length === 0) return;
    const rawSession = sessionStorage.getItem(ACTIVE_QUIZ_SESSION_KEY);
    if (!rawSession) return;
    try {
      const parsed = JSON.parse(rawSession);
      const quizId = String(parsed?.quizId || "").trim();
      const deadlineMs = Number(parsed?.deadlineMs || 0);
      if (!quizId || !Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) {
        sessionStorage.removeItem(ACTIVE_QUIZ_SESSION_KEY);
        return;
      }

      const restoredQuiz = quizzes.find((item) => String(item?.id || "") === quizId);
      if (!restoredQuiz) {
        sessionStorage.removeItem(ACTIVE_QUIZ_SESSION_KEY);
        return;
      }

      const alreadySubmitted = submissions.some((item) => String(item?.quizId || "") === quizId);
      if (alreadySubmitted) {
        sessionStorage.removeItem(ACTIVE_QUIZ_SESSION_KEY);
        return;
      }

      setActiveQuiz({ ...restoredQuiz, _deadlineMs: deadlineMs });
      setView("quiz");
    } catch {
      sessionStorage.removeItem(ACTIVE_QUIZ_SESSION_KEY);
    }
  }, [quizzes, submissions, view]);

  if (view === "quiz")
    return (
      <div className="w-full min-h-screen bg-[#FDFDFD] p-6 md:p-12">
        <QuizRunner
          quiz={activeQuiz}
          onFinish={async (s) => {
            await onSubmitQuiz(s);
            sessionStorage.removeItem(ACTIVE_QUIZ_SESSION_KEY);
            setActiveQuiz(null);
            setView("list");
          }}
        />
      </div>
    );

  return (
    <div dir={isArabic ? "rtl" : "ltr"}>
      {/* Navbar */}
      <Navbar />
        
     <div className="h-16"></div> {/* Spacer for fixed navbar */}
         
      <main className="p-12 max-w-6xl mx-auto space-y-12">
        {/* Welcome Banner */}
        <div className="relative bg-slate-900 rounded-[48px] p-12 text-white overflow-hidden shadow-2xl shadow-slate-200">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[150%] bg-cyan-400 rounded-full blur-[120px]"></div>
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="space-y-4 text-center md:text-right">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">{t("quiz_welcome_greeting", { name: user.name.split(" ")[0] })}</h1>
              <p className="text-slate-400 font-medium max-w-lg text-lg">{t("quiz_welcome_message", { count: quizzes.length })}</p>
              <div className="flex items-center gap-4 justify-center md:justify-start pt-2">
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-2xl border border-white/5 backdrop-blur-sm">
                    <Clock size={16} className="text-cyan-400" />
                    <span className="text-xs font-bold">{currentTime.toLocaleTimeString(locale)}</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-2xl border border-white/5 backdrop-blur-sm">
                    <Calendar size={16} className="text-cyan-400" />
                    <span className="text-xs font-bold">{currentTime.toLocaleDateString(locale)}</span>
                </div>
              </div>
            </div>
            <div className="p-6 bg-white/10 rounded-[32px] border border-white/15 backdrop-blur-md hidden lg:block min-w-[240px]">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-white text-xl font-black">
                    {userInitials}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-cyan-100 font-bold">{t("quiz_student_data")}</p>
                    <p className="text-xs text-white/80 font-bold">{t("quiz_student_id")}: {user.id}</p>
                    <p className="text-xs text-white/70">{t("quiz_major")}: {user.major}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-cyan-100">
                  <UserIcon size={14} />
                  <span>{t("quiz_profile")}</span>
                </div>
            </div>
          </div>
        </div>

        {/* Quizzes Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-800">{t("quiz_academic_exams")}</h2>
            <div className="flex gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-xs font-bold text-slate-400 uppercase">{t("quiz_live_update")}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {quizzes.map((q) => {
              const sub = submissions.find((s) => s.quizId === q.id);
              const now = new Date();
              const start = new Date(q.startTime);
              const end = new Date(q.endTime);
              const isActive = now >= start && now <= end;
              const isFuture = now < start;
              const isExpired = now > end;

              return (
                <div key={q.id} className="group bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-xl hover:translate-y-[-8px] transition-all duration-500 flex flex-col justify-between relative overflow-hidden">
                  
                  <div className="space-y-6">
                    <div className="space-y-2">
                        {sub && (
                          <div className="inline-flex items-center gap-1.5 text-green-600 bg-green-50 border border-green-100 px-2 py-1 rounded-full text-[11px] font-black">
                            <CheckCircle2 size={13} />
                            <span>{tq("quiz_submitted_success", "Submitted successfully")}</span>
                          </div>
                        )}
                        <h3 className="font-black text-2xl text-slate-800 group-hover:text-cyan-600 transition-colors">{q.title}</h3>
                        <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-tighter">
                            <Timer size={14} className="text-cyan-500" /> {tq("quiz_duration_questions", "{{duration}} min | {{count}} questions", { duration: q.duration, count: q.questions.length })}
                        </div>
                    </div>

                    <div className={`p-5 rounded-3xl border text-xs font-black space-y-2 ${isActive && !sub ? 'bg-cyan-50/50 border-cyan-100 text-cyan-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                      {isFuture && <div className="flex items-center gap-2"><Calendar size={14} /> {tq("quiz_opens_at", "Opens at: {{value}}", { value: start.toLocaleString(locale) })}</div>}
                      {isActive && !sub && (
                        <div className="flex items-center gap-2">
                          <AlertCircle size={14} className="animate-pulse" /> {tq("quiz_open_until", "Available until: {{value}}", { value: end.toLocaleTimeString(locale) })}
                        </div>
                      )}
                      {isExpired && <div className="flex items-center gap-2"><LogOut size={14} /> {tq("quiz_entry_closed", "Entry time has ended")}</div>}
                      {sub && <div className="flex items-center gap-2 text-green-600"><CheckCircle2 size={14} /> {tq("quiz_submitted_success", "Submitted successfully")}</div>}
                    </div>
                  </div>

                  <div className="mt-8">
                    {sub ? (
                      <div className="w-full py-4 bg-green-600 text-white rounded-[20px] font-black text-center shadow-lg shadow-green-100 flex items-center justify-center gap-2">
                        {tq("quiz_score_label", "Score: {{score}}%", { score: sub.score })}
                      </div>
                    ) : isFuture ? (
                      <button disabled className="w-full py-4 bg-slate-100 text-slate-300 rounded-[20px] font-black cursor-not-allowed">
                        {tq("quiz_not_available_yet", "Not available yet")}
                      </button>
                    ) : isExpired ? (
                      <button disabled className="w-full py-4 bg-red-50 text-red-300 rounded-[20px] font-black cursor-not-allowed">
                        {tq("quiz_missed_deadline", "Deadline missed")}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const deadlineMs = Date.now() + Math.max(60, Number(q?.duration || 15) * 60) * 1000;
                          sessionStorage.setItem(
                            ACTIVE_QUIZ_SESSION_KEY,
                            JSON.stringify({ quizId: q.id, deadlineMs })
                          );
                          setActiveQuiz({ ...q, _deadlineMs: deadlineMs });
                          setView("quiz");
                        }}
                        className="w-full py-4 bg-slate-900 text-white rounded-[20px] font-black hover:bg-black transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 group-hover:gap-4"
                      >
                        {tq("quiz_enter_now", "Start quiz now")} <PlayCircle size={18} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            
            {quizzes.length === 0 && (
                <div className="col-span-full py-20 bg-white rounded-[40px] border border-dashed border-slate-200 text-center space-y-4">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                        <Calendar size={32} />
                    </div>
                    <p className="text-slate-400 font-black">{t("quiz_no_exams")}</p>
                </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Spacer */}
        <div className="h-20"></div>
      </div>
    );
};

/** Entry App Component */
const App = () => {
  const { t } = useTranslation("global");

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("loggedUser");
    const parsed = saved ? JSON.parse(saved) : null;
    return {
      name: parsed?.name || t("academic_reg_student_default"),
      id: parsed?.username || parsed?.studentId || "-",
      major: parsed?.college || parsed?.major || "-",
    };
  });

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== "loggedUser") return;
      const parsed = event.newValue ? JSON.parse(event.newValue) : null;
      setUser({
        name: parsed?.name || t("academic_reg_student_default"),
        id: parsed?.username || parsed?.studentId || "-",
        major: parsed?.college || parsed?.major || "-",
      });
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const [quizzes, setQuizzes] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const [quizData, submissionsData] = await Promise.all([
        listQuizzes(),
        listMyQuizResults(),
      ]);
      setQuizzes(Array.isArray(quizData) ? quizData : []);
      setSubmissions(Array.isArray(submissionsData) ? submissionsData : []);
    } catch {
      // Keep current UI state if backend is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    const init = setTimeout(() => {
      refresh();
    }, 0);
    const interval = setInterval(refresh, 3000);
    return () => {
      clearTimeout(init);
      clearInterval(interval);
    };
  }, [refresh]);

  const handleSubmitQuiz = async ({ quizId, score, answers }) => {
    try {
      const saved = await submitQuiz(quizId, { score, answers });
      setSubmissions((prev) => {
        const index = prev.findIndex((item) => item.quizId === saved.quizId);
        if (index < 0) return [saved, ...prev];
        const next = [...prev];
        next[index] = saved;
        return next;
      });
    } catch (error) {
      alert(error.message || t("quiz_submit_failed"));
    }
  };

  return <StudentDashboard user={user} quizzes={quizzes} submissions={submissions} onSubmitQuiz={handleSubmitQuiz} />;
};

export default App;













