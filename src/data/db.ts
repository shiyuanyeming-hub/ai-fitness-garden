import Dexie, { type EntityTable } from "dexie";
import type {
  Exercise,
  ISODate,
  RecoveryFeedback,
  UserProfile,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from "@/core/types";
import type { EquipmentType } from "./seed/equipment";

export interface Gym {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** A physical machine in a gym. */
export interface GymEquipment {
  id: string;
  gymId: string;
  equipmentTypeId: string;
  customName?: string;
  brand?: string;
  model?: string;
  photoId?: string | null;
  isAvailable: boolean;
  isFavorite: boolean;
  lastUsedAt?: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CustomEquipmentType extends EquipmentType {
  isCustom: true;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Extra equipment ↔ exercise links created by the user (built-in links live on Exercise.equipmentTypes). */
export interface EquipmentExerciseLink {
  id: string;
  equipmentTypeId: string;
  exerciseId: string;
  /** when set, the link only applies to this specific machine */
  gymEquipmentId?: string | null;
  isPrimaryOption: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Photo {
  id: string;
  blob: Blob;
  thumb: Blob;
  hash: string;
  createdAt: ISODate;
}

export interface RecognitionLog {
  id: string;
  hash: string;
  photoId: string | null;
  status: "success" | "failed" | "confirmed" | "corrected";
  result: unknown | null;
  error?: string;
  confirmedEquipmentTypeId?: string | null;
  confirmedExerciseId?: string | null;
  model?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface BodyWeightLog {
  id: string;
  date: string;
  weightKg: number;
  notes?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Snapshot of what was recommended on a day — kept separately from what was actually trained. */
export interface DailyRecommendationRecord {
  id: string;
  date: string;
  view: unknown;
  calculationVersion: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface TrainingPlanRecord {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "active" | "archived";
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Tombstone {
  id: string; // `${table}:${rowId}`
  table: string;
  rowId: string;
  deletedAt: ISODate;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class FitnessDB extends Dexie {
  profile!: EntityTable<UserProfile, "id">;
  gyms!: EntityTable<Gym, "id">;
  equipmentTypes!: EntityTable<CustomEquipmentType, "id">;
  gymEquipment!: EntityTable<GymEquipment, "id">;
  exercises!: EntityTable<Exercise, "id">;
  equipmentExercises!: EntityTable<EquipmentExerciseLink, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;
  workoutExercises!: EntityTable<WorkoutExercise, "id">;
  sets!: EntityTable<WorkoutSet, "id">;
  feedback!: EntityTable<RecoveryFeedback, "id">;
  bodyWeights!: EntityTable<BodyWeightLog, "id">;
  photos!: EntityTable<Photo, "id">;
  recognitionLogs!: EntityTable<RecognitionLog, "id">;
  recommendations!: EntityTable<DailyRecommendationRecord, "id">;
  trainingPlans!: EntityTable<TrainingPlanRecord, "id">;
  tombstones!: EntityTable<Tombstone, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor(name = "ai-fitness-garden") {
    super(name);
    this.version(1).stores({
      profile: "id",
      gyms: "id, updatedAt",
      equipmentTypes: "id",
      gymEquipment: "id, gymId, equipmentTypeId, photoId, updatedAt",
      exercises: "id, updatedAt",
      equipmentExercises: "id, equipmentTypeId, gymEquipmentId, exerciseId",
      sessions: "id, startedAt, status, updatedAt",
      workoutExercises: "id, sessionId, exerciseId, gymEquipmentId, updatedAt",
      sets: "id, workoutExerciseId, updatedAt",
      feedback: "id, date, muscleId, createdAt",
      bodyWeights: "id, date",
      photos: "id, hash",
      recognitionLogs: "id, hash, photoId, createdAt",
      recommendations: "id, date",
      trainingPlans: "id, status",
      tombstones: "id, table, deletedAt",
      meta: "key",
    });
  }
}

let _db: FitnessDB | null = null;
export function db(): FitnessDB {
  if (!_db) _db = new FitnessDB();
  return _db;
}
/** tests only */
export function setDb(d: FitnessDB) {
  _db = d;
}

export const SYNCED_TABLES = [
  "profile",
  "gyms",
  "equipmentTypes",
  "gymEquipment",
  "exercises",
  "equipmentExercises",
  "sessions",
  "workoutExercises",
  "sets",
  "feedback",
  "bodyWeights",
  "recognitionLogs",
  "recommendations",
  "trainingPlans",
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];
