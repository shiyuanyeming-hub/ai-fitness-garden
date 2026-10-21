import { describe, expect, it } from "vitest";
import { computeAllLoads, computeSessionLoads, muscleLevelSets, regionLevelSets } from "@/core/muscle-analysis";
import { estimateRecovery, worstOf, learnPersonalMultipliers } from "@/core/recovery";
import { SEED_EXERCISES, SEED_EXERCISE_BY_ID as EX } from "@/data/seed/exercises";
import { summarizeSession } from "@/core/summary";
import { sessionDateKey, localToISO, weekStart, toDateKey } from "@/core/time";
import { suggestProgression } from "@/core/recommendation/progression";
import { findSubstitutes } from "@/core/recommendation/substitution";
import { recommendToday } from "@/core/recommendation/daily";
import { buildPlan, phaseOn } from "@/core/recommendation/plan";
import { performancesByExercise, personalBests, sideDifferences } from "@/core/analytics";
import { plantStage } from "@/core/gamification";
import { bundle, profile, times } from "./helpers";
import type { RecoveryFeedback } from "@/core/types";

const H = 3600_000;
const T0 = "2026-10-20T10:00:00.000Z"; // 19:00 JST
const ctx = (now: number) => ({ now, timeZone: "Asia/Tokyo", sessionCount: 10 });

function find(loads: ReturnType<typeof computeSessionLoads>, muscle: string, side: string) {
  return loads.find((l) => l.muscleId === muscle && l.side === side)?.effectiveSets ?? 0;
}

describe("测试5 复合动作：卧推 40kg × 10 × 3", () => {
  const b = bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10, rir: 2 }) }]);
  const loads = computeSessionLoads(b, EX);

  it("主要肌群胸部、辅助三头和前三角", () => {
    expect(find(loads, "pec_mid", "left")).toBe(3);
    expect(find(loads, "pec_mid", "right")).toBe(3);
    expect(find(loads, "triceps", "left")).toBe(1.5);
    expect(find(loads, "delt_front", "right")).toBe(1.5);
  });

  it("双侧 3 组在汇总层仍是 3 组，不会变成 6 组", () => {
    expect(muscleLevelSets(loads).pec_mid).toBe(3);
    expect(regionLevelSets(loads).chest).toBe(3);
  });

  it("恢复估计同时考虑辅助肌群", () => {
    const rec = estimateRecovery(loads, [], ctx(Date.parse(T0) + 2 * H));
    const tri = worstOf(rec.filter((r) => r.muscleId === "triceps"))!;
    const chest = worstOf(rec.filter((r) => r.muscleId === "pec_mid"))!;
    expect(tri.lastTrainedAt).not.toBeNull();
    expect(tri.status).not.toBe("ready");
    // secondary muscle recovers sooner than primary
    expect(Date.parse(tri.readyAt!)).toBeLessThan(Date.parse(chest.readyAt!));
  });
});

describe("测试3 左右不同：单臂侧平举 左 5kg×12×3 / 右 5kg×10×2", () => {
  const b = bundle(T0, [
    {
      exerciseId: "cable_lateral_raise_single",
      sets: [...times(3, { load: 5, reps: 12, side: "left" }), ...times(2, { load: 5, reps: 10, side: "right" })],
    },
  ]);
  const loads = computeSessionLoads(b, EX);

  it("左右分别保存，不补齐右侧第三组", () => {
    expect(b.sets.filter((s) => s.side === "left")).toHaveLength(3);
    expect(b.sets.filter((s) => s.side === "right")).toHaveLength(2);
    expect(find(loads, "delt_side", "left")).toBe(3);
    expect(find(loads, "delt_side", "right")).toBe(2);
  });

  it("总结报告左右组数", () => {
    const s = summarizeSession(b, EX);
    expect(s.exercises[0].detail).toBe("左3组 / 右2组");
  });

  it("只练右侧时只更新右肩", () => {
    const only = bundle(T0, [{ exerciseId: "cable_lateral_raise_single", sets: times(3, { load: 5, reps: 12, side: "right" }) }]);
    const l = computeSessionLoads(only, EX);
    expect(find(l, "delt_side", "right")).toBe(3);
    expect(find(l, "delt_side", "left")).toBe(0);
    const rec = estimateRecovery(l, [], ctx(Date.parse(T0) + H));
    expect(rec.find((r) => r.muscleId === "delt_side" && r.side === "left")!.status).toBe("ready");
    expect(rec.find((r) => r.muscleId === "delt_side" && r.side === "right")!.status).toBe("recovering");
  });

  it("左右差异分析", () => {
    const d = sideDifferences([b], EX, "2026-10-01", "Asia/Tokyo")[0];
    expect(d.leftSets).toBe(3);
    expect(d.rightSets).toBe(2);
    expect(d.diffPct).toBeLessThan(0);
  });
});

