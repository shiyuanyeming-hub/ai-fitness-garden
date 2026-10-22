"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAppReady } from "@/features/app-data";
import { Button, Card, Chip, Field, PageHeader, SectionTitle, Segmented, TextInput, confirmAsync, cx, useToast } from "@/components/ui";
import { REGIONS } from "@/core/muscles";
import type { ExperienceLevel, RegionPriority, UserProfile } from "@/core/types";
import { deleteAllPhotos, deleteGym, getMeta, saveGym, setMeta, updateProfile } from "@/data/repo";
import { backupFileName, exportBackup, importBackup } from "@/data/backup";
import { recognitionStatus, testAiConnection, type AiStatus, type AiTestResult } from "@/features/recognition/client";
import { db } from "@/data/db";
import { diffDays } from "@/core/time";
import { searchExercises } from "@/features/catalog";

export function MeScreen() {
  return (
    <div>
      <PageHeader title="我的" />
      <ProfileCard />
      <GoalCard />
      <GymsCard />
      <PlanCard />
      <PreferencesCard />
      <BackupCard />
      <AiCard />
      <SectionTitle>关于</SectionTitle>
      <Card className="!p-0 divide-y divide-line">
        <Link href="/about" className="flex justify-between p-4">
          <span>训练推荐与恢复估计是怎么算的</span>
          <span className="text-faint">›</span>
        </Link>
        <Link href="/exercise" className="flex justify-between p-4">
          <span>动作库 / 自定义动作</span>
          <span className="text-faint">›</span>
        </Link>
        <Link href="/equipment" className="flex justify-between p-4">
          <span>器械库</span>
          <span className="text-faint">›</span>
        </Link>
      </Card>
      <p className="text-[11px] text-faint text-center mt-6">AI Fitness Garden · 数据只保存在本机 · 恢复估计不是医学诊断</p>
    </div>
  );
}

function useProfileField<K extends keyof UserProfile>(k: K) {
  const { facts } = useAppReady();
  return [facts.profile[k], (v: UserProfile[K]) => updateProfile({ [k]: v } as Partial<UserProfile>)] as const;
}

function NumField({ label, value, onSave, unit, min, max, step = "1" }: { label: string; value: number | null; onSave: (v: number | null) => void; unit?: string; min: number; max: number; step?: string }) {
  const toast = useToast();
  const [s, setS] = useState(value == null ? "" : String(value));
  useEffect(() => setS(value == null ? "" : String(value)), [value]);
  return (
    <Field label={`${label}${unit ? `（${unit}）` : ""}`}>
      <TextInput
        inputMode="decimal"
        value={s}
        step={step}
        onChange={(e) => setS(e.target.value)}
        onBlur={() => {
          const n = s.trim() === "" ? null : Number(s.replace(",", "."));
          if (n != null && (!Number.isFinite(n) || n < min || n > max)) {
            toast(`${label}应在 ${min}–${max} 之间`, "error");
            setS(value == null ? "" : String(value));
            return;
          }
          if (n !== value) onSave(n);
        }}
      />
    </Field>
  );
}

