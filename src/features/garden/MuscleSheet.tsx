"use client";
import Link from "next/link";
import { MUSCLE_BY_ID, REGION_NAME } from "@/core/muscles";
import { STATUS_LABEL, type RecoveryEstimate } from "@/core/recovery";
import { formatDuration, toDateKey, formatLocalTime } from "@/core/time";
import { isAvailable, maxDifficulty } from "@/core/recommendation/substitution";
import { suggestProgression } from "@/core/recommendation/progression";
import { PRESCRIPTION } from "@/core/params";
import type { Level3, MuscleSide } from "@/core/types";
import { Chip, ProgressRing, STATUS_COLOR, Sheet, StatusBadge, cx, useToast } from "@/components/ui";
import { useAppReady } from "@/features/app-data";
import { saveMuscleFeedback } from "@/data/repo";
import { plantStage, STAGE_LABEL } from "@/core/gamification";
import { Plant } from "./Plant";

const CONF: Record<RecoveryEstimate["confidence"], string> = { low: "可信度低", medium: "可信度中", high: "可信度较高" };

export function MuscleSheet({ muscleId, onClose }: { muscleId: string | null; onClose: () => void }) {
  return (
    <Sheet open={!!muscleId} onClose={onClose} title={muscleId ? MUSCLE_BY_ID[muscleId]?.name : ""}>
      {muscleId && <MuscleDetail muscleId={muscleId} />}
    </Sheet>
  );
}