describe("测试4 方向性动作：躯干旋转 左旋15×2 / 右旋15×2", () => {
  const b = bundle(T0, [
    {
      exerciseId: "torso_rotation_machine",
      sets: [...times(2, { load: 20, reps: 15, dir: "left" }), ...times(2, { load: 20, reps: 15, dir: "right" })],
    },
  ]);
  const loads = computeSessionLoads(b, EX);

  it("保留动作方向", () => {
    expect(b.sets.filter((s) => s.movementDirection === "left")).toHaveLength(2);
    expect(b.sets.every((s) => s.side === "both")).toBe(true);
  });

  it("不制造左/右腹斜肌数据，只记核心整体负荷", () => {
    expect(loads.filter((l) => l.muscleId === "obliques").map((l) => l.side)).toEqual(["center"]);
    expect(find(loads, "obliques", "center")).toBe(2); // 4 directional sets × 0.5
    expect(loads.some((l) => l.side === "left" || l.side === "right")).toBe(false);
  });

  it("总结显示方向", () => {
    expect(summarizeSession(b, EX).exercises[0].detail).toBe("向左2组 / 向右2组");
  });
});

describe("测试11 辅助重量：辅助引体 33kg", () => {
  const older = bundle("2026-10-13T10:00:00.000Z", [{ exerciseId: "assisted_pullup", sets: times(3, { load: 40, reps: 10, rir: 2 }) }]);
  const newer = bundle(T0, [{ exerciseId: "assisted_pullup", sets: times(3, { load: 33, reps: 12, rir: 2 }) }]);
  const perfs = performancesByExercise([older, newer]);

  it("保存为辅助负重而非外部负重", () => {
    expect(newer.sets[0].loadKind).toBe("assistance");
  });

  it("PR 以更小辅助为更好", () => {
    const pb = personalBests("assisted_pullup", perfs.assisted_pullup, "Asia/Tokyo")[0];
    expect(pb.bestLoad!.value).toBe(33);
    expect(pb.bestE1rm).toBeNull();
  });

  it("进步建议是减少辅助而不是增加", () => {
    const s = suggestProgression(EX.assisted_pullup, perfs.assisted_pullup, [8, 12], null);
    expect(s.action).toBe("increase");
    expect(s.load).toBeLessThan(33);
    expect(s.reason).toContain("辅助越小越难");
  });

  it("负荷估计不会因为辅助数值大就更高", () => {
    const a = computeSessionLoads(bundle(T0, [{ exerciseId: "assisted_pullup", sets: times(3, { load: 60, reps: 10 }) }]), EX);
    const b2 = computeSessionLoads(bundle(T0, [{ exerciseId: "assisted_pullup", sets: times(3, { load: 10, reps: 10 }) }]), EX);
    expect(find(a, "lats", "left")).toBe(find(b2, "lats", "left"));
  });
});

describe("测试12 恢复倒计时会随本地时间自动推进", () => {
  const loads = computeSessionLoads(bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(4, { load: 40, reps: 10, rir: 2 }) }]), EX);
  it("状态从恢复中 → 逐渐恢复 → 预计可训练", () => {
    const at = (h: number) => worstOf(estimateRecovery(loads, [], ctx(Date.parse(T0) + 60 * 60000 + h * H)).filter((r) => r.muscleId === "pec_mid"))!;
    expect(at(1).status).toBe("recovering");
    const ready = Date.parse(at(1).readyAt!);
    const hours = (ready - Date.parse(T0)) / H;
    expect(hours).toBeGreaterThan(36);
    expect(hours).toBeLessThan(72); // not a fixed 48h, but in a plausible range
    expect(at(hours - 8).status).toBe("gradual");
    expect(at(hours + 1).status).toBe("ready");
    // readyAt is stable when time passes without new events
    expect(Math.abs(Date.parse(at(10).readyAt!) - ready)).toBeLessThan(60_000);
  });

  it("更多组 / 更接近力竭 → 更长恢复", () => {
    const light = computeSessionLoads(bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(2, { load: 40, reps: 10, rir: 3 }) }]), EX);
    const hard = computeSessionLoads(bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(4, { load: 40, reps: 10, rir: 0 }) }]), EX);
    const r = (l: typeof light) => Date.parse(worstOf(estimateRecovery(l, [], ctx(Date.parse(T0) + 2 * H)).filter((x) => x.muscleId === "pec_mid"))!.readyAt!);
    expect(r(hard)).toBeGreaterThan(r(loads));
    expect(r(loads)).toBeGreaterThan(r(light));
  });
});

