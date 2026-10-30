/**
 * Public share snapshot.
 *
 * Only FACTS are published (completed sessions, their exercises and confirmed sets, plus the user's
 * own custom exercises so names resolve). Muscle loads / recovery / stats shown on the share page are
 * recomputed in the visitor's browser with computeDerived() — nothing derived is ever stored.
 *
 * Deliberately NOT included: body weight, height, goals, limitations, feedback, gyms / locations,
 * equipment, photos, free-text notes, unconfirmed (prefilled) sets, unfinished sessions.
 */
import type { Exercise, UserProfile, WorkoutExercise, WorkoutSession, WorkoutSet } from "@/core/types";
import type { Facts } from "./derived";
import { SEED_EXERCISES } from "./seed/exercises";

export const SHARE_FORMAT = "ai-fitness-garden-share";
export const SHARE_VERSION = 1;

export type ShareSession = Pick<WorkoutSession, "id" | "startedAt" | "completedAt" | "source">;
export type ShareExercise = Pick<WorkoutExercise, "id" | "sessionId" | "exerciseId" | "orderIndex">;
export type ShareSet = Pick<
  WorkoutSet,
  "id" | "workoutExerciseId" | "setIndex" | "side" | "movementDirection" | "setType" | "loadValue" | "loadUnit" | "loadKind" | "reps" | "durationSeconds" | "distanceM" | "rir" | "rpe" | "completedAt"
>;

export interface ShareSnapshot {
  format: typeof SHARE_FORMAT;
  version: number;
  publishedAt: string;
  title: string;
  timeZone: string;
  sessions: ShareSession[];
  workoutExercises: ShareExercise[];
  sets: ShareSet[];
  /** only the user's own exercises; built-in ones are resolved from the app's seed */
  customExercises: Exercise[];
}

export function buildSnapshot(f: Pick<Facts, "profile" | "sessions" | "workoutExercises" | "sets" | "exercises">, title: string, publishedAt = new Date().toISOString()): ShareSnapshot {
  const sessions = f.sessions.filter((s) => s.status === "completed" && s.completedAt);
  const sid = new Set(sessions.map((s) => s.id));
  const wes = f.workoutExercises.filter((w) => sid.has(w.sessionId));
  const weId = new Set(wes.map((w) => w.id));
  const sets = f.sets.filter((s) => weId.has(s.workoutExerciseId) && s.completedAt != null); // prefilled sets are not facts
  const used = new Set(wes.map((w) => w.exerciseId));
  return {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    publishedAt,
    title: title.trim().slice(0, 40) || "我的训练",
    timeZone: f.profile.timeZone,
    sessions: sessions.map((s) => ({ id: s.id, startedAt: s.startedAt, completedAt: s.completedAt, source: s.source })),
    workoutExercises: wes.map((w) => ({ id: w.id, sessionId: w.sessionId, exerciseId: w.exerciseId, orderIndex: w.orderIndex })),
    sets: sets.map((s) => ({
      id: s.id,
      workoutExerciseId: s.workoutExerciseId,
      setIndex: s.setIndex,
      side: s.side,
      movementDirection: s.movementDirection,
      setType: s.setType,
      loadValue: s.loadValue,
      loadUnit: s.loadUnit,
      loadKind: s.loadKind,
      reps: s.reps,
      durationSeconds: s.durationSeconds,
      distanceM: s.distanceM,
      rir: s.rir,
      rpe: s.rpe,
      completedAt: s.completedAt,
    })),
    customExercises: f.exercises.filter((e) => e.isCustom && used.has(e.id)).map((e) => ({ ...e, description: undefined })),
  };
}

/** Stable fingerprint of what would be published (ignores publishedAt) — used to skip no-op uploads. */
export function snapshotFingerprint(s: ShareSnapshot): string {
  const body = JSON.stringify([s.title, s.sessions, s.workoutExercises, s.sets, s.customExercises]);
  let h = 5381;
  for (let i = 0; i < body.length; i++) h = ((h << 5) + h + body.charCodeAt(i)) | 0;
  return `${body.length}:${(h >>> 0).toString(36)}`;
}

/** Rebuild just enough Facts for computeDerived() on the share page. No profile data is involved. */
export function snapshotToFacts(s: ShareSnapshot): Facts {
  const stamp = s.publishedAt;
  const profile: UserProfile = {
    id: "me",
    heightCm: null,
    weightKg: null,
    experience: "intermediate",
    timeZone: s.timeZone || "Asia/Tokyo",
    weeklyTrainingDays: 4,
    sessionMinutes: 60,
    regionPriority: { chest: "maintain", back: "maintain", shoulders: "maintain", core: "maintain", arms: "maintain", legs: "maintain" },
    goals: [],
    goalStartDate: s.sessions[0]?.startedAt.slice(0, 10) ?? stamp.slice(0, 10),
    goalTargetDate: stamp.slice(0, 10),
    excludedExerciseIds: [],
    limitations: "",
    currentGymId: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const byId = new Map<string, Exercise>(SEED_EXERCISES.map((e) => [e.id, e]));
  for (const c of s.customExercises) byId.set(c.id, c);
  return {
    profile,
    sessions: s.sessions.map((x) => ({ ...x, gymId: null, status: "completed" as const, createdAt: x.startedAt, updatedAt: x.startedAt })),
    workoutExercises: s.workoutExercises.map((w) => ({ ...w, gymEquipmentId: null, startedAt: null, completedAt: null, createdAt: stamp, updatedAt: stamp })),
    sets: s.sets.map((x) => ({ ...x, createdAt: x.completedAt ?? stamp, updatedAt: x.completedAt ?? stamp })),
    feedback: [],
    exercises: [...byId.values()],
    equipmentTypes: [],
    gyms: [],
    gymEquipment: [],
    links: [],
    bodyWeights: [],
  };
}