function MuscleDetail({ muscleId }: { muscleId: string }) {
  const { facts, derived, now } = useAppReady();
  const toast = useToast();
  const m = MUSCLE_BY_ID[muscleId];
  const tz = facts.profile.timeZone;
  const est = derived.recovery.filter((r) => r.muscleId === muscleId);
  const todayFb = facts.feedback.filter((f) => f.date === derived.today && f.muscleId === muscleId);

  const recs = derived.recommendation.exercises.filter((r) => derived.exerciseById[r.exerciseId]?.muscles.some((x) => x.muscleId === muscleId && x.role === "primary"));
  const pool = facts.exercises
    .filter(
      (e) =>
        e.muscles.some((x) => x.muscleId === muscleId && x.role === "primary") &&
        isAvailable(e, derived.availability) &&
        e.difficulty <= maxDifficulty(facts.profile.experience) &&
        !facts.profile.excludedExerciseIds.includes(e.id),
    )
    .sort((a, b) => Number(!!derived.perfs[b.id]) - Number(!!derived.perfs[a.id]) || a.difficulty - b.difficulty)
    .slice(0, 3);

  const feedback = async (side: MuscleSide | null, soreness: Level3, pain = false) => {
    await saveMuscleFeedback(derived.today, muscleId, side, soreness, pain);
    toast("已记录，恢复估计已更新");
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted">
        {REGION_NAME[m.region]} · {m.nameEn}
      </div>
      <div className={cx("grid gap-3", est.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {est.map((e) => {
          const left = e.readyAt ? Date.parse(e.readyAt) - now : 0;
          const stage = plantStage(e);
          return (
            <div key={e.side} className="rounded-2xl bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{e.side === "left" ? "左侧" : e.side === "right" ? "右侧" : "整体"}</span>
                <StatusBadge status={e.status} />
              </div>
              <div className="flex items-center gap-3 mt-2">
                <ProgressRing pct={e.readinessPct} color={STATUS_COLOR[e.status]} size={52}>
                  {e.readinessPct}%
                </ProgressRing>
                <div className="w-10 h-12">
                  <Plant stage={stage} />
                </div>
              </div>
              <div className="text-xs text-muted mt-2">{STAGE_LABEL[stage]}</div>
              <div className="text-sm mt-1">
                {e.baseStatus === "ready" ? (
                  <span className="text-ready font-medium">预计可再次高负荷训练</span>
                ) : (
                  <>
                    恢复倒计时 <b className="num">约{formatDuration(left)}</b>
                  </>
                )}
              </div>
              <div className="text-[11px] text-faint mt-0.5">
                {e.lastTrainedAt ? `上次 ${toDateKey(e.lastTrainedAt, tz).slice(5)} ${formatLocalTime(e.lastTrainedAt, tz)}` : "近期未训练"} · 7天 {e.sets7d} 组 · {CONF[e.confidence]}
              </div>
            </div>
          );
        })}
      </div>

      {est.some((e) => e.lastContributions.length) && (
        <div>
          <div className="text-[13px] text-muted mb-1">最近训练贡献</div>
          {mergeSides(est).map((c) => (
            <div key={c.exerciseId} className="flex justify-between text-sm py-0.5">
              <span>{derived.exerciseById[c.exerciseId]?.name ?? c.exerciseId}</span>
              <span className="num text-muted">{c.effectiveSets} 有效组</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="text-[13px] text-muted mb-1">为什么这样估计</div>
        <ul className="text-sm space-y-1 list-disc pl-5">
          {[...new Set(est.flatMap((e) => [...e.attentionReasons, ...e.reasons]))].map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-[11px] text-faint mt-2">恢复时间是根据训练记录的工程估算（规则引擎 + 时间衰减 + 你的反馈），不是真实生理测量，也不是医学诊断。即使显示恢复中，你也可以训练。</p>
      </div>

      <div>
        <div className="text-[13px] text-muted mb-1.5">今天的感觉（可选）</div>
        {(m.supportsLaterality ? (["left", "right"] as const) : (["center"] as const)).map((side) => {
          const cur = todayFb.find((f) => (f.side ?? "center") === side);
          return (
            <div key={side} className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              {m.supportsLaterality && <span className="text-xs text-muted w-6">{side === "left" ? "左" : "右"}</span>}
              {(["无酸痛", "轻微", "明显"] as const).map((l, i) => (
                <Chip key={l} active={cur?.soreness === i && !cur?.pain} onClick={() => feedback(side, i as Level3)}>
                  {l}
                </Chip>
              ))}
              <Chip active={!!cur?.pain} onClick={() => feedback(side, (cur?.soreness ?? 2) as Level3, !cur?.pain)}>
                疼痛⚠️
              </Chip>
            </div>
          );
        })}
        <p className="text-[11px] text-faint">肌肉酸痛不等于训练效果；疼痛（尖锐、关节处或持续加重）请降低强度，必要时咨询专业人士。</p>
      </div>

      <div>
        <div className="text-[13px] text-muted mb-1.5">推荐动作</div>
        <div className="space-y-1.5">
          {(recs.length ? recs.map((r) => ({ ex: derived.exerciseById[r.exerciseId], p: r.progression, sets: r.sets, reps: r.reps })) : pool.map((ex) => {
            const pr = ex.kind === "compound" ? PRESCRIPTION[facts.profile.experience].compound : ex.kind === "core" ? PRESCRIPTION[facts.profile.experience].core : PRESCRIPTION[facts.profile.experience].isolation;
            return { ex, p: suggestProgression(ex, derived.perfs[ex.id] ?? [], pr.reps, null), sets: pr.sets, reps: [pr.reps[0], pr.reps[1]] as [number, number] };
          })).map(({ ex, p, sets, reps }) => (
            <Link key={ex.id} href={`/workout?add=${ex.id}`} className="block rounded-2xl border border-line p-3">
              <div className="flex justify-between">
                <span className="font-medium">{ex.name}</span>
                <span className="text-accent text-sm">加入训练 ›</span>
              </div>
              <div className="text-xs text-muted mt-0.5">
                {sets}组 × {reps[0]}–{reps[1]}次 · {p.text}
                {p.load != null ? `：${p.load}${p.loadUnit ?? "kg"}` : ""}
              </div>
            </Link>
          ))}
          {!recs.length && !pool.length && <div className="text-sm text-muted">当前健身房没有登记能训练这块肌肉的器械。</div>}
        </div>
      </div>
      <div className="text-[11px] text-faint">状态：{est.map((e) => STATUS_LABEL[e.status]).join(" / ")} · 计算版本 {est[0]?.calculationVersion}</div>
    </div>
  );
}

function mergeSides(est: RecoveryEstimate[]) {
  const m = new Map<string, number[]>();
  for (const e of est) for (const c of e.lastContributions) (m.get(c.exerciseId) ?? m.set(c.exerciseId, []).get(c.exerciseId)!).push(c.effectiveSets);
  // side-averaged for lateral muscles (consistent with muscle-level totals)
  return [...m.entries()].map(([exerciseId, v]) => ({ exerciseId, effectiveSets: Math.round((v.reduce((a, b) => a + b, 0) / Math.max(1, est.length)) * 100) / 100 }));
}
