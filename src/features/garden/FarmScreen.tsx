"use client";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useAppReady, useNow } from "@/features/app-data";
import { Card, PageHeader, SectionTitle, Segmented, STATUS_COLOR, cx } from "@/components/ui";
import { MUSCLES, REGIONS } from "@/core/muscles";
import { worstOf, type RecoveryEstimate } from "@/core/recovery";
import { computeAchievements, plantStage, STAGE_LABEL } from "@/core/gamification";
import { formatDuration } from "@/core/time";
import { Plant } from "./Plant";
import { BodyMap } from "./BodyMap";
import { MuscleSheet } from "./MuscleSheet";
import { REGION_KEY_MUSCLES } from "@/core/recommendation/daily";

export function FarmScreen() {
  const { facts, derived } = useAppReady();
  const [view, setView] = useState<"farm" | "map">("farm");
  const [muscle, setMuscle] = useState<string | null>(null);
  const now = useNow(1000); // live countdown, computed locally
  const achievements = useMemo(
    () => computeAchievements(derived.bundles, derived.loads, derived.perfs, facts.profile, derived.today),
    [derived.bundles, derived.loads, derived.perfs, facts.profile, derived.today],
  );
  const matureCount = new Set(
    derived.recovery.filter((r) => r.lastTrainedAt && r.baseStatus === "ready").map((r) => r.muscleId),
  ).size;

  return (
    <div>
      <PageHeader title="肌肉农场" subtitle={matureCount ? `${matureCount} 块地已成熟，可以收获` : "训练一次 = 播种，按预计恢复时间生长"} />
      <Segmented
        className="mb-3"
        value={view}
        onChange={setView}
        options={[
          { value: "farm", label: "🌱 农场" },
          { value: "map", label: "🧍 人体图" },
        ]}
      />
      {view === "map" ? (
        <Card>
          <BodyMap recovery={derived.recovery} onSelect={setMuscle} />
        </Card>
      ) : (
        REGIONS.map((r) => {
          const ps = facts.profile.regionPriority[r.id];
          const muscles = MUSCLES.filter((m) => m.region === r.id);
          return (
            <section key={r.id} className={cx(ps === "skip" && "opacity-60")}>
              <SectionTitle>
                {r.name}
                {ps === "focus" ? " · 重点" : ps === "skip" ? " · 暂不优先" : ""}
              </SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                {muscles.map((m) => (
                  <Plot
                    key={m.id}
                    name={m.name}
                    est={derived.recovery.filter((x) => x.muscleId === m.id)}
                    now={now}
                    keyMuscle={REGION_KEY_MUSCLES[r.id].includes(m.id)}
                    onClick={() => setMuscle(m.id)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      <SectionTitle>花园成就</SectionTitle>
      <Card className="!p-0 divide-y divide-line">
        {achievements.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3">
            <div className={cx("size-10 rounded-2xl grid place-items-center text-xl", a.unlocked ? "bg-accent-soft" : "bg-surface-2 grayscale opacity-60")}>
              {a.unlocked ? "🏅" : "🌰"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{a.title}</div>
              <div className="text-xs text-muted">{a.description}</div>
              <div className="h-1.5 rounded-full bg-surface-3 mt-1.5 overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${(a.progress / a.goal) * 100}%` }} />
              </div>
            </div>
            <div className="text-xs num text-muted">
              {a.progress}/{a.goal}
            </div>
          </div>
        ))}
      </Card>
      <p className="text-[11px] text-faint mt-3 px-1">
        植物生长只表示「预计训练准备度」，不代表真实的肌纤维修复过程。多练不会让植物长得更快——再次训练会重新播种。合理休息也是进步的一部分。
      </p>
      <MuscleSheet muscleId={muscle} onClose={() => setMuscle(null)} />
    </div>
  );
}

function Plot({ name, est, now, onClick, keyMuscle }: { name: string; est: RecoveryEstimate[]; now: number; onClick: () => void; keyMuscle: boolean }) {
  const reduce = useReducedMotion();
  const w = worstOf(est);
  const lateral = est.length > 1;
  const stage = plantStage(w);
  const mature = stage === "mature";
  const left = w?.readyAt && w.baseStatus !== "ready" ? Date.parse(w.readyAt) - now : 0;
  const color = !w?.lastTrainedAt ? STATUS_COLOR.fallow : STATUS_COLOR[w.status];
  return (
    <motion.button
      whileTap={reduce ? undefined : { scale: 0.96 }}
      onClick={onClick}
      className={cx("card !rounded-2xl p-2 text-left relative overflow-hidden", mature && "ring-2 ring-ready/50")}
      aria-label={`${name}：${STAGE_LABEL[stage]}`}
    >
      <div className="flex justify-center gap-0 h-[72px]">
        {lateral ? (
          est.map((e) => (
            <div key={e.side} className="w-1/2 relative">
              <Plant stage={plantStage(e)} />
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] text-faint">{e.side === "left" ? "左" : "右"}</span>
            </div>
          ))
        ) : (
          <div className="w-1/2">
            <Plant stage={stage} />
          </div>
        )}
      </div>
      <div className="mt-1 text-[12px] font-medium truncate">
        {name}
        {!keyMuscle && <span className="text-faint font-normal"> ·辅</span>}
      </div>
      <div className="text-[11px] num truncate" style={{ color }}>
        {w?.status === "attention" ? "需要关注" : mature ? "可以训练啦" : stage === "fallow" ? "可播种" : `约${formatDuration(left)}`}
      </div>
      {w && w.lastTrainedAt && w.baseStatus !== "ready" && (
        <div className="absolute top-0 left-0 h-0.5" style={{ width: `${w.readinessPct}%`, background: color }} />
      )}
    </motion.button>
  );
}
