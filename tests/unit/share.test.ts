import { beforeEach, describe, expect, it, vi } from "vitest";
import { FitnessDB, setDb, db } from "@/data/db";
import * as repo from "@/data/repo";
import { computeDerived, loadFacts } from "@/data/derived";
import { buildSnapshot, snapshotFingerprint, snapshotToFacts } from "@/data/share";

let n = 0;
beforeEach(async () => {
  setDb(new FitnessDB(`share-${++n}`));
  await db().open();
  const gym = await repo.saveGym({ name: "秘密地点健身房", isDefault: true });
  await db().profile.put({ ...repo.defaultProfile(), currentGymId: gym.id, limitations: "右肩旧伤", weightKg: 73.5 });
});

async function train(sets: number, tickAll = true) {
  const s = await repo.startSession({ gymId: null });
  const we = await repo.addExerciseToSession(s.id, "barbell_bench_press", null, { prefill: { sets, reps: 8, load: 50 } });
  const rows = await db().sets.where("workoutExerciseId").equals(we.id).toArray();
  if (tickAll) for (const r of rows) await repo.completeSet(r.id);
  else await repo.completeSet(rows[0].id);
  return s;
}

describe("分享快照", () => {
  it("只含已打勾的组；进行中的训练有打勾的组才出现，且标记为 active", async () => {
    const done = await train(3, false); // 1 of 3 ticked
    await repo.finishSession(done.id);
    const live = await train(2); // in progress, both ticked
    const snap = buildSnapshot((await loadFacts())!, "测试");
    expect(snap.sessions.map((s) => [s.id, s.status]).sort()).toEqual([[done.id, "completed"], [live.id, "active"]].sort());
    const ticked = (await db().sets.toArray()).filter((x) => x.completedAt != null).length;
    expect(ticked).toBeGreaterThanOrEqual(2);
    expect(snap.sets).toHaveLength(ticked); // every ticked set, nothing else
    expect(snap.sets.every((s) => s.completedAt != null)).toBe(true);
    const f = snapshotToFacts(snap);
    expect(computeDerived(f, Date.now()).active?.session.id).toBe(live.id);
  });

  it("进行中的训练一组都没打勾时不公开（预填的不是事实）", async () => {
    const s = await repo.startSession({ gymId: null });
    await repo.addExerciseToSession(s.id, "barbell_bench_press", null, { prefill: { sets: 3, reps: 8, load: 50 } });
    const snap = buildSnapshot((await loadFacts())!, "测试");
    expect(snap.sessions).toHaveLength(0);
    expect(snap.sets).toHaveLength(0);
  });

  it("不泄露体重、伤病备注、健身房、照片等隐私字段", async () => {
    const s = await train(2);
    await repo.finishSession(s.id);
    const text = JSON.stringify(buildSnapshot((await loadFacts())!, "测试"));
    for (const secret of ["秘密地点", "右肩旧伤", "73.5", "weightKg", "heightCm", "limitations", "gymId", "gymEquipmentId", "notes", "photo"]) expect(text, secret).not.toContain(secret);
  });

  it("在访客端用快照重新计算，结果与本机一致（派生数据不存储）", async () => {
    const s = await train(3);
    await repo.finishSession(s.id);
    const facts = (await loadFacts())!;
    const now = Date.now();
    const mine = computeDerived(facts, now);
    const theirs = computeDerived(snapshotToFacts(buildSnapshot(facts, "x")), now);
    expect(theirs.completed).toHaveLength(1);
    expect(theirs.loads.map((l) => [l.muscleId, l.effectiveSets])).toEqual(mine.loads.map((l) => [l.muscleId, l.effectiveSets]));
    expect(JSON.stringify(buildSnapshot(facts, "x"))).not.toMatch(/readiness|recovery|effectiveSets/);
  });

  it("指纹：数据没变不变，改了一组就变", async () => {
    const s = await train(2);
    await repo.finishSession(s.id);
    const a = snapshotFingerprint(buildSnapshot((await loadFacts())!, "x", "2026-01-01T00:00:00Z"));
    const b = snapshotFingerprint(buildSnapshot((await loadFacts())!, "x", "2027-01-01T00:00:00Z"));
    expect(a).toBe(b);
    const row = (await db().sets.toArray()).find((r) => r.completedAt)!;
    await repo.updateSet(row.id, { loadValue: 55 });
    expect(snapshotFingerprint(buildSnapshot((await loadFacts())!, "x"))).not.toBe(a);
  });

  it("自定义动作随快照带上，名称可解析", async () => {
    const ex = await repo.saveCustomExercise({ name: "我的怪动作", kind: "isolation", lateralityMode: "bilateral", resistanceType: "external_load", measurementType: "reps_weight", primary: ["pectoralis_major_sternal"], secondary: [] });
    const s = await repo.startSession({ gymId: null });
    const we = await repo.addExerciseToSession(s.id, ex.id, null, { prefill: { sets: 1, reps: 10, load: 10 } });
    for (const r of await db().sets.where("workoutExerciseId").equals(we.id).toArray()) await repo.completeSet(r.id);
    await repo.finishSession(s.id);
    const snap = buildSnapshot((await loadFacts())!, "x");
    expect(snap.customExercises.map((e) => e.name)).toEqual(["我的怪动作"]);
    expect(snapshotToFacts(snap).exercises.find((e) => e.id === ex.id)?.name).toBe("我的怪动作");
  });
});

