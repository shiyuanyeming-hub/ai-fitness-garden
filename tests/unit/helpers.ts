import type { SessionBundle } from "@/core/muscle-analysis";
import type { SetSide, MovementDirection, SetType, LoadKind, WorkoutSet, UserProfile } from "@/core/types";
import { SEED_EXERCISE_BY_ID } from "@/data/seed/exercises";

let n = 0;
const id = (p: string) => `${p}_${++n}`;

export interface SetSpec {
  load?: number | null;
  reps?: number | null;
  rir?: number | null;
  side?: SetSide;
  dir?: MovementDirection;
  type?: SetType;
  kind?: LoadKind;
  done?: boolean;
  duration?: number;
}

export function bundle(
  startedAt: string,
  items: { exerciseId: string; sets: SetSpec[]; gymEquipmentId?: string | null }[],
  opts: { endedAt?: string; sessionId?: string } = {},
): SessionBundle {
  const sid = opts.sessionId ?? id("s");
  const endedAt = opts.endedAt ?? new Date(Date.parse(startedAt) + 60 * 60000).toISOString();
  const exercises = items.map((it, i) => ({
    id: id("we"),
    sessionId: sid,
    exerciseId: it.exerciseId,
    gymEquipmentId: it.gymEquipmentId ?? null,
    orderIndex: i,
    startedAt,
    completedAt: endedAt,
    createdAt: startedAt,
    updatedAt: startedAt,
  }));
  const sets: WorkoutSet[] = [];
  items.forEach((it, i) => {
    const counters: Record<string, number> = {};
    for (const s of it.sets) {
      const lane = `${s.side ?? "both"}|${s.dir ?? "none"}`;
      counters[lane] = (counters[lane] ?? 0) + 1;
      const ex = SEED_EXERCISE_BY_ID[it.exerciseId];
      sets.push({
        id: id("set"),
        workoutExerciseId: exercises[i].id,
        setIndex: counters[lane],
        side: s.side ?? "both",
        movementDirection: s.dir ?? "none",
        setType: s.type ?? "working",
        loadValue: s.load ?? null,
        loadUnit: s.load != null ? "kg" : null,
        loadKind: s.kind ?? (ex?.resistanceType === "assisted" ? "assistance" : ex?.resistanceType === "bodyweight" ? "bodyweight" : "external"),
        reps: s.reps === undefined ? 10 : s.reps,
        durationSeconds: s.duration ?? null,
        distanceM: null,
        rir: s.rir ?? null,
        rpe: null,
        completedAt: s.done === false ? null : endedAt,
        createdAt: startedAt,
        updatedAt: startedAt,
      });
    }
  });
  return {
    session: { id: sid, gymId: null, startedAt, completedAt: endedAt, status: "completed", source: "free", createdAt: startedAt, updatedAt: startedAt },
    exercises,
    sets,
  };
}

export const times = (n: number, s: SetSpec): SetSpec[] => Array.from({ length: n }, () => ({ ...s }));

export function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "me",
    heightCm: 183,
    weightKg: 73.5,
    experience: "beginner",
    timeZone: "Asia/Tokyo",
    weeklyTrainingDays: 4,
    sessionMinutes: 60,
    regionPriority: { chest: "focus", back: "focus", shoulders: "focus", core: "focus", arms: "maintain", legs: "skip" },
    goals: [],
    goalStartDate: "2026-10-19",
    goalTargetDate: "2027-01-17",
    excludedExerciseIds: [],
    limitations: "",
    currentGymId: null,
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
    ...over,
  };
}
