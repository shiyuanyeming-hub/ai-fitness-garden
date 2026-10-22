import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "./recognition";

/** Server-only AI configuration shared by the test and coach routes. The key never leaves the server. */
export type AiConfig = { mode: "mock"; model: "mock" } | { mode: "anthropic"; model: string; client: Anthropic };

export function aiConfig(): AiConfig | null {
  if (process.env.RECOGNITION_PROVIDER === "mock") return { mode: "mock", model: "mock" };
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.COACH_MODEL?.trim() || process.env.RECOGNITION_MODEL?.trim() || DEFAULT_MODEL;
  return { mode: "anthropic", model, client: new Anthropic({ apiKey: key, maxRetries: 1, timeout: 40_000 }) };
}
