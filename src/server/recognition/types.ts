export interface CatalogItem {
  id: string;
  name: string;
  nameEn?: string;
  cues?: string;
}

export interface ExerciseHint {
  id: string;
  nameEn: string;
  equipmentTypes: string[];
}

export interface RecognitionRequest {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  hash: string;
  catalog: CatalogItem[];
  exercises: ExerciseHint[];
}

export interface EquipmentCandidate {
  equipmentTypeId: string; // a catalog id, or "unknown"
  displayName: string;
  confidence: number; // 0–1
}

export interface RecognitionResult {
  candidates: EquipmentCandidate[];
  brand: string | null;
  brandConfidence: "confirmed" | "likely" | "unknown";
  modelText: string | null;
  visibleText: string[];
  isMultifunctional: boolean;
  attachments: string[];
  likelyExerciseIds: string[];
  uncertaintyNote: string;
  peoplePresent: boolean;
}

export interface RecognitionProvider {
  name: string;
  model: string;
  recognize(req: RecognitionRequest, signal: AbortSignal): Promise<RecognitionResult>;
}

export class RecognitionError extends Error {
  constructor(
    public code: "not_configured" | "unauthorized" | "bad_request" | "timeout" | "upstream" | "invalid_output",
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}
