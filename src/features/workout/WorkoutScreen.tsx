"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useAppReady } from "@/features/app-data";
import { Button, Card, Field, PageHeader, Sheet, TextInput, confirmAsync, haptic, useToast } from "@/components/ui";
import { ExerciseCard } from "./ExerciseCard";
import { ExercisePicker, type PickArgs } from "./ExercisePicker";
import {
  addExerciseToSession,
  createBackfillSession,
  deleteSession,
  finishSession,
  now as nowIso,
  startSession,
  uid,
  updateSession,
} from "@/data/repo";
import { db } from "@/data/db";
import { summarizeSession } from "@/core/summary";
import { summarizePerformance } from "@/core/recommendation/progression";
import { addDays, formatLocalTime, localToISO, toDateKey } from "@/core/time";
import { defaultRest } from "./format";
import { equipmentName } from "@/features/catalog";
import { REGION_NAME } from "@/core/muscles";
import type { DailyRecommendationView } from "@/core/recommendation/daily";

export function WorkoutScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { facts, derived, now } = useAppReady();
  const id = params.get("id");
  const bundle = id ? derived.bundles.find((b) => b.session.id === id) : derived.active;
  const [picker, setPicker] = useState(false);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const tz = facts.profile.timeZone;
  const handledAdd = useRef(false);

  // deep-link: /workout?add=<exerciseId>&ge=<gymEquipmentId>
  useEffect(() => {
    const add = params.get("add");
    if (!add || handledAdd.current) return;
    handledAdd.current = true;
    (async () => {
      const s = bundle?.session ?? (await startSession({ gymId: facts.profile.currentGymId }));
      await addExerciseToSession(s.id, add, params.get("ge"));
      router.replace(s.status === "completed" ? `/workout?id=${s.id}` : "/workout");
    })().catch((e) => toast(String(e.message ?? e), "error"));
  }, [params, bundle, facts.profile.currentGymId, router, toast]);

  if (summaryFor) {
    const b = derived.bundles.find((x) => x.session.id === summaryFor);
    if (b) return <SummaryView bundleId={summaryFor} onDone={() => { setSummaryFor(null); router.push("/"); }} />;
  }

  if (params.get("backfill")) return <StartPanel initialBackfill initialDate={params.get("date")} />;
  if (!bundle) return <StartPanel />;

  const s = bundle.session;
  const isActive = s.status === "active";
  const elapsed = Math.max(0, Math.round(((s.completedAt ? Date.parse(s.completedAt) : now) - Date.parse(s.startedAt)) / 60000));
  const gym = facts.gyms.find((g) => g.id === s.gymId);
  const snapshotRec = derived.recommendation;

  const onPick = async (a: PickArgs) => {
    setPicker(false);
    try {
      await addExerciseToSession(s.id, a.exerciseId, a.gymEquipmentId, { prefill: a.prefill });
      haptic(10);
    } catch (e) {
      toast(String((e as Error).message), "error");
    }
  };

  const finish = async () => {
    const done = bundle.sets.filter((x) => x.completedAt).length;
    if (!done) {
      if (confirmAsync("这次训练还没有完成任何一组。要放弃这次训练吗？")) {
        await deleteSession(s.id);
        router.push("/");
      }
      return;
    }
    const pending = bundle.sets.length - done;
    if (pending && !confirmAsync(`还有 ${pending} 组未打勾，结束后将被丢弃（不计入训练）。确定结束？`)) return;
    await finishSession(s.id, isActive ? undefined : s.completedAt ?? undefined);
    haptic([20, 40, 20]);
    setSummaryFor(s.id);
  };

  return (
    <div>
      <PageHeader
        subtitle={isActive ? `进行中 · ${elapsed} 分钟${gym ? ` · ${gym.name}` : ""}` : `${toDateKey(s.startedAt, tz)} ${formatLocalTime(s.startedAt, tz)}${s.notes === "补录" ? " · 补录" : ""}`}
        title={isActive ? "训练中" : "训练记录"}
        right={
          isActive ? (
            <Button variant="primary" size="sm" onClick={finish}>
              结束训练
            </Button>
          ) : undefined
        }
      />
      {!isActive && <SessionTimeEditor sessionId={s.id} />}
      {s.source === "planned" && isActive && <div className="text-xs text-muted mb-2">按今日推荐开始 · 可以随时增删或替换动作，记录以实际为准。</div>}

      <div className="space-y-3 mt-2">
        {bundle.exercises.map((we, i) => {
          const ex = derived.exerciseById[we.exerciseId];
          if (!ex) return null;
          const ge = facts.gymEquipment.find((g) => g.id === we.gymEquipmentId);
          const prev = (derived.perfs[ex.id] ?? []).filter((p) => p.sessionId !== s.id && p.at < (we.createdAt ?? nowIso()));
          const last = prev.find((p) => p.gymEquipmentId === we.gymEquipmentId) ?? prev.find((p) => !we.gymEquipmentId || !p.gymEquipmentId) ?? null;
          const recEx = snapshotRec.exercises.find((r) => r.exerciseId === ex.id);
          return (
            <ExerciseCard
              key={we.id}
              we={we}
              ex={ex}
              sets={bundle.sets.filter((x) => x.workoutExerciseId === we.id)}
              restSec={recEx?.restSec ?? defaultRest(ex)}
              lastSummary={last ? summarizePerformance(last) : null}
              equipmentName={we.gymEquipmentId ? (equipmentName(facts, ge) ?? "已删除的器械") : null}
              photoId={ge?.photoId ?? null}
              defaultOpen={!we.completedAt && (i === bundle.exercises.length - 1 || !isActive)}
              hint={recEx && isActive ? `建议 ${recEx.sets}组 × ${recEx.reps[0]}–${recEx.reps[1]}次 · RIR ${recEx.rir[0]}–${recEx.rir[1]} · 休息 ${recEx.restSec}s` : null}
            />
          );
        })}
      </div>

      <Button block size="lg" className="mt-4" onClick={() => setPicker(true)}>
        ＋ 添加动作
      </Button>

      {!isActive && (
        <div className="mt-6 flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => {
              if (!confirmAsync("删除这次训练记录？相关统计和恢复估计会重新计算。")) return;
              await deleteSession(s.id);
              toast("已删除");
              router.push("/history");
            }}
          >
            删除这次训练
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={async () => {
              const n = await finishSession(s.id, s.completedAt ?? undefined);
              toast(n ? `已保存（丢弃 ${n} 个未打勾的组）` : "已保存", "success");
              router.push("/history");
            }}
          >
            保存
          </Button>
        </div>
      )}
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={onPick} sessionId={s.id} />
    </div>
  );
}

