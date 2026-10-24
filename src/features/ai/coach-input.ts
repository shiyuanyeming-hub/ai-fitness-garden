/**
 * Builds the compact, privacy-light summary sent to the AI coach. Pure (no React, no IndexedDB).
 * Everything here comes from facts + the deterministic engine; nothing is invented.
 */
import { MUSCLE_BY_ID, REGION_NAME, SIDE_LABEL } from "@/core/muscles";
import { REGION_KEY_MUSCLES } from "@/core/recommendation/daily";
import { isAvailable, maxDifficulty } from "@/core/recommendation/substitution";
import { STATUS_LABEL, worstOf } from "@/core/recovery";
import { sessionDurationMin } from "@/core/analytics";
import { addDays, diffDays, sessionDateKey, weekStart } from "@/core/time";
import type { Region } from "@/core/types";
import type { Derived, Facts } from "@/data/derived";
import type { CoachCandidate, CoachInput } from "@/server/coach/types";

const LEVEL = { fatigue: ["很好", "一般", "疲劳"], sleep: ["很好", "一般", "较差"] } as const;
const EXP = { beginner: "初学者", intermediate: "中级", advanced: "高级" } as const;

function fmtBest(sets: { loadKind: string; loadValue: number | null; loadUnit: string | null; reps: number | null }[]): string | null {
  let best: (typeof sets)[number] | null = null;
  for (const s of sets) {
    if (s.reps == null) continue;
    if (!best) best = s;
    else if (s.loadKind === "assistance" ? (s.loadValue ?? 0) < (best.loadValue ?? 0) : (s.loadValue ?? 0) > (best.loadValue ?? 0)) best = s;
  }
  if (!best) return null;
  const load = best.loadValue != null ? `${best.loadKind === "assistance" ? "辅助" : ""}${best.loadValue}${best.loadUnit ?? "kg"}×` : "";
  return `${load}${best.reps}次`;
}

