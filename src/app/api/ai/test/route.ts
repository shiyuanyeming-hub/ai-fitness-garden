import { NextResponse } from "next/server";
import { checkToken, TOKEN_MESSAGE } from "@/server/auth";
import { aiConfig } from "@/server/ai";
import { classifyUpstream } from "@/server/ai-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Step = { id: "server" | "key" | "token" | "call"; ok: boolean; message: string };

/**
 * Connection test: checks each link of the chain separately and makes ONE tiny real model call
 * (a few tokens) so "configured" also means "actually works".
 */
export async function POST(req: Request) {
  const steps: Step[] = [{ id: "server", ok: true, message: "已连上部署的服务器" }];
  const cfg = aiConfig();
  if (!cfg) {
    steps.push({ id: "key", ok: false, message: "服务器没有配置 ANTHROPIC_API_KEY（在 Vercel 环境变量中添加后 Redeploy）" });
    return NextResponse.json({ ok: false, steps });
  }
  steps.push({ id: "key", ok: true, message: cfg.mode === "mock" ? "模拟模式（不调用真实 AI）" : "服务器已配置 API Key" });

  const tk = checkToken(req);
  if (tk === "missing" || tk === "mismatch") {
    steps.push({ id: "token", ok: false, message: TOKEN_MESSAGE[tk] });
    return NextResponse.json({ ok: false, steps }, { status: 401 });
  }
  steps.push({ id: "token", ok: true, message: tk === "ok" ? "访问口令正确" : "服务器未设置访问口令（建议设置）" });

  const t0 = Date.now();
  if (cfg.mode === "mock") {
    steps.push({ id: "call", ok: true, message: "模拟调用成功" });
    return NextResponse.json({ ok: true, steps, model: cfg.model, latencyMs: Date.now() - t0 });
  }
  try {
    await cfg.client.messages.create({ model: cfg.model, max_tokens: 5, messages: [{ role: "user", content: "Reply with: OK" }] });
    const latencyMs = Date.now() - t0;
    steps.push({ id: "call", ok: true, message: `实际调用 ${cfg.model} 成功，用时 ${(latencyMs / 1000).toFixed(1)} 秒` });
    return NextResponse.json({ ok: true, steps, model: cfg.model, latencyMs });
  } catch (e) {
    console.error("[ai/test] upstream", (e as { status?: number }).status, (e as Error).message);
    const p = classifyUpstream(e);
    steps.push({ id: "call", ok: false, message: p.message });
    return NextResponse.json({ ok: false, steps, model: cfg.model, upstream: p.code });
  }
}
