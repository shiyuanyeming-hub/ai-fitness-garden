import type { RecognitionRequest, RecognitionResult } from "./types";

/** Never trust model output blindly: keep only known ids, clamp numbers, cap lengths. */
export function sanitizeResult(raw: unknown, req: Pick<RecognitionRequest, "catalog" | "exercises">): RecognitionResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const known = new Set(req.catalog.map((c) => c.id));
  const exIds = new Set(req.exercises.map((e) => e.id));
  const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : null);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const clamp = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  };

  const seen = new Set<string>();
  const candidates = arr(o.equipment_candidates)
    .map((c) => {
      const x = (c ?? {}) as Record<string, unknown>;
      const id = typeof x.equipment_type_id === "string" && known.has(x.equipment_type_id) ? x.equipment_type_id : "unknown";
      return { equipmentTypeId: id, displayName: str(x.display_name, 60) ?? "未知器械", confidence: clamp(x.confidence) };
    })
    .filter((c) => {
      const k = c.equipmentTypeId === "unknown" ? `u:${c.displayName}` : c.equipmentTypeId;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  const bc = o.brand_confidence;
  return {
    candidates,
    brand: str(o.brand, 60),
    brandConfidence: bc === "confirmed" || bc === "likely" ? bc : "unknown",
    modelText: str(o.model_text, 80),
    visibleText: arr(o.visible_text).map((t) => str(t, 80)).filter((t): t is string => !!t).slice(0, 8),
    isMultifunctional: o.is_multifunctional === true,
    attachments: arr(o.attachments).map((t) => str(t, 40)).filter((t): t is string => !!t).slice(0, 6),
    likelyExerciseIds: arr(o.likely_exercise_ids).filter((id): id is string => typeof id === "string" && exIds.has(id)).slice(0, 6),
    uncertaintyNote: str(o.uncertainty_note, 200) ?? "",
    peoplePresent: o.people_present === true,
  };
}
