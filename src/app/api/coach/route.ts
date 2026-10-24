import { NextResponse } from "next/server";
import { z } from "zod";
import { checkToken, TOKEN_MESSAGE } from "@/server/auth";
import { aiConfig } from "@/server/ai";
import { CoachError, generateAdvice } from "@/server/coach";
import type { CoachInput } from "@/server/coach/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 60_000;
const region = z.enum(["chest", "back", "shoulders", "arms", "core", "legs"]);
const s = (n: number) => z.string().max(n);
const schema = z.object({
  date: s(20),
  weekday: s(10),
  nowLocal: s(40),
  profile: z.object({
    experience: s(20),
    heightCm: z.number().nullable(),
    weightKg: z.number().nullable(),
    goals: z.array(s(200)).max(10),
    weeklyTrainingDays: z.number(),
    sessionMinutes: z.number(),
    priorities: z.record(z.string(), z.enum(["focus", "maintain", "skip"])),
    limitations: s(500),
    goalDaysLeft: z.number().nullable(),
  }),
  checkin: z.object({ energy: s(10).nullable(), sleep: s(10).nullable() }),
  habits: z.object({
    totalSessions: z.number(),
    sessionsLast28d: z.number(),
    avgSessionsPerWeek: z.number(),
    avgDurationMin: z.number().nullable(),
    usualStart: s(20).nullable(),
    daysSinceLastSession: z.number().nullable(),
    sessionsThisWeek: z.number(),
    trainedToday: z.boolean(),
    cardioMinutes7d: z.number().optional(),
    topExercises: z.array(z.object({ name: s(60), times: z.number() })).max(10),
  }),
  recent: z
    .array(
      z.object({
        date: s(20),
        durationMin: z.number().nullable(),
        exercises: z.array(z.object({ name: s(60), workingSets: z.number(), best: s(40).nullable() })).max(15),
      }),
    )
    .max(10),
  regions: z
    .array(
      z.object({
        region,
        name: s(10),
        priority: s(10),
        status: s(10),
        readinessPct: z.number(),
        readyInHours: z.number().nullable(),
        setsThisWeek: z.number(),
        weeklyTarget: z.tuple([z.number(), z.number()]),
        daysSinceTrained: z.number().nullable(),
      }),
    )
    .max(6),
  attention: z.array(s(200)).max(10),
  rule: z.object({
    headline: s(200),
    restDay: z.boolean(),
    exercises: z.array(z.object({ id: s(80), name: s(60), sets: z.number(), region: s(20) })).max(10),
  }),
  candidates: z
    .array(z.object({ id: s(80), name: s(60), region, primary: z.array(s(20)).max(6), primaryFatigued: z.boolean(), familiar: z.boolean() }))
    .min(1)
    .max(80),
});

export async function POST(req: Request) {
  try {
    const tk = checkToken(req);
    if (tk === "missing" || tk === "mismatch") throw new CoachError("unauthorized", TOKEN_MESSAGE[tk], 401);
    const cfg = aiConfig();
    if (!cfg) throw new CoachError("not_configured", "服务器还没有配置 ANTHROPIC_API_KEY，先看下面的规则建议", 503);
    const text = await req.text();
    if (text.length > MAX_BODY) throw new CoachError("bad_request", "数据太大", 413);
    let parsed: CoachInput;
    try {
      parsed = schema.parse(JSON.parse(text)) as CoachInput;
    } catch {
      throw new CoachError("bad_request", "请求格式错误", 400);
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45_000);
    try {
      const advice = await generateAdvice(cfg, parsed, ctl.signal);
      return NextResponse.json({ ok: true, advice, model: cfg.model });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const err = e instanceof CoachError ? e : new CoachError("upstream", "AI 建议生成失败，请稍后重试", 500);
    if (!(e instanceof CoachError)) console.error("[coach]", e);
    return NextResponse.json({ ok: false, error: err.code, message: err.message }, { status: err.status });
  }
}
