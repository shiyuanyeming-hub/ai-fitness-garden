import { MUSCLE_BY_ID, REGION_NAME } from "../muscles";
import { CALCULATION_VERSION, MINUTES_PER_SET, PRESCRIPTION } from "../params";
import type { RecoveryEstimate, RecoveryStatus } from "../recovery";
import { STATUS_LABEL, worstOf } from "../recovery";
import { diffDays } from "../time";
import type { DateKey, Exercise, ExerciseKind, MovementPattern, Region, UserProfile } from "../types";
import type { Performance, ProgressionSuggestion } from "./progression";
import { suggestProgression } from "./progression";
import type { Availability } from "./substitution";
import { findSubstitutes, isAvailable, maxDifficulty } from "./substitution";

/** Muscles that decide whether a region is "ready". Stabilizer-only muscles don't block a region. */
export const REGION_KEY_MUSCLES: Record<Region, string[]> = {
  chest: ["pec_mid", "pec_upper"],
  back: ["lats", "traps_mid", "rhomboids"],
  shoulders: ["delt_front", "delt_side", "delt_rear"],
  core: ["abs", "obliques"],
  arms: ["biceps", "triceps"],
  legs: ["quads", "hamstrings", "glutes"],
};

const REGION_SLOTS: Record<Region, MovementPattern[][]> = {
  chest: [["horizontal_push", "incline_push"], ["incline_push", "chest_fly"], ["chest_fly", "horizontal_push"]],
  back: [["vertical_pull"], ["horizontal_pull"], ["rear_delt", "shrug", "back_extension"]],
  shoulders: [["lateral_raise"], ["rear_delt", "vertical_push"], ["vertical_push", "front_raise"]],
  core: [["trunk_flexion"], ["trunk_rotation", "anti_rotation", "anti_extension"]],
  arms: [["elbow_flexion"], ["elbow_extension"]],
  legs: [["squat"], ["hip_hinge", "knee_flexion"], ["knee_extension", "calf_raise"]],
};

export interface RegionState {
  region: Region;
  status: RecoveryStatus;
  readinessPct: number;
  readyAt: string | null;
  doneThisWeek: number;
  target: [number, number];
  priority: "focus" | "maintain" | "skip";
  daysSinceTrained: number | null;
}

export interface RecommendedExercise {
  exerciseId: string;
  region: Region;
  sets: number;
  reps: [number, number];
  rir: [number, number];
  restSec: number;
  progression: ProgressionSuggestion;
  why: string;
}

export interface DailyRecommendationView {
  date: DateKey;
  restDay: boolean;
  headline: string;
  regions: { region: Region; allocatedSets: number; reasons: string[] }[];
  exercises: RecommendedExercise[];
  cautions: string[];
  notes: string[];
  estimatedMinutes: number;
  regionStates: RegionState[];
  calculationVersion: string;
}

export interface DailyInput {
  date: DateKey;
  profile: UserProfile;
  recovery: RecoveryEstimate[];
  /** region → effective sets done this calendar week (Mon..today) */
  weekRegionSets: Record<string, number>;
  /** region → last trained date */
  lastTrainedDate: Partial<Record<Region, DateKey>>;
  weeklyTargets: Record<Region, [number, number]>;
  sessionsThisWeek: number;
  trainedToday: boolean;
  exercises: Exercise[];
  availability: Availability;
  /** exerciseId → performances newest first */
  history: Record<string, Performance[]>;
  /** exercise ids the user has performed before (familiarity) */
  familiar: Set<string>;
}

export function prescriptionFor(profile: UserProfile, kind: ExerciseKind) {
  const p = PRESCRIPTION[profile.experience];
  if (kind === "compound") return p.compound;
  if (kind === "core") return p.core;
  return p.isolation;
}

export function regionStates(input: DailyInput): RegionState[] {
  const { recovery, profile } = input;
  return (Object.keys(REGION_KEY_MUSCLES) as Region[]).map((region) => {
    const est = recovery.filter((r) => REGION_KEY_MUSCLES[region].includes(r.muscleId));
    const w = worstOf(est);
    const minReadiness = est.length ? Math.min(...est.map((e) => e.readinessPct)) : 100;
    const meanReadiness = est.length ? est.reduce((a, e) => a + e.readinessPct, 0) / est.length : 100;
    const readyFrac = est.length ? est.filter((e) => e.baseStatus === "ready").length / est.length : 1;
    const last = input.lastTrainedDate[region];
    // A region is only as blocked as most of its key muscles: a bench press (front delts as secondary)
    // should not lock the whole shoulder region when side and rear delts are fresh.
    let status: RecoveryStatus;
    if (est.some((e) => e.status === "attention")) status = "attention";
    else if (readyFrac === 1) status = "ready";
    else if (readyFrac >= 0.5 || minReadiness >= 60) status = "gradual";
    else status = "recovering";
    return {
      region,
      status,
      readinessPct: Math.round(readyFrac === 1 ? 100 : meanReadiness),
      readyAt: w?.readyAt ?? null,
      doneThisWeek: input.weekRegionSets[region] ?? 0,
      target: input.weeklyTargets[region],
      priority: profile.regionPriority[region] ?? "maintain",
      daysSinceTrained: last ? diffDays(input.date, last) : null,
    };
  });
}

