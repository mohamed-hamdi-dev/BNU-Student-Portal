import React from "react";
import { useTranslation } from "react-i18next";

export default function PlaceholderView({ label }) {
    const { t } = useTranslation("admin");
    return <div className="p-20 text-center text-gray-400">{label} - {t("chat_placeholder_coming_soon")}</div>;
}
