/** Turns an Anthropic SDK error into a code + a Chinese message the user can act on. */
export interface UpstreamProblem {
  code: "key_invalid" | "no_permission" | "no_credit" | "rate_limited" | "model_not_found" | "overloaded" | "timeout" | "network" | "unknown";
  message: string;
}

export function classifyUpstream(e: unknown, aborted = false): UpstreamProblem {
  if (aborted) return { code: "timeout", message: "AI 服务响应超时" };
  const err = e as { status?: number; message?: string; name?: string; error?: { error?: { message?: string } } };
  const status = err?.status;
  const text = `${err?.error?.error?.message ?? ""} ${err?.message ?? ""}`.toLowerCase();
  if (status === 401) return { code: "key_invalid", message: "ANTHROPIC_API_KEY 无效或已被删除（换了新 Key 记得更新 Vercel 变量并 Redeploy）" };
  if (status === 403) return { code: "no_permission", message: "这个 API Key 没有权限调用该模型" };
  if (status === 400 && /credit|balance|billing/.test(text)) return { code: "no_credit", message: "Anthropic 账户余额不足，请在 console.anthropic.com 充值" };
  if (status === 404 || /model/.test(text) && status === 400) return { code: "model_not_found", message: "找不到配置的模型（检查 RECOGNITION_MODEL）" };
  if (status === 429) return { code: "rate_limited", message: "调用太频繁或达到额度上限，请稍后再试" };
  if (status === 529 || status === 503 || /overloaded/.test(text)) return { code: "overloaded", message: "AI 服务繁忙，请稍后再试" };
  if (err?.name === "APIConnectionTimeoutError" || /timed? ?out/.test(text)) return { code: "timeout", message: "AI 服务响应超时" };
  if (err?.name === "APIConnectionError") return { code: "network", message: "服务器连不上 AI 服务" };
  return { code: "unknown", message: `AI 服务出错${status ? `（${status}）` : ""}` };
}
