import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslation } from "react-i18next";
import { AlertCircle, Bot, Calculator, Download, ExternalLink, GraduationCap, Home, Layers, MapPin, Maximize2, Menu, MessageCircle, Mic, Monitor, Search, Send, Smartphone, Star, Tablet, Trash2, Upload, User, X, ChevronDown, Check, Languages, FileText, Sparkles } from "lucide-react";
import { LuAudioLines } from "react-icons/lu";
import { MdAccountBalance, MdBusinessCenter, MdDoorFront, MdLocalHospital, MdLocalLibrary, MdLocalParking, MdMyLocation, MdSchool } from "react-icons/md";
import { Controller, useForm } from "react-hook-form";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import "../css/chatBot.css";
import { liveChatService } from "../services/liveChatService";
import { apiFetch } from "../services/api";
import { normalizeAcademicYearValue } from "../utils/academicData";
import { ThemeContext } from "../context/ThemeContext.jsx";

const SERVICE_POLL_MS = 3000;
const isArabicLanguage = (lang) => String(lang || "ar").toLowerCase().startsWith("ar");
const sizeModes = [
  { id: "mobile", label: "Mobile", icon: Smartphone, classes: "w-[92vw] max-w-[400px] h-[76vh] max-h-[690px]" },
  { id: "tablet", label: "Tablet", icon: Tablet, classes: "w-[86vw] max-w-[680px] h-[76vh] max-h-[690px]" },
  { id: "desktop", label: "Desktop", icon: Monitor, classes: "w-[88vw] max-w-[980px] h-[76vh] max-h-[690px]" },
];
const tabs = [
  { id: "home", icon: Home },
  { id: "chat", icon: MessageCircle },
  { id: "gpa", icon: GraduationCap },
  { id: "map", icon: MapPin },
];
const getServiceQuickActions = (t) => [
  t("chatbot_admission_inquiry"),
  t("chatbot_tuition_fees"),
  t("chatbot_registration_and_courses"),
  t("chatbot_study_schedule"),
  t("chatbot_submit_a_complaint"),
];
const getSuggestedPrompts = (t) => [
  t("chatbot_what_are_the_course_registration_steps"),
  t("chatbot_calculate_my_gpa_for_this_term"),
  t("chatbot_where_is_the_student_services_building"),
];
const fallbackSubjects = [
  { id: "CS101", name: "مقدمة في علوم الحاسب", semester: "الأول" },
  { id: "MTH101", name: "رياضيات 1", semester: "الأول" },
  { id: "PHY101", name: "فيزياء", semester: "الأول" },
];
const getHomeCards = (t) => [
  { id: "chat", title: "Chat Assistant", desc: t("chatbot_smart_chat_to_answer_your_academic_and_a"), icon: MessageCircle, action: "chat" },
  { id: "gpa", title: "GPA Calculator", desc: t("chatbot_calculate_term_and_cumulative_gpa_quickl"), icon: Calculator, action: "gpa" },
  { id: "map", title: "Campus Map", desc: t("chatbot_explore_campus_buildings_and_services"), icon: MapPin, action: "map" },
  { id: "services", title: "Student Services", desc: t("chatbot_open_customer_service_mode_inside_chat"), icon: Layers, action: "service-chat" },
];