function pickExercises(
  region: Region,
  totalSets: number,
  input: DailyInput,
  chosen: Set<string>,
): RecommendedExercise[] {
  const { profile, exercises, availability, recovery } = input;
  const excluded = new Set(profile.excludedExerciseIds);
  const keyMuscles = new Set(REGION_KEY_MUSCLES[region]);
  const fatigued = new Set(
    [...new Set(recovery.map((r) => r.muscleId))].filter((id) => {
      const w = worstOf(recovery.filter((r) => r.muscleId === id));
      return w && (w.status === "recovering" || w.status === "attention");
    }),
  );

  const pool = exercises.filter(
    (e) =>
      !excluded.has(e.id) &&
      !chosen.has(e.id) &&
      isAvailable(e, availability) &&
      e.difficulty <= maxDifficulty(profile.experience) &&
      e.muscles.some((m) => m.role === "primary" && keyMuscles.has(m.muscleId)),
  );

  const score = (e: Exercise) => {
    let s = 0;
    const p = e.muscles.filter((m) => m.role === "primary" && keyMuscles.has(m.muscleId)).reduce((a, m) => a + m.contribution, 0);
    s += Math.min(1.5, p);
    if (input.familiar.has(e.id)) s += 0.4; // stable progression on known movements
    if (e.difficulty === 1 && profile.experience === "beginner") s += 0.2;
    if (e.lateralityMode === "bilateral") s += 0.05; // faster to log
    for (const m of e.muscles) if (m.role !== "stabilizer" && !keyMuscles.has(m.muscleId) && fatigued.has(m.muscleId)) s -= 0.35 * m.contribution;
    for (const m of e.muscles) if (m.role === "primary" && keyMuscles.has(m.muscleId) && fatigued.has(m.muscleId)) s -= 1.2 * m.contribution;
    return s;
  };

  const out: RecommendedExercise[] = [];
  const slots = REGION_SLOTS[region];
  const nEx = Math.min(slots.length, totalSets <= 3 ? 1 : totalSets <= 7 ? 2 : 3);
  const base = Math.floor(totalSets / nEx);
  const plan = Array.from({ length: nEx }, (_, i) => base + (i < totalSets % nEx ? 1 : 0));
  let remaining = totalSets;
  for (let i = 0; i < nEx && remaining > 0; i++) {
    const inSlot = pool.filter((e) => slots[i].includes(e.pattern) && !chosen.has(e.id));
    const candidates = (inSlot.length ? inSlot : pool.filter((e) => !chosen.has(e.id))).sort((a, b) => score(b) - score(a));
    const ex = candidates[0];
    if (!ex) {
      if (out.length) out[out.length - 1].sets += remaining;
      break;
    }
    const pr = prescriptionFor(profile, ex.kind);
    const sets = plan[i];
    chosen.add(ex.id);
    remaining -= sets;
    const prog = suggestProgression(ex, input.history[ex.id] ?? [], pr.reps, null);
    const fatiguedOthers = ex.muscles.filter((m) => m.role === "secondary" && fatigued.has(m.muscleId)).map((m) => MUSCLE_BY_ID[m.muscleId]?.name);
    out.push({
      exerciseId: ex.id,
      region,
      sets,
      reps: [pr.reps[0], pr.reps[1]],
      rir: [pr.rir[0], pr.rir[1]],
      restSec: pr.restSec,
      progression: prog,
      why: [
        input.familiar.has(ex.id) ? "你做过这个动作，便于比较进步" : null,
        fatiguedOthers.length ? `注意：会少量训练仍在恢复的${fatiguedOthers.join("、")}` : null,
      ]
        .filter(Boolean)
        .join("；"),
    });
  }
  return out;
}

/**
 * Deterministic daily recommendation. A suggestion, never an obligation: actual training is stored
 * separately and the next recommendation is recomputed from what was really done.
 */
