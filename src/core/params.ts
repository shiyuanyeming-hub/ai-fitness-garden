/**
 * ALL tunable coefficients live here. Every value is tagged:
 *   [依据] supported by the cited literature (direction and rough magnitude)
 *   [估计] product estimate — reasonable, transparent, NOT a validated physiological constant
 * See docs/ALGORITHMS.md for the reasoning behind each value.
 * Bump CALCULATION_VERSION whenever a value changes so derived data can be labelled.
 */
export const CALCULATION_VERSION = "2026.10-v1";

export const SET_COUNTING = {
  /** [依据] fractional counting of indirect sets fits hypertrophy best (Remmert/Pelland et al.). Applied via mapping contribution. */
  warmupFactor: 0, // [估计] warm-ups are not counted as training stimulus
  dropsetFactor: 0.5, // [估计] each drop counted as half a working set
  otherFactor: 1,
  /** A single-side set credited to a non-lateral (center) muscle counts half: L+R pair ≈ one bilateral set. [估计] */
  oneSideToCenterFactor: 0.5,
  /** Directional sets (rotate left / right) credited to the trunk as a whole. [估计] */
  directionalFactor: 0.5,
  /** Single-side set credited to "both_sides" muscles (e.g. core bracing in a one-arm row). [估计] */
  oneSideToBothFactor: 0.5,
};

/**
 * Effort factor by reps-in-reserve for counting an "effective" set.
 * [依据] hypertrophy improves as sets get closer to failure (Robinson et al. 2024), but sets
 * with ~0–3 RIR are commonly treated as fully stimulating. Values for RIR ≥ 4 are [估计].
 * Missing RIR/RPE → counted as a normal working set (factor 1) but confidence is lowered.
 */
export function effortFactor(rir: number | null): number {
  if (rir == null) return 1;
  if (rir <= 3) return 1;
  if (rir <= 4) return 0.75;
  if (rir <= 5) return 0.5;
  return 0.25;
}

/**
 * Recovery-demand multiplier by proximity to failure.
 * [依据] training to failure delays neuromuscular recovery ~24–48 h vs. non-failure with equal volume
 * (Morán-Navarro et al. 2017). Magnitudes are [估计].
 */
export function demandFactor(rir: number | null): number {
  if (rir == null) return 1;
  if (rir <= 0) return 1.3;
  if (rir <= 1) return 1.15;
  if (rir <= 3) return 1;
  return 0.8;
}

export const RECOVERY = {
  /**
   * Exponential residual fatigue: F(t) = Σ demand_i · exp(-(t − t_i)/τ).
   * "Ready for another hard session" when F ≤ θ.
   * Calibrated so that ~4 effective sets ≈ 48 h, ~8 sets ≈ 60 h, ~2 sets ≈ 36 h, ~1 set ≈ 24 h. [估计]
   */
  tauHours: 17.3,
  readyThreshold: 0.25,
  sizeMultiplier: { large: 1.15, medium: 1, small: 0.85 } as const, // [估计]
  /** Daily check-in modifiers on τ (affect only the day they are reported and later). [估计] */
  fatigueTauMultiplier: [1, 1.05, 1.15] as const, // 很好 / 一般 / 疲劳
  sleepTauMultiplier: [1, 1.03, 1.1] as const, // 很好 / 一般 / 较差
  /** Muscle-specific soreness report adds residual fatigue at report time. [估计] */
  sorenessAddedDemand: [0, 0.4, 1.2] as const, // 无 / 轻微 / 明显
  /** Feedback older than this no longer affects the estimate. */
  feedbackValidHours: 36,
  /** "逐渐恢复" begins when readiness ≥ this percentage. */
  graduallyThreshold: 60,
  /** Ignore events older than this — their residual is negligible. */
  lookbackDays: 14,
  /** Personal τ multiplier bounds learned from feedback. [估计] */
  personalMin: 0.8,
  personalMax: 1.4,
  personalStep: 0.05,
};

export const ATTENTION = {
  /** effective sets for one muscle in a single session that warrants a caution flag. [估计] */
  singleSessionHigh: 12,
  /** effective sets per muscle over a rolling 7 days that warrants a caution flag. [估计] beginners rarely need more than ~20 */
  weeklyHigh: 22,
  /** number of consecutive calendar days with ≥ 3 effective sets on the same muscle. [估计] */
  consecutiveDays: 3,
};

/**
 * Weekly direct+fractional set targets per REGION.
 * [依据] ≥10 weekly sets per muscle yield more hypertrophy than lower volumes (Schoenfeld et al. 2017);
 * diminishing returns at higher volumes (Pelland et al. 2024). Beginners progress well on lower volumes
 * (ACSM 2009: 1–3 sets per exercise, 2–3 days/week for novices). Ranges by phase are [估计].
 */
export const WEEKLY_TARGETS = {
  beginner: {
    focus: [[6, 9], [8, 12], [10, 14]] as const, // phase 1 / 2 / 3 of the plan
    maintain: [[3, 5], [4, 6], [4, 6]] as const,
    skip: [[0, 0], [0, 0], [0, 0]] as const,
  },
  intermediate: {
    focus: [[8, 12], [10, 16], [12, 18]] as const,
    maintain: [[4, 6], [4, 8], [4, 8]] as const,
    skip: [[0, 0], [0, 0], [0, 0]] as const,
  },
  advanced: {
    focus: [[10, 14], [12, 18], [14, 20]] as const,
    maintain: [[4, 8], [6, 8], [6, 8]] as const,
    skip: [[0, 0], [0, 0], [0, 0]] as const,
  },
};

export const PRESCRIPTION = {
  beginner: {
    compound: { sets: 3, reps: [8, 12] as const, rir: [2, 3] as const, restSec: 120 },
    isolation: { sets: 3, reps: [10, 15] as const, rir: [1, 3] as const, restSec: 75 },
    core: { sets: 3, reps: [10, 15] as const, rir: [2, 3] as const, restSec: 60 },
  },
  intermediate: {
    compound: { sets: 3, reps: [6, 10] as const, rir: [1, 3] as const, restSec: 150 },
    isolation: { sets: 3, reps: [10, 15] as const, rir: [0, 2] as const, restSec: 75 },
    core: { sets: 3, reps: [10, 15] as const, rir: [1, 2] as const, restSec: 60 },
  },
  advanced: {
    compound: { sets: 4, reps: [5, 10] as const, rir: [1, 2] as const, restSec: 180 },
    isolation: { sets: 3, reps: [8, 15] as const, rir: [0, 2] as const, restSec: 90 },
    core: { sets: 3, reps: [10, 20] as const, rir: [0, 2] as const, restSec: 60 },
  },
};

/** Rough time cost per working set including rest, used to fit a session into the time budget. [估计] */
export const MINUTES_PER_SET = { compound: 3.5, isolation: 2.5, core: 2, cardio: 5, other: 2.5 };
