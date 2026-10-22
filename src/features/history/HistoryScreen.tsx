"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import type { StoredAdvice } from "@/features/ai/coach-client";
import type { DailyRecommendationView } from "@/core/recommendation/daily";
import { useAppReady } from "@/features/app-data";
import { Button, Card, PageHeader, SectionTitle, Segmented, TextInput, cx, useToast } from "@/components/ui";
import { BarChart, LineChart } from "@/components/charts";
import { addDays, diffDays, formatLocalTime, sessionDateKey, weekStart } from "@/core/time";
import { summarizeSession } from "@/core/summary";
import { exerciseProgress, personalBests, sideDifferences, weeklyFrequency, weeklyRegionSets, sessionDurationMin } from "@/core/analytics";
import { REGIONS, REGION_NAME } from "@/core/muscles";
import { phaseOn } from "@/core/recommendation/plan";
import { deleteBodyWeight, logBodyWeight } from "@/data/repo";
import { equipmentName } from "@/features/catalog";

export function HistoryScreen() {
  const [tab, setTab] = useState<"calendar" | "growth">("calendar");
  return (
    <div>
      <PageHeader title="历史" right={<Link href="/workout?backfill=1" className="text-accent text-sm">＋ 补录</Link>} />
      <Segmented
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: "calendar", label: "训练日历" },
          { value: "growth", label: "成长分析" },
        ]}
      />
      {tab === "calendar" ? <CalendarView /> : <GrowthView />}
    </div>
  );
}

