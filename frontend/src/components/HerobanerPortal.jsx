import React, { useEffect, useMemo, useState } from "react";
import { Sunrise, Sun, Moon, GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function HerobanerPortal() {
  const { t, i18n } = useTranslation("global");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const candidateSlides = ["/assets/images/university_1.png", "/assets/images/university_2.png"];
  const [heroSlides, setHeroSlides] = useState(candidateSlides);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("loggedUser");
      if (savedUser) setUser(JSON.parse(savedUser));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const loadSlides = async () => {
      const checks = await Promise.all(
        candidateSlides.map(
          (src) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve(src);
              img.onerror = () => resolve(null);
              img.src = src;
            })
        )
      );
      const loaded = checks.filter(Boolean);
      if (alive && loaded.length) {
        setHeroSlides(loaded);
        setSlideIndex(0);
      }
    };
    loadSlides();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (heroSlides.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [heroSlides.length]);

  const isAr = String(i18n?.language || "ar").toLowerCase().startsWith("ar");

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return {
        text: t("hero_greeting_morning", { defaultValue: "Good morning at Benha National University" }),
        icon: <Sunrise className="h-5 w-5 text-cyan-300 sm:h-6 sm:w-6" />,
      };
    }
    if (hour >= 12 && hour < 18) {
      return {
        text: t("hero_greeting_day", { defaultValue: "Have a great day at Benha National University" }),
        icon: <Sun className="h-5 w-5 text-yellow-300 sm:h-6 sm:w-6" />,
      };
    }
    return {
      text: t("hero_greeting_evening", { defaultValue: "Good evening at Benha National University" }),
      icon: <Moon className="h-5 w-5 text-indigo-200 sm:h-6 sm:w-6" />,
    };
  }, [t]);

  const displayName = user?.name || t("no_user_found");

  return (
    <div className="HeroPortal container relative mx-auto mb-[5em] w-full max-w-[1200px]" dir={isAr ? "rtl" : "ltr"}>
      <div className="group relative h-[420px] w-full overflow-hidden rounded-[2.2em] shadow-2xl sm:h-[470px]">
        <div className="absolute inset-0 z-0">
          {heroSlides.map((src, index) => (
            <img
              key={src}
              src={src}
              alt={`Hero slide ${index + 1}`}
              className={`absolute inset-0 h-full w-full object-cover object-center [object-position:center_62%] transform-gpu will-change-transform transition-all duration-700 ease-out ${
                index === slideIndex ? "scale-105 opacity-100" : "scale-100 opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-sky-900/60 via-cyan-600/30 to-sky-200/10" />
        </div>

        <div className="relative z-10 flex h-full flex-col justify-end px-7 pb-10 pt-8 sm:px-12 sm:pb-12 md:px-16 md:pb-14">
          <div className="mb-6 flex flex-col items-start gap-2 animate-fade-in">
            <div className="rounded-xl bg-[#05ADCF] p-2 shadow-lg shadow-[#05ADCF]/35">
              <GraduationCap className="h-7 w-7 text-white" />
            </div>
            <span className="text-xs font-black uppercase tracking-[0.22em] text-[#67e4ff]">BNU</span>
          </div>

          {loading ? (
            <h1 className="text-2xl font-black text-white drop-shadow-lg sm:text-3xl">{t("loading")}</h1>
          ) : (
            <>
              <div className="animate-slide-up flex items-center gap-2 sm:gap-3">
                <span className="text-2xl font-light text-white sm:text-3xl">
                  {t("hero_welcome_user", { defaultValue: `${t("welcome")},` })}
                </span>
                <h2 className="text-2xl font-black text-white sm:text-3xl">{displayName}</h2>
              </div>

              <div className="animate-slide-up delay-100 mt-3 flex items-center gap-2 font-bold text-[#67e4ff] sm:text-lg">
                {greeting.icon}
                <span>{greeting.text}</span>
              </div>
            </>
          )}

          <p className="animate-slide-up delay-200 mt-5 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base">
            {t("hero_description")}
          </p>

          <div className="animate-slide-up delay-300 mt-8 flex items-center gap-3">
            {heroSlides.map((_, index) => (
              <button
                key={`dot-${index}`}
                type="button"
                onClick={() => setSlideIndex(index)}
                className={`h-1.5 rounded-full transition-all ${index === slideIndex ? "w-10 bg-[#05ADCF]" : "w-4 bg-white/40"}`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <div className={`absolute bottom-7 hidden opacity-60 md:block ${isAr ? "left-8" : "right-8"}`}>
          <span className="text-[10px] font-bold uppercase tracking-[0.38em] text-white">
            {t("hero_innovation_excellence", {
              defaultValue: isAr ? "الابتكار والتميز" : "Innovation & Excellence",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
