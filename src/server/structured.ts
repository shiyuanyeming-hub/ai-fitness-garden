import type Anthropic from "@anthropic-ai/sdk";

/**
 * Get a structured object from the model without relying on forced tool_choice
 * (some models reject tool_choice "tool"/"any" with a 400).
 *
 * 1. tools + tool_choice auto, instructed to call the tool → take tool_use input,
 *    or a JSON object if the model answered in text instead.
 * 2. If that is rejected (400) or yields nothing: no tools, ask for a bare JSON object.
 * Non-400 errors (auth, rate limit, timeout…) are thrown immediately.
 */
export interface StructuredTool {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

type Content = string | Anthropic.Messages.ContentBlockParam[];

export class NoStructuredOutput extends Error {}

export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function withInstruction(content: Content, instruction: string): Content {
  if (typeof content === "string") return `${content}\n\n${instruction}`;
  return [...content, { type: "text", text: instruction }];
}

export async function structuredCall(
  client: Pick<Anthropic, "messages">,
  opts: { model: string; system: string; tool: StructuredTool; content: Content; maxTokens: number; signal?: AbortSignal; log?: string },
): Promise<unknown> {
  const { model, system, tool, content, maxTokens, signal } = opts;
  let lastErr: unknown = null;

  try {
    const msg = await client.messages.create(
      { model, max_tokens: maxTokens, system, tools: [tool as Anthropic.Messages.Tool], messages: [{ role: "user", content: withInstruction(content, `请调用 ${tool.name} 工具给出结果，不要只用文字回答。`) }] },
      { signal },
    );
    const b = msg.content.find((x) => x.type === "tool_use");
    if (b && b.type === "tool_use") return b.input;
    const fromText = extractJsonObject(msg.content.map((x) => (x.type === "text" ? x.text : "")).join(""));
    if (fromText) return fromText;
  } catch (e) {
    const status = (e as { status?: number }).status;
    console.error(`[${opts.log ?? "ai"}] tool mode failed`, status, (e as Error).message);
    if (signal?.aborted || status !== 400) throw e;
    lastErr = e;
  }

  try {
    const msg = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system: `${system}\n\n只输出一个 JSON 对象，不要任何其他文字或代码块标记。JSON 字段（JSON Schema）：${JSON.stringify(tool.input_schema)}`,
        messages: [{ role: "user", content }],
      },
      { signal },
    );
    const obj = extractJsonObject(msg.content.map((x) => (x.type === "text" ? x.text : "")).join(""));
    if (obj) return obj;
  } catch (e) {
    console.error(`[${opts.log ?? "ai"}] json mode failed`, (e as { status?: number }).status, (e as Error).message);
    throw e;
  }
  if (lastErr) throw lastErr;
  throw new NoStructuredOutput("AI 没有返回结构化结果");
}
