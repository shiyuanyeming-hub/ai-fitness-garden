"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppReady } from "@/features/app-data";
import { Button, Card, Chip, cx, useToast } from "@/components/ui";
import { prepareImage, recognizeImage, confirmRecognition, type PreparedImage, type RecognizeOutcome } from "./client";
import { exercisesForEquipmentType, equipmentName } from "@/features/catalog";
import { ExerciseList } from "@/features/workout/ExercisePicker";
import { addExerciseToSession, addGymEquipment, savePhoto, startSession } from "@/data/repo";
import { db, type GymEquipment } from "@/data/db";
import type { EquipmentType } from "@/data/seed/equipment";
import { TypePicker } from "@/features/equipment/TypePicker";

type Step = "capture" | "processing" | "equipment" | "manual" | "exercise";

export function ScanScreen() {
  const { facts } = useAppReady();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const sessionParam = params.get("session");
  const [step, setStep] = useState<Step>(params.get("manual") ? "manual" : "capture");
  const [img, setImg] = useState<PreparedImage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RecognizeOutcome | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [existing, setExisting] = useState<GymEquipment | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const gymId = facts.profile.currentGymId;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    cancelled.current = false;
    setStep("processing");
    try {
      const p = await prepareImage(file);
      setImg(p);
      setPreview(URL.createObjectURL(p.blob));
      const out = await recognizeImage(p, null);
      if (cancelled.current) return;
      setOutcome(out);
      if (out.ok) {
        const top = out.result.candidates.find((c) => c.equipmentTypeId !== "unknown");
        setTypeId(top?.equipmentTypeId ?? null);
        setStep("equipment");
      } else setStep("manual");
    } catch (e) {
      toast((e as Error).message || "无法处理这张图片", "error");
      setStep("capture");
    }
  }

  const type = facts.equipmentTypes.find((t) => t.id === typeId) ?? null;
  const sameTypeInGym = facts.gymEquipment.filter((g) => g.gymId === gymId && g.equipmentTypeId === typeId);
  const candidatesEx = useMemo(() => (typeId ? exercisesForEquipmentType(facts, typeId, existing?.id) : []), [facts, typeId, existing]);
  const hint = new Set(outcome?.ok ? outcome.result.likelyExerciseIds : []);
  const orderedEx = useMemo(
    () => [...candidatesEx].sort((a, b) => Number(hint.has(b.id)) - Number(hint.has(a.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidatesEx, outcome],
  );

  async function ensureMachine(): Promise<GymEquipment> {
    if (existing) return existing;
    if (!typeId || !gymId) throw new Error("请先选择器械");
    const photoId = img ? await savePhoto(img.blob, img.thumb, img.hash) : null;
    const res = outcome?.ok ? outcome.result : null;
    const cand = res?.candidates.find((c) => c.equipmentTypeId === typeId);
    const ge = await addGymEquipment({
      gymId,
      equipmentTypeId: typeId,
      customName: cand && cand.displayName !== type?.name ? cand.displayName : undefined,
      brand: res && res.brandConfidence !== "unknown" ? res.brand ?? undefined : undefined,
      model: res?.modelText ?? undefined,
      photoId,
    });
    if (outcome?.logId) await db().recognitionLogs.update(outcome.logId, { photoId });
    setExisting(ge);
    return ge;
  }

  async function confirmAll(addToWorkout: boolean) {
    setBusy(true);
    try {
      const ge = await ensureMachine();
      if (outcome?.ok && outcome.logId) {
        const top = outcome.result.candidates[0]?.equipmentTypeId;
        await confirmRecognition(outcome.logId, ge.equipmentTypeId, addToWorkout ? exerciseId : null, top !== ge.equipmentTypeId);
      }
      if (!addToWorkout || !exerciseId) {
        toast("器械卡片已保存", "success");
        router.push(`/equipment?id=${ge.id}`);
        return;
      }
      const target = sessionParam ? await db().sessions.get(sessionParam) : undefined;
      const s = target ?? (await startSession({ gymId }));
      await addExerciseToSession(s.id, exerciseId, ge.id);
      router.push(s.status === "completed" ? `/workout?id=${s.id}` : "/workout");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function goCustom() {
    const ge = await ensureMachine();
    router.push(`/exercise?new=1&eq=${ge.equipmentTypeId}&ge=${ge.id}${type?.category === "cardio" ? "&kind=cardio" : ""}${sessionParam ? `&session=${sessionParam}` : "&then=workout"}`);
  }

  return (
    <div className="pt-safe">
      <div className="flex items-center justify-between py-3">
        <button className="text-accent text-[15px]" onClick={() => (step === "capture" ? router.back() : step === "exercise" ? setStep(outcome?.ok ? "equipment" : "manual") : setStep("capture"))}>
          ‹ {step === "capture" ? "返回" : "上一步"}
        </button>
        <div className="font-semibold">{step === "exercise" ? "选择动作" : "添加器械"}</div>
        <Link href="/" className="text-muted text-sm">
          关闭
        </Link>
      </div>

      {preview && step !== "capture" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="拍摄的器械" className="w-full max-h-64 object-cover rounded-3xl mb-3" />
      )}

      {step === "capture" && (
        <div className="space-y-3 mt-4">
          <div className="text-center px-6 mb-6">
            <div className="text-5xl mb-2">📷</div>
            <div className="text-lg font-semibold">拍一张器械照片</div>
            <p className="text-sm text-muted mt-1">尽量拍到整台器械、滑轮/把手和铭牌。避免拍到其他人。照片只保存在你的手机，识别时会压缩后发送给 AI。</p>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="camera-input" />
          <input ref={libRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="library-input" />
          <Button variant="primary" size="lg" block onClick={() => camRef.current?.click()}>
            拍照
          </Button>
          <Button size="lg" block onClick={() => libRef.current?.click()}>
            从相册选择
          </Button>
          <Button size="lg" variant="ghost" block onClick={() => setStep("manual")}>
            手动搜索 / 创建器械
          </Button>
        </div>
      )}

      {step === "processing" && (
        <Card className="text-center py-8">
          <div className="text-3xl animate-bounce">🔍</div>
          <div className="font-medium mt-2">AI 正在识别器械…</div>
          <p className="text-xs text-muted mt-1">只识别器械本体，不会根据配重片推断你的训练重量</p>
          <Button
            className="mt-4"
            onClick={() => {
              cancelled.current = true;
              setStep("manual");
            }}
          >
            不等了，手动选择
          </Button>
        </Card>
      )}

      {step === "equipment" && outcome?.ok && (
        <div className="space-y-3">
          <Card>
            <div className="text-sm text-muted">识别结果{outcome.fromCache ? "（来自缓存，未重复调用 AI）" : ""}</div>
            {outcome.result.uncertaintyNote && <div className="mt-1 text-sm">{outcome.result.uncertaintyNote}</div>}
            <div className="mt-3 space-y-2" role="radiogroup">
              {outcome.result.candidates.map((c, i) => {
                const known = c.equipmentTypeId !== "unknown";
                const t = facts.equipmentTypes.find((x) => x.id === c.equipmentTypeId);
                const pct = Math.round(c.confidence * 100);
                return (
                  <button
                    key={i}
                    role="radio"
                    aria-checked={typeId === c.equipmentTypeId}
                    disabled={!known}
                    onClick={() => {
                      setTypeId(c.equipmentTypeId);
                      setExisting(null);
                    }}
                    className={cx("w-full text-left rounded-2xl border p-3", typeId === c.equipmentTypeId && known ? "border-accent bg-accent-soft" : "border-line")}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{c.displayName}</span>
                      <span className={cx("text-xs num", pct >= 70 ? "text-ready" : pct >= 40 ? "text-gradual" : "text-recovering")}>{pct}%</span>
                    </div>
                    <div className="text-xs text-muted">
                      {known ? t?.name : "目录中没有对应类型，可手动选择或新建"}
                      {pct < 60 && known && " · 不确定，请确认"}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-muted mt-3 space-y-0.5">
              {outcome.result.brand && (
                <div>
                  品牌：{outcome.result.brand}（{outcome.result.brandConfidence === "confirmed" ? "可见标识" : outcome.result.brandConfidence === "likely" ? "可能" : "不确定"}）
                </div>
              )}
              {outcome.result.isMultifunctional && <div>这是一台多功能器械，可以做很多不同动作。</div>}
              {outcome.result.attachments.length > 0 && <div>可见附件：{outcome.result.attachments.join("、")}</div>}
              {outcome.result.peoplePresent && <div>照片中可能有其他人：照片只保存在本机，你也可以在器械卡片中删除照片。</div>}
            </div>
            <button className="mt-3 text-sm text-accent" onClick={() => setStep("manual")}>
              都不对？手动选择器械
            </button>
          </Card>

          {type && sameTypeInGym.length > 0 && (
            <Card>
              <div className="text-sm font-medium mb-2">当前健身房已有同类器械卡片</div>
              <div className="flex flex-wrap gap-1.5">
                {sameTypeInGym.map((g) => (
                  <Chip key={g.id} active={existing?.id === g.id} onClick={() => setExisting(existing?.id === g.id ? null : g)}>
                    使用「{equipmentName(facts, g)}」
                  </Chip>
                ))}
                <Chip active={!existing} onClick={() => setExisting(null)}>
                  登记为新器械
                </Chip>
              </div>
            </Card>
          )}

          <Button variant="primary" size="lg" block disabled={!type} onClick={() => setStep("exercise")}>
            确认器械，选择动作
          </Button>
          <Button block disabled={!type || busy} onClick={() => confirmAll(false)}>
            只保存器械卡片
          </Button>
        </div>
      )}

      {step === "manual" && (
        <ManualEquipment
          error={outcome && !outcome.ok ? outcome.message : null}
          onRetry={img ? () => onFile(img.blob as File) : undefined}
          onPick={(t, preselect) => {
            setTypeId(t.id);
            setExisting(null);
            const exs = exercisesForEquipmentType(facts, t.id);
            // Cardio machines usually have exactly one "exercise" (the machine itself) — preselect it.
            const own = exs.filter((e) => e.kind === "cardio" && e.equipmentTypes[0] === t.id);
            setExerciseId(preselect ?? (t.category === "cardio" ? (exs.length === 1 ? exs[0].id : own[0]?.id ?? null) : null));
            setStep("exercise");
          }}
        />
      )}

      {step === "exercise" && type && (
        <div>
          <div className="text-sm text-muted">{outcome?.ok ? "识别到" : "器械"}：{existing ? equipmentName(facts, existing) : type.name}</div>
          <h2 className="text-xl font-semibold mt-0.5 mb-3">你这次做的是哪个动作？</h2>
          {orderedEx.length ? (
            <ExerciseList items={orderedEx} selected={exerciseId} onPick={setExerciseId} hint={hint} />
          ) : (
            <p className="text-sm text-muted">这个器械还没有关联动作。可以直接保存器械，或创建一个动作。</p>
          )}
          <Button variant="ghost" block className="mt-2" onClick={goCustom}>
            都不是 / 自定义动作
          </Button>
          <div className="sticky bottom-0 pt-3 pb-safe bg-bg space-y-2">
            <Button variant="primary" size="lg" block disabled={!exerciseId || busy} onClick={() => confirmAll(true)} data-testid="start-logging">
              {exerciseId ? "开始记录" : "选择一个动作后开始记录"}
            </Button>
            <Button block disabled={busy} onClick={() => confirmAll(false)} data-testid="save-equipment-only">
              只保存器械，先不记录
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualEquipment({ error, onRetry, onPick }: { error: string | null; onRetry?: () => void; onPick: (t: EquipmentType, preselect?: string) => void }) {
  return (
    <div className="space-y-3">
      {error && (
        <Card className="!bg-attention/10 border-attention/30">
          <div className="text-sm">{error}</div>
          <div className="text-xs text-muted mt-1">不影响记录：可以手动选择器械，已输入的训练也不会丢失。</div>
          <div className="flex gap-2 mt-2">
            {onRetry && (
              <Button size="sm" onClick={onRetry}>
                重试识别
              </Button>
            )}
            <Link href="/me#ai" className="h-9 px-3 text-sm rounded-xl inline-flex items-center text-accent">
              去测试 AI 连接 ›
            </Link>
          </div>
        </Card>
      )}
      <TypePicker onPick={onPick} />
    </div>
  );
}
