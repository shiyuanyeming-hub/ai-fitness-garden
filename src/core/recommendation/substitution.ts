import { MUSCLE_BY_ID } from "../muscles";
import type { Exercise, ExperienceLevel } from "../types";
import type { RecoveryEstimate } from "../recovery";
import { worstOf } from "../recovery";
import { EQUIPMENT_BY_ID } from "@/data/seed/equipment";

export interface Availability {
  /** equipment type ids present in the current gym */
  equipmentTypes: Set<string>;
  /** exercise ids explicitly linked to equipment in this gym (custom mappings) */
  linkedExerciseIds: Set<string>;
  /** true when the gym has no equipment registered — we then assume a typical commercial gym */
  unknown: boolean;
}

export function isAvailable(ex: Exercise, av: Availability): boolean {
  if (av.unknown) return true;
  if (av.linkedExerciseIds.has(ex.id)) return true;
  if (ex.equipmentTypes.length === 0) return true; // bodyweight / floor
  return ex.equipmentTypes.some((t) => av.equipmentTypes.has(t));
}

export function maxDifficulty(level: ExperienceLevel): number {
  return level === "beginner" ? 2 : 3;
}

function vector(ex: Exercise): Map<string, number> {
  const v = new Map<string, number>();
  for (const m of ex.muscles) {
    const w = m.role === "primary" ? m.contribution : m.role === "secondary" ? m.contribution * 0.6 : m.contribution * 0.2;
    v.set(m.muscleId, (v.get(m.muscleId) ?? 0) + w);
  }
  return v;
}

export function muscleSimilarity(a: Exercise, b: Exercise): number {
  const va = vector(a);
  const vb = vector(b);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, x] of va) na += x * x;
  for (const [, y] of vb) nb += y * y;
  for (const [k, x] of va) dot += x * (vb.get(k) ?? 0);
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface SubstituteOption {
  exercise: Exercise;
  score: number;
  reasons: string[];
}

export function findSubstitutes(
  target: Exercise,
  candidates: Exercise[],
  av: Availability,
  recovery: RecoveryEstimate[],
  level: ExperienceLevel,
  excluded: Set<string>,
  limit = 4,
): SubstituteOption[] {
  const targetPrimary = new Set(target.muscles.filter((m) => m.role === "primary").map((m) => m.muscleId));
  const fatigued = new Map<string, RecoveryEstimate>();
  for (const id of new Set(recovery.map((r) => r.muscleId))) {
    const w = worstOf(recovery.filter((r) => r.muscleId === id));
    if (w && (w.status === "recovering" || w.status === "attention")) fatigued.set(id, w);
  }
  const opts: SubstituteOption[] = [];
  for (const c of candidates) {
    if (c.id === target.id || excluded.has(c.id) || !isAvailable(c, av)) continue;
    const sim = muscleSimilarity(target, c);
    if (sim < 0.45) continue;
    const reasons: string[] = [];
    let score = sim;
    const shared = c.muscles.filter((m) => m.role === "primary" && targetPrimary.has(m.muscleId)).map((m) => MUSCLE_BY_ID[m.muscleId]?.name);
    if (shared.length) reasons.push(`同样主要训练${shared.join("、")}`);
    if (c.pattern === target.pattern) {
      score += 0.2;
      reasons.push("动作模式相同");
    }
    if (c.difficulty > maxDifficulty(level)) {
      score -= 0.3;
      reasons.push("技术要求较高");
    } else if (c.difficulty === 1) {
      score += 0.05;
      reasons.push("适合当前训练水平");
    }
    const extraFatigue = c.muscles.filter((m) => !targetPrimary.has(m.muscleId) && m.role !== "stabilizer" && fatigued.has(m.muscleId));
    if (extraFatigue.length) {
      score -= 0.15 * extraFatigue.length;
      reasons.push(`会额外训练近期仍在恢复的${extraFatigue.map((m) => MUSCLE_BY_ID[m.muscleId]?.name).join("、")}`);
    }
    if (!av.unknown) {
      const eq = c.equipmentTypes.find((t) => av.equipmentTypes.has(t));
      if (eq) reasons.push(`当前健身房有：${EQUIPMENT_BY_ID[eq]?.name ?? eq}`);
      else if (c.equipmentTypes.length === 0) reasons.push("无需器械");
    }
    opts.push({ exercise: c, score, reasons });
  }
  return opts.sort((a, b) => b.score - a.score).slice(0, limit);
}
