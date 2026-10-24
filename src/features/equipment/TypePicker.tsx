"use client";
import { useMemo, useState } from "react";
import { Button, Card, Chip, Field, TextInput, cx, useToast } from "@/components/ui";
import { useAppReady } from "@/features/app-data";
import { CATEGORY_LABEL, type EquipmentType } from "@/data/seed/equipment";
import { createCustomCardioEquipment, createCustomEquipmentType } from "@/data/repo";

type Filter = "all" | "strength" | "free" | "cardio";
const FILTERS: { v: Filter; label: string }[] = [
  { v: "all", label: "全部" },
  { v: "strength", label: "力量器械" },
  { v: "free", label: "自由重量/徒手" },
  { v: "cardio", label: "有氧" },
];
const inFilter = (t: EquipmentType, f: Filter) =>
  f === "all" ||
  (f === "cardio" && t.category === "cardio") ||
  (f === "strength" && (t.category === "machine" || t.category === "cable")) ||
  (f === "free" && ["free_weight", "rack", "bodyweight", "accessory"].includes(t.category));

type NewKind = "cardio" | "multi" | "fixed";

/**
 * Searchable equipment-type list with category filters, plus "create a new type".
 * Creating a cardio type also creates its cardio exercise, so the flow never stalls on
 * "pick an exercise" for machines like a spin bike. `onPick` gets that exercise id as a preselection.
 */
export function TypePicker({ onPick, query: initialQuery = "" }: { onPick: (t: EquipmentType, preselectExerciseId?: string) => void | Promise<void>; query?: string }) {
  const { facts } = useAppReady();
  const toast = useToast();
  const [q, setQ] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NewKind | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return facts.equipmentTypes.filter((x) => inFilter(x, filter) && (!t || [x.name, x.nameJa, x.nameEn].some((s) => s?.toLowerCase().includes(t))));
  }, [facts.equipmentTypes, q, filter]);

  const create = async () => {
    if (!name.trim()) return toast("请输入器械名称", "error");
    if (!kind) return toast("请选择器械类型", "error");
    setBusy(true);
    try {
      if (kind === "cardio") {
        const { type, exercise } = await createCustomCardioEquipment(name);
        await onPick(type, exercise.id);
      } else {
        const t = await createCustomEquipmentType(name, kind === "multi" ? "cable" : "machine", kind === "multi");
        await onPick(t);
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <TextInput placeholder="搜索器械（中文 / 日本語 / English）" value={q} onChange={(e) => setQ(e.target.value)} data-testid="type-search" />
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
        {FILTERS.map((f) => (
          <Chip key={f.v} active={filter === f.v} onClick={() => setFilter(f.v)}>
            {f.label}
          </Chip>
        ))}
      </div>
      <div className="space-y-1.5">
        {list.map((t) => (
          <button key={t.id} className="w-full text-left rounded-2xl border border-line bg-surface p-3" onClick={() => onPick(t)}>
            <div className="font-medium">{t.name}</div>
            <div className="text-xs text-muted">
              {CATEGORY_LABEL[t.category] ?? ""}
              {t.nameJa ? ` · ${t.nameJa}` : ""}
              {t.isMultifunctional ? " · 多功能" : ""}
              {"isCustom" in t && t.isCustom ? " · 自定义" : ""}
            </div>
          </button>
        ))}
        {!list.length && <div className="text-sm text-muted text-center py-3">没有找到「{q}」，可以在下面创建。</div>}
      </div>

      {!creating ? (
        <Button
          block
          variant="soft"
          onClick={() => {
            setCreating(true);
            if (!name && q) setName(q);
          }}
          data-testid="create-type"
        >
          ＋ 库里没有？创建新的器械类型
        </Button>
      ) : (
        <Card className="space-y-3">
          <Field label="器械名称">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：动感单车、胸推/划船二合一机" data-testid="new-type-name" />
          </Field>
          <div>
            <div className="text-sm font-medium mb-1.5">这是什么类型的器械？</div>
            <div className="space-y-1.5">
              {(
                [
                  { v: "cardio", t: "有氧器械", d: "单车、跑步机、椭圆机等。按时间/距离记录，不需要选动作" },
                  { v: "multi", t: "多功能力量器械", d: "能做很多动作（如综合训练器），接下来选择或创建动作" },
                  { v: "fixed", t: "固定动作力量器械", d: "只做一个动作的机器，接下来选择或创建这个动作" },
                ] as { v: NewKind; t: string; d: string }[]
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setKind(o.v)}
                  className={cx("w-full text-left rounded-2xl border p-3", kind === o.v ? "border-accent bg-accent-soft" : "border-line bg-surface")}
                  data-testid={`new-type-${o.v}`}
                >
                  <div className="font-medium text-sm">{o.t}</div>
                  <div className="text-xs text-muted mt-0.5">{o.d}</div>
                </button>
              ))}
            </div>
          </div>
          <Button variant="primary" block onClick={create} disabled={busy} data-testid="create-type-confirm">
            创建并继续
          </Button>
        </Card>
      )}
    </div>
  );
}
