import { MUSCLES, MUSCLE_BY_ID } from "../muscles";
import { ATTENTION, CALCULATION_VERSION, RECOVERY } from "../params";
import { DAY, HOUR, toDateKey } from "../time";
import type { ISODate, MuscleSide, RecoveryFeedback } from "../types";
import type { MuscleLoadEntry } from "../muscle-analysis";
import { round2 } from "../muscle-analysis";

export type RecoveryStatus = "recovering" | "gradual" | "ready" | "attention";

export const STATUS_LABEL: Record<RecoveryStatus, string> = {
  recovering: "恢复中",
  gradual: "逐渐恢复",
  ready: "预计可训练",
  attention: "需要关注",
};

export interface RecoveryEstimate {
  muscleId: string;
  side: MuscleSide;
  /** final status, may be "attention" */
  status: RecoveryStatus;
  /** status ignoring attention flags */
  baseStatus: Exclude<RecoveryStatus, "attention">;
  /** 0–100, time-progress from the last stimulus to the estimated ready moment */
  readinessPct: number;
  /** estimated moment residual fatigue drops below the threshold; null if never trained recently */
  readyAt: ISODate | null;
  /** time of the most recent stimulus (null if none in lookback) */
  lastTrainedAt: ISODate | null;
  lastSessionId: string | null;
  residual: number;
  /** effective sets in the rolling 7 days up to now */
  sets7d: number;
  lastContributions: { exerciseId: string; effectiveSets: number }[];
  lastEffectiveSets: number;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  attentionReasons: string[];
  tauHours: number;
  calculationVersion: string;
}

export interface RecoveryContext {
  now: number; // epoch ms
  timeZone: string;
  /** personal τ multipliers by muscle id, learned from feedback (see learnPersonalMultipliers) */
  personal?: Record<string, number>;
  /** total completed sessions in history, for confidence */
  sessionCount: number;
}

type Event = { at: number; demand: number; entry: MuscleLoadEntry };

function residualAt(events: Event[], t: number, tau: number, extra: { at: number; demand: number }[] = []): number {
  let f = 0;
  for (const e of events) if (e.at <= t) f += e.demand * Math.exp(-(t - e.at) / (tau * HOUR));
  for (const x of extra) if (x.at <= t) f += x.demand * Math.exp(-(t - x.at) / (tau * HOUR));
  return f;
}

function latestDailyCheckin(feedback: RecoveryFeedback[], now: number): RecoveryFeedback | null {
  let best: RecoveryFeedback | null = null;
  for (const f of feedback) {
    if (f.muscleId) continue;
    const t = Date.parse(f.createdAt);
    if (t > now || now - t > RECOVERY.feedbackValidHours * HOUR) continue;
    if (!best || f.createdAt > best.createdAt) best = f;
  }
  return best;
}

function feedbackFor(feedback: RecoveryFeedback[], muscleId: string, side: MuscleSide, now: number): RecoveryFeedback[] {
  return feedback.filter((f) => {
    if (f.muscleId !== muscleId) return false;
    if (f.side && f.side !== side && f.side !== "center" && side !== "center") return false;
    const t = Date.parse(f.createdAt);
    return t <= now && now - t <= RECOVERY.feedbackValidHours * HOUR;
  });
}

function consecutiveFatigueDays(feedback: RecoveryFeedback[], now: number, tz: string): number {
  const days = new Map<string, number>();
  for (const f of feedback) {
    if (f.muscleId || f.fatigue == null) continue;
    if (Date.parse(f.createdAt) > now) continue;
    const prev = days.get(f.date);
    if (prev == null || f.fatigue > prev) days.set(f.date, f.fatigue);
  }
  let n = 0;
  let t = now;
  for (let i = 0; i < 7; i++) {
    const k = toDateKey(t, tz);
    if (days.get(k) === 2) n++;
    else if (i > 0 || days.has(k)) break; // allow "today not yet reported"
    t -= DAY;
  }
  return n;
}

export function baseTau(muscleId: string, personal?: Record<string, number>): number {
  const m = MUSCLE_BY_ID[muscleId];
  const size = m ? RECOVERY.sizeMultiplier[m.size] : 1;
  return RECOVERY.tauHours * size * (personal?.[muscleId] ?? 1);
}

/**
 * Estimate recovery state for every muscle side. Deterministic; cheap enough to run on every render tick.
 * This is an engineering estimate of "readiness for another hard session", not a physiological measurement.
 */
