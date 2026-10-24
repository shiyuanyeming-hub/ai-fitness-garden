import type { Exercise, LoadKind, LoadUnit, WorkoutSet } from "@/core/types";

export const BAND_LEVELS = [
  { v: 1, label: "轻" },
  { v: 2, label: "中" },
  { v: 3, label: "重" },
  { v: 4, label: "特重" },
];

export function loadLabel(kind: LoadKind, unit: LoadUnit | null): string {
  const u = unit === "lb" ? "lb" : unit === "level" ? "档" : "kg";
  if (kind === "assistance") return `辅助${u}`;
  if (kind === "bodyweight") return `加重${u}`;
  if (kind === "band") return "阻力";
  return u;
}

export function fmtSet(s: Pick<WorkoutSet, "loadKind" | "loadValue" | "loadUnit" | "reps" | "durationSeconds" | "distanceM" | "rir" | "rpe">): string {
  const parts: string[] = [];
  if (s.loadKind === "band") parts.push(BAND_LEVELS.find((b) => b.v === s.loadValue)?.label ?? "弹力带");
  else if (s.loadKind === "bodyweight") parts.push(s.loadValue ? `自重+${s.loadValue}${s.loadUnit ?? "kg"}` : "自重");
  else if (s.loadValue != null) parts.push(`${s.loadKind === "assistance" ? "辅助" : ""}${s.loadValue}${s.loadUnit === "lb" ? "lb" : s.loadUnit === "level" ? "档" : "kg"}`);
  if (s.reps != null) parts.push(`${s.reps}次`);
  if (s.durationSeconds != null) parts.push(fmtDuration(s.durationSeconds));
  if (s.distanceM != null) parts.push(s.distanceM >= 1000 ? `${Math.round(s.distanceM / 10) / 100}km` : `${s.distanceM}m`);
  let out = parts.join(s.reps == null && s.loadValue == null ? " · " : " × ");
  if (s.rir != null) out += ` · RIR ${s.rir}`;
  else if (s.rpe != null) out += ` · ${s.reps == null && s.loadValue == null ? "强度" : "RPE"} ${s.rpe}`;
  return out;
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m}分${r}秒` : `${m}分钟`;
}

export function laneLabel(side: string, dir: string): string {
  if (dir === "left") return "向左";
  if (dir === "right") return "向右";
  if (side === "left") return "左侧";
  if (side === "right") return "右侧";
  return "";
}

export const KIND_LABEL: Record<Exercise["kind"], string> = {
  compound: "复合",
  isolation: "孤立",
  core: "核心",
  cardio: "有氧",
  other: "其他",
};

export const LATERALITY_LABEL: Record<Exercise["lateralityMode"], string> = {
  bilateral: "双侧",
  unilateral: "单侧",
  alternating: "左右交替",
  directional: "方向性",
};

export const RESISTANCE_LABEL: Record<Exercise["resistanceType"], string> = {
  external_load: "外部负重",
  assisted: "辅助负重",
  bodyweight: "自重",
  band: "弹力带",
  other: "其他",
};

export const MEASUREMENT_LABEL: Record<Exercise["measurementType"], string> = {
  reps_weight: "重量+次数",
  reps_only: "仅次数",
  duration: "时间",
  distance: "距离",
  other: "其他",
};

export function defaultRest(ex: Exercise): number {
  return ex.kind === "compound" ? 120 : ex.kind === "core" ? 60 : 75;
}
