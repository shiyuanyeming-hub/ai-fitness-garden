"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAppReady } from "@/features/app-data";
import { Button, Card, Chip, Field, PageHeader, SectionTitle, TextInput, cx, useToast, confirmAsync } from "@/components/ui";
import { MUSCLES, REGIONS } from "@/core/muscles";
import type { Exercise, Region } from "@/core/types";
import { addExerciseToSession, deleteCustomExercise, saveCustomExercise, startSession } from "@/data/repo";
import { db } from "@/data/db";
import { KIND_LABEL, LATERALITY_LABEL, MEASUREMENT_LABEL, RESISTANCE_LABEL } from "@/features/workout/format";
import { equipmentTypeName, muscleNames, searchExercises } from "@/features/catalog";

export function ExerciseScreen() {
  const params = useSearchParams();
  if (params.get("new") || params.get("edit")) return <ExerciseForm />;
  return <Library />;
}

function Library() {
  const { facts } = useAppReady();
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<Region | "all" | "cardio">("all");
  const list = searchExercises(facts.exercises, q, region);
  return (
    <div>
      <PageHeader title="动作库" subtitle={`${facts.exercises.length} 个动作`} right={<Link href="/exercise?new=1" className="text-accent text-sm">＋ 自定义</Link>} />
      <TextInput placeholder="搜索动作或肌群" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-1.5 overflow-x-auto py-2">
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
      <div className="space-y-2">
        {list.map((e) => (
          <Card key={e.id} className="!p-3">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">
                  {e.name} {e.isCustom && <span className="text-[11px] text-accent">自定义</span>}
                </div>
                <div className="text-xs text-muted">
                  主要：{muscleNames(e, "primary")}
                  {muscleNames(e, "secondary") && ` · 辅助：${muscleNames(e, "secondary")}`}
                </div>
                <div className="text-[11px] text-faint mt-0.5">
                  {KIND_LABEL[e.kind]} · {LATERALITY_LABEL[e.lateralityMode]} · {RESISTANCE_LABEL[e.resistanceType]}
                  {e.equipmentTypes.length ? ` · ${e.equipmentTypes.map((t) => equipmentTypeName(facts, t)).join("/")}` : " · 无需器械"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Link href={`/workout?add=${e.id}`} className="text-xs text-accent">
                  加入训练
                </Link>
                {e.isCustom && (
                  <Link href={`/exercise?edit=${e.id}`} className="text-xs text-muted">
                    编辑
                  </Link>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ExerciseForm() {
  const { facts } = useAppReady();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const editId = params.get("edit");
  const existing: Exercise | undefined = editId ? facts.exercises.find((e) => e.id === editId && e.isCustom) : undefined;
  const eq = params.get("eq");
  const ge = params.get("ge");
  const sessionId = params.get("session");
  const then = params.get("then");

  const [name, setName] = useState(existing?.name ?? "");
  const [primary, setPrimary] = useState<string[]>(existing?.muscles.filter((m) => m.role === "primary").map((m) => m.muscleId) ?? []);
  const [secondary, setSecondary] = useState<string[]>(existing?.muscles.filter((m) => m.role === "secondary").map((m) => m.muscleId) ?? []);
  const [kind, setKind] = useState<Exercise["kind"]>(existing?.kind ?? (params.get("kind") === "cardio" ? "cardio" : "isolation"));
  const cardio = kind === "cardio";
  const [lat, setLat] = useState<Exercise["lateralityMode"]>(existing?.lateralityMode ?? "bilateral");
  const [res, setRes] = useState<Exercise["resistanceType"]>(existing?.resistanceType ?? "external_load");
  const [meas, setMeas] = useState<Exercise["measurementType"]>(existing?.measurementType ?? "reps_weight");
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, id: string, other: string[], setOther: (v: string[]) => void) => {
    if (list.includes(id)) set(list.filter((x) => x !== id));
    else {
      set([...list, id]);
      if (other.includes(id)) setOther(other.filter((x) => x !== id));
    }
  };

  async function save() {
    setBusy(true);
    try {
      const ex = await saveCustomExercise({
        id: existing?.id,
        name,
        kind,
        lateralityMode: lat,
        resistanceType: res,
        measurementType: meas,
        primary,
        secondary,
        equipmentTypeId: eq,
        gymEquipmentId: ge,
      });
      toast(existing ? "已更新（历史记录会按新的肌群映射重新计算）" : "已保存，以后选择这台器械时会出现在候选列表", "success");
      if (sessionId || then === "workout") {
        const target = sessionId ? await db().sessions.get(sessionId) : undefined;
        const s = target ?? (await startSession({ gymId: facts.profile.currentGymId }));
        await addExerciseToSession(s.id, ex.id, ge);
        router.push(s.status === "completed" ? `/workout?id=${s.id}` : "/workout");
      } else router.push("/exercise");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={existing ? "编辑动作" : "自定义动作"} subtitle={eq ? `器械：${equipmentTypeName(facts, eq)}` : undefined} />
      <div className="space-y-4">
        <Field label="动作名称">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：单臂绳索Y字上举" autoFocus={!existing} />
        </Field>

        <Opt label="动作类型" value={kind} set={setKind} labels={KIND_LABEL} />
        {cardio ? (
          <p className="text-sm text-muted rounded-xl bg-surface-2 p-3">
            有氧动作按「分钟 / 公里 / 强度」记录，不需要选肌群；有氧时间单独统计，不计入肌群训练量和恢复估计。
          </p>
        ) : (
          <>
            <MusclePicker
              label="主要训练肌群（必选）"
              value={primary}
              onToggle={(id) => toggle(primary, setPrimary, id, secondary, setSecondary)}
            />
            <MusclePicker
              label="辅助训练肌群（可选）"
              value={secondary}
              onToggle={(id) => toggle(secondary, setSecondary, id, primary, setPrimary)}
            />

            <Opt label="左右记录方式" value={lat} set={setLat} labels={LATERALITY_LABEL} hint={lat === "directional" ? "方向性：记录向左/向右，不会把方向当成单侧肌群" : lat === "unilateral" ? "单侧：左右分别记录，左右组数可以不同" : undefined} />
            <Opt label="阻力形式" value={res} set={setRes} labels={RESISTANCE_LABEL} hint={res === "assisted" ? "辅助重量越大越轻松，不会当作普通负重" : undefined} />
            <Opt label="计量方式" value={meas} set={setMeas} labels={MEASUREMENT_LABEL} />

            <p className="text-xs text-faint">主要肌群按 1 组计，辅助肌群按 0.5 组计（估算系数）。</p>
          </>
        )}
        <Button variant="primary" size="lg" block onClick={save} disabled={busy}>
          {existing ? "保存修改" : sessionId || then ? "保存并开始记录" : "保存动作"}
        </Button>
        {existing && (
          <Button
            variant="danger"
            block
            onClick={async () => {
              if (!confirmAsync("删除这个自定义动作？")) return;
              try {
                await deleteCustomExercise(existing.id);
                router.push("/exercise");
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            删除动作
          </Button>
        )}
      </div>
    </div>
  );
}

function Opt<T extends string>({ label, value, set, labels, hint }: { label: string; value: T; set: (v: T) => void; labels: Record<T, string>; hint?: string }) {
  return (
    <div>
      <div className="text-[13px] text-muted mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(labels) as T[]).map((k) => (
          <Chip key={k} active={value === k} onClick={() => set(k)}>
            {labels[k]}
          </Chip>
        ))}
      </div>
      {hint && <div className="text-xs text-faint mt-1">{hint}</div>}
    </div>
  );
}

function MusclePicker({ label, value, onToggle }: { label: string; value: string[]; onToggle: (id: string) => void }) {
  return (
    <div>
      <SectionTitle>{label}</SectionTitle>
      <div className="space-y-2">
        {REGIONS.map((r) => (
          <div key={r.id} className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted w-14 shrink-0">{r.name}</span>
            {MUSCLES.filter((m) => m.region === r.id).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggle(m.id)}
                className={cx("h-8 px-2.5 rounded-full text-[13px] border", value.includes(m.id) ? "bg-accent text-accent-ink border-transparent" : "bg-surface border-line")}
              >
                {m.name}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
