import { MUSCLE_BY_ID, REGION_NAME } from "./muscles";
import { isCountableSet } from "./muscle-analysis";
import type { SessionBundle } from "./muscle-analysis";
import type { Exercise, Region } from "./types";

export interface SessionSummary {
  durationMin: number | null;
  exercises: { exerciseId: string; name: string; workingSets: number; warmupSets: number; detail: string }[];
  primaryRegions: Region[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  totalWorkingSets: number;
  text: string;
}

/**
 * Summary built ONLY from recorded facts. Unilateral sets are reported per side
 * ("左3组 / 右2组"), never padded.
 */
export function summarizeSession(bundle: SessionBundle, exerciseById: Record<string, Exercise>): SessionSummary {
  const { session, exercises, sets } = bundle;
  const out: SessionSummary["exercises"] = [];
  const primary = new Set<string>();
  const secondary = new Set<string>();
  let totalWorking = 0;

  for (const we of [...exercises].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const ex = exerciseById[we.exerciseId];
    if (!ex) continue;
    const done = sets.filter((s) => s.workoutExerciseId === we.id && isCountableSet(s));
    const working = done.filter((s) => s.setType !== "warmup");
    const warm = done.length - working.length;
    if (!done.length) continue;
    const left = working.filter((s) => s.side === "left").length;
    const right = working.filter((s) => s.side === "right").length;
    const both = working.filter((s) => s.side === "both").length;
    const dirL = working.filter((s) => s.movementDirection === "left").length;
    const dirR = working.filter((s) => s.movementDirection === "right").length;
    let detail: string;
    if (dirL || dirR) detail = `向左${dirL}组 / 向右${dirR}组`;
    else if (left || right) detail = left === right && !both ? `左右各${left}组` : `左${left}组 / 右${right}组`;
    else detail = `${both}组`;
    // Working set count: pairs of single-side sets count as one set for the exercise headline.
    const nonDirBoth = working.filter((s) => s.side === "both" && s.movementDirection === "none").length;
    const wsCount = nonDirBoth + Math.max(left, right) + Math.max(dirL, dirR);
    totalWorking += wsCount;
    out.push({ exerciseId: ex.id, name: ex.name, workingSets: wsCount, warmupSets: warm, detail });
    if (working.length) {
      for (const m of ex.muscles) {
        if (m.role === "primary") primary.add(m.muscleId);
        else if (m.role === "secondary") secondary.add(m.muscleId);
      }
    }
  }
  for (const p of primary) secondary.delete(p);
  const primaryRegions = [...new Set([...primary].map((id) => MUSCLE_BY_ID[id]?.region).filter(Boolean))] as Region[];
  const durationMin =
    session.completedAt != null ? Math.max(0, Math.round((Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60000)) : null;
  const primaryMuscles = [...primary].map((id) => MUSCLE_BY_ID[id]?.name ?? id);
  const secondaryMuscles = [...secondary].map((id) => MUSCLE_BY_ID[id]?.name ?? id);
  const text = out.length
    ? `今日完成：${out.map((e) => `${e.name}${e.detail}`).join("，")}。主要训练：${primaryRegions.map((r) => REGION_NAME[r]).join("、")}。` +
      (secondaryMuscles.length ? `辅助参与：${secondaryMuscles.join("、")}。` : "")
    : "这次训练还没有完成的组。";
  return { durationMin, exercises: out, primaryRegions, primaryMuscles, secondaryMuscles, totalWorkingSets: totalWorking, text };
}
