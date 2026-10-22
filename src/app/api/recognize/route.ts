import { NextResponse } from "next/server";
import { getProvider, recognizeWithCache, RecognitionError } from "@/server/recognition";
import type { RecognitionRequest } from "@/server/recognition/types";
import { checkToken, TOKEN_MESSAGE } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BASE64 = 3_000_000; // ≈ 2.2 MB image; the client compresses to ~1024px first

export async function GET(req: Request) {
  const p = getProvider();
  return NextResponse.json({
    configured: !!p,
    provider: p?.name ?? null,
    model: p?.model ?? null,
    requiresToken: checkToken(req) !== "not_required",
    tokenOk: ["ok", "not_required"].includes(checkToken(req)),
    token: checkToken(req),
  });
}

export async function POST(req: Request) {
  try {
    const tk = checkToken(req);
    if (tk === "missing" || tk === "mismatch") throw new RecognitionError("unauthorized", TOKEN_MESSAGE[tk], 401);
    const provider = getProvider();
    if (!provider) throw new RecognitionError("not_configured", "服务器还没有配置 ANTHROPIC_API_KEY，暂时只能手动登记器械", 503);

    let body: Partial<RecognitionRequest>;
    try {
      body = await req.json();
    } catch {
      throw new RecognitionError("bad_request", "请求格式错误", 400);
    }
    const { imageBase64, mediaType, hash, catalog, exercises } = body;
    if (typeof imageBase64 !== "string" || !imageBase64) throw new RecognitionError("bad_request", "缺少图片", 400);
    if (imageBase64.length > MAX_BASE64) throw new RecognitionError("bad_request", "图片太大，请重新拍摄", 413);
    if (!["image/jpeg", "image/png", "image/webp"].includes(mediaType as string)) throw new RecognitionError("bad_request", "不支持的图片格式", 400);
    if (typeof hash !== "string" || !/^[a-z0-9]{8,128}$/i.test(hash)) throw new RecognitionError("bad_request", "缺少图片指纹", 400);
    if (!Array.isArray(catalog) || !catalog.length || catalog.length > 300) throw new RecognitionError("bad_request", "缺少器械目录", 400);
    const ex = Array.isArray(exercises) ? exercises.slice(0, 400) : [];

    const { result, cached } = await recognizeWithCache(provider, {
      imageBase64,
      mediaType: mediaType as RecognitionRequest["mediaType"],
      hash,
      catalog: catalog.slice(0, 300).map((c) => ({ id: String(c.id), name: String(c.name ?? ""), nameEn: c.nameEn ? String(c.nameEn) : undefined, cues: c.cues ? String(c.cues).slice(0, 300) : undefined })),
      exercises: ex.map((e) => ({ id: String(e.id), nameEn: String(e.nameEn ?? ""), equipmentTypes: Array.isArray(e.equipmentTypes) ? e.equipmentTypes.map(String) : [] })),
    });
    // The image is not stored server-side.
    return NextResponse.json({ ok: true, result, cached, model: provider.model });
  } catch (e) {
    const err = e instanceof RecognitionError ? e : new RecognitionError("upstream", "识别失败，请重试或手动登记", 500);
    if (!(e instanceof RecognitionError)) console.error("[recognize]", e);
    return NextResponse.json({ ok: false, error: err.code, message: err.message }, { status: err.status });
  }
}
