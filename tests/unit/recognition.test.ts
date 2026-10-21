import { describe, expect, it } from "vitest";
import { sanitizeResult } from "@/server/recognition/sanitize";
import { POST, GET } from "@/app/api/recognize/route";

const req = {
  catalog: [
    { id: "functional_trainer", name: "双滑轮功能训练器" },
    { id: "single_cable", name: "单滑轮" },
  ],
  exercises: [{ id: "cable_fly", nameEn: "Cable fly", equipmentTypes: ["functional_trainer"] }],
};

describe("识别结果清洗：不信任模型输出", () => {
  it("未知器械 id → unknown；置信度截断；未知动作 id 丢弃", () => {
    const r = sanitizeResult(
      {
        equipment_candidates: [
          { equipment_type_id: "functional_trainer", display_name: "龙门架", confidence: 1.7 },
          { equipment_type_id: "rocket_launcher", display_name: "??", confidence: 0.3 },
          { equipment_type_id: "functional_trainer", display_name: "dup", confidence: 0.2 },
        ],
        brand: "Life Fitness",
        brand_confidence: "maybe",
        likely_exercise_ids: ["cable_fly", "nonexistent"],
        people_present: true,
      },
      req,
    );
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]).toMatchObject({ equipmentTypeId: "functional_trainer", confidence: 1 });
    expect(r.candidates[1].equipmentTypeId).toBe("unknown");
    expect(r.brandConfidence).toBe("unknown");
    expect(r.likelyExerciseIds).toEqual(["cable_fly"]);
    expect(r.peoplePresent).toBe(true);
  });

  it("垃圾输入不会崩溃", () => {
    expect(sanitizeResult(null, req).candidates).toEqual([]);
    expect(sanitizeResult("oops", req).isMultifunctional).toBe(false);
  });
});

describe("/api/recognize", () => {
  it("未配置 API Key 时明确返回 503，不影响其他功能", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.RECOGNITION_PROVIDER;
    const g = await (await GET(new Request("http://x/api/recognize"))).json();
    expect(g.configured).toBe(false);
    const res = await POST(new Request("http://x/api/recognize", { method: "POST", body: "{}" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_configured");
  });

  it("设置访问口令后，没有口令的请求被拒绝", async () => {
    process.env.APP_ACCESS_TOKEN = "secret";
    process.env.RECOGNITION_PROVIDER = "mock";
    const res = await POST(new Request("http://x/api/recognize", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    delete process.env.APP_ACCESS_TOKEN;
  });

  it("参数校验与模拟识别", async () => {
    process.env.RECOGNITION_PROVIDER = "mock";
    const bad = await POST(new Request("http://x/api/recognize", { method: "POST", body: JSON.stringify({ imageBase64: "x", mediaType: "image/gif", hash: "abcdef12", catalog: req.catalog }) }));
    expect(bad.status).toBe(400);
    const ok = await POST(
      new Request("http://x/api/recognize", {
        method: "POST",
        body: JSON.stringify({ imageBase64: "aGVsbG8=", mediaType: "image/jpeg", hash: "abcdef1234", catalog: req.catalog, exercises: req.exercises }),
      }),
    );
    const j = await ok.json();
    expect(j.ok).toBe(true);
    expect(j.result.candidates[0].equipmentTypeId).toBe("functional_trainer");
    const fail = await POST(
      new Request("http://x/api/recognize", {
        method: "POST",
        body: JSON.stringify({ imageBase64: "aGVsbG8=", mediaType: "image/jpeg", hash: "fail000000", catalog: req.catalog }),
      }),
    );
    expect(fail.status).toBe(502);
    delete process.env.RECOGNITION_PROVIDER;
  });
});
