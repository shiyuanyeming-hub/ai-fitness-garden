"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppReady } from "@/features/app-data";
import { Button, Card, cx, useToast } from "@/components/ui";
import { MUSCLE_BY_ID, REGION_NAME } from "@/core/muscles";
import { prescriptionFor, type DailyRecommendationView, type RecommendedExercise } from "@/core/recommendation/daily";
import { suggestProgression } from "@/core/recommendation/progression";
import { MINUTES_PER_SET } from "@/core/params";
import { db } from "@/data/db";
import { addExerciseToSession, getMeta, now as nowIso, setMeta, startSession, uid } from "@/data/repo";
import { recognitionStatus } from "@/features/recognition/client";
import { buildCoachInput, coachInputHash } from "./coach-input";
import { loadAdvice, requestAdvice, type StoredAdvice } from "./coach-client";

const DAY_LABEL = { train: "训练日", light: "轻量训练", rest: "休息日" } as const;

export function AiCoachCard() {
  const { facts, derived, now } = useAppReady();
  const router = useRouter();
  const toast = useToast();
  const [stored, setStored] = useState<StoredAdvice | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const autoTried = useRef(false);
  const today = derived.today;

  // Recomputed only when the underlying data changes (derived), not every clock tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentHash = useMemo(() => coachInputHash(buildCoachInput(facts, derived, now)), [facts, derived]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    const r = await requestAdvice(buildCoachInput(facts, derived, Date.now()));
    setLoading(false);
    if (r.ok) setStored(r.stored);
    else setError(r.message);
  };

  useEffect(() => {
    let cancel = false;
    loadAdvice(today).then(async (s) => {
      if (cancel) return;
      setStored(s);
      if (s || autoTried.current) return;
      autoTried.current = true;
      // Auto-generate once per day, only when AI is reachable and the token is right (no noisy failures).
      if ((await getMeta<string>("aiCoachAutoDate")) === today) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const st = await recognitionStatus();
      if (cancel || !st?.configured || !st.tokenOk) return;
      await setMeta("aiCoachAutoDate", today);
      generate();
    });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const advice = stored?.advice;
  const items: RecommendedExercise[] = useMemo(() => {
    if (!advice) return [];
    const out: RecommendedExercise[] = [];
    for (const a of advice.exercises) {
      const ex = derived.exerciseById[a.exerciseId];
      if (!ex) continue;
      const rule = derived.recommendation.exercises.find((r) => r.exerciseId === ex.id);
      const pr = prescriptionFor(facts.profile, ex.kind);
      const muscle = ex.muscles.filter((m) => m.role === "primary").sort((x, y) => y.contribution - x.contribution)[0];
      out.push({
        exerciseId: ex.id,
        region: rule?.region ?? (muscle ? MUSCLE_BY_ID[muscle.muscleId]?.region : undefined) ?? "core",
        sets: a.sets,
        reps: rule?.reps ?? [pr.reps[0], pr.reps[1]],
        rir: rule?.rir ?? [pr.rir[0], pr.rir[1]],
        restSec: rule?.restSec ?? pr.restSec,
        progression: rule?.progression ?? suggestProgression(ex, derived.perfs[ex.id] ?? [], pr.reps, null),
        why: a.note,
      });
    }
    return out;
  }, [advice, derived, facts.profile]);

  const minutes = Math.round(8 + items.reduce((acc, r) => acc + r.sets * (MINUTES_PER_SET[derived.exerciseById[r.exerciseId]?.kind ?? "other"] ?? 2.5), 0));

  const startFromAdvice = async () => {
    if (!advice) return;
    const recId = uid();
    const byRegion = new Map<string, number>();
    for (const r of items) byRegion.set(r.region, (byRegion.get(r.region) ?? 0) + r.sets);
    const view: DailyRecommendationView & { source: string } = {
      ...derived.recommendation,
      source: "ai-plan",
      headline: advice.headline,
      restDay: false,
      regions: [...byRegion].map(([region, allocatedSets]) => ({ region: region as RecommendedExercise["region"], allocatedSets, reasons: advice.reasons })),
      exercises: items,
      notes: [`AI 建议（${stored?.model}）`],
      estimatedMinutes: minutes,
    };
    await db().recommendations.put({ id: recId, date: today, view, calculationVersion: `ai:${stored?.model}`, createdAt: nowIso(), updatedAt: nowIso() });
    const s = await startSession({ gymId: facts.profile.currentGymId, source: "planned", recommendationId: recId });
    for (const r of items) await addExerciseToSession(s.id, r.exerciseId, null, { prefill: { sets: r.sets, reps: r.reps[1], load: r.progression.load } });
    toast("已按 AI 建议创建训练，每组完成后打勾才会记录");
    router.push("/workout");
  };

  const stale = stored && stored.hash !== currentHash;

  return (
    <Card className="mb-3" data-testid="ai-coach">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">🤖 AI 教练</div>
        {stored && (
          <button className="text-xs text-accent" onClick={generate} disabled={loading}>
            {loading ? "生成中…" : "重新生成"}
          </button>
        )}
      </div>

      {stored === undefined && <div className="text-sm text-muted mt-2">加载中…</div>}

      {stored === null && !loading && (
        <div className="mt-2">
          <p className="text-sm text-muted">让 AI 结合你的训练习惯、本周训练量和各部位恢复估计，给出今天的建议。</p>
          <Button variant="soft" block className="mt-2" onClick={generate} data-testid="ai-coach-generate">
            生成今日 AI 建议
          </Button>
        </div>
      )}

      {loading && !advice && <div className="text-sm text-muted mt-2 animate-pulse">AI 正在看你的记录…（约 5–15 秒）</div>}

      {error && (
        <div className="mt-2 rounded-xl bg-attention/10 p-3 text-sm">
          <div>{error}</div>
          <div className="text-xs text-muted mt-1">下面的规则建议不受影响。</div>
          <Link href="/me#ai" className="text-xs text-accent mt-1 inline-block">
            去测试 AI 连接 ›
          </Link>
        </div>
      )}

      {advice && (
        <div className={cx("mt-2", loading && "opacity-50")}>
          <div className="flex items-center gap-2">
            <span className={cx("text-[11px] px-2 py-0.5 rounded-full", advice.dayType === "rest" ? "bg-surface-2 text-muted" : "bg-accent-soft text-accent")}>{DAY_LABEL[advice.dayType]}</span>
            {advice.focusRegions.length > 0 && <span className="text-xs text-muted">{advice.focusRegions.map((r) => REGION_NAME[r]).join(" + ")}</span>}
          </div>
          <div className="font-semibold text-lg mt-1" data-testid="ai-coach-headline">
            {advice.headline}
          </div>
          {advice.summary && <p className="text-sm mt-1 leading-relaxed">{advice.summary}</p>}

          {advice.cautions.length > 0 && (
            <div className="mt-2 rounded-xl bg-attention/10 text-sm p-2.5 space-y-1">
              {advice.cautions.map((c) => (
                <div key={c}>⚠️ {c}</div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-2 divide-y divide-line">
              {items.map((r) => {
                const ex = derived.exerciseById[r.exerciseId];
                return (
                  <div key={r.exerciseId} className="py-2">
                    <div className="font-medium">{ex?.name}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {r.sets}组 × {r.reps[0]}–{r.reps[1]}次 · RIR {r.rir[0]}–{r.rir[1]}
                      {r.progression.load != null && (
                        <span className="num">
                          {" "}
                          · {r.progression.loadKind === "assistance" ? "辅助 " : ""}
                          {r.progression.load}
                          {r.progression.loadUnit ?? "kg"}
                        </span>
                      )}
                    </div>
                    {r.why && <div className="text-[11px] text-faint mt-0.5">{r.why}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {(advice.reasons.length > 0 || advice.habitTip) && (
            <button className="mt-1 text-xs text-accent" onClick={() => setOpen((v) => !v)}>
              {open ? "收起理由" : "为什么这样建议？"}
            </button>
          )}
          {open && (
            <div className="mt-1 text-sm text-muted space-y-1">
              <ul className="list-disc pl-5">
                {advice.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {advice.habitTip && <div className="text-xs">📅 {advice.habitTip}</div>}
            </div>
          )}

          {items.length > 0 && (
            <Button variant="primary" block className="mt-2" onClick={startFromAdvice} disabled={!!derived.active} data-testid="ai-coach-start">
              按 AI 建议开始（约 {minutes} 分钟）
            </Button>
          )}
          <div className="text-[11px] text-faint mt-2">
            {stale ? "你的记录或状态有变化，可以点「重新生成」。" : ""}
            重量和次数由 App 规则计算，AI 只负责选择和解释；恢复是估计，不是医学判断。
          </div>
        </div>
      )}
    </Card>
  );
}