const createMessage = (role, text, meta = {}) => ({ id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role, text, timestamp: new Date().toISOString(), ...meta });
const appendAccessToken = (url) => {
  const token = localStorage.getItem("access_token");
  if (!token) return url;
  if (!/\/api\/storage\/files\//i.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
};
const resolveAttachmentUrl = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw) || /^data:/i.test(raw)) return appendAccessToken(raw);
  if (raw.startsWith("/")) {
    return appendAccessToken(raw);
  }
  return appendAccessToken(raw);
};
const mapLiveMessageToUi = (message) => ({
  id: message?.id || `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  role: message?.sender_type === "student" ? "user" : "model",
  text: message?.text || "",
  timestamp: message?.created_at || new Date().toISOString(),
  senderType: message?.sender_type || "",
  senderName: message?.sender_name || "",
  isRead: Boolean(message?.is_read),
  isServiceMessage: true,
});
const getLoggedUser = () => {
  try {
    return JSON.parse(localStorage.getItem("loggedUser") || "{}");
  } catch {
    return {};
  }
};
const createSession = (mode = "general", student = {}, t = (key) => key) => ({
  id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  title: t("chatbot_new_chat"),
  mode,
  studentId: student?.studentId || student?.username || null,
  studentName: student?.name || t("chatbot_student"),
  conversationId: null,
  conversationStatus: mode === "service" ? "active" : null,
          conversationRating: null,
          assignedAdminName: null,
          messages: [createMessage("model", mode === "service" ? t("chatbot_welcome_to_student_services_mode_choose_") : t("chatbot_hi_i_m_campus_assistant_how_can_i_help"))],
  updatedAt: new Date().toISOString(),
});
const scoreToLetterGrade = (score) => {
  const normalized = Number(score || 0);
  if (normalized >= 90) return "A";
  if (normalized >= 80) return "B";
  if (normalized >= 70) return "C";
  if (normalized >= 50) return "D";
  return "L";
};
const gradeToPoints = (grade) =>
  ({
    "A+": 4,
    A: 4,
    "A-": 3.7,
    "B+": 3.3,
    B: 3,
    "B-": 2.7,
    "C+": 2.3,
    C: 2,
    "C-": 1.7,
    "D+": 1.3,
    D: 1,
    "D-": 0.7,
    F: 0,
    L: 0,
  }[String(grade || "").toUpperCase()] ?? 0);

export default function Chatbot() {
  const { t, i18n } = useTranslation("global");
  const { isDarkMode } = useContext(ThemeContext);
  const isAr = isArabicLanguage(i18n.language);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [chatbotSize, setChatbotSize] = useState("mobile");
  const [chatLaunchIntent, setChatLaunchIntent] = useState(null);

  const currentSize = sizeModes.find((s) => s.id === chatbotSize) || sizeModes[0];
  const ActiveSizeIcon = currentSize.icon;
  const cycleChatbotSize = () => setChatbotSize(sizeModes[(sizeModes.findIndex((s) => s.id === chatbotSize) + 1) % sizeModes.length].id);
  const navigateFromHome = (action) => {
    if (action === "service-chat") {
      setActiveTab("chat");
      setChatLaunchIntent({ type: "service", stamp: Date.now() });
      return;
    }
    setActiveTab(action);
  };

  return (
    <div dir="ltr">
      <div className="campus-chatbot-root fixed bottom-6 right-6 z-[90] flex flex-col items-end gap-4">
        {isOpen && (
          <div className={`${currentSize.classes} chatbot-window bg-white/95 backdrop-blur rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 transition-all duration-300`}>
            <div className="relative flex items-center justify-between px-5 py-4 bg-gradient-to-r from-[#05ADCF] to-[#0486a0] text-white">
              <div className="flex items-center gap-3">
                <div className="relative"><div className="p-2 bg-white/15 rounded-xl"><Bot size={20} /></div><span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-[#05ADCF] rounded-full" /></div>
                <div><div className="font-bold text-sm">Campus Assistant</div><div className="text-[10px] text-white/80">{t("chatbot_ready_to_help")}</div></div>
              </div>
              <div className="flex items-center gap-1">
                <div className="hidden md:flex items-center gap-1">
                  <button onClick={cycleChatbotSize} className="chatbot-header-action p-1.5 rounded-xl hover:bg-white/15" title={`${t("chatbot_change_size")} - ${currentSize.label}`}><Maximize2 size={16} /></button>
                  <div className="chatbot-header-action p-1.5 rounded-xl"><ActiveSizeIcon size={15} /></div>
                </div>
                <button onClick={() => setIsOpen(false)} className="chatbot-header-action chatbot-header-close p-2 rounded-xl hover:bg-white/10"><X size={20} /></button>
              </div>
            </div>

            <div className="chatbot-main-panel flex-1 bg-gray-50 overflow-hidden">
              {activeTab === "home" && <HomeTab onNavigate={navigateFromHome} />}
              {activeTab === "chat" && <ChatTab launchIntent={chatLaunchIntent} />}
              {activeTab === "gpa" && <GpaTab />}
              {activeTab === "map" && <MapComponent />}
            </div>

            <div className="chatbot-tabbar bg-white/90 border-t border-slate-200 px-2 py-2">
              <div className="grid grid-cols-4 gap-2">
                {tabs.map(({ id, icon }) => {
                  const Icon = icon;
                  const active = activeTab === id;
                  const label = {
                    home: t("chatbot_home"),
                    chat: t("chatbot_chat"),
                    gpa: t("chatbot_gpa_tab"),
                    map: t("chatbot_map"),
                  }[id];
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        if (id === "chat") setChatLaunchIntent({ type: "general", stamp: Date.now() });
                        setActiveTab(id);
                      }}
                      className={`flex flex-col items-center justify-center py-2 rounded-xl transition ${active ? "bg-[#05ADCF]/12 text-[#049ab7] border border-[#05ADCF]/20" : "text-slate-500 hover:text-[#0bcef5] hover:bg-slate-100"}`}
                    >
                      <Icon size={18} />
                      <span className="text-[11px] mt-1 font-semibold">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <button onClick={() => setIsOpen(!isOpen)} className="w-16 h-16 rounded-full bg-[#05ADCF] text-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all">
          {isOpen ? <X size={28} /> : <Bot size={28} />}
        </button>
      </div>
    </div>
  );
}

function HomeTab({ onNavigate }) {
  const { t, i18n } = useTranslation("global");
  const { isDarkMode } = useContext(ThemeContext);
  const isAr = isArabicLanguage(i18n.language);
  const homeCards = useMemo(() => getHomeCards(t), [t]);
  const loggedUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("loggedUser") || "{}");
    } catch {
      return {};
    }
  }, []);

  return (
    <div className="dot-scroll h-full overflow-y-auto p-4 md:p-6 text-right" dir="rtl">
      <div className="relative overflow-hidden rounded-2xl bg-[#0f172a] p-3.5 md:p-4 border border-slate-700 shadow-[0_14px_30px_rgba(2,6,23,0.45)]">
        <div className="absolute -top-10 -left-8 w-36 h-36 rounded-full bg-[#05ADCF]/20 blur-2xl" />
        <div className="absolute -bottom-12 -right-6 w-40 h-40 rounded-full bg-cyan-400/20 blur-2xl" />
        <p className="relative text-xs text-slate-300 mb-1">{t("chatbot_ai_assistant_portal")}</p>
        <h2 className="relative text-lg md:text-xl font-black text-white">{t("chatbot_welcome_to_campus_assistant")}</h2>
        <p className="relative text-xs md:text-sm text-slate-300 mt-1.5 leading-5">{t("chatbot_one_platform_for_smart_chat_gpa_campus_m")}</p>
        <div className="relative mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1.5 border border-white/15">
          <div className="w-6 h-6 rounded-full bg-[#05ADCF]/20 text-[#74e8ff] flex items-center justify-center">
            <User size={13} />
          </div>
          <div className="text-[11px] text-slate-200">
            <span className="font-semibold">{loggedUser?.name || t("chatbot_user")}</span>
            <span className="mx-1 text-slate-400">•</span>
            <span className="text-slate-300">{loggedUser?.username || loggedUser?.studentId || "ID"}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {homeCards.map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.id} onClick={() => onNavigate(card.action)} className="group text-right rounded-xl bg-white border border-slate-200 p-3 shadow-[0_6px_18px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(5,173,207,0.18)] transition-all">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#05ADCF]/10 text-[#05ADCF] flex items-center justify-center"><Icon size={17} /></div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{t("chatbot_open")}</span>
              </div>
              <h3 className="mt-2 text-[13px] font-bold text-slate-800">{card.title}</h3>
              <p className="mt-1 text-[11px] text-slate-500 leading-4.5">{card.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChatModeSelector({ aiMode, setAiMode }) {
  const { t, i18n } = useTranslation("global");
  const isAr = String(i18n.language || "ar").toLowerCase().startsWith("ar");
  const [isOpen, setIsOpen] = useState(false);
  const [fileToolsExpanded, setFileToolsExpanded] = useState(false);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.top - 8,
        left: isAr ? rect.left : rect.right,
      });
    }
  }, [isOpen, isAr]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setFileToolsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getLabel = () => {
    if (aiMode === "translation") return isAr ? "ترجمة" : "Translation";
    if (aiMode === "summarization") return isAr ? "تلخيص" : "Summarization";
    return isAr ? "المحادثة العامة" : "General Chat";
  };

  return (
    <>
      <button 
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        title={getLabel()}
        className={`w-8 h-8 rounded-xl transition flex items-center justify-center ${isOpen ? "bg-[#05ADCF]/10 text-[#05ADCF]" : "bg-transparent hover:bg-slate-100 text-slate-600"}`}
      >
        {aiMode === "translation" ? (
          <Languages size={18} className="text-[#05ADCF]" />
        ) : aiMode === "summarization" ? (
          <FileText size={18} className="text-[#05ADCF]" />
        ) : (
          <Sparkles size={18} />
        )}
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          onClick={(e) => e.stopPropagation()}
          className="fixed w-56 bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] border border-slate-200 p-2 text-slate-800 flex flex-col gap-1 cursor-default"
          style={{
            zIndex: 99999,
            top: "auto",
            bottom: `${window.innerHeight - dropdownPos.top}px`,
            ...(isAr ? { left: `${dropdownPos.left}px` } : { right: `${window.innerWidth - dropdownPos.left}px` }),
          }}
          dir={isAr ? "rtl" : "ltr"}
        >
          <button 
            onClick={() => { setAiMode("general"); setIsOpen(false); setFileToolsExpanded(false); }}
            className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg transition ${aiMode === "general" ? "bg-[#05ADCF]/10 text-[#05ADCF]" : "hover:bg-slate-50"}`}
          >
            <div className="flex flex-col items-start">
              <span className="text-[12px] font-bold">{isAr ? "المحادثة العامة" : "General Chat"}</span>
              <span className={`text-[10px] mt-0.5 ${aiMode === "general" ? "text-[#05ADCF]/70" : "text-slate-500"}`}>{isAr ? "محادثة ذكية بدون ملفات" : "Smart chat without files"}</span>
            </div>
            {aiMode === "general" && <Check size={14} className="text-[#05ADCF]" />}
          </button>
          
          <div>
            <button 
              onClick={() => setFileToolsExpanded(!fileToolsExpanded)}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg hover:bg-slate-50 transition"
            >
              <div className="flex flex-col items-start">
                <span className="text-[12px] font-bold">{isAr ? "أدوات ذكية" : "AI Tools"}</span>
                <span className="text-[10px] text-slate-500 mt-0.5">{isAr ? "ترجمة وتلخيص بالذكاء الاصطناعي" : "AI translation & summarization"}</span>
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${fileToolsExpanded ? "rotate-180" : "rotate-0"}`} />
            </button>
            
            <div className={`overflow-hidden transition-all duration-200 ${fileToolsExpanded ? "max-h-40 opacity-100 mt-1" : "max-h-0 opacity-0"}`}>
              <div className="pr-2 pl-2 flex flex-col gap-0.5">
                <button 
                  onClick={() => { setAiMode("translation"); setIsOpen(false); setFileToolsExpanded(false); }}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg transition ${aiMode === "translation" ? "bg-[#05ADCF]/10 text-[#05ADCF]" : "hover:bg-slate-50 text-slate-700"}`}
                >
                  <Languages size={14} className={aiMode === "translation" ? "text-[#05ADCF]" : "text-slate-400"} />
                  <span className="text-[11px] font-semibold">{isAr ? "ترجمة (Translation)" : "Translation"}</span>
                  {aiMode === "translation" && <Check size={12} className="mr-auto ml-auto" />}
                </button>
                <button 
                  onClick={() => { setAiMode("summarization"); setIsOpen(false); setFileToolsExpanded(false); }}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg transition ${aiMode === "summarization" ? "bg-[#05ADCF]/10 text-[#05ADCF]" : "hover:bg-slate-50 text-slate-700"}`}
                >
                  <FileText size={14} className={aiMode === "summarization" ? "text-[#05ADCF]" : "text-slate-400"} />
                  <span className="text-[11px] font-semibold">{isAr ? "تلخيص (Summarization)" : "Summarization"}</span>
                  {aiMode === "summarization" && <Check size={12} className="mr-auto ml-auto" />}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function ChatTab({ launchIntent }) {
  const { t, i18n } = useTranslation("global");
  const { isDarkMode } = useContext(ThemeContext);
  const isAr = isArabicLanguage(i18n.language);
  const serviceQuickActions = useMemo(() => getServiceQuickActions(t), [t]);
  const suggestedPrompts = useMemo(() => getSuggestedPrompts(t), [t]);
  const loggedUser = useMemo(() => getLoggedUser(), []);
  const isStudentRole = String(loggedUser?.role || "").toLowerCase() === "student";
  const hasLoggedIdentity = Boolean(
    loggedUser?.id || loggedUser?.userId || loggedUser?.username || loggedUser?.studentId
  );
  const currentStudentId = isStudentRole ? (loggedUser?.studentId || loggedUser?.username || null) : null;

  const [sessions, setSessions] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("campusAssistantChats") || "[]");
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((session) => ({
          ...session,
          mode: session?.mode || "general",
          studentId: session?.studentId || currentStudentId,
          studentName: session?.studentName || loggedUser?.name || t("chatbot_student"),
          conversationStatus: String(session?.conversationStatus || (session?.mode === "service" ? "active" : "")).trim().toLowerCase() || null,
          conversationRating: session?.conversationRating || null,
          assignedAdminName: session?.assignedAdminName || null,
        }));
      }
      return [createSession("general", loggedUser, t)];
    } catch { return [createSession("general", loggedUser, t)]; }
  });
  const [activeSessionId, setActiveSessionId] = useState(() => localStorage.getItem("campusAssistantActiveChat") || null);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [promptPage, setPromptPage] = useState(0);
  const [promptPagesCount, setPromptPagesCount] = useState(1);
  const [showServiceActionsInLongChat, setShowServiceActionsInLongChat] = useState(false);
  const [serviceRatingScore, setServiceRatingScore] = useState(0);
  const [serviceRatingComment, setServiceRatingComment] = useState("");

  const [submittingServiceRating, setSubmittingServiceRating] = useState(false);
  
  const [aiMode, setAiMode] = useState("general");
  const [selectedFile, setSelectedFile] = useState(null);

  const chatRef = useRef(null);
  const promptsRef = useRef(null);

  useEffect(() => { if (!activeSessionId && sessions.length) setActiveSessionId(sessions[0].id); }, [activeSessionId, sessions]);
  useEffect(() => { localStorage.setItem("campusAssistantChats", JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { if (activeSessionId) localStorage.setItem("campusAssistantActiveChat", activeSessionId); }, [activeSessionId]);
  const activeSession = useMemo(() => sessions.find((s) => s.id === activeSessionId) || sessions[0], [sessions, activeSessionId]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [activeSession?.messages, isLoading]);
  useEffect(() => {
    let cancelled = false;
    const loadPersistedGeneralHistory = async () => {
      if (!hasLoggedIdentity) return;
      try {
        const data = await apiFetch("/api/chat/history?limit=25");
        if (cancelled || !Array.isArray(data) || !data.length) return;

        const persistedGeneralSessions = data.map((conv) => {
          const rawMessages = Array.isArray(conv?.messages) ? conv.messages : [];
          const mappedMessages = rawMessages.map((msg, idx) => ({
            id: msg?.id || `hist-${conv?.conversation_id || "conv"}-${idx}`,
            role: msg?.sender_type === "student" ? "user" : "model",
            text: msg?.text || "",
            timestamp: msg?.created_at || new Date().toISOString(),
            senderType: msg?.sender_type || "",
            senderName: msg?.sender_name || "",
            isRead: Boolean(msg?.is_read),
          }));
          const firstUserMessage = mappedMessages.find((m) => m.role === "user")?.text || "";
          return {
            id: `chat-db-${conv?.conversation_id || Math.random().toString(36).slice(2, 8)}`,
            title: firstUserMessage ? firstUserMessage.slice(0, 32) : t("chatbot_new_chat"),
            mode: "general",
            studentId: currentStudentId,
            studentName: loggedUser?.name || t("chatbot_student"),
            conversationId: conv?.conversation_id || null,
  conversationStatus: String(conv?.status || "active").trim().toLowerCase() || "active",
            conversationRating: null,
            assignedAdminName: null,
            messages: mappedMessages.length ? mappedMessages : [createMessage("model", t("chatbot_hi_i_m_campus_assistant_how_can_i_help"))],
            updatedAt: conv?.updated_at || new Date().toISOString(),
          };
        });

        setSessions((prev) => {
          const localServiceOrUnsynced = prev.filter((session) => session.mode === "service" || !session?.conversationId);
          const byKey = new Map();
          [...persistedGeneralSessions, ...localServiceOrUnsynced].forEach((session) => {
            const key = session?.conversationId || session?.id;
            if (!byKey.has(key)) byKey.set(key, session);
          });
          const merged = Array.from(byKey.values()).sort(
            (a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime()
          );
          setActiveSessionId((prevActive) => {
            if (prevActive && merged.some((s) => s.id === prevActive)) return prevActive;
            return merged[0]?.id || null;
          });
          return merged;
        });
      } catch {
        // If history endpoint is unavailable, keep local storage fallback.
      }
    };

    loadPersistedGeneralHistory();
    return () => {
      cancelled = true;
    };
  }, [hasLoggedIdentity, currentStudentId, loggedUser?.name, t]);

  useEffect(() => {
    const el = promptsRef.current;
    if (!el) return;
    const updatePages = () => setPromptPagesCount(Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth)));
    updatePages();
    window.addEventListener("resize", updatePages);
    return () => window.removeEventListener("resize", updatePages);
  }, []);

  const createNewChat = (mode = "general") => {
    const session = createSession(mode, loggedUser, t);
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setHistoryDrawerOpen(false);
    return session;
  };
  const updateSessionById = useCallback((sessionId, updater) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? updater(s) : s)));
  }, []);
  const updateActive = (updater) => setSessions((prev) => prev.map((s) => (s.id === activeSession.id ? updater(s) : s)));

  const syncServiceSession = useCallback(
    async (conversationId, sessionId) => {
      if (!conversationId || !sessionId || !currentStudentId) return;
      try {
        const [data, studentConversations, rating] = await Promise.all([
          liveChatService.getConversationMessages(conversationId, { viewer: "student", studentId: currentStudentId }),
          liveChatService.getStudentConversations().catch(() => []),
          liveChatService.getConversationRating(conversationId).catch(() => null),
        ]);
        const conversationMeta = (Array.isArray(studentConversations) ? studentConversations : []).find((conv) => conv.id === conversationId) || null;
        const remoteMessages = (Array.isArray(data) ? data : (Array.isArray(data?.messages) ? data.messages : [])).map(mapLiveMessageToUi);
        const latestAdminMessage = [...remoteMessages].reverse().find((msg) => msg.senderType === "admin" && msg.senderName);
        updateSessionById(sessionId, (session) => ({
          ...session,
          conversationId,
          conversationStatus: String(conversationMeta?.status || session?.conversationStatus || "active").trim().toLowerCase(),
          conversationRating: rating || session?.conversationRating || null,
          assignedAdminName: latestAdminMessage?.senderName || session?.assignedAdminName || null,
          updatedAt: data?.conversation?.updated_at || new Date().toISOString(),
          messages: remoteMessages.length ? remoteMessages : session.messages,
        }));
        await liveChatService.markConversationRead(conversationId, { reader_type: "student", reader_id: currentStudentId });
      } catch {
        // Non-blocking: keep local messages if sync temporarily fails.
      }
    },
    [currentStudentId, updateSessionById]
  );

  const openOrCreateServiceSession = useCallback(async () => {
    if (!currentStudentId || !isStudentRole) return;
    const sameStudentServiceSessions = sessions.filter(
      (session) => session.mode === "service" && (session?.studentId || null) === currentStudentId
    );
    const serviceSessionActive = sameStudentServiceSessions.find(
      (session) => String(session?.conversationStatus || "active").toLowerCase() !== "closed"
    );
    const serviceSessionClosedUnrated = sameStudentServiceSessions.find(
      (session) =>
        String(session?.conversationStatus || "").toLowerCase() === "closed" &&
        !session?.conversationRating?.score
    );
    let serviceSession = serviceSessionActive || serviceSessionClosedUnrated || null;
    if (!serviceSession) {
      serviceSession = createSession("service", loggedUser, t);
      setSessions((prev) => [serviceSession, ...prev]);
    }
    setActiveSessionId(serviceSession.id);

    let conversationId = serviceSession.conversationId;
    if (!conversationId && String(serviceSession?.conversationStatus || "").toLowerCase() === "closed") {
      const replacement = createSession("service", loggedUser, t);
      setSessions((prev) => [replacement, ...prev]);
      setActiveSessionId(replacement.id);
      serviceSession = replacement;
      conversationId = replacement.conversationId;
    }
    if (!conversationId) {
      const ensured = await liveChatService.ensureStudentConversation({
        studentId: currentStudentId,
        studentName: loggedUser?.name || t("chatbot_student"),
      });
      conversationId = ensured?.id || ensured?.conversation?.id || null;
      updateSessionById(serviceSession.id, (session) => ({
        ...session,
        title: t("chatbot_student_services"),
        studentId: currentStudentId,
        studentName: loggedUser?.name || t("chatbot_student"),
        conversationId: conversationId || session.conversationId,
          conversationStatus: "active",
          assignedAdminName: session?.assignedAdminName || null,
        updatedAt: ensured?.updated_at || ensured?.conversation?.updated_at || new Date().toISOString(),
      }));
    }

    if (conversationId) {
      await syncServiceSession(conversationId, serviceSession.id);
    }
  }, [currentStudentId, isAr, isStudentRole, loggedUser, sessions, syncServiceSession, updateSessionById]);

  useEffect(() => {
    if (!launchIntent?.stamp) return;

    if (launchIntent.type === "service") {
      openOrCreateServiceSession();
      return;
    }

    if (launchIntent.type === "general") {
      setSessions((prev) => {
        const existingGeneral = prev.find((session) => session.mode !== "service" && (session?.studentId || null) === currentStudentId);
        if (existingGeneral) {
          setActiveSessionId(existingGeneral.id);
          return prev;
        }
        const generalSession = createSession("general", loggedUser, t);
        setActiveSessionId(generalSession.id);
        return [generalSession, ...prev];
      });
    }
  }, [launchIntent?.stamp, currentStudentId, loggedUser, openOrCreateServiceSession]);

  useEffect(() => {
    if (activeSession?.mode !== "service" || !activeSession?.conversationId || !activeSession?.id || !currentStudentId) return;
    const conversationId = activeSession.conversationId;
    const sessionId = activeSession.id;

    const tick = async () => {
      await liveChatService.updateStudentPresence(conversationId, { studentId: currentStudentId, isOnline: true }).catch(() => null);
      await syncServiceSession(conversationId, sessionId);
    };
    tick();
    const intervalId = setInterval(tick, SERVICE_POLL_MS);

    return () => {
      clearInterval(intervalId);
      liveChatService.updateStudentPresence(conversationId, { studentId: currentStudentId, isOnline: false }).catch(() => null);
    };
  }, [activeSession?.conversationId, activeSession?.id, activeSession?.mode, currentStudentId, syncServiceSession]);

  const shouldCreateFeedbackFromPrompt = useCallback((text) => {
    const value = String(text || "").trim().toLowerCase();
    if (!value) return false;
    const explicitComplaintAction = String(t("chatbot_submit_a_complaint") || "").trim().toLowerCase();
    if (explicitComplaintAction && value === explicitComplaintAction) return true;
    return ["شكوى", "مشكلة", "complaint", "issue", "problem"].some((keyword) => value.includes(keyword));
  }, [t]);

  const sendMessage = async (presetText) => {
    const prompt = (presetText || userInput).trim();
    if ((!prompt && !selectedFile) || isLoading || !activeSession) return;
    const isServiceMessage = activeSession.mode === "service";
    if (isServiceMessage && String(activeSession?.conversationStatus || "").trim().toLowerCase() === "closed") {
      // Allow students to continue the same thread; backend reactivates it on next message.
      updateSessionById(activeSession.id, (s) => ({ ...s, conversationStatus: "active" }));
    }
    updateActive((s) => ({
      ...s,
      studentId: s?.studentId || currentStudentId,
      studentName: s?.studentName || loggedUser?.name || t("chatbot_student"),
      title: (s.title === t("chatbot_new_chat") || s.title === t("chatbot_student_services")) ? (prompt || selectedFile?.name || "ملف").slice(0, 32) : s.title,
      updatedAt: new Date().toISOString(),
      messages: [...s.messages, createMessage("user", prompt, isServiceMessage ? { isRead: false, isServiceMessage: true, senderType: "student", attachedFile: selectedFile?.name, attachedFileUrl: selectedFile ? URL.createObjectURL(selectedFile) : null } : { attachedFile: selectedFile?.name, attachedFileUrl: selectedFile ? URL.createObjectURL(selectedFile) : null })]
    }));
    setUserInput(""); 
    setSelectedFile(null);
    setIsLoading(true);
    try {
      if (isServiceMessage) {
        if (!isStudentRole) {
          throw new Error("Student services chat is available for student accounts only");
        }
        let conversationId = activeSession.conversationId;
        if (!conversationId) {
          const ensured = await liveChatService.ensureStudentConversation({
            studentId: currentStudentId,
            studentName: loggedUser?.name || t("chatbot_student"),
          });
          conversationId = ensured?.id || ensured?.conversation?.id || null;
          if (conversationId) {
            updateSessionById(activeSession.id, (s) => ({
              ...s,
              conversationId,
              conversationStatus: "active",
              updatedAt: ensured?.updated_at || ensured?.conversation?.updated_at || new Date().toISOString(),
            }));
          }
        }
        if (!conversationId) {
          throw new Error(t("chatbot_could_not_create_student_services_conver"));
        }

        if (shouldCreateFeedbackFromPrompt(prompt)) {
          // Link complaint tickets with live chat by embedding conversation id in feedback message.
          await apiFetch("/api/feedback", {
            method: "POST",
            body: JSON.stringify({ message: `[LiveChat:${conversationId}] ${prompt}` }),
          }).catch(() => null);
        }

        await liveChatService.sendStudentMessage(conversationId, {
          studentId: currentStudentId,
          studentName: loggedUser?.name || t("chatbot_student"),
          text: prompt,
        });
        await syncServiceSession(conversationId, activeSession.id);
      } else {
        if (aiMode === "translation") {
          // Mock translation or throw error indicating it's not connected yet
          await new Promise(resolve => setTimeout(resolve, 1000));
          throw new Error("Translation API is not connected yet.");
        } else if (aiMode === "summarization") {
          // Mock summarization or throw error indicating it's not connected yet
          if (!selectedFile) {
            throw new Error("Please select a file to summarize.");
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          throw new Error("Summarization API is not connected yet.");
        }

        // Only hit the General Chat (ngrok) API if aiMode is 'general'
        const res = await fetch("https://remindful-tattle-audience.ngrok-free.dev/ask", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "ngrok-skip-browser-warning": "true"
          },
          body: JSON.stringify({
            ask: prompt.trim(),
            enhance_query: false,
            history: [],
          }),
        });

        if (!res.ok) {
          throw new Error("API request failed");
        }

        const data = await res.json();
        console.log("RAG Response:", data);
        
        const responseType = null;
        const responseText = typeof data === "string" ? data : data?.answer || "عذراً، لم أتمكن من الحصول على إجابة.";

        updateActive((s) => ({
          ...s,
          conversationId: s.conversationId || `ngrok-${Date.now()}`,
          messages: [
            ...s.messages,
            createMessage("model", responseText, {
              responseType,
              source: null,
              actions: [],
              sources: Array.isArray(data?.top_3_pages) ? data.top_3_pages.map(p => `Page ${p}`) : [],
              assets: [],
              relatedContent: [],
              display: null,
            }),
          ],
        }));
      }
    } catch (e) {
      let errorMessage = isAr ? "حدث خطأ أثناء جلب الإجابة، حاول مرة أخرى." : "An error occurred while fetching the answer, try again.";
      if (e.message === "Translation API is not connected yet.") {
        errorMessage = isAr ? "عذراً، سيتم ربط API الترجمة قريباً. (غير متصل حالياً)" : "Translation API will be connected soon. (Not connected currently)";
      } else if (e.message === "Summarization API is not connected yet.") {
        errorMessage = isAr ? "عذراً، سيتم ربط API التلخيص قريباً. (غير متصل حالياً)" : "Summarization API will be connected soon. (Not connected currently)";
      } else if (e.message === "Please select a file to summarize.") {
        errorMessage = isAr ? "الرجاء اختيار ملف (PDF أو DOCX) للتلخيص أولاً من علامة الرفع ⬆️." : "Please select a file to summarize first.";
      } else if (isServiceMessage) {
        errorMessage = `${t("chatbot_error_while_contacting_student_services")}: ${e.message}`;
      }

      updateActive((s) => ({
        ...s,
        messages: [...s.messages, createMessage("model", errorMessage)],
      }));
    } finally { setIsLoading(false); }
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert(t("chatbot_your_browser_does_not_support_speech_to_"));
    const recognition = new SpeechRecognition(); recognition.lang = "ar-EG"; recognition.start(); setIsRecording(true);
    recognition.onresult = (e) => { setUserInput(e.results[0][0].transcript); setIsRecording(false); };
    recognition.onerror = recognition.onend = () => setIsRecording(false);
  };

  const removeSession = (sessionId) => {
    const next = sessions.filter((s) => s.id !== sessionId);
    if (!next.length) { const one = createSession("general", loggedUser, t); setSessions([one]); setActiveSessionId(one.id); return; }
    setSessions(next); if (activeSessionId === sessionId) setActiveSessionId(next[0].id);
  };
  const handleSelectSession = (sessionId) => {
    setActiveSessionId(sessionId);
    setHistoryDrawerOpen(false);
    const selected = sessions.find((session) => session.id === sessionId);
    if (selected?.mode === "service" && selected?.conversationId) {
      syncServiceSession(selected.conversationId, selected.id);
    }
  };

  const isServiceMode = activeSession?.mode === "service";
  const isServiceClosed = isServiceMode && String(activeSession?.conversationStatus || "").trim().toLowerCase() === "closed";
  const hasServiceRating = Boolean(activeSession?.conversationRating?.score);
  const serviceMessageCount = activeSession?.mode === "service" ? (activeSession?.messages?.length || 0) : 0;
  const serviceUserMessageCount = activeSession?.mode === "service"
    ? (activeSession?.messages?.filter((m) => m.role === "user").length || 0)
    : 0;
  const showLargeServiceActions = isServiceMode && !isServiceClosed && serviceUserMessageCount === 0;
  const isLongServiceChat = isServiceMode && serviceMessageCount >= 10;
  const showCompactServiceActions = isServiceMode && !isServiceClosed && serviceUserMessageCount > 0 && (!isLongServiceChat || showServiceActionsInLongChat);

  useEffect(() => {
    setShowServiceActionsInLongChat(false);
    setServiceRatingScore(0);
    setServiceRatingComment("");
  }, [activeSession?.id]);

  const submitServiceRating = async () => {
    if (!activeSession?.conversationId || !isServiceClosed || submittingServiceRating) return;
    if (!serviceRatingScore) return;
    try {
      setSubmittingServiceRating(true);
      const data = await liveChatService.submitConversationRating(activeSession.conversationId, {
        score: serviceRatingScore,
        comment: serviceRatingComment,
      });
      const ratingLabel = isAr ? `تقييم خدمة العملاء: ${serviceRatingScore}/5` : `Service rating: ${serviceRatingScore}/5`;
      const ratingComment = String(serviceRatingComment || "").trim();
      const feedbackText = `[CSAT:${activeSession.conversationId}] ${ratingLabel}${ratingComment ? ` - ${ratingComment}` : ""}`;
      await apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ message: feedbackText }),
      }).catch(() => null);
      updateSessionById(activeSession.id, (s) => ({
        ...s,
        conversationRating: data || { score: serviceRatingScore, comment: serviceRatingComment },
      }));
    } catch (e) {
      updateActive((s) => ({
        ...s,
        messages: [...s.messages, createMessage("model", `${isAr ? "تعذر حفظ التقييم" : "Could not save rating"}: ${e.message}`)],
      }));
    } finally {
      setSubmittingServiceRating(false);
    }
  };

  const onPromptsScroll = () => {
    const el = promptsRef.current;
    if (!el || promptPagesCount <= 1) return;
    const maxScroll = Math.max(1, el.scrollWidth - el.clientWidth);
    const progress = Math.min(1, Math.abs(el.scrollLeft) / maxScroll);
    setPromptPage(Math.round(progress * (promptPagesCount - 1)));
  };
  const goToPromptPage = (index) => {
    const el = promptsRef.current;
    if (!el) return;
    el.scrollTo({ left: (el.scrollWidth / promptPagesCount) * index, behavior: "smooth" });
    setPromptPage(index);
  };

  return (
    <div className="chatbot-chat-tab relative h-full flex bg-slate-50 overflow-hidden" dir="rtl">
      <div
        className={`chatbot-history-overlay absolute inset-0 z-20 transition-all duration-300 ${
          historyDrawerOpen ? "chatbot-history-overlay--open bg-slate-900/25 opacity-100 pointer-events-auto" : "bg-transparent opacity-0 pointer-events-none"
        }`}
        onClick={() => setHistoryDrawerOpen(false)}
      >
        <aside
          className={`chatbot-history-drawer absolute right-0 top-0 h-full w-[80%] sm:w-[84%] max-w-[320px] bg-white border-l border-slate-200/80 shadow-[0_24px_55px_rgba(2,32,44,0.18)] rounded-l-3xl transition-transform duration-300 ${
            historyDrawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <HistoryPanel
            sessions={sessions}
            activeSessionId={activeSession?.id}
            onSelect={handleSelectSession}
            onCreate={createNewChat}
            onDelete={removeSession}
            onClose={() => setHistoryDrawerOpen(false)}
          />
        </aside>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="chatbot-chat-header px-2.5 sm:px-3 py-2 border-b border-white/70 bg-white/55 backdrop-blur-2xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={(e) => { e.stopPropagation(); setHistoryDrawerOpen(true); }} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Menu size={16} /></button>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{activeSession?.title || t("chatbot_chat_2")}</p>
            </div>
          </div>
          <button onClick={() => createNewChat(isServiceMode ? "service" : "general")} className="px-2.5 py-1.5 rounded-lg bg-[#05ADCF] text-white text-[11px] font-semibold hover:bg-[#0493b1] transition whitespace-nowrap">{t("chatbot_new_chat_2")}</button>
        </div>

        {(showLargeServiceActions || showCompactServiceActions || (isServiceMode && isLongServiceChat)) && (
          <div className="px-3 py-2 bg-[#05ADCF]/8 border-b border-[#05ADCF]/20">
            {activeSession?.assignedAdminName && (
              <div className="mb-2 text-[11px] text-[#036f86] font-semibold">
                {isAr ? `مرحبًا، معك ${activeSession.assignedAdminName} وأنا في خدمتك.` : `Hi, this is ${activeSession.assignedAdminName}. I'm here to help.`}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-1 rounded-full bg-[#05ADCF]/15 text-[#0389a4] font-bold">{t("chatbot_student_services")}</span>
                <span className="text-[11px] text-slate-500">{t("chatbot_choose_a_quick_action")}</span>
              </div>
              {isLongServiceChat && (
                <button
                  type="button"
                  onClick={() => setShowServiceActionsInLongChat((prev) => !prev)}
                  className="text-[11px] text-[#0389a4] underline underline-offset-2 hover:text-[#026f86]">
                  {showServiceActionsInLongChat ? (isAr ? "إخفاء الخيارات" : "Hide actions") : (isAr ? "إظهار الخيارات السريعة" : "Show quick actions")}
                </button>
              )}
            </div>
            {(showLargeServiceActions || showCompactServiceActions) && (
              <div className={`flex flex-wrap gap-2 ${showLargeServiceActions ? "" : "opacity-95"}`}>
                {serviceQuickActions.map((a) => (
                  <button
                    key={a}
                    onClick={() => sendMessage(a)}
                    className={`rounded-full border transition ${
                      showLargeServiceActions
                        ? "text-xs px-3 py-1.5 bg-white border-slate-200 hover:border-[#05ADCF]/35 hover:bg-[#05ADCF]/5"
                        : "text-[11px] px-2.5 py-1 bg-slate-100 border-slate-200 hover:bg-[#05ADCF]/10 hover:border-[#05ADCF]/30"
                    }`}>
                    {a}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div ref={chatRef} className="chatbot-chat-scroll dot-scroll flex-1 overflow-y-auto p-2.5 sm:p-3 bg-gradient-to-b from-slate-50 to-white">
          {activeSession?.messages?.length === 1 && !isLoading && <div className="text-center text-slate-400 text-xs mb-6">{t("chatbot_ask_me_about_admission_gpa_registration_")}</div>}
          {activeSession?.messages?.map((m) => <ChatBubble key={m.id} message={m} />)}
          {isLoading && <LoadingIndicator />}
        </div>


          {isServiceClosed && (
            <div className="px-3 pb-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                {!hasServiceRating ? (
                  <>
                    <p className="text-xs font-bold text-slate-700 mb-2">{isAr ? "قيّم خدمة العملاء" : "Rate student services"}</p>
                  <div className="flex items-center gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button key={score} type="button" onClick={() => setServiceRatingScore(score)} className="p-1">
                        <Star size={18} className={score <= serviceRatingScore ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={serviceRatingComment}
                    onChange={(e) => setServiceRatingComment(e.target.value)}
                    placeholder={isAr ? "تعليق اختياري" : "Optional comment"}
                    className="w-full resize-none rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-[#05ADCF]"
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={submitServiceRating}
                    disabled={!serviceRatingScore || submittingServiceRating}
                    className="mt-2 rounded-lg bg-[#05ADCF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {submittingServiceRating ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "إرسال التقييم" : "Submit rating")}
                  </button>
                </>
              ) : (
                <div className="space-y-1">
                  <div className="text-xs text-emerald-700 font-semibold">
                    {isAr ? "شكرًا لتقييمك لخدمة العملاء." : "Thanks for rating student services."}
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <Star key={`rated-${score}`} size={14} className={score <= Number(activeSession?.conversationRating?.score || 0) ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
                    ))}
                  </div>
                  {activeSession?.conversationRating?.comment ? (
                    <div className="text-[11px] text-slate-600">{activeSession.conversationRating.comment}</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="chatbot-chat-composer p-2.5 sm:p-3 border-t border-slate-200 bg-white">


           <div className="flex flex-col gap-1.5">
              {selectedFile && !isServiceMode && aiMode === "summarization" && (
                <div className="flex items-center gap-2 bg-[#05ADCF]/10 text-[#05ADCF] px-3 py-1.5 rounded-lg w-fit ml-auto mr-2 sm:mr-3 border border-[#05ADCF]/20">
                  <FileText size={14} />
                  <span className="text-xs font-semibold max-w-[200px] truncate">{selectedFile.name}</span>
                  <button onClick={() => setSelectedFile(null)} className="hover:bg-[#05ADCF]/20 rounded-full p-0.5 transition">
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5 sm:p-2 flex items-center gap-1 sm:gap-1.5">
                <input
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={t("chatbot_type_your_question_here")}
                  disabled={isLoading}
                  className="flex-1 bg-transparent px-2 py-2 text-[13px] sm:text-sm outline-none"
                />
                {!isServiceMode && <ChatModeSelector aiMode={aiMode} setAiMode={setAiMode} />}
                {!isServiceMode && aiMode === "summarization" && (
                  <>
                    <input type="file" id="chat-file-upload" className="hidden" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        if (file.name.endsWith('.pdf') || file.name.endsWith('.docx')) {
                          setSelectedFile(file);
                        } else {
                          alert(isAr ? "يرجى اختيار ملف بصيغة PDF أو DOCX فقط." : "Please select a PDF or DOCX file only.");
                          e.target.value = null;
                        }
                      }
                    }} />
                    <button
                      onClick={() => document.getElementById('chat-file-upload').click()}
                      title={isAr ? "رفع ملف للتلخيص" : "Upload file for summarization"}
                      className={`w-8 h-8 rounded-xl transition flex items-center justify-center ${selectedFile ? "bg-[#05ADCF]/10 text-[#05ADCF]" : "bg-transparent hover:bg-slate-100 text-slate-600"}`}
                    >
                      <Upload size={16} />
                    </button>
                  </>
                )}
                <button onClick={startRecording} disabled={isLoading} className={`w-8 h-8 rounded-xl transition flex items-center justify-center ${isRecording ? "bg-red-500 text-white" : "bg-transparent hover:bg-slate-200 text-slate-600"}`}>{isRecording ? <LuAudioLines size={16} /> : <Mic size={16} />}</button>
                <button onClick={() => sendMessage()} disabled={isLoading} className="w-8 h-8 rounded-xl bg-[#05ADCF] text-white hover:bg-[#0494b1] transition flex items-center justify-center disabled:opacity-50"><Send size={15} /></button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ sessions, activeSessionId, onSelect, onCreate, onDelete, onClose }) {
  const { t, i18n } = useTranslation("global");
  const { isDarkMode } = useContext(ThemeContext);
  const [activeTab, setActiveTab] = useState("general");

  const formatUpdatedAt = (value) => {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    const locale = isArabicLanguage(i18n.language) ? "ar-EG" : "en-GB";
    return date.toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const filteredSessions = sessions.filter(s => {
    if (activeTab === "service") return s.mode === "service";
    return s.mode !== "service";
  });

  return (
    <div className="chatbot-history-panel h-full flex flex-col bg-gradient-to-b from-[#f8fcff] to-white">
      <div className="flex flex-col gap-3 px-4 py-3 border-b border-slate-200/80">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-black text-slate-800">{isArabicLanguage(i18n.language) ? "سجل المحادثات" : "Chat History"}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:border-slate-300 transition flex items-center justify-center"
          >
            <X size={15} />
          </button>
        </div>
          
        <div className="flex items-center bg-slate-100/80 rounded-lg p-1 border border-slate-200/50">
          <button
            type="button"
            title={isArabicLanguage(i18n.language) ? "الذكاء الاصطناعي" : "AI Chat"}
            onClick={() => setActiveTab("general")}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md transition ${activeTab === "general" ? "bg-white text-[#05ADCF] shadow-sm border border-slate-200/50 font-bold text-[13px]" : "text-slate-400 hover:text-slate-600 font-semibold text-[13px]"}`}
          >
            <Bot size={15} />
            {isArabicLanguage(i18n.language) ? "الذكاء الاصطناعي" : "AI"}
          </button>
          <button
            type="button"
            title={isArabicLanguage(i18n.language) ? "الدعم الفني" : "Support"}
            onClick={() => setActiveTab("service")}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md transition ${activeTab === "service" ? "bg-white text-[#05ADCF] shadow-sm border border-slate-200/50 font-bold text-[13px]" : "text-slate-400 hover:text-slate-600 font-semibold text-[13px]"}`}
          >
            <MessageCircle size={15} />
            {isArabicLanguage(i18n.language) ? "الدعم الفني" : "Support"}
          </button>
        </div>
      </div>

      {activeTab !== "service" && (
        <div className="p-3 border-b border-slate-200/70">
          <button
            type="button"
            onClick={() => onCreate(activeTab)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#05ADCF] text-white py-2.5 text-[13px] font-bold hover:bg-[#0494b1] shadow-[0_10px_18px_rgba(5,173,207,0.22)] transition"
          >
            {`+ ${t("chatbot_new_chat_2") || "محادثة جديدة"}`.replace(/\+\s*\+/g, "+")}
          </button>
        </div>
      )}

      <div className="dot-scroll flex-1 overflow-y-auto px-2 py-2.5">
        {!filteredSessions.length && (
          <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
            {activeTab === "service" ? <MessageCircle size={32} className="opacity-20" /> : <Bot size={32} className="opacity-20" />}
            {t("chatbot_no_chats_yet")}
          </div>
        )}

        <div className="space-y-1.5">
          {filteredSessions.map((s) => {
            const isActive = activeSessionId === s.id;
            return (
              <div
                key={s.id}
                className={`group rounded-2xl border transition ${
                  isActive
                    ? "bg-[#05ADCF]/10 border-[#05ADCF]/35 shadow-[0_6px_14px_rgba(5,173,207,0.12)]"
                    : "bg-white border-slate-200/80 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-right"
                    onClick={() => onSelect(s.id)}
                  >
                    <p className={`truncate text-[13px] font-semibold ${isActive ? "text-[#026d84]" : "text-slate-800"}`}>
                      {s.title || t("chatbot_chat_2")}
                    </p>
                    <div className="mt-0.5 flex items-center justify-between text-[10px]">
                      <span className={`${isActive ? "text-[#0389a4]" : "text-slate-400"}`}>
                        {s.mode === "service" ? t("chatbot_student_services") : t("chatbot_chat_2")}
                      </span>
                      <span className={`${isActive ? "text-[#0389a4]" : "text-slate-400"}`}>
                        {formatUpdatedAt(s.updatedAt || s.timestamp)}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(s.id)}
                    title={t("chatbot_delete")}
                    className="chatbot-history-delete h-8 w-8 shrink-0 rounded-xl border border-transparent text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition"
                  >
                    <Trash2 size={15} className="mx-auto" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }) {
  const [previewSrc, setPreviewSrc] = useState(null);
  const [previewPdf, setPreviewPdf] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const isUser = message.role === "user";
  const showReadReceipt = isUser && message?.isServiceMessage && typeof message?.isRead === "boolean";
  const readReceipt = message?.isRead ? "✓✓" : "✓";
  const relatedContent = Array.isArray(message?.relatedContent) ? message.relatedContent : [];
  const assets = Array.isArray(message?.assets) ? message.assets : [];
  const actions = Array.isArray(message?.actions) ? message.actions : [];
  const displayPayload = message?.display && typeof message.display === "object" ? message.display : null;
  const messageType = String(message?.responseType || "").toUpperCase();
  const source = message?.source || null;
  const generalDisclaimer = "⚠️ هذه إجابة عامة وليست من مستندات الجامعة";
  const messageTextRaw = String(message?.text || "");
  const isGeneralMessage = messageType === "GENERAL" || messageTextRaw.includes(generalDisclaimer);
  const isDisplayMessage = !isUser && messageType === "DISPLAY" && Boolean(displayPayload?.file_url || displayPayload?.preview_url);
  const isIndexedMessage = !isUser && Boolean(source) && messageType === "ACADEMIC";
  const botAvatarToneClass = isIndexedMessage
    ? "bg-emerald-100 text-emerald-600 border border-emerald-200"
    : isGeneralMessage
      ? "bg-sky-100 text-sky-600 border border-sky-200"
      : "bg-[#05ADCF]/10 text-[#05ADCF]";
  const displayText = isGeneralMessage
    ? messageTextRaw.replace(generalDisclaimer, "").trim()
    : messageTextRaw;
  const displayUrl = resolveAttachmentUrl(displayPayload?.preview_url || displayPayload?.file_url || "");
  const displayType = String(displayPayload?.content_type || "").toLowerCase();
  const openPdfWithGuard = async (rawUrl) => {
    const resolvedUrl = resolveAttachmentUrl(rawUrl);
    try {
      let response = await fetch(resolvedUrl, { method: "HEAD" });
      if (response.status === 405) {
        response = await fetch(resolvedUrl, { method: "GET" });
      }
      if (!response.ok) throw new Error("missing");
      setPreviewSrc(null);
      setPreviewZoom(1);
      setPreviewPdf(resolvedUrl);
    } catch {
      alert("الملف غير متاح حالياً. غالباً تم حذفه من السيرفر.");
    }
  };
  const renderInlineMarkdown = (textPart) => {
    const parts = String(textPart || "").split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        return (
          <strong key={`md-bold-${idx}`} className="font-bold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={`md-text-${idx}`}>{part}</React.Fragment>;
    });
  };

  const renderMessageText = (rawText) => {
    const normalized = String(rawText || "")
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");

    return (
      <div className="space-y-1">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={`line-empty-${idx}`} className="h-2" />;

          const isBullet = /^[-*•]\s+/.test(trimmed);
          const content = isBullet ? trimmed.replace(/^[-*•]\s+/, "") : trimmed;

          return (
            <p key={`line-${idx}`} className="m-0 leading-relaxed font-normal">
              {isBullet ? <span className="ml-1">• </span> : null}
              {renderInlineMarkdown(content)}
            </p>
          );
        })}
      </div>
    );
  };
  const formatMessageTime = (rawTimestamp) => {
    const parsed = new Date(rawTimestamp);
    if (Number.isNaN(parsed.getTime())) return "--:--";
    return parsed.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  };
  const previewModal = (previewSrc || previewPdf) ? (
    <div
      className="fixed inset-0 z-[1200] bg-black/70 flex items-center justify-center p-4"
      onClick={() => {
        setPreviewSrc(null);
        setPreviewPdf(null);
      }}>
      <div className="relative w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-600">{previewPdf ? "معاينة PDF" : "معاينة الصورة"}</div>
          <div className="flex items-center gap-2">
            <a
              href={previewPdf || previewSrc}
              download={previewPdf ? "attachment.pdf" : `content-image-${Date.now()}.png`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">
              <Download size={14} />
              تنزيل
            </a>
            {!previewPdf && (
              <>
                <button onClick={() => setPreviewZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">-</button>
                <button onClick={() => setPreviewZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">+</button>
              </>
            )}
            <button
              onClick={() => {
                setPreviewSrc(null);
                setPreviewPdf(null);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white">
              <X size={14} />
              إغلاق
            </button>
          </div>
        </div>
        {previewPdf ? (
          <iframe src={previewPdf} title="pdf-preview-modal" className="h-[78vh] w-full rounded-xl border border-slate-200 bg-white" />
        ) : (
          <div className="h-[78vh] overflow-auto rounded-xl bg-slate-50 flex items-center justify-center">
            <img
              src={previewSrc}
              alt="preview"
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.1 : -0.1;
                setPreviewZoom((z) => {
                  const next = z + delta;
                  return Math.max(1, Math.min(3, Number(next.toFixed(2))));
                });
              }}
              className="max-w-full max-h-full object-contain"
              style={{ transform: `scale(${previewZoom})`, transformOrigin: "center center" }}
            />
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className={`flex items-end gap-1.5 sm:gap-2 mb-3 ${isUser ? "justify-start" : "justify-end"}`}>
        {!isUser && (
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${botAvatarToneClass}`}>
            <Bot size={14} />
          </div>
        )}
        <div className={`chatbot-bubble relative max-w-[92%] sm:max-w-[85%] px-3 py-2.5 rounded-2xl text-[13px] sm:text-sm font-sans font-normal shadow-sm leading-[1.75] whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${isUser ? "chatbot-bubble-user bg-[#05ADCF] text-white rounded-bl-md" : "chatbot-bubble-bot bg-white text-gray-800 rounded-br-md border border-slate-200"}`}>
          {message.attachedFile && (
            <button 
              onClick={() => {
                if (message.attachedFile.toLowerCase().endsWith('.pdf') && message.attachedFileUrl) {
                  setPreviewPdf(message.attachedFileUrl);
                } else if (message.attachedFileUrl) {
                  // For DOCX, trigger download/open natively
                  window.open(message.attachedFileUrl, '_blank');
                }
              }}
              className="flex items-center gap-2 bg-black/10 hover:bg-black/20 transition-colors border border-black/5 rounded-lg px-2.5 py-1.5 mb-2 w-fit text-left cursor-pointer" 
              dir="ltr"
            >
              <FileText size={14} className="opacity-80 shrink-0" />
              <span className="text-[12px] font-semibold opacity-90 truncate max-w-[150px] sm:max-w-[200px]">{message.attachedFile}</span>
            </button>
          )}
          {renderMessageText(displayText)}
          {!isUser && isDisplayMessage && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <div className="text-[12px] font-bold text-slate-800">{displayPayload?.title || "محتوى مرتبط"}</div>
              <div className="mt-1 text-[10px] text-slate-500">
                {displayType === "image" ? "صورة" : displayType === "schedule" ? "جدول" : displayType === "guide" ? "دليل" : displayType === "pdf" ? "PDF" : "ملف"}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(displayType === "image" || displayType === "schedule") && displayUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewPdf(null);
                      setPreviewZoom(1);
                      setPreviewSrc(displayUrl);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink size={11} />
                    عرض الصورة
                  </button>
                ) : null}
                {(displayType === "pdf" || displayType === "guide") && displayUrl ? (
                  <button
                    type="button"
                    onClick={() => openPdfWithGuard(displayUrl)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink size={11} />
                    عرض الملف
                  </button>
                ) : null}
                {displayUrl ? (
                  <a
                    href={displayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink size={11} />
                    فتح
                  </a>
                ) : null}
              </div>
            </div>
          )}
          {!isUser && !isDisplayMessage && source && (
            <div className="mt-2 text-[11px] text-slate-500">
              المصدر: <span className="font-semibold text-slate-700">{source}</span>
            </div>
          )}
          {!isUser && !isDisplayMessage && actions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {actions.map((action, idx) => (
                <button
                  key={`action-${idx}-${action}`}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-200"
                  onClick={() => {
                    if (String(action) === "رفع مستند") {
                      alert("يرجى رفع الملف من لوحة الإدارة: إدارة التخزين > رفع مستند للشات");
                      return;
                    }
                    if (String(action) === "عرض الملف") {
                      const firstPdfAsset = assets.find((asset) => {
                        const type = String(asset?.type || "").toLowerCase();
                        return type === "pdf" && asset?.url;
                      });
                      if (firstPdfAsset?.url) {
                        openPdfWithGuard(firstPdfAsset.url);
                        return;
                      }
                      const firstImageAsset = assets.find((asset) => {
                        const type = String(asset?.type || "").toLowerCase();
                        return type === "image" && asset?.url;
                      });
                      if (firstImageAsset?.url) {
                        setPreviewPdf(null);
                        setPreviewZoom(1);
                        setPreviewSrc(resolveAttachmentUrl(firstImageAsset.url));
                        return;
                      }
                      const firstPdf = relatedContent
                        .flatMap((item) => Array.isArray(item?.file_links) ? item.file_links : [])
                        .find((f) => f?.is_pdf && f?.url);
                      if (firstPdf?.url) {
                        openPdfWithGuard(firstPdf.url);
                      } else {
                        alert("لا يوجد ملف مباشر للعرض حالياً.");
                      }
                    }
                  }}
                >
                  {String(action) === "رفع مستند" ? <Upload size={11} /> : null}
                  {String(action) === "عرض الملف" ? <ExternalLink size={11} /> : null}
                  {action}
                </button>
              ))}
            </div>
          )}
          {!isUser && !isDisplayMessage && messageType === "MISSING_DATA" && (
            <div className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              ارفع مستند PDF أو DOCX.
            </div>
          )}
          {!isUser && !isDisplayMessage && relatedContent.length > 0 && (
            <div className="mt-2 space-y-2">
              {relatedContent.map((item, itemIndex) => (
                <div key={`rel-${item?.id || itemIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <div className="text-[12px] font-bold text-slate-800">{item?.subject || "Content"}</div>
                  {item?.snippet && <div className="mt-0.5 text-[11px] text-slate-600 max-h-16 overflow-y-auto">{item.snippet}</div>}
                  {Array.isArray(item?.image_urls) && item.image_urls.length > 0 && (
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      {item.image_urls.map((src, idx) => (
                        <img
                          key={`img-${item?.id || "x"}-${idx}`}
                          src={resolveAttachmentUrl(src)}
                          alt={item?.subject || "attachment"}
                          onClick={() => {
                            setPreviewZoom(1);
                            setPreviewSrc(resolveAttachmentUrl(src));
                          }}
                          className="w-full h-48 object-cover rounded-lg border border-slate-200 bg-white cursor-zoom-in"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                  {Array.isArray(item?.file_links) && item.file_links.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {item.file_links.map((f, fIdx) => (
                        <div key={`file-${item?.id || "x"}-${fIdx}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                          <div className="text-[11px] text-[#0b7f99] font-semibold">
                            {f?.is_pdf ? "PDF مرفق: " : "ملف مرفق: "}
                            {f?.name || "Attachment"}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <a
                              href={resolveAttachmentUrl(f?.url)}
                              download={f?.name || "attachment"}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100">
                              تنزيل
                            </a>
                            {f?.is_pdf && (
                              <button
                                type="button"
                                onClick={() => openPdfWithGuard(f?.url)}
                                className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100">
                                عرض
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!isUser && !isDisplayMessage && assets.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {assets.map((asset, idx) => {
                const type = String(asset?.type || "").toLowerCase();
                const label = String(asset?.label || "Asset").trim();
                const url = String(asset?.url || "").trim();
                const payload = asset?.payload;
                return (
                  <div key={`asset-${idx}-${type}-${label}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                    <div className="text-[11px] font-semibold text-slate-700">
                      {type === "pdf" ? "PDF: " : type === "table" ? "جدول: " : type === "image" ? "صورة: " : "رابط: "}
                      {label}
                    </div>
                    {type === "table" && payload ? (
                      <div className="mt-1 text-[10px] text-slate-600 max-h-24 overflow-y-auto">
                        {typeof payload === "string" ? payload : JSON.stringify(payload)}
                      </div>
                    ) : null}
                    {url ? (
                      <div className="mt-1 flex items-center gap-2">
                        {type === "pdf" ? (
                          <button
                            type="button"
                            onClick={() => openPdfWithGuard(url)}
                            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
                          >
                            عرض
                          </button>
                        ) : null}
                        {type === "image" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewPdf(null);
                              setPreviewZoom(1);
                              setPreviewSrc(resolveAttachmentUrl(url));
                            }}
                            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
                          >
                            عرض الصورة
                          </button>
                        ) : null}
                        <a
                          href={resolveAttachmentUrl(url)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-[#0b7f99] hover:bg-slate-100"
                        >
                          فتح
                        </a>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <p className={`text-[10px] mt-1 flex items-center gap-1 ${isUser ? "text-white/75" : "text-slate-400"}`}>
            <span dir="auto">{formatMessageTime(message.timestamp)}</span>
            {showReadReceipt && <span className={`${message?.isRead ? "text-cyan-100" : "text-white/70"}`}>{readReceipt}</span>}
          </p>
        </div>
        {isUser && <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center"><User size={14} className="text-slate-600" /></div>}
      </div>

      {previewModal && typeof document !== "undefined" ? createPortal(previewModal, document.body) : null}
    </>
  );
}

const LoadingIndicator = () => <div className="flex items-center gap-2 mb-3"><div className="w-7 h-7 rounded-full bg-[#05ADCF]/10 flex items-center justify-center"><Bot size={14} className="text-[#05ADCF]" /></div><div className="chatbot-loading-bubble bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex gap-1"><span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" /><span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:120ms]" /><span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:240ms]" /></div></div>;

function GpaTab() {
  const { t, i18n } = useTranslation("global");
  const { isDarkMode } = useContext(ThemeContext);
  const [selected, setSelected] = useState("home");
  const [subjects, setSubjects] = useState(fallbackSubjects);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [baselineAccGpa, setBaselineAccGpa] = useState(0);
  const [baselineAccCredits, setBaselineAccCredits] = useState(0);

  const mapCourse = (course, idx = 0) => {
    const id = course?.id || course?.code || course?.courseId || `C-${idx}`;
    return {
      id: String(id),
      code: String(id),
      name: course?.name || course?.courseName || course?.title || t("chatbot_course"),
      semester: course?.semester || course?.term || "-",
      credits: Number(course?.credits || course?.hours || 3),
    };
  };

  const getRegisteredCourses = () => {
    try {
      const loggedUser = JSON.parse(localStorage.getItem("loggedUser") || "{}");
      const studentKeys = new Set(
        [
          loggedUser?.studentId,
          loggedUser?.student_id,
          loggedUser?.username,
          loggedUser?.userId,
          loggedUser?.user_id,
          loggedUser?.id,
          loggedUser?.studentCode,
          loggedUser?.student_code,
        ]
          .map((v) => String(v || "").trim())
          .filter(Boolean)
      );
      if (!studentKeys.size) return [];
      const activeAcademicYear = normalizeAcademicYearValue(
        JSON.parse(localStorage.getItem("system.registrationSettings") || "{}")?.activeAcademicYear || "1",
        "1"
      );
      const openSemesters = JSON.parse(localStorage.getItem("system.openSemesters") || "{}");
      const allowedSemesters = Object.entries(openSemesters)
        .filter(([, isOpen]) => Boolean(isOpen))
        .map(([semester]) => String(semester));

      const pick = (key) => {
        try {
          const data = JSON.parse(localStorage.getItem(key) || "[]");
          return Array.isArray(data) ? data : [];
        } catch {
          return [];
        }
      };

      const studentRegistrations = pick("system.studentRegistrations").length
        ? pick("system.studentRegistrations")
        : pick("studentRegistrations");
      const academicRecords = pick("system.academicRecords").length
        ? pick("system.academicRecords")
        : pick("admin.gradesData");

      const belongsToCurrentStudent = (item = {}) => {
        const rowKeys = [
          item?.studentId,
          item?.student_id,
          item?.username,
          item?.userId,
          item?.user_id,
          item?.studentCode,
          item?.student_code,
        ]
          .map((v) => String(v || "").trim())
          .filter(Boolean);
        if (!rowKeys.length) return false;
        return rowKeys.some((k) => studentKeys.has(k));
      };

      const registrationRows = studentRegistrations.flatMap((item) => {
        if (Array.isArray(item?.courses)) {
          return item.courses.map((course) => ({ ...course, __owner: item }));
        }
        return [{ ...item, __owner: item }];
      });

      const fromRegistrations = registrationRows
        .filter((item) => belongsToCurrentStudent(item) || belongsToCurrentStudent(item?.__owner))
        .map((item) => {
          const cloned = { ...item };
          delete cloned.__owner;
          return cloned;
        })
        .map((item, idx) => mapCourse(item, idx + 100));

      const fromAcademicRecords = academicRecords
        .filter((item) => belongsToCurrentStudent(item))
        .map((item, idx) =>
          mapCourse(
            {
              id: item?.code || item?.courseCode || `R-${idx}`,
              code: item?.code || item?.courseCode || `R-${idx}`,
              name: item?.name || item?.courseName || t("chatbot_course"),
              semester: item?.semester || item?.term || "-",
              credits: item?.credits || item?.hours || 3,
              year: item?.year || item?.academicYear || "",
            },
            idx + 200
          )
        );

      const merged = [...fromRegistrations, ...fromAcademicRecords].filter((item) => {
        const semester = String(item?.semester || "");
        const year = normalizeAcademicYearValue(item?.year || "", "");
        const semesterOk = !semester || semester === "-" || allowedSemesters.includes(semester);
        const yearOk = !year || year === activeAcademicYear;
        return semesterOk && yearOk;
      });
      const allMerged = [...fromRegistrations, ...fromAcademicRecords];
      const seen = new Set();
      const uniqueMerged = merged.filter((item) => {
        const key = `${item.code}-${item.semester}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (uniqueMerged.length) return uniqueMerged;

      const seenAll = new Set();
      const uniqueAll = allMerged.filter((item) => {
        const key = `${item.code}-${item.semester}`;
        if (seenAll.has(key)) return false;
        seenAll.add(key);
        return true;
      });
      return uniqueAll;
    } catch {
      return [];
    }
  };

  const getCurrentStudentStatsFromResults = () => {
    try {
      const loggedUser = JSON.parse(localStorage.getItem("loggedUser") || "{}");
      const studentKeys = new Set(
        [
          loggedUser?.studentId,
          loggedUser?.student_id,
          loggedUser?.username,
          loggedUser?.userId,
          loggedUser?.user_id,
          loggedUser?.id,
          loggedUser?.studentCode,
          loggedUser?.student_code,
        ]
          .map((v) => String(v || "").trim())
          .filter(Boolean)
      );
      if (!studentKeys.size) return { gpa: 0, credits: 0 };

      const pick = (key) => {
        try {
          const data = JSON.parse(localStorage.getItem(key) || "[]");
          return Array.isArray(data) ? data : [];
        } catch {
          return [];
        }
      };
      const records = pick("system.academicRecords").length ? pick("system.academicRecords") : pick("admin.gradesData");
      const belongsToCurrentStudent = (item = {}) => {
        const rowKeys = [
          item?.studentId,
          item?.student_id,
          item?.username,
          item?.userId,
          item?.user_id,
          item?.studentCode,
          item?.student_code,
        ]
          .map((v) => String(v || "").trim())
          .filter(Boolean);
        if (!rowKeys.length) return false;
        return rowKeys.some((k) => studentKeys.has(k));
      };

      let totalPoints = 0;
      let totalCredits = 0;
      records.forEach((record) => {
        if (!belongsToCurrentStudent(record)) return;
        const grade = String(record?.grade || "").trim().toUpperCase();
        if (!grade) return;
        const credits = Number(record?.credits || record?.hours || 0);
        if (!Number.isFinite(credits) || credits <= 0) return;
        totalPoints += gradeToPoints(grade) * credits;
        totalCredits += credits;
      });

      if (totalCredits <= 0) return { gpa: 0, credits: 0 };
      return { gpa: Number((totalPoints / totalCredits).toFixed(2)), credits: totalCredits };
    } catch {
      return { gpa: 0, credits: 0 };
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoadingSubjects(true);
      const registered = getRegisteredCourses();
      setSubjects(registered);
      const stats = getCurrentStudentStatsFromResults();
      setBaselineAccGpa(stats.gpa);
      setBaselineAccCredits(stats.credits);
      try {
        const data = await apiFetch("/api/academic-core/registration/credit-policy/me");
        const apiGpa = Number(data?.gpa);
        if (Number.isFinite(apiGpa) && apiGpa >= 0) {
          setBaselineAccGpa(Number(apiGpa.toFixed(2)));
        }
      } catch {
        // keep local result-based GPA as fallback
      }
      setLoadingSubjects(false);
    };
    load();
  }, []);
  if (selected === "term") {
    return <GpaForm setSelected={setSelected} subjects={subjects} loadingSubjects={loadingSubjects} accumulative={false} initialAccGpa={baselineAccGpa} initialAccCredits={baselineAccCredits} />;
  }
  if (selected === "acc") {
    return <GpaForm setSelected={setSelected} subjects={subjects} loadingSubjects={loadingSubjects} accumulative initialAccGpa={baselineAccGpa} initialAccCredits={baselineAccCredits} />;
  }
  return (
    <div className="dot-scroll h-full overflow-y-auto bg-gray-50 p-4 space-y-3" dir="rtl">
      <div className="rounded-2xl bg-gradient-to-l from-[#05ADCF] to-[#0387a2] text-white p-4 shadow-[0_10px_26px_rgba(5,173,207,0.32)]">
        <h2 className="text-base font-black">{t("chatbot_gpa_calculator_title")}</h2>
        <p className="text-xs text-white/90 mt-1">{t("chatbot_choose_calculation_type_based_on_your_re")}</p>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 p-3">
        <p className="text-xs text-slate-500 mb-2">{t("chatbot_current_registered_courses")}</p>
        <div className="space-y-1 max-h-28 overflow-y-auto dot-scroll">
          {subjects.slice(0, 6).map((sub) => (
            <div key={`${sub.id}-${sub.semester}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
              <span className="text-[11px] text-slate-700 truncate">{sub.name}</span>
              <span className="text-[10px] text-slate-500 shrink-0">{sub.code}</span>
            </div>
          ))}
          {!subjects.length && <p className="text-[11px] text-slate-400">{t("chatbot_no_registered_courses_yet")}</p>}
        </div>
      </div>

      <button onClick={() => setSelected("term")} className="w-full rounded-2xl bg-white border border-slate-100 p-3 text-right shadow-sm hover:border-[#05ADCF]/25 hover:bg-[#05ADCF]/5 transition">
        <p className="text-sm font-bold text-slate-800">{t("chatbot_term_gpa")}</p>
        <p className="text-[11px] text-slate-500 mt-1">{t("chatbot_calculate_term_gpa_for_registered_course")}</p>
      </button>
      <button onClick={() => setSelected("acc")} className="w-full rounded-2xl bg-white border border-slate-100 p-3 text-right shadow-sm hover:border-[#05ADCF]/25 hover:bg-[#05ADCF]/5 transition">
        <p className="text-sm font-bold text-slate-800">{t("chatbot_accumulative_gpa")}</p>
        <p className="text-[11px] text-slate-500 mt-1">{t("chatbot_update_cumulative_gpa_based_on_current_t")}</p>
      </button>
    </div>
  );
}

function GpaForm({ setSelected, subjects, loadingSubjects, accumulative, initialAccGpa = 0, initialAccCredits = 0 }) {
  const { t } = useTranslation("global");
  const { handleSubmit, register, control } = useForm();
  const [rows, setRows] = useState([0]);
  const [result, setResult] = useState(null);
  const [currentAcc, setCurrentAcc] = useState(Number(initialAccGpa || 0));
  const [currentAccCredits, setCurrentAccCredits] = useState(Number(initialAccCredits || 0));
  const [calculating, setCalculating] = useState(false);
  const removeRow = (index) => setRows((prev) => prev.filter((_, i) => i !== index));

  useEffect(() => {
    setCurrentAcc(Number(initialAccGpa || 0));
    setCurrentAccCredits(Number(initialAccCredits || 0));
  }, [initialAccGpa, initialAccCredits]);

  const onSubmit = async (data) => {
    const list = data.subject || [];
    const selectedRows = list.filter((s) => String(s?.subjectName || "").trim());
    if (!selectedRows.length) {
      setResult("0.00");
      return;
    }

    setCalculating(true);
    try {
      const payloadCourses = selectedRows.map((s, index) => {
        const total = Number(s.mid1 || 0) + Number(s.mid2 || 0) + Number(s.yw || 0) + Number(s.final || 0);
        const sub = subjects.find((item) => String(item.id) === String(s.subjectName));
        const credits = Number(sub?.credits || 3);
        return {
          itemKey: `${index}-${String(s.subjectName)}`,
          name: sub?.name || t("chatbot_course"),
          credits: Number.isFinite(credits) && credits > 0 ? credits : 3,
          total: Math.max(0, Math.min(100, total)),
        };
      });

      let coursesForCalc = payloadCourses.map((c) => ({
        name: c.name,
        credits: c.credits,
        grade: scoreToLetterGrade(c.total),
      }));

      try {
        const gradeResponse = await apiFetch("/api/gpa/grade-from-score", {
          method: "POST",
          body: JSON.stringify({
            entries: payloadCourses.map((c) => ({
              item_key: c.itemKey,
              total: c.total,
              max_total: 100,
            })),
          }),
        });
        const gradeMap = new Map((gradeResponse?.results || []).map((row) => [String(row.item_key), String(row.grade || "").toUpperCase()]));
        coursesForCalc = payloadCourses.map((c) => ({
          name: c.name,
          credits: c.credits,
          grade: gradeMap.get(c.itemKey) || scoreToLetterGrade(c.total),
        }));
      } catch {
        // fallback to client-side grade conversion if grade endpoint is unavailable
      }

      let termGpa = 0;
      let termCredits = 0;
      let termPoints = 0;
      try {
        const calc = await apiFetch("/api/gpa/calculate", {
          method: "POST",
          body: JSON.stringify({ courses: coursesForCalc }),
        });
        termGpa = Number(calc?.gpa || 0);
        termCredits = Number(calc?.total_credits || 0);
        termPoints = Number(calc?.total_points || 0);
      } catch {
        coursesForCalc.forEach((course) => {
          const credits = Number(course.credits || 0);
          if (!Number.isFinite(credits) || credits <= 0) return;
          termCredits += credits;
          termPoints += gradeToPoints(course.grade) * credits;
        });
        termGpa = termCredits > 0 ? termPoints / termCredits : 0;
      }

      if (accumulative) {
        const previousCredits = Number(currentAccCredits || 0);
        const previousPoints = Number(currentAcc || 0) * previousCredits;
        const combinedCredits = previousCredits + termCredits;
        const combinedGpa = combinedCredits > 0 ? (previousPoints + termPoints) / combinedCredits : termGpa;
        const rounded = Number(combinedGpa.toFixed(2));
        setCurrentAcc(rounded);
        setCurrentAccCredits(Number(combinedCredits.toFixed(2)));
        setResult(rounded.toFixed(2));
      } else {
        setResult(Number(termGpa || 0).toFixed(2));
      }
    } finally {
      setCalculating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full bg-gray-50 p-3 gap-3" dir="rtl">
      <div className="rounded-2xl bg-white border border-slate-100 p-3 flex items-center justify-between">
        <h3 className="font-bold text-slate-800">{accumulative ? t("chatbot_accumulative_gpa") : t("chatbot_term_gpa")}</h3>
        <span className="text-[11px] rounded-full px-2 py-1 bg-[#05ADCF]/10 text-[#0489a5]">{rows.length} {t("chatbot_courses")}</span>
      </div>

      <div className="dot-scroll flex-1 overflow-y-auto space-y-3">
        {rows.map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2 shadow-sm">
            {rows.length > 1 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="w-6 h-6 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center"
                  title={t("chatbot_remove_course")}>
                  <X size={12} />
                </button>
              </div>
            )}
            <Controller
              name={`subject.${i}.subjectName`}
              control={control}
              render={({ field }) => (
                <select {...field} className="w-full bg-slate-100 rounded-lg p-2 text-sm outline-none">
                  <option value="">{loadingSubjects ? t("chatbot_loading_courses") : t("chatbot_select_course_from_registered_courses")}</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{`${s.name} (${s.code})`}</option>)}
                </select>
              )}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {["mid1", "mid2", "yw", "final"].map((n) => (
                <input
                  key={n}
                  type="number"
                  {...register(`subject.${i}.${n}`, { valueAsNumber: true })}
                  className="h-9 rounded-lg bg-slate-100 text-center text-sm outline-none"
                  placeholder={n.toUpperCase()}
                />
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setRows((p) => [...p, p.length])} className="px-4 py-2 rounded-full bg-[#05ADCF]/10 text-[#05ADCF] text-sm">{t("chatbot_add_course")}</button>
      </div>

      <div className="bg-white border border-slate-100 rounded-xl p-3 flex items-center justify-between">
        <div>
          <div className="text-gray-500 text-xs">{accumulative ? t("chatbot_accumulative_gpa") : t("chatbot_term_gpa")}</div>
          <div className="text-xl font-semibold text-[#05ADCF]">{result || (accumulative && currentAcc > 0 ? Number(currentAcc).toFixed(2) : "--")}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setSelected("home")} className="px-3 py-2 text-xs rounded-lg border border-slate-300 text-slate-600">{t("payment_back")}</button>
          <button type="submit" disabled={calculating} className="px-3 py-2 text-xs rounded-lg bg-[#05ADCF] text-white disabled:opacity-60">{calculating ? "..." : t("chatbot_calculate")}</button>
        </div>
      </div>
    </form>
  );
}
const markerIconFromReactIcon = (IconComp) =>
  renderToStaticMarkup(<IconComp size={14} color="white" />);

const campusCategoryStyles = {
  gate: {
    from: "#16a34a",
    to: "#166534",
    ringColor: "rgba(22,163,74,0.20)",
    icon: markerIconFromReactIcon(MdDoorFront),
  },
  service: {
    from: "#0ea5e9",
    to: "#0369a1",
    ringColor: "rgba(14,165,233,0.20)",
    icon: markerIconFromReactIcon(MdBusinessCenter),
  },
  faculty: {
    from: "#6366f1",
    to: "#3730a3",
    ringColor: "rgba(99,102,241,0.20)",
    icon: markerIconFromReactIcon(MdSchool),
  },
  admin: {
    from: "#a855f7",
    to: "#6b21a8",
    ringColor: "rgba(168,85,247,0.20)",
    icon: markerIconFromReactIcon(MdAccountBalance),
  },
  library: {
    from: "#f59e0b",
    to: "#b45309",
    ringColor: "rgba(245,158,11,0.20)",
    icon: markerIconFromReactIcon(MdLocalLibrary),
  },
  medical: {
    from: "#ef4444",
    to: "#b91c1c",
    ringColor: "rgba(239,68,68,0.20)",
    icon: markerIconFromReactIcon(MdLocalHospital),
  },
  parking: {
    from: "#64748b",
    to: "#1e293b",
    ringColor: "rgba(100,116,139,0.20)",
    icon: markerIconFromReactIcon(MdLocalParking),
  },
  user: {
    from: "#22d3ee",
    to: "#0891b2",
    ringColor: "rgba(34,211,238,0.28)",
    icon: markerIconFromReactIcon(MdMyLocation),
  },
};
const campusIconByKey = {
  business: MdBusinessCenter,
  door: MdDoorFront,
  school: MdSchool,
  university: MdSchool,
  bank: MdAccountBalance,
  library: MdLocalLibrary,
  hospital: MdLocalHospital,
  parking: MdLocalParking,
  my_location: MdMyLocation,
};
const escapeMarkerHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const shortMarkerLabel = (value, limit = 18) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
};
const resolveCampusMarkerInnerIcon = (category = "service", iconKey = "") => {
  const style = campusCategoryStyles[category] || campusCategoryStyles.service;
  const key = String(iconKey || "").trim().toLowerCase();
  if (!key) return style.icon;
  const IconComp = campusIconByKey[key];
  if (!IconComp) return style.icon;
  return markerIconFromReactIcon(IconComp);
};
const createCampusMarkerIcon = (category = "service", options = {}) => {
  const style = campusCategoryStyles[category] || campusCategoryStyles.service;
  const innerIcon = resolveCampusMarkerInnerIcon(category, options.iconKey);
  const isSelected = Boolean(options.selected);
  const isUser = category === "user" || Boolean(options.user);
  const markerCode = isUser ? "" : String(options.code || "").trim().toUpperCase();
  const markerInfo = markerCode;
  const markerWidth = markerInfo ? 56 : 40;
  const markerHeight = markerInfo ? 74 : 50;

  return L.divIcon({
    className: "campus-marker-wrapper campus-marker",
    html: `
      <div
        class="campus-marker-shell"
        style="
          position: relative;
          width: ${markerWidth}px;
          height: ${markerHeight}px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        "
      >
        <div
          style="
            position: relative;
            width: 40px;
            height: 46px;
            display: flex;
            align-items: flex-start;
            justify-content: center;
          "
        >
        ${
          isSelected || isUser
            ? `
          <span
            style="
              position: absolute;
              top: -3px;
              width: 36px;
              height: 36px;
              border-radius: 999px;
              background: ${style.ringColor};
              transform: scale(1.25);
              transition: all .2s ease;
            "
          ></span>
        `
            : ""
        }

        <div
          style="
            position: relative;
            z-index: 2;
            width: 34px;
            height: 34px;
            border-radius: 14px;
            background: linear-gradient(135deg, ${style.from}, ${style.to});
            border: 2px solid rgba(255,255,255,0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
            transition: transform .2s ease;
          "
        >
          ${innerIcon}
        </div>

        <span
          style="
            position: absolute;
            bottom: 5px;
            width: 10px;
            height: 10px;
            background: ${style.to};
            transform: rotate(45deg);
            border-radius: 2px;
            z-index: 1;
          "
        ></span>
        </div>
        ${
          markerInfo
            ? `
          <div
            class="campus-marker-label"
            style="
              margin-top: 5px;
              max-width: 120px;
              padding: 4px 8px;
              border-radius: 999px;
              background: rgba(255,255,255,0.96);
              border: 1px solid rgba(148, 163, 184, 0.24);
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
              color: #0f172a;
              font-size: 10px;
              line-height: 1.25;
              font-weight: 800;
              text-align: center;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            "
          >
            ${markerCode ? `<span style="font-size: 9px; font-weight: 900; color: ${style.to}; letter-spacing: .04em;">${escapeMarkerHtml(markerCode)}</span>` : ""}
          </div>
        `
            : ""
        }
      </div>
    `,
    iconSize: [markerWidth, markerHeight],
    iconAnchor: [markerWidth / 2, markerInfo ? 54 : 40],
    popupAnchor: [0, -28],
  });
};
function FollowUserLocation({ position, followUser, onManualMapMove }) {
  const map = useMap();

  useEffect(() => {
    if (!position || !followUser) return;
    const nextZoom = map.getZoom() < 16 ? 16 : map.getZoom();
    map.setView(position, nextZoom, { animate: true });
  }, [position, followUser, map]);

  useEffect(() => {
    if (!onManualMapMove) return undefined;
    const handleDragStart = () => onManualMapMove();
    map.on("dragstart", handleDragStart);
    return () => {
      map.off("dragstart", handleDragStart);
    };
  }, [map, onManualMapMove]);

  return null;
}
function Routing({ from, to, setRouteInfo }) {
  const map = useMap();
  useEffect(() => {
    if (!from || !to) return;
    const routing = L.Routing.control({ waypoints: [L.latLng(from), L.latLng(to)], addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: true, show: false, createMarker: () => null, lineOptions: { styles: [{ color: "#05ADCF", weight: 6, opacity: 0.9 }, { color: "#e0f7fb", weight: 10, opacity: 0.45 }] } }).addTo(map);
    const c = routing.getContainer(); if (c) c.style.display = "none";
    routing.on("routesfound", (e) => setRouteInfo({ distance: (e.routes[0].summary.totalDistance / 1000).toFixed(2), time: Math.round(e.routes[0].summary.totalTime / 60) }));
    return () => map.removeControl(routing);
  }, [from, to, map, setRouteInfo]);
  return null;
}

function MapComponent() {
  const { t, i18n } = useTranslation("global");
  const { isDarkMode } = useContext(ThemeContext);
  const isAr = isArabicLanguage(i18n.language);
  const tx = (ar, en) => (isAr ? ar : en);
  const center = [30.4728, 31.1844];
  const [places, setPlaces] = useState([]);
  const [userPosition, setUserPosition] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showPlacesPanel, setShowPlacesPanel] = useState(false);
  const [destination, setDestination] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [showSearchUI, setShowSearchUI] = useState(true);
  const [locationError, setLocationError] = useState("");
  const [followUser, setFollowUser] = useState(true);
  const [mapLayer, setMapLayer] = useState("road");
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const locationWatchRef = useRef(null);
  const normalizeFilterCategory = useCallback((value) => String(value || "").trim().toLowerCase(), []);

  const clearLiveLocationWatch = useCallback(() => {
    if (locationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
  }, []);

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError(tx("المتصفح لا يدعم تحديد الموقع.", "Your browser does not support geolocation."));
      return;
    }
    clearLiveLocationWatch();
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition([pos.coords.latitude, pos.coords.longitude]);
        setFollowUser(true);
        setLocationError("");
      },
      (err) => {
        const denied = err?.code === 1;
        setUserPosition(null);
        setLocationError(
          denied
            ? tx("\u0627\u0633\u0645\u062d \u0628\u0625\u0630\u0646 \u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u0646 \u0627\u0644\u0645\u062a\u0635\u0641\u062d \u0644\u062a\u062d\u062f\u064a\u062f \u0645\u0648\u0642\u0639\u0643 \u0627\u0644\u062d\u0627\u0644\u064a.", "Allow location permission in your browser to detect your current location.")
            : tx("\u062a\u0639\u0630\u0631 \u062a\u062d\u062f\u064a\u062f \u0645\u0648\u0642\u0639\u0643 \u0627\u0644\u062d\u0627\u0644\u064a. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.", "Unable to detect your current location. Please try again.")
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 1500 }
    );
  }, [clearLiveLocationWatch, isAr]);

  useEffect(() => {
    requestUserLocation();
    return () => clearLiveLocationWatch();
  }, [clearLiveLocationWatch, requestUserLocation]);
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/api/campus/places");
        if (Array.isArray(data)) {
          const normalizeCategory = (value) => {
            const raw = String(value || "service").trim().toLowerCase();
            const map = {
              services: "service",
              service: "service",
              gates: "gate",
              gate: "gate",
              libraries: "library",
              library: "library",
              faculties: "faculty",
              faculty: "faculty",
              admins: "admin",
              administration: "admin",
              facilities: "service",
              facility: "service",
              medicals: "medical",
              medical: "medical",
              parkings: "parking",
              parking: "parking",
              "خدمات": "service",
              "بوابات": "gate",
              "مكتبة": "library",
              "كليات": "faculty",
              "اداري": "admin",
              "إداري": "admin",
              "طبي": "medical",
              "مواقف": "parking",
              "مرافق": "service",
            };
            return map[raw] || raw;
          };

          const normalized = data
            .map((i) => ({
              id: i.id,
              name: isAr
                ? i.name_ar || i.nameAr || i.name
                : i.name || i.name_en || i.nameEn || i.name_ar || i.nameAr,
              building_code: i.building_code || i.buildingCode || "",
              category: normalizeCategory(i.category),
              icon_key: i.icon_key || i.iconKey || "",
              position: [Number(i.latitude), Number(i.longitude)],
              description: isAr
                ? i.description_ar || i.descriptionAr || i.description || ""
                : i.description || i.description_en || i.descriptionEn || i.description_ar || i.descriptionAr || "",
            }))
            .filter((item) => Number.isFinite(item.position[0]) && Number.isFinite(item.position[1]));

          setPlaces(normalized);
          if (normalized.length === 0) {
            setDestination(null);
            setSelectedPlace(null);
            setRouteInfo(null);
          }
        }
      } catch {
        setPlaces([]);
        setDestination(null);
        setSelectedPlace(null);
        setRouteInfo(null);
      }
    })();
  }, [isAr]);

  const formatPlaceLabel = (place) => {
    if (!place) return "";
    const code = String(place.building_code || "").trim();
    return code ? `${place.name} (${code})` : place.name;
  };

  const normalizedSelectedCategory = normalizeFilterCategory(selectedCategory);
  const filtered = places.filter((p) => {
    const normalizedPlaceCategory = normalizeFilterCategory(p.category);
    const categoryMatch = normalizedSelectedCategory === "all" || normalizedPlaceCategory === normalizedSelectedCategory;
    const term = String(search || "").toLowerCase();
    const textMatch =
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.description.toLowerCase().includes(term) ||
      String(p.building_code || "").toLowerCase().includes(term);
    return categoryMatch && textMatch;
  });
  const categoryValues = Array.from(new Set(places.map((p) => normalizeFilterCategory(p.category)).filter(Boolean)));
  const categoryOptions = ["all", ...categoryValues];
  const categoryCountMap = places.reduce((acc, item) => {
    const key = normalizeFilterCategory(item.category);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const cancelRoute = () => {
    setDestination(null);
    setSelectedPlace(null);
    setRouteInfo(null);
    setShowPlacesPanel(false);
    setShowSearchUI(true);
  };
  const openInGoogleMaps = () => {
    if (!destination) return;
    const dest = `${destination[0]},${destination[1]}`;
    const origin = userPosition ? `${userPosition[0]},${userPosition[1]}` : "";
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute z-[1001] bottom-3 right-3" dir="rtl">
        {showLayerMenu && (
          <div className="mb-2 rounded-xl bg-white border border-slate-200 shadow-lg p-1.5 min-w-[132px]">
            <button
              type="button"
              onClick={() => {
                setMapLayer("road");
                setShowLayerMenu(false);
              }}
              className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                mapLayer === "road" ? "bg-[#05ADCF]/10 text-[#0489a5]" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tx("الخريطة", "Map")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMapLayer("satellite");
                setShowLayerMenu(false);
              }}
              className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                mapLayer === "satellite" ? "bg-[#05ADCF]/10 text-[#0489a5]" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tx("قمر صناعي", "Satellite")}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowLayerMenu((prev) => !prev)}
          title={tx("تبديل نوع الخريطة", "Toggle map layer")}
          aria-label={tx("تبديل نوع الخريطة", "Toggle map layer")}
          className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-slate-100 flex items-center justify-center"
        >
          <Layers size={14} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          if (!userPosition) {
            requestUserLocation();
            return;
          }
          setFollowUser((prev) => !prev);
        }}
        title={followUser ? tx("إيقاف متابعة موقعي", "Disable follow me") : tx("تشغيل متابعة موقعي", "Enable follow me")}
        aria-label={followUser ? tx("إيقاف متابعة موقعي", "Disable follow me") : tx("تشغيل متابعة موقعي", "Enable follow me")}
        className={`absolute z-[1001] bottom-3 left-3 w-7 h-7 rounded-full border flex items-center justify-center transition ${
          followUser
            ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
        }`}
      >
        <MdMyLocation size={12} />
      </button>

      {showSearchUI && <div className="absolute z-[1002] top-3 left-1/2 -translate-x-1/2 w-[94%] max-w-2xl bg-white/95 backdrop-blur rounded-2xl shadow-[0_18px_40px_rgba(2,12,27,0.16)] p-3 space-y-3 border border-slate-100" dir="rtl">
        <div className="text-center"><h3 className="font-black text-slate-800 text-sm">{t("chatbot_bnu_campus_guide")}</h3><p className="text-[11px] text-slate-500">{t("chatbot_discover_buildings_and_services_on_campu")}</p></div>
        <div className="relative"><Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("chatbot_search_for_a_building_or_service")} className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-100/80 border border-slate-200 outline-none text-sm" /></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowPlacesPanel((p) => !p)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${showPlacesPanel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{showPlacesPanel ? t("chatbot_hide_places") : t("chatbot_show_places")}</button>
          {categoryOptions.map((c) => {
            const normalized = normalizeFilterCategory(c);
            const isActive = normalizedSelectedCategory === normalized;
            const count = normalized === "all" ? places.length : (categoryCountMap[normalized] || 0);
            return (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCategory(normalized)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${isActive ? "bg-[#05ADCF] text-white border-[#05ADCF]" : "bg-slate-100 text-slate-600 border-slate-200"}`}
              >
                {normalized === "all" ? t("chatbot_all_places") : ({ gate: t("chatbot_gates"), service: t("chatbot_services"), faculty: t("chatbot_faculties"), admin: t("chatbot_admin"), library: t("payment_library"), medical: t("chatbot_medical"), parking: t("chatbot_parking"), user: t("chatbot_my_location") }[normalized] || normalized)}
                <span className={`mr-1 ${isActive ? "text-white/90" : "text-slate-400"}`}>({count})</span>
              </button>
            );
          })}
        </div>
        {!!locationError && <p className="text-[11px] text-rose-500 text-center">{locationError}</p>}
      </div>}

      {showSearchUI && showPlacesPanel && (
        <div className="absolute z-[1004] top-[168px] bottom-[84px] left-1/2 -translate-x-1/2 w-[86%] max-w-md overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 shadow-sm">
          <div className="places-scroll h-full overflow-y-auto p-2" style={{ WebkitOverflowScrolling: "touch" }}>
            {filtered.map((p) => (
              <button
                key={p.id}
                onMouseEnter={() => {
                  setDestination(p.position);
                  setSelectedPlace(p);
                }}
                onClick={() => {
                  setDestination(p.position);
                  setSelectedPlace(p);
                  setShowPlacesPanel(false);
                  setShowSearchUI(false);
                }}
                className={`w-full text-right px-2.5 py-2 rounded-lg mb-1 border focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${
                  selectedPlace?.id === p.id ? "bg-[#05ADCF]/10 border-[#05ADCF]/30" : "border-slate-100 hover:bg-slate-50"
                }`}
              >
                <p className="font-bold text-slate-800 text-xs">{formatPlaceLabel(p)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{p.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      {routeInfo && <div className="absolute z-[1001] bottom-5 left-1/2 -translate-x-1/2 w-[90%] max-w-[320px] bg-white rounded-xl shadow-lg px-3 py-2 text-xs border border-slate-200/70" dir="rtl"><div className="font-semibold text-gray-800">{t("chatbot_route_details")}</div><div className="text-gray-600">{t("chatbot_distance")}: {routeInfo.distance} {t("chatbot_km")}</div><div className="text-gray-600">{t("chatbot_time")}: {routeInfo.time} {t("chatbot_min")}</div>{selectedPlace && <div className="text-[#05ADCF] font-bold mt-1">{t("chatbot_destination")}: {formatPlaceLabel(selectedPlace)}</div>}<div className="mt-2 flex items-center gap-2"><button onClick={cancelRoute} className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">{t("chatbot_clear_route")}</button><button onClick={openInGoogleMaps} className="text-[11px] px-2.5 py-1 rounded-lg bg-[#05ADCF]/10 text-[#0489a5] hover:bg-[#05ADCF]/20 inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><ExternalLink size={11} />Google Maps</button></div></div>}

      <MapContainer center={center} zoom={16} zoomControl={false} className="h-full w-full min-h-[460px]">
        {mapLayer === "satellite" ? (
          <>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; Esri'
              maxZoom={19}
            />
            <TileLayer
              url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; Esri'
              maxZoom={19}
              opacity={0.85}
            />
          </>
        ) : (
          <TileLayer
            url={
              isDarkMode
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            }
            attribution={
              isDarkMode
                ? '&copy; OpenStreetMap contributors &copy; CARTO'
                : '&copy; OpenStreetMap contributors &copy; CARTO'
            }
            maxZoom={20}
          />
        )}
        {filtered.map((p) => (
          <Marker key={p.id} position={p.position} icon={createCampusMarkerIcon(p.category, { selected: selectedPlace?.id === p.id, iconKey: p.icon_key, label: p.name, code: p.building_code })}>
            <Popup>
              <div dir="rtl" className="min-w-[190px]">
                <p className="font-bold">{formatPlaceLabel(p)}</p>
                <p className="text-xs text-slate-500 mt-1">{p.description}</p>
                <button
                  type="button"
                  onClick={() => {
                    setDestination(p.position);
                    setSelectedPlace(p);
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#05ADCF]/10 px-2 py-1 text-[11px] font-bold text-[#0489a5] hover:bg-[#05ADCF]/20"
                >
                  <MapPin size={12} />
                  {tx("اتجاه", "Directions")}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
        {userPosition && (
          <>
            <Marker position={userPosition} icon={createCampusMarkerIcon("user", { selected: true, user: true })}>
              <Popup>{t("chatbot_your_current_location")}</Popup>
            </Marker>
            <FollowUserLocation
              position={userPosition}
              followUser={followUser}
              onManualMapMove={() => setFollowUser(false)}
            />
          </>
        )}
        {destination && <Marker position={destination} icon={createCampusMarkerIcon(selectedPlace?.category || "service", { selected: true, iconKey: selectedPlace?.icon_key, label: selectedPlace?.name, code: selectedPlace?.building_code })}><Popup>{selectedPlace ? formatPlaceLabel(selectedPlace) : t("chatbot_destination")}</Popup></Marker>}
        {userPosition && destination && <Routing from={userPosition} to={destination} setRouteInfo={setRouteInfo} />}
      </MapContainer>
    </div>
  );
}
