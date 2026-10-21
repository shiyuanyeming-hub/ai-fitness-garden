/**
 * Everything derived (muscle loads, recovery, recommendation, stats) is recomputed from facts.
 * There is no persisted derived cache that could go stale: editing / deleting / back-filling a
 * session automatically changes every number shown, because the UI re-runs computeDerived().
 */
import type { Exercise, RecoveryFeedback, UserProfile, WorkoutExercise, WorkoutSession, WorkoutSet } from "@/core/types";
import type { SessionBundle, MuscleLoadEntry } from "@/core/muscle-analysis";
import { computeAllLoads, regionLevelSets } from "@/core/muscle-analysis";
import { estimateRecovery, learnPersonalMultipliers, type RecoveryEstimate } from "@/core/recovery";
import { buildPlan, phaseOn, type TrainingPlanView } from "@/core/recommendation/plan";
import { recommendToday, type DailyRecommendationView, REGION_KEY_MUSCLES } from "@/core/recommendation/daily";
import type { Availability } from "@/core/recommendation/substitution";
import { performancesByExercise } from "@/core/analytics";
import type { Performance } from "@/core/recommendation/progression";
import { sessionDateKey, toDateKey, weekStart } from "@/core/time";
import { MUSCLE_BY_ID } from "@/core/muscles";
import type { Region } from "@/core/types";
import { db, type BodyWeightLog, type EquipmentExerciseLink, type Gym, type GymEquipment, type CustomEquipmentType } from "./db";
import { SEED_EXERCISES } from "./seed/exercises";
import { EQUIPMENT_TYPES, type EquipmentType } from "./seed/equipment";

export interface Facts {
  profile: UserProfile;
  sessions: WorkoutSession[];
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
  feedback: RecoveryFeedback[];
  exercises: Exercise[];
  equipmentTypes: (EquipmentType | CustomEquipmentType)[];
  gyms: Gym[];
  gymEquipment: GymEquipment[];
  links: EquipmentExerciseLink[];
  bodyWeights: BodyWeightLog[];
}

export async function loadFacts(): Promise<Facts | null> {
  const d = db();
  const profile = await d.profile.get("me");
  if (!profile) return null;
  const [sessions, workoutExercises, sets, feedback, custom, customEq, gyms, gymEquipment, links, bodyWeights] = await Promise.all([
    d.sessions.toArray(),
    d.workoutExercises.toArray(),
    d.sets.toArray(),
    d.feedback.toArray(),
    d.exercises.toArray(),
    d.equipmentTypes.toArray(),
    d.gyms.toArray(),
    d.gymEquipment.toArray(),
    d.equipmentExercises.toArray(),
    d.bodyWeights.toArray(),
  ]);
  const byId = new Map<string, Exercise>(SEED_EXERCISES.map((e) => [e.id, e]));
  for (const c of custom) byId.set(c.id, c);
  return {
    profile,
    sessions,
    workoutExercises,
    sets,
    feedback,
    exercises: [...byId.values()],
    equipmentTypes: [...EQUIPMENT_TYPES, ...customEq],
    gyms,
    gymEquipment,
    links,
    bodyWeights,
  };
}

export interface Derived {
  today: string;
  exerciseById: Record<string, Exercise>;
  bundles: SessionBundle[]; // all sessions (completed + active), newest first
  completed: SessionBundle[];
  loads: MuscleLoadEntry[]; // from completed sessions AND confirmed sets of the active one
  recovery: RecoveryEstimate[];
  personal: Record<string, number>;
  plan: TrainingPlanView;
  recommendation: DailyRecommendationView;
  availability: Availability;
  perfs: Record<string, Performance[]>;
  weekRegionSets: Record<string, number>;
  active: SessionBundle | null;
}

