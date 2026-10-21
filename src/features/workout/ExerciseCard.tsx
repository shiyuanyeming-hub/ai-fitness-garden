"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Exercise, LoadUnit, MovementDirection, SetSide, SetType, WorkoutExercise, WorkoutSet } from "@/core/types";
import { addSet, completeSet, copyLane, deleteSet, lanesFor, removeWorkoutExercise, setLoadKind, updateSet, updateWorkoutExercise, ValidationError } from "@/data/repo";
import { Button, Segmented, cx, haptic, useToast, confirmAsync } from "@/components/ui";
import { BAND_LEVELS, fmtSet, laneLabel, loadLabel } from "./format";
import { useRestTimer } from "./rest-timer";
import { MUSCLE_BY_ID } from "@/core/muscles";
import { PhotoThumb } from "@/features/equipment/PhotoThumb";

type Lane = { side: SetSide; dir: MovementDirection };
const laneKey = (l: Lane) => `${l.side}|${l.dir}`;

function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

interface Props {
  we: WorkoutExercise;
  ex: Exercise;
  sets: WorkoutSet[];
  restSec: number;
  lastSummary?: string | null;
  equipmentName?: string | null;
  photoId?: string | null;
  defaultOpen?: boolean;
  hint?: string | null;
}

export function ExerciseCard({ we, ex, sets, restSec, lastSummary, equipmentName, photoId, defaultOpen = true, hint }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const toast = useToast();
  const lanes = lanesFor(ex);
  const byLane = useMemo(() => {
    const m = new Map<string, WorkoutSet[]>();
    for (const l of lanes) m.set(laneKey(l), []);
    for (const s of sets) {
      const k = `${s.side}|${s.movementDirection}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(s);
    }
    for (const v of m.values()) v.sort((a, b) => a.setIndex - b.setIndex);
    return m;
  }, [sets, lanes]);

  const isUnilateral = lanes.length === 2 && lanes[0].dir === "none";
  const L = byLane.get(laneKey(lanes[0])) ?? [];
  const R = lanes[1] ? byLane.get(laneKey(lanes[1])) ?? [] : [];
  const pairable =
    isUnilateral &&
    L.length === R.length &&
    L.every((s, i) => s.loadValue === R[i].loadValue && s.reps === R[i].reps && !!s.completedAt === !!R[i].completedAt && s.rir === R[i].rir && s.setType === R[i].setType);
  const mode: "same" | "separate" = isUnilateral ? (we.entryMode === "same" && pairable ? "same" : "separate") : "same";

  const done = sets.filter((s) => s.completedAt).length;
  const kind = sets[0]?.loadKind ?? (ex.resistanceType === "assisted" ? "assistance" : ex.resistanceType === "bodyweight" ? "bodyweight" : ex.resistanceType === "band" ? "band" : "external");
  const unit = sets.find((s) => s.loadUnit)?.loadUnit ?? (kind === "band" ? "level" : "kg");
  const primary = ex.muscles.filter((m) => m.role === "primary").map((m) => MUSCLE_BY_ID[m.muscleId]?.name).join("、");

  async function finishExercise() {
    const pending = sets.filter((s) => !s.completedAt);
    if (pending.length && !confirmAsync(`还有 ${pending.length} 组未打勾，将被丢弃（不会计入训练）。继续？`)) return;
    for (const p of pending) await deleteSet(p.id);
    const last = sets.filter((s) => s.completedAt).map((s) => s.completedAt!).sort().pop();
    await updateWorkoutExercise(we.id, { completedAt: last ?? new Date().toISOString() });
    setOpen(false);
    haptic(15);
  }

  return (
    <section className="card overflow-hidden" data-testid={`exercise-${ex.id}`}>
      <button className="w-full flex items-center gap-3 p-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <PhotoThumb photoId={photoId ?? null} size={48} fallback={ex.kind === "core" ? "🎯" : "🏋️"} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{ex.name}</div>
          <div className="text-xs text-muted truncate">
            {equipmentName ? `${equipmentName} · ` : ""}
            {primary}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={cx("text-sm font-semibold num", done ? "text-accent" : "text-faint")}>
            {done}/{sets.length}
          </div>
          <div className="text-[11px] text-faint">{we.completedAt ? "已完成" : "组"}</div>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3">
          {lastSummary && (
            <div className="text-xs text-muted bg-surface-2 rounded-xl px-3 py-2 mb-2">
              上次：<span className="text-ink">{lastSummary}</span>
            </div>
          )}
          {hint && <div className="text-xs text-muted mb-2">{hint}</div>}
          {kind === "assistance" && (
            <div className="text-xs rounded-xl px-3 py-2 mb-2 bg-gradual/10 text-ink">
              这里填写的是<b>辅助重量</b>：数值越大越轻松，不会当作普通负重计算。
            </div>
          )}
          {ex.lateralityMode === "directional" && (
            <div className="text-xs text-muted mb-2">「向左/向右」是动作方向，不代表只有同侧肌肉参与；系统只统计核心整体负荷。</div>
          )}

          <div className="flex items-center gap-2 mb-2">
            {isUnilateral && (
              <Segmented
                size="sm"
                className="flex-1"
                value={mode}
                onChange={(v) => updateWorkoutExercise(we.id, { entryMode: v })}
                options={[
                  { value: "same", label: "左右相同", disabled: !pairable },
                  { value: "separate", label: "左右分别" },
                ]}
              />
            )}
            {(kind === "external" || kind === "assistance") && (
              <Segmented<LoadUnit>
                size="sm"
                className={isUnilateral ? "w-28" : "w-28 ml-auto"}
                value={unit === "lb" ? "lb" : "kg"}
                onChange={(u) => setLoadKind(we.id, kind, u)}
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
              />
            )}
          </div>

          {mode === "same" && isUnilateral ? (
            <Lane
              label="左右各"
              rows={L.map((l, i) => [l, R[i]] as [WorkoutSet, WorkoutSet])}
              ex={ex}
              restSec={restSec}
              kind={kind}
              unit={unit}
              onError={(m) => toast(m, "error")}
              onAdd={async () => {
                await addSet(we.id, "left", "none");
                await addSet(we.id, "right", "none");
              }}
            />
          ) : (
            lanes.map((lane, li) => (
              <div key={laneKey(lane)} className={li ? "mt-3" : ""}>
                <Lane
                  label={laneLabel(lane.side, lane.dir)}
                  rows={(byLane.get(laneKey(lane)) ?? []).map((s) => [s] as [WorkoutSet])}
                  ex={ex}
                  restSec={restSec}
                  kind={kind}
                  unit={unit}
                  onError={(m) => toast(m, "error")}
                  onAdd={() => addSet(we.id, lane.side, lane.dir)}
                />
                {lanes.length === 2 && li === 0 && (
                  <button
                    className="mt-2 text-xs text-accent font-medium"
                    onClick={async () => {
                      await copyLane(we.id, lanes[0], lanes[1]);
                      toast(`已复制到${laneLabel(lanes[1].side, lanes[1].dir)}，可单独修改`);
                    }}
                  >
                    ⇣ 复制到{laneLabel(lanes[1].side, lanes[1].dir)}（保留已完成的组）
                  </button>
                )}
              </div>
            ))
          )}

          <div className="flex gap-2 mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-attention"
              onClick={async () => {
                if (done && !confirmAsync("删除这个动作及其所有组？")) return;
                await removeWorkoutExercise(we.id);
              }}
            >
              删除动作
            </Button>
            <div className="flex-1" />
            {!we.completedAt && (
              <Button variant="soft" size="sm" onClick={finishExercise} disabled={!done}>
                完成动作
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );

}

interface LaneProps {
  label: string;
  rows: WorkoutSet[][];
  ex: Exercise;
  restSec: number;
  kind: WorkoutSet["loadKind"];
  unit: LoadUnit | null;
  onAdd: () => Promise<unknown>;
  onError: (m: string) => void;
}

function Lane({ label, rows, ex, restSec, kind, unit, onAdd, onError }: LaneProps) {
  return (
    <div>
      {label && <div className="text-[12px] font-semibold text-muted mb-1 px-1">{label}</div>}
      <div className="grid grid-cols-[34px_1fr_1fr_56px_44px_28px] gap-1.5 items-center text-[11px] text-faint px-1 mb-1">
        <span>组</span>
        <span>{ex.measurementType === "duration" || ex.measurementType === "distance" ? "" : loadLabel(kind, unit)}</span>
        <span>{ex.measurementType === "duration" ? "秒" : ex.measurementType === "distance" ? "米" : "次数"}</span>
        <span>RIR</span>
        <span />
        <span />
      </div>
      <div className="space-y-1.5">
        {rows.map((group) => (
          <SetRow key={group.map((g) => g.id).join("+")} group={group} ex={ex} restSec={restSec} onError={onError} />
        ))}
      </div>
      <button
        className="mt-2 w-full h-10 rounded-xl border border-dashed border-line text-sm text-muted active:bg-surface-2"
        onClick={async () => {
          await onAdd();
          haptic(8);
        }}
      >
        ＋ 加一组（复制上一组）
      </button>
    </div>
  );
}

function useDraft(v: number | null) {
  const [s, setS] = useState(v == null ? "" : String(v));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setS(v == null ? "" : String(v));
  }, [v]);
  return { s, setS, focused };
}

function SetRow({ group, ex, restSec, onError }: { group: WorkoutSet[]; ex: Exercise; restSec: number; onError: (m: string) => void }) {
  const s = group[0];
  const load = useDraft(s.loadValue);
  const reps = useDraft(ex.measurementType === "duration" ? s.durationSeconds : ex.measurementType === "distance" ? s.distanceM : s.reps);
  const [more, setMore] = useState(false);
  const { start } = useRestTimer();
  const done = !!s.completedAt;
  const showLoad = ex.measurementType !== "duration" && ex.measurementType !== "distance" && !(ex.measurementType === "reps_only" && s.loadKind !== "bodyweight");

  async function patchAll(p: Partial<WorkoutSet>) {
    try {
      for (const g of group) await updateSet(g.id, p);
    } catch (e) {
      onError(e instanceof ValidationError ? e.message : "保存失败");
      throw e;
    }
  }

  async function commit() {
    const lv = parseNum(load.s);
    const rv = parseNum(reps.s);
    if (Number.isNaN(lv) || Number.isNaN(rv)) {
      onError("请输入数字");
      throw new Error("nan");
    }
    const p: Partial<WorkoutSet> = {};
    if (showLoad && lv !== s.loadValue) p.loadValue = lv;
    if (ex.measurementType === "duration") {
      if (rv !== s.durationSeconds) p.durationSeconds = rv;
    } else if (ex.measurementType === "distance") {
      if (rv !== s.distanceM) p.distanceM = rv;
    } else if (rv !== s.reps) p.reps = rv == null ? null : Math.round(rv);
    if (Object.keys(p).length) await patchAll(p);
  }

  async function toggle() {
    try {
      await commit();
      for (const g of group) await completeSet(g.id, !done);
      if (!done) {
        haptic(12);
        start(restSec, ex.name);
      }
    } catch (e) {
      if (e instanceof ValidationError) onError(e.message);
    }
  }

  const cycleType = () => {
    const order: SetType[] = ["working", "warmup", "dropset"];
    patchAll({ setType: order[(order.indexOf(s.setType) + 1) % order.length] }).catch(() => {});
  };

  const inputCls = cx(
    "h-11 w-full rounded-xl text-center num text-[17px] border outline-none focus:border-accent",
    done ? "bg-accent-soft border-transparent" : "bg-surface-2 border-line",
  );

  return (
    <div>
      <div className="grid grid-cols-[34px_1fr_1fr_56px_44px_28px] gap-1.5 items-center">
        <button
          onClick={cycleType}
          className={cx(
            "h-11 rounded-xl text-sm font-semibold",
            s.setType === "warmup" ? "bg-gradual/15 text-gradual" : s.setType === "dropset" ? "bg-recovering/15 text-recovering" : "bg-surface-2 text-muted",
          )}
          aria-label="切换组类型：正式/热身/递减"
        >
          {s.setType === "warmup" ? "热" : s.setType === "dropset" ? "递" : s.setIndex}
        </button>
        {showLoad ? (
          s.loadKind === "band" ? (
            <select className={inputCls} value={s.loadValue ?? ""} onChange={(e) => patchAll({ loadValue: e.target.value ? Number(e.target.value) : null, loadUnit: "level" })}>
              <option value="">—</option>
              {BAND_LEVELS.map((b) => (
                <option key={b.v} value={b.v}>
                  {b.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              inputMode="decimal"
              enterKeyHint="next"
              placeholder={s.loadKind === "bodyweight" ? "自重" : "—"}
              value={load.s}
              aria-label="重量"
              onFocus={(e) => {
                load.focused.current = true;
                e.target.select();
              }}
              onChange={(e) => load.setS(e.target.value)}
              onBlur={() => {
                load.focused.current = false;
                commit().catch(() => {});
              }}
            />
          )
        ) : (
          <span className="text-center text-faint text-sm">{ex.measurementType === "duration" || ex.measurementType === "distance" ? "" : "自重"}</span>
        )}
        <input
          className={inputCls}
          inputMode={ex.measurementType === "distance" ? "decimal" : "numeric"}
          enterKeyHint="done"
          placeholder="—"
          value={reps.s}
          aria-label="次数"
          onFocus={(e) => {
            reps.focused.current = true;
            e.target.select();
          }}
          onChange={(e) => reps.setS(e.target.value)}
          onBlur={() => {
            reps.focused.current = false;
            commit().catch(() => {});
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <select
          className={cx(inputCls, "text-[15px] px-0")}
          value={s.rir ?? ""}
          aria-label="RIR（可选）"
          onChange={(e) => patchAll({ rir: e.target.value === "" ? null : Number(e.target.value) }).catch(() => {})}
        >
          <option value="">—</option>
          {[0, 1, 2, 3, 4, 5].map((r) => (
            <option key={r} value={r}>
              {r === 5 ? "5+" : r}
            </option>
          ))}
        </select>
        <button
          onClick={toggle}
          className={cx("h-11 rounded-xl grid place-items-center text-lg font-bold transition", done ? "bg-accent text-accent-ink" : "bg-surface-2 border border-line text-faint")}
          aria-label={done ? "取消完成" : "完成这一组"}
          aria-pressed={done}
        >
          ✓
        </button>
        <button onClick={() => setMore((m) => !m)} className="h-11 text-faint text-lg" aria-label="更多">
          ⋯
        </button>
      </div>
      {more && (
        <div className="mt-1.5 mb-2 ml-9 rounded-xl bg-surface-2 p-2.5 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted w-12">RPE</span>
            <select
              className="h-9 flex-1 rounded-lg bg-surface border border-line px-2"
              value={s.rpe ?? ""}
              onChange={(e) => patchAll({ rpe: e.target.value === "" ? null : Number(e.target.value) }).catch(() => {})}
            >
              <option value="">未填写</option>
              {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted w-12">类型</span>
            {(["working", "warmup", "dropset"] as SetType[]).map((t) => (
              <button
                key={t}
                className={cx("h-8 px-2.5 rounded-lg border", s.setType === t ? "bg-accent text-accent-ink border-transparent" : "bg-surface border-line")}
                onClick={() => patchAll({ setType: t }).catch(() => {})}
              >
                {t === "working" ? "正式组" : t === "warmup" ? "热身组" : "递减组"}
              </button>
            ))}
          </div>
          <input
            className="h-9 w-full rounded-lg bg-surface border border-line px-2"
            placeholder="备注（可选）"
            defaultValue={s.notes ?? ""}
            onBlur={(e) => patchAll({ notes: e.target.value || undefined }).catch(() => {})}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-faint">{done ? `已记录：${fmtSet(s)}` : "未打勾的组不会计入训练"}</span>
            <button
              className="text-attention text-sm"
              onClick={async () => {
                for (const g of group) await deleteSet(g.id);
              }}
            >
              删除此组
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
