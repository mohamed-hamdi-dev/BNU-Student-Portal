import { ClipboardList, AtSign, ListChecks, User, ShieldAlert, Banknote, FileText, ListX, CalendarCheck, Image } from "lucide-react";


export const services = [
    { id: "personal-data", label: "personal_data", Icon: User, color: "#6D28D9", iconBg: "#F2ECFF", path: "/persondata" },
    { id: "institutional-results", label: "academic_results", Icon: ListChecks, color: "#4F46E5", iconBg: "#EEF0FF", path: "/CourseTable" },
    { id: "academic-reg", label: "academic_registration", Icon: ClipboardList, color: "#0F766E", iconBg: "#EAF7F6", path: "/AcademicRegistration" },
    { id: "registration-form", label: "registration_form", Icon: CalendarCheck, color: "#475569", iconBg: "#F1F5F9", path: "/registration-form" },
    { id: "sections", label: "sections", Icon: ListX, color: "#0F766E", iconBg: "#EAF7F6", path: "/sections" },
    { id: "Qiezs", label: "QiezBNU", Icon: FileText, color: "#0F9D79", iconBg: "#ECF8F4", path: "/Qiez-BNU" },
    { id: "uni-mail", label: "university_mail", Icon: AtSign, color: "#B7791F", iconBg: "#FBF5EA", path: "/university-mail" },
    { id: "photo-upload", label: "photo_upload", Icon: Image, color: "#BE185D", iconBg: "#FDEFF5", path: "/photo-upload" },
    { id: "fees", label: "fees_payment", Icon: Banknote, color: "#C2410C", iconBg: "#FFF3EC", path: "/payment" },
    { id: "military-edu", label: "military_education", Icon: ShieldAlert, color: "#B91C1C", iconBg: "#FDEEEE", path: "/quizzesStudent" },
];
