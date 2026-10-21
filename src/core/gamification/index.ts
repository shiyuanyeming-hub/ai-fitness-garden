import type { RecoveryEstimate } from "../recovery";
import { estimateRecovery, worstOf } from "../recovery";
import type { MuscleLoadEntry, SessionBundle } from "../muscle-analysis";
import { addDays, sessionDateKey, weekStart } from "../time";
import type { Performance } from "../recommendation/progression";
import { REGION_KEY_MUSCLES } from "../recommendation/daily";
import type { Region, UserProfile } from "../types";

/**
 * Plant growth expresses ONLY the estimated readiness timeline. It never grows faster because you
 * trained more — training a plot again simply replants it (back to a seed).
 */
export type PlantStage = "fallow" | "seed" | "sprout" | "growing" | "budding" | "mature";

export const STAGE_LABEL: Record<PlantStage, string> = {
  fallow: "空地 · 可播种",
  seed: "刚播种",
  sprout: "发芽",
  growing: "生长中",
  budding: "含苞",
  mature: "成熟 · 可收获",
};

export function plantStage(e: RecoveryEstimate | null): PlantStage {
  if (!e || !e.lastTrainedAt) return "fallow";
  if (e.baseStatus === "ready") return "mature";
  const p = e.readinessPct;
  if (p < 15) return "seed";
  if (p < 45) return "sprout";
  if (p < 75) return "growing";
  return "budding";
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  progress: number; // current
  goal: number;
  unlocked: boolean;
}

/**
 * Rewards consistency, sensible recovery and steady progression — never raw volume or daily streaks
 * on the same muscle.
 */
export function computeAchievements(
  bundles: SessionBundle[],
  loads: MuscleLoadEntry[],
  perfs: Record<string, Performance[]>,
  profile: UserProfile,
  today: string,
): Achievement[] {
  const done = bundles.filter((b) => b.session.status === "completed");
  const tz = profile.timeZone;

  // Regular weeks: weeks (excluding current) meeting max(2, weeklyTrainingDays − 1) training days
  const need = Math.max(2, profile.weeklyTrainingDays - 1);
  const daysByWeek = new Map<string, Set<string>>();
  for (const b of done) {
    const d = sessionDateKey(b.session.startedAt, tz);
    const w = weekStart(d);
    (daysByWeek.get(w) ?? daysByWeek.set(w, new Set()).get(w)!).add(d);
  }
  let streak = 0;
  let w = addDays(weekStart(today), -7);
  while ((daysByWeek.get(w)?.size ?? 0) >= need) {
    streak++;
    w = addDays(w, -7);
  }

  // Patient harvests: a focus region trained when its key muscles were estimated ready
  let harvests = 0;
  const focusRegions = (Object.keys(profile.regionPriority) as Region[]).filter((r) => profile.regionPriority[r] === "focus");
  for (const b of done) {
    const at = Date.parse(b.session.startedAt);
    const prior = loads.filter((l) => l.sessionId !== b.session.id && Date.parse(l.at) < at);
    const trained = new Set(loads.filter((l) => l.sessionId === b.session.id && l.effectiveSets >= 1).map((l) => l.muscleId));
    const est = estimateRecovery(prior, [], { now: at, timeZone: tz, sessionCount: 99 });
    for (const r of focusRegions) {
      const keys = REGION_KEY_MUSCLES[r];
      if (!keys.some((k) => trained.has(k))) continue;
      const wst = worstOf(est.filter((e) => keys.includes(e.muscleId)));
      if (wst && wst.baseStatus === "ready") harvests++;
    }
  }

  // Steady progression: performances that beat the previous one on the same machine (more load, or more reps at same load)
  let progressions = 0;
  for (const list of Object.values(perfs)) {
    const chrono = [...list].reverse();
    for (let i = 1; i < chrono.length; i++) {
      const prev = chrono.slice(0, i).reverse().find((p) => p.gymEquipmentId === chrono[i].gymEquipmentId);
      if (!prev) continue;
      const kind = chrono[i].sets[0]?.loadKind;
      if (kind !== prev.sets[0]?.loadKind) continue;
      const best = (p: Performance) => {
        const loads = p.sets.map((s) => s.loadValue ?? 0);
        const top = kind === "assistance" ? Math.min(...loads) : Math.max(...loads);
        const reps = Math.max(...p.sets.filter((s) => (s.loadValue ?? 0) === top).map((s) => s.reps ?? 0));
        return { top, reps };
      };
      const a = best(prev);
      const c = best(chrono[i]);
      const heavier = kind === "assistance" ? c.top < a.top : c.top > a.top;
      if (heavier || (c.top === a.top && c.reps > a.reps)) progressions++;
    }
  }

  const list: Omit<Achievement, "unlocked">[] = [
    { id: "first", title: "第一颗种子", description: "完成第一次训练记录", progress: Math.min(1, done.length), goal: 1 },
    { id: "regular4", title: "规律园丁", description: `连续 4 周每周训练至少 ${need} 天`, progress: Math.min(4, streak), goal: 4 },
    { id: "regular8", title: "四季常青", description: `连续 8 周每周训练至少 ${need} 天`, progress: Math.min(8, streak), goal: 8 },
    { id: "harvest10", title: "耐心收获", description: "在重点部位「成熟」后再训练 10 次", progress: Math.min(10, harvests), goal: 10 },
    { id: "harvest30", title: "节律大师", description: "在重点部位「成熟」后再训练 30 次", progress: Math.min(30, harvests), goal: 30 },
    { id: "progress10", title: "稳步向上", description: "同一器械上相同重量多做次数或成功加重 10 次", progress: Math.min(10, progressions), goal: 10 },
    { id: "progress30", title: "渐进超负荷", description: "同一器械上取得 30 次进步", progress: Math.min(30, progressions), goal: 30 },
  ];
  return list.map((a) => ({ ...a, unlocked: a.progress >= a.goal }));
}
