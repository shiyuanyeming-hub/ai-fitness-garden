import type { AiConfig } from "../ai";
import { classifyUpstream } from "../ai-errors";
import { sanitizeAdvice } from "./sanitize";
import type { CoachAdvice, CoachInput } from "./types";

const TOOL = {
  name: "daily_advice",
  description: "Give today's training advice for this user.",
  input_schema: {
    type: "object" as const,
    properties: {
      day_type: { type: "string", enum: ["train", "light", "rest"], description: "train = normal session, light = reduced volume, rest = no lifting today" },
      headline: { type: "string", description: "≤ 20 Chinese characters, what to do today" },
      summary: { type: "string", description: "2–4 short sentences in Simplified Chinese explaining the plan in plain words, grounded in the data" },
      focus_regions: { type: "array", items: { type: "string", enum: ["chest", "back", "shoulders", "arms", "core", "legs"] } },
      exercises: {
        type: "array",
        description: "0–6 exercises, in the order to do them. exercise_id MUST be from candidates.",
        items: {
          type: "object",
          properties: {
            exercise_id: { type: "string" },
            sets: { type: "integer", description: "working sets, 1–5" },
            note: { type: "string", description: "≤ 30 Chinese characters, why or how (no weights)" },
          },
          required: ["exercise_id", "sets", "note"],
        },
      },
      reasons: { type: "array", items: { type: "string" }, description: "≤ 4 short Chinese bullet reasons that cite the data (recovery, weekly sets vs target, habits)" },
      cautions: { type: "array", items: { type: "string" }, description: "≤ 3 short Chinese cautions; empty if none" },
      habit_tip: { type: "string", description: "one short Chinese sentence about the user's training habits (frequency, timing, consistency, balance); empty if nothing useful" },
    },
    required: ["day_type", "headline", "summary", "focus_regions", "exercises", "reasons", "cautions", "habit_tip"],
  },
};

const SYSTEM = `你是一个谨慎、务实的个人力量训练教练，为一位用户给出「今天」的训练建议。用户的数据由一个确定性规则引擎计算后提供给你。

规则：
- 只根据提供的数据判断；不要编造用户没有的历史、伤病或数字。数据少时直说「记录还少」。
- 恢复状态是「透明的估计」而不是生理测量。状态为「恢复中」或「需要关注」的部位，今天不要安排它作为主要目标肌群；「逐渐恢复」的部位只能少量、保守。
- 不要鼓励过度训练：疲劳/睡眠差、连续多天训练、本周已达到目标上限时，减少训练量或建议休息/轻松活动。
- 优先照顾用户设为「重点」的部位，其次「维持」；「暂不优先」的部位不要主动安排。
- 结合训练习惯：每周频率、通常训练时长、常做的动作、多久没练。给出现实可执行的建议（总组数要符合用户每次可用的时间，约每组 2.5–3 分钟）。
- 动作只能从 candidates 里选 exercise_id；优先 familiar=true 的动作以便比较进步；primaryFatigued=true 的动作尽量不选。
- 绝对不要给出重量数字；次数、重量由 App 的规则计算。sets 是正式组数。
- 规则引擎也给了一个建议（rule），你可以采纳、调整或否定，但要在 reasons 里说明理由。
- 有伤痛/限制描述时要尊重它，必要时在 cautions 提醒，但不要做医疗诊断。
- 全部用简体中文，语气直接、简短、不说空话，不用感叹号堆砌。`;

export function mockAdvice(input: CoachInput): CoachAdvice {
  const raw = {
    day_type: input.rule.restDay ? "rest" : "train",
    headline: input.rule.restDay ? "今天休息，明天再练" : `今天练${input.rule.exercises.map((e) => e.region).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join("+")}`,
    summary: "模拟结果：根据恢复估计和本周训练量给出的建议。",
    focus_regions: [],
    exercises: input.rule.exercises.map((e) => ({ exercise_id: e.id, sets: e.sets, note: "模拟说明" })),
    reasons: ["模拟：本周该部位训练量还没达到目标"],
    cautions: [],
    habit_tip: `模拟：你最近 4 周平均每周训练 ${input.habits.avgSessionsPerWeek} 次。`,
  };
  return sanitizeAdvice(raw, input);
}

export class CoachError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function generateAdvice(cfg: AiConfig, input: CoachInput, signal?: AbortSignal): Promise<CoachAdvice> {
  if (cfg.mode === "mock") {
    if (process.env.RECOGNITION_MOCK_FAIL === "1") throw new CoachError("upstream", "模拟：AI 服务暂时不可用");
    return mockAdvice(input);
  }
  let msg;
  try {
    msg = await cfg.client.messages.create(
      {
        model: cfg.model,
        max_tokens: 1200,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: `以下是用户今天的数据（JSON）：\n${JSON.stringify(input)}\n\n请给出今天的建议。` }],
      },
      { signal },
    );
  } catch (e) {
    console.error("[coach] upstream", (e as { status?: number }).status, (e as Error).message);
    const p = classifyUpstream(e, signal?.aborted);
    throw new CoachError(p.code, p.message);
  }
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new CoachError("invalid_output", "AI 没有返回结构化建议");
  return sanitizeAdvice(block.input, input);
}
