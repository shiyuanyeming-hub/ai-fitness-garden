import { REGIONS } from "../muscles";
import { WEEKLY_TARGETS } from "../params";
import { addDays, diffDays } from "../time";
import type { DateKey, Region, UserProfile } from "../types";

export interface PlanPhase {
  index: 0 | 1 | 2;
  name: string;
  startDate: DateKey;
  endDate: DateKey;
  weeks: number;
  rirGuide: string;
  focus: string;
  weeklyTargets: Record<Region, [number, number]>;
}

export interface TrainingPlanView {
  startDate: DateKey;
  endDate: DateKey;
  totalWeeks: number;
  weeklySessions: number;
  sessionMinutes: number;
  phases: PlanPhase[];
  notes: string[];
}

const PHASE_META = [
  { name: "适应期", rirGuide: "多数组留 2–3 次余力（RIR 2–3），重点是动作稳定", focus: "学习动作、找到合适重量、建立规律" },
  { name: "累积期", rirGuide: "正式组 RIR 1–3，孤立动作最后一组可接近力竭", focus: "逐步增加每周组数，相同重量追求更多次数" },
  { name: "提升期", rirGuide: "正式组 RIR 1–2，复合动作避免频繁力竭", focus: "在可恢复范围内维持较高训练量，稳定加重" },
] as const;

export function targetsFor(profile: UserProfile, phaseIndex: 0 | 1 | 2): Record<Region, [number, number]> {
  const table = WEEKLY_TARGETS[profile.experience];
  const out = {} as Record<Region, [number, number]>;
  for (const r of REGIONS) {
    const pr = profile.regionPriority[r.id] ?? "maintain";
    const [lo, hi] = table[pr][phaseIndex];
    out[r.id] = [lo, hi];
  }
  return out;
}

export function buildPlan(profile: UserProfile): TrainingPlanView {
  const start = profile.goalStartDate;
  const end = profile.goalTargetDate;
  const totalDays = Math.max(7, diffDays(end, start) + 1);
  const totalWeeks = Math.max(1, Math.round(totalDays / 7));
  const w1 = Math.max(1, Math.round(totalWeeks / 3));
  const w2 = Math.max(1, Math.round(totalWeeks / 3));
  const w3 = Math.max(1, totalWeeks - w1 - w2);
  const lens = [w1, w2, w3];
  const phases: PlanPhase[] = [];
  let cursor = start;
  lens.forEach((weeks, i) => {
    const idx = i as 0 | 1 | 2;
    const s = cursor;
    const e = i === 2 ? end : addDays(cursor, weeks * 7 - 1);
    phases.push({ index: idx, ...PHASE_META[idx], startDate: s, endDate: e, weeks, weeklyTargets: targetsFor(profile, idx) });
    cursor = addDays(e, 1);
  });
  const notes = [
    "每个重点肌群每周尽量分配到 2 次训练（频率 2 次/周 通常优于 1 次）。",
    "如果连续多次表现下降、持续疲劳或出现疼痛，可安排一周减量（组数约减半），不必硬撑计划。",
    "计划只是建议，实际训练以你的记录为准，系统会根据实际训练重新计算。",
  ];
  if (Object.values(profile.regionPriority).includes("skip")) notes.push("标记为「暂不优先」的部位不会主动推荐，但你记录的训练仍会被分析。");
  return {
    startDate: start,
    endDate: end,
    totalWeeks,
    weeklySessions: profile.weeklyTrainingDays,
    sessionMinutes: profile.sessionMinutes,
    phases,
    notes,
  };
}

export function phaseOn(plan: TrainingPlanView, date: DateKey): PlanPhase {
  if (date < plan.startDate) return plan.phases[0];
  for (const p of plan.phases) if (date >= p.startDate && date <= p.endDate) return p;
  return plan.phases[plan.phases.length - 1];
}
