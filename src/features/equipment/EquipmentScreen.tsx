"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useAppReady } from "@/features/app-data";
import { Button, Card, Chip, Field, PageHeader, Segmented, Sheet, TextInput, confirmAsync, cx, useToast } from "@/components/ui";
import { TypePicker } from "./TypePicker";
import { PhotoThumb, usePhotoUrl } from "./PhotoThumb";
import { equipmentName, exercisesForEquipmentType, muscleNames, primaryRegion } from "@/features/catalog";
import { addGymEquipment, deleteGymEquipment, deletePhoto, savePhoto, updateGymEquipment, updateProfile } from "@/data/repo";
import { prepareImage } from "@/features/recognition/client";
import { REGIONS, REGION_NAME } from "@/core/muscles";
import { isAvailable } from "@/core/recommendation/substitution";
import { summarizePerformance } from "@/core/recommendation/progression";
import { toDateKey } from "@/core/time";
import type { Region } from "@/core/types";

export function EquipmentScreen() {
  const { facts, derived } = useAppReady();
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "fav">("all");
  const [adding, setAdding] = useState(params.get("add") === "1");
  const detailId = params.get("id");
  const gymId = facts.profile.currentGymId;
  const gym = facts.gyms.find((g) => g.id === gymId);
  const list = facts.gymEquipment
    .filter((g) => g.gymId === gymId && (filter === "all" || g.isFavorite))
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt));

  const trainable = useMemo(() => {
    const av = derived.availability;
    const regions = new Map<Region, number>();
    for (const e of facts.exercises) {
      if (av.unknown || !isAvailable(e, av) || e.equipmentTypes.length === 0) continue;
      const r = primaryRegion(e);
      if (r) regions.set(r, (regions.get(r) ?? 0) + 1);
    }
    return regions;
  }, [facts.exercises, derived.availability]);

  return (
    <div>
      <PageHeader
        title="器械库"
        subtitle={
          <span>
            当前健身房：
            <select
              className="bg-transparent text-accent font-medium"
              value={gymId ?? ""}
              onChange={(e) => updateProfile({ currentGymId: e.target.value })}
              aria-label="切换健身房"
            >
              {facts.gyms.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Link href="/scan" className="rounded-2xl bg-accent text-accent-ink h-12 grid place-items-center font-medium">
          📷 拍照添加
        </Link>
        <Button size="lg" className="!h-12" onClick={() => setAdding(true)}>
          ＋ 手动添加
        </Button>
      </div>

      <Card className="mt-3 !p-3">
        <div className="text-[13px] text-muted mb-1.5">{gym?.name ?? "当前健身房"}可练的部位</div>
        {derived.availability.unknown ? (
          <div className="text-sm text-muted">还没有登记器械。登记后这里会显示可以训练的部位，推荐也会只用你健身房有的器械。</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((r) => (
              <span key={r.id} className={cx("text-xs rounded-full px-2.5 py-1 border", trainable.get(r.id) ? "border-accent text-accent" : "border-line text-faint line-through")}>
                {r.name} {trainable.get(r.id) ?? 0}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Segmented
        className="mt-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: `全部 ${facts.gymEquipment.filter((g) => g.gymId === gymId).length}` },
          { value: "fav", label: "★ 收藏" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        {list.map((g) => {
          const n = exercisesForEquipmentType(facts, g.equipmentTypeId, g.id).length;
          return (
            <button key={g.id} onClick={() => router.push(`/equipment?id=${g.id}`)} className="card overflow-hidden text-left">
              <div className="relative">
                <PhotoThumb photoId={g.photoId ?? null} fill rounded="rounded-none" />
                <div className="absolute inset-0" />
                {g.isFavorite && <span className="absolute top-2 right-2 text-gradual text-lg drop-shadow">★</span>}
                {!g.isAvailable && <span className="absolute top-2 left-2 text-[11px] bg-attention text-white rounded-full px-2">暂不可用</span>}
              </div>
              <div className="p-2.5">
                <div className="font-medium text-sm truncate">{equipmentName(facts, g)}</div>
                <div className="text-[11px] text-muted">
                  {n} 个动作 · {g.lastUsedAt ? `最近 ${toDateKey(g.lastUsedAt, facts.profile.timeZone).slice(5)}` : "未使用"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!list.length && <div className="text-center text-sm text-muted py-8">{filter === "fav" ? "还没有收藏的器械" : "拍照或手动添加第一台器械"}</div>}
      <Link href="/exercise" className="block text-center text-sm text-accent mt-6">
        浏览全部动作库 ›
      </Link>

      <AddSheet open={adding} onClose={() => setAdding(false)} />
      <DetailSheet id={detailId} onClose={() => router.replace("/equipment")} />
    </div>
  );
}

function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { facts } = useAppReady();
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="手动添加器械">
      <TypePicker
        onPick={async (t) => {
          if (!facts.profile.currentGymId) return;
          await addGymEquipment({ gymId: facts.profile.currentGymId, equipmentTypeId: t.id });
          toast(`已添加「${t.name}」`, "success");
          onClose();
        }}
      />
    </Sheet>
  );
}

function DetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { facts } = useAppReady();
  const g = facts.gymEquipment.find((x) => x.id === id);
  return (
    <Sheet open={!!g} onClose={onClose} title={g ? equipmentName(facts, g) : ""}>
      {g && <Detail key={g.id} geId={g.id} onDeleted={onClose} />}

    </Sheet>
  );
}

function Detail({ geId, onDeleted }: { geId: string; onDeleted: () => void }) {
  const { facts, derived } = useAppReady();
  const toast = useToast();
  const g = facts.gymEquipment.find((x) => x.id === geId)!;
  const type = facts.equipmentTypes.find((t) => t.id === g.equipmentTypeId);
  const url = usePhotoUrl(g.photoId, true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(g.customName ?? "");
  const [brand, setBrand] = useState(g.brand ?? "");
  const exercises = exercisesForEquipmentType(facts, g.equipmentTypeId, g.id);
  const tz = facts.profile.timeZone;
  const recent = Object.entries(derived.perfs)
    .flatMap(([exId, ps]) => ps.filter((p) => p.gymEquipmentId === g.id).map((p) => ({ exId, p })))
    .sort((a, b) => b.p.at.localeCompare(a.p.at))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="relative rounded-3xl overflow-hidden bg-surface-2 aspect-[4/3] grid place-items-center">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="器械照片" className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl">🏋️</span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const p = await prepareImage(f);
          const old = g.photoId;
          const pid = await savePhoto(p.blob, p.thumb, p.hash);
          await updateGymEquipment(g.id, { photoId: pid });
          if (old) await deletePhoto(old);
          toast("照片已更换");
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          {g.photoId ? "更换照片" : "添加照片"}
        </Button>
        {g.photoId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await deletePhoto(g.photoId!);
              toast("照片及其识别记录已删除");
            }}
          >
            删除照片
          </Button>
        )}
        <div className="flex-1" />
        <Chip active={g.isFavorite} onClick={() => updateGymEquipment(g.id, { isFavorite: !g.isFavorite })}>
          {g.isFavorite ? "★ 已收藏" : "☆ 收藏"}
        </Chip>
      </div>

      <div className="text-xs text-muted">
        类别：{type?.name ?? g.equipmentTypeId} {type?.isMultifunctional ? "· 多功能器械" : "· 固定器械"} · 所属：{facts.gyms.find((x) => x.id === g.gymId)?.name}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="名称（可选）">
          <TextInput value={name} placeholder={type?.name} onChange={(e) => setName(e.target.value)} onBlur={() => updateGymEquipment(g.id, { customName: name.trim() || undefined })} />
        </Field>
        <Field label="品牌（可选）">
          <TextInput value={brand} onChange={(e) => setBrand(e.target.value)} onBlur={() => updateGymEquipment(g.id, { brand: brand.trim() || undefined })} />
        </Field>
      </div>

      <div>
        <div className="text-[13px] text-muted mb-1.5">可执行动作（点击开始记录）</div>
        <div className="space-y-1.5">
          {exercises.map((e) => (
            <Link key={e.id} href={`/workout?add=${e.id}&ge=${g.id}`} className="flex items-center justify-between rounded-2xl border border-line p-3">
              <span>
                <span className="font-medium">{e.name}</span>
                <span className="block text-xs text-muted">
                  {e.kind === "cardio" ? "有氧 · 按时间记录" : `${REGION_NAME[primaryRegion(e) ?? "core"]} · ${muscleNames(e, "primary")}`}
                </span>
              </span>
              <span className="text-accent text-sm">记录 ›</span>
            </Link>
          ))}
          <Link href={`/exercise?new=1&eq=${g.equipmentTypeId}&ge=${g.id}`} className="block text-center rounded-2xl border border-dashed border-line p-3 text-sm text-muted">
            ＋ 为这台器械添加自定义动作
          </Link>
        </div>
      </div>

      <div>
        <div className="text-[13px] text-muted mb-1.5">最近在这台器械上的记录</div>
        {recent.length ? (
          recent.map(({ exId, p }) => (
            <div key={p.sessionId + exId} className="text-sm py-1 flex justify-between gap-2">
              <span className="text-muted shrink-0">{toDateKey(p.at, tz).slice(5)}</span>
              <span className="truncate">{derived.exerciseById[exId]?.name}</span>
              <span className="text-right">{summarizePerformance(p)}</span>
            </div>
          ))
        ) : (
          <div className="text-sm text-faint">还没有记录</div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button className="flex-1" onClick={() => updateGymEquipment(g.id, { isAvailable: !g.isAvailable })}>
          {g.isAvailable ? "标记暂不可用" : "标记可用"}
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          onClick={async () => {
            if (!confirmAsync("删除这台器械卡片？过去的训练记录会保留。")) return;
            await deleteGymEquipment(g.id);
            onDeleted();
          }}
        >
          删除器械
        </Button>
      </div>
    </div>
  );
}
