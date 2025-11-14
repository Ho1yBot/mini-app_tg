import { useCallback, useEffect, useMemo, useState } from "react";
import { UNIVERSITIES } from "./universities";

// ===== helpers & types =====
type Subject = {
  time_from: string;
  time_to: string;
  subject_type: string;
  subject_name: string;
  teacher_name: string;
  subgroup: string;
  academic_building: string;
  auditory_number: string;
};
type ScheduleDay = { date: string; subjects: Subject[] };
type Calendar = {
  full_university_name: string;
  short_university_name?: string;
  group_name: string;
  schedule: ScheduleDay[];
};
type CalendarResponse = { calendar: Calendar };

const API_URL = import.meta.env.VITE_API_URL as string;
const APP_TITLE = import.meta.env.VITE_APP_TITLE || "Расписание";

const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : undefined;

// формат для бэка: "YYYY-MM-DD HH:MM:SS"
const formatDateForBackend = (date: string, endOfDay = false) => {
  return `${date} ${endOfDay ? "23:59:59" : "00:00:00"}`;
};

const timeRange = (from: string, to: string) => `${from.slice(0, 5)}–${to.slice(0, 5)}`;
const subjectClass = (t: string) => {
  const s = t.toLowerCase();
  if (s.includes("лекц")) return "lecture";
  if (s.includes("лаб")) return "lab";
  return "practice";
};
const dateLabel = (yyyy_mm_dd: string) => {
  const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const f = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(dt);
  return f.charAt(0).toUpperCase() + f.slice(1);
};

function applyTelegramTheme() {
  if (!tg) return;
  const p = tg.themeParams || {};
  const root = document.documentElement;
  const set = (v: string, val?: string) => val && root.style.setProperty(v, val);
  if (tg.colorScheme === "light") {
    set("--bg", p.bg_color || "#ffffff");
    set("--bg-secondary", p.secondary_bg_color || "#f2f3f5");
    set("--card", p.secondary_bg_color || "#f2f3f5");
    set("--text", p.text_color || "#0f0f10");
    set("--muted", p.hint_color || "#707579");
    set("--border", p.section_separator_color || "#e6e7eb");
    set("--accent", p.button_color || "#2ea6ff");
  } else {
    set("--bg", p.bg_color);
    set("--bg-secondary", p.secondary_bg_color);
    set("--card", p.secondary_bg_color);
    set("--text", p.text_color);
    set("--muted", p.hint_color);
    set("--border", p.section_separator_color);
    set("--accent", p.button_color);
  }
}

// ===== App =====
type View = "form" | "schedule";

const todayISO = new Date().toISOString().slice(0, 10);
const weekAheadISO = new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);

