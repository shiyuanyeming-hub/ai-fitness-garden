import type {
  Exercise,
  LoadKind,
  LoadUnit,
  MovementDirection,
  RecoveryFeedback,
  SetSide,
  SetType,
  UserProfile,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from "@/core/types";
import { DEFAULT_TZ, toDateKey, addDays } from "@/core/time";
import { db, type Gym, type GymEquipment, type EquipmentExerciseLink, type CustomEquipmentType, type SyncedTable } from "./db";
import { SEED_EXERCISES, SEED_EXERCISE_BY_ID } from "./seed/exercises";
import { EQUIPMENT_TYPES } from "./seed/equipment";
import { MUSCLE_BY_ID } from "@/core/muscles";

export const now = () => new Date().toISOString();

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function tombstone(table: SyncedTable, rowIds: string[]) {
  if (!rowIds.length) return;
  const t = now();
  await db().tombstones.bulkPut(rowIds.map((rowId) => ({ id: `${table}:${rowId}`, table, rowId, deletedAt: t })));
}

// ---------------------------------------------------------------- init

/** Initial profile from the user's brief. Everything is editable in 「我的」. */
export function defaultProfile(): UserProfile {
  const today = toDateKey(new Date(), DEFAULT_TZ);
  return {
    id: "me",
    heightCm: 183,
    weightKg: 73.5,
    experience: "beginner",
    timeZone: DEFAULT_TZ,
    weeklyTrainingDays: 4,
    sessionMinutes: 60,
    regionPriority: { chest: "focus", back: "focus", shoulders: "focus", core: "focus", arms: "maintain", legs: "skip" },
    goals: ["增加胸部肌肉", "增强背部肌肉", "改善肩部形态", "加强腹部肌肉", "适度减少体脂", "改善体态"],
    goalStartDate: today,
    goalTargetDate: addDays(today, 7 * 13 - 1),
    excludedExerciseIds: [],
    limitations: "",
    currentGymId: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

let initPromise: Promise<void> | null = null;
export function ensureInitialized(): Promise<void> {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

async function doInit() {
  const d = db();
  await d.transaction("rw", [d.profile, d.gyms, d.meta, d.trainingPlans], async () => {
    let profile = await d.profile.get("me");
    if (!profile) {
      profile = defaultProfile();
      const gym: Gym = { id: uid(), name: "我的健身房", isDefault: true, createdAt: now(), updatedAt: now() };
      await d.gyms.add(gym);
      profile.currentGymId = gym.id;
      await d.profile.add(profile);
      await d.trainingPlans.add({
        id: uid(),
        name: "3个月上半身增肌计划",
        startDate: profile.goalStartDate,
        endDate: profile.goalTargetDate,
        status: "active",
        createdAt: now(),
        updatedAt: now(),
      });
    }
    if (!(await d.meta.get("installedAt"))) await d.meta.put({ key: "installedAt", value: now() });
  });
  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    try {
      await navigator.storage.persist();
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------- profile

export async function updateProfile(patch: Partial<UserProfile>) {
  const d = db();
  const cur = (await d.profile.get("me")) ?? defaultProfile();
  const next = { ...cur, ...patch, id: "me" as const, updatedAt: now() };
  await d.profile.put(next);
  if (patch.goalStartDate || patch.goalTargetDate) {
    const active = await d.trainingPlans.where("status").equals("active").toArray();
    for (const p of active) await d.trainingPlans.update(p.id, { startDate: next.goalStartDate, endDate: next.goalTargetDate, updatedAt: now() });
  }
  return next;
}

// ---------------------------------------------------------------- catalog

export async function allExercises(): Promise<Exercise[]> {
  const custom = await db().exercises.toArray();
  const byId = new Map<string, Exercise>(SEED_EXERCISES.map((e) => [e.id, e]));
  for (const c of custom) byId.set(c.id, c);
  return [...byId.values()];
}

export async function allEquipmentTypes() {
  const custom = await db().equipmentTypes.toArray();
  return [...EQUIPMENT_TYPES, ...custom];
}

export interface CustomExerciseInput {
  id?: string;
  name: string;
  kind: Exercise["kind"];
  pattern?: Exercise["pattern"];
  lateralityMode: Exercise["lateralityMode"];
  resistanceType: Exercise["resistanceType"];
  measurementType: Exercise["measurementType"];
  primary: string[];
  secondary: string[];
  equipmentTypeId?: string | null;
  gymEquipmentId?: string | null;
  description?: string;
}

export async function saveCustomExercise(input: CustomExerciseInput): Promise<Exercise> {
  const name = input.name.trim();
  if (!name) throw new Error("请输入动作名称");
  if (!input.primary.length) throw new Error("请至少选择一个主要训练肌群");
  const d = db();
  const existing = input.id ? await d.exercises.get(input.id) : undefined;
  const directional = input.lateralityMode === "directional";
  const lateralRule = directional ? "directional_uncertain" : "same_side";
  const muscles: Exercise["muscles"] = [
    ...input.primary.map((m) => ({ muscleId: m, role: "primary" as const, contribution: 1, lateralityRule: (MUSCLE_BY_ID[m]?.supportsLaterality ? lateralRule : directional ? "directional_uncertain" : "center") as Exercise["muscles"][number]["lateralityRule"] })),
    ...input.secondary
      .filter((m) => !input.primary.includes(m))
      .map((m) => ({ muscleId: m, role: "secondary" as const, contribution: 0.5, lateralityRule: (MUSCLE_BY_ID[m]?.supportsLaterality ? lateralRule : directional ? "directional_uncertain" : "center") as Exercise["muscles"][number]["lateralityRule"] })),
  ];
  const ex: Exercise = {
    id: existing?.id ?? `custom_${uid()}`,
    name,
    description: input.description,
    kind: input.kind,
    pattern: input.pattern ?? "other",
    lateralityMode: input.lateralityMode,
    resistanceType: input.resistanceType,
    measurementType: input.measurementType,
    equipmentTypes: existing?.equipmentTypes ?? (input.equipmentTypeId ? [input.equipmentTypeId] : []),
    difficulty: 1,
    muscles,
    isCustom: true,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  };
  await d.exercises.put(ex);
  if (input.equipmentTypeId && !existing) {
    await linkExerciseToEquipment(ex.id, input.equipmentTypeId, input.gymEquipmentId ?? null);
  }
  return ex;
}

export async function linkExerciseToEquipment(exerciseId: string, equipmentTypeId: string, gymEquipmentId: string | null) {
  const d = db();
  const dup = await d.equipmentExercises
    .where("exerciseId")
    .equals(exerciseId)
    .filter((l) => l.equipmentTypeId === equipmentTypeId && (l.gymEquipmentId ?? null) === gymEquipmentId)
    .first();
  if (dup) return dup;
  const link: EquipmentExerciseLink = { id: uid(), equipmentTypeId, exerciseId, gymEquipmentId, isPrimaryOption: false, createdAt: now(), updatedAt: now() };
  await d.equipmentExercises.add(link);
  return link;
}

export async function deleteCustomExercise(id: string) {
  const used = await db().workoutExercises.where("exerciseId").equals(id).count();
  if (used) throw new Error(`这个动作已有 ${used} 条训练记录，不能删除（可以修改名称和肌群）。`);
  const links = await db().equipmentExercises.where("exerciseId").equals(id).primaryKeys();
  await db().equipmentExercises.bulkDelete(links as string[]);
  await db().exercises.delete(id);
  await tombstone("exercises", [id]);
  await tombstone("equipmentExercises", links as string[]);
}

/** Candidate exercises for an equipment type (built-in links + user links), custom ones included. */
export async function exercisesForEquipment(equipmentTypeId: string, gymEquipmentId?: string | null): Promise<Exercise[]> {
  const all = await allExercises();
  const links = await db().equipmentExercises.where("equipmentTypeId").equals(equipmentTypeId).toArray();
  const linked = new Set(links.filter((l) => !l.gymEquipmentId || l.gymEquipmentId === gymEquipmentId).map((l) => l.exerciseId));
  return all.filter((e) => e.equipmentTypes.includes(equipmentTypeId) || linked.has(e.id));
}

export async function createCustomEquipmentType(name: string, category: CustomEquipmentType["category"], isMultifunctional: boolean) {
  const t: CustomEquipmentType = {
    id: `custom_eq_${uid()}`,
    name: name.trim(),
    nameJa: "",
    nameEn: "",
    category,
    isMultifunctional,
    cues: "",
    isCustom: true,
    createdAt: now(),
    updatedAt: now(),
  };
  if (!t.name) throw new Error("请输入器械名称");
  await db().equipmentTypes.add(t);
  return t;
}

// ---------------------------------------------------------------- gyms & equipment

export async function saveGym(g: Partial<Gym> & { name: string }) {
  const d = db();
  const name = g.name.trim();
  if (!name) throw new Error("请输入健身房名称");
  const existing = g.id ? await d.gyms.get(g.id) : undefined;
  const gym: Gym = {
    id: existing?.id ?? uid(),
    name,
    description: g.description ?? existing?.description,
    isDefault: g.isDefault ?? existing?.isDefault ?? false,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  };
  await d.gyms.put(gym);
  return gym;
}

export async function deleteGym(id: string) {
  const d = db();
  const count = await d.gyms.count();
  if (count <= 1) throw new Error("至少需要保留一个健身房");
  const eq = await d.gymEquipment.where("gymId").equals(id).toArray();
  // Sessions keep their history; their gymId simply points to a removed gym.
  await d.transaction("rw", [d.gyms, d.gymEquipment, d.profile, d.photos], async () => {
    await d.gymEquipment.bulkDelete(eq.map((e) => e.id));
    await d.photos.bulkDelete(eq.map((e) => e.photoId).filter(Boolean) as string[]);
    await d.gyms.delete(id);
    const p = await d.profile.get("me");
    if (p?.currentGymId === id) {
      const other = await d.gyms.toCollection().first();
      await d.profile.update("me", { currentGymId: other?.id ?? null, updatedAt: now() });
    }
  });
  await tombstone("gyms", [id]);
  await tombstone("gymEquipment", eq.map((e) => e.id));
}

export async function addGymEquipment(input: {
  gymId: string;
  equipmentTypeId: string;
  customName?: string;
  brand?: string;
  model?: string;
  photoId?: string | null;
}) {
  const ge: GymEquipment = {
    id: uid(),
    gymId: input.gymId,
    equipmentTypeId: input.equipmentTypeId,
    customName: input.customName?.trim() || undefined,
    brand: input.brand?.trim() || undefined,
    model: input.model?.trim() || undefined,
    photoId: input.photoId ?? null,
    isAvailable: true,
    isFavorite: false,
    lastUsedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await db().gymEquipment.add(ge);
  return ge;
}

export async function updateGymEquipment(id: string, patch: Partial<GymEquipment>) {
  await db().gymEquipment.update(id, { ...patch, updatedAt: now() });
}

export async function deleteGymEquipment(id: string) {
  const d = db();
  const ge = await d.gymEquipment.get(id);
  if (!ge) return;
  await d.transaction("rw", [d.gymEquipment, d.photos, d.recognitionLogs], async () => {
    if (ge.photoId) await deletePhotoInner(ge.photoId);
    await d.gymEquipment.delete(id);
  });
  // Workout history keeps gymEquipmentId as a dangling reference (shown as "已删除的器械").
  await tombstone("gymEquipment", [id]);
}

// ---------------------------------------------------------------- photos

export async function savePhoto(blob: Blob, thumb: Blob, hash: string) {
  const id = uid();
  await db().photos.add({ id, blob, thumb, hash, createdAt: now() });
  return id;
}

async function deletePhotoInner(photoId: string) {
  const d = db();
  await d.photos.delete(photoId);
  const logs = await d.recognitionLogs.where("photoId").equals(photoId).toArray();
  await d.recognitionLogs.bulkDelete(logs.map((l) => l.id));
}

/** Delete a photo and the recognition records that reference it (privacy). */
export async function deletePhoto(photoId: string) {
  const d = db();
  await d.transaction("rw", [d.photos, d.recognitionLogs, d.gymEquipment], async () => {
    await deletePhotoInner(photoId);
    const ge = await d.gymEquipment.where("photoId").equals(photoId).toArray();
    for (const g of ge) await d.gymEquipment.update(g.id, { photoId: null, updatedAt: now() });
  });
}

export async function deleteAllPhotos() {
  const d = db();
  await d.transaction("rw", [d.photos, d.recognitionLogs, d.gymEquipment], async () => {
    await d.photos.clear();
    await d.recognitionLogs.clear();
    await d.gymEquipment.toCollection().modify({ photoId: null });
  });
}

// ---------------------------------------------------------------- sessions

export async function activeSession(): Promise<WorkoutSession | undefined> {
  return db().sessions.where("status").equals("active").first();
}

export async function startSession(opts: {
  gymId: string | null;
  source?: WorkoutSession["source"];
  recommendationId?: string | null;
  startedAt?: string;
  backfill?: boolean;
}): Promise<WorkoutSession> {
  const d = db();
  if (!opts.backfill) {
    const act = await activeSession();
    if (act) return act;
  }
  const t = now();
  const s: WorkoutSession = {
    id: uid(),
    gymId: opts.gymId,
    startedAt: opts.startedAt ?? t,
    completedAt: null,
    status: "active",
    source: opts.source ?? "free",
    recommendationId: opts.recommendationId ?? null,
    createdAt: t,
    updatedAt: t,
  };
  await d.sessions.add(s);
  return s;
}

/**
 * Changing a session's start time moves the whole session (exercise & set timestamps shift with it),
 * so recovery is recomputed around the corrected time.
 */
/** 补录：a past session is created already "completed"; its sets must still be confirmed one by one. */
export async function createBackfillSession(gymId: string | null, startedAt: string, completedAt: string) {
  if (completedAt < startedAt) throw new ValidationError("结束时间不能早于开始时间");
  if (Date.parse(startedAt) > Date.now() + 5 * 60_000) throw new ValidationError("补录时间不能在未来");
  const t = now();
  const s: WorkoutSession = { id: uid(), gymId, startedAt, completedAt, status: "completed", source: "free", createdAt: t, updatedAt: t, notes: "补录" };
  await db().sessions.add(s);
  return s;
}

export async function updateSession(id: string, patch: Partial<WorkoutSession>) {
  const d = db();
  const cur = await d.sessions.get(id);
  if (!cur) return;
  const start = patch.startedAt ?? cur.startedAt;
  const end = patch.completedAt !== undefined ? patch.completedAt : cur.completedAt;
  if (end && end < start) throw new ValidationError("结束时间不能早于开始时间");
  if (end && Date.parse(end) - Date.parse(start) > 12 * 3600_000) throw new ValidationError("一次训练不应超过 12 小时，请检查时间");
  const shift = Date.parse(start) - Date.parse(cur.startedAt);
  const lo = Date.parse(start);
  const hi = end ? Date.parse(end) : Number.POSITIVE_INFINITY;
  const fix = (iso: string | null) => (iso ? new Date(Math.min(hi, Math.max(lo, Date.parse(iso) + shift))).toISOString() : iso);
  await d.transaction("rw", [d.sessions, d.workoutExercises, d.sets], async () => {
    await d.sessions.update(id, { ...patch, updatedAt: now() });
    if (shift === 0 && patch.completedAt === undefined) return;
    const wes = await d.workoutExercises.where("sessionId").equals(id).toArray();
    for (const we of wes) {
      await d.workoutExercises.update(we.id, { startedAt: fix(we.startedAt), completedAt: fix(we.completedAt), updatedAt: now() });
      const sets = await d.sets.where("workoutExerciseId").equals(we.id).toArray();
      for (const s of sets) if (s.completedAt) await d.sets.update(s.id, { completedAt: fix(s.completedAt), updatedAt: now() });
    }
  });
}

/**
 * Finish: unconfirmed (prefilled) sets are discarded so they can never be mistaken for real work.
 * Returns the number of discarded sets.
 */
export async function finishSession(id: string, completedAt?: string): Promise<number> {
  const d = db();
  let discarded = 0;
  await d.transaction("rw", [d.sessions, d.workoutExercises, d.sets], async () => {
    const s = await d.sessions.get(id);
    if (!s) return;
    const wes = await d.workoutExercises.where("sessionId").equals(id).toArray();
    const end = completedAt ?? now();
    for (const we of wes) {
      const sets = await d.sets.where("workoutExerciseId").equals(we.id).toArray();
      const pending = sets.filter((x) => !x.completedAt);
      discarded += pending.length;
      await d.sets.bulkDelete(pending.map((p) => p.id));
      const done = sets.filter((x) => x.completedAt);
      if (!done.length) await d.workoutExercises.delete(we.id);
      else if (!we.completedAt) {
        const last = done.map((x) => x.completedAt!).sort().pop()!;
        const clamped = last > end ? end : last < s.startedAt ? s.startedAt : last;
        await d.workoutExercises.update(we.id, { completedAt: clamped, updatedAt: now() });
      }
    }
    await d.sessions.update(id, { status: "completed", completedAt: end < s.startedAt ? s.startedAt : end, updatedAt: now() });
  });
  return discarded;
}

export async function deleteSession(id: string) {
  const d = db();
  const wes = await d.workoutExercises.where("sessionId").equals(id).toArray();
  const setIds: string[] = [];
  await d.transaction("rw", [d.sessions, d.workoutExercises, d.sets], async () => {
    for (const we of wes) {
      const ids = (await d.sets.where("workoutExerciseId").equals(we.id).primaryKeys()) as string[];
      setIds.push(...ids);
      await d.sets.bulkDelete(ids);
    }
    await d.workoutExercises.bulkDelete(wes.map((w) => w.id));
    await d.sessions.delete(id);
  });
  await tombstone("sessions", [id]);
  await tombstone("workoutExercises", wes.map((w) => w.id));
  await tombstone("sets", setIds);
}

// ---------------------------------------------------------------- exercises within a session

function defaultLoadKind(ex: Exercise): LoadKind {
  switch (ex.resistanceType) {
    case "assisted":
      return "assistance";
    case "bodyweight":
      return "bodyweight";
    case "band":
      return "band";
    default:
      return "external";
  }
}

export function lanesFor(ex: Exercise): { side: SetSide; dir: MovementDirection }[] {
  switch (ex.lateralityMode) {
    case "unilateral":
    case "alternating":
      return [
        { side: "left", dir: "none" },
        { side: "right", dir: "none" },
      ];
    case "directional":
      return [
        { side: "both", dir: "left" },
        { side: "both", dir: "right" },
      ];
    default:
      return [{ side: "both", dir: "none" }];
  }
}

/** Last completed performance of this exercise (prefer same machine). */
export async function lastPerformance(exerciseId: string, gymEquipmentId: string | null, excludeSessionId?: string) {
  const d = db();
  const wes = (await d.workoutExercises.where("exerciseId").equals(exerciseId).toArray()).filter((w) => w.sessionId !== excludeSessionId);
  if (!wes.length) return null;
  const sessions = await d.sessions.bulkGet(wes.map((w) => w.sessionId));
  const candidates = wes
    .map((w, i) => ({ we: w, s: sessions[i] }))
    .filter((x) => x.s && x.s.status === "completed")
    .sort((a, b) => (b.we.completedAt ?? b.s!.startedAt).localeCompare(a.we.completedAt ?? a.s!.startedAt));
  const sameMachine = gymEquipmentId ? candidates.find((c) => c.we.gymEquipmentId === gymEquipmentId) : undefined;
  const pick = sameMachine ?? candidates.find((c) => !gymEquipmentId || !c.we.gymEquipmentId) ?? null;
  if (!pick) return null;
  const sets = (await d.sets.where("workoutExerciseId").equals(pick.we.id).toArray()).filter((s) => s.completedAt).sort((a, b) => a.setIndex - b.setIndex);
  return { we: pick.we, session: pick.s!, sets, sameMachine: !!sameMachine };
}

export async function addExerciseToSession(
  sessionId: string,
  exerciseId: string,
  gymEquipmentId: string | null,
  opts: { prefill?: { sets: number; reps?: number | null; load?: number | null } } = {},
): Promise<WorkoutExercise> {
  const d = db();
  const ex = (await d.exercises.get(exerciseId)) ?? SEED_EXERCISE_BY_ID[exerciseId];
  if (!ex) throw new Error("动作不存在");
  const existing = await d.workoutExercises.where("sessionId").equals(sessionId).toArray();
  const t = now();
  const we: WorkoutExercise = {
    id: uid(),
    sessionId,
    exerciseId,
    gymEquipmentId,
    orderIndex: existing.length,
    entryMode: "same",
    startedAt: t,
    completedAt: null,
    createdAt: t,
    updatedAt: t,
  };
  const last = await lastPerformance(exerciseId, gymEquipmentId, sessionId);
  const kind = defaultLoadKind(ex);
  const sets: WorkoutSet[] = [];
  const lanes = lanesFor(ex);
  for (const lane of lanes) {
    const fromLast = last?.sets.filter((s) => s.side === lane.side && s.movementDirection === lane.dir && s.setType !== "warmup") ?? [];
    const n = fromLast.length || opts.prefill?.sets || 3;
    for (let i = 0; i < n; i++) {
      const src = fromLast[i] ?? fromLast[fromLast.length - 1];
      sets.push(
        newSet(we.id, i + 1, lane.side, lane.dir, {
          loadKind: src?.loadKind ?? kind,
          loadValue: src?.loadValue ?? opts.prefill?.load ?? null,
          loadUnit: src?.loadUnit ?? (kind === "band" ? "level" : kind === "bodyweight" ? null : "kg"),
          reps: src?.reps ?? opts.prefill?.reps ?? null,
          durationSeconds: src?.durationSeconds ?? null,
        }),
      );
    }
  }
  // Unequal lanes from last time → separate entry mode
  if (lanes.length === 2) {
    const a = sets.filter((s) => s.side === lanes[0].side && s.movementDirection === lanes[0].dir);
    const b = sets.filter((s) => s.side === lanes[1].side && s.movementDirection === lanes[1].dir);
    const same = a.length === b.length && a.every((x, i) => x.loadValue === b[i].loadValue && x.reps === b[i].reps);
    we.entryMode = same ? "same" : "separate";
  }
  await d.transaction("rw", [d.workoutExercises, d.sets, d.gymEquipment], async () => {
    await d.workoutExercises.add(we);
    await d.sets.bulkAdd(sets);
    if (gymEquipmentId) await d.gymEquipment.update(gymEquipmentId, { lastUsedAt: t });
  });
  return we;
}

export function newSet(
  workoutExerciseId: string,
  setIndex: number,
  side: SetSide,
  dir: MovementDirection,
  v: Partial<WorkoutSet> = {},
): WorkoutSet {
  const t = now();
  return {
    id: uid(),
    workoutExerciseId,
    setIndex,
    side,
    movementDirection: dir,
    setType: v.setType ?? "working",
    loadValue: v.loadValue ?? null,
    loadUnit: v.loadUnit ?? null,
    loadKind: v.loadKind ?? "external",
    reps: v.reps ?? null,
    durationSeconds: v.durationSeconds ?? null,
    distanceM: v.distanceM ?? null,
    rir: v.rir ?? null,
    rpe: v.rpe ?? null,
    completedAt: v.completedAt ?? null,
    notes: v.notes,
    createdAt: t,
    updatedAt: t,
  };
}

export async function removeWorkoutExercise(weId: string) {
  const d = db();
  const ids = (await d.sets.where("workoutExerciseId").equals(weId).primaryKeys()) as string[];
  await d.transaction("rw", [d.workoutExercises, d.sets], async () => {
    await d.sets.bulkDelete(ids);
    await d.workoutExercises.delete(weId);
  });
  await tombstone("workoutExercises", [weId]);
  await tombstone("sets", ids);
}

export async function updateWorkoutExercise(id: string, patch: Partial<WorkoutExercise>) {
  await db().workoutExercises.update(id, { ...patch, updatedAt: now() });
}

// ---------------------------------------------------------------- sets

export class ValidationError extends Error {}

export function validateSetPatch(p: Partial<WorkoutSet>) {
  const range = (v: number | null | undefined, lo: number, hi: number, label: string) => {
    if (v == null) return;
    if (!Number.isFinite(v) || v < lo || v > hi) throw new ValidationError(`${label}应在 ${lo}–${hi} 之间`);
  };
  range(p.loadValue, 0, 1000, "重量");
  range(p.reps, 0, 1000, "次数");
  range(p.rir, 0, 10, "RIR");
  range(p.rpe, 1, 10, "RPE");
  range(p.durationSeconds, 0, 36000, "时间");
  range(p.distanceM, 0, 100000, "距离");
  if (p.reps != null && !Number.isInteger(p.reps)) throw new ValidationError("次数应为整数");
}

export async function updateSet(id: string, patch: Partial<WorkoutSet>) {
  validateSetPatch(patch);
  await db().sets.update(id, { ...patch, updatedAt: now() });
}

export async function completeSet(id: string, done = true) {
  const d = db();
  const s = await d.sets.get(id);
  if (!s) return;
  if (done) {
    const hasWork = (s.reps ?? 0) > 0 || (s.durationSeconds ?? 0) > 0 || (s.distanceM ?? 0) > 0;
    if (!hasWork) throw new ValidationError("请先填写次数（或时间/距离）");
  }
  let stamp = now();
  if (done) {
    // Editing a finished / back-filled session: the set happened during that session, not "now".
    const we = await d.workoutExercises.get(s.workoutExerciseId);
    const session = we ? await d.sessions.get(we.sessionId) : undefined;
    if (session?.status === "completed" && session.completedAt) stamp = we?.completedAt ?? session.completedAt;
  }
  await d.sets.update(id, { completedAt: done ? stamp : null, updatedAt: now() });
}

export async function deleteSet(id: string) {
  const d = db();
  const s = await d.sets.get(id);
  if (!s) return;
  await d.transaction("rw", [d.sets], async () => {
    await d.sets.delete(id);
    // re-index the lane
    const lane = (await d.sets.where("workoutExerciseId").equals(s.workoutExerciseId).toArray())
      .filter((x) => x.side === s.side && x.movementDirection === s.movementDirection)
      .sort((a, b) => a.setIndex - b.setIndex);
    for (let i = 0; i < lane.length; i++) if (lane[i].setIndex !== i + 1) await d.sets.update(lane[i].id, { setIndex: i + 1 });
  });
  await tombstone("sets", [id]);
}

/** Append a set to a lane, copying the lane's last set values (not its completion). */
export async function addSet(weId: string, side: SetSide, dir: MovementDirection, override: Partial<WorkoutSet> = {}) {
  const d = db();
  const lane = (await d.sets.where("workoutExerciseId").equals(weId).toArray())
    .filter((x) => x.side === side && x.movementDirection === dir)
    .sort((a, b) => a.setIndex - b.setIndex);
  const last = lane[lane.length - 1];
  const s = newSet(weId, lane.length + 1, side, dir, {
    loadKind: last?.loadKind ?? override.loadKind,
    loadValue: last?.loadValue ?? null,
    loadUnit: last?.loadUnit ?? "kg",
    reps: last?.reps ?? null,
    durationSeconds: last?.durationSeconds ?? null,
    setType: last?.setType === "warmup" ? "working" : last?.setType ?? "working",
    ...override,
  });
  await d.sets.add(s);
  return s;
}

/** Copy one lane's sets to the other lane as unconfirmed sets (模式三：复制到右侧). */
export async function copyLane(
  weId: string,
  from: { side: SetSide; dir: MovementDirection },
  to: { side: SetSide; dir: MovementDirection },
) {
  const d = db();
  const all = await d.sets.where("workoutExerciseId").equals(weId).toArray();
  const src = all.filter((x) => x.side === from.side && x.movementDirection === from.dir).sort((a, b) => a.setIndex - b.setIndex);
  const dst = all.filter((x) => x.side === to.side && x.movementDirection === to.dir);
  // Keep confirmed sets on the target lane; replace only its unconfirmed rows.
  const keep = dst.filter((x) => x.completedAt).sort((a, b) => a.setIndex - b.setIndex);
  const drop = dst.filter((x) => !x.completedAt).map((x) => x.id);
  const toAdd = src.slice(keep.length).map((s, i) =>
    newSet(weId, keep.length + i + 1, to.side, to.dir, {
      loadKind: s.loadKind,
      loadValue: s.loadValue,
      loadUnit: s.loadUnit,
      reps: s.reps,
      durationSeconds: s.durationSeconds,
      rir: s.rir,
      rpe: s.rpe,
      setType: s.setType,
    }),
  );
  await d.transaction("rw", [d.sets], async () => {
    await d.sets.bulkDelete(drop);
    await d.sets.bulkAdd(toAdd);
  });
}

export async function setLoadKind(weId: string, kind: LoadKind, unit: LoadUnit | null) {
  const d = db();
  const sets = await d.sets.where("workoutExerciseId").equals(weId).toArray();
  await d.transaction("rw", [d.sets], async () => {
    for (const s of sets) await d.sets.update(s.id, { loadKind: kind, loadUnit: unit, updatedAt: now() });
  });
}

// ---------------------------------------------------------------- feedback & body weight

export async function saveDailyCheckin(date: string, v: { fatigue?: RecoveryFeedback["fatigue"]; sleep?: RecoveryFeedback["sleep"] }) {
  const d = db();
  const existing = (await d.feedback.where("date").equals(date).toArray()).find((f) => f.muscleId == null);
  if (existing) {
    await d.feedback.update(existing.id, { ...v, createdAt: now(), updatedAt: now() });
    return;
  }
  await d.feedback.add({ id: uid(), date, muscleId: null, side: null, soreness: null, fatigue: v.fatigue ?? null, sleep: v.sleep ?? null, createdAt: now(), updatedAt: now() });
}

export async function saveMuscleFeedback(date: string, muscleId: string, side: RecoveryFeedback["side"], soreness: RecoveryFeedback["soreness"], pain = false) {
  const d = db();
  const existing = (await d.feedback.where("date").equals(date).toArray()).find((f) => f.muscleId === muscleId && (f.side ?? null) === (side ?? null));
  if (existing) {
    await d.feedback.update(existing.id, { soreness, pain, createdAt: now(), updatedAt: now() });
    return;
  }
  await d.feedback.add({ id: uid(), date, muscleId, side, soreness, pain, fatigue: null, sleep: null, createdAt: now(), updatedAt: now() });
}

export async function deleteFeedback(id: string) {
  await db().feedback.delete(id);
  await tombstone("feedback", [id]);
}

export async function logBodyWeight(date: string, weightKg: number, notes?: string) {
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300) throw new ValidationError("体重应在 20–300kg 之间");
  const d = db();
  const existing = await d.bodyWeights.where("date").equals(date).first();
  if (existing) await d.bodyWeights.update(existing.id, { weightKg, notes, updatedAt: now() });
  else await d.bodyWeights.add({ id: uid(), date, weightKg, notes, createdAt: now(), updatedAt: now() });
  const p = await d.profile.get("me");
  const latest = await d.bodyWeights.orderBy("date").last();
  if (p && latest) await d.profile.update("me", { weightKg: latest.weightKg, updatedAt: now() });
}

export async function deleteBodyWeight(id: string) {
  await db().bodyWeights.delete(id);
  await tombstone("bodyWeights", [id]);
}

// ---------------------------------------------------------------- meta

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db().meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await db().meta.put({ key, value });
}

// ---------------------------------------------------------------- recommendation snapshots

/**
 * Keep the FIRST recommendation shown each day as the "original plan" for later comparison with what
 * was actually trained. Never overwritten by later recomputation; never counted as training.
 */
export async function snapshotDailyRecommendation(date: string, view: { calculationVersion: string }) {
  const d = db();
  // Only the rule-engine snapshot counts here; AI advice snapshots carry view.source and are separate.
  const existing = (await d.recommendations.where("date").equals(date).toArray()).find((r) => !(r.view as { source?: string })?.source);
  if (existing) return existing;
  const rec = { id: uid(), date, view, calculationVersion: view.calculationVersion, createdAt: now(), updatedAt: now() };
  await d.recommendations.add(rec);
  return rec;
}