export function estimateRecovery(
  loads: MuscleLoadEntry[],
  feedback: RecoveryFeedback[],
  ctx: RecoveryContext,
): RecoveryEstimate[] {
  const { now } = ctx;
  const lookbackStart = now - RECOVERY.lookbackDays * DAY;
  const checkin = latestDailyCheckin(feedback, now);
  const fatigueDays = consecutiveFatigueDays(feedback, now, ctx.timeZone);
  const checkinMult =
    (checkin?.fatigue != null ? RECOVERY.fatigueTauMultiplier[checkin.fatigue] : 1) *
    (checkin?.sleep != null ? RECOVERY.sleepTauMultiplier[checkin.sleep] : 1);

  const bySide = new Map<string, MuscleLoadEntry[]>();
  for (const e of loads) {
    const t = Date.parse(e.at);
    if (t > now || t < lookbackStart) continue;
    const k = `${e.muscleId}|${e.side}`;
    (bySide.get(k) ?? bySide.set(k, []).get(k)!).push(e);
  }

  const out: RecoveryEstimate[] = [];
  for (const muscle of MUSCLES) {
    const sides: MuscleSide[] = muscle.supportsLaterality ? ["left", "right"] : ["center"];
    for (const side of sides) {
      const entries = (bySide.get(`${muscle.id}|${side}`) ?? []).sort((a, b) => a.at.localeCompare(b.at));
      const events: Event[] = entries.map((entry) => ({ at: Date.parse(entry.at), demand: entry.recoveryDemand, entry }));
      const tau = baseTau(muscle.id, ctx.personal) * checkinMult;
      const reasons: string[] = [];
      const attention: string[] = [];

      // muscle-specific feedback
      const fb = feedbackFor(feedback, muscle.id, side, now);
      const extra: { at: number; demand: number }[] = [];
      for (const f of fb) {
        if (f.soreness != null && f.soreness > 0) extra.push({ at: Date.parse(f.createdAt), demand: RECOVERY.sorenessAddedDemand[f.soreness] });
        if (f.pain) attention.push("你报告了疼痛（不同于普通酸痛）。建议避免让该部位疼痛加重的动作，必要时咨询专业人士。");
        if (f.soreness === 2) attention.push("你报告了明显酸痛。");
      }

      const sets7d = round2(entries.filter((e) => now - Date.parse(e.at) <= 7 * DAY).reduce((s, e) => s + e.effectiveSets, 0));
      const last = entries[entries.length - 1] ?? null;

      if (!last && extra.length === 0) {
        out.push({
          muscleId: muscle.id,
          side,
          status: attention.length ? "attention" : "ready",
          baseStatus: "ready",
          readinessPct: 100,
          readyAt: null,
          lastTrainedAt: null,
          lastSessionId: null,
          residual: 0,
          sets7d: 0,
          lastContributions: [],
          lastEffectiveSets: 0,
          confidence: "medium",
          reasons: [`近${RECOVERY.lookbackDays}天没有训练记录。`],
          attentionReasons: attention,
          tauHours: round2(tau),
          calculationVersion: CALCULATION_VERSION,
        });
        continue;
      }

      const F = residualAt(events, now, tau, extra);
      const lastAt = Math.max(last ? Date.parse(last.at) : 0, ...extra.map((x) => x.at));
      const Fpeak = residualAt(events, lastAt, tau, extra);
      const θ = RECOVERY.readyThreshold;
      const readyAtMs = F > θ ? now + tau * HOUR * Math.log(F / θ) : lastAt + Math.max(0, tau * HOUR * Math.log(Math.max(Fpeak, θ) / θ));
      let readiness = 100;
      if (F > θ && Fpeak > θ) readiness = Math.max(0, Math.min(99, (100 * Math.log(Fpeak / F)) / Math.log(Fpeak / θ)));

      const baseStatus: RecoveryEstimate["baseStatus"] =
        F <= θ ? "ready" : readiness >= RECOVERY.graduallyThreshold ? "gradual" : "recovering";

      if (last) {
        const lastSessionEntries = entries.filter((e) => e.sessionId === last.sessionId);
        const lastSets = round2(lastSessionEntries.reduce((s, e) => s + e.effectiveSets, 0));
        reasons.push(`最近一次刺激约 ${lastSets} 个有效组。`);
        const hard = entries.some((e) => e.recoveryDemand > e.effectiveSets * 1.05);
        if (hard) reasons.push("近期有接近力竭（RIR≤1）的组，恢复需求估计更高。");
        if (entries.length > 1) reasons.push(`近${RECOVERY.lookbackDays}天共 ${entries.length} 次训练对该肌群产生刺激，已累计计算，不会互相覆盖。`);
      }
      if (checkin?.fatigue === 2) reasons.push("今日自评疲劳，恢复估计适当延长。");
      if (checkin?.sleep === 2) reasons.push("睡眠较差，恢复估计适当延长。");
      if (extra.length) reasons.push("已根据你报告的酸痛调整估计。");
      if (ctx.personal?.[muscle.id] && Math.abs(ctx.personal[muscle.id] - 1) > 0.001)
        reasons.push(`根据你过去的反馈，该肌群个人恢复系数 ×${ctx.personal[muscle.id].toFixed(2)}（个人化估计，非验证模型）。`);

      // attention: sustained high load
      if (last && last.effectiveSets >= ATTENTION.singleSessionHigh)
        attention.push(`单次训练有效组数较高（约 ${round2(last.effectiveSets)} 组）。`);
      if (sets7d >= ATTENTION.weeklyHigh) attention.push(`近7天累计有效组数较高（约 ${sets7d} 组）。`);
      const dayKeys = new Set(entries.filter((e) => e.effectiveSets >= 3).map((e) => toDateKey(e.at, ctx.timeZone)));
      let streak = 0;
      for (let i = 0, t = now; i < 7; i++, t -= DAY) {
        if (dayKeys.has(toDateKey(t, ctx.timeZone))) streak++;
        else if (i > 0) break;
      }
      if (streak >= ATTENTION.consecutiveDays) attention.push(`已连续 ${streak} 天对该肌群进行较高负荷训练。`);
      if (fatigueDays >= 3 && baseStatus !== "ready") attention.push(`已连续 ${fatigueDays} 天自评疲劳。`);

      const withEffort = entries.reduce((s, e) => s + e.setsWithEffort, 0);
      const total = entries.reduce((s, e) => s + e.totalSets, 0);
      const coverage = total ? withEffort / total : 0;
      let confidence: RecoveryEstimate["confidence"] = "medium";
      if (coverage < 0.3 || ctx.sessionCount < 3) confidence = "low";
      else if (coverage >= 0.7 && ctx.sessionCount >= 6) confidence = "high";
      if (coverage < 0.3) reasons.push("多数组未填写 RIR/RPE，按普通正式组估算，可信度较低。");

      out.push({
        muscleId: muscle.id,
        side,
        status: attention.length ? "attention" : baseStatus,
        baseStatus,
        readinessPct: Math.round(readiness),
        readyAt: new Date(readyAtMs).toISOString(),
        lastTrainedAt: last ? last.at : null,
        lastSessionId: last ? last.sessionId : null,
        residual: round2(F),
        sets7d,
        lastContributions: last
          ? mergeContrib(entries.filter((e) => e.sessionId === last.sessionId).flatMap((e) => e.contributions))
          : [],
        lastEffectiveSets: last ? round2(last.effectiveSets) : 0,
        confidence,
        reasons,
        attentionReasons: [...new Set(attention)],
        tauHours: round2(tau),
        calculationVersion: CALCULATION_VERSION,
      });
    }
  }
  return out;
}