export function buildCoachInput(f: Facts, d: Derived, nowMs: number): CoachInput {
  const tz = f.profile.timeZone;
  const today = d.today;
  const completed = d.completed; // newest first
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("zh-CN", { timeZone: tz, ...o }).format(nowMs);

  // ---- habits ----
  const since28 = addDays(today, -27);
  const last28 = completed.filter((b) => sessionDateKey(b.session.startedAt, tz) >= since28);
  const days28 = new Set(last28.map((b) => sessionDateKey(b.session.startedAt, tz)));
  const durations = completed.slice(0, 20).map(sessionDurationMin).filter((x): x is number => x != null && x > 0 && x < 300);
  const hours = completed.slice(0, 20).map((b) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(b.session.startedAt))));
  let usualStart: string | null = null;
  if (hours.length >= 2) {
    const sorted = [...hours].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    usualStart = med < 6 ? "深夜" : med < 11 ? "上午" : med < 14 ? "中午" : med < 18 ? "下午" : med < 22 ? "晚上" : "深夜";
  }
  const counts = new Map<string, number>();
  for (const b of completed.slice(0, 30))
    for (const we of b.exercises) if (b.sets.some((s) => s.workoutExerciseId === we.id && s.completedAt)) counts.set(we.exerciseId, (counts.get(we.exerciseId) ?? 0) + 1);
  const topExercises = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, times]) => ({ name: d.exerciseById[id]?.name ?? "自定义动作", times }));
  const lastDate = completed[0] ? sessionDateKey(completed[0].session.startedAt, tz) : null;
  const ws = weekStart(today);
  const since7 = addDays(today, -6);
  let cardioSec7 = 0;
  for (const b of completed) {
    if (sessionDateKey(b.session.startedAt, tz) < since7) continue;
    for (const we of b.exercises)
      if (d.exerciseById[we.exerciseId]?.kind === "cardio")
        for (const st of b.sets) if (st.workoutExerciseId === we.id && st.completedAt) cardioSec7 += st.durationSeconds ?? 0;
  }
  const weekDays = new Set(completed.map((b) => sessionDateKey(b.session.startedAt, tz)).filter((k) => k >= ws));

  // ---- recent sessions (14 days, working sets only) ----
  const since14 = addDays(today, -13);
  const recent = completed
    .filter((b) => sessionDateKey(b.session.startedAt, tz) >= since14)
    .slice(0, 8)
    .map((b) => ({
      date: sessionDateKey(b.session.startedAt, tz),
      durationMin: sessionDurationMin(b),
      exercises: b.exercises
        .map((we) => {
          const sets = b.sets.filter((s) => s.workoutExerciseId === we.id && s.completedAt && s.setType !== "warmup");
          const ex = d.exerciseById[we.exerciseId];
          if (ex?.kind === "cardio") {
            const min = Math.round(sets.reduce((a, x) => a + (x.durationSeconds ?? 0), 0) / 60);
            const km = Math.round(sets.reduce((a, x) => a + (x.distanceM ?? 0), 0) / 100) / 10;
            return { name: `${ex.name}（有氧）`, workingSets: sets.length, best: `${min}分钟${km ? ` ${km}km` : ""}` };
          }
          return { name: ex?.name ?? "自定义动作", workingSets: sets.length, best: fmtBest(sets) };
        })
        .filter((e) => e.workingSets > 0)
        .slice(0, 12),
    }))
    .filter((s) => s.exercises.length);

  // ---- regions ----
  const regions = d.recommendation.regionStates.map((s) => ({
    region: s.region,
    name: REGION_NAME[s.region],
    priority: { focus: "重点", maintain: "维持", skip: "暂不优先" }[s.priority],
    status: STATUS_LABEL[s.status],
    readinessPct: Math.round(s.readinessPct),
    readyInHours: s.readyAt && Date.parse(s.readyAt) > nowMs ? Math.round((Date.parse(s.readyAt) - nowMs) / 36e5) : null,
    setsThisWeek: Math.round(s.doneThisWeek * 10) / 10,
    weeklyTarget: s.target,
    daysSinceTrained: s.daysSinceTrained,
  }));
  const attention = d.recovery
    .filter((r) => r.status === "attention")
    .map((r) => `${MUSCLE_BY_ID[r.muscleId]?.name ?? r.muscleId}${SIDE_LABEL[r.side] ? `（${SIDE_LABEL[r.side]}）` : ""}：${r.attentionReasons.join(" ")}`)
    .slice(0, 8);

  // ---- candidate exercises (available here, allowed, not skipped) ----
  const fatigued = new Set(
    [...new Set(d.recovery.map((r) => r.muscleId))].filter((id) => {
      const w = worstOf(d.recovery.filter((r) => r.muscleId === id));
      return w && (w.status === "recovering" || w.status === "attention");
    }),
  );
  const excluded = new Set(f.profile.excludedExerciseIds);
  const regionOf = (e: Facts["exercises"][number]): Region | null => {
    const p = e.muscles.filter((m) => m.role === "primary").sort((a, b) => b.contribution - a.contribution)[0];
    const r = p ? MUSCLE_BY_ID[p.muscleId]?.region : undefined;
    return r ?? null;
  };
  const ruleIds = new Set(d.recommendation.exercises.map((r) => r.exerciseId));
  const pool: (CoachCandidate & { score: number })[] = [];
  for (const e of f.exercises) {
    const region = regionOf(e);
    if (!region || f.profile.regionPriority[region] === "skip") continue;
    if (excluded.has(e.id) || !isAvailable(e, d.availability) || e.difficulty > maxDifficulty(f.profile.experience)) continue;
    if (e.kind === "cardio") continue;
    const primary = e.muscles.filter((m) => m.role === "primary");
    const primaryFatigued = primary.some((m) => fatigued.has(m.muscleId));
    const familiar = !!d.perfs[e.id]?.length;
    const keyHit = primary.some((m) => REGION_KEY_MUSCLES[region].includes(m.muscleId));
    pool.push({
      id: e.id,
      name: e.name,
      region,
      primary: primary.map((m) => MUSCLE_BY_ID[m.muscleId]?.name ?? m.muscleId).slice(0, 4),
      primaryFatigued,
      familiar,
      score: (ruleIds.has(e.id) ? 10 : 0) + (familiar ? 3 : 0) + (keyHit ? 1 : 0) - (primaryFatigued ? 2 : 0),
    });
  }
  const candidates = pool
    .sort((a, b) => b.score - a.score)
    .slice(0, 60)
    .map(({ score: _s, ...c }) => c);

  const checkin = f.feedback.find((x) => x.date === today && x.muscleId == null);
  const goalDaysLeft = f.profile.goalTargetDate ? diffDays(f.profile.goalTargetDate, today) : null;

  return {
    date: today,
    weekday: fmt({ weekday: "long" }),
    nowLocal: fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    profile: {
      experience: EXP[f.profile.experience],
      heightCm: f.profile.heightCm,
      weightKg: f.profile.weightKg,
      goals: f.profile.goals.slice(0, 10),
      weeklyTrainingDays: f.profile.weeklyTrainingDays,
      sessionMinutes: f.profile.sessionMinutes,
      priorities: { ...f.profile.regionPriority },
      limitations: f.profile.limitations.slice(0, 500),
      goalDaysLeft,
    },
    checkin: {
      energy: checkin?.fatigue != null ? LEVEL.fatigue[checkin.fatigue] : null,
      sleep: checkin?.sleep != null ? LEVEL.sleep[checkin.sleep] : null,
    },
    habits: {
      totalSessions: completed.length,
      sessionsLast28d: days28.size,
      avgSessionsPerWeek: Math.round((days28.size / 4) * 10) / 10,
      avgDurationMin: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      usualStart,
      daysSinceLastSession: lastDate ? diffDays(today, lastDate) : null,
      sessionsThisWeek: weekDays.size,
      trainedToday: weekDays.has(today),
      cardioMinutes7d: Math.round(cardioSec7 / 60),
      topExercises,
    },
    recent,
    regions,
    attention,
    rule: {
      headline: d.recommendation.headline,
      restDay: d.recommendation.restDay,
      exercises: d.recommendation.exercises.map((r) => ({ id: r.exerciseId, name: d.exerciseById[r.exerciseId]?.name ?? r.exerciseId, sets: r.sets, region: REGION_NAME[r.region] })),
    },
    candidates,
  };
}

/** Stable fingerprint of the input, so a cached advice can tell whether the data has changed. */
export function coachInputHash(input: CoachInput): string {
  const s = JSON.stringify({ ...input, nowLocal: undefined, regions: input.regions.map((r) => ({ ...r, readinessPct: Math.round(r.readinessPct / 25), readyInHours: r.readyInHours == null ? null : Math.round(r.readyInHours / 12) })) });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}
