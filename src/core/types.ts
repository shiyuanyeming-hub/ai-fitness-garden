/**
 * Domain types shared by the pure algorithm layer (src/core) and the storage layer (src/data).
 * Facts (sessions / exercises / sets / feedback) are the source of truth.
 * Everything in src/core/* is derived from them and can be recomputed at any time.
 */

export type ISODate = string; // UTC ISO-8601 timestamp, e.g. 2026-10-21T10:00:00.000Z
export type DateKey = string; // local calendar day "YYYY-MM-DD" in the user's time zone

// ---------- Muscles ----------
export type Region = "chest" | "back" | "shoulders" | "arms" | "core" | "legs";

export interface Muscle {
  id: string;
  name: string; // 中文
  nameEn: string;
  region: Region;
  /** true = tracked separately for left / right. false = tracked as a single "center" unit. */
  supportsLaterality: boolean;
  /** Relative size class used only as a recovery-window modifier (product estimate). */
  size: "large" | "medium" | "small";
}

export type MuscleSide = "left" | "right" | "center";

// ---------- Exercises ----------
export type LateralityMode = "bilateral" | "unilateral" | "alternating" | "directional";
export type ResistanceType = "external_load" | "assisted" | "bodyweight" | "band" | "other";
export type MeasurementType = "reps_weight" | "reps_only" | "duration" | "distance" | "other";
export type ExerciseKind = "compound" | "isolation" | "core" | "cardio" | "other";
export type MovementPattern =
  | "horizontal_push"
  | "incline_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "chest_fly"
  | "lateral_raise"
  | "front_raise"
  | "rear_delt"
  | "shrug"
  | "elbow_flexion"
  | "elbow_extension"
  | "trunk_flexion"
  | "trunk_rotation"
  | "anti_rotation"
  | "anti_extension"
  | "hip_hinge"
  | "squat"
  | "lunge"
  | "knee_extension"
  | "knee_flexion"
  | "hip_extension"
  | "calf_raise"
  | "back_extension"
  | "carry"
  | "other";

export type MuscleRole = "primary" | "secondary" | "stabilizer";

/**
 * How a set's side / direction maps onto the muscle's side.
 * - same_side: a left-side set loads the left muscle (single-arm lateral raise → left side delt)
 * - both_sides: the muscle works on both sides regardless (e.g. core bracing)
 * - contralateral: a left-side set loads the right muscle
 * - center: muscle has no laterality; credited as a single unit
 * - directional_uncertain: movement direction is known but which side of the muscle does
 *   the work is not reliably known → only an overall (center) load is recorded.
 */
export type LateralityRule = "same_side" | "both_sides" | "contralateral" | "center" | "directional_uncertain";

export interface ExerciseMuscleMapping {
  muscleId: string;
  role: MuscleRole;
  /** Heuristic contribution coefficient (0–1). Product estimate, not a measurement. */
  contribution: number;
  lateralityRule: LateralityRule;
}

export interface Exercise {
  id: string;
  name: string;
  nameJa?: string;
  nameEn?: string;
  description?: string;
  kind: ExerciseKind;
  pattern: MovementPattern;
  lateralityMode: LateralityMode;
  resistanceType: ResistanceType;
  measurementType: MeasurementType;
  /** equipment type ids this exercise can be done on; [] = no equipment (bodyweight) */
  equipmentTypes: string[];
  difficulty: 1 | 2 | 3; // 1 = beginner friendly
  muscles: ExerciseMuscleMapping[];
  isCustom: boolean;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

// ---------- Workout facts ----------
export type SetSide = "left" | "right" | "both";
export type MovementDirection = "left" | "right" | "none";
export type SetType = "warmup" | "working" | "dropset" | "other";
export type LoadKind = "external" | "assistance" | "bodyweight" | "band";
export type LoadUnit = "kg" | "lb" | "level";

export interface WorkoutSet {
  id: string;
  workoutExerciseId: string;
  setIndex: number; // order within its side lane (1-based)
  side: SetSide;
  movementDirection: MovementDirection;
  setType: SetType;
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  loadKind: LoadKind;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  rir: number | null;
  rpe: number | null;
  /** null = prefilled / not yet confirmed. Only completed sets count as training facts. */
  completedAt: ISODate | null;
  notes?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface WorkoutExercise {
  id: string;
  sessionId: string;
  exerciseId: string;
  gymEquipmentId: string | null;
  orderIndex: number;
  /** UI preference for unilateral entry; does not change stored data shape */
  entryMode?: "same" | "separate";
  startedAt: ISODate | null;
  completedAt: ISODate | null;
  notes?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type SessionStatus = "active" | "completed";
export type SessionSource = "planned" | "free" | "imported";

export interface WorkoutSession {
  id: string;
  gymId: string | null;
  startedAt: ISODate;
  completedAt: ISODate | null;
  status: SessionStatus;
  source: SessionSource;
  recommendationId?: string | null;
  perceivedFatigue?: 1 | 2 | 3 | 4 | 5 | null;
  notes?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------- Feedback ----------
export type Level3 = 0 | 1 | 2; // 0 = good/none, 1 = medium/light, 2 = poor/obvious

export interface RecoveryFeedback {
  id: string;
  date: DateKey;
  /** null = whole-body daily check-in (energy / sleep). */
  muscleId: string | null;
  side: MuscleSide | null;
  soreness: Level3 | null; // 无 / 轻微 / 明显
  fatigue: Level3 | null; // 很好 / 一般 / 疲劳
  sleep: Level3 | null; // 很好 / 一般 / 较差
  pain?: boolean; // 疼痛（非普通酸痛）
  notes?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------- Profile / goals ----------
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type RegionPriority = "focus" | "maintain" | "skip";

export interface UserProfile {
  id: "me";
  heightCm: number | null;
  weightKg: number | null;
  experience: ExperienceLevel;
  timeZone: string;
  weeklyTrainingDays: number;
  sessionMinutes: number;
  regionPriority: Record<Region, RegionPriority>;
  goals: string[];
  goalStartDate: DateKey;
  goalTargetDate: DateKey;
  excludedExerciseIds: string[];
  limitations: string; // 伤痛或动作限制（自由文本）
  currentGymId: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}
