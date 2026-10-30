"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart } from "@/components/charts";
import { Card, SectionTitle, StatusBadge } from "@/components/ui";
import { weeklyFrequency, sessionDurationMin } from "@/core/analytics";
import { MUSCLE_BY_ID, REGIONS } from "@/core/muscles";
import { diffDays, formatLocalTime, sessionDateKey } from "@/core/time";
import { summarizeSession } from "@/core/summary";
import type { SessionBundle } from "@/core/muscle-analysis";
import type { Exercise } from "@/core/types";
import { computeDerived } from "@/data/derived";
import { snapshotToFacts } from "@/data/share";
import { fetchShare, type FetchShare } from "./client";

/**
 * Read-only public page. Everything shown is derived in THIS browser from the published facts —
 * visitors never touch the owner's local database (AppShell skips it for /share).
 */
export function SharedView() {
  const [res, setRes] = useState<FetchShare | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetchShare().then((r) => alive && setRes(r));
    load();
    const t = setInterval(load, 15_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!res) return <div className="min-h-dvh grid place-items-center text-muted text-sm animate-pulse">🌱 正在加载训练记录…</div>;
  if (res.state === "ok") return <Loaded snapshot={res.snapshot} />;
  const msg =
    res.state === "empty" ? "还没有公开的训练记录" : res.state === "not_configured" ? "分享功能还没有配置完成" : "暂时加载不出来，稍后刷新试试";
  return (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div>
        <div className="text-4xl mb-3">🌱</div>
        <div className="font-semibold">{msg}</div>
      </div>
    </div>
  );
}

function Loaded({ snapshot }: { snapshot: NonNullable<Extract<FetchShare, { state: "ok" }>["snapshot"]> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const view = useMemo(() => {
    const facts = snapshotToFacts(snapshot);
    return { facts, d: computeDerived(facts, now) };
  }, [snapshot, now]);
  const { facts, d } = view;
  const tz = facts.profile.timeZone;

  const total = d.completed.length;
  const last28 = d.completed.filter((b) => diffDays(sessionDateKey(b.session.startedAt, tz), d.today) <= 28).length;
  const lastDays = total ? diffDays(sessionDateKey(d.completed[0].session.startedAt, tz), d.today) : null;
  const freq = weeklyFrequency(d.completed, tz, d.today, 12);

  const regions = REGIONS.map((r) => {
    const entries = d.recovery.filter((x) => MUSCLE_BY_ID[x.muscleId]?.region === r.id && x.lastTrainedAt);
    const worst = entries.slice().sort((a, b) => a.readinessPct - b.readinessPct)[0];
    return { ...r, status: worst?.status ?? null, sets: Math.round((d.weekRegionSets[r.id] ?? 0) * 10) / 10 };
  });

  return (
    <div className="mx-auto max-w-lg px-4 pb-16">
      <header className="pt-safe pt-6 pb-2">
        <div className="text-[13px] text-muted">🌱 Fitness Garden · 只读分享</div>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{snapshot.title}</h1>
        <div className="text-xs text-faint mt-1">最近更新：{new Date(snapshot.publishedAt).toLocaleString("zh-CN", { timeZone: tz, hour12: false })}</div>
      </header>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Stat label="累计训练" value={`${total}`} unit="次" />
        <Stat label="近 28 天" value={`${last28}`} unit="次" />
        <Stat label="距上次" value={lastDays == null ? "—" : lastDays === 0 ? "今天" : `${lastDays}`} unit={lastDays ? "天" : ""} />
      </div>

      {d.active && <LiveCard bundle={d.active} exerciseById={d.exerciseById} />}

      <SectionTitle>每周训练天数</SectionTitle>
      <Card>
        <BarChart ariaLabel="最近 12 周每周训练天数" data={freq.map((w) => ({ label: w.weekStart.slice(5), value: w.days }))} unit="天" />
      </Card>

      <SectionTitle>部位状态（按训练记录估算）</SectionTitle>
      <Card className="!p-0 divide-y divide-line">
        {regions.map((r) => (
          <div key={r.id} className="flex items-center justify-between p-3">
            <span>
              {r.emoji} {r.name}
            </span>
            <span className="flex items-center gap-3 text-sm text-muted">
              <span>本周 {r.sets} 组</span>
              {r.status ? <StatusBadge status={r.status} /> : <span className="text-faint text-xs">暂无记录</span>}
            </span>
          </div>
        ))}
      </Card>

      <SectionTitle>最近训练</SectionTitle>
      <div className="space-y-2">
        {d.completed.slice(0, 20).map((b) => {
          const sum = summarizeSession(b, d.exerciseById);
          const mins = sessionDurationMin(b);
          return (
            <Card key={b.session.id}>
              <div className="flex justify-between text-sm">
                <span className="font-semibold">
                  {sessionDateKey(b.session.startedAt, tz).replace(/-/g, "/")} {formatLocalTime(b.session.startedAt, tz)}
                </span>
                <span className="text-muted">{mins != null ? `${mins}分钟` : ""}</span>
              </div>
              <div className="mt-2 space-y-0.5">
                {sum.exercises.map((e) => {
                  const we = b.exercises.find((x) => x.exerciseId === e.exerciseId);
                  const sets = b.sets.filter((s) => s.workoutExerciseId === we?.id && s.completedAt && s.setType !== "warmup");
                  const loads = [...new Set(sets.map((s) => s.loadValue).filter((v) => v != null))];
                  const unit = sets[0]?.loadKind === "assistance" ? "kg辅助" : sets[0]?.loadUnit === "lb" ? "lb" : "kg";
                  return (
                    <div key={e.exerciseId} className="flex justify-between text-sm gap-2">
                      <span className="truncate">{e.name}</span>
                      <span className="text-muted shrink-0">
                        {e.detail}
                        {loads.length > 0 && ` · ${loads.join("/")}${unit}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
        {!total && <Card className="text-center text-sm text-muted">还没有完成的训练</Card>}
      </div>

      <p className="text-xs text-faint text-center mt-8">此页面只展示已完成的训练记录，不包含体重、照片、位置等个人信息。</p>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <Card className="!p-3 text-center">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-2xl font-bold num">
        {value}
        <span className="text-xs font-normal text-muted ml-0.5">{unit}</span>
      </div>
    </Card>
  );
}

function LiveCard({ bundle, exerciseById }: { bundle: SessionBundle; exerciseById: Record<string, Exercise> }) {
  const sum = summarizeSession(bundle, exerciseById);
  return (
    <>
      <SectionTitle>
        <span className="text-accent">● 正在训练</span>
      </SectionTitle>
      <Card data-testid="live-session">
        <div className="space-y-0.5">
          {sum.exercises.map((e) => (
            <div key={e.exerciseId} className="flex justify-between text-sm gap-2">
              <span className="truncate">{e.name}</span>
              <span className="text-muted shrink-0">{e.detail}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-faint mt-2">只显示已完成的组，训练结束后会归入下面的记录。</div>
      </Card>
    </>
  );
}
