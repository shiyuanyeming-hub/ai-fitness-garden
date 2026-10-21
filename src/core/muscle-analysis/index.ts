import { MUSCLE_BY_ID } from "../muscles";
import { SET_COUNTING, demandFactor, effortFactor } from "../params";
import type {
  Exercise,
  ExerciseMuscleMapping,
  ISODate,
  MuscleSide,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from "../types";

/**
 * One derived load contribution: "this session put X effective sets on muscle M (side S)".
 *
 * Counting convention (consistent across layers):
 *  - Lateral muscles are tracked per side. A bilateral set credits 1 to the left AND 1 to the right.
 *    Muscle-level totals use the MEAN of both sides, so "3 bilateral sets" = 3 sets, never 6.
 *  - Center muscles (abs, obliques, erectors, deep core) are one unit. A one-side or directional set
 *    credits them 0.5 (a left+right pair ≈ one bilateral set).
 */
export interface MuscleLoadEntry {
  sessionId: string;
  muscleId: string;
  side: MuscleSide;
  /** time the stimulus is considered applied (exercise completion → session completion → start) */
  at: ISODate;
  effectiveSets: number;
  /** effective sets × proximity-to-failure demand factor */
  recoveryDemand: number;
  /** completed working sets that had RIR/RPE recorded (for confidence) */
  setsWithEffort: number;
  totalSets: number;
  contributions: { exerciseId: string; effectiveSets: number }[];
}

export function rirOf(set: Pick<WorkoutSet, "rir" | "rpe">): number | null {
  if (set.rir != null && Number.isFinite(set.rir)) return Math.max(0, set.rir);
  if (set.rpe != null && Number.isFinite(set.rpe)) return Math.max(0, 10 - set.rpe);
  return null;
}

export function setTypeFactor(set: Pick<WorkoutSet, "setType">): number {
  switch (set.setType) {
    case "warmup":
      return SET_COUNTING.warmupFactor;
    case "dropset":
      return SET_COUNTING.dropsetFactor;
    case "other":
      return SET_COUNTING.otherFactor;
    default:
      return 1;
  }
}

/** A set counts as a training fact only when the user confirmed it and it has a meaningful amount of work. */
export function isCountableSet(set: WorkoutSet): boolean {
  if (!set.completedAt) return false;
  const hasWork =
    (set.reps != null && set.reps > 0) ||
    (set.durationSeconds != null && set.durationSeconds > 0) ||
    (set.distanceM != null && set.distanceM > 0);
  return hasWork;
}

/** Map one set onto (muscle side → share) for a given muscle mapping. */
export function sidesForSet(
  set: Pick<WorkoutSet, "side" | "movementDirection">,
  mapping: ExerciseMuscleMapping,
): { side: MuscleSide; share: number }[] {
  const muscle = MUSCLE_BY_ID[mapping.muscleId];
  const lateralMuscle = muscle?.supportsLaterality ?? false;
  const oneSide = set.side === "left" || set.side === "right";
  const directional = set.movementDirection === "left" || set.movementDirection === "right";

  if (mapping.lateralityRule === "directional_uncertain") {
    // Never invent a side. Overall load only.
    return [{ side: "center", share: directional || oneSide ? SET_COUNTING.directionalFactor : 1 }];
  }

  if (!lateralMuscle || mapping.lateralityRule === "center") {
    return [{ side: "center", share: oneSide || directional ? SET_COUNTING.oneSideToCenterFactor : 1 }];
  }

  // lateral muscle
  if (!oneSide) {
    return [
      { side: "left", share: 1 },
      { side: "right", share: 1 },
    ];
  }
  const s = set.side as "left" | "right";
  const opposite = s === "left" ? "right" : "left";
  switch (mapping.lateralityRule) {
    case "same_side":
      return [{ side: s, share: 1 }];
    case "contralateral":
      return [{ side: opposite, share: 1 }];
    case "both_sides":
      return [
        { side: "left", share: SET_COUNTING.oneSideToBothFactor },
        { side: "right", share: SET_COUNTING.oneSideToBothFactor },
      ];
    default:
      return [{ side: s, share: 1 }];
  }
}

export interface SessionBundle {
  session: WorkoutSession;
  exercises: WorkoutExercise[];
  sets: WorkoutSet[];
}

/** Derive muscle loads for a single session from its facts. Pure & deterministic. */
export function computeSessionLoads(bundle: SessionBundle, exerciseById: Record<string, Exercise>): MuscleLoadEntry[] {
  const { session, exercises, sets } = bundle;
  const acc = new Map<string, MuscleLoadEntry>();
  const sessionAt = session.completedAt ?? session.startedAt;

  for (const we of exercises) {
    const ex = exerciseById[we.exerciseId];
    if (!ex) continue;
    const at = we.completedAt ?? sessionAt;
    const weSets = sets.filter((s) => s.workoutExerciseId === we.id && isCountableSet(s));
    for (const set of weSets) {
      const typeF = setTypeFactor(set);
      if (typeF === 0) continue;
      const rir = rirOf(set);
      const eff = effortFactor(rir);
      const dem = demandFactor(rir);
      for (const mapping of ex.muscles) {
        for (const { side, share } of sidesForSet(set, mapping)) {
          const es = typeF * eff * mapping.contribution * share;
          if (es <= 0) continue;
          const key = `${mapping.muscleId}|${side}`;
          let e = acc.get(key);
          if (!e) {
            e = {
              sessionId: session.id,
              muscleId: mapping.muscleId,
              side,
              at,
              effectiveSets: 0,
              recoveryDemand: 0,
              setsWithEffort: 0,
              totalSets: 0,
              contributions: [],
            };
            acc.set(key, e);
          }
          // the latest exercise time hitting this muscle is the stimulus time
          if (at > e.at) e.at = at;
          e.effectiveSets += es;
          e.recoveryDemand += es * dem;
          e.totalSets += 1;
          if (rir != null) e.setsWithEffort += 1;
          const c = e.contributions.find((x) => x.exerciseId === ex.id);
          if (c) c.effectiveSets += es;
          else e.contributions.push({ exerciseId: ex.id, effectiveSets: es });
        }
      }
    }
  }
  return [...acc.values()].map((e) => ({
    ...e,
    effectiveSets: round2(e.effectiveSets),
    recoveryDemand: round2(e.recoveryDemand),
    contributions: e.contributions.map((c) => ({ ...c, effectiveSets: round2(c.effectiveSets) })),
  }));
}

export function computeAllLoads(bundles: SessionBundle[], exerciseById: Record<string, Exercise>): MuscleLoadEntry[] {
  return bundles.flatMap((b) => computeSessionLoads(b, exerciseById));
}

/**
 * Muscle-level effective sets (side-agnostic) using the consistent convention:
 * lateral muscle → mean of left and right; center muscle → its value.
 */
export function muscleLevelSets(entries: MuscleLoadEntry[]): Record<string, number> {
  const per: Record<string, { left: number; right: number; center: number }> = {};
  for (const e of entries) {
    const p = (per[e.muscleId] ??= { left: 0, right: 0, center: 0 });
    p[e.side] += e.effectiveSets;
  }
  const out: Record<string, number> = {};
  for (const [id, p] of Object.entries(per)) {
    const lateral = MUSCLE_BY_ID[id]?.supportsLaterality;
    out[id] = round2(lateral ? (p.left + p.right) / 2 : p.center);
  }
  return out;
}

/**
 * Region totals. For each exercise performance, the region is credited with the MAX muscle-level
 * contribution among that region's muscles (bench press 3 sets = 3 chest sets, not pec_upper + pec_mid),
 * then summed across exercises and sessions.
 */
export function regionLevelSets(entries: MuscleLoadEntry[]): Record<string, number> {
  // key: session|exercise|muscle → side values
  const perEx = new Map<string, { left: number; right: number; center: number }>();
  for (const e of entries) {
    for (const c of e.contributions) {
      const k = `${e.sessionId}|${c.exerciseId}|${e.muscleId}`;
      const p = perEx.get(k) ?? { left: 0, right: 0, center: 0 };
      p[e.side] += c.effectiveSets;
      perEx.set(k, p);
    }
  }
  // session|exercise|region → max muscle-level value
  const perExRegion = new Map<string, number>();
  for (const [k, p] of perEx) {
    const [sid, exId, muscleId] = k.split("|");
    const m = MUSCLE_BY_ID[muscleId];
    if (!m) continue;
    const v = m.supportsLaterality ? (p.left + p.right) / 2 : p.center;
    const rk = `${sid}|${exId}|${m.region}`;
    perExRegion.set(rk, Math.max(perExRegion.get(rk) ?? 0, v));
  }
  const out: Record<string, number> = {};
  for (const [rk, v] of perExRegion) {
    const region = rk.split("|")[2];
    out[region] = round2((out[region] ?? 0) + v);
  }
  return out;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
