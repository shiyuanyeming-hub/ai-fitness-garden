import type { Facts } from "@/data/derived";
import { buildSnapshot, snapshotFingerprint, type ShareSnapshot } from "@/data/share";
import { getMeta, setMeta } from "@/data/repo";
import { tokenHeader } from "@/features/recognition/client";

/** meta keys (bookkeeping only — never training facts) */
export const SHARE_META = { on: "shareOn", title: "shareTitle", fp: "shareFp", at: "shareAt", err: "shareErr" } as const;

export interface ShareSettings {
  on: boolean;
  title: string;
  at: string | null;
  err: string | null;
}

export async function loadShareSettings(): Promise<ShareSettings> {
  return {
    on: (await getMeta<boolean>(SHARE_META.on)) ?? false,
    title: (await getMeta<string>(SHARE_META.title)) ?? "我的训练",
    at: (await getMeta<string>(SHARE_META.at)) ?? null,
    err: (await getMeta<string>(SHARE_META.err)) ?? null,
  };
}

export type PublishResult = { ok: true; skipped?: boolean; at: string } | { ok: false; message: string };

let inflight: Promise<PublishResult> | null = null;

/** Upload the facts snapshot. No-op when nothing changed since the last successful upload (unless force). */
export function publishShare(facts: Facts, opts: { force?: boolean } = {}): Promise<PublishResult> {
  if (inflight) return inflight;
  inflight = doPublish(facts, !!opts.force).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doPublish(facts: Facts, force: boolean): Promise<PublishResult> {
  const title = (await getMeta<string>(SHARE_META.title)) ?? "我的训练";
  const snap = buildSnapshot(facts, title);
  const fp = snapshotFingerprint(snap);
  if (!force && fp === (await getMeta<string>(SHARE_META.fp))) return { ok: true, skipped: true, at: (await getMeta<string>(SHARE_META.at)) ?? snap.publishedAt };
  try {
    const r = await fetch("/api/share", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await tokenHeader()) },
      body: JSON.stringify(snap),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) {
      const message = j?.message ?? `发布失败（${r.status}）`;
      await setMeta(SHARE_META.err, message);
      return { ok: false, message };
    }
    await setMeta(SHARE_META.fp, fp);
    await setMeta(SHARE_META.at, snap.publishedAt);
    await setMeta(SHARE_META.err, null);
    return { ok: true, at: snap.publishedAt };
  } catch {
    const message = "网络不通，联网后会自动重试";
    await setMeta(SHARE_META.err, message);
    return { ok: false, message };
  }
}

export async function unpublishShare(): Promise<PublishResult> {
  try {
    const r = await fetch("/api/share", { method: "DELETE", headers: await tokenHeader() });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) return { ok: false, message: j?.message ?? `撤下失败（${r.status}）` };
    await setMeta(SHARE_META.fp, null);
    await setMeta(SHARE_META.at, null);
    return { ok: true, at: new Date().toISOString() };
  } catch {
    return { ok: false, message: "网络不通" };
  }
}

export type FetchShare = { state: "ok"; snapshot: ShareSnapshot } | { state: "empty" } | { state: "not_configured" } | { state: "error" };

export async function fetchShare(): Promise<FetchShare> {
  try {
    const r = await fetch("/api/share", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (j?.ok && j.snapshot) return { state: "ok", snapshot: j.snapshot as ShareSnapshot };
    if (j?.error === "empty") return { state: "empty" };
    if (j?.error === "not_configured") return { state: "not_configured" };
    return { state: "error" };
  } catch {
    return { state: "error" };
  }
}