describe("D4 多次刺激累计，不覆盖", () => {
  it("周一卧推 + 周二推肩 → 三头/前束恢复时间晚于只做其中一次", () => {
    const mon = bundle("2026-10-19T10:00:00.000Z", [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10, rir: 2 }) }]);
    const tue = bundle("2026-10-20T10:00:00.000Z", [{ exerciseId: "db_shoulder_press", sets: times(3, { load: 12, reps: 10, rir: 2 }) }]);
    const now = Date.parse("2026-10-20T12:00:00.000Z");
    const onlyTue = estimateRecovery(computeAllLoads([tue], EX), [], ctx(now));
    const both = estimateRecovery(computeAllLoads([mon, tue], EX), [], ctx(now));
    const ra = (l: typeof both) => Date.parse(l.find((r) => r.muscleId === "triceps" && r.side === "left")!.readyAt!);
    expect(ra(both)).toBeGreaterThan(ra(onlyTue));
  });
});

describe("测试7 修改历史后重新计算", () => {
  it("卧推 3 组改为 2 组 → 负荷降低、恢复提前", () => {
    const three = bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10 }) }]);
    const two = { ...three, sets: three.sets.slice(0, 2) };
    const now = Date.parse(T0) + 5 * H;
    const r3 = worstOf(estimateRecovery(computeAllLoads([three], EX), [], ctx(now)).filter((r) => r.muscleId === "pec_mid"))!;
    const r2 = worstOf(estimateRecovery(computeAllLoads([two], EX), [], ctx(now)).filter((r) => r.muscleId === "pec_mid"))!;
    expect(r2.lastEffectiveSets).toBeLessThan(r3.lastEffectiveSets);
    expect(Date.parse(r2.readyAt!)).toBeLessThan(Date.parse(r3.readyAt!));
  });
});

describe("训练事实的边界", () => {
  it("未确认（预填）的组和热身组不计入负荷", () => {
    const b = bundle(T0, [
      {
        exerciseId: "barbell_bench_press",
        sets: [{ load: 20, reps: 10, type: "warmup" }, { load: 40, reps: 10 }, { load: 40, reps: 10, done: false }],
      },
    ]);
    expect(find(computeSessionLoads(b, EX), "pec_mid", "left")).toBe(1);
  });

  it("缺失 RIR 时按正式组计算但降低可信度", () => {
    const b = bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10 }) }]);
    const r = estimateRecovery(computeAllLoads([b], EX), [], ctx(Date.parse(T0) + 2 * H)).find((x) => x.muscleId === "pec_mid")!;
    expect(r.confidence).toBe("low");
  });
});

describe("测试13 跨日与补录", () => {
  it("23:50 开始、次日 00:20 结束 → 归属开始日", () => {
    const start = localToISO("2026-10-21", "23:50", "Asia/Tokyo");
    const end = localToISO("2026-10-22", "00:20", "Asia/Tokyo");
    expect(start).toBe("2026-10-21T14:50:00.000Z");
    expect(sessionDateKey(start, "Asia/Tokyo")).toBe("2026-10-21");
    expect(toDateKey(end, "Asia/Tokyo")).toBe("2026-10-22");
    expect((Date.parse(end) - Date.parse(start)) / 60000).toBe(30);
  });

  it("补录历史训练后恢复估计改变", () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const before = estimateRecovery([], [], ctx(now)).find((r) => r.muscleId === "lats")!;
    const back = bundle("2026-10-20T10:00:00.000Z", [{ exerciseId: "lat_pulldown", sets: times(3, { load: 40, reps: 10 }) }]);
    const after = estimateRecovery(computeAllLoads([back], EX), [], ctx(now)).find((r) => r.muscleId === "lats")!;
    expect(before.status).toBe("ready");
    expect(after.status).not.toBe("ready");
  });

  it("周起始为周一", () => {
    expect(weekStart("2026-10-22")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
  });
});

describe("测试8 器械替换：没有高位下拉", () => {
  it("优先推荐当前健身房可用、同为背阔肌的动作", () => {
    const av = { equipmentTypes: new Set(["assisted_pullup", "seated_cable_row", "dumbbells"]), linkedExerciseIds: new Set<string>(), unknown: false };
    const subs = findSubstitutes(EX.lat_pulldown, SEED_EXERCISES, av, [], "beginner", new Set());
    expect(subs[0].exercise.id).toBe("assisted_pullup");
    expect(subs.every((s) => s.exercise.id !== "lat_pulldown")).toBe(true);
    expect(subs[0].reasons.join()).toContain("背阔肌");
    expect(subs.some((s) => s.exercise.id === "pull_up")).toBe(false); // no bar registered
  });
});

