import { NextResponse } from "next/server";
import { z } from "zod";
import { checkToken, TOKEN_MESSAGE } from "@/server/auth";
import { blobConfigured, loadSnapshot, removeSnapshot, saveSnapshot } from "@/server/share-store";
import { SHARE_FORMAT, SHARE_VERSION } from "@/data/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY = 4_000_000; // Vercel functions accept ~4.5MB request bodies
const s = (n: number) => z.string().max(n);
const num = z.number().nullable();

const exercise = z.object({
  id: s(80),
  name: s(80),
  nameJa: s(80).optional(),
  nameEn: s(80).optional(),
  kind: z.enum(["compound", "isolation", "core", "cardio", "other"]),
  pattern: s(40),
  lateralityMode: z.enum(["bilateral", "unilateral", "alternating", "directional"]),
  resistanceType: z.enum(["external_load", "assisted", "bodyweight", "band", "other"]),
  measurementType: z.enum(["reps_weight", "reps_only", "duration", "distance", "other"]),
  equipmentTypes: z.array(s(80)).max(30),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  muscles: z.array(z.object({ muscleId: s(40), role: z.enum(["primary", "secondary"]) }).passthrough()).max(40),
  isCustom: z.boolean(),
});

const schema = z.object({
  format: z.literal(SHARE_FORMAT),
  version: z.number().max(SHARE_VERSION),
  publishedAt: s(40),
  title: s(40),
  timeZone: s(60),
  sessions: z.array(z.object({ id: s(60), startedAt: s(40), completedAt: s(40).nullable(), source: z.enum(["planned", "free", "imported"]), status: z.enum(["active", "completed"]).optional() })).max(5000),
  workoutExercises: z.array(z.object({ id: s(60), sessionId: s(60), exerciseId: s(80), orderIndex: z.number() })).max(40000),
  sets: z
    .array(
      z.object({
        id: s(60),
        workoutExerciseId: s(60),
        setIndex: z.number(),
        side: z.enum(["left", "right", "both"]),
        movementDirection: z.enum(["left", "right", "none"]),
        setType: z.enum(["warmup", "working", "dropset", "other"]),
        loadValue: num,
        loadUnit: z.enum(["kg", "lb", "level"]).nullable(),
        loadKind: z.enum(["external", "assistance", "bodyweight", "band"]),
        reps: num,
        durationSeconds: num,
        distanceM: num,
        rir: num,
        rpe: num,
        completedAt: s(40).nullable(),
      }),
    )
    .max(120000),
  customExercises: z.array(exercise).max(300),
});

const noStore = { "cache-control": "no-store" };

/** Public, read-only. Returns the last published snapshot (facts only). */
export async function GET() {
  if (!blobConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { headers: noStore });
  try {
    const text = await loadSnapshot();
    if (!text) return NextResponse.json({ ok: false, error: "empty" }, { headers: noStore });
    return NextResponse.json({ ok: true, snapshot: JSON.parse(text) }, { headers: noStore });
  } catch (e) {
    console.error("[share] read", (e as Error).message);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 502, headers: noStore });
  }
}

function guard(req: Request): NextResponse | null {
  // Writing must be locked: without APP_ACCESS_TOKEN on the server anyone could overwrite the page.
  if (!process.env.APP_ACCESS_TOKEN) return NextResponse.json({ ok: false, error: "token_not_set", message: "服务器没有设置 APP_ACCESS_TOKEN，为防止别人改写页面，分享功能不开放写入" }, { status: 503 });
  const tk = checkToken(req);
  if (tk === "missing" || tk === "mismatch") return NextResponse.json({ ok: false, error: "unauthorized", message: TOKEN_MESSAGE[tk] }, { status: 401 });
  if (!blobConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured", message: "服务器还没有连接云存储：在 Vercel → Storage 创建一个 Blob 存储并连接到本项目，然后 Redeploy" }, { status: 503 });
  }
  return null;
}

/** Publish / overwrite the snapshot. Needs the access token. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return NextResponse.json({ ok: false, error: "too_large", message: "数据太大，无法发布" }, { status: 413 });
    let snap: z.infer<typeof schema>;
    try {
      snap = schema.parse(JSON.parse(text));
    } catch {
      return NextResponse.json({ ok: false, error: "bad_request", message: "数据格式不对" }, { status: 400 });
    }
    // Only completed, confirmed sets belong in the public record.
    snap.sets = snap.sets.filter((x) => x.completedAt != null);
    await saveSnapshot(JSON.stringify(snap));
    return NextResponse.json({ ok: true, publishedAt: snap.publishedAt, sessions: snap.sessions.length });
  } catch (e) {
    console.error("[share] write", (e as Error).message);
    return NextResponse.json({ ok: false, error: "write_failed", message: `云存储写入失败：${(e as Error).message.slice(0, 160)}` }, { status: 502 });
  }
}

/** Take the page down. */
export async function DELETE(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    await removeSnapshot();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "delete_failed", message: (e as Error).message.slice(0, 160) }, { status: 502 });
  }
}