function mergeContrib(list: { exerciseId: string; effectiveSets: number }[]) {
  const m = new Map<string, number>();
  for (const c of list) m.set(c.exerciseId, (m.get(c.exerciseId) ?? 0) + c.effectiveSets);
  return [...m.entries()].map(([exerciseId, effectiveSets]) => ({ exerciseId, effectiveSets: round2(effectiveSets) }));
}

const STATUS_RANK: Record<RecoveryStatus, number> = { attention: 0, recovering: 1, gradual: 2, ready: 3 };

/** Worst-of aggregation (used for muscle-level and region-level displays). */
export function worstOf(list: RecoveryEstimate[]): RecoveryEstimate | null {
  let w: RecoveryEstimate | null = null;
  for (const e of list) {
    if (!w) w = e;
    else if (STATUS_RANK[e.status] < STATUS_RANK[w.status]) w = e;
    else if (STATUS_RANK[e.status] === STATUS_RANK[w.status] && (e.readyAt ?? "") > (w.readyAt ?? "")) w = e;
  }
  return w;
}

/**
 * Learn per-muscle τ multipliers from soreness feedback, in chronological order.
 * If the model said "ready" but you reported obvious soreness → recovery is slower for you (+step).
 * If the model said "still recovering" but you reported no soreness → slightly faster (−step/2).
 * Bounded and labelled as a personal heuristic.
 */
export function learnPersonalMultipliers(
  loads: MuscleLoadEntry[],
  feedback: RecoveryFeedback[],
  timeZone: string,
): Record<string, number> {
  const personal: Record<string, number> = {};
  const muscleFb = feedback.filter((f) => f.muscleId && f.soreness != null).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const f of muscleFb) {
    const at = Date.parse(f.createdAt);
    // estimate WITHOUT any feedback, using the multipliers learned so far
    const est = estimateRecovery(loads, [], { now: at, timeZone, personal, sessionCount: 99 }).filter(
      (e) => e.muscleId === f.muscleId && (!f.side || f.side === "center" || e.side === f.side),
    );
    const w = worstOf(est);
    if (!w || !w.lastTrainedAt) continue;
    const cur = personal[f.muscleId!] ?? 1;
    let next = cur;
    if (w.baseStatus === "ready" && f.soreness === 2) next = cur + RECOVERY.personalStep;
    else if (w.baseStatus === "recovering" && f.soreness === 0) next = cur - RECOVERY.personalStep / 2;
    personal[f.muscleId!] = Math.min(RECOVERY.personalMax, Math.max(RECOVERY.personalMin, round2(next)));
  }
  return personal;
}