describe("F5 渐进超负荷", () => {
  const perf = (reps: number, rir: number | null, load = 40) =>
    performancesByExercise([bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(3, { load, reps, rir }) }])]).barbell_bench_press;

  it("未达到上限：保持重量争取多 1 次", () => {
    expect(suggestProgression(EX.barbell_bench_press, perf(10, 2), [8, 12], null).action).toBe("repeat");
  });
  it("全部达到上限且有余力：加重 2.5kg", () => {
    const s = suggestProgression(EX.barbell_bench_press, perf(12, 2), [8, 12], null);
    expect(s.action).toBe("increase");
    expect(s.load).toBe(42.5);
  });
  it("达到上限但没有余力：不机械加重", () => {
    expect(suggestProgression(EX.barbell_bench_press, perf(12, 0), [8, 12], null).action).toBe("hold");
  });
  it("没有历史：不编造重量", () => {
    const s = suggestProgression(EX.barbell_bench_press, [], [8, 12], null);
    expect(s.action).toBe("establish");
    expect(s.load).toBeNull();
  });
  it("不同器械的重量不比较", () => {
    const p = performancesByExercise([
      bundle(T0, [{ exerciseId: "machine_chest_press", gymEquipmentId: "gymA_machine", sets: times(3, { load: 50, reps: 12, rir: 2 }) }]),
    ]).machine_chest_press;
    expect(suggestProgression(EX.machine_chest_press, p, [8, 12], "gymB_machine").action).toBe("establish");
  });
  it("识别相同重量次数提升", () => {
    const p = performancesByExercise([
      bundle("2026-10-13T10:00:00.000Z", [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 8, rir: 2 }) }]),
      bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10, rir: 2 }) }]),
    ]).barbell_bench_press;
    expect(suggestProgression(EX.barbell_bench_press, p, [8, 12], null).reason).toContain("8→10");
  });
});

describe("测试6 自主训练 & 每日推荐", () => {
  const prof = profile();
  const plan = buildPlan(prof);
  const base = (bundles: ReturnType<typeof bundle>[], nowIso: string) => {
    const loads = computeAllLoads(bundles, EX);
    const now = Date.parse(nowIso);
    const recovery = estimateRecovery(loads, [], ctx(now));
    const date = toDateKey(now, "Asia/Tokyo");
    const ws = weekStart(date);
    const weekLoads = loads.filter((l) => toDateKey(l.at, "Asia/Tokyo") >= ws);
    const lastTrainedDate: Record<string, string> = {};
    return recommendToday({
      date,
      profile: prof,
      recovery,
      weekRegionSets: regionLevelSets(weekLoads),
      lastTrainedDate,
      weeklyTargets: phaseOn(plan, date).weeklyTargets,
      sessionsThisWeek: bundles.length,
      trainedToday: false,
      exercises: SEED_EXERCISES,
      availability: { equipmentTypes: new Set(), linkedExerciseIds: new Set(), unknown: true },
      history: performancesByExercise(bundles),
      familiar: new Set(),
    });
  };

  it("昨天练胸后，今天不推荐胸部", () => {
    const chest = bundle("2026-10-20T10:00:00.000Z", [
      { exerciseId: "barbell_bench_press", sets: times(4, { load: 40, reps: 10, rir: 1 }) },
      { exerciseId: "incline_db_press", sets: times(3, { load: 14, reps: 10, rir: 1 }) },
    ]);
    const rec = base([chest], "2026-10-21T09:00:00.000Z");
    expect(rec.regions.map((r) => r.region)).not.toContain("chest");
    expect(rec.restDay).toBe(false);
    expect(rec.regions.length).toBeGreaterThan(0);
  });

  it("卧推只让前束疲劳时，不封锁整个肩部，并避开前束为主的动作", () => {
    const chest = bundle("2026-10-21T10:00:00.000Z", [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10, rir: 2 }) }]);
    const rec = base([chest], "2026-10-21T12:00:00.000Z");
    const sh = rec.regionStates.find((s) => s.region === "shoulders")!;
    expect(sh.status).toBe("gradual");
    const shoulderEx = rec.exercises.filter((e) => e.region === "shoulders").map((e) => EX[e.exerciseId]);
    for (const e of shoulderEx) expect(e.muscles.find((m) => m.role === "primary")!.muscleId).not.toBe("delt_front");
  });

  it("4 组以上拆成两个不同动作", () => {
    const rec = base([], "2026-10-21T09:00:00.000Z");
    for (const r of rec.regions) {
      const ex = rec.exercises.filter((e) => e.region === r.region);
      if (r.allocatedSets >= 4) expect(ex.length).toBeGreaterThanOrEqual(2);
      expect(ex.reduce((a, e) => a + e.sets, 0)).toBe(r.allocatedSets);
    }
  });

  it("不推荐暂不优先的腿部；推荐只引用可用动作", () => {
    const rec = base([], "2026-10-21T09:00:00.000Z");
    expect(rec.regions.map((r) => r.region)).not.toContain("legs");
    expect(rec.exercises.length).toBeGreaterThan(0);
    for (const e of rec.exercises) expect(e.progression.action).toBe("establish");
  });

  it("推荐练背但实际练胸：下一次建议基于实际胸部训练", () => {
    const first = base([], "2026-10-19T00:00:00.000Z");
    const recommendedBack = first.regions.some((r) => r.region === "back");
    const actualChest = bundle("2026-10-19T10:00:00.000Z", [{ exerciseId: "barbell_bench_press", sets: times(4, { load: 40, reps: 10, rir: 1 }) }]);
    const next = base([actualChest], "2026-10-20T00:00:00.000Z");
    expect(recommendedBack || first.regions.length > 0).toBe(true);
    expect(next.regions.map((r) => r.region)).not.toContain("chest");
    // un-executed back recommendation is not a training fact: back still fully ready
    expect(next.regionStates.find((s) => s.region === "back")!.status).toBe("ready");
    expect(next.regionStates.find((s) => s.region === "back")!.doneThisWeek).toBe(0);
  });
});

