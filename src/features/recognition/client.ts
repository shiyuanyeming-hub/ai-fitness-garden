"use client";
import type { RecognitionResult } from "@/server/recognition/types";
import { db } from "@/data/db";
import { allEquipmentTypes, allExercises, getMeta, now, uid } from "@/data/repo";

export interface PreparedImage {
  blob: Blob;
  thumb: Blob;
  base64: string;
  hash: string;
  mediaType: "image/jpeg";
}

async function drawResized(file: Blob, maxSide: number, quality: number): Promise<Blob> {
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    bmp = await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("无法读取这张图片"));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = "naturalWidth" in bmp ? bmp.naturalWidth : bmp.width;
  const h = "naturalHeight" in bmp ? bmp.naturalHeight : bmp.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持图片处理");
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("图片压缩失败"))), "image/jpeg", quality));
}

async function sha256Hex(b: Blob): Promise<string> {
  const buf = await b.arrayBuffer();
  if (crypto?.subtle) {
    const d = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  // fallback (non-secure context): FNV-1a
  let h = 0x811c9dc5;
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 0x01000193) >>> 0;
  return "fnv" + h.toString(16).padStart(8, "0") + u.length.toString(16);
}

async function toBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Compress before upload: ~1024px long side, JPEG q0.8. Strips EXIF (incl. GPS) as a side effect. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const blob = await drawResized(file, 1024, 0.8);
  const thumb = await drawResized(file, 360, 0.75);
  return { blob, thumb, base64: await toBase64(blob), hash: await sha256Hex(blob), mediaType: "image/jpeg" };
}

export type RecognizeOutcome =
  | { ok: true; result: RecognitionResult; fromCache: boolean; logId: string }
  | { ok: false; code: string; message: string; logId: string | null };

export async function recognizeImage(img: PreparedImage, photoId: string | null): Promise<RecognizeOutcome> {
  const d = db();
  // Local cache: same picture recognized before → no new API call (cost control).
  const prev = (await d.recognitionLogs.where("hash").equals(img.hash).toArray()).find((l) => l.result && l.status !== "failed");
  if (prev?.result) return { ok: true, result: prev.result as RecognitionResult, fromCache: true, logId: prev.id };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, code: "offline", message: "当前离线，无法使用 AI 识别。可以手动选择或创建器械。", logId: null };
  }

  const [types, exercises] = await Promise.all([allEquipmentTypes(), allExercises()]);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 50_000);
  const logId = uid();
  try {
    const res = await fetch("/api/recognize", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await tokenHeader()) },
      body: JSON.stringify({
        imageBase64: img.base64,
        mediaType: img.mediaType,
        hash: img.hash,
        catalog: types.map((t) => ({ id: t.id, name: t.name, nameEn: t.nameEn, cues: t.cues })),
        exercises: exercises.map((e) => ({ id: e.id, nameEn: e.nameEn ?? e.name, equipmentTypes: e.equipmentTypes })),
      }),
      signal: ctl.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      const message = json?.message ?? `识别失败（${res.status}）`;
      await d.recognitionLogs.add({ id: logId, hash: img.hash, photoId, status: "failed", result: null, error: message, createdAt: now(), updatedAt: now() });
      return { ok: false, code: json?.error ?? "http", message, logId };
    }
    await d.recognitionLogs.add({ id: logId, hash: img.hash, photoId, status: "success", result: json.result, model: json.model, createdAt: now(), updatedAt: now() });
    return { ok: true, result: json.result as RecognitionResult, fromCache: !!json.cached, logId };
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    const message = aborted ? "识别超时，请重试或手动登记" : "网络异常，无法连接识别服务。可以手动登记器械。";
    await d.recognitionLogs.add({ id: logId, hash: img.hash, photoId, status: "failed", result: null, error: message, createdAt: now(), updatedAt: now() });
    return { ok: false, code: aborted ? "timeout" : "network", message, logId };
  } finally {
    clearTimeout(timer);
  }
}

export async function confirmRecognition(logId: string, equipmentTypeId: string, exerciseId: string | null, corrected: boolean) {
  await db().recognitionLogs.update(logId, {
    status: corrected ? "corrected" : "confirmed",
    confirmedEquipmentTypeId: equipmentTypeId,
    confirmedExerciseId: exerciseId,
    updatedAt: now(),
  });
}

/** The access token is sent URI-encoded so tokens with non-ASCII characters survive HTTP headers. */
export async function tokenHeader(): Promise<Record<string, string>> {
  const t = ((await getMeta<string>("appToken")) ?? "").normalize("NFKC").trim();
  return t ? { "x-app-token": encodeURIComponent(t) } : {};
}

export interface AiStatus {
  configured: boolean;
  requiresToken: boolean;
  tokenOk: boolean;
  token?: "not_required" | "ok" | "missing" | "mismatch";
  model: string | null;
}

export async function recognitionStatus(): Promise<AiStatus | null> {
  try {
    const r = await fetch("/api/recognize", { headers: await tokenHeader(), cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export interface AiTestResult {
  ok: boolean;
  steps: { id: string; ok: boolean; message: string }[];
  model?: string;
  latencyMs?: number;
}

export async function testAiConnection(): Promise<AiTestResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return { ok: false, steps: [{ id: "server", ok: false, message: "手机当前离线" }] };
  try {
    const r = await fetch("/api/ai/test", { method: "POST", headers: await tokenHeader(), cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (j?.steps) return j;
    return { ok: false, steps: [{ id: "server", ok: false, message: `服务器返回异常（${r.status}）` }] };
  } catch {
    return { ok: false, steps: [{ id: "server", ok: false, message: "连不上服务器（网络问题或网址不对）" }] };
  }
}
