import type { MuscleLoadEntry, SessionBundle } from "../muscle-analysis";
import { isCountableSet, regionLevelSets, rirOf, round2 } from "../muscle-analysis";
import { addDays, sessionDateKey, toDateKey, weekStart } from "../time";
import type { DateKey, Exercise, LoadKind, LoadUnit } from "../types";
import type { Performance } from "../recommendation/progression";

/** Completed working-set performances per exercise, newest first. Used by progression & analytics. */
export function performancesByExercise(bundles: SessionBundle[]): Record<string, Performance[]> {
  const out: Record<string, Performance[]> = {};
  for (const b of bundles) {
    if (b.session.status !== "completed") continue;
    for (const we of b.exercises) {
      const sets = b.sets
        .filter((s) => s.workoutExerciseId === we.id && isCountableSet(s) && s.setType !== "warmup")
        .sort((a, c) => a.setIndex - c.setIndex);
      if (!sets.length) continue;
      (out[we.exerciseId] ??= []).push({
        sessionId: b.session.id,
        at: we.completedAt ?? b.session.completedAt ?? b.session.startedAt,
        gymEquipmentId: we.gymEquipmentId,
        sets: sets.map((s) => ({ side: s.side, loadKind: s.loadKind, loadValue: s.loadValue, loadUnit: s.loadUnit, reps: s.reps, rir: rirOf(s) })),
      });
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => b.at.localeCompare(a.at));
  return out;
}

export function weeklyFrequency(bundles: SessionBundle[], tz: string, today: DateKey, weeks = 12) {
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const counts = new Map<DateKey, Set<DateKey>>();
  for (const b of bundles) {
    if (b.session.status !== "completed") continue;
    const d = sessionDateKey(b.session.startedAt, tz);
    if (d < start) continue;
    const w = weekStart(d);
    (counts.get(w) ?? counts.set(w, new Set()).get(w)!).add(d);
  }
  return Array.from({ length: weeks }, (_, i) => {
    const w = addDays(start, i * 7);
    return { weekStart: w, days: counts.get(w)?.size ?? 0 };
  });
}

export function weeklyRegionSets(loads: MuscleLoadEntry[], tz: string, today: DateKey, weeks = 8) {
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const groups = new Map<DateKey, MuscleLoadEntry[]>();
  for (const e of loads) {
    const d = toDateKey(e.at, tz);
    if (d < start) continue;
    const w = weekStart(d);
    (groups.get(w) ?? groups.set(w, []).get(w)!).push(e);
  }
  return Array.from({ length: weeks }, (_, i) => {
    const w = addDays(start, i * 7);
    return { weekStart: w, regions: regionLevelSets(groups.get(w) ?? []) };
  });
}

export interface ProgressPoint {
  date: DateKey;
  topLoad: number | null;
  repsAtTop: number;
  e1rm: number | null;
  gymEquipmentId: string | null;
  loadKind: LoadKind;
  loadUnit: LoadUnit | null;
}

/** Epley estimate, only for external loads with ≤ 12 reps. Labelled as an estimate in the UI. */
export function epley(load: number, reps: number): number | null {
  if (reps < 1 || reps > 12 || load <= 0) return null;
  return round2(load * (1 + reps / 30));
}

export function exerciseProgress(perfs: Performance[], tz: string): ProgressPoint[] {
  return [...perfs]
    .reverse()
    .map((p) => {
      const kind = p.sets[0]?.loadKind ?? "external";
      const loads = p.sets.map((s) => s.loadValue ?? 0);
      const top = kind === "assistance" ? Math.min(...loads) : Math.max(...loads);
      const atTop = p.sets.filter((s) => (s.loadValue ?? 0) === top);
      const reps = Math.max(0, ...atTop.map((s) => s.reps ?? 0));
      const e1 = kind === "external" ? Math.max(0, ...p.sets.map((s) => epley(s.loadValue ?? 0, s.reps ?? 0) ?? 0)) || null : null;
      return {
        date: toDateKey(p.at, tz),
        topLoad: kind === "bodyweight" && !top ? null : top,
        repsAtTop: reps,
        e1rm: e1,
        gymEquipmentId: p.gymEquipmentId,
        loadKind: kind,
        loadUnit: p.sets[0]?.loadUnit ?? null,
      };
    });
}

export interface PersonalBest {
  exerciseId: string;
  gymEquipmentId: string | null;
  loadKind: LoadKind;
  loadUnit: LoadUnit | null;
  bestLoad: { value: number; reps: number; date: DateKey } | null;
  bestReps: { value: number; load: number | null; date: DateKey } | null;
  bestE1rm: { value: number; date: DateKey } | null;
}

/**
 * PRs are kept per (exercise, machine, load kind, unit): numbers on different machines or load kinds are
 * not comparable. For assisted exercises the "best load" is the LOWEST assistance.
 */
export function personalBests(exerciseId: string, perfs: Performance[], tz: string): PersonalBest[] {
  const groups = new Map<string, PersonalBest>();
  for (const p of perfs) {
    const date = toDateKey(p.at, tz);
    for (const s of p.sets) {
      if (s.reps == null || s.reps <= 0) continue;
      const key = `${p.gymEquipmentId ?? "-"}|${s.loadKind}|${s.loadUnit ?? "-"}`;
      let g = groups.get(key);
      if (!g) {
        g = { exerciseId, gymEquipmentId: p.gymEquipmentId, loadKind: s.loadKind, loadUnit: s.loadUnit, bestLoad: null, bestReps: null, bestE1rm: null };
        groups.set(key, g);
      }
      const v = s.loadValue;
      if (v != null && s.loadKind !== "bodyweight") {
        const better =
          !g.bestLoad ||
          (s.loadKind === "assistance" ? v < g.bestLoad.value : v > g.bestLoad.value) ||
          (v === g.bestLoad.value && s.reps > g.bestLoad.reps);
        if (better) g.bestLoad = { value: v, reps: s.reps, date };
      }
      if (!g.bestReps || s.reps > g.bestReps.value) g.bestReps = { value: s.reps, load: v, date };
      if (s.loadKind === "external" && v != null) {
        const e = epley(v, s.reps);
        if (e != null && (!g.bestE1rm || e > g.bestE1rm.value)) g.bestE1rm = { value: e, date };
      }
    }
  }
  return [...groups.values()];
}

export interface SideDiff {
  exerciseId: string;
  leftSets: number;
  rightSets: number;
  leftReps: number;
  rightReps: number;
  leftVolume: number;
  rightVolume: number;
  /** (right − left) / max — positive = right side stronger */
  diffPct: number;
}

/** Left/right comparison for genuinely unilateral sets within [from, to]. */
export function sideDifferences(bundles: SessionBundle[], exerciseById: Record<string, Exercise>, from: DateKey, tz: string): SideDiff[] {
  const acc = new Map<string, SideDiff>();
  for (const b of bundles) {
    if (sessionDateKey(b.session.startedAt, tz) < from) continue;
    for (const we of b.exercises) {
      const ex = exerciseById[we.exerciseId];
      if (!ex || (ex.lateralityMode !== "unilateral" && ex.lateralityMode !== "alternating")) continue;
      for (const s of b.sets) {
        if (s.workoutExerciseId !== we.id || !isCountableSet(s) || s.setType === "warmup") continue;
        if (s.side !== "left" && s.side !== "right") continue;
        const d = acc.get(ex.id) ?? { exerciseId: ex.id, leftSets: 0, rightSets: 0, leftReps: 0, rightReps: 0, leftVolume: 0, rightVolume: 0, diffPct: 0 };
        const vol = (s.reps ?? 0) * (s.loadKind === "external" ? s.loadValue ?? 0 : 1);
        if (s.side === "left") {
          d.leftSets++;
          d.leftReps += s.reps ?? 0;
          d.leftVolume += vol;
        } else {
          d.rightSets++;
          d.rightReps += s.reps ?? 0;
          d.rightVolume += vol;
        }
        acc.set(ex.id, d);
      }
    }
  }
  return [...acc.values()].map((d) => {
    const mx = Math.max(d.leftVolume, d.rightVolume);
    return { ...d, leftVolume: round2(d.leftVolume), rightVolume: round2(d.rightVolume), diffPct: mx ? round2(((d.rightVolume - d.leftVolume) / mx) * 100) : 0 };
  });
}

export function sessionDurationMin(b: SessionBundle): number | null {
  if (!b.session.completedAt) return null;
  return Math.max(0, Math.round((Date.parse(b.session.completedAt) - Date.parse(b.session.startedAt)) / 60000));
}
