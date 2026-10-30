"use client";
import { useEffect, useRef } from "react";
import { useApp } from "@/features/app-data";
import { getMeta } from "@/data/repo";
import { publishShare, SHARE_META } from "./client";

/**
 * Keeps the public page in step with the phone: when sharing is on, every change to the recorded
 * facts is uploaded a few seconds later (debounced), and a failed upload is retried when the
 * phone is back online / the app is reopened. Unchanged data is never re-uploaded.
 */
export function ShareSync() {
  const { facts } = useApp();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(facts);
  latest.current = facts;

  useEffect(() => {
    const run = async () => {
      const f = latest.current;
      if (!f || !navigator.onLine) return;
      if (!(await getMeta<boolean>(SHARE_META.on))) return;
      await publishShare(f);
    };
    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, ms);
    };
    schedule(2500);
    const wake = () => document.visibilityState === "visible" && schedule(1500);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [facts]);

  return null;
}
