import { beforeEach, describe, expect, it } from "vitest";
import { FitnessDB, setDb, db } from "@/data/db";
import * as repo from "@/data/repo";
import { computeDerived, loadFacts } from "@/data/derived";
import { EQUIPMENT_TYPES, EQUIPMENT_BY_ID } from "@/data/seed/equipment";
import { SEED_EXERCISES } from "@/data/seed/exercises";
import { summarizeSession } from "@/core/summary";
import { exercisesForEquipmentType } from "@/features/catalog";
import { fmtSet } from "@/features/workout/format";

let n = 0;
beforeEach(async () => {
  setDb(new FitnessDB(`cardio-${++n}`));
  await db().open();
  const gym = await repo.saveGym({ name: "Gym", isDefault: true });
  await db().profile.put({ ...repo.defaultProfile(), currentGymId: gym.id });
});

describe("器械库完整性", () => {
  it("id 唯一；动作引用的器械都存在；每种器械至少有一个动作", () => {
    expect(new Set(EQUIPMENT_TYPES.map((e) => e.id)).size).toBe(EQUIPMENT_TYPES.length);
    expect(new Set(SEED_EXERCISES.map((e) => e.id)).size).toBe(SEED_EXERCISES.length);
    for (const ex of SEED_EXERCISES) for (const t of ex.equipmentTypes) expect(EQUIPMENT_BY_ID[t], `${ex.id} → ${t}`).toBeTruthy();
    const facts = { links: [], exercises: SEED_EXERCISES } as unknown as Parameters<typeof exercisesForEquipmentType>[0];
    for (const t of EQUIPMENT_TYPES) expect(exercisesForEquipmentType(facts, t.id).length, t.id).toBeGreaterThan(0);
  });
  it("覆盖常见有氧器械", () => {
    for (const id of ["treadmill", "spin_bike", "upright_bike", "recumbent_bike", "elliptical", "rowing_ergometer", "stair_climber"])
      expect(EQUIPMENT_BY_ID[id]?.category).toBe("cardio");
  });
});

describe("有氧记录", () => {
  async function rideBike(minutes: number) {
    const s = await repo.startSession({ gymId: null });
    const we = await repo.addExerciseToSession(s.id, "spin_bike_ride", null);
    const rows = await db().sets.where("workoutExerciseId").equals(we.id).toArray();
    expect(rows).toHaveLength(1); // one bout, not 3 "sets"
    await repo.updateSet(rows[0].id, { durationSeconds: minutes * 60, distanceM: 12500, rpe: 6 });
    await repo.completeSet(rows[0].id);
    await repo.finishSession(s.id);
    return s;
  }

  it("有氧按分钟记录，不计入肌群训练量和恢复", async () => {
    await rideBike(30);
    const f = (await loadFacts())!;
    const d = computeDerived(f, Date.now());
    expect(d.loads).toHaveLength(0);
    expect(d.recovery.every((r) => r.lastTrainedAt == null)).toBe(true);
    const sum = summarizeSession(d.completed[0], d.exerciseById);
    expect(sum.cardioMinutes).toBe(30);
    expect(sum.totalWorkingSets).toBe(0);
    expect(sum.text).toContain("动感单车 30分钟 12.5km");
  });

  it("显示格式：30分钟 · 12.5km · 强度 6", () => {
    expect(fmtSet({ loadKind: "external", loadValue: null, loadUnit: null, reps: null, durationSeconds: 1800, distanceM: 12500, rir: null, rpe: 6 })).toBe("30分钟 · 12.5km · 强度 6");
  });

  it("下次再练同一个有氧：预填上次的时间和距离（未打勾）", async () => {
    await rideBike(25);
    const s = await repo.startSession({ gymId: null });
    const we = await repo.addExerciseToSession(s.id, "spin_bike_ride", null);
    const [row] = await db().sets.where("workoutExerciseId").equals(we.id).toArray();
    expect(row).toMatchObject({ durationSeconds: 1500, distanceM: 12500, completedAt: null });
  });

  it("手动新建库里没有的有氧器械：自动生成对应动作，不需要选肌群", async () => {
    const { type, exercise } = await repo.createCustomCardioEquipment("室内划船课单车");
    expect(type.category).toBe("cardio");
    expect(exercise).toMatchObject({ kind: "cardio", measurementType: "duration", muscles: [] });
    const f = (await loadFacts())!;
    expect(exercisesForEquipmentType(f, type.id).map((e) => e.id)).toEqual([exercise.id]);
  });

  it("自定义有氧动作不要求主要肌群；力量动作仍要求", async () => {
    await expect(repo.saveCustomExercise({ name: "游泳", kind: "cardio", lateralityMode: "bilateral", resistanceType: "other", measurementType: "duration", primary: [], secondary: [] })).resolves.toBeTruthy();
    await expect(repo.saveCustomExercise({ name: "某推胸", kind: "compound", lateralityMode: "bilateral", resistanceType: "external_load", measurementType: "reps_weight", primary: [], secondary: [] })).rejects.toThrow("主要训练肌群");
  });

  it("不填时间不能打勾", async () => {
    const s = await repo.startSession({ gymId: null });
    const we = await repo.addExerciseToSession(s.id, "treadmill_run", null);
    const [row] = await db().sets.where("workoutExerciseId").equals(we.id).toArray();
    await expect(repo.completeSet(row.id)).rejects.toThrow();
  });
});
