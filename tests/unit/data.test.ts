import { beforeEach, describe, expect, it } from "vitest";
import { FitnessDB, setDb, db } from "@/data/db";
import * as repo from "@/data/repo";
import { loadFacts, computeDerived } from "@/data/derived";
import { exportBackup, importBackup } from "@/data/backup";
import { worstOf } from "@/core/recovery";

let n = 0;
beforeEach(async () => {
  setDb(new FitnessDB(`test-${++n}`));
  await db().open();
  const p = repo.defaultProfile();
  const gym = await repo.saveGym({ name: "Gym A", isDefault: true });
  await db().profile.put({ ...p, currentGymId: gym.id });
});

async function logBench(sets: number, startedAt?: string) {
  const s = await repo.startSession({ gymId: null, startedAt, backfill: !!startedAt });
  const we = await repo.addExerciseToSession(s.id, "barbell_bench_press", null, { prefill: { sets, reps: 10, load: 40 } });
  const rows = await db().sets.where("workoutExerciseId").equals(we.id).toArray();
  for (const r of rows) await repo.completeSet(r.id);
  await repo.finishSession(s.id, startedAt ? new Date(Date.parse(startedAt) + 3600_000).toISOString() : undefined);
  return { s, we };
}

describe("训练记录持久化", () => {
  it("测试9：关闭应用后数据仍在（新的 DB 连接读到同样数据）", async () => {
    const s = await repo.startSession({ gymId: null });
    const we = await repo.addExerciseToSession(s.id, "lat_pulldown", null);
    const first = (await db().sets.where("workoutExerciseId").equals(we.id).toArray())[0];
    await repo.updateSet(first.id, { loadValue: 35, reps: 10 });
    await repo.completeSet(first.id);
    const name = db().name;
    db().close();
    setDb(new FitnessDB(name));
    const again = await db().sets.get(first.id);
    expect(again?.loadValue).toBe(35);
    expect(again?.completedAt).not.toBeNull();
    expect((await repo.activeSession())?.id).toBe(s.id); // can resume
  });

  it("结束训练时丢弃未确认的预填组，不把它们当成真实训练", async () => {
    const s = await repo.startSession({ gymId: null });
    const we = await repo.addExerciseToSession(s.id, "barbell_bench_press", null, { prefill: { sets: 3, reps: 10, load: 40 } });
    const rows = await db().sets.where("workoutExerciseId").equals(we.id).sortBy("setIndex");
    await repo.completeSet(rows[0].id);
    const discarded = await repo.finishSession(s.id);
    expect(discarded).toBe(2);
    expect(await db().sets.where("workoutExerciseId").equals(we.id).count()).toBe(1);
  });

  it("下一次自动填入上次的重量和次数（作为未确认的组）", async () => {
    await logBench(3);
    const s2 = await repo.startSession({ gymId: null });
    const we2 = await repo.addExerciseToSession(s2.id, "barbell_bench_press", null);
    const rows = await db().sets.where("workoutExerciseId").equals(we2.id).toArray();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.loadValue === 40 && r.reps === 10 && r.completedAt === null)).toBe(true);
  });

  it("测试3：左右组数可以不同，复制到右侧后可单独修改", async () => {
    const s = await repo.startSession({ gymId: null });
    const we = await repo.addExerciseToSession(s.id, "cable_lateral_raise_single", null, { prefill: { sets: 3, reps: 12, load: 5 } });
    const right = (await db().sets.where("workoutExerciseId").equals(we.id).toArray()).filter((x) => x.side === "right");
    await repo.deleteSet(right[2].id);
    const all = await db().sets.where("workoutExerciseId").equals(we.id).toArray();
    expect(all.filter((x) => x.side === "left")).toHaveLength(3);
    expect(all.filter((x) => x.side === "right")).toHaveLength(2);
    // copy left → right replaces only unconfirmed right sets
    await repo.completeSet(all.filter((x) => x.side === "right")[0].id);
    await repo.copyLane(we.id, { side: "left", dir: "none" }, { side: "right", dir: "none" });
    const after = (await db().sets.where("workoutExerciseId").equals(we.id).toArray()).filter((x) => x.side === "right");
    expect(after).toHaveLength(3);
    expect(after.filter((x) => x.completedAt)).toHaveLength(1);
  });

  it("校验：非法数值被拒绝；没有次数不能完成", async () => {
    const s = await repo.startSession({ gymId: null });
    const we = await repo.addExerciseToSession(s.id, "barbell_bench_press", null);
    const r = (await db().sets.where("workoutExerciseId").equals(we.id).toArray())[0];
    await expect(repo.updateSet(r.id, { reps: -1 })).rejects.toThrow();
    await expect(repo.updateSet(r.id, { loadValue: 5000 })).rejects.toThrow();
    await expect(repo.completeSet(r.id)).rejects.toThrow("次数");
  });
});

