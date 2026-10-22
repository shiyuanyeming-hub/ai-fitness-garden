import type { CoachAdvice, CoachInput, CoachRegion } from "./types";

const REGIONS: CoachRegion[] = ["chest", "back", "shoulders", "arms", "core", "legs"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const strList = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/**
 * Never trust model output: exercise ids must come from the candidate list the client sent,
 * set counts are clamped, regions whitelisted, text truncated. Skipped regions are dropped.
 */
export function sanitizeAdvice(raw: unknown, input: Pick<CoachInput, "candidates" | "profile" | "habits">): CoachAdvice {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cand = new Map(input.candidates.map((c) => [c.id, c]));
  const skip = new Set(Object.entries(input.profile.priorities).filter(([, p]) => p === "skip").map(([r]) => r));
  const maxSets = input.profile.experience === "beginner" ? 4 : 5;

  const seen = new Set<string>();
  const exercises: CoachAdvice["exercises"] = [];
  for (const e of Array.isArray(o.exercises) ? o.exercises : []) {
    const x = (e ?? {}) as Record<string, unknown>;
    const id = str(x.exercise_id, 80);
    const c = cand.get(id);
    if (!c || seen.has(id) || skip.has(c.region)) continue;
    seen.add(id);
    const n = Math.round(Number(x.sets));
    exercises.push({ exerciseId: id, sets: Number.isFinite(n) ? Math.min(maxSets, Math.max(1, n)) : 2, note: str(x.note, 80) });
    if (exercises.length >= 6) break;
  }
  // Keep total volume sane for one session regardless of what the model says.
  const cap = input.profile.experience === "beginner" ? 16 : 22;
  let total = 0;
  for (const e of exercises) {
    e.sets = Math.max(0, Math.min(e.sets, cap - total));
    total += e.sets;
  }
  const ex = exercises.filter((e) => e.sets > 0);

  let dayType = (["train", "light", "rest"] as const).find((d) => d === o.day_type) ?? (ex.length ? "train" : "rest");
  if (dayType === "rest" && ex.length) dayType = "light";
  if (dayType !== "rest" && !ex.length) dayType = "rest";

  const focus = Array.isArray(o.focus_regions)
    ? [...new Set(o.focus_regions.filter((r): r is CoachRegion => REGIONS.includes(r as CoachRegion) && !skip.has(r as string)))].slice(0, 3)
    : [];

  return {
    dayType,
    headline: str(o.headline, 40) || (dayType === "rest" ? "今天适合休息" : "今天的训练建议"),
    summary: str(o.summary, 400),
    focusRegions: focus,
    exercises: ex,
    reasons: strList(o.reasons, 4, 120),
    cautions: strList(o.cautions, 3, 120),
    habitTip: str(o.habit_tip, 160),
  };
}
