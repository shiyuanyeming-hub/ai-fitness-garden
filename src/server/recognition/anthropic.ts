import Anthropic from "@anthropic-ai/sdk";
import { RecognitionError, type RecognitionProvider, type RecognitionRequest } from "./types";
import { sanitizeResult } from "./sanitize";

const TOOL = {
  name: "report_equipment",
  description: "Report what gym equipment is visible in the photo.",
  input_schema: {
    type: "object" as const,
    properties: {
      equipment_candidates: {
        type: "array",
        description: "1–3 best guesses for the MAIN machine/equipment in the photo, most likely first.",
        items: {
          type: "object",
          properties: {
            equipment_type_id: { type: "string", description: "id from the catalog, or 'unknown' if none fits" },
            display_name: { type: "string", description: "short Chinese name for this specific machine" },
            confidence: { type: "number", description: "0–1, honest calibrated confidence" },
          },
          required: ["equipment_type_id", "display_name", "confidence"],
        },
      },
      brand: { type: ["string", "null"], description: "brand only if a logo/label is legible, else null" },
      brand_confidence: { type: "string", enum: ["confirmed", "likely", "unknown"] },
      model_text: { type: ["string", "null"], description: "model name printed on the machine, if legible" },
      visible_text: { type: "array", items: { type: "string" }, description: "legible labels/instruction text on the machine (max 8)" },
      is_multifunctional: { type: "boolean", description: "true if this machine supports many different exercises (e.g. cable towers)" },
      attachments: { type: "array", items: { type: "string" }, description: "visible handles/attachments (rope, V-bar, straight bar, single handle...)" },
      likely_exercise_ids: {
        type: "array",
        items: { type: "string" },
        description: "exercise ids from the provided list that this machine supports, ordered by visual evidence (e.g. attached handle). These are only hints; the user chooses.",
      },
      uncertainty_note: { type: "string", description: "one short Chinese sentence about what is uncertain, or empty string" },
      people_present: { type: "boolean", description: "true if any person is visible. Do NOT describe them." },
    },
    required: [
      "equipment_candidates",
      "brand",
      "brand_confidence",
      "is_multifunctional",
      "likely_exercise_ids",
      "uncertainty_note",
      "people_present",
      "visible_text",
      "attachments",
      "model_text",
    ],
  },
};

const SYSTEM = `You identify gym equipment from a photo for a personal training log.
Rules:
- Identify the equipment itself (structure, pulleys, movement path, seat/pads, labels, logos, weight stack, handles).
- Use catalog ids when one fits; otherwise "unknown" with a descriptive Chinese display_name.
- Be honest about uncertainty; lower confidence when the photo is partial, blurry or ambiguous.
- NEVER infer how much weight the user lifts from plates or pins visible in the photo.
- Do not pick a single exercise as "done": likely_exercise_ids are only ordering hints.
- If people are visible, ignore them entirely; never describe faces, bodies or identities.
- Only report brand as "confirmed" if the logo/text is clearly legible.`;

export function anthropicProvider(apiKey: string, model: string): RecognitionProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 45_000 });
  return {
    name: "anthropic",
    model,
    async recognize(req: RecognitionRequest, signal: AbortSignal) {
      const catalog = req.catalog.map((c) => `${c.id}: ${c.nameEn ?? ""} / ${c.name}${c.cues ? ` — ${c.cues}` : ""}`).join("\n");
      const exercises = req.exercises.map((e) => `${e.id} (${e.nameEn}) [${e.equipmentTypes.join(",")}]`).join("\n");
      let msg;
      try {
        msg = await client.messages.create(
          {
            model,
            max_tokens: 900,
            system: SYSTEM,
            tools: [TOOL],
            tool_choice: { type: "tool", name: TOOL.name },
            messages: [
              {
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: req.mediaType, data: req.imageBase64 } },
                  { type: "text", text: `Equipment catalog (id: name — cues):\n${catalog}\n\nExercise list (id (name) [equipment ids]):\n${exercises}\n\nIdentify the equipment.` },
                ],
              },
            ],
          },
          { signal },
        );
      } catch (e) {
        if (signal.aborted) throw new RecognitionError("timeout", "识别超时，请重试或手动登记", 504);
        const status = (e as { status?: number }).status;
        if (status === 401 || status === 403) throw new RecognitionError("upstream", "AI 服务密钥无效或无权限", 502);
        throw new RecognitionError("upstream", "AI 服务暂时不可用，请稍后重试或手动登记", 502);
      }
      const block = msg.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") throw new RecognitionError("invalid_output", "AI 没有返回结构化结果", 502);
      return sanitizeResult(block.input, req);
    },
  };
}
