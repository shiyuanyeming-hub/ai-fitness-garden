"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { haptic } from "@/components/ui";

interface Timer {
  endsAt: number;
  total: number;
  label?: string;
}
interface Ctx {
  timer: Timer | null;
  start: (seconds: number, label?: string) => void;
  add: (seconds: number) => void;
  stop: () => void;
}
const RestCtx = createContext<Ctx>({ timer: null, start: () => {}, add: () => {}, stop: () => {} });
const KEY = "afg.restTimer";

function load(): Timer | null {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return t && t.endsAt > Date.now() - 60_000 ? t : null;
  } catch {
    return null;
  }
}
function save(t: Timer | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Timestamp-based so it survives backgrounding, reloads and app switches. */
export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [timer, setTimer] = useState<Timer | null>(null);
  useEffect(() => setTimer(load()), []);
  const start = useCallback((seconds: number, label?: string) => {
    const t = { endsAt: Date.now() + seconds * 1000, total: seconds, label };
    setTimer(t);
    save(t);
  }, []);
  const add = useCallback((s: number) => {
    setTimer((cur) => {
      if (!cur) return cur;
      const t = { ...cur, endsAt: Math.max(Date.now(), cur.endsAt + s * 1000), total: Math.max(5, cur.total + s) };
      save(t);
      return t;
    });
  }, []);
  const stop = useCallback(() => {
    setTimer(null);
    save(null);
  }, []);
  return <RestCtx.Provider value={{ timer, start, add, stop }}>{children}</RestCtx.Provider>;
}

export const useRestTimer = () => useContext(RestCtx);

export function RestTimerBar() {
  const { timer, add, stop } = useRestTimer();
  const path = usePathname();
  const [now, setNow] = useState(Date.now());
  const [buzzed, setBuzzed] = useState(false);
  useEffect(() => {
    if (!timer) return;
    setBuzzed(false);
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [timer]);
  const left = timer ? Math.ceil((timer.endsAt - now) / 1000) : 0;
  useEffect(() => {
    if (timer && left <= 0 && !buzzed) {
      setBuzzed(true);
      haptic([120, 80, 120]);
    }
    if (timer && left < -45) stop();
  }, [left, timer, buzzed, stop]);
  if (!timer || path?.startsWith("/scan")) return null;
  const done = left <= 0;
  const pct = Math.max(0, Math.min(100, (1 - left / timer.total) * 100));
  const mm = Math.floor(Math.max(0, left) / 60);
  const ss = String(Math.max(0, left) % 60).padStart(2, "0");
  return (
    <div className="fixed inset-x-0 z-40 bottom-[calc(env(safe-area-inset-bottom)+64px)] px-3 pointer-events-none">
      <div
        className="pointer-events-auto mx-auto max-w-lg card !rounded-2xl px-3 py-2 flex items-center gap-3 overflow-hidden relative"
        role="timer"
        aria-live={done ? "assertive" : "off"}
      >
        <div className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-300" style={{ width: `${pct}%` }} />
        <div className="relative flex-1 min-w-0">
          <div className="text-[11px] text-muted truncate">{done ? "休息结束，开始下一组" : `组间休息${timer.label ? ` · ${timer.label}` : ""}`}</div>
          <div className={`num text-2xl font-semibold ${done ? "text-accent" : ""}`}>{done ? "GO" : `${mm}:${ss}`}</div>
        </div>
        <button className="relative h-9 px-3 rounded-xl bg-surface-2 border border-line text-sm" onClick={() => add(-15)}>
          −15
        </button>
        <button className="relative h-9 px-3 rounded-xl bg-surface-2 border border-line text-sm" onClick={() => add(15)}>
          +15
        </button>
        <button className="relative h-9 px-3 rounded-xl bg-accent text-accent-ink text-sm font-medium" onClick={stop}>
          {done ? "好" : "跳过"}
        </button>
      </div>
    </div>
  );
}
