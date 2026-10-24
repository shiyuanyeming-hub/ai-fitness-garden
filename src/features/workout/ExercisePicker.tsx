"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Region } from "@/core/types";
import { REGIONS } from "@/core/muscles";
import { Chip, Segmented, Sheet, TextInput, cx } from "@/components/ui";
import { useAppReady } from "@/features/app-data";
import { equipmentName, exercisesForEquipmentType, machinesFor, muscleNames, searchExercises } from "@/features/catalog";
import { PhotoThumb } from "@/features/equipment/PhotoThumb";
import { LATERALITY_LABEL } from "./format";
import type { GymEquipment } from "@/data/db";

export interface PickArgs {
  exerciseId: string;
  gymEquipmentId: string | null;
  prefill?: { sets: number; reps?: number | null; load?: number | null };
}

export function ExercisePicker({ open, onClose, onPick, sessionId }: { open: boolean; onClose: () => void; onPick: (a: PickArgs) => void; sessionId: string | null }) {
  const { facts, derived } = useAppReady();
  const gymId = facts.profile.currentGymId;
  const rec = derived.recommendation;
  const inSession = new Set(derived.bundles.find((b) => b.session.id === sessionId)?.exercises.map((e) => e.exerciseId) ?? []);
  const [tab, setTab] = useState<"rec" | "machine" | "search">(rec.exercises.length ? "rec" : "machine");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<Region | "all" | "cardio">("all");
  const [machine, setMachine] = useState<GymEquipment | null>(null);

  const machines = useMemo(
    () =>
      facts.gymEquipment
        .filter((g) => g.gymId === gymId)
        .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "")),
    [facts.gymEquipment, gymId],
  );
  const results = useMemo(() => searchExercises(facts.exercises, q, region).slice(0, 80), [facts.exercises, q, region]);

  const pickExercise = (exerciseId: string, ge: string | null, prefill?: PickArgs["prefill"]) => {
    if (ge == null) {
      const ex = derived.exerciseById[exerciseId];
      const m = ex ? machinesFor(facts, ex, gymId) : [];
      if (m.length === 1) ge = m[0].id;
    }
    onPick({ exerciseId, gymEquipmentId: ge, prefill });
    setMachine(null);
  };

  return (
    <Sheet open={open} onClose={() => { setMachine(null); onClose(); }} title={machine ? equipmentName(facts, machine) : "添加动作"}>
      {machine ? (
        <div>
          <button className="text-sm text-accent mb-3" onClick={() => setMachine(null)}>
            ‹ 返回器械列表
          </button>
          <div className="text-sm text-muted mb-2">你这次做的是哪个动作？</div>
          <ExerciseList
            items={exercisesForEquipmentType(facts, machine.equipmentTypeId, machine.id)}
            inSession={inSession}
            onPick={(id) => pickExercise(id, machine.id)}
          />
          <Link
            href={`/exercise?new=1&eq=${machine.equipmentTypeId}&ge=${machine.id}${sessionId ? `&session=${sessionId}` : ""}`}
            className="mt-3 block text-center h-11 leading-[44px] rounded-2xl border border-dashed border-line text-sm text-muted"
          >
            都不是 / 自定义动作
          </Link>
        </div>
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            className="mb-3"
            options={[
              { value: "rec", label: "今日推荐", disabled: !rec.exercises.length },
              { value: "machine", label: "我的器械" },
              { value: "search", label: "搜索动作" },
            ]}
          />
          {tab === "rec" && (
            <div className="space-y-2">
              {rec.exercises.map((r) => {
                const ex = derived.exerciseById[r.exerciseId];
                if (!ex) return null;
                return (
                  <button
                    key={r.exerciseId}
                    disabled={inSession.has(ex.id)}
                    onClick={() => pickExercise(ex.id, null, { sets: r.sets, reps: r.reps[1], load: r.progression.load })}
                    className="w-full text-left rounded-2xl border border-line bg-surface-2 p-3 disabled:opacity-40"
                  >
                    <div className="font-medium">{ex.name}</div>
                    <div className="text-xs text-muted">
                      {r.sets}组 × {r.reps[0]}–{r.reps[1]}次 · RIR {r.rir[0]}–{r.rir[1]} · {r.progression.text}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {tab === "machine" && (
            <div>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/scan${sessionId ? `?session=${sessionId}` : ""}`} className="rounded-2xl bg-accent text-accent-ink p-3 font-medium text-center">
                  📷 拍照识别
                </Link>
                <Link href="/equipment?add=1" className="rounded-2xl bg-surface-2 border border-line p-3 font-medium text-center">
                  ＋ 手动登记
                </Link>
              </div>
              {machines.length === 0 && <p className="text-sm text-muted mt-4 text-center">当前健身房还没有登记器械。拍照或手动登记后会出现在这里。</p>}
              <div className="mt-3 space-y-2">
                {machines.map((g) => (
                  <button key={g.id} onClick={() => setMachine(g)} className="w-full flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 text-left">
                    <PhotoThumb photoId={g.photoId ?? null} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {g.isFavorite && "★ "}
                        {equipmentName(facts, g)}
                      </div>
                      <div className="text-xs text-muted">{exercisesForEquipmentType(facts, g.equipmentTypeId, g.id).length} 个可选动作</div>
                    </div>
                    <span className="text-faint">›</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "search" && (
            <div>
              <TextInput placeholder="搜索动作、肌群…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="flex gap-1.5 overflow-x-auto py-2 -mx-1 px-1">
                <Chip active={region === "all"} onClick={() => setRegion("all")}>
                  全部
                </Chip>
                {REGIONS.map((r) => (
                  <Chip key={r.id} active={region === r.id} onClick={() => setRegion(r.id)}>
                    {r.name}
                  </Chip>
                ))}
                <Chip active={region === "cardio"} onClick={() => setRegion("cardio")}>
                  有氧
                </Chip>
              </div>
              <ExerciseList items={results} inSession={inSession} onPick={(id) => pickExercise(id, null)} />
              <Link
                href={`/exercise?new=1${sessionId ? `&session=${sessionId}` : ""}`}
                className="mt-3 block text-center h-11 leading-[44px] rounded-2xl border border-dashed border-line text-sm text-muted"
              >
                找不到？创建自定义动作
              </Link>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

export function ExerciseList({
  items,
  inSession,
  onPick,
  selected,
  hint,
}: {
  items: import("@/core/types").Exercise[];
  inSession?: Set<string>;
  onPick: (id: string) => void;
  selected?: string | null;
  hint?: Set<string>;
}) {
  return (
    <div className="space-y-1.5" role="list">
      {items.map((e) => (
        <button
          role="listitem"
          key={e.id}
          onClick={() => onPick(e.id)}
          className={cx(
            "w-full text-left rounded-2xl border p-3 flex items-center gap-3",
            selected === e.id ? "border-accent bg-accent-soft" : "border-line bg-surface",
          )}
        >
          <span className={cx("size-5 rounded-full border-2 shrink-0", selected === e.id ? "border-accent bg-accent" : "border-line")} />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{e.name}</span>
            {e.isCustom && <span className="ml-1.5 text-[11px] text-accent">自定义</span>}
            {e.lateralityMode !== "bilateral" && <span className="ml-1.5 text-[11px] text-muted">{LATERALITY_LABEL[e.lateralityMode]}</span>}
            {hint?.has(e.id) && <span className="ml-1.5 text-[11px] text-gradual">照片线索</span>}
            <span className="block text-xs text-muted truncate">{muscleNames(e, "primary")}</span>
          </span>
          {inSession?.has(e.id) && <span className="text-[11px] text-faint">已添加</span>}
        </button>
      ))}
    </div>
  );
}