export function recommendToday(input: DailyInput): DailyRecommendationView {
  const { profile } = input;
  const states = regionStates(input);
  const cautions: string[] = [];
  const notes: string[] = [];

  for (const r of input.recovery) {
    if (r.status === "attention") {
      const m = MUSCLE_BY_ID[r.muscleId];
      cautions.push(`${m?.name ?? r.muscleId}${r.side === "left" ? "（左）" : r.side === "right" ? "（右）" : ""}：${r.attentionReasons.join(" ")}`);
    }
  }

  const remainingSessions = Math.max(1, profile.weeklyTrainingDays - input.sessionsThisWeek);
  const budgetSets = Math.max(6, Math.floor((profile.sessionMinutes - 8) / 3));
  const perSessionCap = profile.experience === "beginner" ? 6 : 8;

  const scored = states
    .filter((s) => s.priority !== "skip")
    .map((s) => {
      const [lo, hi] = s.target;
      const mid = (lo + hi) / 2;
      const need = Math.max(0, mid - s.doneThisWeek);
      const readyF = s.status === "ready" ? 1 : s.status === "gradual" ? 0.35 : 0;
      const prio = s.priority === "focus" ? 3 : 1.5;
      const gap = s.daysSinceTrained == null ? 0.5 : Math.min(1, s.daysSinceTrained / 4);
      const score = readyF * prio * (need + 0.5 * Math.max(0, hi - s.doneThisWeek) * 0.2 + gap);
      return { s, need, score };
    })
    .filter((x) => x.score > 0 && x.s.doneThisWeek < x.s.target[1])
    .sort((a, b) => b.score - a.score);

  const regions: DailyRecommendationView["regions"] = [];
  const exercises: RecommendedExercise[] = [];
  const chosen = new Set<string>();
  let budget = budgetSets;

  for (const { s, need } of scored) {
    if (budget < 3) break;
    if (regions.length >= 3) break;
    const sessionsLeftForRegion = Math.min(2, remainingSessions);
    let alloc = Math.ceil(need / sessionsLeftForRegion);
    alloc = Math.max(3, Math.min(perSessionCap, alloc, budget));
    if (s.region === "core" || s.region === "arms") alloc = Math.min(alloc, 4);
    const picked = pickExercises(s.region, alloc, input, chosen);
    if (!picked.length) {
      notes.push(`${REGION_NAME[s.region]}：当前健身房没有找到合适的已登记器械动作，可在器械库登记或自由记录。`);
      continue;
    }
    const reasons: string[] = [];
    reasons.push(
      s.status === "ready" ? `${REGION_NAME[s.region]}目前预计可以再次训练。` : `${REGION_NAME[s.region]}逐渐恢复中（约 ${s.readinessPct}%），本次安排相对保守。`,
    );
    reasons.push(`本周已完成约 ${round1(s.doneThisWeek)} 组，目标 ${s.target[0]}–${s.target[1]} 组。`);
    if (s.daysSinceTrained != null) reasons.push(s.daysSinceTrained === 0 ? "今天已经练过一部分。" : `距离上次训练 ${s.daysSinceTrained} 天。`);
    else reasons.push("近期没有训练记录。");
    if (s.priority === "focus") reasons.push("属于你的重点目标部位。");
    const used = picked.reduce((a, e) => a + e.sets, 0);
    budget -= used;
    regions.push({ region: s.region, allocatedSets: used, reasons });
    exercises.push(...picked);
  }

  // Note recently trained / recovering focus regions
  for (const s of states) {
    if (s.priority === "skip") continue;
    if ((s.status === "recovering" || s.status === "attention") && s.priority === "focus") {
      notes.push(`${REGION_NAME[s.region]}${STATUS_LABEL[s.status]}${s.readyAt ? `，预计 ${shortTime(s.readyAt, profile.timeZone)} 左右可再次高负荷训练` : ""}。如果今天仍想练，建议降低组数或强度。`);
    }
  }
  const skipped = states.filter((s) => s.priority === "skip").map((s) => REGION_NAME[s.region]);
  if (skipped.length) notes.push(`${skipped.join("、")}已设为暂不优先，不主动推荐。`);
  if (profile.limitations.trim()) notes.push(`你登记的限制：「${profile.limitations.trim()}」。选择动作时请留意，必要时使用「替换」。`);
  if (input.availability.unknown) notes.push("当前健身房还没有登记器械，按常见商业健身房器械推荐；登记器械后推荐会更准确。");

  const restDay = exercises.length === 0;
  const estimatedMinutes = Math.round(
    8 + exercises.reduce((a, e) => {
      const ex = input.exercises.find((x) => x.id === e.exerciseId);
      return a + e.sets * (MINUTES_PER_SET[ex?.kind ?? "other"] ?? 2.5);
    }, 0),
  );

  let headline: string;
  if (input.trainedToday && restDay) headline = "今天已经完成训练，好好恢复。";
  else if (restDay) {
    const soonest = states
      .filter((s) => s.priority !== "skip" && s.readyAt)
      .sort((a, b) => (a.readyAt ?? "").localeCompare(b.readyAt ?? ""))[0];
    headline = soonest
      ? `主要目标肌群都在恢复中，今天适合休息或轻松活动。${REGION_NAME[soonest.region]}预计最早恢复。`
      : "本周目标训练量已基本完成，今天适合休息或轻松活动。";
  } else headline = `今天建议：${regions.map((r) => REGION_NAME[r.region]).join(" + ")}`;
  if (input.trainedToday && !restDay) notes.unshift("你今天已经训练过；以下为如果还想继续训练时的建议。");

  return {
    date: input.date,
    restDay,
    headline,
    regions,
    exercises,
    cautions,
    notes,
    estimatedMinutes,
    regionStates: states,
    calculationVersion: CALCULATION_VERSION,
  };
}

export { findSubstitutes };

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function shortTime(iso: string, tz: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(d);
}
