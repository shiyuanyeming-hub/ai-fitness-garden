import type { Muscle, Region } from "./types";

/**
 * Muscle database. Ids are stable — exercises and stored feedback reference them.
 * `supportsLaterality: false` muscles are tracked as one unit. For the trunk muscles we
 * deliberately avoid left/right tracking because set direction (e.g. "rotate left") does
 * not reliably tell which side does the work (see docs/ALGORITHMS.md §侧别).
 */
export const MUSCLES: Muscle[] = [
  { id: "pec_upper", name: "胸大肌上部", nameEn: "Upper chest (clavicular)", region: "chest", supportsLaterality: true, size: "medium" },
  { id: "pec_mid", name: "胸大肌中下部", nameEn: "Mid/lower chest (sternal)", region: "chest", supportsLaterality: true, size: "large" },

  { id: "lats", name: "背阔肌", nameEn: "Latissimus dorsi", region: "back", supportsLaterality: true, size: "large" },
  { id: "traps_upper", name: "斜方肌上部", nameEn: "Upper trapezius", region: "back", supportsLaterality: true, size: "medium" },
  { id: "traps_mid", name: "斜方肌中下部", nameEn: "Mid/lower trapezius", region: "back", supportsLaterality: true, size: "medium" },
  { id: "rhomboids", name: "菱形肌", nameEn: "Rhomboids", region: "back", supportsLaterality: true, size: "small" },
  { id: "erectors", name: "竖脊肌", nameEn: "Erector spinae", region: "back", supportsLaterality: false, size: "large" },

  { id: "delt_front", name: "三角肌前束", nameEn: "Front delts", region: "shoulders", supportsLaterality: true, size: "small" },
  { id: "delt_side", name: "三角肌中束", nameEn: "Side delts", region: "shoulders", supportsLaterality: true, size: "small" },
  { id: "delt_rear", name: "三角肌后束", nameEn: "Rear delts", region: "shoulders", supportsLaterality: true, size: "small" },

  { id: "biceps", name: "肱二头肌", nameEn: "Biceps", region: "arms", supportsLaterality: true, size: "small" },
  { id: "triceps", name: "肱三头肌", nameEn: "Triceps", region: "arms", supportsLaterality: true, size: "small" },
  { id: "forearms", name: "前臂肌群", nameEn: "Forearms", region: "arms", supportsLaterality: true, size: "small" },

  { id: "abs", name: "腹直肌", nameEn: "Rectus abdominis", region: "core", supportsLaterality: false, size: "medium" },
  { id: "obliques", name: "腹斜肌", nameEn: "Obliques", region: "core", supportsLaterality: false, size: "medium" },
  { id: "deep_core", name: "深层核心稳定肌", nameEn: "Deep core stabilizers", region: "core", supportsLaterality: false, size: "small" },

  { id: "quads", name: "股四头肌", nameEn: "Quadriceps", region: "legs", supportsLaterality: true, size: "large" },
  { id: "hamstrings", name: "腘绳肌", nameEn: "Hamstrings", region: "legs", supportsLaterality: true, size: "large" },
  { id: "glutes", name: "臀肌", nameEn: "Glutes", region: "legs", supportsLaterality: true, size: "large" },
  { id: "calves", name: "小腿肌群", nameEn: "Calves", region: "legs", supportsLaterality: true, size: "small" },
];

export const MUSCLE_BY_ID: Record<string, Muscle> = Object.fromEntries(MUSCLES.map((m) => [m.id, m]));

export const REGIONS: { id: Region; name: string; emoji: string }[] = [
  { id: "chest", name: "胸部", emoji: "🫁" },
  { id: "back", name: "背部", emoji: "🪽" },
  { id: "shoulders", name: "肩部", emoji: "🛡️" },
  { id: "core", name: "腹部核心", emoji: "🎯" },
  { id: "arms", name: "手臂", emoji: "💪" },
  { id: "legs", name: "腿部", emoji: "🦵" },
];

export const REGION_NAME: Record<Region, string> = Object.fromEntries(REGIONS.map((r) => [r.id, r.name])) as Record<
  Region,
  string
>;

export function musclesOfRegion(region: Region): Muscle[] {
  return MUSCLES.filter((m) => m.region === region);
}

export function sidesOf(muscleId: string): ("left" | "right" | "center")[] {
  const m = MUSCLE_BY_ID[muscleId];
  if (!m) return ["center"];
  return m.supportsLaterality ? ["left", "right"] : ["center"];
}

export const SIDE_LABEL = { left: "左", right: "右", center: "" } as const;
