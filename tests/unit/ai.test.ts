import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkToken, normalizeToken } from "@/server/auth";
import { classifyUpstream } from "@/server/ai-errors";
import { sanitizeAdvice } from "@/server/coach/sanitize";
import { POST as TEST } from "@/app/api/ai/test/route";
import { POST as COACH } from "@/app/api/coach/route";
import { GET as STATUS } from "@/app/api/recognize/route";
import { FitnessDB, setDb, db } from "@/data/db";
import * as repo from "@/data/repo";
import { computeDerived, loadFacts } from "@/data/derived";
import { buildCoachInput, coachInputHash } from "@/features/ai/coach-input";
import type { CoachInput } from "@/server/coach/types";

const withToken = (t?: string) => new Request("http://x/api", { method: "POST", headers: t != null ? { "x-app-token": t } : {} });

afterEach(() => {
  delete process.env.APP_ACCESS_TOKEN;
  delete process.env.RECOGNITION_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("访问口令：看不见的差异不应导致失败", () => {
  it("全角字符、首尾空白/换行、零宽字符被规范化", () => {
    expect(normalizeToken("ａｂｃ１２３")).toBe("abc123");
    expect(normalizeToken(" abc123\n")).toBe("abc123");
    expect(normalizeToken("abc​123")).toBe("abc123");
  });
  it("服务器变量带换行、手机用全角输入 → 仍然匹配", () => {
    process.env.APP_ACCESS_TOKEN = "Garden2026\n";
    expect(checkToken(withToken(encodeURIComponent("Ｇａｒｄｅｎ２０２６")))).toBe("ok");
    expect(checkToken(withToken("Garden2026"))).toBe("ok"); // old clients send raw
  });
  it("区分「没填」和「不一致」，大小写仍然敏感", () => {
    process.env.APP_ACCESS_TOKEN = "Garden2026";
    expect(checkToken(withToken())).toBe("missing");
    expect(checkToken(withToken("garden2026"))).toBe("mismatch");
    delete process.env.APP_ACCESS_TOKEN;
    expect(checkToken(withToken())).toBe("not_required");
  });
  it("非 ASCII 口令经 URI 编码后可用", () => {
    process.env.APP_ACCESS_TOKEN = "健身花园";
    expect(checkToken(withToken(encodeURIComponent("健身花园")))).toBe("ok");
  });
  it("状态接口报告口令问题的类型", async () => {
    process.env.APP_ACCESS_TOKEN = "abc";
    process.env.RECOGNITION_PROVIDER = "mock";
    const j = await (await STATUS(new Request("http://x", { headers: { "x-app-token": "abd" } }))).json();
    expect(j).toMatchObject({ configured: true, tokenOk: false, token: "mismatch" });
  });
});

describe("测试 AI 连接", () => {
  it("没配 Key → 指出是 Key 的问题", async () => {
    const j = await (await TEST(withToken())).json();
    expect(j.ok).toBe(false);
    expect(j.steps.at(-1)).toMatchObject({ id: "key", ok: false });
  });
  it("口令错误 → 401 并指出是口令问题", async () => {
    process.env.RECOGNITION_PROVIDER = "mock";
    process.env.APP_ACCESS_TOKEN = "abc";
    const r = await TEST(withToken("xyz"));
    expect(r.status).toBe(401);
    expect((await r.json()).steps.at(-1)).toMatchObject({ id: "token", ok: false });
  });
  it("一切正常 → 四步全部通过", async () => {
    process.env.RECOGNITION_PROVIDER = "mock";
    process.env.APP_ACCESS_TOKEN = "abc";
    const j = await (await TEST(withToken("abc"))).json();
    expect(j.ok).toBe(true);
    expect(j.steps.map((s: { id: string }) => s.id)).toEqual(["server", "key", "token", "call"]);
  });
  it("上游错误被翻译成可操作的提示", () => {
    expect(classifyUpstream({ status: 401 }).code).toBe("key_invalid");
    expect(classifyUpstream({ status: 400, message: "Your credit balance is too low" }).code).toBe("no_credit");
    expect(classifyUpstream({ status: 429 }).code).toBe("rate_limited");
    expect(classifyUpstream({ status: 529 }).code).toBe("overloaded");
  });
});

describe("AI 每日建议", () => {
  let n = 0;
  beforeEach(async () => {
    setDb(new FitnessDB(`ai-test-${++n}`));
    await db().open();
    const gym = await repo.saveGym({ name: "Gym", isDefault: true });
    await db().profile.put({ ...repo.defaultProfile(), currentGymId: gym.id });
  });

  async function input(): Promise<CoachInput> {
    const s = await repo.startSession({ gymId: null, startedAt: new Date(Date.now() - 20 * 3600_000).toISOString(), backfill: true });
    const we = await repo.addExerciseToSession(s.id, "barbell_bench_press", null, { prefill: { sets: 3, reps: 10, load: 40 } });
    for (const r of await db().sets.where("workoutExerciseId").equals(we.id).toArray()) await repo.completeSet(r.id);
    await repo.finishSession(s.id, new Date(Date.now() - 19 * 3600_000).toISOString());
    const f = (await loadFacts())!;
    return buildCoachInput(f, computeDerived(f, Date.now()), Date.now());
  }

  it("输入只来自真实记录与规则引擎：习惯、最近训练、恢复状态", async () => {
    const i = await input();
    expect(i.habits.totalSessions).toBe(1);
    expect(i.recent[0].exercises[0]).toMatchObject({ workingSets: 3, best: "40kg×10次" });
    const chest = i.regions.find((r) => r.region === "chest")!;
    expect(chest.status).not.toBe("预计可训练"); // trained 20h ago
    expect(i.candidates.length).toBeGreaterThan(5);
    const bench = i.candidates.find((c) => c.id === "barbell_bench_press")!;
    expect(bench.primaryFatigued).toBe(true);
    expect(bench.familiar).toBe(true);
    // skipped regions (legs by default) are never offered
    expect(i.candidates.some((c) => c.region === "legs")).toBe(i.profile.priorities.legs !== "skip");
    expect(coachInputHash(i)).toBe(coachInputHash({ ...i, nowLocal: "23:59" }));
  });

  it("清洗模型输出：未知动作、暂不优先部位、超量组数都被拦下", async () => {
    const i = await input();
    const ok = i.candidates.find((c) => !c.primaryFatigued)!;
    const a = sanitizeAdvice(
      {
        day_type: "train",
        headline: "今天练背",
        exercises: [
          { exercise_id: "rocket_press", sets: 3 },
          { exercise_id: ok.id, sets: 99, note: "x" },
          { exercise_id: ok.id, sets: 2 },
        ],
        focus_regions: ["back", "toes"],
      },
      { ...i, profile: { ...i.profile, priorities: { ...i.profile.priorities, [ok.region]: "maintain" } } },
    );
    expect(a.exercises).toHaveLength(1);
    expect(a.exercises[0].sets).toBeLessThanOrEqual(5);
    expect(a.focusRegions).toEqual(["back"]);
    const rest = sanitizeAdvice({ day_type: "train", exercises: [] }, i);
    expect(rest.dayType).toBe("rest");
  });

  it("接口：口令错 401；模拟模式返回建议，且只含候选动作", async () => {
    const i = await input();
    process.env.RECOGNITION_PROVIDER = "mock";
    process.env.APP_ACCESS_TOKEN = "abc";
    const bad = await COACH(new Request("http://x", { method: "POST", body: JSON.stringify(i) }));
    expect(bad.status).toBe(401);
    const res = await COACH(new Request("http://x", { method: "POST", headers: { "x-app-token": "abc" }, body: JSON.stringify(i) }));
    const j = await res.json();
    expect(j.ok).toBe(true);
    const ids = new Set(i.candidates.map((c) => c.id));
    for (const e of j.advice.exercises) expect(ids.has(e.exerciseId)).toBe(true);
    const garbage = await COACH(new Request("http://x", { method: "POST", headers: { "x-app-token": "abc" }, body: "{}" }));
    expect(garbage.status).toBe(400);
  });
});