describe("D5 反馈与个人化", () => {
  it("明显酸痛与疼痛 → 需要关注", () => {
    const loads = computeAllLoads([bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10 }) }])], EX);
    const fb: RecoveryFeedback = {
      id: "f1", date: "2026-10-21", muscleId: "pec_mid", side: null, soreness: 2, fatigue: null, sleep: null, pain: true,
      createdAt: "2026-10-21T01:00:00.000Z", updatedAt: "2026-10-21T01:00:00.000Z",
    };
    const r = estimateRecovery(loads, [fb], ctx(Date.parse("2026-10-21T02:00:00.000Z"))).find((x) => x.muscleId === "pec_mid")!;
    expect(r.status).toBe("attention");
  });

  it("模型说已恢复但你反馈明显酸痛 → 个人恢复系数上调（有上限）", () => {
    const loads = computeAllLoads([bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10 }) }])], EX);
    const fb: RecoveryFeedback = {
      id: "f2", date: "2026-10-24", muscleId: "pec_mid", side: null, soreness: 2, fatigue: null, sleep: null,
      createdAt: "2026-10-24T01:00:00.000Z", updatedAt: "2026-10-24T01:00:00.000Z",
    };
    const p = learnPersonalMultipliers(loads, [fb], "Asia/Tokyo");
    expect(p.pec_mid).toBeGreaterThan(1);
    expect(p.pec_mid).toBeLessThanOrEqual(1.4);
  });
});

describe("E 肌肉农场", () => {
  it("训练越多不会长得越快：再次训练会重新播种", () => {
    const one = computeAllLoads([bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10 }) }])], EX);
    const now = Date.parse(T0) + 30 * H;
    const before = worstOf(estimateRecovery(one, [], ctx(now)).filter((r) => r.muscleId === "pec_mid"));
    const again = computeAllLoads(
      [
        bundle(T0, [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10 }) }]),
        bundle(new Date(now - H).toISOString(), [{ exerciseId: "barbell_bench_press", sets: times(3, { load: 40, reps: 10 }) }]),
      ],
      EX,
    );
    const after = worstOf(estimateRecovery(again, [], ctx(now)).filter((r) => r.muscleId === "pec_mid"));
    const order = ["fallow", "seed", "sprout", "growing", "budding", "mature"];
    expect(order.indexOf(plantStage(after))).toBeLessThanOrEqual(order.indexOf(plantStage(before)));
    expect(plantStage(after)).toBe("seed");
  });
});

describe("计划", () => {
  it("3 个月计划分 3 个阶段，重点部位训练量逐步增加，暂不优先部位为 0", () => {
    const p = buildPlan(profile());
    expect(p.phases).toHaveLength(3);
    expect(p.phases[0].weeklyTargets.chest[0]).toBeLessThan(p.phases[2].weeklyTargets.chest[0]);
    expect(p.phases[1].weeklyTargets.legs).toEqual([0, 0]);
  });
});
