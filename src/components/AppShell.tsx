"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppDataProvider, useApp } from "@/features/app-data";
import { ToastProvider, cx } from "./ui";
import { RestTimerBar, RestTimerProvider } from "@/features/workout/rest-timer";

const NAV = [
  { href: "/", label: "首页", icon: HomeIcon },
  { href: "/workout", label: "训练", icon: DumbbellIcon },
  { href: "/farm", label: "农场", icon: SproutIcon },
  { href: "/history", label: "历史", icon: ChartIcon },
  { href: "/me", label: "我的", icon: UserIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return (
    <ToastProvider>
      <AppDataProvider>
        <RestTimerProvider>
          <Gate>{children}</Gate>
          <RestTimerBar />
          <BottomNav />
          <OfflineBadge />
        </RestTimerProvider>
      </AppDataProvider>
    </ToastProvider>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { ready, error } = useApp();
  if (error)
    return (
      <div className="p-6 pt-20 text-center">
        <div className="text-lg font-semibold">本地数据库无法打开</div>
        <p className="text-sm text-muted mt-2">{error}</p>
        <p className="text-sm text-muted mt-2">如果在无痕模式或禁用了网站数据，请切换到普通模式。</p>
      </div>
    );
  if (!ready)
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="text-muted text-sm animate-pulse">🌱 正在打开你的花园…</div>
      </div>
    );
  return <main className="mx-auto max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+92px)]">{children}</main>;
}

function BottomNav() {
  const path = usePathname();
  if (path?.startsWith("/scan")) return null;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-xl pb-safe">
      <div className="mx-auto max-w-lg grid grid-cols-5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cx("flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-medium", active ? "text-accent" : "text-faint")}
              aria-current={active ? "page" : undefined}
            >
              <Icon active={!!active} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function OfflineBadge() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  if (online) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-50 pt-safe pointer-events-none">
      <div className="mx-auto w-fit mt-1 rounded-full bg-surface-3 text-muted text-xs px-3 py-1 border border-line">离线中 · 记录会保存在本机</div>
    </div>
  );
}

type IconProps = { active: boolean };
function HomeIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function DumbbellIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round">
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
    </svg>
  );
}
function SproutIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 21v-8" fill="none" />
      <path d="M12 13c-4 0-7-3-7-7 4 0 7 3 7 7zM12 11c0-4 3-7 7-7 0 4-3 7-7 7z" />
    </svg>
  );
}
function ChartIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
function UserIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" fill="none" />
    </svg>
  );
}
