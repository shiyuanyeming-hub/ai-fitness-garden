import type { Exercise, Region } from "@/core/types";
import { MUSCLE_BY_ID } from "@/core/muscles";
import type { Facts } from "@/data/derived";
import type { GymEquipment } from "@/data/db";

/** In-memory version of repo.exercisesForEquipment (works offline from loaded facts). */
export function exercisesForEquipmentType(f: Facts, equipmentTypeId: string, gymEquipmentId?: string | null): Exercise[] {
  const linked = new Set(
    f.links.filter((l) => l.equipmentTypeId === equipmentTypeId && (!l.gymEquipmentId || l.gymEquipmentId === gymEquipmentId)).map((l) => l.exerciseId),
  );
  // The floor/mat has no explicit links: offer the no-equipment strength & core moves.
  const floor = equipmentTypeId === "mat";
  const list = f.exercises.filter((e) => e.equipmentTypes.includes(equipmentTypeId) || linked.has(e.id) || (floor && e.equipmentTypes.length === 0 && e.kind !== "cardio"));
  // custom (user) exercises for this machine first, then by region
  return list.sort((a, b) => Number(b.isCustom) - Number(a.isCustom) || regionOrder(a) - regionOrder(b));
}

const ORDER: Region[] = ["chest", "back", "shoulders", "arms", "core", "legs"];
function regionOrder(e: Exercise) {
  const p = e.muscles.find((m) => m.role === "primary");
  return p ? ORDER.indexOf(MUSCLE_BY_ID[p.muscleId]?.region ?? "legs") : 9;
}

export function primaryRegion(e: Exercise): Region | null {
  const p = e.muscles.find((m) => m.role === "primary");
  return p ? (MUSCLE_BY_ID[p.muscleId]?.region ?? null) : null;
}

export function equipmentName(f: Facts, ge: GymEquipment | undefined | null): string | null {
  if (!ge) return null;
  const t = f.equipmentTypes.find((x) => x.id === ge.equipmentTypeId);
  return ge.customName || t?.name || "器械";
}

export function equipmentTypeName(f: Facts, id: string): string {
  return f.equipmentTypes.find((x) => x.id === id)?.name ?? id;
}

/** Gym machines in the current gym that can be used for this exercise. */
export function machinesFor(f: Facts, ex: Exercise, gymId: string | null): GymEquipment[] {
  const linked = new Set(f.links.filter((l) => l.exerciseId === ex.id).map((l) => l.gymEquipmentId ?? `type:${l.equipmentTypeId}`));
  return f.gymEquipment.filter(
    (g) => g.gymId === gymId && (ex.equipmentTypes.includes(g.equipmentTypeId) || linked.has(g.id) || linked.has(`type:${g.equipmentTypeId}`)),
  );
}

export function muscleNames(e: Exercise, role: "primary" | "secondary"): string {
  if (e.kind === "cardio") return role === "primary" ? "有氧 · 按时间记录" : "";
  return e.muscles
    .filter((m) => m.role === role)
    .map((m) => MUSCLE_BY_ID[m.muscleId]?.name)
    .filter(Boolean)
    .join("、");
}

export function searchExercises(list: Exercise[], q: string, region: Region | "all" | "cardio"): Exercise[] {
  const t = q.trim().toLowerCase();
  return list.filter((e) => {
    if (region === "cardio") {
      if (e.kind !== "cardio") return false;
    } else if (region !== "all" && primaryRegion(e) !== region) return false;
    if (!t) return true;
    return [e.name, e.nameJa, e.nameEn, e.id].some((s) => s?.toLowerCase().includes(t)) || e.muscles.some((m) => MUSCLE_BY_ID[m.muscleId]?.name.includes(t));
  });
}
