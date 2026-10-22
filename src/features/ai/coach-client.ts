"use client";
import { db } from "@/data/db";
import { now } from "@/data/repo";
import { tokenHeader } from "@/features/recognition/client";
import type { CoachAdvice, CoachInput } from "@/server/coach/types";
import { coachInputHash } from "./coach-input";

/**
 * The AI's advice is a suggestion snapshot, stored next to the rule-engine snapshots in the
 * `recommendations` table (id `ai-<date>`) — for display and later comparison only, never a training fact.
 */
export interface StoredAdvice {
  source: "ai";
  date: string;
  hash: string;
  model: string;
  advice: CoachAdvice;
  generatedAt: string;
}

export const aiRecId = (date: string) => `ai-${date}`;

export async function loadAdvice(date: string): Promise<StoredAdvice | null> {
  const r = await db().recommendations.get(aiRecId(date));
  const v = r?.view as StoredAdvice | undefined;
  return v?.source === "ai" ? v : null;
}

export type CoachOutcome = { ok: true; stored: StoredAdvice } | { ok: false; code: string; message: string };

export async function requestAdvice(input: CoachInput): Promise<CoachOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, code: "offline", message: "当前离线，AI 建议需要联网。下面的规则建议离线也可用。" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 55_000);
  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await tokenHeader()) },
      body: JSON.stringify(input),
      signal: ctl.signal,
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return { ok: false, code: j?.error ?? "http", message: j?.message ?? `AI 建议生成失败（${res.status}）` };
    const stored: StoredAdvice = { source: "ai", date: input.date, hash: coachInputHash(input), model: j.model, advice: j.advice, generatedAt: now() };
    await db().recommendations.put({ id: aiRecId(input.date), date: input.date, view: stored, calculationVersion: `ai:${j.model}`, createdAt: now(), updatedAt: now() });
    return { ok: true, stored };
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    return { ok: false, code: aborted ? "timeout" : "network", message: aborted ? "AI 响应超时，请稍后重试" : "网络异常，连不上服务器" };
  } finally {
    clearTimeout(timer);
  }
}