function ProfileCard() {
  const { facts } = useAppReady();
  const p = facts.profile;
  const [exp, setExp] = useProfileField("experience");
  return (
    <>
      <SectionTitle>个人资料</SectionTitle>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <NumField label="身高" unit="cm" value={p.heightCm} min={100} max={250} onSave={(v) => updateProfile({ heightCm: v })} />
          <NumField label="体重" unit="kg" value={p.weightKg} min={20} max={300} onSave={(v) => updateProfile({ weightKg: v })} />
        </div>
        <div>
          <div className="text-[13px] text-muted mb-1.5">训练经验</div>
          <Segmented<ExperienceLevel>
            value={exp}
            onChange={setExp}
            options={[
              { value: "beginner", label: "初级" },
              { value: "intermediate", label: "中级" },
              { value: "advanced", label: "高级" },
            ]}
          />
        </div>
        <Field label="伤痛或动作限制" hint="会显示在推荐页提示中；具体不想做的动作请在下方「排除动作」中选择">
          <textarea
            className="w-full min-h-20 rounded-xl bg-surface-2 border border-line p-3"
            defaultValue={p.limitations}
            onBlur={(e) => e.target.value !== p.limitations && updateProfile({ limitations: e.target.value })}
            placeholder="例如：右肩做过顶推举时不适"
          />
        </Field>
        <Field label="时区">
          <select className="w-full h-11 rounded-xl bg-surface-2 border border-line px-3" value={p.timeZone} onChange={(e) => updateProfile({ timeZone: e.target.value })}>
            {["Asia/Tokyo", "Asia/Shanghai", "Asia/Seoul", "Asia/Singapore", "Europe/London", "America/Los_Angeles", "America/New_York"].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </Field>
      </Card>
    </>
  );
}

function GoalCard() {
  const { facts, derived } = useAppReady();
  const toast = useToast();
  const p = facts.profile;
  const [goalText, setGoalText] = useState("");
  const [exq, setExq] = useState("");
  const setPriority = (r: string, v: RegionPriority) => updateProfile({ regionPriority: { ...p.regionPriority, [r]: v } });
  const exResults = exq ? searchExercises(facts.exercises, exq, "all").slice(0, 8) : [];
  return (
    <>
      <SectionTitle>训练目标</SectionTitle>
      <Card className="space-y-4">
        <div>
          <div className="text-[13px] text-muted mb-1.5">目标</div>
          <div className="flex flex-wrap gap-1.5">
            {p.goals.map((g) => (
              <button key={g} className="h-8 px-3 rounded-full bg-accent-soft text-accent text-sm" onClick={() => updateProfile({ goals: p.goals.filter((x) => x !== g) })}>
                {g} ✕
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <TextInput placeholder="添加目标" value={goalText} onChange={(e) => setGoalText(e.target.value)} />
            <Button
              onClick={() => {
                if (!goalText.trim()) return;
                updateProfile({ goals: [...p.goals, goalText.trim()] });
                setGoalText("");
              }}
            >
              添加
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始日期">
            <TextInput type="date" value={p.goalStartDate} onChange={(e) => e.target.value && updateProfile({ goalStartDate: e.target.value })} />
          </Field>
          <Field label="目标日期" hint={`约 ${Math.round(diffDays(p.goalTargetDate, p.goalStartDate) / 7)} 周`}>
            <TextInput
              type="date"
              value={p.goalTargetDate}
              min={p.goalStartDate}
              onChange={(e) => {
                if (!e.target.value) return;
                if (e.target.value <= p.goalStartDate) return toast("目标日期应晚于开始日期", "error");
                updateProfile({ goalTargetDate: e.target.value });
              }}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="每周训练" unit="天" value={p.weeklyTrainingDays} min={1} max={7} onSave={(v) => v && updateProfile({ weeklyTrainingDays: Math.round(v) })} />
          <NumField label="每次时长" unit="分钟" value={p.sessionMinutes} min={20} max={180} onSave={(v) => v && updateProfile({ sessionMinutes: Math.round(v) })} />
        </div>
        <div>
          <div className="text-[13px] text-muted mb-1.5">部位优先级</div>
          <div className="space-y-1.5">
            {REGIONS.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="w-16 text-sm">{r.name}</span>
                <Segmented<RegionPriority>
                  size="sm"
                  className="flex-1"
                  value={p.regionPriority[r.id]}
                  onChange={(v) => setPriority(r.id, v)}
                  options={[
                    { value: "focus", label: "重点" },
                    { value: "maintain", label: "维持" },
                    { value: "skip", label: "暂不优先" },
                  ]}
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[13px] text-muted mb-1.5">不希望训练的动作（不会被推荐）</div>
          <div className="flex flex-wrap gap-1.5">
            {p.excludedExerciseIds.map((id) => (
              <button key={id} className="h-8 px-3 rounded-full bg-attention/10 text-attention text-sm" onClick={() => updateProfile({ excludedExerciseIds: p.excludedExerciseIds.filter((x) => x !== id) })}>
                {derived.exerciseById[id]?.name ?? id} ✕
              </button>
            ))}
          </div>
          <TextInput className="mt-2" placeholder="搜索要排除的动作" value={exq} onChange={(e) => setExq(e.target.value)} />
          {exResults.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {exResults.map((e) => (
                <Chip
                  key={e.id}
                  onClick={() => {
                    if (!p.excludedExerciseIds.includes(e.id)) updateProfile({ excludedExerciseIds: [...p.excludedExerciseIds, e.id] });
                    setExq("");
                  }}
                >
                  ＋ {e.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

function GymsCard() {
  const { facts } = useAppReady();
  const toast = useToast();
  const [name, setName] = useState("");
  return (
    <>
      <SectionTitle>健身房</SectionTitle>
      <Card className="!p-0 divide-y divide-line">
        {facts.gyms.map((g) => {
          const current = g.id === facts.profile.currentGymId;
          const n = facts.gymEquipment.filter((x) => x.gymId === g.id).length;
          return (
            <div key={g.id} className="p-3 flex items-center gap-2">
              <button className={cx("size-5 rounded-full border-2 shrink-0", current ? "border-accent bg-accent" : "border-line")} onClick={() => updateProfile({ currentGymId: g.id })} aria-label={`切换到 ${g.name}`} />
              <input
                className="flex-1 bg-transparent font-medium min-w-0"
                defaultValue={g.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== g.name && saveGym({ id: g.id, name: e.target.value })}
                aria-label="健身房名称"
              />
              <span className="text-xs text-muted">{n} 台器械</span>
              <button
                className="text-xs text-attention ml-1"
                onClick={async () => {
                  if (!confirmAsync(`删除「${g.name}」及其器械清单？训练记录会保留。`)) return;
                  try {
                    await deleteGym(g.id);
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                }}
              >
                删除
              </button>
            </div>
          );
        })}
        <div className="p-3 flex gap-2">
          <TextInput placeholder="新健身房名称，例如 Gym B" value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            onClick={async () => {
              try {
                const g = await saveGym({ name });
                setName("");
                await updateProfile({ currentGymId: g.id });
                toast(`已添加并切换到「${g.name}」`, "success");
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            添加
          </Button>
        </div>
      </Card>
    </>
  );
}

function PlanCard() {
  const { derived } = useAppReady();
  const plan = derived.plan;
  return (
    <>
      <SectionTitle>训练计划（{plan.totalWeeks} 周）</SectionTitle>
      <Card className="space-y-3">
        <div className="text-sm text-muted">
          每周 {plan.weeklySessions} 次 · 每次约 {plan.sessionMinutes} 分钟 · {plan.startDate} → {plan.endDate}
        </div>
        {plan.phases.map((ph) => {
          const active = derived.today >= ph.startDate && derived.today <= ph.endDate;
          return (
            <div key={ph.index} className={cx("rounded-2xl p-3", active ? "bg-accent-soft" : "bg-surface-2")}>
              <div className="flex justify-between">
                <span className="font-medium">
                  {ph.name}
                  {active && <span className="ml-1 text-xs text-accent">当前</span>}
                </span>
                <span className="text-xs text-muted">
                  {ph.startDate.slice(5)} – {ph.endDate.slice(5)} · {ph.weeks}周
                </span>
              </div>
              <div className="text-xs text-muted mt-1">{ph.focus}</div>
              <div className="text-xs mt-1">{ph.rirGuide}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs">
                {REGIONS.filter((r) => ph.weeklyTargets[r.id][1] > 0).map((r) => (
                  <span key={r.id}>
                    {r.name} <span className="num">{ph.weeklyTargets[r.id][0]}–{ph.weeklyTargets[r.id][1]}</span>组/周
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        <ul className="text-xs text-muted list-disc pl-5 space-y-0.5">
          {plan.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function PreferencesCard() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {
      /* ignore */
    }
  }, []);
  const apply = (t: "system" | "light" | "dark") => {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {
      /* ignore */
    }
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  return (
    <>
      <SectionTitle>显示</SectionTitle>
      <Card>
        <Segmented
          value={theme}
          onChange={apply}
          options={[
            { value: "system", label: "跟随系统" },
            { value: "light", label: "浅色" },
            { value: "dark", label: "深色" },
          ]}
        />
        <p className="text-xs text-faint mt-2">系统开启「减少动态效果」时，动画会自动简化。</p>
      </Card>
    </>
  );
}

function BackupCard() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const last = useLiveQuery(() => getMeta<string>("lastBackupAt"), []);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`)).catch(() => undefined);
  }, []);
  const download = async (photos: boolean) => {
    const data = await exportBackup(photos);
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("备份文件已生成，请保存到「文件」或云盘", "success");
  };
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null;
  return (
    <>
      <SectionTitle>数据备份</SectionTitle>
      <Card className="space-y-3">
        <div className={cx("text-sm", days == null || days > 14 ? "text-gradual" : "text-muted")}>
          {last ? `上次备份：${days === 0 ? "今天" : `${days} 天前`}` : "还没有备份过。数据只在这台手机上，建议定期导出。"}
        </div>
        <div className="text-xs text-muted">
          存储：{persisted ? "已申请持久保存" : "浏览器可能在空间不足时清理"}
          {usage && ` · 已用 ${usage}`}
        </div>
        <LocalDataInfo />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={() => download(false)}>
            导出 JSON
          </Button>
          <Button onClick={() => download(true)}>导出（含照片）</Button>
        </div>
        <div className="pt-2 border-t border-line">
          <div className="text-[13px] text-muted mb-1.5">从备份恢复</div>
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "merge", label: "合并（按更新时间）" },
              { value: "replace", label: "完全替换" },
            ]}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (mode === "replace" && !confirmAsync("完全替换会删除本机现有的所有数据，确定？")) return;
              try {
                const r = await importBackup(JSON.parse(await f.text()), mode);
                toast(`导入完成：新增 ${r.inserted}，更新 ${r.updated}，跳过 ${r.skipped}${r.photos ? `，照片 ${r.photos}` : ""}`, "success");
              } catch (err) {
                toast((err as Error).message || "导入失败", "error");
              }
            }}
          />
          <Button block className="mt-2" onClick={() => fileRef.current?.click()}>
            选择备份文件…
          </Button>
          <p className="text-[11px] text-faint mt-1.5">合并导入按记录 ID 去重，同一个备份重复导入不会重复计算训练量。</p>
        </div>
      </Card>
    </>
  );
}

function AiCard() {
  const toast = useToast();
  const [status, setStatus] = useState<AiStatus | null | undefined>(undefined);
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<AiTestResult | null>(null);
  const photoCount = useLiveQuery(() => db().photos.count(), []);
  const logCount = useLiveQuery(() => db().recognitionLogs.count(), []);
  useEffect(() => {
    getMeta<string>("appToken").then((t) => setToken(t ?? ""));
    recognitionStatus().then(setStatus);
  }, []);
  // Save on every keystroke (debounced) — relying on blur lost edits when the app was backgrounded.
  useEffect(() => {
    const id = setTimeout(async () => {
      const cur = (await getMeta<string>("appToken")) ?? "";
      const next = token.normalize("NFKC").trim();
      if (cur === next) return;
      await setMeta("appToken", next);
      setTest(null);
      setStatus(await recognitionStatus());
    }, 400);
    return () => clearTimeout(id);
  }, [token]);
  const runTest = async () => {
    setTesting(true);
    setTest(null);
    await setMeta("appToken", token.normalize("NFKC").trim());
    const r = await testAiConnection();
    setTest(r);
    setStatus(await recognitionStatus());
    setTesting(false);
    if (r.ok) toast("AI 连接正常");
  };
  const normalized = token.normalize("NFKC").trim();
  return (
    <>
      <div id="ai" className="scroll-mt-4" />
      <SectionTitle>AI 设置</SectionTitle>
      <Card className="space-y-3">
        <div className="text-sm" data-testid="ai-status">
          {status === undefined
            ? "检查中…"
            : status === null
              ? "无法连接服务器（离线或未部署）。手动登记器械不受影响。"
              : !status.configured
                ? "⚠️ 服务器未配置 ANTHROPIC_API_KEY。请在 Vercel 环境变量中添加，见 DEPLOY.md。"
                : status.token === "missing"
                  ? `⚠️ 已配置（${status.model}），但这台设备还没填访问口令`
                  : status.token === "mismatch" || (status.requiresToken && !status.tokenOk)
                    ? `⚠️ 已配置（${status.model}），但访问口令和服务器不一致`
                    : `✅ 已配置（${status.model}）${status.requiresToken ? " · 口令正确" : ""}`}
        </div>
        <Field
          label="访问口令（和 Vercel 里的 APP_ACCESS_TOKEN 一致）"
          hint={normalized ? `已保存在本机 · ${normalized.length} 个字符 · 区分大小写` : "只保存在本机，用于防止他人调用你的 AI 接口"}
        >
          <div className="flex gap-2">
            <TextInput
              // Plain text field with masking: type="password" made iOS offer to autofill or replace it with a saved password.
              type="text"
              name="app-access-token"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              data-testid="app-token"
              style={show ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={() => setShow((v) => !v)}>
              {show ? "隐藏" : "显示"}
            </Button>
          </div>
        </Field>
        <Button block onClick={runTest} disabled={testing} data-testid="ai-test">
          {testing ? "正在测试…" : "测试 AI 连接"}
        </Button>
        {test && (
          <div className={cx("rounded-xl p-3 text-sm space-y-1", test.ok ? "bg-accent/10" : "bg-attention/10")} data-testid="ai-test-result">
            {test.steps.map((s) => (
              <div key={s.id}>
                {s.ok ? "✅" : "❌"} {s.message}
              </div>
            ))}
            {test.ok && <div className="text-xs text-muted pt-1">拍照识别和 AI 每日建议都可以正常使用。</div>}
          </div>
        )}
        <div className="text-xs text-muted space-y-1">
          <p>· API Key 只在服务器端使用，不会出现在浏览器里。</p>
          <p>· 照片先在手机上压缩（约 1024px、去除定位等 EXIF 信息），识别时发送给 AI，服务器不保存图片。</p>
          <p>· 同一张照片会使用本地缓存，不重复调用 AI。</p>
          <p>· 照片中如有其他人，AI 被要求忽略且不描述他们；你可以随时删除照片。</p>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-line">
          <span className="text-sm text-muted">
            本机照片 {photoCount ?? 0} 张 · 识别记录 {logCount ?? 0} 条
          </span>
          <Button
            size="sm"
            variant="danger"
            onClick={async () => {
              if (!confirmAsync("删除所有器械照片和识别记录？器械卡片和训练记录会保留。")) return;
              await deleteAllPhotos();
              toast("已删除");
            }}
          >
            全部删除
          </Button>
        </div>
      </Card>
    </>
  );
}

/** Shows which storage this screen is reading — home-screen app, Safari tab and each URL keep separate data. */
function LocalDataInfo() {
  const counts = useLiveQuery(async () => {
    const d = db();
    const [sessions, sets, equipment] = await Promise.all([
      d.sessions.where("status").equals("completed").count(),
      d.sets.filter((x) => x.completedAt != null).count(),
      d.gymEquipment.count(),
    ]);
    return { sessions, sets, equipment };
  }, []);
  const [where, setWhere] = useState("");
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    setWhere(`${location.host} · ${standalone ? "主屏幕 App" : "浏览器标签页"}`);
  }, []);
  return (
    <div className="text-xs text-muted rounded-xl bg-surface-2 p-2.5" data-testid="local-data-info">
      <div>当前数据来源：{where}</div>
      <div>
        本机已有：训练 {counts?.sessions ?? "…"} 次 · 已完成组 {counts?.sets ?? "…"} 组 · 器械 {counts?.equipment ?? "…"} 台
      </div>
      <div className="text-faint mt-0.5">主屏幕 App、Safari 标签页、不同网址的数据各自独立，互相看不到。</div>
    </div>
  );
}