describe("测试7：修改历史后派生数据自动重算", () => {
  it("把昨天卧推 3 组改为 2 组 → 胸部恢复提前", async () => {
    const yesterday = new Date(Date.now() - 20 * 3600_000).toISOString();
    const { we } = await logBench(3, yesterday);
    const nowMs = Date.now();
    const before = computeDerived((await loadFacts())!, nowMs);
    const r1 = worstOf(before.recovery.filter((r) => r.muscleId === "pec_mid"))!;
    const rows = await db().sets.where("workoutExerciseId").equals(we.id).sortBy("setIndex");
    await repo.deleteSet(rows[2].id);
    const after = computeDerived((await loadFacts())!, nowMs);
    const r2 = worstOf(after.recovery.filter((r) => r.muscleId === "pec_mid"))!;
    expect(r2.lastEffectiveSets).toBe(2);
    expect(Date.parse(r2.readyAt!)).toBeLessThan(Date.parse(r1.readyAt!));
    expect(after.weekRegionSets.chest ?? 0).toBeLessThanOrEqual(before.weekRegionSets.chest ?? 0);
  });

  it("删除训练后不再计入", async () => {
    const { s } = await logBench(3, new Date(Date.now() - 5 * 3600_000).toISOString());
    await repo.deleteSession(s.id);
    const d = computeDerived((await loadFacts())!, Date.now());
    expect(d.loads).toHaveLength(0);
    expect(await db().tombstones.count()).toBeGreaterThan(0);
  });
});

describe("备份", () => {
  it("导出 → 合并导入同一文件是幂等的，不会重复计算训练量", async () => {
    await logBench(3, new Date(Date.now() - 5 * 3600_000).toISOString());
    const file = JSON.parse(JSON.stringify(await exportBackup(false)));
    const r = await importBackup(file, "merge");
    expect(r.inserted).toBe(0);
    expect(await db().sets.count()).toBe(3);
  });

  it("替换导入恢复到新设备", async () => {
    await logBench(3, new Date(Date.now() - 5 * 3600_000).toISOString());
    const file = JSON.parse(JSON.stringify(await exportBackup(false)));
    setDb(new FitnessDB(`restore-${n}`));
    await importBackup(file, "replace");
    expect(await db().sets.count()).toBe(3);
    expect(await db().profile.get("me")).toBeTruthy();
  });

  it("拒绝无效文件", async () => {
    await expect(importBackup({ foo: 1 }, "merge")).rejects.toThrow();
  });
});

describe("自定义动作（测试2）", () => {
  it("保存后可在该器械的候选列表中重复使用", async () => {
    const ex = await repo.saveCustomExercise({
      name: "单臂绳索Y字上举",
      kind: "isolation",
      lateralityMode: "unilateral",
      resistanceType: "external_load",
      measurementType: "reps_weight",
      primary: ["delt_side"],
      secondary: ["traps_mid"],
      equipmentTypeId: "functional_trainer",
    });
    const list = await repo.exercisesForEquipment("functional_trainer");
    expect(list.map((e) => e.id)).toContain(ex.id);
    expect(ex.muscles.find((m) => m.muscleId === "delt_side")?.lateralityRule).toBe("same_side");
    await repo.saveCustomExercise({ ...{ id: ex.id, name: "Y字上举（改）", kind: "isolation", lateralityMode: "unilateral", resistanceType: "external_load", measurementType: "reps_weight", primary: ["delt_side"], secondary: [] } });
    expect((await db().exercises.get(ex.id))?.name).toBe("Y字上举（改）");
  });
});
