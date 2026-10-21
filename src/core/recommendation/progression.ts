import type { Exercise, ISODate, LoadKind, LoadUnit, SetSide } from "../types";
import { EQUIPMENT_BY_ID } from "@/data/seed/equipment";

export interface PerfSet {
  side: SetSide;
  loadKind: LoadKind;
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  reps: number | null;
  rir: number | null;
}

export interface Performance {
  sessionId: string;
  at: ISODate;
  gymEquipmentId: string | null;
  /** completed WORKING sets only */
  sets: PerfSet[];
}

export type ProgressionAction = "establish" | "increase" | "repeat" | "hold" | "reduce";

export interface ProgressionSuggestion {
  action: ProgressionAction;
  /** suggested numeric load (null when we cannot responsibly give a number) */
  load: number | null;
  loadUnit: LoadUnit | null;
  loadKind: LoadKind;
  targetReps: [number, number];
  text: string;
  reason: string;
  lastSummary?: string;
}

const ACTION_LABEL: Record<ProgressionAction, string> = {
  establish: "确定起始重量",
  increase: "建议加重",
  repeat: "保持重量，争取多做 1 次",
  hold: "保持重量",
  reduce: "适当减轻",
};
export { ACTION_LABEL };

function mode(values: number[]): number | null {
  if (!values.length) return null;
  const c = new Map<number, number>();
  for (const v of values) c.set(v, (c.get(v) ?? 0) + 1);
  let best = values[0];
  for (const [v, n] of c) if (n > (c.get(best) ?? 0) || (n === c.get(best) && v > best)) best = v;
  return best;
}

function increment(ex: Exercise, load: number, unit: LoadUnit | null): { step: number | null; text: string } {
  if (unit === "lb") return { step: 5, text: "+5 lb" };
  if (unit === "level") return { step: 1, text: "+1 档" };
  const types = ex.equipmentTypes.map((t) => EQUIPMENT_BY_ID[t]?.category);
  if (ex.equipmentTypes.includes("dumbbells") && ex.equipmentTypes.length === 1)
    return load < 10 ? { step: 1, text: "+1 kg（换下一对哑铃）" } : { step: 2, text: "+2 kg（换下一对哑铃）" };
  if (types.includes("rack") || ex.equipmentTypes.includes("barbell") || ex.equipmentTypes.includes("ez_bar"))
    return { step: 2.5, text: "+2.5 kg（两侧各 1.25 kg）" };
  return { step: null, text: "+1 档配重（不同器械档位不同）" };
}

function fmtLoad(kind: LoadKind, v: number | null, unit: LoadUnit | null): string {
  if (kind === "bodyweight") return v ? `自重+${v}${unit ?? "kg"}` : "自重";
  if (v == null) return "—";
  const u = unit === "level" ? "档" : unit ?? "kg";
  return kind === "assistance" ? `辅助 ${v}${u}` : `${v}${u}`;
}

export function summarizePerformance(p: Performance): string {
  const bySide = new Map<string, PerfSet[]>();
  for (const s of p.sets) (bySide.get(s.side) ?? bySide.set(s.side, []).get(s.side)!).push(s);
  const parts: string[] = [];
  for (const [side, sets] of bySide) {
    const loadV = mode(sets.map((s) => s.loadValue ?? 0));
    const reps = sets.map((s) => s.reps ?? 0);
    const sameReps = reps.every((r) => r === reps[0]);
    const label = side === "left" ? "左 " : side === "right" ? "右 " : "";
    const k = sets[0];
    parts.push(
      `${label}${fmtLoad(k.loadKind, loadV, k.loadUnit)} × ${sameReps ? `${reps[0]}次 × ${sets.length}组` : reps.join("/") + "次"}`,
    );
  }
  return parts.join("；");
}

/**
 * Double progression. Only compares performances with the SAME exercise, load kind, unit and
 * (when known) the same physical machine — different machines' numbers are not comparable.
 */
