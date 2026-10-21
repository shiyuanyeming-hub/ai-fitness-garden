import { anthropicProvider } from "./anthropic";
import { RecognitionError, type RecognitionProvider, type RecognitionRequest, type RecognitionResult } from "./types";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/**
 * Deterministic provider for local testing / E2E (RECOGNITION_PROVIDER=mock).
 * Images whose hash starts with "fail" simulate an upstream error.
 */
function mockProvider(): RecognitionProvider {
  return {
    name: "mock",
    model: "mock",
    async recognize(req) {
      await new Promise((r) => setTimeout(r, 300));
      if (req.hash.startsWith("fail") || process.env.RECOGNITION_MOCK_FAIL === "1")
        throw new RecognitionError("upstream", "模拟：AI 服务暂时不可用", 502);
      return {
        candidates: [
          { equipmentTypeId: "functional_trainer", displayName: "双滑轮功能训练器", confidence: 0.82 },
          { equipmentTypeId: "single_cable", displayName: "单滑轮绳索站", confidence: 0.12 },
        ],
        brand: null,
        brandConfidence: "unknown",
        modelText: null,
        visibleText: [],
        isMultifunctional: true,
        attachments: ["单手柄"],
        likelyExerciseIds: ["cable_lateral_raise_single", "cable_fly", "cable_pushdown"].filter((id) => req.exercises.some((e) => e.id === id)),
        uncertaintyNote: "模拟结果：可能是双滑轮训练器，请确认。",
        peoplePresent: false,
      };
    },
  };
}

export function getProvider(): RecognitionProvider | null {
  if (process.env.RECOGNITION_PROVIDER === "mock") return mockProvider();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return anthropicProvider(key, process.env.RECOGNITION_MODEL || DEFAULT_MODEL);
}

// Small in-memory cache (per server instance) to avoid paying twice for the same image.
const cache = new Map<string, RecognitionResult>();
const MAX_CACHE = 200;

export async function recognizeWithCache(provider: RecognitionProvider, req: RecognitionRequest, timeoutMs = 40_000) {
  const key = `${provider.model}:${req.hash}`;
  const hit = cache.get(key);
  if (hit) return { result: hit, cached: true };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const result = await provider.recognize(req, ctl.signal);
    cache.set(key, result);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
    return { result, cached: false };
  } finally {
    clearTimeout(timer);
  }
}

export { RecognitionError };
