import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Access-token check shared by every AI route.
 *
 * Tokens are normalized on both sides so that invisible differences don't lock the user out:
 * - NFKC folds full-width characters typed with a Japanese/Chinese IME (ａｂｃ１２３ → abc123)
 * - zero-width characters and surrounding whitespace (e.g. a trailing newline pasted into Vercel) are removed
 * The client sends the token URI-encoded so non-ASCII tokens survive HTTP headers; raw ASCII still works.
 */
export function normalizeToken(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").replace(/[​-‍﻿]/g, "").trim();
}

function decodeHeader(v: string | null): string {
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type TokenCheck = "not_required" | "ok" | "missing" | "mismatch";

export function checkToken(req: Request): TokenCheck {
  const expected = normalizeToken(process.env.APP_ACCESS_TOKEN);
  if (!expected) return "not_required";
  const got = normalizeToken(decodeHeader(req.headers.get("x-app-token")));
  if (!got) return "missing";
  return sameSecret(got, expected) ? "ok" : "mismatch";
}

export const TOKEN_MESSAGE: Record<"missing" | "mismatch", string> = {
  missing: "这台设备还没有填写访问口令（在「我的 → AI 设置」中填写，和 Vercel 里的 APP_ACCESS_TOKEN 一致）",
  mismatch: "访问口令和服务器上的 APP_ACCESS_TOKEN 不一致（注意大小写、全角字符；改过 Vercel 变量后需要 Redeploy）",
};