function StartPanel({ initialBackfill = false, initialDate }: { initialBackfill?: boolean; initialDate?: string | null }) {
  const { facts, derived } = useAppReady();
  const router = useRouter();
  const toast = useToast();
  const tz = facts.profile.timeZone;
  const rec = derived.recommendation;
  const [backfill, setBackfill] = useState(initialBackfill);
  const [date, setDate] = useState(initialDate ?? addDays(derived.today, -1));
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("20:00");

  const startFree = async () => {
    await startSession({ gymId: facts.profile.currentGymId, source: "free" });
    router.push("/workout");
  };
  const startPlanned = async () => {
    const recId = uid();
    await db().recommendations.put({ id: recId, date: rec.date, view: rec, calculationVersion: rec.calculationVersion, createdAt: nowIso(), updatedAt: nowIso() });
    const s = await startSession({ gymId: facts.profile.currentGymId, source: "planned", recommendationId: recId });
    for (const r of rec.exercises) await addExerciseToSession(s.id, r.exerciseId, null, { prefill: { sets: r.sets, reps: r.reps[1], load: r.progression.load } });
    router.push("/workout");
  };
  const createBackfill = async () => {
    try {
      const st = localToISO(date, start, tz);
      let en = localToISO(date, end, tz);
      if (en < st) en = localToISO(addDays(date, 1), end, tz); // crosses midnight
      const s = await createBackfillSession(facts.profile.currentGymId, st, en);
      router.push(`/workout?id=${s.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div>
      <PageHeader title="开始训练" subtitle={facts.gyms.find((g) => g.id === facts.profile.currentGymId)?.name} />
      {!rec.restDay && (
        <Card className="mt-2">
          <div className="text-sm text-muted">今日建议</div>
          <div className="font-semibold mt-0.5">{rec.regions.map((r) => REGION_NAME[r.region]).join(" + ")}</div>
          <div className="text-xs text-muted mt-1">
            {rec.exercises.length} 个动作 · 约 {rec.estimatedMinutes} 分钟
          </div>
          <Button variant="primary" block className="mt-3" onClick={startPlanned}>
            按建议开始
          </Button>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Button size="lg" onClick={startFree} variant={rec.restDay ? "primary" : "secondary"}>
          自由开始训练
        </Button>
        <Button size="lg" onClick={() => router.push("/scan")}>
          📷 拍照识别器械
        </Button>
      </div>
      <p className="text-xs text-muted mt-3 px-1">训练建议只是建议。你可以练任何部位，系统会以实际记录重新计算恢复和下一次建议。</p>

      <Card className="mt-6">
        <button className="w-full flex justify-between items-center" onClick={() => setBackfill((b) => !b)}>
          <span className="font-medium">补录历史训练</span>
          <span className="text-faint">{backfill ? "−" : "+"}</span>
        </button>
        {backfill && (
          <div className="mt-3 space-y-3">
            <Field label="日期">
              <TextInput type="date" value={date} max={derived.today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="开始">
                <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="结束" hint="早于开始时间视为跨过午夜">
                <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
            <Button block variant="primary" onClick={createBackfill}>
              创建补录
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function SessionTimeEditor({ sessionId }: { sessionId: string }) {
  const { facts, derived } = useAppReady();
  const toast = useToast();
  const tz = facts.profile.timeZone;
  const b = derived.bundles.find((x) => x.session.id === sessionId)!;
  const s = b.session;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(toDateKey(s.startedAt, tz));
  const [start, setStart] = useState(formatLocalTime(s.startedAt, tz));
  const [end, setEnd] = useState(s.completedAt ? formatLocalTime(s.completedAt, tz) : "");
  if (!open)
    return (
      <button className="text-xs text-accent mb-2" onClick={() => setOpen(true)}>
        修改日期 / 时间
      </button>
    );
  return (
    <Card className="mb-3 space-y-3">
      <Field label="日期（按开始时间归属）">
        <TextInput type="date" value={date} max={derived.today} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="开始">
          <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="结束">
          <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setOpen(false)}>
          取消
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={async () => {
            try {
              const st = localToISO(date, start, tz);
              let en = end ? localToISO(date, end, tz) : s.completedAt;
              if (en && en < st) en = localToISO(addDays(date, 1), end, tz);
              await updateSession(s.id, { startedAt: st, completedAt: en });
              toast("时间已更新，恢复估计已重新计算", "success");
              setOpen(false);
            } catch (e) {
              toast((e as Error).message, "error");
            }
          }}
        >
          保存时间
        </Button>
      </div>
    </Card>
  );
}

function SummaryView({ bundleId, onDone }: { bundleId: string; onDone: () => void }) {
  const { derived } = useAppReady();
  const reduce = useReducedMotion();
  const b = derived.bundles.find((x) => x.session.id === bundleId)!;
  const sum = useMemo(() => summarizeSession(b, derived.exerciseById), [b, derived.exerciseById]);
  const rec: DailyRecommendationView = derived.recommendation;
  const [fatigue, setFatigue] = useState<number | null>(b.session.perceivedFatigue ?? null);
  const [notes, setNotes] = useState(b.session.notes ?? "");
  return (
    <Sheet open onClose={onDone} title="训练完成">
      <motion.div initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-3">
        <div className="text-5xl">🌱</div>
        <div className="text-sm text-muted mt-2">{sum.durationMin != null ? `用时 ${sum.durationMin} 分钟 · ` : ""}正式组 {sum.totalWorkingSets} 组</div>
      </motion.div>
      <div className="space-y-1.5">
        {sum.exercises.map((e) => (
          <div key={e.exerciseId} className="flex justify-between text-sm">
            <span>{e.name}</span>
            <span className="text-muted">
              {e.detail}
              {e.warmupSets ? ` +${e.warmupSets}热身` : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-sm">
        <div>
          <span className="text-muted">主要训练：</span>
          {sum.primaryRegions.map((r) => REGION_NAME[r]).join("、") || "—"}
        </div>
        {sum.secondaryMuscles.length > 0 && (
          <div className="mt-0.5">
            <span className="text-muted">辅助参与：</span>
            {sum.secondaryMuscles.join("、")}
          </div>
        )}
        <div className="mt-2 rounded-xl bg-accent-soft px-3 py-2">
          <span className="text-muted">下次建议：</span>
          {rec.restDay ? rec.headline : `优先考虑 ${rec.regions.map((r) => REGION_NAME[r.region]).join("、")}`}
        </div>
        <div className="text-xs text-faint mt-1">对应肌群已重新播种 🌱，可在农场查看预计恢复时间（估算）。</div>
      </div>
      <div className="mt-4">
        <div className="text-[13px] text-muted mb-1.5">本次主观疲劳（可选）</div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => {
                setFatigue(n);
                updateSession(b.session.id, { perceivedFatigue: n as 1 | 2 | 3 | 4 | 5 });
              }}
              className={`flex-1 h-10 rounded-xl border ${fatigue === n ? "bg-accent text-accent-ink border-transparent" : "bg-surface-2 border-line"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-faint mt-1">
          <span>很轻松</span>
          <span>非常累</span>
        </div>
        <TextInput className="mt-3" placeholder="训练备注（可选）" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => updateSession(b.session.id, { notes: notes || undefined })} />
      </div>
      <Button variant="primary" block size="lg" className="mt-4" onClick={onDone}>
        完成
      </Button>
    </Sheet>
  );
}