function CalendarView() {
  const { facts, derived } = useAppReady();
  const tz = facts.profile.timeZone;
  const [month, setMonth] = useState(derived.today.slice(0, 7));
  const [day, setDay] = useState(derived.today);
  const byDay = useMemo(() => {
    const m = new Map<string, typeof derived.completed>();
    for (const b of derived.bundles) {
      const k = sessionDateKey(b.session.startedAt, tz);
      (m.get(k) ?? m.set(k, []).get(k)!).push(b);
    }
    return m;
  }, [derived.bundles, tz]);

  const first = `${month}-01`;
  const gridStart = weekStart(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const [y, mo] = month.split("-").map(Number);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const list = (byDay.get(day) ?? []).slice().sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt));
  const recs = useLiveQuery(() => db().recommendations.where("date").equals(day).sortBy("createdAt"), [day]);
  const original = recs?.find((r) => !(r.view as { source?: string })?.source)?.view as DailyRecommendationView | undefined;
  const aiAdvice = (recs?.find((r) => (r.view as { source?: string })?.source === "ai")?.view as StoredAdvice | undefined)?.advice;
  const actualRegions = new Set(list.flatMap((b) => summarizeSession(b, derived.exerciseById).primaryRegions));

  return (
    <div>
      <Card>
        <div className="flex items-center justify-between mb-2">
          <button className="size-9 rounded-full bg-surface-2" onClick={() => shift(-1)} aria-label="上个月">
            ‹
          </button>
          <div className="font-semibold">
            {y}年{mo}月
          </div>
          <button className="size-9 rounded-full bg-surface-2" onClick={() => shift(1)} aria-label="下个月">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-faint mb-1">
          {"一二三四五六日".split("").map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const inMonth = d.startsWith(month);
            const sessions = byDay.get(d) ?? [];
            const regions = new Set(sessions.flatMap((b) => summarizeSession(b, derived.exerciseById).primaryRegions));
            return (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={cx(
                  "aspect-square rounded-xl flex flex-col items-center justify-center text-sm relative",
                  !inMonth && "opacity-30",
                  day === d ? "bg-accent text-accent-ink" : sessions.length ? "bg-accent-soft" : "",
                  d === derived.today && day !== d && "ring-1 ring-accent",
                )}
              >
                <span className="num">{Number(d.slice(8))}</span>
                {regions.size > 0 && <span className="text-[8px] leading-none mt-0.5">{[...regions].slice(0, 2).map((r) => REGION_NAME[r][0]).join("")}</span>}
              </button>
            );
          })}
        </div>
      </Card>

      <SectionTitle>{day.replace(/-/g, "/")}</SectionTitle>
      {original && (
        <div className="text-xs text-muted px-1 mb-2">
          当日推荐：{original.restDay ? "休息" : original.regions.map((r) => REGION_NAME[r.region]).join(" + ")}
          {list.length > 0 && ` · 实际：${[...actualRegions].map((r) => REGION_NAME[r]).join(" + ") || "—"}`}
          <span className="text-faint">（推荐只作对照，不计入训练）</span>
        </div>
      )}
      {aiAdvice && (
        <div className="text-xs text-muted px-1 mb-2">
          AI 建议：{aiAdvice.headline}
        </div>
      )}
      {list.length === 0 && (
        <Card className="text-center text-sm text-muted">
          这天没有训练记录
          {day <= derived.today && (
            <div className="mt-2">
              <Link href={`/workout?backfill=1&date=${day}`} className="text-accent">
                补录这天的训练 ›
              </Link>
            </div>
          )}
        </Card>
      )}
      <div className="space-y-2">
        {list.map((b) => {
          const sum = summarizeSession(b, derived.exerciseById);
          const gym = facts.gyms.find((g) => g.id === b.session.gymId);
          return (
            <Link key={b.session.id} href={b.session.status === "active" ? "/workout" : `/workout?id=${b.session.id}`} className="card block p-4">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">
                  {formatLocalTime(b.session.startedAt, tz)}
                  {b.session.completedAt && ` – ${formatLocalTime(b.session.completedAt, tz)}`}
                  {b.session.status === "active" && <span className="ml-2 text-accent">进行中</span>}
                </span>
                <span className="text-muted">
                  {sessionDurationMin(b) != null && `${sessionDurationMin(b)}分钟`}
                  {gym && ` · ${gym.name}`}
                </span>
              </div>
              <div className="mt-2 space-y-0.5">
                {sum.exercises.map((e) => {
                  const we = b.exercises.find((x) => x.exerciseId === e.exerciseId);
                  const ge = facts.gymEquipment.find((g) => g.id === we?.gymEquipmentId);
                  const sets = b.sets.filter((s) => s.workoutExerciseId === we?.id && s.completedAt && s.setType !== "warmup");
                  const loads = [...new Set(sets.map((s) => s.loadValue).filter((v) => v != null))];
                  return (
                    <div key={e.exerciseId} className="flex justify-between text-sm gap-2">
                      <span className="truncate">
                        {e.name}
                        {ge && <span className="text-faint text-xs"> · {equipmentName(facts, ge)}</span>}
                      </span>
                      <span className="text-muted shrink-0">
                        {e.detail}
                        {loads.length > 0 && ` · ${loads.join("/")}${sets[0]?.loadKind === "assistance" ? "kg辅助" : sets[0]?.loadUnit === "lb" ? "lb" : "kg"}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-muted mt-2">
                {sum.primaryRegions.length > 0 && `部位：${sum.primaryRegions.map((r) => REGION_NAME[r]).join("、")}`}
                {b.session.perceivedFatigue && ` · 疲劳 ${b.session.perceivedFatigue}/5`}
                {b.session.source === "planned" && " · 按推荐"}
                {b.session.notes && ` · ${b.session.notes}`}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function GrowthView() {
  const { facts, derived } = useAppReady();
  const toast = useToast();
  const tz = facts.profile.timeZone;
  const today = derived.today;
  const phase = phaseOn(derived.plan, today);
  const freq = weeklyFrequency(derived.completed, tz, today, 12);
  const regionWeeks = weeklyRegionSets(derived.loads, tz, today, 8);
  const exIds = Object.keys(derived.perfs).sort((a, b) => (derived.perfs[b][0]?.at ?? "").localeCompare(derived.perfs[a][0]?.at ?? ""));
  const [exId, setExId] = useState<string>(exIds[0] ?? "");
  const perfs = derived.perfs[exId] ?? [];
  const machines = [...new Set(perfs.map((p) => p.gymEquipmentId ?? "none"))];
  const [machine, setMachine] = useState<string>("auto");
  const m = machine === "auto" || !machines.includes(machine) ? machines[0] : machine;
  const series = exerciseProgress(perfs.filter((p) => (p.gymEquipmentId ?? "none") === m), tz);
  const pbs = exIds.slice(0, 12).flatMap((id) => personalBests(id, derived.perfs[id], tz));
  const lr = sideDifferences(derived.completed, derived.exerciseById, addDays(today, -28), tz);
  const [w, setW] = useState("");
  const weights = [...facts.bodyWeights].sort((a, b) => a.date.localeCompare(b.date));

  const elapsed = Math.max(0, diffDays(today, derived.plan.startDate));
  const total = Math.max(1, diffDays(derived.plan.endDate, derived.plan.startDate));
  const thisWeek = freq[freq.length - 1]?.days ?? 0;
  const kindLabel = series[0]?.loadKind === "assistance" ? "辅助重量（越低越好）" : series[0]?.loadKind === "bodyweight" ? "加重" : "最高正式组重量";

  return (
    <div>
      <Card>
        <div className="flex justify-between items-baseline">
          <div className="font-semibold">目标进度 · {phase.name}</div>
          <div className="text-xs text-muted">
            第 {Math.min(derived.plan.totalWeeks, Math.floor(elapsed / 7) + 1)} / {derived.plan.totalWeeks} 周
          </div>
        </div>
        <div className="h-2 rounded-full bg-surface-3 mt-2 overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
        </div>
        <div className="text-xs text-muted mt-2">
          本周训练 {thisWeek} / {facts.profile.weeklyTrainingDays} 天 · {phase.rirGuide}
        </div>
        <div className="mt-3 space-y-1.5">
          {REGIONS.filter((r) => facts.profile.regionPriority[r.id] !== "skip").map((r) => {
            const done = derived.weekRegionSets[r.id] ?? 0;
            const [lo, hi] = phase.weeklyTargets[r.id];
            return (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <span className="w-14 text-muted">{r.name}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-3 relative overflow-hidden">
                  <div className="absolute inset-y-0 bg-accent/20" style={{ left: `${(lo / (hi * 1.3)) * 100}%`, width: `${((hi - lo) / (hi * 1.3)) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-accent rounded-full" style={{ width: `${Math.min(100, (done / (hi * 1.3)) * 100)}%` }} />
                </div>
                <span className="num w-16 text-right">
                  {Math.round(done * 10) / 10}/{lo}–{hi}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-faint mt-2">本周有效组数为估算值（主要肌群 1、辅助 0.5，按 RIR 修正）。</p>
      </Card>

      <SectionTitle>每周训练天数</SectionTitle>
      <Card>
        <BarChart ariaLabel="近12周每周训练天数" data={freq.map((f) => ({ label: f.weekStart.slice(5).replace("-", "/"), value: f.days }))} target={[facts.profile.weeklyTrainingDays, facts.profile.weeklyTrainingDays]} unit="天" />
      </Card>

      <SectionTitle>各部位每周有效组数（估算）</SectionTitle>
      <div className="space-y-2">
        {REGIONS.filter((r) => facts.profile.regionPriority[r.id] !== "skip").map((r) => (
          <Card key={r.id} className="!p-3">
            <div className="text-xs font-medium mb-1">{r.name}</div>
            <BarChart
              height={96}
              ariaLabel={`${r.name}每周有效组数`}
              data={regionWeeks.map((wk) => ({ label: wk.weekStart.slice(5).replace("-", "/"), value: wk.regions[r.id] ?? 0 }))}
              target={phase.weeklyTargets[r.id]}
              unit="组"
            />
          </Card>
        ))}
      </div>

      <SectionTitle>动作进步</SectionTitle>
      <Card>
        {exIds.length === 0 ? (
          <div className="text-sm text-muted text-center py-4">完成训练后这里会显示重量与次数的变化</div>
        ) : (
          <>
            <select className="w-full h-11 rounded-xl bg-surface-2 border border-line px-3" value={exId} onChange={(e) => setExId(e.target.value)}>
              {exIds.map((id) => (
                <option key={id} value={id}>
                  {derived.exerciseById[id]?.name ?? id}
                </option>
              ))}
            </select>
            {machines.length > 1 && (
              <select className="w-full h-10 mt-2 rounded-xl bg-surface-2 border border-line px-3 text-sm" value={m} onChange={(e) => setMachine(e.target.value)}>
                {machines.map((id) => (
                  <option key={id} value={id}>
                    {id === "none" ? "未指定器械" : equipmentName(facts, facts.gymEquipment.find((g) => g.id === id)) ?? "已删除的器械"}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-faint mt-1.5">不同器械的重量不可直接比较，所以按器械分别显示。</p>
            {series[0]?.loadKind !== "bodyweight" && (
              <>
                <div className="text-xs text-muted mt-3">{kindLabel}</div>
                <LineChart ariaLabel={kindLabel} data={series.map((p) => ({ label: p.date.slice(5).replace("-", "/"), value: p.topLoad, sub: `${p.repsAtTop}次` }))} unit={series[0]?.loadUnit === "lb" ? "lb" : "kg"} />
              </>
            )}
            <div className="text-xs text-muted mt-3">该重量下最多次数</div>
            <LineChart ariaLabel="最多次数" data={series.map((p) => ({ label: p.date.slice(5).replace("-", "/"), value: p.repsAtTop, sub: p.topLoad != null ? `@${p.topLoad}` : undefined }))} unit="次" height={110} />
            {series.some((p) => p.e1rm) && (
              <>
                <div className="text-xs text-muted mt-3">估算 1RM（Epley 公式，仅供趋势参考）</div>
                <LineChart ariaLabel="估算1RM" data={series.map((p) => ({ label: p.date.slice(5).replace("-", "/"), value: p.e1rm }))} unit="kg" height={110} />
              </>
            )}
          </>
        )}
      </Card>

      <SectionTitle>个人最佳</SectionTitle>
      <Card className="!p-0 divide-y divide-line">
        {pbs.length === 0 && <div className="p-4 text-sm text-muted">还没有记录</div>}
        {pbs.map((p) => (
          <div key={`${p.exerciseId}-${p.gymEquipmentId}-${p.loadKind}`} className="p-3 text-sm">
            <div className="font-medium">
              {derived.exerciseById[p.exerciseId]?.name}
              {p.gymEquipmentId && <span className="text-xs text-faint"> · {equipmentName(facts, facts.gymEquipment.find((g) => g.id === p.gymEquipmentId)) ?? "已删除器械"}</span>}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {p.bestLoad && `${p.loadKind === "assistance" ? "最低辅助" : "最大重量"} ${p.bestLoad.value}${p.loadUnit === "lb" ? "lb" : "kg"}×${p.bestLoad.reps}（${p.bestLoad.date.slice(5)}）`}
              {p.bestReps && ` · 最多 ${p.bestReps.value} 次`}
              {p.bestE1rm && ` · 估算1RM ${p.bestE1rm.value}kg`}
            </div>
          </div>
        ))}
      </Card>

      <SectionTitle>左右差异（近4周单侧动作）</SectionTitle>
      <Card className="!p-0 divide-y divide-line">
        {lr.length === 0 && <div className="p-4 text-sm text-muted">近 4 周没有单侧动作记录</div>}
        {lr.map((d) => (
          <div key={d.exerciseId} className="p-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{derived.exerciseById[d.exerciseId]?.name}</span>
              <span className={cx("num text-xs", Math.abs(d.diffPct) >= 10 ? "text-gradual" : "text-muted")}>
                {d.diffPct === 0 ? "均衡" : `${d.diffPct > 0 ? "右" : "左"}侧多 ${Math.abs(d.diffPct)}%`}
              </span>
            </div>
            <div className="text-xs text-muted mt-0.5">
              左 {d.leftSets}组 / {d.leftReps}次 · 右 {d.rightSets}组 / {d.rightReps}次
            </div>
          </div>
        ))}
      </Card>

      <SectionTitle>体重</SectionTitle>
      <Card>
        <div className="flex gap-2">
          <TextInput inputMode="decimal" placeholder={`今天的体重（kg）${facts.profile.weightKg ? `，上次 ${facts.profile.weightKg}` : ""}`} value={w} onChange={(e) => setW(e.target.value)} />
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await logBodyWeight(today, Number(w.replace(",", ".")));
                setW("");
                toast("已记录", "success");
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            记录
          </Button>
        </div>
        {weights.length > 0 && (
          <>
            <LineChart ariaLabel="体重变化" data={weights.map((x) => ({ label: x.date.slice(5).replace("-", "/"), value: x.weightKg }))} unit="kg" />
            <div className="mt-2 max-h-40 overflow-y-auto text-sm divide-y divide-line">
              {[...weights].reverse().map((x) => (
                <div key={x.id} className="flex justify-between py-1.5">
                  <span className="text-muted">{x.date}</span>
                  <span className="num">{x.weightKg} kg</span>
                  <button className="text-xs text-attention" onClick={() => deleteBodyWeight(x.id)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