export default function App() {
  const [view, setView] = useState<View>("form");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CalendarResponse | null>(null);

  const [showUniversityList, setShowUniversityList] = useState(false);

  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem("schedule-form");
    return saved
      ? JSON.parse(saved)
      : {
          full_university_name: "",
          group_name: "",
          date_from: todayISO,
          date_to: weekAheadISO,
        };
  });
  useEffect(() => localStorage.setItem("schedule-form", JSON.stringify(form)), [form]);

  // Telegram chrome
  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
    applyTelegramTheme();
    const onTheme = () => applyTelegramTheme();
    tg.onEvent?.("themeChanged", onTheme);
    return () => tg.offEvent?.("themeChanged", onTheme);
  }, []);

  const formValid = useMemo(() => form.full_university_name.trim().length > 1 && form.group_name.trim().length > 0 && !!form.date_from && !!form.date_to, [form]);

  // MainButton
  useEffect(() => {
    if (!tg) return;
    const mb = tg.MainButton;
    if (view === "form") {
      if (formValid) {
        mb.setParams?.({ text: loading ? "Загрузка…" : "Показать расписание", is_active: !loading });
        mb.show?.();
      } else {
        mb.hide?.();
      }
    } else mb.hide?.();
    const handler = () => !loading && formValid && handleSubmit();
    mb.onClick?.(handler);
    return () => mb.offClick?.(handler);
  }, [view, formValid, loading]);

  // BackButton
  useEffect(() => {
    if (!tg) return;
    const bb = tg.BackButton;
    if (view === "schedule") bb.show?.();
    else bb.hide?.();
    const back = () => setView("form");
    bb.onClick?.(back);
    return () => bb.offClick?.(back);
  }, [view]);

  const handleSubmit = useCallback(async () => {
    try {
      if (!API_URL) throw new Error("VITE_API_URL не задан в .env");
      setLoading(true);
      tg?.HapticFeedback?.impactOccurred("light");

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": tg?.initData || "",
        },
        body: JSON.stringify({
          full_university_name: form.full_university_name.trim(),
          group_name: form.group_name.trim(),
          dt_from: formatDateForBackend(form.date_from, false),
          dt_to: formatDateForBackend(form.date_to, true),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ошибка API ${res.status}: ${text || res.statusText}`);
      }
      const json = (await res.json()) as CalendarResponse;
      setData(json);
      setView("schedule");
    } catch (e: any) {
      alert(e?.message || "Ошибка загрузки расписания");
    } finally {
      setLoading(false);
    }
  }, [form]);

  const insideTelegram = Boolean(tg);
  // const insideTelegram = false;

  return (
    <div className="app">
      <div className="header">
        <div className="container">
          <h1 className="h1">{APP_TITLE}</h1>
        </div>
      </div>
      <div className="container">
        {view === "form" && (
          <div className="card section">
            <div className="form-grid">
              <div className="combo">
                <input className="input combo-input" placeholder="Полное название вуза (напр. Санкт-Петербургский горный университет)" value={form.full_university_name} onChange={(e) => setForm((f: any) => ({ ...f, full_university_name: e.target.value }))} />

                {form.full_university_name && (
                  <button
                    type="button"
                    className="combo-clear"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setForm((f: any) => ({ ...f, full_university_name: "" }));
                    }}
                  >
                    ✕
                  </button>
                )}

                <button type="button" className="combo-button" onClick={() => setShowUniversityList((v) => !v)}>
                  ▼
                </button>

                {showUniversityList && (
                  <div className="combo-dropdown">
                    {UNIVERSITIES.filter((u) => u.toLowerCase().includes(form.full_university_name.toLowerCase())).map((u) => (
                      <button
                        type="button"
                        key={u}
                        className="combo-item"
                        onClick={() => {
                          setForm((f: any) => ({ ...f, full_university_name: u }));
                          setShowUniversityList(false);
                        }}
                      >
                        {u}
                      </button>
                    ))}

                    {/* если по фильтру ничего нет */}
                    {UNIVERSITIES.filter((u) => u.toLowerCase().includes(form.full_university_name.toLowerCase())).length === 0 && <div className="combo-empty">Ничего не найдено</div>}
                  </div>
                )}
              </div>

              {/* Группа */}
              <input className="input" placeholder="Группа (напр. СНП-24)" value={form.group_name} onChange={(e) => setForm((f: any) => ({ ...f, group_name: e.target.value }))} />

              {/* Даты */}
              <div className="row">
                <input className="date" type="date" value={form.date_from} onChange={(e) => setForm((f: any) => ({ ...f, date_from: e.target.value }))} />
                <input className="date" type="date" value={form.date_to} onChange={(e) => setForm((f: any) => ({ ...f, date_to: e.target.value }))} />
              </div>

              {/* Локальная кнопка (в Telegram вместо неё MainButton) */}
              {!insideTelegram && (
                <button className="button" disabled={!formValid || loading} onClick={handleSubmit}>
                  {loading ? "Загрузка…" : "Показать расписание"}
                </button>
              )}
            </div>
          </div>
        )}

        {view === "form" && <div className="empty">Укажите вуз, группу и диапазон дат — и получите расписание.</div>}

        {view === "schedule" && data?.calendar && (
          <>
            <div className="section">
              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{data.calendar.full_university_name}</div>
                <div style={{ color: "var(--muted)" }}>Группа: {data.calendar.group_name}</div>
              </div>
            </div>

            {data.calendar.schedule.map((day, i) => (
              <div key={day.date + i} className="section">
                <div className="day-header">{dateLabel(day.date)}</div>
                <div className="card">
                  {day.subjects.length === 0 ? (
                    <div className="empty">Нет занятий</div>
                  ) : (
                    day.subjects.map((s, idx) => (
                      <div className="subject" key={idx}>
                        <div className="time">{timeRange(s.time_from, s.time_to)}</div>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div className="title">{s.subject_name}</div>
                            <span className={`badge ${subjectClass(s.subject_type)}`}>{s.subject_type}</span>
                          </div>
                          <div className="subinfo">
                            Преподаватель: {s.teacher_name || "—"} · Подгруппа: {s.subgroup === "0" ? "все" : s.subgroup}
                            {" · "}Корпус {s.academic_building}, ауд. {s.auditory_number}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
            <div className="footer-space" />
          </>
        )}

        {view === "schedule" && !data?.calendar && <div className="empty">Нет данных.</div>}
      </div>
    </div>
  );
}
