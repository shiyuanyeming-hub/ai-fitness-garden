"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAppReady } from "@/features/app-data";
import { Button, Card, Chip, SectionTitle, Sheet, StatusBadge, cx, useToast } from "@/components/ui";
import { BodyMap } from "@/features/garden/BodyMap";
import { MuscleSheet } from "@/features/garden/MuscleSheet";
import { REGION_NAME } from "@/core/muscles";
import { formatDuration } from "@/core/time";
import { findSubstitutes, type Availability } from "@/core/recommendation/substitution";
import { suggestProgression } from "@/core/recommendation/progression";
import type { Level3 } from "@/core/types";
import { addExerciseToSession, now as nowIso, saveDailyCheckin, startSession, uid } from "@/data/repo";
import { db } from "@/data/db";
import { EQUIPMENT_TYPES } from "@/data/seed/equipment";
import type { RecommendedExercise } from "@/core/recommendation/daily";

export function HomeScreen() {
  const { facts, derived, now } = useAppReady();
  const router = useRouter();
  const toast = useToast();
  const [muscle, setMuscle] = useState<string | null>(null);
  const [subFor, setSubFor] = useState<(RecommendedExercise & { replacedFrom?: string }) | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [showWhy, setShowWhy] = useState(false);
  const rec = derived.recommendation;
  const tz = facts.profile.timeZone;
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { timeZone: tz, month: "long", day: "numeric", weekday: "long" }).format(now);
  const checkin = facts.feedback.find((f) => f.date === derived.today && f.muscleId == null);

  const statusLine = useMemo(() => {
    if (derived.active) return "训练进行中，继续加油。";
    const focus = rec.regionStates.filter((s) => s.priority === "focus");
    const ready = focus.filter((s) => s.status === "ready" && s.daysSinceTrained != null);
    if (ready.length) return `${ready.map((s) => REGION_NAME[s.region]).join("、")}已准备好下一次训练。`;
    const recovering = focus.filter((s) => s.status === "recovering" || s.status === "gradual").sort((a, b) => (a.readyAt ?? "").localeCompare(b.readyAt ?? ""));
    if (recovering.length && recovering[0].readyAt)
      return `${REGION_NAME[recovering[0].region]}预计约${formatDuration(Date.parse(recovering[0].readyAt) - now)}后可再次训练。`;
    if (!derived.completed.length) return "从第一次记录开始，播下第一颗种子。";
    return rec.headline;
  }, [derived, rec, now]);

  const items: (RecommendedExercise & { replacedFrom?: string })[] = rec.exercises.map((r) => {
    const replaced = overrides[r.exerciseId];
    const ex = replaced ? derived.exerciseById[replaced] : null;
    if (!ex) return r;
    return { ...r, exerciseId: ex.id, replacedFrom: r.exerciseId, progression: suggestProgression(ex, derived.perfs[ex.id] ?? [], r.reps, null), why: "已替换" };
  });

  const startPlanned = async () => {
    const recId = uid();
    await db().recommendations.put({ id: recId, date: rec.date, view: { ...rec, exercises: items }, calculationVersion: rec.calculationVersion, createdAt: nowIso(), updatedAt: nowIso() });
    const s = await startSession({ gymId: facts.profile.currentGymId, source: "planned", recommendationId: recId });
    for (const r of items) await addExerciseToSession(s.id, r.exerciseId, null, { prefill: { sets: r.sets, reps: r.reps[1], load: r.progression.load } });
    router.push("/workout");
  };

  const check = async (k: "fatigue" | "sleep", v: Level3) => {
    await saveDailyCheckin(derived.today, { [k]: v });
    toast("已记录今日状态");
  };

  return (
    <div>
      <header className="pt-safe">
        <div className="pt-4 pb-1">
          <div className="text-[13px] text-muted">{dateLabel}</div>
          <h1 className="text-[26px] leading-snug font-bold tracking-tight mt-0.5">{statusLine}</h1>
        </div>
      </header>

      {derived.active && (
        <Link href="/workout" className="mt-3 flex items-center justify-between rounded-2xl bg-accent text-accent-ink px-4 py-3 font-medium">
          <span>训练进行中 · 已 {Math.round((now - Date.parse(derived.active.session.startedAt)) / 60000)} 分钟</span>
          <span>继续 ›</span>
        </Link>
      )}

      {!checkin?.fatigue && !checkin?.sleep && (
        <Card className="mt-3 !p-3">
          <div className="text-sm font-medium mb-2">今天状态如何？<span className="text-xs text-faint font-normal ml-1">（可选，会影响恢复估计）</span></div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs text-muted w-8">精神</span>
            {(["很好", "一般", "疲劳"] as const).map((l, i) => (
              <Chip key={l} onClick={() => check("fatigue", i as Level3)}>
                {l}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted w-8">睡眠</span>
            {(["很好", "一般", "较差"] as const).map((l, i) => (
              <Chip key={l} onClick={() => check("sleep", i as Level3)}>
                {l}
              </Chip>
            ))}
          </div>
        </Card>
      )}
      {(checkin?.fatigue != null || checkin?.sleep != null) && (
        <div className="mt-2 text-xs text-muted px-1">
          今日：精神{["很好", "一般", "疲劳"][checkin.fatigue ?? -1] ?? "未填"} · 睡眠{["很好", "一般", "较差"][checkin.sleep ?? -1] ?? "未填"}
          <button className="ml-2 text-accent" onClick={() => saveDailyCheckin(derived.today, { fatigue: null, sleep: null })}>
            修改
          </button>
        </div>
      )}

      <SectionTitle action={<Link href="/farm" className="text-xs text-accent">肌肉农场 ›</Link>}>恢复地图</SectionTitle>
      <Card>
        <BodyMap recovery={derived.recovery} onSelect={setMuscle} compact />
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {rec.regionStates
            .filter((s) => s.priority !== "skip")
            .map((s) => (
              <div key={s.region} className="rounded-xl bg-surface-2 px-2 py-1.5">
                <div className="text-xs font-medium">{REGION_NAME[s.region]}</div>
                <StatusBadge status={s.status} className="!px-0 !bg-transparent" />
              </div>
            ))}
        </div>
      </Card>

      <SectionTitle>今天建议练什么</SectionTitle>
      <Card>
        <div className="font-semibold text-lg">{rec.headline}</div>
        {!rec.restDay && <div className="text-xs text-muted mt-0.5">约 {rec.estimatedMinutes} 分钟 · 建议不是命令，你可以随时自由训练</div>}
        {rec.cautions.length > 0 && (
          <div className="mt-3 rounded-xl bg-attention/10 text-sm p-3 space-y-1">
            {rec.cautions.map((c) => (
              <div key={c}>⚠️ {c}</div>
            ))}
          </div>
        )}
        {rec.regions.length > 0 && (
          <button className="mt-2 text-xs text-accent" onClick={() => setShowWhy((v) => !v)}>
            {showWhy ? "收起推荐原因" : "为什么推荐这些？"}
          </button>
        )}
        {showWhy && (
          <div className="mt-2 space-y-2">
            {rec.regions.map((r) => (
              <div key={r.region} className="text-sm">
                <div className="font-medium">{REGION_NAME[r.region]} · 本次 {r.allocatedSets} 组</div>
                <ul className="text-muted list-disc pl-5">
                  {r.reasons.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ))}
            {rec.notes.map((n) => (
              <div key={n} className="text-xs text-muted">
                · {n}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 divide-y divide-line">
          {items.map((r) => {
            const ex = derived.exerciseById[r.exerciseId];
            if (!ex) return null;
            return (
              <div key={r.exerciseId} className="py-2.5 flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {ex.name}
                    {r.replacedFrom && <span className="ml-1 text-[11px] text-accent">已替换</span>}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {r.sets}组 × {r.reps[0]}–{r.reps[1]}次 · RIR {r.rir[0]}–{r.rir[1]} · 休息 {fmtRest(r.restSec)}
                  </div>
                  <div className="text-xs mt-0.5">
                    <span className={cx(r.progression.action === "increase" ? "text-accent" : "text-ink")}>{r.progression.text}</span>
                    {r.progression.load != null && <span className="num"> · {r.progression.loadKind === "assistance" ? "辅助 " : ""}{r.progression.load}{r.progression.loadUnit ?? "kg"}</span>}
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">{r.progression.reason}</div>
                </div>
                <button className="text-xs text-accent shrink-0 self-start mt-1" onClick={() => setSubFor(r)}>
                  替换
                </button>
              </div>
            );
          })}
        </div>
        {!rec.restDay && (
          <Button variant="primary" block size="lg" className="mt-2" onClick={startPlanned} disabled={!!derived.active}>
            按建议开始训练
          </Button>
        )}
      </Card>

      <SectionTitle>快速开始</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <QuickAction href="/scan" emoji="📷" label="拍照识别器械" primary />
        <QuickAction href="/equipment" emoji="🗂️" label="选择已有器械" />
        <QuickAction href="/workout" emoji="✍️" label="自由记录" />
      </div>

      <MuscleSheet muscleId={muscle} onClose={() => setMuscle(null)} />
      <SubstituteSheet
        target={subFor}
        onClose={() => setSubFor(null)}
        onPick={(id) => {
          if (subFor) setOverrides((o) => ({ ...o, [subFor.replacedFrom ?? subFor.exerciseId]: id }));
          setSubFor(null);
        }}
      />
    </div>
  );
}

function QuickAction({ href, emoji, label, primary }: { href: string; emoji: string; label: string; primary?: boolean }) {
  return (
    <Link href={href} className={cx("rounded-2xl p-3 text-center border", primary ? "bg-accent text-accent-ink border-transparent" : "bg-surface border-line")}>
      <div className="text-2xl">{emoji}</div>
      <div className="text-[13px] font-medium mt-1 leading-tight">{label}</div>
    </Link>
  );
}

function SubstituteSheet({ target, onClose, onPick }: { target: RecommendedExercise | null; onClose: () => void; onPick: (id: string) => void }) {
  const { facts, derived } = useAppReady();
  const ex = target ? derived.exerciseById[target.exerciseId] : null;
  const options = useMemo(() => {
    if (!ex) return [];
    // "This exercise can't be done here": remove its equipment from what's available.
    const base = derived.availability;
    const types = new Set(base.unknown ? EQUIPMENT_TYPES.map((t) => t.id) : base.equipmentTypes);
    for (const t of ex.equipmentTypes) types.delete(t);
    const av: Availability = { equipmentTypes: types, linkedExerciseIds: base.linkedExerciseIds, unknown: false };
    const used = new Set(derived.recommendation.exercises.map((r) => r.exerciseId));
    return findSubstitutes(ex, facts.exercises.filter((e) => !used.has(e.id)), av, derived.recovery, facts.profile.experience, new Set(facts.profile.excludedExerciseIds), 5);
  }, [ex, derived, facts]);
  return (
    <Sheet open={!!target} onClose={onClose} title={ex ? `替换「${ex.name}」` : ""}>
      <p className="text-sm text-muted mb-3">当前健身房无法进行这个动作时，按相近训练目标、主要肌群、动作模式和可用器械排序：</p>
      {derived.availability.unknown && <p className="text-xs text-faint mb-2">（还没有登记器械，按常见商业健身房推断）</p>}
      <div className="space-y-2">
        {options.map((o) => (
          <button key={o.exercise.id} onClick={() => onPick(o.exercise.id)} className="w-full text-left rounded-2xl border border-line p-3 active:bg-surface-2">
            <div className="font-medium">{o.exercise.name}</div>
            <div className="text-xs text-muted mt-0.5">{o.reasons.join(" · ")}</div>
          </button>
        ))}
        {!options.length && <div className="text-sm text-muted">没有找到合适的替代动作，可以在器械库登记更多器械。</div>}
      </div>
    </Sheet>
  );
}

function fmtRest(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? (s ? `${m}分${s}秒` : `${m}分钟`) : `${s}秒`;
}
