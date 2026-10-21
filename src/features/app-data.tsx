"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { computeDerived, loadFacts, type Derived, type Facts } from "@/data/derived";
import { ensureInitialized } from "@/data/repo";

interface AppData {
  ready: boolean;
  facts: Facts | null;
  derived: Derived | null;
  now: number;
  error: string | null;
}

const Ctx = createContext<AppData>({ ready: false, facts: null, derived: null, now: Date.now(), error: null });

/** Ticks local time. Countdown & status changes are computed on-device — no server polling. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    const onVis = () => document.visibilityState === "visible" && setNow(Date.now());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);
  return now;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [inited, setInited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ensureInitialized()
      .then(() => setInited(true))
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);
  const facts = useLiveQuery(() => (inited ? loadFacts() : Promise.resolve(null)), [inited]);
  const now = useNow(30_000);
  // recompute on fact changes and every tick (cheap: pure functions over a personal-size history)
  const derived = useMemo(() => (facts ? computeDerived(facts, now) : null), [facts, now]);
  const value = useMemo(() => ({ ready: !!facts, facts: facts ?? null, derived, now, error }), [facts, derived, now, error]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}

/** Convenience: non-null facts/derived (pages render a loader until ready). */
export function useAppReady() {
  const a = useApp();
  return a as AppData & { facts: Facts; derived: Derived };
}