export function suggestProgression(
  ex: Exercise,
  history: Performance[], // newest first
  repRange: readonly [number, number],
  gymEquipmentId: string | null,
): ProgressionSuggestion {
  const [lo, hi] = repRange;
  const defaultKind: LoadKind =
    ex.resistanceType === "assisted" ? "assistance" : ex.resistanceType === "bodyweight" ? "bodyweight" : ex.resistanceType === "band" ? "band" : "external";

  const comparable = history.filter(
    (h) => h.sets.length > 0 && (gymEquipmentId == null || h.gymEquipmentId == null || h.gymEquipmentId === gymEquipmentId),
  );
  const last = comparable[0];

  if (!last) {
    const method =
      defaultKind === "assistance"
        ? `先选一个较大的辅助重量，找到能标准完成 ${hi} 次、还剩约 2–3 次余力的档位；之后逐步减少辅助。`
        : defaultKind === "bodyweight"
          ? `先用自重完成，记录能标准完成的次数；能轻松超过 ${hi} 次再考虑加难度。`
          : `用 1–2 组热身逐步加重，找到能标准完成 ${hi} 次、还剩约 2–3 次余力的重量作为正式组重量。`;
    return {
      action: "establish",
      load: null,
      loadUnit: null,
      loadKind: defaultKind,
      targetReps: [lo, hi],
      text: ACTION_LABEL.establish,
      reason: `这个动作还没有你的历史记录，不编造具体重量。${method}`,
    };
  }

  const kind = last.sets[0].loadKind;
  const unit = last.sets[0].loadUnit;
  const loads = last.sets.map((s) => s.loadValue ?? 0);
  const top = mode(loads) ?? 0;
  const atTop = last.sets.filter((s) => (s.loadValue ?? 0) === top);
  const reps = atTop.map((s) => s.reps ?? 0);
  const rirs = atTop.map((s) => s.rir).filter((r): r is number => r != null);
  const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;
  const allTop = reps.length > 0 && reps.every((r) => r >= hi);
  const anyBelow = reps.some((r) => r < lo);
  const lastSummary = summarizePerformance(last);

  // previous performance at the same load (for "same weight, more reps" detection and confirmation)
  const prev = comparable.slice(1).find((h) => h.sets.some((s) => s.loadKind === kind && (s.loadValue ?? 0) === top));
  const prevReps = prev ? prev.sets.filter((s) => (s.loadValue ?? 0) === top).map((s) => s.reps ?? 0) : [];
  const prevBest = prevReps.length ? Math.max(...prevReps) : null;
  const curBest = Math.max(...reps);
  const improved = prevBest != null && curBest > prevBest;
  const improvedText = improved ? `相同重量下次数提升（${prevBest}→${curBest}）。` : "";

  if (kind === "bodyweight") {
    if (allTop)
      return { action: "increase", load: top || null, loadUnit: unit, loadKind: kind, targetReps: [lo, hi], text: "考虑增加难度", lastSummary,
        reason: `${improvedText}上次所有组都达到 ${hi} 次以上，可以考虑放慢离心、加暂停，或改用更难的变式/少量加重。` };
    return { action: "repeat", load: top || null, loadUnit: unit, loadKind: kind, targetReps: [lo, hi], text: ACTION_LABEL.repeat, lastSummary,
      reason: `${improvedText}继续用自重，目标每组比上次多 1 次。` };
  }

  const confirmed = avgRir != null ? avgRir >= 1 : prevReps.length > 0 && prevReps.every((r) => r >= hi);
  if (allTop && confirmed) {
    if (kind === "assistance") {
      const step = unit === "level" ? 1 : 5;
      return { action: "increase", load: Math.max(0, top - step), loadUnit: unit, loadKind: kind, targetReps: [lo, hi], lastSummary,
        text: "建议减少辅助", reason: `${improvedText}上次在辅助 ${top} 下所有组都达到 ${hi} 次且仍有余力。辅助越小越难，下次可减少一档辅助（约 ${step}${unit === "level" ? "档" : "kg"}），次数从 ${lo} 次开始。` };
    }
    const inc = increment(ex, top, unit);
    return { action: "increase", load: inc.step != null ? top + inc.step : null, loadUnit: unit, loadKind: kind, targetReps: [lo, hi], lastSummary,
      text: ACTION_LABEL.increase, reason: `${improvedText}上次 ${fmtLoad(kind, top, unit)} 所有组都达到 ${hi} 次${avgRir != null ? `，平均 RIR ${avgRir.toFixed(1)}` : "，且连续两次达到"}。可以加重 ${inc.text}，次数回到 ${lo}–${hi} 区间。` };
  }
  if (allTop && !confirmed) {
    return { action: "hold", load: top, loadUnit: unit, loadKind: kind, targetReps: [lo, hi], lastSummary, text: ACTION_LABEL.hold,
      reason: `${improvedText}上次已达到 ${hi} 次，但${avgRir != null ? "几乎没有余力" : "没有 RIR 记录，且只出现一次"}。先保持这个重量再确认一次，避免机械加重。` };
  }
  if (anyBelow && (avgRir == null || avgRir <= 1)) {
    const prevBelow = prev ? prevReps.some((r) => r < lo) : false;
    if (prevBelow && kind === "external") {
      return { action: "reduce", load: Math.round(top * 0.9 * 2) / 2, loadUnit: unit, loadKind: kind, targetReps: [lo, hi], lastSummary, text: ACTION_LABEL.reduce,
        reason: `连续两次在 ${fmtLoad(kind, top, unit)} 下有组低于 ${lo} 次。可以先减约 10%，把次数做回目标区间。` };
    }
    return { action: "hold", load: top, loadUnit: unit, loadKind: kind, targetReps: [lo, hi], lastSummary, text: ACTION_LABEL.hold,
      reason: `${improvedText}上次有组低于 ${lo} 次。保持重量，先把每组做回 ${lo} 次以上。` };
  }
  return { action: "repeat", load: top, loadUnit: unit, loadKind: kind, targetReps: [lo, hi], lastSummary, text: ACTION_LABEL.repeat,
    reason: `${improvedText}上次 ${lastSummary}。在 ${hi} 次之前保持重量，每次争取多做 1 次。` };
}