describe("/api/share", () => {
  const store = { saved: null as string | null };
  beforeEach(() => {
    vi.resetModules();
    store.saved = null;
    vi.doMock("@/server/share-store", () => ({
      blobConfigured: () => !!process.env.BLOB_READ_WRITE_TOKEN,
      saveSnapshot: async (j: string) => void (store.saved = j),
      loadSnapshot: async () => store.saved,
      removeSnapshot: async () => void (store.saved = null),
    }));
  });
  const req = (method: string, body?: unknown, token?: string) =>
    new Request("http://x/api/share", { method, body: body ? JSON.stringify(body) : undefined, headers: token ? { "x-app-token": token } : {} });

  async function sample() {
    const s = await train(2);
    await repo.finishSession(s.id);
    return buildSnapshot((await loadFacts())!, "公开页");
  }

  it("没有口令不能写；口令对才能写；任何人都能读", async () => {
    process.env.APP_ACCESS_TOKEN = "secret";
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    const { GET, POST } = await import("@/app/api/share/route");
    const snap = await sample();
    expect((await POST(req("POST", snap))).status).toBe(401);
    expect((await POST(req("POST", snap, "wrong"))).status).toBe(401);
    expect(store.saved).toBeNull();
    expect((await POST(req("POST", snap, "secret"))).status).toBe(200);
    const j = await (await GET()).json();
    expect(j.ok).toBe(true);
    expect(j.snapshot.title).toBe("公开页");
  });

  it("服务器没设口令时拒绝写入（防止别人改写页面）", async () => {
    delete process.env.APP_ACCESS_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    const { POST } = await import("@/app/api/share/route");
    expect((await POST(req("POST", await sample()))).status).toBe(503);
  });

  it("没连接云存储：读返回 not_configured，写给出明确提示", async () => {
    process.env.APP_ACCESS_TOKEN = "secret";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { GET, POST } = await import("@/app/api/share/route");
    expect((await (await GET()).json()).error).toBe("not_configured");
    const r = await POST(req("POST", await sample(), "secret"));
    expect(r.status).toBe(503);
    expect((await r.json()).message).toContain("Blob");
  });

  it("格式不对的数据被拒绝；未打勾的组即使被塞进来也会被丢弃", async () => {
    process.env.APP_ACCESS_TOKEN = "secret";
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    const { POST } = await import("@/app/api/share/route");
    expect((await POST(req("POST", { hello: 1 }, "secret"))).status).toBe(400);
    const snap = await sample();
    snap.sets.push({ ...snap.sets[0], id: "sneaky", completedAt: null });
    expect((await POST(req("POST", snap, "secret"))).status).toBe(200);
    expect(JSON.parse(store.saved!).sets.some((s: { id: string }) => s.id === "sneaky")).toBe(false);
  });
});