export function bundlesFrom(f: Pick<Facts, "sessions" | "workoutExercises" | "sets">): SessionBundle[] {
  const weBySession = new Map<string, WorkoutExercise[]>();
  for (const we of f.workoutExercises) (weBySession.get(we.sessionId) ?? weBySession.set(we.sessionId, []).get(we.sessionId)!).push(we);
  const setsByWe = new Map<string, WorkoutSet[]>();
  for (const s of f.sets) (setsByWe.get(s.workoutExerciseId) ?? setsByWe.set(s.workoutExerciseId, []).get(s.workoutExerciseId)!).push(s);
  return [...f.sessions]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((session) => {
      const exercises = (weBySession.get(session.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex);
      const sets = exercises.flatMap((we) => setsByWe.get(we.id) ?? []);
      return { session, exercises, sets };
    });
}

export function availabilityFor(f: Facts, gymId: string | null): Availability {
  const eq = f.gymEquipment.filter((g) => g.gymId === gymId && g.isAvailable);
  const types = new Set(eq.map((e) => e.equipmentTypeId));
  const geIds = new Set(eq.map((e) => e.id));
  const linked = new Set(
    f.links.filter((l) => (l.gymEquipmentId ? geIds.has(l.gymEquipmentId) : types.has(l.equipmentTypeId))).map((l) => l.exerciseId),
  );
  return { equipmentTypes: types, linkedExerciseIds: linked, unknown: eq.length === 0 };
}

export function computeDerived(f: Facts, nowMs: number): Derived {
  const tz = f.profile.timeZone;
  const today = toDateKey(nowMs, tz);
  const exerciseById = Object.fromEntries(f.exercises.map((e) => [e.id, e]));
  const bundles = bundlesFrom(f);
  const completed = bundles.filter((b) => b.session.status === "completed");
  const active = bundles.find((b) => b.session.status === "active") ?? null;
  // The active session's confirmed sets are facts too — they count immediately.
  const loads = computeAllLoads(active ? [...completed, active] : completed, exerciseById);
  const personal = learnPersonalMultipliers(loads, f.feedback, tz);
  const recovery = estimateRecovery(loads, f.feedback, { now: nowMs, timeZone: tz, personal, sessionCount: completed.length });

  const plan = buildPlan(f.profile);
  const phase = phaseOn(plan, today);
  const ws = weekStart(today);
  const weekLoads = loads.filter((l) => toDateKey(l.at, tz) >= ws && Date.parse(l.at) <= nowMs);
  const weekRegionSets = regionLevelSets(weekLoads);

  const lastTrainedDate: Partial<Record<Region, string>> = {};
  for (const l of loads) {
    if (l.effectiveSets < 1) continue;
    const m = MUSCLE_BY_ID[l.muscleId];
    if (!m || !REGION_KEY_MUSCLES[m.region].includes(l.muscleId)) continue;
    const d = toDateKey(l.at, tz);
    if (!lastTrainedDate[m.region] || d > lastTrainedDate[m.region]!) lastTrainedDate[m.region] = d;
  }
  const sessionDays = new Set(completed.filter((b) => sessionDateKey(b.session.startedAt, tz) >= ws).map((b) => sessionDateKey(b.session.startedAt, tz)));
  const trainedToday = completed.some((b) => sessionDateKey(b.session.startedAt, tz) === today);

  const availability = availabilityFor(f, f.profile.currentGymId);
  const perfs = performancesByExercise(completed);
  const familiar = new Set(Object.keys(perfs));

  const recommendation = recommendToday({
    date: today,
    profile: f.profile,
    recovery,
    weekRegionSets,
    lastTrainedDate,
    weeklyTargets: phase.weeklyTargets,
    sessionsThisWeek: sessionDays.size - (trainedToday ? 1 : 0),
    trainedToday,
    exercises: f.exercises,
    availability,
    history: perfs,
    familiar,
  });

  return { today, exerciseById, bundles, completed, loads, recovery, personal, plan, recommendation, availability, perfs, weekRegionSets, active };
}
